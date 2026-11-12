import {compileRecipe, defaultStep, normalizeRecipe} from './formulas.js';

const step = (formula, options) => ({...defaultStep, formula, ...options});
const julia = (formula,re,im,options) => step(formula,{julia:true,re,im,...options});
const drift = (formula,re,im,amplitude,period) => julia(formula,re,im,{drift:true,amplitude,period});
const preset = (name, group, steps, options={}) => ({
  name, group, type:'studio', cx:options.cx??'0', cy:options.cy??'0',
  span:options.span??'3.8', palette:options.palette??'aurora', shift:options.shift??0,
  glowStart:options.glowStart,
  recipe:normalizeRecipe({...options,steps})
});

export const catalog = {
  multibrot3:preset('Multibrot z³','Powers',[step('z3')],{palette:'ember'}),
  multibrot4:preset('Multibrot z⁴','Powers',[step('z4')],{palette:'ocean'}),
  multibrot5:preset('Multibrot z⁵','Powers',[step('z5')],{palette:'moss'}),
  multibrot6:preset('Multibrot z⁶','Powers',[step('z6')]),
  multibrot7:preset('Multibrot z⁷','Powers',[step('z7')],{palette:'ember'}),
  dendrite:preset('Julia Dendrite','Powers',[julia('z2',0,1)],{palette:'ocean'}),
  snowflake:preset('Julia Snowflake','Powers',[julia('z5',-.36,.28)],{span:'4.2',palette:'ocean',shift:165,glowStart:.4}),
  tricorn:preset('Tricorn','Folds & mirrors',[step('tricorn')],{cx:'-.3'}),
  multicorn3:preset('Multicorn z³','Folds & mirrors',[step('multi3')],{palette:'ember'}),
  multicorn4:preset('Multicorn z⁴','Folds & mirrors',[step('multi4')],{palette:'ocean'}),
  multicorn5:preset('Multicorn z⁵','Folds & mirrors',[step('multi5')],{palette:'moss'}),
  celtic:preset('Celtic','Folds & mirrors',[step('celtic')],{cx:'-.45',palette:'moss'}),
  buffalo:preset('Buffalo','Folds & mirrors',[step('buffalo')],{cx:'-.45',palette:'ember'}),
  perpendicular:preset('Perpendicular Ship','Folds & mirrors',[step('perpendicular')],{cx:'-.45',palette:'ocean'}),
  heart:preset('Heart','Folds & mirrors',[step('heart')],{cx:'-.45',palette:'ember'}),
  warp:preset('Warp','Orbits',[step('warp')],{cx:'-.35'}),
  phoenix:preset('Phoenix','Orbits',[julia('phoenix',.5667,0)],{span:'3.2',palette:'ember'}),
  lambda:preset('Lambda','Orbits',[step('lambda')],{cx:'1',span:'6',palette:'ocean'}),
  cubic:preset('Cubic Two-Seed','Orbits',[step('cubic')],{palette:'moss'}),
  elephant:preset('Elephant Valley','Orbits',[step('z2')],{cx:'.2817',cy:'.01',span:'.06',palette:'ocean'}),
  armada:preset('Ship Armada','Orbits',[step('ship')],{cx:'-1.75',cy:'-.035',span:'.055',palette:'ember'}),
  rings:preset('Orbit Rings','Orbits',[step('z2')],{cx:'-.55',coloring:'ring',trap:.65,palette:'ember'}),
  cross:preset('Orbit Cross','Orbits',[julia('z2',-.745,.186)],{coloring:'cross',trap:.35,palette:'ocean'}),
  fractaloid:preset('Fractaloid','Hybrids',[step('z3'),step('tricorn',{repeat:2}),step('z2')],{palette:'ocean'}),
  mirrorShip:preset('Mirror Ship','Hybrids',[step('ship',{repeat:2}),step('tricorn')],{cx:'-.5',palette:'ember'}),
  pulse:preset('Pulse','Hybrids',[step('z2',{repeat:4}),step('z5')],{cx:'-.5',palette:'moss'}),
  singularity:preset('Singularity','Hybrids',[step('warp'),step('celtic'),step('z3')],{palette:'ember'}),
  chainmail:preset('Chainmail','Hybrids',[step('celtic'),step('buffalo'),step('z2',{repeat:3})]),
  glass:preset('Kaleidoscope','Hybrids',[julia('z3',-.3,.55),julia('multi5',.1,-.15),julia('warp',-.34,.21)],{coloring:'ring',trap:.8,palette:'ocean'}),
  driftJulia:preset('Drift Julia','Drift',[drift('z2',-.745,.186,.045,16)],{palette:'ocean'}),
  driftSeahorse:preset('Drift Seahorse','Drift',[drift('z2',-.7453,.1127,.025,14)],{palette:'ember'}),
  driftTricorn:preset('Drift Tricorn','Drift',[drift('tricorn',-.25,.58,.09,18)],{palette:'moss'}),
  driftCubic:preset('Drift Cubic','Drift',[drift('z3',-.23,.55,.12,15)],{cy:'.12',span:'4.15',shift:143,glowStart:.8}),
  driftDendrite:preset('Drift Dendrite','Drift',[drift('z2',0,1,.08,20)],{palette:'moss'}),
  driftSnowflake:preset('Drift Snowflake','Drift',[drift('z5',-.36,.28,.15,19)],{span:'4.2',palette:'ocean',shift:210,glowStart:.4}),
  driftHeart:preset('Drift Heart','Drift',[drift('heart',-.45,.35,.07,12)],{cy:'-.42',span:'3',palette:'ember',shift:160,glowStart:3.7}),
  driftPhoenix:preset('Drift Phoenix','Drift',[drift('phoenix',.5667,0,.045,20)]),
  driftFractaloid:preset('Drift Fractaloid','Drift',[drift('z3',-.23,.53,.08,13),julia('tricorn',-.2,.3)],{palette:'ocean'}),
  driftSingularity:preset('Drift Singularity','Drift',[drift('warp',-.55,.3,.14,21),julia('celtic',-.21,.37)],{palette:'ember'}),
  driftPulse:preset('Drift Pulse','Drift',[drift('z2',-.61,.31,.13,18),julia('z5',-.3,.2)],{palette:'moss'}),
  driftMulticorn:preset('Drift Multicorn','Drift',[drift('multi5',-.26,.47,.12,20)],{palette:'ocean'}),
  newton:preset('Newton Basins','Convergence',[step('newton')],{seed:'pixel',palette:'moss'}),
  nova:preset('Nova','Convergence',[step('nova')],{span:'4.5',palette:'ocean'}),
  novaJelly:preset('Nova Jellyfish','Convergence',[julia('nova',-.06,.32)],{palette:'ember'}),
  magnet:preset('Magnet','Convergence',[step('magnet')],{cx:'1.5',span:'6',palette:'ocean'}),
  exponential:preset('Exponential Julia','Chaos',[julia('exp',-1.5,.35)],{cx:'2.4',span:'5.2',palette:'ember',shift:195,glowStart:-1.6}),
  sine:preset('Sine Julia','Chaos',[julia('sine',.12,.62)],{span:'8',palette:'moss'}),
  lyapunov:preset('Lyapunov','Chaos',[],{mode:'lyapunov',cx:'3.35',cy:'3.35',span:'1.4',palette:'ember'}),
  lyapunovBraid:preset('Lyapunov Braid','Chaos',[],{mode:'lyapunov',sequence:'ABBABAAB',cx:'3.4',cy:'3.4',span:'1.4',palette:'ocean'})
};

