// Decimal fixed-point coordinates. Precision grows with the viewport, so zoom
// never stops at the precision limit of JavaScript's floating point numbers.
export function parseDecimal(value,digits){
  const m=String(value).trim().match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if(!m||!(m[2]||m[3]))throw Error('Enter a valid number.');
  const exponent=Number(m[4]||0);if(!Number.isSafeInteger(exponent)||Math.abs(exponent)>100000)throw Error('The exponent is too large for this session.');
  const raw=BigInt((m[2]||'0')+(m[3]||''));const shift=digits+exponent-(m[3]||'').length;
  return (m[1]==='-'?-1n:1n)*(shift>=0?raw*10n**BigInt(shift):raw/10n**BigInt(-shift));
}
export function decimal(value,digits){const n=BigInt(value),s=(n<0n?-n:n).toString().padStart(digits+1,'0');return(n<0n?'-':'')+s.slice(0,-digits)+'.'+s.slice(-digits);}
export function numeric(value,digits){const n=BigInt(value);if(n===0n)return 0;const s=(n<0n?-n:n).toString();return Number((n<0n?'-':'')+s.slice(0,16)+'e'+(s.length-Math.min(s.length,16)-digits));}
export function zoomLog(state){const s=BigInt(state.span).toString();return Math.log10(3.3)-(Math.log10(Number(s.slice(0,15)))+s.length-Math.min(s.length,15)-state.digits);}
export function ensurePrecision(state){while(BigInt(state.span).toString().length<25){state.digits+=20;state.cx=(BigInt(state.cx)*10n**20n).toString();state.cy=(BigInt(state.cy)*10n**20n).toString();state.span=(BigInt(state.span)*10n**20n).toString();}return state;}
export const palettes={aurora:[[12,17,33],[38,32,75],[107,69,125],[191,125,159],[247,193,157],[234,226,192],[104,134,160],[37,48,82]],ember:[[17,18,29],[77,31,63],[161,57,68],[239,115,75],[255,199,133],[245,223,180],[132,77,101]],ocean:[[7,19,38],[20,51,85],[31,113,139],[79,184,184],[182,228,207],[225,238,219],[67,135,154]],moss:[[14,31,29],[43,73,56],[104,132,71],[182,191,110],[248,231,178],[168,170,110],[63,101,78]],mono:[[12,18,25],[45,55,69],[106,121,137],[208,219,221],[247,246,230],[127,143,158]]};
export function colorAt(n,max,palette,shift){if(n>=max)return[10,14,25];let t=((n*.021+shift/360)%1+1)%1;const colors=palettes[palette]||palettes.aurora;let p=t*colors.length,k=Math.floor(p),f=p-k;f=f*f*(3-2*f);return colors[k].map((v,i)=>Math.round(v+(colors[(k+1)%colors.length][i]-v)*f));}
export function escapeFloat(cx,cy,max,type,jr,ji){let x=type==='julia'?cx:0,y=type==='julia'?cy:0,cr=type==='julia'?jr:cx,ci=type==='julia'?ji:cy,n=0,m=0;
  if(type==='mandelbrot'){let q=(cx-.25)**2+cy*cy;if(q*(q+cx-.25)<=.25*cy*cy||(cx+1)**2+cy*cy<=.0625)return max;}
  for(;n<max;n++){if(type==='ship'){x=Math.abs(x);y=Math.abs(y);}const nx=x*x-y*y+cr;y=2*x*y+ci;x=nx;m=x*x+y*y;if(m>256)return n+1-Math.log2(Math.log2(m)/2);}
  return max;
}
