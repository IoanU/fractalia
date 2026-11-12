import {boundedColor,lyapunovColor,powers,recipeSeed} from './formulas.js';
import {fixedPoint} from './fixed-point.js';

const roundoff=96*Number.EPSILON;
const tolerance=1e-6;
export const studioTileSize=64;

// |reference + delta| - |reference|, without subtracting nearly equal values.
function foldDelta(reference,delta){
  const pixel=reference+delta;
  if(reference>=0)return pixel>=0?delta:-delta-2*reference;
  return pixel<=0?-delta:delta+2*reference;
}

function prepareStep(step){
  const {formula}=step;
  return {
    ...step,
    power:formula==='cubic'?3:powers[formula]??2,
    logPower:Math.log(powers[formula]??2),
    foldX:formula==='ship'||formula==='perpendicular'||formula==='heart',
    foldY:formula==='ship',
    mirror:formula==='tricorn'||formula.startsWith('multi')||formula==='perpendicular',
    foldOutput:formula==='celtic'||formula==='buffalo',
    rational:formula==='newton'||formula==='nova'||formula==='magnet'
  };
}

function coefficients(step,x,y,cr,ci,nextX,nextY,zr,zi){
  const a=step.foldX?Math.abs(x):x,b=step.foldY?Math.abs(y):step.mirror?-y:y;
  const realPowers=[],imagPowers=[];
  let re=zr,im=zi;
  for(let p=2;p<step.power;p++){
    realPowers.push(re);imagPowers.push(im);
    const next=re*a-im*b;
    im=re*b+im*a;re=next;
  }
  let fr=0,fi=0,gr=0,gi=0,br=0,bi=0,qr=0,qi=0;
  switch(step.formula){
    case 'warp':
      fr=.35*Math.sin(3*a);fi=.35*Math.sin(3*b);
      gr=.35*Math.cos(3*a);gi=.35*Math.cos(3*b);
      break;
    case 'sine':
      fr=Math.sin(a)*Math.cosh(b);fi=Math.cos(a)*Math.sinh(b);
      gr=Math.cos(a)*Math.cosh(b);gi=-Math.sin(a)*Math.sinh(b);
      break;
    case 'exp':
      fr=Math.exp(a)*Math.cos(b);fi=Math.exp(a)*Math.sin(b);
      break;
    case 'lambda':
      fr=a-zr;fi=b-zi;
      break;
    case 'newton': case 'nova': case 'magnet': {
      const magnet=step.formula==='magnet';
      // The Newton root parameter is identical for all pixels at this step.
      const ar=magnet?zr+cr-1:step.formula==='nova'?1:3*nextX-2*x;
      const ai=magnet?zi+ci:step.formula==='nova'?0:3*nextY-2*y;
      br=magnet?2*x+cr-2:zr;bi=magnet?2*y+ci:zi;
      const square=br*br+bi*bi;
      qr=step.formula==='newton'?ar:(ar*br+ai*bi)/square;
      qi=step.formula==='newton'?ai:(ai*br-ar*bi)/square;
      break;
    }
  }
  return {step,x,y,a,b,zr,zi,nextX,nextY,cr,ci,realPowers,imagPowers,fr,fi,gr,gi,br,bi,qr,qi,
    radius:Math.hypot(a,b),nextRadius:Math.hypot(nextX,nextY),parameter:Math.hypot(cr,ci),
    base:Math.hypot(fr,fi),derivative:Math.hypot(gr,gi),denominator:Math.hypot(br,bi),quotient:Math.hypot(qr,qi)};
}


