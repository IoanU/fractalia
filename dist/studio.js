import {catalog, shuffleRecipe, studioHome} from './catalog.js';
import {compileRecipe, defaultStep, formulas, maxSteps, normalizeRecipe} from './formulas.js';
import {colorize} from './colorize.js';

const option = (value,label,active) => `<option value="${value}"${value===active?' selected':''}>${label}</option>`;
const checked = value => value?' checked':'';
const number = (name,label,value,min,max,step) =>
  `<label>${label}<input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`;

function drawPreview(canvas,preset,max) {
  const {width,height}=canvas,span=Number(preset.span),cx=Number(preset.cx),cy=Number(preset.cy);
  const sample=compileRecipe(preset.recipe,max),field=new Float64Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    field[y*width+x]=sample(cx+(x+.5-width/2)*span/width,cy+(y+.5-height/2)*span/width);
  }
  const pixels=colorize(field,max,preset.palette,preset.shift??0,preset.glowStart);
  canvas.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);
}

export function mountPresetCatalog(container,scrollRoot,onChoose) {
  const groups=new Map();
  for(const [key,preset] of Object.entries(catalog)) {
    if(!groups.has(preset.group))groups.set(preset.group,[]);
    groups.get(preset.group).push([key,preset]);
  }
  container.innerHTML=[...groups].map(([group,items])=>`<details><summary>${group} <span>${items.length}</span></summary><div class="preset-grid">${items.map(([key,preset])=>
    `<button type="button" class="preset-card" data-fractal="${key}" aria-pressed="false"><canvas width="112" height="72" aria-hidden="true"></canvas><span>${preset.name}</span></button>`
  ).join('')}</div></details>`).join('');
  container.onclick=event=>{
    const card=event.target.closest('[data-fractal]');
    if(card)onChoose(card.dataset.fractal);
  };
  const cards=container.querySelectorAll?.('[data-fractal]')??[];
  function thumbnail(card) {
    drawPreview(card.querySelector('canvas'),catalog[card.dataset.fractal],96);
  }
  if(typeof IntersectionObserver==='function') {
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting) {
        observer.unobserve(entry.target);
        thumbnail(entry.target);
      }
    },{root:scrollRoot});
    cards.forEach(card=>observer.observe(card));
  }else cards.forEach(thumbnail);
}

