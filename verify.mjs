import assert from 'node:assert/strict';
import {colorize} from './dist/colorize.js';
import {parseDecimal,decimal,numeric,zoomLog,ensurePrecision,escapeFloat} from './dist/math.js';
import {mergePanField} from './dist/render-cache.js';
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