// Propagate the two linear responses to a pixel offset across the recipe.
// The prefix ends before a fold, escape, or neglected quadratic term can
// affect the answer. Previous responses are kept for Phoenix.
function linearPrefix(reference,radius,pixel,memory,fixedError){
  let xx=pixel?radius:0,xy=0,yx=0,yy=xx,error=pixel?fixedError:0;
  let px=0,py=0,qx=0,qy=0,previousError=0,iteration=0;
  for(const ref of reference){
    const {step}=ref,{formula,power}=step;
    const bound=Math.abs(xx)+Math.abs(xy)+Math.abs(yx)+Math.abs(yy);
    const input=bound+error;
    const extent=ref.radius+input;
    const foldMargin=roundoff*input+fixedError;
    if(input>0&&(step.foldX&&Math.abs(ref.x)<=input+foldMargin||step.foldY&&Math.abs(ref.y)<=input+foldMargin))break;
    const sx=step.foldX&&ref.x<0?-1:1;
    const sy=step.mirror||step.foldY&&ref.y<0?-1:1;
    let ar=2*ref.a,ai=2*ref.b,cr=step.julia?0:1,ci=0;
    let warpX=0,warpY=0;
    let gain=power===2?2*extent:power*extent**(power-1);
    let curvature=power===2?2:power*(power-1)*extent**(power-2);
    if(power>2){
      ar=power*ref.realPowers.at(-1);ai=power*ref.imagPowers.at(-1);
    }
    let outX=1,outY=1,delayed=0,crossError=0,parameterRounding=0;
    switch(formula){
      case 'celtic': case 'buffalo': {
        const squareSpread=(2*ref.radius+input)*input;
        const squareError=roundoff*squareSpread+fixedError;
        if(input>0&&(Math.abs(ref.zr)<=squareSpread+squareError||
          formula==='buffalo'&&Math.abs(ref.zi)<=squareSpread+squareError))return finish();
        outX=ref.zr<0?-1:1;
        if(formula==='buffalo')outY=ref.zi<0?1:-1;
        break;
      }
      case 'cubic': ar-=.9;gain+=.9;break;
      case 'warp':
        warpX=3*ref.gr;warpY=3*ref.gi;
        gain+=1.05;curvature+=3.15;break;
      case 'phoenix': delayed=memory;break;
      case 'lambda': {
        const dr=1-ar,di=-ai;
        ar=ref.cr*dr-ref.ci*di;ai=ref.cr*di+ref.ci*dr;
        if(!step.julia){
          cr=ref.fr;ci=ref.fi;
          crossError=radius*(1+gain)*input;
          parameterRounding=radius*(ref.radius+ref.radius**2);
        }
        gain=ref.parameter*(1+gain);
        curvature*=ref.parameter;
        break;
      }
      case 'sine':
        ar=ref.gr;ai=ref.gi;curvature=Math.cosh(Math.abs(ref.b)+input);
        gain=ref.derivative+curvature*input;break;
      case 'exp':
        ar=ref.fr;ai=ref.fi;gain=ref.base*Math.exp(input);curvature=gain;break;
    }
    const nextXX=outX*((ar+warpX)*sx*xx-ai*sy*yx)+cr*radius+delayed*px;
    const nextXY=outX*((ar+warpX)*sx*xy-ai*sy*yy)-ci*radius+delayed*py;
    const nextYX=outY*(ai*sx*xx+(ar+warpY)*sy*yx)+ci*radius+delayed*qx;
    const nextYY=outY*(ai*sx*xy+(ar+warpY)*sy*yy)+cr*radius+delayed*qy;
    const nextBound=Math.abs(nextXX)+Math.abs(nextXY)+Math.abs(nextYX)+Math.abs(nextYY);
    const scale=gain*bound+radius*(Math.abs(cr)+Math.abs(ci))+
      Math.abs(delayed)*(Math.abs(px)+Math.abs(py)+Math.abs(qx)+Math.abs(qy));
    const nextError=gain*error+Math.abs(delayed)*previousError+curvature*input*input/2+crossError+
      roundoff*(scale+nextBound+parameterRounding)+fixedError*(2+gain+Math.abs(cr)+Math.abs(ci));
    if(!(nextError<=1e-11*Math.max(radius,nextBound)&&ref.nextRadius+nextBound+nextError<16-1e-11))break;
    px=xx;py=xy;qx=yx;qy=yy;previousError=error;
    xx=nextXX;xy=nextXY;yx=nextYX;yy=nextYY;error=nextError;
    iteration++;
  }
  return finish();

  function finish(){
    return iteration>=24?{xx,xy,yx,yy,px,py,qx,qy,error,previousError,iteration,radius}:null;
  }
}

