import {absBig,fixedPoint} from './fixed-point.js';
import {parseDecimal} from './math.js';
import {sineRadius} from './orbit-bounds.js';

const errorLimit=1e-7;
const roundoff=32*Number.EPSILON;
const escaped=(n,radius)=>n+1-Math.log2(Math.log2(radius));

// The reference is calculated in fixed point. Pixel deltas use the addition
// laws for complex sine and exponential, so tiny offsets survive rounding.
export function analyticJulia({recipe,precision,max,width,scale,point,exact}){
  const step=recipe.steps[0];
  const isSine=step.formula==='sine';
  const {one,mul,div,sinCos,exp,toNumber}=fixedPoint(precision);
  const digits=Math.ceil(precision/Math.log2(10))+2;
  const decimalUnit=10n**BigInt(digits);
  const encode=value=>parseDecimal(value,digits)*one/decimalUnit;
  const cr=encode(step.re),ci=encode(step.im),arithmeticError=Math.max(Number.MIN_VALUE,2**(30-precision));
  const bailout=256n*one*one;
  const referenceCache=new Map();
  const cacheLimit=Math.max(8,Math.min(256,Math.floor(8*1024*1024/(56*(max+1)))));

  function sharedPrefix(reference,last,radius){
    // Expand the delta as A·u+B·u² for |u|≤1. Stop before the neglected
    // terms could affect either the orbit or the escape decision.
    let ar=radius,ai=0,br=0,bi=0,error=arithmeticError,bound=radius,iteration=0;
    for(let n=0;n<last-1;n++){
      const offset=7*n;
      const cr=reference[offset+4],ci=reference[offset+5],derivative=reference[offset+6];
      const sr=reference[offset+2],si=reference[offset+3];
      const secondRe=sr*(isSine?-.5:.5),secondIm=si*(isSine?-.5:.5);
      const aa=ar*ar-ai*ai,ab=2*ar*ai;
      const nextAr=cr*ar-ci*ai,nextAi=cr*ai+ci*ar;
      const nextBr=cr*br-ci*bi+secondRe*aa-secondIm*ab;
      const nextBi=cr*bi+ci*br+secondRe*ab+secondIm*aa;
      const first=Math.hypot(ar,ai),second=Math.hypot(br,bi);
      const curvature=2*(Math.hypot(sr,si)+derivative+1);
      const omitted=curvature*((2*first+second)*second+bound**3);
      const nextBound=Math.hypot(nextAr,nextAi)+Math.hypot(nextBr,nextBi);
      const nextError=(derivative+curvature*(bound+error))*error+omitted+roundoff*nextBound+arithmeticError;
      const magnitude=Math.hypot(reference[offset+7],reference[offset+8]);
      if(!(nextBound<1e-4&&nextError<=nextBound*1e-10&&magnitude+nextBound+nextError<16-1e-12))break;
      ar=nextAr;ai=nextAi;br=nextBr;bi=nextBi;
      error=nextError;bound=nextBound;iteration=n+1;
    }
    return iteration>=8?{ar,ai,br,bi,error,iteration,radius}:null;
  }

  function getReference(px,py,shift=0){
    const size=96;
    const x0=Math.floor((px-shift)/size)*size+size/2+shift;
    const y0=Math.floor((py-shift)/size)*size+size/2+shift;
    const key=x0+':'+y0;
    if(referenceCache.has(key))return referenceCache.get(key);
    const reference=new Float64Array(7*(max+1));
    let [x,y]=point(x0,y0),last=0;
    reference[0]=toNumber(x);reference[1]=toNumber(y);
    for(let n=0;n<max;n++){
      const offset=7*n;
      let re,im,derivativeRe,derivativeIm;
      if(isSine){
        if(absBig(y)>1024n*one)break;
        const large=exp(absBig(y)),small=div(one,large);
        const cosh=(large+small)/2n,sinh=(y<0n?small-large:large-small)/2n;
        const [sin,cos]=sinCos(x);
        re=mul(sin,cosh);im=mul(cos,sinh);
        derivativeRe=mul(cos,cosh);derivativeIm=-mul(sin,sinh);
      }else{
        if(x>1024n*one)break;
        const magnitude=exp(x),[sin,cos]=sinCos(y);
        re=mul(magnitude,cos);im=mul(magnitude,sin);
        derivativeRe=re;derivativeIm=im;
      }
      reference[offset+2]=toNumber(re);reference[offset+3]=toNumber(im);
      reference[offset+4]=toNumber(derivativeRe);reference[offset+5]=toNumber(derivativeIm);
      reference[offset+6]=Math.hypot(reference[offset+4],reference[offset+5]);
      x=re+cr;y=im+ci;last=n+1;
      reference[offset+7]=toNumber(x);reference[offset+8]=toNumber(y);
      if(x*x+y*y>bailout)break;
    }
    const result={reference,x0,y0,last,prefix:sharedPrefix(reference,last,scale*size/width)};
    if(referenceCache.size>=cacheLimit)referenceCache.delete(referenceCache.keys().next().value);
    referenceCache.set(key,result);
    return result;
  }

  let uncertain=false;
  function continueOrbit(x,y,n,error){
    for(;n<max;n++){
      if(isSine){
        const next=Math.sin(x)*Math.cosh(y)+step.re;
        if(!uncertain)error=sineRadius(x,y,error);
        y=Math.cos(x)*Math.sinh(y)+step.im;x=next;
      }else{
        const magnitude=Math.exp(x);
        const next=magnitude*Math.cos(y)+step.re;
        if(!uncertain)error=Math.exp(x+error)*error;
        y=magnitude*Math.sin(y)+step.im;x=next;
      }
      const radius=Math.hypot(x,y);
      if(!uncertain){
        error=error*(1+roundoff)+roundoff*(1+radius);
        if(!(error<=errorLimit)||Math.abs(radius-16)<=error)uncertain=true;
      }
      if(radius>16)return escaped(n,radius);
      if(!Number.isFinite(radius))return NaN;
    }
    return max;
  }

  function perturb(px,py,{reference,x0,y0,last,prefix}){
    let dx=(px-x0)*scale/width,dy=(py-y0)*scale/width;
    let error=roundoff*(Math.abs(dx)+Math.abs(dy))+arithmeticError;
    let n=0;
    if(prefix){
      const x=dx/prefix.radius,y=dy/prefix.radius;
      if(x*x+y*y<=1){
        const xx=x*x-y*y,xy=2*x*y;
        dx=prefix.ar*x-prefix.ai*y+prefix.br*xx-prefix.bi*xy;
        dy=prefix.ar*y+prefix.ai*x+prefix.br*xy+prefix.bi*xx;
        n=prefix.iteration;
        error=prefix.error+roundoff*(Math.abs(dx)+Math.abs(dy));
      }
    }
    for(;n<last;n++){
      const offset=7*n;
      const square=dx*dx+dy*dy;
      if(square>.01)break;
      const sx=reference[offset+2],sy=reference[offset+3];
      const cx=reference[offset+4],cy=reference[offset+5],derivative=reference[offset+6];
      let sinRe,sinIm,cosRe,cosIm;
      if(square<=1e-8){
        const xx=dx*dx-dy*dy,xy=2*dx*dy;
        const xxx=(xx*dx-xy*dy)/6,xxy=(xx*dy+xy*dx)/6;
        sinRe=isSine?dx-xxx:dx+xx/2+xxx;
        sinIm=isSine?dy-xxy:dy+xy/2+xxy;
        cosRe=-xx/2;cosIm=-xy/2;
      }else if(isSine){
        const sin=Math.sin(dx),cos=Math.cos(dx),sinh=Math.sinh(dy),cosh=Math.cosh(dy);
        sinRe=sin*cosh;sinIm=cos*sinh;
        cosRe=2*(Math.sinh(dy/2)**2-Math.sin(dx/2)**2*cosh);
        cosIm=-sin*sinh;
      }else{
        const magnitude=Math.exp(dx);
        sinRe=Math.expm1(dx)-2*magnitude*Math.sin(dy/2)**2;
        sinIm=magnitude*Math.sin(dy);
      }
      if(isSine){
        dx=cx*sinRe-cy*sinIm+sx*cosRe-sy*cosIm;
        dy=cx*sinIm+cy*sinRe+sx*cosIm+sy*cosRe;
      }else{
        dx=sx*sinRe-sy*sinIm;dy=sx*sinIm+sy*sinRe;
      }
      const x=reference[offset+7]+dx,y=reference[offset+8]+dy;
      const radius=Math.sqrt(x*x+y*y);
      if(!uncertain){
        const length=Math.sqrt(square),curvature=Math.abs(sx)+Math.abs(sy);
        const remainder=square<=1e-8?(curvature+derivative)*square*square/20:0;
        error=(derivative+2*(curvature+derivative+1)*(length+error)+roundoff)*error
          +remainder+roundoff*(Math.abs(dx)+Math.abs(dy))+arithmeticError;
        if(!(error<=errorLimit)||Math.abs(radius-16)<=error+roundoff*radius)uncertain=true;
      }
      if(radius>16)return escaped(n,radius);
      if(!Number.isFinite(radius))return NaN;
    }
    const x=reference[7*n]+dx,y=reference[7*n+1]+dy;
    return continueOrbit(x,y,n,error+roundoff*(1+Math.abs(x)+Math.abs(y)));
  }

  return (x,y)=>{
    uncertain=false;
    const fast=perturb(x,y,getReference(x,y));
    if(Number.isFinite(fast)&&!uncertain)return fast;
    uncertain=false;
    const retry=perturb(x,y,getReference(x,y,48));
    if(Number.isFinite(retry)&&(!uncertain||((fast===max)===(retry===max)&&Math.abs(fast-retry)<1e-4)))return retry;
    return exact(x,y);
  };
}
