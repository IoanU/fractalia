import {escapeFloat} from './math.js';

export const formulas = {
  z2:'z²', z3:'z³', z4:'z⁴', z5:'z⁵', z6:'z⁶', z7:'z⁷',
  tricorn:'Tricorn', multi3:'Multicorn z³', multi4:'Multicorn z⁴', multi5:'Multicorn z⁵',
  ship:'Burning Ship', celtic:'Celtic', buffalo:'Buffalo', perpendicular:'Perpendicular Ship',
  heart:'Heart', warp:'Warp', phoenix:'Phoenix', lambda:'Lambda', cubic:'Cubic Two-Seed',
  newton:'Newton', nova:'Nova', magnet:'Magnet', exp:'Exponential', sine:'Sine'
};

export const maxSteps = 8;
export const defaultStep = {formula:'z2', repeat:1, julia:false, re:-.745, im:.186, drift:false, amplitude:.03, period:12};
export const defaultRecipe = {mode:'orbit', seed:'auto', coloring:'escape', trap:.5, memory:-.5, sequence:'AABAB', steps:[defaultStep]};
const allowed = (value, choices, fallback) => choices.includes(value) ? value : fallback;
const bounded = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min,Math.min(max,value)) : fallback;

export function normalizeRecipe(recipe) {
  const steps = Array.isArray(recipe?.steps) ? recipe.steps.slice(0,maxSteps) : [];
  return {
    mode:allowed(recipe?.mode,['orbit','lyapunov'],'orbit'),
    seed:allowed(recipe?.seed,['auto','pixel','zero','critical'],'auto'),
    coloring:allowed(recipe?.coloring,['escape','ring','cross'],'escape'),
    trap:bounded(recipe?.trap,.01,4,.5),
    memory:bounded(recipe?.memory,-2,2,-.5),
    sequence:/^[AB]{1,24}$/.test(recipe?.sequence) ? recipe.sequence : 'AABAB',
    steps:(steps.length ? steps : [defaultStep]).map(step => ({
      formula:Object.hasOwn(formulas,step?.formula) ? step.formula : 'z2',
      repeat:Math.round(bounded(step?.repeat,1,16,1)),
      julia:step?.julia===true,
      re:bounded(step?.re,-8,8,defaultStep.re),
      im:bounded(step?.im,-8,8,defaultStep.im),
      drift:step?.drift===true,
      amplitude:bounded(step?.amplitude,0,2,defaultStep.amplitude),
      period:Math.round(bounded(step?.period,2,96,defaultStep.period))
    }))
  };
}

export const powers = {z3:3,z4:4,z5:5,z6:6,z7:7,multi3:3,multi4:4,multi5:5};
export const boundedColor = (distance,max) => Math.min(max-.001,Math.max(0,-Math.log2(distance+1e-12)*6));
export const lyapunovColor = (exponent,max) => exponent>=0 ? 34+Math.min(14,exponent*22) : boundedColor(-exponent,max);

export function recipeSeed(recipe) {
  const first=recipe.steps[0];
  const pixel=recipe.seed==='pixel'||(recipe.seed==='auto'&&(first.julia||first.formula==='newton'));
  const critical=recipe.seed==='critical'||(recipe.seed==='auto'&&['lambda','nova','cubic'].includes(first.formula));
  return {pixel,critical,dual:recipe.steps.length===1&&first.formula==='cubic'&&critical&&!pixel};
}

export function classicRecipe(recipe) {
  if(recipe.mode!=='orbit'||recipe.steps.length!==1||recipe.coloring!=='escape')return null;
  const step=recipe.steps[0];
  if(step.drift)return null;
  const {pixel,critical}=recipeSeed(recipe);
  if(step.formula==='z2'&&step.julia&&pixel)return {type:'julia',jr:step.re,ji:step.im};
  if(!step.julia&&!pixel&&!critical){
    if(step.formula==='z2')return {type:'mandelbrot',jr:0,ji:0};
    if(step.formula==='ship')return {type:'ship',jr:0,ji:0};
  }
  return null;
}

