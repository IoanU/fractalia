import{palettes}from'./math.js';

// Convert cached escape values to RGBA. No fractal iteration is performed here.
// Write channels directly to avoid creating temporary arrays for every pixel.
export function colorize(values,max,palette,shift){
  const colors=palettes[palette]||palettes.aurora,count=colors.length,offset=shift/360;
  const pixels=new Uint8ClampedArray(values.length*4);
  for(let j=0,i=0;j<values.length;j++,i+=4){
    const n=values[j];pixels[i+3]=255;
    if(n>=max||!Number.isFinite(n)){pixels[i]=10;pixels[i+1]=14;pixels[i+2]=25;continue;}
    const position=n*.021+offset;let t=position-Math.trunc(position)+1;t-=Math.trunc(t);
    const p=t*count,k=Math.floor(p);let f=p-k;f=f*f*(3-2*f);
    const a=colors[k],b=colors[(k+1)%count];
    pixels[i]=Math.round(a[0]+(b[0]-a[0])*f);pixels[i+1]=Math.round(a[1]+(b[1]-a[1])*f);pixels[i+2]=Math.round(a[2]+(b[2]-a[2])*f);
  }
  return pixels;
}