function phoenixErrorBound(memory){
  const memoryGain=Math.abs(memory);
  let remaining=0,startError,startPreviousError;
  let ar,ai,br,bi,previousAr,previousAi,previousBr,previousBi;
  let noise,previousNoise;
  return (re,im,factor,margin,error,previousError,addedError,consecutive)=>{
    if(!consecutive||!remaining){
      remaining=8;
      startError=error;startPreviousError=previousError;
      ar=1;ai=0;br=0;bi=0;
      previousAr=0;previousAi=0;previousBr=1;previousBi=0;
      noise=0;previousNoise=0;
    }
    // Compose the two-state linear recurrence over a short block. Take its
    // norm after composition, so opposing contributions can still cancel.
    const nextAr=2*(re*ar-im*ai)+memory*previousAr;
    const nextAi=2*(re*ai+im*ar)+memory*previousAi;
    const nextBr=2*(re*br-im*bi)+memory*previousBr;
    const nextBi=2*(re*bi+im*br)+memory*previousBi;
    const linear=Math.sqrt(nextAr*nextAr+nextAi*nextAi)*startError+
      Math.sqrt(nextBr*nextBr+nextBi*nextBi)*startPreviousError;
    const scale=(Math.abs(ar)+Math.abs(ai))*startError+(Math.abs(br)+Math.abs(bi))*startPreviousError;
    const previousScale=(Math.abs(previousAr)+Math.abs(previousAi))*startError+
      (Math.abs(previousBr)+Math.abs(previousBi))*startPreviousError;
    const nextNoise=(factor+margin)*noise+memoryGain*previousNoise+error**2+addedError+
      margin*(scale+memoryGain*previousScale+linear);
    previousAr=ar;previousAi=ai;previousBr=br;previousBi=bi;
    ar=nextAr;ai=nextAi;br=nextBr;bi=nextBi;
    previousNoise=noise;noise=nextNoise;remaining--;
    return linear+noise;
  };
}

