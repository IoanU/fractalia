import assert from 'node:assert/strict';
import {colorize} from './dist/colorize.js';
import {parseDecimal,decimal,numeric,zoomLog,ensurePrecision,escapeFloat} from './dist/math.js';
import {firstLaneRow,mergePanField,panStrips,renderKey} from './dist/render-cache.js';
import {catalog,shuffleRecipe,studioHome} from './dist/catalog.js';
import {compileRecipe,normalizeRecipe} from './dist/formulas.js';
import {compileBoundedRecipe} from './dist/orbit-bounds.js';
import {preciseRecipe} from './dist/precise-formulas.js';
assert.equal(parseDecimal('-7.45e-3',40),-745n*10n**35n);
assert.equal(decimal(parseDecimal('-0.7453',40),40),'-0.7453000000000000000000000000000000000000');
assert.equal(numeric(parseDecimal('1e-350',380),380),0);
assert.equal(escapeFloat(0,0,500,'mandelbrot',0,0),500);
assert.equal(escapeFloat(-1,0,500,'mandelbrot',0,0),500);
assert(escapeFloat(2,2,500,'mandelbrot',0,0)<10);
let s={digits:40,cx:parseDecimal('-.743643887037151',40).toString(),cy:parseDecimal('.13182590420533',40).toString(),span:parseDecimal('.012',40).toString()};
for(let i=0;i<1600;i++){ensurePrecision(s);s.span=(BigInt(s.span)/2n).toString();ensurePrecision(s);}
assert(BigInt(s.span)>0n);assert(s.digits>480);assert(zoomLog(s)>480);
let frames=[];globalThis.self={};globalThis.postMessage=m=>frames.push(m);await import('./dist/worker.js');
function draw(state,w,h,iterations,options={}){
  frames=[];
  self.onmessage({data:{state,id:1,width:w,height:h,iterations,...options}});
  assert(!frames.some(f=>f.error),JSON.stringify(frames));
  const final=frames.at(-1);
  assert.equal(final.done,true);
  if(!options.pan)assert.equal(final.values.length,w*h);
  final.pixels=colorize(final.values,iterations,state.palette,state.shift);
  return final;
}
let base={digits:40,cx:parseDecimal('-.7453',40).toString(),cy:parseDecimal('.1127',40).toString(),span:parseDecimal('.012',40).toString(),type:'mandelbrot',palette:'aurora',jr:-.745,ji:.186,shift:0};
for(const type of ['mandelbrot','julia','ship']){let f=draw({...base,type},48,32,400);assert(f.pixels.some((v,i)=>i%4!==3&&v>30));console.log(type,'render:',f.elapsed+'ms');}
const deep={...base,cx:parseDecimal('-.743643887037151',40).toString(),cy:parseDecimal('.13182590420533',40).toString(),span:parseDecimal('1e-13',40).toString()};const f=draw(deep,48,32,1600);console.log('Deep perturbation:',f.elapsed+'ms', 'colors:',new Set(Array.from(f.pixels).filter((_,i)=>i%4!==3)).size);assert(f.deep);
assert.deepEqual(frames.map(({step,progress})=>[step,progress]),[[12,40],[4,80],[1,100]]);
// In this Seahorse Valley view, the center reference escapes well before
// some of its neighbors. Compare rebased results with an independent orbit.
const shortReference={...base,cx:'-7459970575525463772388823521527281039114',
  cy:'1126366768180595533983230736864235418252',span:'62043645609757019159186579610'};
const deeperReference={...base,digits:60,
  cx:'-747032094202587443822971336083886877794229834742896176162330',
  cy:'113894371336960151016799574691571031479274908978747355342317',
  span:'10342377305044022284708879964387532949341'};
