import assert from 'node:assert/strict';
import {catalog,shuffleRecipe} from './dist/catalog.js';
import {normalizeRecipe} from './dist/formulas.js';
import {numeric,parseDecimal,zoomLog} from './dist/math.js';
import {preciseRecipe} from './dist/precise-formulas.js';
import {studioPerturbation} from './dist/studio-perturbation.js';

const julia=(formula,options={})=>({formula,julia:true,re:0,im:0,...options});
const powers=normalizeRecipe({steps:[julia('z2'),julia('z3',{repeat:2})]});
const folds=normalizeRecipe({steps:[julia('ship'),julia('tricorn',{repeat:2}),julia('celtic')]});
const mixed=normalizeRecipe({steps:[julia('sine',{re:.12,im:.62}),julia('exp',{re:-1.5,im:.35})]});
const width=80,height=24;
function makeView(recipe,cx,cy,depth){
  const digits=depth+40;
  return {recipe,type:'studio',digits,jr:-.745,ji:.186,
    cx:parseDecimal(cx,digits).toString(),cy:parseDecimal(cy,digits).toString(),
    span:parseDecimal('1e-'+depth,digits).toString()};
}
function coordinateGrid(view){
  const {digits}=view;
  const precision=Math.ceil((zoomLog(view)+Math.log10(width)+32)*Math.log2(10));
  const unit=1n<<BigInt(precision),decimal=10n**BigInt(digits),denom=BigInt(2*width),span=BigInt(view.span);
  const coord=(center,offset)=>(BigInt(center)*denom+span*BigInt(offset))*unit/(denom*decimal);
  const point=(x,y)=>[coord(view.cx,2*x-width),coord(view.cy,2*y-height)];
  return {point,precision,pixelScale:numeric(span,digits)/width};
}
function compare(actual,expected,max,context){
  assert.equal(actual===max,expected===max,context);
  assert(Math.abs(actual-expected)<=1.1e-6,context+' '+actual+' versus '+expected);
}
function check(recipe,cx,cy,depth,max,expectDetail=false){
  const grid=coordinateGrid(makeView(recipe,cx,cy,depth));
  const evaluate=preciseRecipe(recipe,max,grid.precision);
  let fallbacks=0,total=0;
  const sample=studioPerturbation({...grid,recipe,max,evaluate,exact:(x,y)=>{
    fallbacks++;
    return evaluate(...grid.point(x,y));
  }});
  const colors=new Set();
  for(const x of [-3.5,8.5,21.5,33.5,39.5,40.5,53.5,63.5,64.5,70.5,80.5]){
    for(const y of [1.5,11.5,12.5,21.5]){
      const value=sample(x,y);
      compare(value,evaluate(...grid.point(x,y)),max,recipe.steps.map(s=>s.formula).join('/')+' at '+depth);
      colors.add(Math.round(value*1e4));total++;
    }
  }
  if(expectDetail){
    assert(colors.size>=5,'The boundary must retain visible detail');
    assert(fallbacks<total/2,'Most samples should use the reference orbit');
  }
}
check(powers,'1','0',18,200,true);
check(powers,'1','0',40,200,true);
check(powers,'1','0',100,400,true);
check(folds,'1','0',18,200,true);
check(normalizeRecipe({steps:[{formula:'ship'}]}),'-2','0',18,200,true);
check(mixed,'-1.5','.3',18,120);
check(normalizeRecipe({steps:[{formula:'sine'}]}),'1.4193410609676191','-1.2',11,200);
check(catalog.nova.recipe,'-.1391776081709623','.42500000000000004',11,200);
check(catalog.magnet.recipe,'1.308593788665743','-.8333333333333334',11,200);
check(catalog.cubic.recipe,'-.05709794595435288','-.3588888888888889',11,200,true);
check(catalog.driftPhoenix.recipe,'.21412351227185467','-.9500000000000001',11,200);

// Exercise a post-squaring fold whose exact real part is too small to
// reconstruct by subtracting two rounded Float64 squares.
const nearDiagonal='0.'+'9'.repeat(78);
check(normalizeRecipe({steps:[julia('celtic'),julia('buffalo',{repeat:2})]}),'1',nearDiagonal,78,300);

for(const preset of Object.values(catalog)){
  const x=Number(preset.cx)+.29*Number(preset.span),y=Number(preset.cy)-.21*Number(preset.span);
  check(preset.recipe,x,y,18,80);
}
let seed=38590;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
for(let i=0;i<6;i++){
  const shuffled=shuffleRecipe(powers,random);
  check(shuffled,2*random()-1,2*random()-1,18,120);
}

// Pan uses an offset grid. Verify both a full render and the exposed strips
// across a reference tile boundary, including the worker's lane stride.
const view=makeView(powers,'1','0',40);
const {point,precision}=coordinateGrid(view);
const max=200,evaluate=preciseRecipe(view.recipe,max,precision);
let frames=[];
globalThis.self={};
globalThis.postMessage=message=>frames.push(message);
await import('./dist/worker.js');
const dx=-69,grid={cx:view.cx,cy:view.cy,x:dx,y:0};
const data={id:1,state:view,width,height,iterations:max,grid,lane:1,lanes:3};
function render(request){
  frames=[];
  self.onmessage({data:request});
  const frame=frames.at(-1);
  assert(frame.done&&!frame.error,frame.error);
  return frame.values;
}
const full=render(data);
const strips=render({...data,pan:{dx,dy:0}});
assert.equal(strips.length,full.length/width*(-dx));
let index=0;
for(let y=data.lane;y<height;y+=data.lanes){
  for(let x=0;x<width;x++){
    const expected=evaluate(...point(x+.5+grid.x,y+.5));
    const fullIndex=(y-data.lane)/data.lanes*width+x;
    compare(full[fullIndex],expected,max,'Full worker render');
    if(x<-dx)compare(strips[index++],expected,max,'Exposed pan strip');
  }
}
assert.equal(index,strips.length);
console.log('Studio perturbation preserves detailed boundaries, preset and shuffled recipes, and deep pan sampling.');