function quadraticTrap(recipe,max,pixelSeed,criticalSeed){
  const step=recipe.steps[0],trap=recipe.trap,ring=recipe.coloring==='ring';
  return (px,py)=>{
    const re=step.julia?step.re:px,im=step.julia?step.im:py;
    let x=pixelSeed?px:criticalSeed?1:0,y=pixelSeed?py:0;
    let nearest=Infinity,lowSquare=0,highSquare=Infinity;
    for(let n=0;n<max;n++){
      const next=x*x-y*y+re;
      y=2*x*y+im;x=next;
      const magnitude=x*x+y*y;
      if(ring){
        if(magnitude>=lowSquare&&magnitude<=highSquare){
          // Use the same distance as the generic path for cached recoloring.
          nearest=Math.min(nearest,Math.abs(Math.hypot(x,y)-trap));
          lowSquare=Math.max(0,trap-nearest)**2;
          highSquare=(trap+nearest)**2;
        }
      }else nearest=Math.min(nearest,Math.abs(x-trap),Math.abs(y-trap));
      if(!(magnitude<=256))break;
    }
    return boundedColor(nearest,max);
  };
}

export function compileRecipe(config, max) {
  const recipe = normalizeRecipe(config);
  if(recipe.mode==='lyapunov') {
    const sequence = [...recipe.sequence].map(letter => letter==='A');
    return (a,b) => {
      if(a<0||a>4||b<0||b>4)return max;
      let x=.5,total=0,product=1;
      for(let n=0;n<max+24;n++) {
        const r=sequence[n%sequence.length] ? a : b;
        if(n>=24){
          product*=Math.max(1e-15,Math.abs(r*(1-2*x)));
          if((n&15)===7){total+=Math.log(product);product=1;}
        }
        x=r*x*(1-x);
      }
      return lyapunovColor((total+Math.log(product))/max,max);
    };
  }

  const classic=classicRecipe(recipe);
  if(classic)return (x,y)=>escapeFloat(x,y,max,classic.type,classic.jr,classic.ji);
  const {pixel:pixelSeed,critical:criticalSeed,dual:dualSeed}=recipeSeed(recipe);
  if(recipe.steps.length===1&&recipe.steps[0].formula==='z2'
    &&!recipe.steps[0].drift&&recipe.coloring!=='escape')return quadraticTrap(recipe,max,pixelSeed,criticalSeed);

  const steps = recipe.steps.map(step => ({
    ...step,
    power:powers[step.formula]||2,
    driftTable:step.drift&&step.amplitude>0 ? Array.from({length:step.period},(_,i) => {
      const angle=2*Math.PI*i/step.period;
      return [step.amplitude*Math.cos(angle),step.amplitude*Math.sin(angle)];
    }) : null
  }));
  const first=steps[0];
  const critical=first.formula==='lambda' ? .5 : first.formula==='cubic' ? Math.sqrt(.3) : 1;
  const trap=recipe.coloring;
  function orbit(px,py,seed) {
    let x=pixelSeed?px:seed,y=pixelSeed?py:0;
    let previousX=0,previousY=0,nearest=Infinity,index=0,remaining=first.repeat;
    for(let n=0;n<max;n++) {
      const step=steps[index],formula=step.formula;
      let re=step.julia?step.re:px,im=step.julia?step.im:py;
      if(step.driftTable) {
        const offset=step.driftTable[n%step.period];
        re+=offset[0];im+=offset[1];
      }
      let a=x,b=y;
      switch(formula) {
        case 'tricorn': case 'multi3': case 'multi4': case 'multi5': b=-b;break;
        case 'ship': a=Math.abs(a);b=Math.abs(b);break;
        case 'perpendicular': a=Math.abs(a);b=-b;break;
        case 'heart': a=Math.abs(a);break;
      }
      let u=a*a-b*b,v=2*a*b;
      for(let power=2;power<step.power;power++) {
        const next=u*a-v*b;
        v=u*b+v*a;u=next;
      }
      switch(formula) {
        case 'celtic': u=Math.abs(u);break;
        case 'buffalo': u=Math.abs(u);v=-Math.abs(v);break;
        case 'warp': u+=.35*Math.sin(3*a);v+=.35*Math.sin(3*b);break;
        case 'phoenix': u+=recipe.memory*previousX;v+=recipe.memory*previousY;break;
        case 'lambda': {
          const real=a-u,imag=b-v;
          u=re*real-im*imag;v=re*imag+im*real;re=im=0;break;
        }
        case 'cubic': {
          const next=u*a-v*b-.9*a;
          v=u*b+v*a-.9*b;u=next;break;
        }
        case 'newton': case 'nova': {
          const denominator=u*u+v*v;
          if(denominator===0)return max;
          // Newton uses z³−1; Julia and Drift can perturb the root target.
          const rootRe=formula==='newton' ? 1+(step.julia?re:re-px) : 1;
          const rootIm=formula==='newton' ? (step.julia?im:im-py) : 0;
          const invRe=(rootRe*u+rootIm*v)/denominator,invIm=(rootIm*u-rootRe*v)/denominator;
          if(formula==='newton')re=im=0;
          u=(2*a+invRe)/3;v=(2*b+invIm)/3;
          const dx=u+re-a,dy=v+im-b;
          if(steps.length===1&&dx*dx+dy*dy<1e-12) {
            const basin=Math.round(Math.atan2(v+im,u+re)*3/(2*Math.PI))+1;
            return trap==='escape' ? 3+basin*14+Math.min(10,Math.log2(n+1)*2) : boundedColor(nearest,max);
          }
          break;
        }
        case 'magnet': {
          const real=u+re-1,imag=v+im,dr=2*a+re-2,di=2*b+im;
          const denominator=dr*dr+di*di;
          if(denominator===0)return max;
          const qr=(real*dr+imag*di)/denominator,qi=(imag*dr-real*di)/denominator;
          u=qr*qr-qi*qi;v=2*qr*qi;re=im=0;
          if(steps.length===1&&(u-1)**2+v*v<1e-12)return trap==='escape'?25+Math.min(20,n*.2):boundedColor(nearest,max);
          break;
        }
        case 'exp': {
          const magnitude=Math.exp(a);
          u=magnitude*Math.cos(b);v=magnitude*Math.sin(b);break;
        }
        case 'sine': u=Math.sin(a)*Math.cosh(b);v=Math.cos(a)*Math.sinh(b);break;
      }
      previousX=x;previousY=y;x=u+re;y=v+im;
      if(trap==='ring')nearest=Math.min(nearest,Math.abs(Math.hypot(x,y)-recipe.trap));
      if(trap==='cross')nearest=Math.min(nearest,Math.abs(x-recipe.trap),Math.abs(y-recipe.trap));
      const magnitude=x*x+y*y;
      const bailout=steps.length===1&&formula==='newton'?1e28:256;
      if(!(magnitude<=bailout)) {
        if(trap!=='escape')return boundedColor(nearest,max);
        const smooth=Number.isFinite(magnitude)?Math.log(Math.log2(magnitude)/2)/Math.log(step.power):0;
        return n+1-smooth;
      }
      if(--remaining===0) {
        index=(index+1)%steps.length;
        remaining=steps[index].repeat;
      }
    }
    return trap==='escape'?max:boundedColor(nearest,max);
  }
  const seed=criticalSeed?critical:0;
  return dualSeed ? (x,y)=>Math.min(orbit(x,y,seed),orbit(x,y,-seed)) : (x,y)=>orbit(x,y,seed);
}
