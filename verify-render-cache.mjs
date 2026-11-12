import assert from 'node:assert/strict';
import {RenderCache,renderKey,rasterPlan,framePlacement} from './dist/render-cache.js';
const plan=rasterPlan({width:1000,height:600,screenWidth:1600,screenHeight:900,dpr:1.5});
assert.equal(plan.width,2400);assert(plan.height>=Math.ceil(2400*900/(1600-244)));
for(const [width,height] of [[1000,600],[1356,816],[1600,816]]){const p=framePlacement(plan,width,height);assert(Math.abs(p.dw/p.sw-p.dh/p.sh)<1e-10);assert.equal(p.sy+p.sh/2,plan.height/2);assert.equal(p.sx,0);}
const small=new RenderCache({maxEntries:2,maxBytes:1000});const a={width:10,height:10},b={width:10,height:10},c={width:10,height:10};small.set('a',a);small.set('b',b);small.get('a');small.set('c',c);assert(!small.get('b'));assert.equal(b.width,0);assert.equal(small.bytes,800);
let rect={left:0,top:0,width:1000,height:600},nextTimer=0,resize,workers=[];
const jobs=new Map(),elements=new Map(),documentHandlers={};
let lastPixels,lastDraw,drawCalls=[];
const context=()=>({drawImage(...args){lastDraw=args;drawCalls.push(args);},fillRect(){},putImageData(image){lastPixels=image.pixels;}});
function element(){return{style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){}},textContent:'',innerHTML:'',hidden:false,value:'',width:0,height:0,getContext:context,setAttribute(){},getBoundingClientRect(){return rect},addEventListener(type,fn){this.handlers??={};this.handlers[type]=fn},setPointerCapture(){},focus(){}};}
const swatches=['aurora','ember','ocean','moss','mono'].map(palette=>Object.assign(element(),{dataset:{palette}}));
globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element,querySelector:element,querySelectorAll(selector){return selector==='[data-palette]'?swatches:[]},addEventListener(type,fn){documentHandlers[type]=fn}};
globalThis.localStorage={getItem(){return null}};globalThis.location={hash:''};globalThis.window={devicePixelRatio:1.5,screen:{width:1600,height:900}};
globalThis.ResizeObserver=class{constructor(fn){resize=fn}observe(){}};
globalThis.ImageData=class{constructor(pixels,width,height){Object.assign(this,{pixels,width,height})}};
globalThis.setTimeout=(fn)=>{const id=++nextTimer;jobs.set(id,fn);return id};globalThis.clearTimeout=id=>jobs.delete(id);
globalThis.Worker=class{constructor(){workers.push(this)}postMessage(request){this.request=request}terminate(){this.terminated=true}};
function flush(){while(jobs.size){const pending=[...jobs];jobs.clear();for(const[,fn]of pending)fn();}}
function finish(w=workers.at(-1)){w.onmessage({data:{id:w.request.id,width:2,height:2,values:new Float64Array([3.25,28.6,70.1,w.request.iterations]),step:1,done:true}});}
await import('./dist/app.js');flush();assert.equal(workers.length,1);assert.equal(workers[0].request.width,2400);assert.equal(workers[0].request.height,plan.height);
// Fullscreen while a high-resolution render is still running must keep it alive.
rect={...rect,width:1356,height:816};documentHandlers.fullscreenchange();resize();flush();assert.equal(workers.length,1);assert(!workers[0].terminated);finish();
for(let i=0;i<3;i++){rect={...rect,width:1000,height:600};documentHandlers.fullscreenchange();resize();flush();rect={...rect,width:1356,height:816};documentHandlers.fullscreenchange();resize();flush();}assert.equal(workers.length,1);
// New pixels require work; returning to a cached view does not.
elements.get('zoomIn').onclick();flush();assert.equal(workers.length,2);finish();elements.get('zoomOut').onclick();flush();assert.equal(workers.length,2);assert.equal(elements.get('fractalCanvas').dataset.renderSource,'cache');
const originalPixels=lastPixels.slice();elements.get('colorShift').oninput({target:{value:'42'}});flush();assert.equal(workers.length,2);assert.notDeepEqual(lastPixels,originalPixels);const shiftedPixels=lastPixels.slice();swatches[2].onclick();flush();assert.equal(workers.length,2);assert.notDeepEqual(lastPixels,shiftedPixels);assert.equal(elements.get('fractalCanvas').dataset.colorKey,'ocean:42');
// Color changes during an in-flight render must not cancel or replace it.
elements.get('iterations').oninput({target:{value:'1500'}});flush();assert.equal(workers.length,3);const running=workers.at(-1);swatches[1].onclick();elements.get('colorShift').oninput({target:{value:'123'}});flush();assert.equal(workers.length,3);assert(!running.terminated);assert.equal(workers.at(-1).request.iterations,1500);finish();
assert.equal(renderKey(workers[0].request.state,700),renderKey({...workers[0].request.state,palette:'ocean',shift:150},700));assert.equal(elements.get('fractalCanvas').dataset.colorKey,'ember:123');
// A terminated older worker cannot replace the current completed image.
const source=elements.get('fractalCanvas').dataset.renderSource;finish(workers[0]);assert.equal(elements.get('fractalCanvas').dataset.renderSource,source);
console.log('Cache checks passed: native fullscreen raster, proportional center crop, memory/LRU eviction, in-flight fullscreen, repeated enter/exit (1 worker), cached zoom return, recolor without iteration, in-flight color changes, math invalidation and stale-worker isolation.');