export function openStudio(open,state,onApply) {
  let recipe=normalizeRecipe(state.recipe??{steps:[{
    formula:state.type==='ship'?'ship':'z2',julia:state.type==='julia',re:state.jr,im:state.ji
  }]});
  let keepFrame=state.type==='studio',shuffled=false;
  const form=document.createElement('form');
  form.className='studio-form';
  function render() {
    form.innerHTML=`
      <div class="studio-settings">
        <label>Mode<select name="mode">${option('orbit','Formula sequence',recipe.mode)}${option('lyapunov','Lyapunov',recipe.mode)}</select></label>
        ${recipe.mode==='lyapunov' ? `<label>Logistic sequence (A/B)<input name="sequence" value="${recipe.sequence}" pattern="[ABab]{1,24}" maxlength="24" required></label>` :
          `<label>Starting point<select name="seed">${Object.entries({auto:'Automatic',pixel:'Pixel coordinate',zero:'Zero',critical:'Formula seed'}).map(([id,label])=>option(id,label,recipe.seed)).join('')}</select></label>
          <label>Color by<select name="coloring">${Object.entries({escape:'Escape / convergence',ring:'Orbit ring',cross:'Orbit cross'}).map(([id,label])=>option(id,label,recipe.coloring)).join('')}</select></label>
          <div${recipe.coloring==='escape'?' hidden':''}>${number('trap','Trap position',recipe.trap,.01,4,'any')}</div>
          <div${recipe.steps.some(step=>step.formula==='phoenix')?'':' hidden'}>${number('memory','Phoenix memory',recipe.memory,-2,2,'any')}</div>`}
      </div>
      ${recipe.mode==='orbit' ? `<div class="studio-sequence">${recipe.steps.map((step,i)=>`
        <fieldset class="studio-step"><legend>Step ${i+1}</legend>
          <div class="step-toolbar"><label>Formula<select name="formula-${i}">${Object.entries(formulas).map(([id,label])=>option(id,label,step.formula)).join('')}</select></label>
            ${number('repeat-'+i,'Repeat',step.repeat,1,16,1)}
            <div class="step-actions">
              <button type="button" data-action="up" data-step="${i}" aria-label="Move step ${i+1} up"${i===0?' disabled':''}>↑</button>
              <button type="button" data-action="down" data-step="${i}" aria-label="Move step ${i+1} down"${i===recipe.steps.length-1?' disabled':''}>↓</button>
              <button type="button" data-action="remove" data-step="${i}" aria-label="Remove step ${i+1}"${recipe.steps.length===1?' disabled':''}>×</button>
            </div>
          </div>
          <div class="step-modifiers">
            <label class="studio-check"><input name="julia-${i}" type="checkbox"${checked(step.julia)}> Julia</label>
            <label class="studio-check"><input name="drift-${i}" type="checkbox"${checked(step.drift)}> Drift</label>
            <div class="step-numbers" data-settings="julia-${i}"${step.julia?'':' hidden'}>
              ${number('re-'+i,'Re(c)',step.re,-8,8,'any')}${number('im-'+i,'Im(c)',step.im,-8,8,'any')}
            </div>
            <div class="step-numbers" data-settings="drift-${i}"${step.drift?'':' hidden'}>
              ${number('amplitude-'+i,'Drift radius',step.amplitude,0,2,'any')}${number('period-'+i,'Period',step.period,2,96,1)}
            </div>
          </div>
        </fieldset>`).join('')}</div>` : ''}
      <div class="studio-footer">
        ${recipe.mode==='orbit'?`<button type="button" data-action="add"${recipe.steps.length===maxSteps?' disabled':''}>+ Add step</button><button type="button" data-action="shuffle">Shuffle</button>`:''}
        <label class="studio-check"><input name="keepFrame" type="checkbox"${checked(keepFrame)}> Keep framing</label>
        <button type="submit" class="studio-apply">Apply</button>
      </div>
      ${shuffled?'<canvas class="shuffle-preview" width="192" height="112" aria-label="Shuffled fractal preview"></canvas>':''}
      <p class="studio-note">The sequence loops on every orbit. Drift rotates c during iteration.</p>`;
    if(shuffled)drawPreview(form.querySelector('.shuffle-preview'),{...studioHome(recipe),recipe,palette:state.palette,shift:state.shift},200);
  }
  function readForm() {
    const fields=form.elements;
    const value=name=>fields.namedItem(name)?.value;
    const numeric=name=>fields.namedItem(name)?.valueAsNumber;
    const enabled=name=>fields.namedItem(name)?.checked;
    const patch={mode:value('mode')};
    if(value('sequence')!==undefined)patch.sequence=value('sequence').toUpperCase();
    if(value('seed')!==undefined)Object.assign(patch,{
      seed:value('seed'),coloring:value('coloring'),trap:numeric('trap'),memory:numeric('memory'),
      steps:recipe.steps.map((_,i)=>({
        formula:value('formula-'+i),repeat:numeric('repeat-'+i),julia:enabled('julia-'+i),
        re:numeric('re-'+i),im:numeric('im-'+i),drift:enabled('drift-'+i),
        amplitude:numeric('amplitude-'+i),period:numeric('period-'+i)
      }))
    });
    recipe=normalizeRecipe({...recipe,...patch});
    keepFrame=enabled('keepFrame');
  }
  form.onchange=event=>{
    const {name}=event.target;
    shuffled=false;
    form.querySelector('.shuffle-preview')?.remove();
    if(name==='mode'||name==='coloring'||name.startsWith('formula-')) {
      readForm();
      if(name==='mode')keepFrame=false;
      render();
      form.elements.namedItem(name)?.focus();
    }else if(name.startsWith('julia-')||name.startsWith('drift-')){
      form.querySelector(`[data-settings="${name}"]`).hidden=!event.target.checked;
    }
  };
  form.onclick=event=>{
    const button=event.target.closest('[data-action]');
    if(!button)return;
    readForm();
    shuffled=false;
    const i=Number(button.dataset.step);
    switch(button.dataset.action) {
      case 'add': recipe.steps.push({...defaultStep});break;
      case 'remove': recipe.steps.splice(i,1);break;
      case 'up': case 'down': {
        const other=i+(button.dataset.action==='up'?-1:1);
        [recipe.steps[i],recipe.steps[other]]=[recipe.steps[other],recipe.steps[i]];
        break;
      }
      case 'shuffle': {
        recipe=shuffleRecipe(recipe);
        keepFrame=false;
        shuffled=true;
        break;
      }
    }
    render();
    const movedIndex=button.dataset.action==='up'?i-1:button.dataset.action==='down'?i+1:i;
    const next=form.querySelector(`[data-action="${button.dataset.action}"]${Number.isInteger(i)?`[data-step="${movedIndex}"]`:''}:not(:disabled)`);
    (next??form.elements.namedItem('formula-'+(button.dataset.action==='add'?recipe.steps.length-1:0)))?.focus();
  };
  form.onsubmit=event=>{
    event.preventDefault();
    readForm();
    onApply(recipe,keepFrame);
  };
  render();
  open('Formula Studio',form,'studio-dialog');
}