for(const [view,detail] of [[shortReference,2300],[deeperReference,3000]]){
  const sampleWidth=12,sampleHeight=8;
  const rebased=draw(view,sampleWidth,sampleHeight,detail).values;
  const unit=10n**BigInt(view.digits),span=BigInt(view.span);
  for(let row=0;row<sampleHeight;row++)for(let column=0;column<sampleWidth;column++){
    const cx=BigInt(view.cx)+span*BigInt(2*column+1-sampleWidth)/(2n*BigInt(sampleWidth));
    const cy=BigInt(view.cy)+span*BigInt(2*row+1-sampleHeight)/(2n*BigInt(sampleWidth));
    let x=0n,y=0n,expected=detail;
    for(let n=0;n<detail;n++){
      const next=(x*x-y*y)/unit+cx;
      y=2n*x*y/unit+cy;x=next;
      const magnitude=x*x+y*y;
      if(magnitude>256n*unit*unit){
        expected=n+1-Math.log2(Math.log2(numeric(magnitude,2*view.digits))/2);
        break;
      }
    }
    const actual=rebased[row*sampleWidth+column];
    assert.equal(actual===detail,expected===detail);
    assert(Math.abs(actual-expected)<.01,`pixel ${column},${row}: ${actual} versus ${expected}`);
  }
}
const extreme={...base,digits:390,cx:parseDecimal('0',390).toString(),cy:parseDecimal('0',390).toString(),span:parseDecimal('1e-350',390).toString()};const e=draw(extreme,6,4,100);assert(e.deep);console.log('Arbitrary precision beyond floating-point range:',e.elapsed+'ms');console.log('All math and worker checks passed.');

for(const state of [base,{...base,type:'julia'},{...base,type:'ship'},deep,extreme]){
  const width=24,height=18,iterations=120;
  const previous=draw(state,width,height,iterations).values;
  assert.equal(previous.length,width*height);
  for(const [dx,dy] of [[4,0],[-4,0],[0,3],[0,-3],[4,-3],[-4,3]]){
    const grid={cx:state.cx,cy:state.cy,x:dx,y:dy};
    const expected=draw(state,width,height,iterations,{grid}).values;
    const exposed=draw(state,width,height,iterations,{grid,pan:{dx,dy}}).values;
    assert.equal(frames.length,1);
    assert.equal(exposed.length,width*height-(width-Math.abs(dx))*(height-Math.abs(dy)));
    assert.deepEqual(mergePanField(previous,width,height,dx,dy,exposed),expected);
  }
}
console.log('Pan samples match a full render on the same grid in every tested direction and precision mode.');

for(const preset of Object.values(catalog)){
  const digits=40;
  const state={...base,...preset,digits};
  for(const key of ['cx','cy','span'])state[key]=parseDecimal(preset[key],digits).toString();
  const field=draw(state,70,45,96).values;
  assert(field.every(Number.isFinite),preset.name);
  assert(new Set(field).size>4,preset.name);
  const deepState={...state,span:parseDecimal('1e-32',digits).toString()};
  const precise=draw(deepState,4,3,64);
  assert(precise.deep,preset.name);
  assert(precise.values.every(Number.isFinite),preset.name);
}

// Check the high-precision operators against the existing formulas away from boundaries.
for(const preset of Object.values(catalog)){
  const approx=compileRecipe(preset.recipe,80),exact=preciseRecipe(preset.recipe,80,224);
  const x=Number(preset.cx)+Number(preset.span)*.483,y=Number(preset.cy)+Number(preset.span)*.173;
  const encode=value=>(parseDecimal(value,30)<<224n)/10n**30n;
  assert(Math.abs(approx(x,y)-exact(encode(x),encode(y)))<1e-5,preset.name);
}

// The Julia unit circle has a known boundary: radii above one escape, radii below one do not.
const precisionBoundary={
  ...base,type:'studio',digits:390,cx:parseDecimal('1',390).toString(),cy:'0',
  span:parseDecimal('1e-350',390).toString(),
  recipe:{steps:[{formula:'z2',julia:true,re:0,im:0},{formula:'z2',julia:true,re:0,im:0}]}
};
const boundary=draw(precisionBoundary,6,2,1400).values;
assert(boundary.slice(0,3).every(value=>value===1400));
assert(boundary.slice(3,6).every(value=>value<1400));