export function studioHome(recipe) {
  return recipe.mode==='lyapunov' ? catalog.lyapunov : {type:'studio',cx:'0',cy:'0',span:'3.8',name:'Custom sequence'};
}

const shufflePool = Object.values(catalog).filter(preset=>preset.group==='Hybrids'||preset.group==='Drift');

export function shuffleRecipe(current, random=Math.random) {
  const pick=items=>items[Math.floor(random()*items.length)];
  const max=200;
  for(let attempt=0;attempt<16;attempt++){
    const steps=Array.from({length:2+Math.floor(random()*3)},()=>({
      ...pick(shufflePool).recipe.steps[0],
      repeat:1+Math.floor(random()*3)
    }));
    const recipe=normalizeRecipe({...current,steps,seed:'auto',coloring:'escape'});
    const sample=compileRecipe(recipe,max),tones=new Set();
    let bounded=0;
    for(let y=0;y<16;y++)for(let x=0;x<24;x++){
      const value=sample((x-11.5)*3.8/24,(y-7.5)*3.8/24);
      if(value>=max)bounded++;
      else tones.add(Math.floor(value));
    }
    // Require a visible mix of bounded and escaping points in the overview.
    if(bounded>=12&&bounded<=288&&tones.size>=10)return recipe;
  }
  return pick([catalog.fractaloid,catalog.pulse,catalog.driftPhoenix]).recipe;
}
