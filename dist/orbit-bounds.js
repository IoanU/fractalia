import {boundedColor,lyapunovColor,normalizeRecipe,powers,recipeSeed} from './formulas.js';
// Keep bounds wider than the rounding of a Float64 orbit, including the
// conversion of the fixed-point view and its formula constants.
const roundoff=64*Number.EPSILON;
const colorTolerance=1e-6;
const roundingMargin=magnitude=>roundoff*(1+magnitude);
const powerRadius=(magnitude,radius,power)=>
  power===2 ? (2*magnitude+radius)*radius : power*(magnitude+radius)**(power-1)*radius;

function quotientRadius(numeratorRadius,quotientMagnitude,denominatorMagnitude,denominatorRadius){
  const lower=denominatorMagnitude-denominatorRadius;
  return lower>0?(numeratorRadius+quotientMagnitude*denominatorRadius)/lower:Infinity;
}

function confirmedColor(lower,upper){
  return upper-lower<=colorTolerance?(lower+upper)/2:NaN;
}

export function sineRadius(real,imag,radius){
  // |cos(x + iy)|² = cos²(x) + sinh²(y). Bound the change of
  // that derivative over the disk with the second derivative of sine.
  const derivative=Math.hypot(Math.cos(real),Math.sinh(imag));
  const curvature=Math.cosh(Math.abs(imag)+radius);
  return (derivative+curvature*radius/2+roundingMargin(derivative))*radius;
}