const parallelState={...base,type:'studio',recipe:catalog.driftFractaloid.recipe};
const reference=draw(parallelState,25,19,96).values,assembled=new Float64Array(reference.length);
for(let lane=0;lane<4;lane++){
  frames=[];
  self.onmessage({data:{id:1,state:parallelState,width:25,height:19,iterations:96,lane,lanes:4}});
  const part=frames.at(-1);
  assert(part.done&&!part.error);
  for(let y=lane,offset=0;y<19;y+=4,offset+=25)assembled.set(part.values.subarray(offset,offset+25),y*25);
}
assert.deepEqual(assembled,reference);

const panWidth=25,panHeight=19,dx=-4,dy=3,lanes=4;
const strips=panStrips(panWidth,panHeight,dx,dy);
const grid={cx:parallelState.cx,cy:parallelState.cy,x:dx,y:dy};
const request={state:parallelState,width:panWidth,height:panHeight,id:1,iterations:96,grid,pan:{dx,dy}};
frames=[];self.onmessage({data:request});
const expectedStrips=frames.at(-1).values,joined=new Float64Array(expectedStrips.length);
for(let lane=0;lane<lanes;lane++){
  frames=[];self.onmessage({data:{...request,lane,lanes}});
  const values=frames.at(-1).values;
  let source=0,destination=0;
  for(const {y,width,height} of strips){
    for(let row=firstLaneRow(y,lane,lanes);row<y+height;row+=lanes){
      joined.set(values.subarray(source,source+width),destination+(row-y)*width);
      source+=width;
    }
    destination+=width*height;
  }
  assert.equal(source,values.length);
}
assert.deepEqual(joined,expectedStrips);

const confirmedGroups=new Set();
for(const preset of Object.values(catalog)){
  const iterations=60,precision=224,radius=1e-12;
  const bounded=compileBoundedRecipe(preset.recipe,iterations);
  const exact=preciseRecipe(preset.recipe,iterations,precision);
  const encode=value=>(parseDecimal(value,30)<<BigInt(precision))/10n**30n;
  for(const xRatio of [-.47,-.19,.07,.33,.46])for(const yRatio of [-.24,.03,.21]){
    const x=Number(preset.cx)+xRatio*Number(preset.span),y=Number(preset.cy)+yRatio*Number(preset.span);
    const shared=bounded(x,y,radius);
    if(!Number.isFinite(shared))continue;
    confirmedGroups.add(preset.group);
    for(const [dx,dy] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]]){
      const expected=exact(encode(x+dx),encode(y+dy));
      assert.equal(shared===iterations,expected===iterations,preset.name);
      assert(Math.abs(shared-expected)<1.1e-6,`${preset.name} at ${x},${y}: ${shared} versus ${expected}`);
    }
  }
}
assert.equal(confirmedGroups.size,7);
console.log('Shared tile values agree with independently evaluated samples across all preset groups.');

const sinePrecision=320;
const preciseSine=preciseRecipe(catalog.sine.recipe,200,sinePrecision);
const sineUnit=1n<<BigInt(sinePrecision),pixelRadius=1e-40;
const sineX=5n*sineUnit/4n,sineY=7n*sineUnit/4n;
const sineValue=preciseSine.region(sineX,sineY,pixelRadius);
assert(Number.isFinite(sineValue));
const sineOffset=sineUnit/10n**40n;
for(const [x,y] of [[sineX,sineY],[sineX+sineOffset,sineY],[sineX,sineY-sineOffset]]){
  assert(Math.abs(sineValue-preciseSine(x,y))<1e-6);
}

// Setting the Newton target to zero gives z' = 2z/3. Its angle must
// survive even when the two components would underflow as doubles.
const tinyUnit=1n<<1300n,tiny=tinyUnit/10n**350n;
const newton=preciseRecipe({steps:[{formula:'newton',julia:true,re:-1,im:0}]},200,1300);
for(const [x,y] of [[1n,3n],[3n,1n],[-1n,3n],[1n,-3n]]){
  const expected=3+(Math.round(Math.atan2(Number(y),Number(x))*3/(2*Math.PI))+1)*14;
  assert.equal(newton(x*tiny,y*tiny),expected);
}

