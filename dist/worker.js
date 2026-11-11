import{numeric,parseDecimal,escapeFloat,zoomLog}from'./math.js';
import{panOverlap}from'./render-cache.js';
self.onmessage=({data:d})=>{
  try{render(d);}catch(error){postMessage({error:error.message,id:d.id});}
};
function render(d){
  const s=d.state,W=d.width,H=d.height,max=d.iterations,p=s.digits,S=10n**BigInt(p),grid=d.grid??{cx:s.cx,cy:s.cy,x:0,y:0},cx=BigInt(grid.cx),cy=BigInt(grid.cy),span=BigInt(s.span),scale=numeric(span,p),cxn=numeric(cx,p),cyn=numeric(cy,p),deep=zoomLog(s)>11;
  const jr=parseDecimal(s.jr,p),ji=parseDecimal(s.ji,p),limit=256n*S*S;
  function exact(px,py){
    let cr=cx+span*BigInt(Math.round((px/W-.5)*1e9))/1000000000n,ci=cy+span*BigInt(Math.round((py-H/2)/W*1e9))/1000000000n;
    let x=s.type==='julia'?cr:0n,y=s.type==='julia'?ci:0n;if(s.type==='julia'){cr=jr;ci=ji;}
    for(let n=0;n<max;n++){if(s.type==='ship'){if(x<0n)x=-x;if(y<0n)y=-y;}const xx=x*x,yy=y*y;const nx=(xx-yy)/S+cr;y=2n*x*y/S+ci;x=nx;const mag=x*x+y*y;if(mag>limit){let m=numeric(mag,2*p);return n+1-Math.log2(Math.log2(m)/2);}}return max;
  }
  // A high-precision reference orbit keeps pixel offsets distinct below 1e-16.
  let orbit=null;
  if(deep&&s.type!=='ship'&&scale>1e-250){
    orbit=[];let x=s.type==='julia'?cx:0n,y=s.type==='julia'?cy:0n,cr=s.type==='julia'?jr:cx,ci=s.type==='julia'?ji:cy;
    orbit.push([numeric(x,p),numeric(y,p)]);
    for(let n=0;n<max;n++){const nx=(x*x-y*y)/S+cr;y=2n*x*y/S+ci;x=nx;orbit.push([numeric(x,p),numeric(y,p)]);if(x*x+y*y>limit)break;}
  }
  function perturb(px,py){
    const ox=(px/W-.5)*scale,oy=(py-H/2)/W*scale,cr=s.type==='julia'?0:ox,ci=s.type==='julia'?0:oy;let dx=s.type==='julia'?ox:0,dy=s.type==='julia'?oy:0;
    for(let n=0;n<max;n++){
      if(n+1>=orbit.length)return exact(px,py);
      const [x,y]=orbit[n],nx=2*(x*dx-y*dy)+dx*dx-dy*dy+cr;dy=2*(x*dy+y*dx)+2*dx*dy+ci;dx=nx;
      const [rx,ry]=orbit[n+1],ax=rx+dx,ay=ry+dy,m=ax*ax+ay*ay;
      if(m>256)return n+1-Math.log2(Math.log2(m)/2);
      if(m<1e-7*(rx*rx+ry*ry))return exact(px,py);
    }return max;
  }
  function sample(x,y){
    const px=x+grid.x,py=y+grid.y;
    if(deep)return orbit?perturb(px,py):exact(px,py);
    return escapeFloat(cxn+(px/W-.5)*scale,cyn+(py-H/2)/W*scale,max,s.type,s.jr,s.ji);
  }
  const start=performance.now();
  if(d.pan){
    const {left,right,top,bottom}=panOverlap(W,H,d.pan.dx,d.pan.dy);
    const values=new Float64Array(W*H-(right-left)*(bottom-top));
    let index=0;
    for(let y=0;y<H;y++){
      const overlaps=y>=top&&y<bottom;
      const firstEnd=overlaps?left:W;
      for(let x=0;x<firstEnd;x++)values[index++]=sample(x+.5,y+.5);
      if(overlaps)for(let x=right;x<W;x++)values[index++]=sample(x+.5,y+.5);
    }
    postMessage({id:d.id,width:W,height:H,values,step:1,done:true,elapsed:Math.round(performance.now()-start),deep},[values.buffer]);
    return;
  }
  const steps=deep?[12,5,2,1]:[6,2,1];
  for(const step of steps){const w=Math.ceil(W/step),h=Math.ceil(H/step),values=new Float64Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)values[y*w+x]=sample((x+.5)*step,(y+.5)*step);
    postMessage({id:d.id,width:w,height:h,values,step,done:step===1,elapsed:Math.round(performance.now()-start),deep},[values.buffer]);
  }
}
