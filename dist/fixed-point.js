export const absBig = value => value < 0n ? -value : value;

export function fixedAngle(y,x) {
  const real=Number(x),imag=Number(y);
  if(Number.isFinite(real)&&Number.isFinite(imag))return Math.atan2(imag,real);
  // Both components share a fixed-point scale. Remove the same bits from
  // each magnitude to preserve the direction, including signed zero.
  const absX=absBig(x),absY=absBig(y);
  const shift=BigInt((absX>absY?absX:absY).toString(2).length-53);
  return Math.atan2((y<0n?-1:1)*Number(absY>>shift),(x<0n?-1:1)*Number(absX>>shift));
}

export function sqrtBig(value) {
  if (value < 2n) return value;
  let root = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
  for (;;) {
    const next = (root + value / root) >> 1n;
    if (next >= root) return root;
    root = next;
  }
}

export function fixedPoint(precision) {
  const bits = BigInt(precision);
  const one = 1n << bits;
  const mul = (a, b) => (a * b) >> bits;
  const div = (a, b) => (a << bits) / b;
  const toNumber = precision <= 960
    ? value => Number(value) / 2 ** precision
    : value => Number(value >> (bits - 64n)) / 2 ** 64;
  const sqrt = value => sqrtBig(value << bits);
  let halfPi,quarterPi;
  const angularChunkBits=10n;
  const angularMask=(1n<<angularChunkBits)-1n;
  const coarseShift=bits-angularChunkBits,fineShift=bits-2n*angularChunkBits;
  const coarseAngles=[],fineAngles=[],angularAnchors=[];
  const angularCacheMask=4095;
  let sinCoefficients,cosCoefficients;
  const expGuard=24n+BigInt(Math.ceil(Math.log2(Math.max(1,precision))));
  const expBits=bits+expGuard,expOne=1n<<expBits;
  const expCoarseShift=expBits-angularChunkBits,expFineShift=expBits-2n*angularChunkBits;
  const expCoarse=[],expFine=[],expAnchors=[];
  let ln2,expCoefficients;

  function arctanReciprocal(denominator) {
    const square = denominator * denominator;
    let term = one / denominator, sum = term;
    for (let n = 3n; term; n += 2n) {
      term = -term / square;
      sum += term / n;
    }
    return sum;
  }

  function reduceAngle(angle) {
    // Machin's formula, evaluated lazily at the same precision as the orbit.
    halfPi ??= 8n * arctanReciprocal(5n) - 2n * arctanReciprocal(239n);
    quarterPi ??= halfPi >> 1n;
    if(absBig(angle)<=quarterPi)return 0n;
    return (angle + (angle < 0n ? -quarterPi : quarterPi)) / halfPi;
  }

  function sinCosSeries(angle) {
    const square = -mul(angle, angle);
    let sin = angle, cos = one, sinTerm = angle, cosTerm = one;
    for (let n = 2n; sinTerm || cosTerm; n += 2n) {
      cosTerm = mul(cosTerm, square) / (n * (n - 1n));
      sinTerm = mul(sinTerm, square) / (n * (n + 1n));
      sin += sinTerm;
      cos += cosTerm;
    }
    return [sin,cos];
  }

  function sinCosRaw(angle) {
    const quadrant=reduceAngle(angle);
    const [sin,cos]=sinCosSeries(angle-quadrant*halfPi);
    switch (Number(quadrant&3n)) {
      case 1: return [cos, -sin];
      case 2: return [-sin, -cos];
      case 3: return [-cos, sin];
      default: return [sin, cos];
    }
  }

  function expSeries(value) {
    let sum=expOne,term=expOne;
    for (let n = 1n; term; n++) {
      term = ((term*value)>>expBits)/n;
      sum += term;
    }
    return sum;
  }

  function angularCoefficients() {
    sinCoefficients=[];
    cosCoefficients=[];
    let factorial=1n;
    for(let n=2n;;n++){
      factorial*=n;
      // The residual angle is below 2^-20. Stop once even the largest
      // possible contribution of the next term is below one fixed unit.
      if((one>>(2n*angularChunkBits*n))<factorial)break;
      const coefficient=one/factorial;
      (n&1n?sinCoefficients:cosCoefficients).push(n&2n?-coefficient:coefficient);
    }
  }

  function polynomial(square,coefficients) {
    let i=coefficients.length-1,value=coefficients[i]??0n;
    while(--i>=0)value=coefficients[i]+mul(square,value);
    return mul(square,value);
  }

  function angularAnchor(bucket) {
    const index=Number(bucket),slot=index&angularCacheMask;
    const cached=angularAnchors[slot];
    if(cached?.index===index)return cached;
    // Split the grid index into two smaller tables and compose their rotations.
    const coarseIndex=Number(bucket>>angularChunkBits),fineIndex=Number(bucket&angularMask);
    const [a,b]=coarseAngles[coarseIndex]??=sinCosSeries(BigInt(coarseIndex)<<coarseShift);
    const [c,d]=fineAngles[fineIndex]??=sinCosSeries(BigInt(fineIndex)<<fineShift);
    const anchor={index,sin:(a*d+b*c)>>bits,cos:(b*d-a*c)>>bits};
    angularAnchors[slot]=anchor;
    return anchor;
  }

  function trig(angle,pair) {
    const quadrant=reduceAngle(angle);
    let reduced=angle-quadrant*halfPi;
    const negative=reduced<0n;
    reduced=absBig(reduced);
    const bucket=reduced>>fineShift;
    const delta=reduced-(bucket<<fineShift);
    const anchor=angularAnchor(bucket);
    if(!sinCoefficients)angularCoefficients();
    const square=mul(delta,delta);
    const sinDelta=delta+mul(delta,polynomial(square,sinCoefficients));
    const cosCorrection=polynomial(square,cosCoefficients);
    const turn=Number(quadrant&3n);
    let sin=0n,cos=0n;
    if(pair||!(turn&1)){
      sin=anchor.sin+((anchor.sin*cosCorrection+anchor.cos*sinDelta)>>bits);
      if(negative)sin=-sin;
    }
    if(pair||(turn&1))cos=anchor.cos+((anchor.cos*cosCorrection-anchor.sin*sinDelta)>>bits);
    switch(turn){
      case 1: return pair?[cos,-sin]:cos;
      case 2: return pair?[-sin,-cos]:-sin;
      case 3: return pair?[-cos,sin]:-cos;
      default: return pair?[sin,cos]:sin;
    }
  }

  const sinCos=angle=>trig(angle,true);
  const sin=angle=>trig(angle,false);

  function prepareExp() {
    // ln(2) = 2 atanh(1/3). Keep extra bits through reduction and scaling.
    let sum=0n,term=expOne/3n;
    for(let n=1n;term;n+=2n){sum+=term/n;term/=9n;}
    ln2=2n*sum;
    expCoefficients=[expOne,expOne];
    let factorial=1n;
    for(let n=2n;;n++){
      factorial*=n;
      if((expOne>>(2n*angularChunkBits*n))<factorial)break;
      expCoefficients.push(expOne/factorial);
    }
  }

  function expAnchor(index) {
    const slot=index&angularCacheMask,cached=expAnchors[slot];
    if(cached?.index===index)return cached.value;
    const high=index>>Number(angularChunkBits),low=index&Number(angularMask);
    const a=expCoarse[high]??=expSeries(BigInt(high)<<expCoarseShift);
    const b=expFine[low]??=expSeries(BigInt(low)<<expFineShift);
    const value=(a*b)>>expBits;
    expAnchors[slot]={index,value};
    return value;
  }

  function exp(value) {
    if(!expCoefficients)prepareExp();
    const scaled=value<<expGuard;
    // Reduce to [0, ln(2)), then split into a table index and a small residual.
    let k=scaled/ln2,rest=scaled-k*ln2;
    if(rest<0n){k--;rest+=ln2;}
    if(k < -bits)return 0n;
    const bucket=rest>>expFineShift;
    const delta=rest-(bucket<<expFineShift);
    let i=expCoefficients.length-1,factor=expCoefficients[i];
    while(--i>=0)factor=expCoefficients[i]+((delta*factor)>>expBits);
    return (expAnchor(Number(bucket))*factor)>>(expBits+expGuard-k);
  }

  const sinCosTurn = (index, period) => {
    halfPi ??= 8n * arctanReciprocal(5n) - 2n * arctanReciprocal(239n);
    return sinCosRaw(4n * halfPi * BigInt(index) / BigInt(period));
  };
  return {bits, one, mul, div, sqrt, sin, sinCos, sinCosTurn, exp, toNumber};
}