function orbitPerturbation(recipe,max,precision){
  const {pixel,dual}=recipeSeed(recipe);
  const steps=recipe.steps.map(prepareStep);
  const sequence=steps.flatMap(step=>Array(step.repeat).fill(step));
  const single=steps.length===1;
  const {coloring,memory,trap}=recipe;
  const trackTrap=coloring!=='escape',ring=coloring==='ring';
  const hasMemory=steps.some(step=>step.formula==='phoenix');
  const memoryGain=Math.abs(memory);
  const canSkip=!trackTrap&&!steps.some(step=>step.rational);
  const fixedError=2**(30-precision);

  function trace(run,x,y,alternate,radius){
    const reference=[];
    run(x,y,(n,x,y,cr,ci,nextX,nextY,zr,zi)=>{
      reference.push(coefficients(sequence[n%sequence.length],x,y,cr,ci,nextX,nextY,zr,zi));
    },alternate);
    return {reference,prefix:canSkip?linearPrefix(reference,radius,pixel,memory,fixedError):null};
  }

  function evaluate({reference,prefix},cr,ci){
    const parameterDelta=Math.abs(cr)+Math.abs(ci);
    const parameterError=roundoff*parameterDelta+fixedError;
    let dx=pixel?cr:0,dy=pixel?ci:0,error=pixel?parameterError:0;
    let previousX=0,previousY=0,previousError=0;
    const phoenixBound=hasMemory?phoenixErrorBound(memory):null;
    let priorPhoenix=false;
    let start=0;
    if(prefix){
      const re=cr/prefix.radius,im=ci/prefix.radius;
      if(re*re+im*im<=1){
        dx=prefix.xx*re+prefix.xy*im;dy=prefix.yx*re+prefix.yy*im;
        previousX=prefix.px*re+prefix.py*im;previousY=prefix.qx*re+prefix.qy*im;
        error=prefix.error+roundoff*(Math.abs(dx)+Math.abs(dy));
        previousError=prefix.previousError+roundoff*(Math.abs(previousX)+Math.abs(previousY));
        start=prefix.iteration;
      }
    }
    let nearestLow=Infinity,nearestHigh=Infinity;
    function trapColor(){
      const low=boundedColor(nearestHigh,max),high=boundedColor(nearestLow,max);
      return high-low<=tolerance?(low+high)/2:NaN;
    }
    for(let n=start;n<reference.length;n++){
      const ref=reference[n],{step,a,b}=ref,{formula,power}=step;
      const x=step.foldX?foldDelta(ref.x,dx):dx;
      const y=step.foldY?foldDelta(ref.y,dy):step.mirror?-dy:dy;
      const dr=step.julia||formula==='newton'?0:cr,di=step.julia||formula==='newton'?0:ci;
      const delta=Math.abs(x)+Math.abs(y),input=delta+error;
      const cDelta=Math.abs(dr)+Math.abs(di),cError=step.julia||formula==='newton'?0:parameterError;
      const extent=ref.radius+input;
      const squareGain=ref.radius+extent;
      const squareRe=x*(2*a+x)-y*(2*b+y),squareIm=x*(2*b+y)+y*(2*a+x);
      let u=squareRe,v=squareIm,addParameter=true;
      let gain=power===2?2*extent:power*extent**(power-1),parameterGain=1,parameterRounding=1,extraError=0;
      let roundingGain=1+gain;
      for(let p=0;p<ref.realPowers.length;p++){
        // (Z + d)^k - Z^k = (Z + d) * ((Z + d)^(k-1) - Z^(k-1)) + d * Z^(k-1).
        const pr=ref.realPowers[p],pi=ref.imagPowers[p];
        const next=u*(a+x)-v*(b+y)+pr*x-pi*y;
        v=u*(b+y)+v*(a+x)+pr*y+pi*x;u=next;
      }
      if(step.foldOutput){
        u=foldDelta(ref.zr,u);
        if(formula==='buffalo')v=-foldDelta(ref.zi,v);
      }else if(formula==='cubic'){
        u-=.9*x;v-=.9*y;
        const re=a+x,im=b+y,radius=Math.hypot(re,im);
        // Keep the cancellation in 3z² - .9, and bound the quadratic remainder.
        gain=Math.hypot(3*(re*re-im*im)-.9,6*re*im)+(3*radius+error)*error+roundoff*(1+6*extent**2);
        roundingGain+=.9;
      }else if(formula==='phoenix'){
        u+=memory*previousX;v+=memory*previousY;
        const re=a+x,im=b+y;
        gain=2*Math.sqrt(re*re+im*im)+error+roundoff*(1+2*extent);
        extraError+=memoryGain*roundoff*(Math.abs(previousX)+Math.abs(previousY));
      }else if(formula==='warp'){
        u+=ref.gr*Math.sin(3*x)-2*ref.fr*Math.sin(1.5*x)**2;
        v+=ref.gi*Math.sin(3*y)-2*ref.fi*Math.sin(1.5*y)**2;
        gain+=1.05;
      }else if(formula==='lambda'){
        const re=x-u,im=y-v;
        u=ref.cr*re-ref.ci*im+dr*(ref.fr+re)-di*(ref.fi+im);
        v=ref.cr*im+ref.ci*re+dr*(ref.fi+im)+di*(ref.fr+re);
        parameterGain=ref.base+(1+squareGain)*input;
        gain=(ref.parameter+cDelta+cError)*(1+gain);
        roundingGain+=gain+parameterGain;
        parameterRounding=parameterGain;
        extraError+=roundoff*cDelta*(ref.radius+ref.radius**2);
        addParameter=false;
      }else if(formula==='sine'||formula==='exp'){
        if(formula==='sine'){
          const sine=Math.sin(x),cosh=Math.cosh(y),sinh=Math.sinh(y);
          const sr=sine*cosh,si=Math.cos(x)*sinh;
          const hr=Math.sinh(y/2),hi=Math.sin(x/2);
          const cm=2*(hr*hr-hi*hi*cosh),cs=-sine*sinh;
          u=ref.gr*sr-ref.gi*si+ref.fr*cm-ref.fi*cs;
          v=ref.gr*si+ref.gi*sr+ref.fr*cs+ref.fi*cm;
          gain=ref.derivative+Math.cosh(Math.abs(b)+input)*input;
          roundingGain+=gain;
          if(input>=.125){
            const margin=roundoff*(1+Math.abs(a)+Math.abs(b)+delta);
            const imag=Math.abs(b+y)+margin;
            gain=Math.min(gain,Math.hypot(Math.cos(a+x),Math.sinh(imag))+(error+margin)*Math.cosh(imag+error));
          }
        }else{
          const magnitude=Math.exp(x),sine=Math.sin(y/2);
          const er=Math.expm1(x)-2*magnitude*sine*sine,ei=magnitude*Math.sin(y);
          u=ref.fr*er-ref.fi*ei;v=ref.fr*ei+ref.fi*er;
          gain=ref.base*Math.exp(input);
          roundingGain+=gain;
          if(input>=.125)gain=Math.min(gain,Math.exp(a+x+error+roundoff*(1+Math.abs(a)+Math.abs(x))));
        }
      }else if(step.rational){
        const magnet=formula==='magnet';
        const denominatorSpread=magnet?2*input+cDelta+cError:squareGain*input;
        const denominator=ref.denominator-denominatorSpread-roundoff*(ref.denominator+ref.radius**2+ref.parameter+1);
        if(!(denominator>1e-12))return NaN;
        const br=magnet?2*x+dr:squareRe,bi=magnet?2*y+di:squareIm;
        const ar=(magnet?squareRe+dr:0)-ref.qr*br+ref.qi*bi;
        const ai=(magnet?squareIm+di:0)-ref.qr*bi-ref.qi*br;
        const re=ref.br+br,im=ref.bi+bi,square=re*re+im*im;
        const qr=(ar*re+ai*im)/square,qi=(ai*re-ar*im)/square;
        const quotient=ref.quotient+Math.abs(qr)+Math.abs(qi)+
          (denominatorSpread*(1+ref.quotient)+squareGain*input)/denominator;
        if(magnet){
          u=qr*(2*ref.qr+qr)-qi*(2*ref.qi+qi);v=qr*(2*ref.qi+qi)+qi*(2*ref.qr+qr);
          gain=2*quotient*(2*extent+2*quotient)/denominator;
          parameterGain=2*quotient*(1+quotient)/denominator;
        }else{
          u=(2*x+qr)/3;v=(2*y+qi)/3;
          gain=(2+quotient*2*extent/denominator)/3;
        }
        roundingGain+=(1+gain+parameterGain)*(1+(ref.radius**2+ref.parameter+1)/denominator);
        parameterRounding=parameterGain;
        // Propagate uncertainty around the reconstructed pixel, where the
        // derivatives can cancel. The larger reference disk still bounds rounding.
        const zr=a+x,zi=b+y,z=Math.hypot(zr,zi);
        const qRe=ref.qr+qr,qIm=ref.qi+qi,q=Math.hypot(qRe,qIm);
        const margin=roundoff*(1+z+quotient)*(1+(ref.radius**2+ref.parameter+1)/denominator);
        const localDenominator=Math.hypot(re,im)-(magnet?2*error+cError:(2*z+error)*error)-margin;
        if(localDenominator>1e-12){
          const separation=Math.hypot(zr-qRe,zi-qIm)+margin;
          if(magnet){
            const dz=(2*separation+error)/localDenominator;
            const dc=(Math.hypot(1-qRe,qIm)+margin)/localDenominator;
            const factor=2*(q+margin)+dz*error+dc*cError;
            gain=Math.min(gain,factor*dz);
            parameterGain=Math.min(parameterGain,factor*dc);
          }else{
            const localGain=(2*(z+margin)*separation+(4*z+q+5*margin+2*error)*error)/(3*localDenominator);
            gain=Math.min(gain,localGain);
          }
        }
        addParameter=formula==='nova';
      }
      if(addParameter){u+=dr;v+=di;}
      const noise=parameterGain*cError+extraError
        +roundoff*(roundingGain*delta+(1+parameterRounding)*cDelta+Math.abs(u)+Math.abs(v))+fixedError*(1+roundingGain);
      let nextError=gain*error+noise;
      if(formula==='phoenix'){
        nextError+=memoryGain*previousError;
        const margin=roundoff*(1+2*extent);
        nextError=Math.min(nextError,phoenixBound(a+x,b+y,gain-error,margin,error,previousError,noise,priorPhoenix));
      }
      if(!(nextError<=(step.rational ? .001 : 1e-5)))return NaN;
      const nextX=ref.nextX+u,nextY=ref.nextY+v;
      const radius=Math.sqrt(nextX*nextX+nextY*nextY);
      const spread=nextError+roundoff*(1+ref.nextRadius+radius);
      if(single&&step.rational){
        const re=formula==='magnet'?nextX-1:nextX-(ref.x+dx);
        const im=formula==='magnet'?nextY:nextY-(ref.y+dy);
        const distance=Math.hypot(re,im);
        const uncertainty=spread+(formula==='magnet'?0:error+roundoff*(1+ref.radius));
        if(Math.abs(distance-1e-6)<=uncertainty)return NaN;
        if(distance<1e-6){
          if(trackTrap)return trapColor();
          if(formula==='magnet')return 25+Math.min(20,n*.2);
          const angle=Math.atan2(nextY,nextX),sector=angle*3/(2*Math.PI);
          const angleError=2*spread/radius;
          if(!(angleError<.1)||Math.PI-Math.abs(angle)<=angleError||
            .5-Math.abs(sector-Math.round(sector))<=angleError)return NaN;
          return 3+(Math.round(sector)+1)*14+Math.min(10,Math.log2(n+1)*2);
        }
      }
      if(trackTrap){
        const distance=ring?Math.abs(radius-trap):Math.min(Math.abs(nextX-trap),Math.abs(nextY-trap));
        const trapSpread=spread+roundoff*Math.abs(trap);
        nearestLow=Math.min(nearestLow,Math.max(0,distance-trapSpread));
        nearestHigh=Math.min(nearestHigh,distance+trapSpread);
      }
      const bailout=single&&formula==='newton'?1e14:16;
      if(!Number.isFinite(radius)||Math.abs(radius-bailout)<=spread)return NaN;
      if(radius>bailout){
        if(trackTrap)return trapColor();
        const low=n+1-Math.log(Math.log2(radius+spread))/step.logPower;
        const high=n+1-Math.log(Math.log2(radius-spread))/step.logPower;
        return high-low<=tolerance?(low+high)/2:NaN;
      }
      if(hasMemory){previousX=dx;previousY=dy;previousError=error;priorPhoenix=formula==='phoenix';}
      dx=u;dy=v;error=nextError;
    }
    return reference.length===max?(trackTrap?trapColor():max):NaN;
  }

  return {trace,evaluate,dual};
}

