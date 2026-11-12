import {absBig,fixedAngle,fixedPoint} from './fixed-point.js';
import {boundedColor,lyapunovColor,normalizeRecipe,powers,recipeSeed} from './formulas.js';
import {parseDecimal} from './math.js';
import {sineRadius} from './orbit-bounds.js';

export function preciseRecipe(config,max,precision) {
  const recipe=normalizeRecipe(config);
  const {bits,one,mul,div,sqrt,sin,sinCos,sinCosTurn,exp,toNumber}=fixedPoint(precision);
  const decimalDigits=Math.ceil(precision*Math.LOG10E*Math.LN2)+2;
  const decimalUnit=10n**BigInt(decimalDigits);
  const encode=value=>parseDecimal(value,decimalDigits)*one/decimalUnit;
  const squareUnit=one*one,twoBits=2n*bits,threeBits=3n*bits;
  if(recipe.mode==='lyapunov'){
    const sequence=[...recipe.sequence].map(letter=>letter==='A');
    const limit=4n*one;
    function lyapunov(a,b,trace,exactDerivative=false){
      if(a<0n||a>limit||b<0n||b>limit)return max;
      const aNumber=toNumber(a),bNumber=toNumber(b);
      let x=one>>1n,total=0,product=1;
      for(let n=0;n<max+24;n++){
        const useA=sequence[n%sequence.length],r=useA?a:b;
        if(n>=24){
          const difference=one-(x<<1n);
          const derivative=exactDerivative?toNumber(absBig(mul(r,difference)))
            :(useA?aNumber:bNumber)*toNumber(absBig(difference));
          product*=Math.max(1e-15,derivative);
          if((n&15)===7){total+=Math.log(product);product=1;}
        }
        const next=mul(mul(r,x),one-x);
        trace?.(n,x,r,useA);
        x=next;
      }
      const exponent=(total+Math.log(product))/max;
      // The coloring switches branches at zero, even for a tiny exponent.
      if(!trace&&!exactDerivative&&Math.abs(exponent)<1e-12)return lyapunov(a,b,undefined,true);
      return lyapunovColor(exponent,max);
    }
    const evaluate=(a,b)=>lyapunov(a,b);
    evaluate.trace=lyapunov;
    return evaluate;
  }

  const steps=recipe.steps.map(step=>{
    const amplitude=encode(step.amplitude);
    const drift=step.drift&&amplitude!==0n?Array.from({length:step.period},(_,i)=>{
      const [sin,cos]=sinCosTurn(i,step.period);
      return [mul(amplitude,cos),mul(amplitude,sin)];
    }):null;
    return {...step,re:encode(step.re),im:encode(step.im),power:powers[step.formula]??2,drift};
  });
  const first=steps[0],single=steps.length===1;
  const hasMemory=steps.some(step=>step.formula==='phoenix');
  const canRepeat=single&&!first.drift&&first.formula!=='phoenix';
  const canBound=single&&['sine','exp','warp'].includes(first.formula)&&recipe.coloring==='escape';
  const arithmeticError=Math.max(Number.MIN_VALUE,2**(30-precision));
  const {pixel,critical,dual}=recipeSeed(recipe);
  const seed=critical ? first.formula==='lambda' ? one/2n : first.formula==='cubic' ? sqrt(3n*one/10n) : one : 0n;
  const {coloring}=recipe;
  const trap=encode(recipe.trap),memory=encode(recipe.memory),warp=7n*one/20n,cubic=9n*one/10n;
  const applyMemory=memory*2n===-one?value=>(-value)>>1n:value=>mul(memory,value);
  const ring=coloring==='ring',trapSquared=trap*trap;
  const escapeLimit=256n*squareUnit,newtonLimit=10n**28n*squareUnit;
  const converged=squareUnit/10n**12n;
  function colorTrap(distance,inside,outside){
    if(ring){
      const below=inside===null?null:trap-sqrt(inside>>bits);
      const above=outside===null?null:absBig(sqrt(outside>>bits)-trap);
      distance=below===null?above:above===null||below<above?below:above;
    }
    return boundedColor(distance===null?Infinity:toNumber(distance),max);
  }

  function orbit(px,py,initial,regionRadius,trace){
    const checking=regionRadius!==undefined;
    let x=pixel?px:initial,y=pixel?py:0n;
    let previousX=0n,previousY=0n,nearest=null,index=0,remaining=first.repeat;
    let inside=null,outside=null;
    let checkpointX=x,checkpointY=y,nextCheckpoint=16;
    let error=(pixel?regionRadius??0:0)+arithmeticError;
    for(let n=0;n<max;n++){
      const step=steps[index],{formula,power}=step;
      const offset=step.drift?.[n%step.period];
      let re=step.julia?step.re:px,im=step.julia?step.im:py;
      if(offset){re+=offset[0];im+=offset[1];}
      const parameterRe=re,parameterIm=im;
      let a=x,b=y;
      if(checking){
        const re=toNumber(a),im=toNumber(b);
        const spread=formula==='sine'?sineRadius(re,im,error)
          :(formula==='exp'?Math.exp(re+error):2*Math.hypot(re,im)+error+1.05)*error;
        error=spread*(1+1e-12)+1e-15*error+(step.julia?0:regionRadius)+arithmeticError;
        if(!(error<=.01))return NaN;
      }
      switch(formula){
        case 'tricorn': case 'multi3': case 'multi4': case 'multi5': b=-b;break;
        case 'ship': a=absBig(a);b=absBig(b);break;
        case 'perpendicular': a=absBig(a);b=-b;break;
        case 'heart': a=absBig(a);break;
      }
      const needsSquare=trace||formula!=='exp'&&formula!=='sine';
      const aa=needsSquare?a*a:0n,bb=needsSquare?b*b:0n;
      const realSquare=aa-bb,imagSquare=needsSquare?(a*b)<<1n:0n;
      let u=realSquare>>bits,v=imagSquare>>bits;
      for(let k=2;k<power;k++){
        const next=(u*a-v*b)>>bits;
        v=(u*b+v*a)>>bits;u=next;
      }
      switch(formula){
        case 'celtic': u=absBig(u);break;
        case 'buffalo': u=absBig(u);v=-absBig(v);break;
        case 'warp': u+=mul(warp,sin(3n*a));v+=mul(warp,sin(3n*b));break;
        case 'phoenix': u+=applyMemory(previousX);v+=applyMemory(previousY);break;
        case 'lambda': {
          const real=a-u,imag=b-v;
          u=(re*real-im*imag)>>bits;v=(re*imag+im*real)>>bits;re=im=0n;break;
        }
        case 'cubic': {
          const next=((u*a-v*b)>>bits)-mul(cubic,a);
          v=((u*b+v*a)>>bits)-mul(cubic,b);u=next;break;
        }
        case 'newton': case 'nova': {
          const norm=aa+bb,denominator=norm*norm;
          if(denominator===0n)return max;
          const targetRe=formula==='newton'?one+(step.julia?re:re-px):one;
          const targetIm=formula==='newton'?(step.julia?im:im-py):0n;
          const unitTarget=targetRe===one&&targetIm===0n;
          const invRe=unitTarget?(realSquare<<threeBits)/denominator
            :((targetRe*realSquare+targetIm*imagSquare)<<twoBits)/denominator;
          const invIm=unitTarget?(-imagSquare<<threeBits)/denominator
            :((targetIm*realSquare-targetRe*imagSquare)<<twoBits)/denominator;
          if(formula==='newton')re=im=0n;
          u=(2n*a+invRe)/3n;v=(2n*b+invIm)/3n;
          break;
        }
        case 'magnet': {
          const real=u+re-one,imag=v+im,dr=2n*a+re-2n*one,di=2n*b+im;
          const denominator=dr*dr+di*di;
          if(denominator===0n)return max;
          const qr=((real*dr+imag*di)<<bits)/denominator,qi=((imag*dr-real*di)<<bits)/denominator;
          u=(qr*qr-qi*qi)>>bits;v=(2n*qr*qi)>>bits;re=im=0n;
          break;
        }
        case 'exp': {
          if(a>1024n*one)return checking?NaN:coloring==='escape'?n+1:colorTrap(nearest,inside,outside);
          const magnitude=exp(a),[sin,cos]=sinCos(b);
          u=mul(magnitude,cos);v=mul(magnitude,sin);break;
        }
        case 'sine': {
          if(absBig(b)>1024n*one)return checking?NaN:coloring==='escape'?n+1:colorTrap(nearest,inside,outside);
          const large=exp(absBig(b)),small=div(one,large),[sin,cos]=sinCos(a);
          u=mul(sin,(large+small)/2n);v=mul(cos,(b<0n?small-large:large-small)/2n);break;
        }
      }
      trace?.(n,x,y,parameterRe,parameterIm,u+re,v+im,realSquare>>bits,imagSquare>>bits);
      if(single){
        if(formula==='newton'||formula==='nova'){
          const dx=u+re-a,dy=v+im-b;
          if(dx*dx+dy*dy<converged){
            const basin=Math.round(fixedAngle(v+im,u+re)*3/(2*Math.PI))+1;
            return coloring==='escape'?3+basin*14+Math.min(10,Math.log2(n+1)*2):colorTrap(nearest,inside,outside);
          }
        }
        if(formula==='magnet'&&(u-one)**2n+v*v<converged)return coloring==='escape'?25+Math.min(20,n*.2):colorTrap(nearest,inside,outside);
      }
      if(hasMemory){previousX=x;previousY=y;}
      x=u+re;y=v+im;
      const magnitude=x*x+y*y;
      if(checking){
        const radius=Math.sqrt(toNumber(magnitude>>bits));
        if(!Number.isFinite(radius)||Math.abs(radius-16)<=error+1e-12)return NaN;
        if(radius>16){
          const value=r=>n+1-Math.log2(Math.log2(r));
          const lower=value(radius+error),upper=value(radius-error);
          return upper-lower<=1e-6?(lower+upper)/2:NaN;
        }
      }
      if(ring){
        // Distance to the ring is monotone on each side of its radius.
        if(magnitude<=trapSquared){
          if(inside===null||magnitude>inside)inside=magnitude;
        }else if(outside===null||magnitude<outside)outside=magnitude;
      }else if(coloring==='cross'){
        const dx=absBig(x-trap),dy=absBig(y-trap),distance=dx<dy?dx:dy;
        if(nearest===null||distance<nearest)nearest=distance;
      }
      if(magnitude>(single&&formula==='newton'?newtonLimit:escapeLimit)){
        if(coloring!=='escape')return colorTrap(nearest,inside,outside);
        const m=toNumber(magnitude>>bits);
        return n+1-(Number.isFinite(m)?Math.log(Math.log2(m)/2)/Math.log(power):0);
      }
      // With one autonomous step an exactly repeated fixed-point state closes
      // the orbit, including any closest approach already recorded.
      if(canRepeat&&!checking&&!trace&&n>=15){
        if(x===checkpointX&&y===checkpointY)return coloring==='escape'?max:colorTrap(nearest,inside,outside);
        if(n+1===nextCheckpoint){
          checkpointX=x;checkpointY=y;nextCheckpoint*=2;
        }
      }
      if(--remaining===0){
        index=(index+1)%steps.length;
        remaining=steps[index].repeat;
      }
    }
    return coloring==='escape'?max:colorTrap(nearest,inside,outside);
  }
  const evaluate=dual?(x,y)=>Math.min(orbit(x,y,seed),orbit(x,y,-seed)):(x,y)=>orbit(x,y,seed);
  evaluate.trace=(x,y,trace,alternate=false)=>orbit(x,y,alternate?-seed:seed,undefined,trace);
  if(canBound)evaluate.region=(x,y,radius)=>orbit(x,y,seed,radius);
  return evaluate;
}