const denseSine={
  ...base,type:'studio',recipe:catalog.sine.recipe,
  cx:'-14629047136155863387145292720075941908767',
  cy:'978470577004347941229999072157737762887',
  span:'125382043270366600914690503379'
};
const analyticWidth=20,analyticHeight=14,analyticIterations=200;
for(const view of [denseSine,{...denseSine,recipe:catalog.exponential.recipe,
  cx:parseDecimal('2.8',40).toString(),cy:parseDecimal('.35',40).toString()}]){
  const fast=draw(view,analyticWidth,analyticHeight,analyticIterations).values;
  const precision=Math.ceil((zoomLog(view)+Math.log10(analyticWidth)+32)*Math.log2(10));
  const fixed=1n<<BigInt(precision),decimal=10n**BigInt(view.digits),span=BigInt(view.span);
  const denominator=2n*BigInt(analyticWidth);
  const exact=preciseRecipe(view.recipe,analyticIterations,precision);
  const coord=(center,offset)=>(BigInt(center)*denominator+span*BigInt(offset))*fixed/(decimal*denominator);
  for(let y=0;y<analyticHeight;y++)for(let x=0;x<analyticWidth;x++){
    const expected=exact(coord(view.cx,2*x+1-analyticWidth),coord(view.cy,2*y+1-analyticHeight));
    const actual=fast[y*analyticWidth+x];
    assert.equal(actual===analyticIterations,expected===analyticIterations);
    assert(Math.abs(actual-expected)<1e-3);
  }
  if(view===denseSine)assert(new Set(fast).size>50,'Dense Sine Julia must retain its detail');
}

const hybrid=catalog.driftFractaloid.recipe;
const roundTrip=normalizeRecipe(JSON.parse(JSON.stringify(hybrid)));
assert.deepEqual(roundTrip,hybrid);
const variants=[
  hybrid,
  {...hybrid,steps:hybrid.steps.toReversed()},
  {...hybrid,steps:hybrid.steps.map(step=>({...step,drift:false}))},
  {...hybrid,steps:hybrid.steps.map(step=>({...step,julia:false}))}
];
const fields=variants.map(recipe=>{
  const sample=compileRecipe(recipe,96);
  return Array.from({length:64},(_,i)=>sample((i%8-4)/5,(Math.floor(i/8)-4)/5));
});
assert.equal(new Set(fields.map(field=>JSON.stringify(field))).size,variants.length);
const keys=variants.map(recipe=>renderKey({...base,type:'studio',recipe},96));
assert.equal(new Set(keys).size,variants.length);
console.log('Studio presets produce varied fields; step order, Julia and Drift change both the field and cache key.');

let shuffleSeed=8127;
const random=()=>{
  shuffleSeed=(Math.imul(shuffleSeed,1664525)+1013904223)>>>0;
  return shuffleSeed/2**32;
};
const shuffledRecipes=new Set();
for(let i=0;i<32;i++){
  const recipe=shuffleRecipe(hybrid,random),home=studioHome(recipe);
  const sample=compileRecipe(recipe,200),tones=new Set();
  let bounded=0;
  for(let y=0;y<23;y++)for(let x=0;x<31;x++){
    const value=sample(Number(home.cx)+(x-15)*Number(home.span)/31,Number(home.cy)+(y-11)*Number(home.span)/31);
    if(value>=200)bounded++;
    else tones.add(Math.floor(value));
  }
  assert(bounded>0&&bounded<650&&tones.size>=8,'Shuffle must produce visible structure at the overview framing');
  shuffledRecipes.add(JSON.stringify(recipe));
}
assert(shuffledRecipes.size>=16,'Shuffle must produce a variety of recipes');
console.log('Shuffle produces varied recipes with visible detail in the overview.');
