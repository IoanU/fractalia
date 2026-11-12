import {numeric} from './math.js';

const splitter=134217729;
const bits=new DataView(new ArrayBuffer(8));

function decimalPair(value,digits,unit){
  const high=Number(value+'e-'+digits);
  if(!high)return [0,0];
  bits.setFloat64(0,high);
  const raw=bits.getBigUint64(0),biasedExponent=Number(raw>>52n&2047n);
  const exponent=Math.max(1,biasedExponent)-1075;
  const mantissa=(raw&0xfffffffffffffn)|(biasedExponent?0x10000000000000n:0n);
  const unsigned=exponent>=0?mantissa*unit<<BigInt(exponent):mantissa*unit>>BigInt(-exponent);
  const residual=value-(high<0?-unsigned:unsigned);
  return [high,numeric(residual,digits)];
}

function productError(hiA,loA,hiB,loB,rounded){
  return ((hiA*hiB-rounded)+hiA*loB+loA*hiB)+loA*loB;
}

function sumError(a,b,sum){
  const roundedB=sum-a;
  return (a-(sum-roundedB))+(b-roundedB);
}

// Expand the perturbation in the normalized pixel offset through degree four.
// Share a prefix only while the omitted terms stay small across the raster.
export function mandelbrotPrefix({re,im,last},radius){
  const degree=4;
  let real=new Float64Array(degree+1),imag=new Float64Array(degree+1);
  let nextReal=new Float64Array(degree+1),nextImag=new Float64Array(degree+1);
  let sizes=new Float64Array(degree+1),nextSizes=new Float64Array(degree+1);
  let error=0,bound=0,iteration=0;
  for(let n=0;n<last-1;n++){
    const x=2*re[n],y=2*im[n];
    for(let k=1;k<=degree;k++){
      nextReal[k]=x*real[k]-y*imag[k]+(k===1?radius:0);
      nextImag[k]=x*imag[k]+y*real[k];
    }
    let omitted=0;
    for(let a=1;a<=degree;a++)for(let b=1;b<=degree;b++){
      if(a+b>degree)omitted+=sizes[a]*sizes[b];
      else{
        nextReal[a+b]+=real[a]*real[b]-imag[a]*imag[b];
        nextImag[a+b]+=real[a]*imag[b]+imag[a]*real[b];
      }
    }
    const linear=Math.hypot(x,y);
    const nextError=(linear+2*bound+error)*error+omitted+2e-15*(linear*bound+bound*bound+radius);
    let nextBound=0;
    for(let k=1;k<=degree;k++){
      nextSizes[k]=Math.hypot(nextReal[k],nextImag[k]);
      nextBound+=nextSizes[k];
    }
    if(!(nextError<=nextBound*1e-12&&nextBound+nextError<.01
      &&Math.hypot(re[n+1],im[n+1])+nextBound+nextError<16))break;
    [real,nextReal]=[nextReal,real];[imag,nextImag]=[nextImag,imag];
    [sizes,nextSizes]=[nextSizes,sizes];
    bound=nextBound;error=nextError;iteration=n+1;
  }
  return iteration>=8?{real,imag,error,iteration,radius}:null;
}

// Use two doubles per coordinate and orbit component. If error amplification
// exhausts their working precision, restart that pixel at the requested precision.
export function mandelbrotDoubleDouble({cx,cy,span,digits,width,height,max,fallback}){
  const unit=10n**BigInt(digits),denominator=2n*BigInt(width),columns=new Map(),rows=new Map();
  const coordinate=(center,offset)=>decimalPair(center+span*BigInt(offset)/denominator,digits,unit);
  return (px,py)=>{
    if(!columns.has(px))columns.set(px,coordinate(cx,2*px-width));
    if(!rows.has(py))rows.set(py,coordinate(cy,2*py-height));
    const [cr,crLow]=columns.get(px),[ci,ciLow]=rows.get(py);
    let x=0,y=0,xLow=0,yLow=0,error=0;
    for(let n=0;n<max;n++){
      const splitX=x*splitter,splitY=y*splitter;
      const hx=splitX-(splitX-x),hy=splitY-(splitY-y),lx=x-hx,ly=y-hy;
      const xx=x*x,yy=y*y,xy=x*y;
      const xxLow=productError(hx,lx,hx,lx,xx)+2*x*xLow;
      const yyLow=productError(hy,ly,hy,ly,yy)+2*y*yLow;
      const xyLow=productError(hx,lx,hy,ly,xy)+x*yLow+y*xLow;
      const real=xx-yy,imag=2*xy;
      const nextX=real+cr,nextY=imag+ci;
      const tailX=sumError(real,cr,nextX)+sumError(xx,-yy,real)+xxLow-yyLow+crLow;
      const tailY=sumError(imag,ci,nextY)+2*xyLow+ciLow;
      x=nextX+tailX;y=nextY+tailY;
      xLow=sumError(nextX,tailX,x);yLow=sumError(nextY,tailY,y);
      error=2*Math.sqrt(xx+yy)*error+1e-29;
      if(error>1e-9)return fallback(px,py);
      const magnitude=x*x+y*y;
      if(magnitude>256)return n+1-Math.log2(Math.log2(magnitude)/2);
    }
    return max;
  };
}
