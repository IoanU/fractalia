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
  let halfPi;
  const angularAnchors=new Map(),exponentialAnchors=new Map();
  const anchorBits=bits-12n;
  const maxAnchors=1024;

  function arctanReciprocal(denominator) {
    const square = denominator * denominator;
    let term = one / denominator, sum = term;
    for (let n = 3n; term; n += 2n) {
      term = -term / square;
      sum += term / n;
    }
    return sum;
  }

  function sinCosRaw(angle) {
    // Machin's formula, evaluated lazily at the same precision as the orbit.
    halfPi ??= 8n * arctanReciprocal(5n) - 2n * arctanReciprocal(239n);
    const quarter = halfPi >> 1n;
    const quadrant = (angle + (angle < 0n ? -quarter : quarter)) / halfPi;
    const reduced = angle - quadrant * halfPi;
    const square = -mul(reduced, reduced);
    let sin = reduced, cos = one, sinTerm = reduced, cosTerm = one;
    for (let n = 2n; sinTerm || cosTerm; n += 2n) {
      cosTerm = mul(cosTerm, square) / (n * (n - 1n));
      sinTerm = mul(sinTerm, square) / (n * (n + 1n));
      sin += sinTerm;
      cos += cosTerm;
    }
    switch (Number((quadrant % 4n + 4n) % 4n)) {
      case 1: return [cos, -sin];
      case 2: return [-sin, -cos];
      case 3: return [-cos, sin];
      default: return [sin, cos];
    }
  }

  function expRaw(value) {
    if (value < -(bits + 8n) * one) return 0n;
    // Reduce the argument before the Taylor series, then recover by squaring.
    let shifts = 0;
    const limit = one >> 4n;
    while (absBig(value) > limit) {
      value /= 2n;
      shifts++;
    }
    let sum = one, term = one;
    for (let n = 1n; term; n++) {
      term = mul(term, value) / n;
      sum += term;
    }
    while (shifts-- > 0) sum = mul(sum, sum);
    return sum;
  }

  function sinCos(angle) {
    const bucket=angle>>anchorBits;
    const delta=angle-(bucket<<anchorBits);
    if(delta===0n||absBig(angle)>32n*one)return sinCosRaw(angle);
    let anchor=angularAnchors.get(bucket);
    if(!anchor){
      if(angularAnchors.size>=maxAnchors)return sinCosRaw(angle);
      anchor=sinCosRaw(bucket<<anchorBits);
      angularAnchors.set(bucket,anchor);
    }
    const [sin,cos]=sinCosRaw(delta),[anchorSin,anchorCos]=anchor;
    return [mul(anchorSin,cos)+mul(anchorCos,sin),mul(anchorCos,cos)-mul(anchorSin,sin)];
  }

  function exp(value) {
    const bucket=value>>anchorBits;
    const delta=value-(bucket<<anchorBits);
    if(delta===0n||absBig(value)>32n*one)return expRaw(value);
    let anchor=exponentialAnchors.get(bucket);
    if(anchor===undefined){
      if(exponentialAnchors.size>=maxAnchors)return expRaw(value);
      anchor=expRaw(bucket<<anchorBits);
      exponentialAnchors.set(bucket,anchor);
    }
    return mul(anchor,expRaw(delta));
  }

  const sinCosTurn = (index, period) => {
    halfPi ??= 8n * arctanReciprocal(5n) - 2n * arctanReciprocal(239n);
    return sinCosRaw(4n * halfPi * BigInt(index) / BigInt(period));
  };
  return {bits, one, mul, div, sqrt, sinCos, sinCosTurn, exp, toNumber};
}
