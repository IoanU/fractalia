import {ensurePrecision} from './math.js';
import {minimumSpan} from './formulas.js';

export function selectionBounds(start,end,width,height){
  const clamp=(v,max)=>Math.max(0,Math.min(max,v));
  const x0=clamp(start.x,width),y0=clamp(start.y,height),x1=clamp(end.x,width),y1=clamp(end.y,height);
  return{x:Math.min(x0,x1),y:Math.min(y0,y1),width:Math.abs(x1-x0),height:Math.abs(y1-y0)};
}

// Fit the entire selection while preserving the complex plane's aspect ratio.
// Only screen fractions use Number; the deep-zoom coordinates remain BigInt.
export function selectedView(current,box,width,height){
  if(width<=0||height<=0||box.width<10||box.height<10)return null;
  const factor=Math.max(box.width/width,box.height/height);
  if(factor>=.995)return null;
  const next=ensurePrecision({...current}),span=BigInt(next.span),unit=1000000000n;
  const x=(box.x+box.width/2)/width-.5,y=(box.y+box.height/2-height/2)/width;
  next.cx=(BigInt(next.cx)+span*BigInt(Math.round(x*1e9))/unit).toString();
  next.cy=(BigInt(next.cy)+span*BigInt(Math.round(y*1e9))/unit).toString();
  const newSpan=span*BigInt(Math.round(factor*1e9))/unit;
  if(newSpan<minimumSpan(next))return null;
  next.span=newSpan.toString();
  return ensurePrecision(next);
}
