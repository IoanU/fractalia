import assert from 'node:assert/strict';
// Exercise actual app event handlers without browser automation or rendering.
const elements=new Map();
function element(){return{style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){}},textContent:'',innerHTML:'',hidden:false,value:'',getContext(){return{}},setAttribute(){},getBoundingClientRect(){return{left:0,top:0,width:800,height:600}},addEventListener(type,fn){this.handlers??={};this.handlers[type]=fn},setPointerCapture(){},focus(){}};}
globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element,querySelector:element,querySelectorAll(){return[]},addEventListener:element().addEventListener};
globalThis.localStorage={getItem(){return null}};globalThis.location={hash:''};globalThis.ResizeObserver=class{observe(){}};globalThis.setTimeout=()=>0;globalThis.clearTimeout=()=>{};
await import('./dist/app.js');
const canvas=elements.get('fractalCanvas'),zoom=elements.get('zoomReadout'),center=elements.get('coordReadout'),initial=zoom.textContent,initialCenter=center.textContent;
let prevented=false;canvas.handlers.wheel({deltaY:-700,ctrlKey:false,preventDefault(){prevented=true}});assert.equal(prevented,false);assert.equal(zoom.textContent,initial);
canvas.handlers.wheel({deltaY:-700,ctrlKey:true,preventDefault(){prevented=true}});assert(prevented);assert.equal(zoom.textContent,initial);
for(const type of ['gesturestart','gesturechange','gestureend']){prevented=false;canvas.handlers[type]({preventDefault(){prevented=true}});assert(prevented);assert.equal(zoom.textContent,initial);}
const event=(id,x,y)=>({pointerId:id,button:0,clientX:x,clientY:y,shiftKey:false,preventDefault(){}});
canvas.handlers.pointerdown(event(1,200,150));canvas.handlers.pointerdown(event(2,400,350));canvas.handlers.pointermove(event(2,700,550));canvas.handlers.pointerup(event(2,700,550));canvas.handlers.pointermove(event(1,100,100));canvas.handlers.pointerup(event(1,100,100));assert.equal(zoom.textContent,initial);assert.equal(center.textContent,initialCenter);
canvas.handlers.pointerdown(event(3,200,150));canvas.handlers.pointermove(event(3,600,450));canvas.handlers.pointerup(event(3,600,450));assert.equal(zoom.textContent,'550×');elements.get('undoSnip').onclick();assert.equal(zoom.textContent,initial);assert.equal(center.textContent,initialCenter);
assert.equal(elements.get('viewName').textContent,'Seahorse Valley');console.log('App input checks passed: wheel, ctrl-wheel, Safari gestures and two-pointer movement do not zoom; rectangle zoom and undo work.');
function press(key,options={}){
  prevented=false;
  document.handlers.keydown({key,preventDefault(){prevented=true},...options});
  return prevented;
}
const shell=elements.get('canvasShell'),modal=document.getElementById('modal');
assert(press('h',{target:elements.get('aboutBtn')}));
assert.equal(shell.dataset.tool,'pan');
assert(press('v'));
assert.equal(shell.dataset.tool,'select');
canvas.handlers.pointerdown(event(4,200,150));
canvas.handlers.pointermove(event(4,600,450));
assert(press('Escape'));
canvas.handlers.pointerup(event(4,600,450));
assert.equal(zoom.textContent,initial);
assert(!press('ArrowRight',{target:{closest(){return this}}}));
assert.equal(center.textContent,initialCenter);
modal.open=true;
assert(!press('+'));
modal.open=false;
assert(!press('+',{ctrlKey:true}));
assert.equal(zoom.textContent,initial);
assert(press('+'));
assert.equal(zoom.textContent,'550×');
assert(press('-'));
assert.equal(zoom.textContent,initial);
assert(press('ArrowRight'));
assert.notEqual(center.textContent,initialCenter);
const reset=elements.get('resetBtn');
reset.click=()=>reset.onclick();
assert(press('Home'));
assert.equal(elements.get('viewName').textContent,'The Mandelbrot set');
console.log('Explorer shortcuts work outside the canvas and respect modal, form and browser keyboard input.');