// Pan on a small raster so the entire field can be supplied to the app.
rect={left:0,top:0,width:12,height:8};
window.devicePixelRatio=1;window.screen={width:12,height:8};
elements.get('zoomIn').onclick();flush();
function finishField(worker,width,height,count){
  const values=Float64Array.from({length:count},(_,i)=>i+.25);
  worker.onmessage({data:{id:worker.request.id,width,height,values,step:1,done:true}});
}
finishField(workers.at(-1),12,8,96);
const canvas=elements.get('fractalCanvas');
const event=(x,y)=>({pointerId:1,button:0,clientX:x,clientY:y,shiftKey:true,preventDefault(){}});
canvas.handlers.pointerdown(event(1,4));
canvas.handlers.pointermove(event(4,2));
assert.deepEqual(lastDraw.slice(1),[3,-2,12,8]);
canvas.handlers.pointerup(event(4,2));
flush();
const panWorker=workers.at(-1);
assert.deepEqual(panWorker.request.pan,{dx:-3,dy:2});
finishField(panWorker,12,8,42);
assert.equal(canvas.dataset.renderSource,'pan');
assert.equal(lastPixels.length,12*2*4);
swatches[2].onclick();flush();
assert.equal(workers.at(-1),panWorker);
assert.equal(lastPixels.length,12*8*4);
elements.get('navigationMode').onchange({target:{checked:true}});
drawCalls=[];
canvas.handlers.pointerdown(event(1,4));
canvas.handlers.pointermove(event(3,5));
// A downsampled proxy fills both exposed edges before painting the sharp overlap.
const [sharp,left,top,width,height]=lastDraw;
assert(Math.abs(left-2)<1e-7&&Math.abs(top-1)<1e-7);
assert.deepEqual([width,height],[12,8]);
const soft=drawCalls.filter(call=>call.length===9&&call[0]!==sharp);
assert(soft.some(([, , , , ,x,y,w,h])=>x===0&&y===0&&Math.abs(w-2)<1e-7&&Math.abs(h-1)<1e-7));
assert.equal(workers.at(-1),panWorker);
canvas.handlers.pointerup(event(3,5));
flush();
const dragWorker=workers.at(-1);
assert.deepEqual(dragWorker.request.pan,{dx:-2,dy:-1});
finishField(dragWorker,12,8,26);
assert.equal(canvas.dataset.renderSource,'pan');
canvas.handlers.pointerdown(event(1,4));
drawCalls=[];
canvas.handlers.pointermove(event(16,4));
assert.notEqual(lastDraw[0],sharp);
assert.deepEqual(lastDraw.slice(1),[0,0,12,8]);
canvas.handlers.pointerup(event(16,4));
flush();
assert.notEqual(workers.at(-1),dragWorker);
assert.equal(workers.at(-1).request.pan,undefined);
console.log('Pan preserves sharp overlap, previews exposed areas, computes only exposed strips when possible, and falls back when there is no overlap.');

// Resize between scheduling and starting a viewport render, before the
// ResizeObserver callback has had a chance to run.
elements.clear();jobs.clear();workers=[];
rect={left:0,top:0,width:80,height:60};
location.hash='#view='+btoa(JSON.stringify({
  digits:40,cx:'0',cy:'0',span:'10000000000000000000000000000',type:'studio',
  palette:'aurora',jr:0,ji:0,shift:0,iterations:200,auto:false,name:'Viewport test',
  recipe:{steps:[{formula:'z3'}]}
}));
await import('./dist/app.js?viewport-test');
rect={...rect,width:60};
flush();
assert.deepEqual(workers.map(worker=>worker.request.width),[60]);
const deepWorker=workers[0];
for(const [step,progress] of [[12,40],[4,80]]){
  deepWorker.onmessage({data:{id:deepWorker.request.id,width:1,height:1,values:new Float64Array([5]),step,done:false,deep:true,progress}});
  assert.equal(elements.get('progress').style.width,progress+'%');
}
finishField(deepWorker,60,60,3600);
assert.equal(elements.get('progress').style.width,'0');
resize();flush();
assert.equal(workers.length,1);
rect={...rect,width:80};resize();flush();
assert.deepEqual(workers.map(worker=>worker.request.width),[60,80]);
finishField(workers[1],80,60,4800);
rect={...rect,width:60};resize();flush();
assert.equal(workers.length,2);
assert.equal(elements.get('fractalCanvas').dataset.renderSource,'cache');
console.log('Viewport cache uses the actual render size, and both deep preview passes advance progress.');