function lyapunovPerturbation(max,precision){
  const fixedError=2**(30-precision);
  function trace(run,x,y){
    const reference=[];
    run(x,y,(n,x,r,useA)=>reference.push({x,r,useA}));
    return reference;
  }
  function evaluate(reference,da,db){
    if(reference.length!==max+24)return NaN;
    let dx=0,error=0,total=0,product=1,logError=0;
    for(let n=0;n<reference.length;n++){
      const {x,r,useA}=reference[n],dr=useA?da:db,parameter=r+dr;
      const parameterError=roundoff*Math.abs(dr)+fixedError;
      if(Math.min(parameter,4-parameter)<=parameterError+roundoff*4)return NaN;
      const derivative=r*(1-2*x),shift=1-2*(x+dx);
      if(n>=24){
        const value=Math.max(1e-15,Math.abs(derivative-2*r*dx+dr*shift));
        const spread=2*Math.abs(parameter)*error+parameterError+roundoff*(1+Math.abs(derivative)+2*Math.abs(r*dx));
        const lower=Math.max(1e-15,value-spread);
        // log(1+t) ≤ t, so the accumulated log interval can be bounded
        // without an extra logarithm on each iteration.
        logError+=2*spread/lower;
        if(logError>tolerance*max)return NaN;
        product*=value;
        if((n&15)===7){total+=Math.log(product);product=1;}
      }
      const next=(derivative-r*dx)*dx+dr*(x+dx)*(1-x-dx);
      error=(Math.abs(parameter*shift)+Math.abs(parameter)*error)*error+parameterError
        +roundoff*(Math.abs(dx)*(1+Math.abs(derivative))+Math.abs(dr)+Math.abs(next))+fixedError;
      if(!(error<=1e-5))return NaN;
      dx=next;
    }
    const exponent=(total+Math.log(product))/max,spread=logError/max+roundoff*(1+Math.abs(exponent));
    if(Math.abs(exponent)<=spread)return NaN;
    const a=lyapunovColor(exponent-spread,max),b=lyapunovColor(exponent+spread,max);
    return Math.abs(a-b)<=tolerance?(a+b)/2:NaN;
  }
  return {trace,evaluate,dual:false};
}

