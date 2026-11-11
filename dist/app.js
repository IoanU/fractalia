import{parseDecimal,decimal,numeric,zoomLog,ensurePrecision,escapeFloat,colorAt}from'./math.js';
import{selectionBounds,selectedView}from'./selection.js';
import{RenderCache,renderKey,rasterPlan,framePlacement}from'./render-cache.js';
import{colorize}from'./colorize.js';
const $=id=>document.getElementById(id),canvas=$('fractalCanvas'),ctx=canvas.getContext('2d',{alpha:false}),scratch=document.createElement('canvas'),sctx=scratch.getContext('2d');
const presets={seahorse:{name:'Seahorse Valley',type:'mandelbrot',cx:'-.7453',cy:'.1127',span:'.012',palette:'aurora'},julia:{name:'Julia’s Garden',type:'julia',cx:'0',cy:'0',span:'3.3',palette:'ocean'},ship:{name:'Burning Shores',type:'ship',cx:'-1.755',cy:'-.032',span:'.085',palette:'ember'}};
let state,worker,timer,resizeTimer,renderId=0,rendering=false,toastTimer,pointers=new Map(),saved=[];
let interactionMode='select',selection=null,dragAction=null,snipHistory=[];
let lastPersistedView='';
const renderCache=new RenderCache();
let displayFrame=null,activeRenderKey='',renderCount=0;
let recolorQueued=false,recolorCount=0;
try{saved=JSON.parse(localStorage.getItem('fractalia.collection')||'[]');if(!Array.isArray(saved))saved=[];}catch{}
const legacyNames={'Valea căluților de mare':'Seahorse Valley','Grădina Juliei':'Julia’s Garden','Corăbii de foc':'Burning Shores','Creația ta Julia':'Your Julia creation','Universul Mandelbrot':'The Mandelbrot set','Coordonatele tale':'Your coordinates','O nouă perspectivă':'A new perspective'};
function viewName(name){return legacyNames[name]||name||'Untitled view';}
function createState(p){const digits=40;return{digits,cx:parseDecimal(p.cx,digits).toString(),cy:parseDecimal(p.cy,digits).toString(),span:parseDecimal(p.span,digits).toString(),type:p.type,palette:p.palette||'aurora',jr:-.745,ji:.186,shift:0,iterations:600,auto:true,name:p.name};}
function validateState(s){if(!s||!['mandelbrot','julia','ship'].includes(s.type)||!['aurora','ember','ocean','moss','mono'].includes(s.palette)||!Number.isInteger(s.digits)||s.digits<20||s.digits>100000)throw Error('Invalid view.');for(const k of ['cx','cy','span'])if(!/^-?\d+$/.test(s[k])||s[k].length>100010)throw Error('Invalid coordinates.');if(BigInt(s.span)<=0n)throw Error('Invalid scale.');if(!Number.isFinite(s.jr)||!Number.isFinite(s.ji)||!Number.isFinite(s.shift)||!Number.isFinite(s.iterations))throw Error('Invalid parameters.');s.iterations=Math.max(100,Math.min(3000,s.iterations));s.shift=Math.max(0,Math.min(360,s.shift));return ensurePrecision(s);}
function loadPreset(key){state=createState(presets[key]);sync();schedule();}
function formatZoom(){const n=zoomLog(state);return n<6?Math.max(1,10**n).toLocaleString('en-US',{maximumFractionDigits:n<1?1:0})+'×':'10^'+n.toFixed(1)+'×';}
function shortCoord(n){const v=numeric(n,state.digits);return(v>=0?'+':'')+v.toFixed(9).replace(/0+$/,'').replace(/\.$/,'');}
function sync(){
  $('fractal').value=state.type;$('juliaControls').hidden=state.type!=='julia';$('formula').innerHTML=state.type==='ship'?'z<sub>n+1</sub> = (|Re z| + i|Im z|)² + c':'z<sub>n+1</sub> = z<sub>n</sub>² + c <span>ℂ</span>';
  $('iterations').value=state.iterations;$('iterValue').textContent=currentIterations().toLocaleString('en-US');$('autoDetail').checked=state.auto;$('colorShift').value=state.shift;$('shiftValue').textContent=state.shift+'°';$('juliaRe').value=state.jr;$('juliaIm').value=state.ji;$('jrValue').textContent=state.jr.toFixed(3);$('jiValue').textContent=state.ji.toFixed(3);
  $('viewName').textContent=viewName(state.name);$('familyBadge').textContent={mandelbrot:'MANDELBROT SET',julia:'JULIA SET',ship:'BURNING SHIP'}[state.type];$('zoomReadout').textContent=formatZoom();$('coordReadout').textContent=shortCoord(state.cx)+' / '+shortCoord(state.cy);$('coordsBtn').title='Edit exact center ('+state.digits+' decimal places)';$('precisionReadout').textContent=state.digits+' dp';
  const names={aurora:'Aurora',ember:'Ember',ocean:'Ocean',moss:'Moss',mono:'Silver'};$('paletteName').textContent=names[state.palette];document.querySelectorAll('[data-palette]').forEach(b=>{b.classList.toggle('active',b.dataset.palette===state.palette);b.setAttribute('aria-pressed',b.dataset.palette===state.palette);});$('savedCount').textContent=saved.length;document.querySelectorAll('input[type=range]').forEach(el=>el.style.setProperty('--fill',((Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min))*100)+'%'));document.querySelectorAll('[data-preset]').forEach(el=>el.classList.toggle('is-current',presets[el.dataset.preset].type===state.type));
}
function currentIterations(){return state.auto?Math.max(state.iterations,Math.min(20000,Math.round((600+Math.max(0,zoomLog(state)-2)*170)/100)*100)):state.iterations;}
function currentViewUrl(){const url=new URL(location.href);url.hash='view='+btoa(unescape(encodeURIComponent(JSON.stringify(state))));return url;}
function persistCurrentView(){
  const serialized=JSON.stringify(state);if(serialized===lastPersistedView)return;
  // Replace this entry instead of adding a browser-history entry on every move.
  try{const url=currentViewUrl();if(url.href!==location.href)history.replaceState(history.state,'',url);}catch{}
  // Keep a synchronous reload fallback if the browser rate-limits URL updates.
  try{sessionStorage.setItem('fractalia.currentView',JSON.stringify({address:location.href,view:state}));}catch{}
  lastPersistedView=serialized;
}
function paintFrame(){
  const rect=canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;
  const dpr=window.devicePixelRatio||1,w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  if(!displayFrame||!displayFrame.width)return;
  const p=framePlacement(displayFrame,w,h);ctx.fillStyle='#0a0d15';ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(displayFrame,p.sx,p.sy,p.sw,p.sh,p.dx,p.dy,p.dw,p.dh);
}
function applyFrameColors(frame){
  const colorKey=state.palette+':'+state.shift;if(!frame.field||frame.colorKey===colorKey)return;
  const pixels=colorize(frame.field,frame.iterations,state.palette,state.shift);
  scratch.width=frame.fieldWidth;scratch.height=frame.fieldHeight;sctx.putImageData(new ImageData(pixels,frame.fieldWidth,frame.fieldHeight),0,0);
  const frameContext=frame.getContext('2d',{alpha:false});frameContext.imageSmoothingEnabled=frame.step!==1;
  frameContext.drawImage(scratch,0,0,frame.width,frame.height);frame.colorKey=colorKey;
  canvas.dataset.recolorCount=String(++recolorCount);canvas.dataset.colorKey=colorKey;
}
function recolorCurrentFrame(){
  recolorQueued=false;const key=renderKey(state,currentIterations());
  if(!displayFrame||displayFrame.key!==key)return;
  applyFrameColors(displayFrame);paintFrame();
}
function recolorView(){
  persistCurrentView();sync();if(recolorQueued)return;recolorQueued=true;
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(recolorCurrentFrame);else setTimeout(recolorCurrentFrame,0);
}
function readyFrame(frame,source){
  applyFrameColors(frame);
  displayFrame=frame;rendering=false;canvas.dataset.renderSource=source;$('progress').style.width='0';
  $('renderStatus').innerHTML='<i></i><span class="sr-only">Ready</span>';paintFrame();
}
function stopRender(){clearTimeout(timer);timer=null;++renderId;if(worker){worker.terminate();worker=null;}}
function schedule(delay=60){
  persistCurrentView();sync();const key=renderKey(state,currentIterations()),cached=renderCache.get(key);
  if(cached){stopRender();activeRenderKey=key;readyFrame(cached,'cache');return;}
  if(activeRenderKey===key&&(worker||timer!==null&&timer!==undefined))return;
  stopRender();activeRenderKey=key;rendering=true;$('renderStatus').innerHTML='<i></i><span>Rendering</span>';$('progress').style.width='12%';
  timer=setTimeout(()=>{timer=null;render(key);},delay);
}
function render(key){
  const rect=canvas.getBoundingClientRect(),iterations=currentIterations(),snapshot={...state};
  const plan=rasterPlan({width:Math.max(1,rect.width),height:Math.max(1,rect.height),screenWidth:window.screen?.width,screenHeight:window.screen?.height,dpr:window.devicePixelRatio||1});
  const frame=document.createElement('canvas');frame.width=plan.width;frame.height=plan.height;frame.key=key;frame.iterations=iterations;
  const currentWorker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});worker=currentWorker;const id=++renderId;
  canvas.dataset.renderCount=String(++renderCount);canvas.dataset.renderWidth=String(plan.width);canvas.dataset.renderHeight=String(plan.height);canvas.dataset.renderSource='worker';
  const fail=message=>{if(id!==renderId)return;currentWorker.terminate();worker=null;activeRenderKey='';rendering=false;$('progress').style.width='0';$('renderStatus').innerHTML='<i></i> Render error';toast(message);};
  currentWorker.onmessage=({data:d})=>{
    if(id!==renderId||d.id!==id||activeRenderKey!==key)return;if(d.error){fail('Rendering failed. Try a lower detail level.');return;}
    frame.field=d.values;frame.fieldWidth=d.width;frame.fieldHeight=d.height;frame.step=d.step;frame.colorKey='';
    applyFrameColors(frame);displayFrame=frame;paintFrame();
    $('progress').style.width=d.done?'0':d.step<=2?'80%':'40%';
    if(d.done){renderCache.set(key,frame);currentWorker.terminate();worker=null;readyFrame(frame,'worker');}
  };
  currentWorker.onerror=()=>fail('The renderer could not start.');
  currentWorker.postMessage({id,state:snapshot,width:plan.width,height:plan.height,iterations});
}
function zoom(factor,x=.5,y=.5){
  cancelSelection();
  ensurePrecision(state);const old=BigInt(state.span),next=old*BigInt(Math.round(factor*1e8))/100000000n,rect=canvas.getBoundingClientRect();
  if(next<=0n){ensurePrecision(state);return;}
  const ox=BigInt(Math.round((x-.5)*1e9)),oy=BigInt(Math.round((y-.5)*rect.height/rect.width*1e9));state.cx=(BigInt(state.cx)+(old-next)*ox/1000000000n).toString();state.cy=(BigInt(state.cy)+(old-next)*oy/1000000000n).toString();state.span=next.toString();ensurePrecision(state);schedule(100);
}
function pan(dx,dy){if(selection)cancelSelection();const r=canvas.getBoundingClientRect(),span=BigInt(state.span);state.cx=(BigInt(state.cx)-span*BigInt(Math.round(dx/r.width*1e9))/1000000000n).toString();state.cy=(BigInt(state.cy)-span*BigInt(Math.round(dy/r.width*1e9))/1000000000n).toString();schedule(100);}
function cancelSelection(){selection=null;dragAction=null;$('selectionBox').hidden=true;$('canvasShell').classList.remove('is-selecting');}
function setInteractionMode(mode){cancelSelection();interactionMode=mode;$('canvasShell').dataset.tool=mode;for(const [id,value]of[['selectTool','select'],['panTool','pan']]){$(id).classList.toggle('tool-active',mode===value);$(id).setAttribute('aria-pressed',mode===value);}$('interactionHint').innerHTML=mode==='select'?'Draw a rectangle to zoom. Escape cancels selection.':'Drag to pan. Shift also enables pan.';}
function localPoint(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(r.width,e.clientX-r.left)),y:Math.max(0,Math.min(r.height,e.clientY-r.top))};}
function updateSelection(e){if(!selection)return;selection.end=localPoint(e);const r=canvas.getBoundingClientRect(),box=selectionBounds(selection.start,selection.end,r.width,r.height),el=$('selectionBox');el.hidden=box.width<2||box.height<2;Object.assign(el.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px'});const factor=Math.max(box.width/r.width,box.height/r.height);$('selectionLabel').textContent=factor>0?(1/factor).toLocaleString('en-US',{maximumFractionDigits:1})+'×':'';el.classList.toggle('compact',box.width<145||box.height<60);}
$('selectTool').onclick=()=>setInteractionMode('select');$('panTool').onclick=()=>setInteractionMode('pan');
$('undoSnip').onclick=()=>{if(!snipHistory.length)return;cancelSelection();state=snipHistory.pop();$('undoSnip').disabled=!snipHistory.length;schedule(0);};
// Normal scrolling stays native. Prevent browser pinch zoom over the canvas.
canvas.addEventListener('wheel',e=>{if(e.ctrlKey)e.preventDefault();},{passive:false});
for(const event of ['gesturestart','gesturechange','gestureend'])canvas.addEventListener(event,e=>e.preventDefault(),{passive:false});
canvas.addEventListener('dblclick',e=>{const r=canvas.getBoundingClientRect();zoom(.4,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);});
canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==1)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>1){cancelSelection();return;}canvas.focus({preventScroll:true});dragAction=interactionMode==='pan'||e.shiftKey||e.button===1?'pan':'select';if(dragAction==='select'){const point=localPoint(e);selection={start:point,end:point};$('canvasShell').classList.add('is-selecting');}});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const previous=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size!==1)return;if(dragAction==='select')updateSelection(e);else if(dragAction==='pan')pan(e.clientX-previous.x,e.clientY-previous.y);});
canvas.addEventListener('pointerup',e=>{if(!pointers.has(e.pointerId))return;let next=null;if(pointers.size===1&&selection&&dragAction==='select'){updateSelection(e);const r=canvas.getBoundingClientRect();next=selectedView(state,selectionBounds(selection.start,selection.end,r.width,r.height),r.width,r.height);}pointers.delete(e.pointerId);cancelSelection();if(next){snipHistory.push({...state});if(snipHistory.length>30)snipHistory.shift();state=next;$('undoSnip').disabled=false;schedule(0);}});
for(const event of ['pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);cancelSelection();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&selection){e.preventDefault();cancelSelection();}});
$('zoomIn').onclick=()=>zoom(.5);$('zoomOut').onclick=()=>zoom(2);$('resetBtn').onclick=()=>{const type=state.type;state=createState({type,cx:type==='mandelbrot'?'-.5':'0',cy:'0',span:type==='ship'?'4':'3.3',name:{mandelbrot:'The Mandelbrot set',julia:'Julia’s Garden',ship:'Burning Ship'}[type],palette:state.palette});state.name=type==='mandelbrot'?'The Mandelbrot set':state.name;sync();schedule();};
$('fractal').onchange=e=>{const k={mandelbrot:'seahorse',julia:'julia',ship:'ship'}[e.target.value];loadPreset(k);};
$('iterations').oninput=e=>{state.iterations=Number(e.target.value);state.auto=false;schedule(140);};$('autoDetail').onchange=e=>{state.auto=e.target.checked;schedule();};
for(const [id,key]of[['juliaRe','jr'],['juliaIm','ji']])$(id).oninput=e=>{state[key]=Number(e.target.value);state.name='Your Julia creation';schedule(120);};
$('colorShift').oninput=e=>{state.shift=Number(e.target.value);recolorView();};document.querySelectorAll('[data-palette]').forEach(b=>b.onclick=()=>{state.palette=b.dataset.palette;recolorView();});document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>loadPreset(b.dataset.preset));
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function openModal(title,body){$('modalTitle').textContent=title;$('modalBody').replaceChildren();if(typeof body==='string')$('modalBody').innerHTML=body;else $('modalBody').append(body);$('modal').showModal();}
$('closeModal').onclick=()=>$('modal').close();$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('modal').close();}});
$('aboutBtn').onclick=()=>openModal('Controls',`<div class="modal-copy"><dl class="help-grid"><dt>Zoom</dt><dd>Draw a rectangle. Release to apply.</dd><dt>Pan</dt><dd><kbd>H</kbd> or <kbd>Shift</kbd> + drag</dd><dt>Select</dt><dd><kbd>V</kbd></dd><dt>Cancel</dt><dd><kbd>Esc</kbd></dd><dt>Zoom + / −</dt><dd><kbd>+</kbd> <kbd>−</kbd> or double-click</dd><dt>Move</dt><dd>Arrow keys</dd><dt>Reset</dt><dd><kbd>Home</kbd></dd></dl><div class="help-note">Views save automatically in the URL. Library saves stay in this browser. PNG exports use the canvas resolution. Deep zoom increases precision automatically; speed and visible detail depend on the iteration count and your device.</div></div>`);
$('saveBtn').onclick=()=>{
  recolorCurrentFrame();
  if(rendering){toast('Wait for the render to finish before saving.');return;}
  if(saved.length>=30){toast('Your collection has 30 views. Remove one to make room.');return;}
  const thumb=document.createElement('canvas');thumb.width=180;thumb.height=100;thumb.getContext('2d').drawImage(canvas,0,0,180,100);const item={id:Date.now(),state:{...state},image:thumb.toDataURL('image/jpeg',.7),date:new Date().toLocaleDateString('en-US')};
  const next=[item,...saved];try{localStorage.setItem('fractalia.collection',JSON.stringify(next));saved=next;sync();toast('Saved.');}catch{toast('Browser storage is full or unavailable.');}
};
function showCollection(){const list=document.createElement('div');if(!saved.length){list.className='modal-copy';list.textContent='No saved views.';}saved.forEach(item=>{const row=document.createElement('div');row.className='collection-item';const img=document.createElement('img');img.src=item.image;img.alt='Saved view';const btn=document.createElement('button');btn.textContent=viewName(item.state.name);const small=document.createElement('small');small.textContent=item.date+' · '+item.state.type;btn.append(small);btn.onclick=()=>{try{state=validateState({...item.state});sync();schedule();$('modal').close();}catch{toast('This saved view is invalid.');}};const del=document.createElement('button');del.textContent='×';del.className='delete-save';del.setAttribute('aria-label','Remove saved view');del.onclick=()=>{const next=saved.filter(x=>x.id!==item.id);try{localStorage.setItem('fractalia.collection',JSON.stringify(next));saved=next;sync();$('modal').close();showCollection();}catch{toast('Could not update your collection.');}};row.append(img,btn,del);list.append(row);});openModal('Library',list);}
$('collectionBtn').onclick=showCollection;$('exploreTab').onclick=()=>{if($('modal').open)$('modal').close();canvas.focus({preventScroll:true});};document.querySelector('.brand').onclick=e=>{e.preventDefault();loadPreset('seahorse');};
$('shareBtn').onclick=async()=>{try{await navigator.clipboard.writeText(currentViewUrl().href);toast('Link copied.');}catch{toast('Could not copy the link. Check your browser clipboard permissions.');}};
$('fullscreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('workspace').requestFullscreen();}catch{toast('Full screen is unavailable in this browser.');}};
document.addEventListener('fullscreenchange',()=>{cancelSelection();paintFrame();});
$('exportBtn').onclick=()=>{if(rendering){toast('The image is rendering. Export when it is ready.');return;}recolorCurrentFrame();canvas.toBlob(blob=>{if(!blob)return;const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download='fractalia-'+state.type+'-'+new Date().toISOString().slice(0,10)+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('PNG exported.');},'image/png');};
$('coordsBtn').onclick=()=>{const f=document.createElement('form');f.className='coord-form';for(const [k,label]of[['cx','Real part (Re)'],['cy','Imaginary part (Im)'],['span','Viewport width in the complex plane']]){const l=document.createElement('label');l.textContent=label;const i=document.createElement('input');i.id='coord-'+k;l.htmlFor=i.id;i.name=k;i.required=true;i.value=decimal(state[k],state.digits).replace(/0+$/,'').replace(/\.$/,'');i.autocomplete='off';i.spellcheck=false;f.append(l,i);}const b=document.createElement('button');b.className='button';b.textContent='Apply';f.append(b);f.onsubmit=e=>{e.preventDefault();try{const data=new FormData(f);let needed=state.digits;for(const v of data.values()){const m=v.match(/e-(\d+)/i);if(m)needed=Math.max(needed,Number(m[1])+30);needed=Math.max(needed,(v.split('.')[1]||'').split(/[eE]/)[0].length+20);}if(needed>100000)throw Error('The requested precision exceeds the resources of this session.');const next={...state,digits:needed,name:'Your coordinates'};for(const k of ['cx','cy','span'])next[k]=parseDecimal(data.get(k),needed).toString();if(BigInt(next.span)<=0n)throw Error('Viewport width must be positive.');if(Math.abs(numeric(next.cx,needed))>100||Math.abs(numeric(next.cy,needed))>100||numeric(next.span,needed)>1000)throw Error('Choose coordinates between −100 and 100, and a viewport width up to 1000.');state=ensurePrecision(next);sync();schedule();$('modal').close();}catch(error){toast(error.message);}};openModal('Coordinates',f);};
canvas.addEventListener('keydown',e=>{let handled=true;switch(e.key){case'v':case'V':setInteractionMode('select');break;case'h':case'H':setInteractionMode('pan');break;case'+':case'=':zoom(.5);break;case'-':zoom(2);break;case'ArrowLeft':pan(70,0);break;case'ArrowRight':pan(-70,0);break;case'ArrowUp':pan(0,70);break;case'ArrowDown':pan(0,-70);break;case'Home':$('resetBtn').click();break;default:handled=false;}if(handled)e.preventDefault();});
new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(paintFrame,0);}).observe($('canvasShell'));
function thumbnails(){document.querySelectorAll('[data-thumb]').forEach(c=>{const p=presets[c.dataset.thumb],w=c.width,h=c.height,im=c.getContext('2d').createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=escapeFloat(Number(p.cx)+(x/w-.5)*Number(p.span),Number(p.cy)+(y-h/2)/w*Number(p.span),230,p.type,-.745,.186),rgb=colorAt(n,230,p.palette,0),i=(y*w+x)*4;im.data.set([...rgb,255],i);}c.getContext('2d').putImageData(im,0,0);});}
state=createState(presets.seahorse);let restored=false;
try{if(performance.getEntriesByType('navigation')[0]?.type==='reload'){const saved=JSON.parse(sessionStorage.getItem('fractalia.currentView')||'null');if(saved?.address===location.href){state=validateState(saved.view);restored=true;}}}catch{}
if(!restored&&location.hash.startsWith('#view=')){try{state=validateState(JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(6))))));}catch{toast('Invalid link. Opening Seahorse Valley.');}}
const narrow=typeof matchMedia==='function'&&matchMedia('(max-width:720px)').matches;
$('workspace').classList.toggle('controls-hidden',narrow);$('settingsBtn').setAttribute('aria-expanded',String(!narrow));
$('settingsBtn').onclick=()=>{const hidden=$('workspace').classList.toggle('controls-hidden');$('settingsBtn').setAttribute('aria-expanded',String(!hidden));};
sync();schedule(0);setTimeout(thumbnails,500);