export function compileBoundedRecipe(config,max) {
  const recipe = normalizeRecipe(config);
  if(recipe.mode==='lyapunov') {
    const sequence = [...recipe.sequence].map(letter => letter==='A');
    return (a,b,regionRadius=0) => {
      const outside=Math.max(-a,-b,a-4,b-4);
      if(outside>0)return outside>regionRadius+roundingMargin(Math.max(Math.abs(a),Math.abs(b)))?max:NaN;
      let x=.5,total=0,product=1;
      const parameterError=regionRadius+roundingMargin(Math.max(Math.abs(a),Math.abs(b)));
      if(Math.min(a,b,4-a,4-b)<=parameterError)return NaN;
      let error=0,logError=0;
      for(let n=0;n<max+24;n++) {
        const r=sequence[n%sequence.length] ? a : b;
        const derivative=Math.abs(r*(1-2*x));
        if(n>=24){
          product*=Math.max(1e-15,derivative);
          if((n&15)===7){total+=Math.log(product);product=1;}
          const spread=2*r*error+parameterError+roundingMargin(derivative);
          const lower=Math.max(1e-15,derivative-spread);
          logError+=Math.log1p((Math.max(1e-15,derivative+spread)-lower)/lower);
          if(logError>1e-4*max)return NaN;
        }
        error=(derivative+r*error)*error+parameterError/4+roundingMargin(1);
        if(error>.01)return NaN;
        x=r*x*(1-x);
      }
      const exponent=(total+Math.log(product))/max;
      const spread=logError/max+roundingMargin(Math.abs(exponent));
      if(Math.abs(exponent)<=spread)return NaN;
      return confirmedColor(lyapunovColor(exponent-spread,max),lyapunovColor(exponent+spread,max));
    };
  }

  const {pixel:pixelSeed,critical:criticalSeed,dual:dualSeed}=recipeSeed(recipe);

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
  const single=steps.length===1;
  function orbit(px,py,seed,regionRadius) {
    let x=pixelSeed?px:seed,y=pixelSeed?py:0;
    let previousX=0,previousY=0,index=0,remaining=first.repeat;
    const parameterError=regionRadius+roundingMargin(Math.hypot(px,py));
    let error=pixelSeed?parameterError:roundingMargin(Math.abs(seed)),previousError=0;
    let trapLower=Infinity,trapUpper=Infinity;
    const finishTrap=()=>confirmedColor(boundedColor(trapUpper,max),boundedColor(trapLower,max));
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
      const inputMagnitude=Math.hypot(a,b);
      const parameterMagnitude=Math.hypot(re,im);
      const cError=step.julia?0:parameterError;
      let nextError=powerRadius(inputMagnitude,error,step.power)+cError;
      let operationMagnitude=inputMagnitude**step.power+parameterMagnitude;
      let u=a*a-b*b,v=2*a*b;
      for(let power=2;power<step.power;power++) {
        const next=u*a-v*b;
        v=u*b+v*a;u=next;
      }
      switch(formula) {
        case 'celtic': u=Math.abs(u);break;
        case 'buffalo': u=Math.abs(u);v=-Math.abs(v);break;
        case 'warp': u+=.35*Math.sin(3*a);v+=.35*Math.sin(3*b);nextError+=1.05*error;break;
        case 'phoenix': u+=recipe.memory*previousX;v+=recipe.memory*previousY;nextError+=Math.abs(recipe.memory)*previousError;break;
        case 'lambda': {
          const real=a-u,imag=b-v;
          const baseError=error+nextError-cError,baseMagnitude=Math.hypot(real,imag);
          nextError=parameterMagnitude*baseError+cError*(baseMagnitude+baseError);
          operationMagnitude+=parameterMagnitude*baseMagnitude;
          u=re*real-im*imag;v=re*imag+im*real;re=im=0;break;
        }
        case 'cubic': {
          const next=u*a-v*b-.9*a;
          nextError=powerRadius(inputMagnitude,error,3)+.9*error+cError;
          operationMagnitude+=inputMagnitude**3;
          v=u*b+v*a-.9*b;u=next;break;
        }
        case 'newton': case 'nova': {
          const denominator=u*u+v*v;
          if(denominator===0)return NaN;
          // Newton uses z³−1; Julia and Drift can perturb the root target.
          const rootRe=formula==='newton' ? 1+(step.julia?re:re-px) : 1;
          const rootIm=formula==='newton' ? (step.julia?im:im-py) : 0;
          const invRe=(rootRe*u+rootIm*v)/denominator,invIm=(rootIm*u-rootRe*v)/denominator;
          const invMagnitude=Math.hypot(invRe,invIm);
          const denominatorMagnitude=Math.hypot(u,v);
          const reciprocalError=quotientRadius(0,invMagnitude,denominatorMagnitude,nextError-cError+roundingMargin(denominatorMagnitude));
          nextError=(2*error+reciprocalError)/3+(formula==='nova'?cError:0);
          operationMagnitude+=invMagnitude+inputMagnitude;
          if(formula==='newton')re=im=0;
          u=(2*a+invRe)/3;v=(2*b+invIm)/3;
          const dx=u+re-a,dy=v+im-b;
          if(single&&Math.abs(Math.hypot(dx,dy)-1e-6)<=nextError+error+roundingMargin(operationMagnitude))return NaN;
          if(single&&dx*dx+dy*dy<1e-12) {
            const angle=Math.atan2(v+im,u+re),sector=angle*3/(2*Math.PI);
            const basin=Math.round(sector)+1;
            if(trap==='escape'){
              const rootMagnitude=Math.hypot(u+re,v+im);
              const spread=(nextError+roundingMargin(operationMagnitude))/rootMagnitude;
              if(spread>=.1||Math.PI-Math.abs(angle)<=2*spread||.5-Math.abs(sector-Math.round(sector))<=2*spread)return NaN;
            }
            return trap==='escape' ? 3+basin*14+Math.min(10,Math.log2(n+1)*2) : finishTrap();
          }
          break;
        }
        case 'magnet': {
          const real=u+re-1,imag=v+im,dr=2*a+re-2,di=2*b+im;
          const denominator=dr*dr+di*di;
          if(denominator===0)return NaN;
          const qr=(real*dr+imag*di)/denominator,qi=(imag*dr-real*di)/denominator;
          const quotientMagnitude=Math.hypot(qr,qi);
          const denominatorMagnitude=Math.hypot(dr,di);
          const quotientError=quotientRadius(nextError+roundingMargin(operationMagnitude),quotientMagnitude,denominatorMagnitude,2*error+cError+roundingMargin(denominatorMagnitude));
          nextError=powerRadius(quotientMagnitude,quotientError,2);
          operationMagnitude+=quotientMagnitude**2;
          u=qr*qr-qi*qi;v=2*qr*qi;re=im=0;
          if(single&&Math.abs(Math.hypot(u-1,v)-1e-6)<=nextError+roundingMargin(operationMagnitude))return NaN;
          if(single&&(u-1)**2+v*v<1e-12)return trap==='escape'?25+Math.min(20,n*.2):finishTrap();
          break;
        }
        case 'exp': {
          const magnitude=Math.exp(a);
          nextError=Math.exp(a+error)*error+cError;
          operationMagnitude+=magnitude;
          u=magnitude*Math.cos(b);v=magnitude*Math.sin(b);break;
        }
        case 'sine': {
          const cosh=Math.cosh(b);
          nextError=sineRadius(a,b,error)+cError;
          operationMagnitude+=cosh;
          u=Math.sin(a)*cosh;v=Math.cos(a)*Math.sinh(b);break;
        }
      }
      previousX=x;previousY=y;x=u+re;y=v+im;
      previousError=error;error=nextError+roundingMargin(operationMagnitude);
      if(!(error<=.01))return NaN;
      if(trap!=='escape'){
        const distance=trap==='ring'?Math.abs(Math.hypot(x,y)-recipe.trap):Math.min(Math.abs(x-recipe.trap),Math.abs(y-recipe.trap));
        const spread=error+roundingMargin(distance+Math.abs(recipe.trap));
        trapLower=Math.min(trapLower,Math.max(0,distance-spread));
        trapUpper=Math.min(trapUpper,distance+spread);
      }
      const magnitude=x*x+y*y;
      const bailout=single&&formula==='newton'?1e28:256;
      const radius=Math.sqrt(magnitude);
      if(Math.abs(radius-Math.sqrt(bailout))<=error)return NaN;
      if(!(magnitude<=bailout)) {
        if(trap!=='escape')return finishTrap();
        if(!Number.isFinite(radius))return NaN;
        const value=r=>n+1-Math.log(Math.log2(r))/Math.log(step.power);
        return confirmedColor(value(radius+error),value(radius-error));
      }
      if(--remaining===0) {
        index=(index+1)%steps.length;
        remaining=steps[index].repeat;
      }
    }
    return trap==='escape'?max:finishTrap();
  }
  const seed=criticalSeed?critical:0;
  return dualSeed ? (x,y,radius=0)=>Math.min(orbit(x,y,seed,radius),orbit(x,y,-seed,radius)) : (x,y,radius=0)=>orbit(x,y,seed,radius);
}