export function studioPerturbation({recipe,precision,max,pixelScale,point,evaluate,exact}){
  const {toNumber}=fixedPoint(precision);
  const run=recipe.mode==='lyapunov'
    ?(x,y,visit)=>evaluate.trace(x,y,(n,x,r,useA)=>visit(n,toNumber(x),toNumber(r),useA))
    :(x,y,visit,alternate)=>evaluate.trace(x,y,(n,x,y,cr,ci,nextX,nextY,zr,zi)=>
      visit(n,toNumber(x),toNumber(y),toNumber(cr),toNumber(ci),toNumber(nextX),toNumber(nextY),toNumber(zr),toNumber(zi)),alternate);
  const kernel=recipe.mode==='lyapunov'?lyapunovPerturbation(max,precision):orbitPerturbation(recipe,max,precision);
  const cache=new Map();
  const limit=Math.max(5,Math.min(128,Math.floor(8*1024*1024/(384*(max+24)*(kernel.dual?2:1)))));
  const patience=recipe.mode==='lyapunov'?8:64;
  // One large tile can use up to 16 smaller and four shifted references.
  const refineReference=limit>=21&&recipe.mode==='orbit'&&recipe.steps.some(({formula})=>
    ['sine','exp','nova','newton','magnet','phoenix','cubic'].includes(formula));

  function getReference(px,py,shift,size=studioTileSize){
    const x0=Math.floor((px-shift)/size)*size+size/2+shift;
    const y0=Math.floor((py-shift)/size)*size+size/2+shift;
    const key=x0+':'+y0+':'+size;
    let entry=cache.get(key);
    if(!entry){
      const [x,y]=point(x0,y0);
      const radius=size*pixelScale;
      entry={x0,y0,failures:0,skip:0,
        primary:kernel.trace(run,x,y,false,radius),secondary:kernel.dual?kernel.trace(run,x,y,true,radius):null};
      if(cache.size>=limit)cache.delete(cache.keys().next().value);
      cache.set(key,entry);
    }
    return entry;
  }

  function sample(entry,px,py){
    const dx=(px-entry.x0)*pixelScale,dy=(py-entry.y0)*pixelScale;
    const primary=kernel.evaluate(entry.primary,dx,dy);
    if(!entry.secondary||!Number.isFinite(primary))return primary;
    return Math.min(primary,kernel.evaluate(entry.secondary,dx,dy));
  }
  return (x,y)=>{
    const reference=getReference(x,y,0);
    if(reference.skip>0){reference.skip--;return exact(x,y);}
    let value=sample(reference,x,y);
    if(!Number.isFinite(value))value=sample(getReference(x,y,studioTileSize/2),x,y);
    if(refineReference&&!Number.isFinite(value))value=sample(getReference(x,y,0,studioTileSize/4),x,y);
    if(Number.isFinite(value)){reference.failures=0;return value;}
    // Let sustained instability use the direct evaluator, then try again
    // as the renderer moves across the tile.
    if(++reference.failures>=patience){reference.skip=256;reference.failures=0;}
    return exact(x,y);
  };
}
