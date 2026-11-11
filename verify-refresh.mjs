import assert from 'node:assert/strict';
const storage=new Map();let elements,navType='navigate',rejectHistory=false,writes=0;
const deep={digits:40,cx:'-9649491251074321279550023534517761284299',cy:'-343753023853369361991815056177367536182',span:'8595716622191563536046830280',type:'julia',palette:'ocean',jr:-.745,ji:.186,shift:0,iterations:2000,auto:false,name:'Grădina Juliei'};
function address(view){return 'https://fractalia.test/#view='+btoa(unescape(encodeURIComponent(JSON.stringify(view))));}
function encodedView(){return JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(6)))));}
function element(){return{style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){}},textContent:'',innerHTML:'',hidden:false,value:'',getContext(){return{}},setAttribute(){},getBoundingClientRect(){return{left:0,top:0,width:800,height:600}},addEventListener(type,fn){this.handlers??={};this.handlers[type]=fn},setPointerCapture(){},focus(){}};}
function navigate(url){globalThis.location=new URL(url);}
async function boot(){elements=new Map();globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element,querySelector:element,querySelectorAll(){return[]},addEventListener:element().addEventListener};await import('./dist/app.js?boot='+Math.random());}
globalThis.localStorage={getItem(){return null}};
globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
globalThis.performance={getEntriesByType:()=>[{type:navType}]};
globalThis.history={state:{hostState:'preserve'},replaceState(data,title,url){if(rejectHistory)throw new Error('Browser history rate limit');assert.deepEqual(data,{hostState:'preserve'});navigate(url.href);writes++;}};
globalThis.ResizeObserver=class{observe(){}};globalThis.setTimeout=()=>0;globalThis.clearTimeout=()=>{};
navigate(address(deep));await boot();assert.equal(elements.get('zoomReadout').textContent,'10^12.6×');
for(let i=0;i<25;i++)elements.get('zoomOut').onclick();
const zoomAfter=elements.get('zoomReadout').textContent,viewAfter=encodedView();assert(!zoomAfter.includes('12.6'));assert(BigInt(viewAfter.span)>BigInt(deep.span));assert.equal(viewAfter.cx,deep.cx);assert.equal(viewAfter.cy,deep.cy);
navType='reload';await boot();assert.equal(elements.get('zoomReadout').textContent,zoomAfter);assert.deepEqual(encodedView(),viewAfter);
// Pan and settings must survive the same URL-based reload too.
document.handlers.keydown({key:'ArrowRight',preventDefault(){}});elements.get('colorShift').oninput({target:{value:'123'}});const panned=encodedView();assert.notEqual(panned.cx,deep.cx);assert.equal(panned.shift,123);await boot();assert.deepEqual(encodedView(),panned);
// An immediate refresh must retain the newest state even if replaceState fails.
rejectHistory=true;elements.get('zoomOut').onclick();const fallbackZoom=elements.get('zoomReadout').textContent;await boot();assert.equal(elements.get('zoomReadout').textContent,fallbackZoom);
// A deliberately opened shared link takes precedence over a previous session.
rejectHistory=false;navType='navigate';navigate(address(deep));await boot();assert.equal(elements.get('zoomReadout').textContent,'10^12.6×');assert.deepEqual(encodedView(),deep);assert(writes>25);
console.log('Refresh regression passed: 10^12.6 -> 25 zoom-outs -> immediate reload, exact coordinates, pan/settings, URL failure fallback, fresh shared links and host history state.');
