import{numeric,parseDecimal,escapeFloat,zoomLog}from'./math.js';
import{firstLaneRow,panStrips}from'./render-cache.js';
import{classicRecipe,compileRecipe,normalizeRecipe}from'./formulas.js';
import{compileBoundedRecipe}from'./orbit-bounds.js';
import{analyticJulia}from'./analytic-julia.js';
import{preciseRecipe}from'./precise-formulas.js';
import{studioPerturbation,studioTileSize}from'./studio-perturbation.js';
import{mandelbrotDoubleDouble,mandelbrotPrefix}from'./mandelbrot-precision.js';
self.onmessage=({data:d})=>{
  try{render(d);}catch(error){postMessage({error:error.message,id:d.id});}
};
function render(d){
  const studioView=d.state.type==='studio';
  const classic=studioView?classicRecipe(normalizeRecipe(d.state.recipe)):null;
  const s=classic?{...d.state,...classic}:d.state;
  const W=d.width,H=d.height,max=d.iterations,p=s.digits,S=10n**BigInt(p),grid=d.grid??{cx:s.cx,cy:s.cy,x:0,y:0},cx=BigInt(grid.cx),cy=BigInt(grid.cy),span=BigInt(s.span),scale=numeric(span,p),cxn=numeric(cx,p),cyn=numeric(cy,p);
  const studio=s.type==='studio',depth=zoomLog(s);
  const deep=depth>11||studioView&&scale/W<=128*Number.EPSILON*Math.max(1,Math.abs(cxn),Math.abs(cyn));
  const custom=studio&&!deep?compileRecipe(s.recipe,max):null;
  let preciseSample,preciseRegion,studioTiles=false;
  if(deep&&(studio||s.type==='ship')){
    // Keep at least 32 decimal guard digits beyond the pixel spacing.
    const precision=Math.ceil((depth+Math.log10(W)+32)*Math.log2(10));
    const fixedUnit=1n<<BigInt(precision),denom=2n*BigInt(W),pixelUnit=span*fixedUnit;
    const divisor=denom*S,originX=cx*fixedUnit*denom,originY=cy*fixedUnit*denom;
    const columns=new Map(),rows=new Map();
    const recipe=normalizeRecipe(studio?s.recipe:{steps:[{formula:'ship'}]});
    const evaluate=preciseRecipe(recipe,max,precision);
    function fixedCoordinates(px,py){
      if(!columns.has(px))columns.set(px,(originX+BigInt(2*px-W)*pixelUnit)/divisor);
      if(!rows.has(py))rows.set(py,(originY+BigInt(2*py-H)*pixelUnit)/divisor);
    }
    const point=(px,py)=>{
      fixedCoordinates(px,py);
      return [columns.get(px),rows.get(py)];
    };
    const exactRecipe=(px,py)=>{
      fixedCoordinates(px,py);
      return evaluate(columns.get(px),rows.get(py));
    };
    const step=recipe.steps[0];
    const eligible=scale>1e-250&&recipe.mode==='orbit'&&recipe.steps.length===1&&recipe.coloring==='escape'
      &&(recipe.seed==='auto'||recipe.seed==='pixel')&&step.julia&&!step.drift&&['sine','exp'].includes(step.formula);
    const fallback=studio?exactRecipe:exact;
    studioTiles=!eligible&&scale>1e-250;
    preciseSample=eligible?analyticJulia({recipe,precision,max,width:W,scale,point,exact:fallback})
      :studioTiles?studioPerturbation({recipe,precision,max,pixelScale:scale/W,point,evaluate,exact:fallback}):fallback;
    if(evaluate.region&&(!eligible||depth>=16))preciseRegion=(px,py,radius)=>{
      fixedCoordinates(px,py);
      return evaluate.region(columns.get(px),rows.get(py),radius);
    };
  }
  const jr=parseDecimal(s.jr,p),ji=parseDecimal(s.ji,p),limit=256n*S*S;
  const denominator=2n*BigInt(W);
  function exact(px,py){
    let cr=cx+span*BigInt(2*px-W)/denominator,ci=cy+span*BigInt(2*py-H)/denominator;
    let x=s.type==='julia'?cr:0n,y=s.type==='julia'?ci:0n;if(s.type==='julia'){cr=jr;ci=ji;}
    for(let n=0;n<max;n++){if(s.type==='ship'){if(x<0n)x=-x;if(y<0n)y=-y;}const xx=x*x,yy=y*y;const nx=(xx-yy)/S+cr;y=2n*x*y/S+ci;x=nx;const mag=x*x+y*y;if(mag>limit){let m=numeric(mag,2*p);return n+1-Math.log2(Math.log2(m)/2);}}return max;
  }
  // Two doubles provide roughly 31 decimal digits near one. Use this path
  // only while it leaves several digits of headroom at the pixel spacing.
  const recoverMandelbrot=deep&&s.type==='mandelbrot'&&scale/W>1e-26&&Math.abs(cxn)+Math.abs(cyn)<8
    ?mandelbrotDoubleDouble({cx,cy,span,digits:p,width:W,height:H,max,fallback:exact})
    :exact;
  function referenceOrbit(ox,oy,cr,ci,x=0n,y=0n){
    const re=new Float64Array(max+1),im=new Float64Array(max+1);
    let last=0;
    re[0]=numeric(x,p);im[0]=numeric(y,p);
    for(let n=1;n<=max;n++){
      const nx=(x*x-y*y)/S+cr;
      y=2n*x*y/S+ci;x=nx;
      re[n]=Number(x+'e-'+p);im[n]=Number(y+'e-'+p);last=n;
      if(x*x+y*y>limit)break;
    }
    const reference={re,im,last,ox,oy};
    if(s.type==='mandelbrot')reference.prefix=mandelbrotPrefix(reference,scale*Math.max(1,H/W));
    return reference;
  }
  // A high-precision reference orbit keeps pixel offsets distinct below 1e-16.
  let orbit=null;
  if(deep&&!studio&&s.type!=='ship'&&scale>1e-250){
    if(s.type==='julia')orbit=referenceOrbit(0,0,jr,ji,cx,cy);
    else orbit=referenceOrbit(0,0,cx,cy);
  }
  let alternateOrbit,needsVerification;
  function perturbMandelbrotOrbit(px,py,current,trackError){
    const {re,im,last,ox,oy,prefix}=current;
    const cr=(2*px-W)/(2*W)*scale-ox,ci=(2*py-H)/(2*W)*scale-oy;
    let dx=0,dy=0,reference=0,error=0,previousMagnitude=0;
    if(prefix){
      const ur=cr/prefix.radius,ui=ci/prefix.radius;
      if(ur*ur+ui*ui<=1){
        for(let k=prefix.real.length-1;k>=1;k--){
          const next=dx*ur-dy*ui+prefix.real[k];
          dy=dx*ui+dy*ur+prefix.imag[k];dx=next;
        }
        const next=dx*ur-dy*ui;
        dy=dx*ui+dy*ur;dx=next;
        reference=prefix.iteration;error=prefix.error;
        previousMagnitude=(re[reference]+dx)**2+(im[reference]+dy)**2;
      }
    }
    const offsetMagnitude=Math.abs(cr)+Math.abs(ci);
    for(let n=reference;n<max;n++){
      const x=re[reference],y=im[reference];
      const next=2*(x*dx-y*dy)+dx*dx-dy*dy+cr;
      dy=2*(x*dy+y*dx)+2*dx*dy+ci;dx=next;
      reference++;
      const ax=re[reference]+dx,ay=im[reference]+dy,m=ax*ax+ay*ay;
      const delta=dx*dx+dy*dy;
      if(trackError&&error){
        // Track rounding from reconstructing the orbit at a rebase. Only
        // recompute pixels whose subsequent orbit amplifies that error.
        error=(2*Math.sqrt(previousMagnitude)+error)*error+1e-14*(Math.sqrt(delta)+offsetMagnitude);
        if(error>1e-8){needsVerification=true;trackError=false;}
      }
      if(m>256)return n+1-Math.log2(Math.log2(m)/2);
      if(m<delta||reference===last){
        // Rebase at z = 0, keeping the pixel's actual iteration and parameter.
        if(m<delta*1e-16)return NaN;
        if(trackError)error+=1e-14*(Math.sqrt(m)+Math.sqrt(delta));
        dx=ax;dy=ay;reference=0;
      }
      previousMagnitude=m;
    }
    return max;
  }
  function perturbMandelbrot(px,py){
    needsVerification=false;
    const value=perturbMandelbrotOrbit(px,py,orbit,true);
    if(Number.isNaN(value))return recoverMandelbrot(px,py);
    if(!needsVerification)return value;
    // Two independent references can validate a pixel much more cheaply than
    // restarting its entire orbit at higher precision.
    if(!alternateOrbit){
      const x=span/5n,y=-span/7n;
      alternateOrbit=referenceOrbit(numeric(x,p),numeric(y,p),cx+x,cy+y);
    }
    const second=perturbMandelbrotOrbit(px,py,alternateOrbit,false);
    if((value===max)===(second===max)&&Math.abs(value-second)<1e-4)return value;
    return recoverMandelbrot(px,py);
  }
  function perturbJulia(px,py){
    const {re,im,last}=orbit;
    let dx=(px/W-.5)*scale,dy=(py-H/2)/W*scale;
    for(let n=0;n<max;n++){
      if(n>=last)return exact(px,py);
      const x=re[n],y=im[n],nx=2*(x*dx-y*dy)+dx*dx-dy*dy;dy=2*(x*dy+y*dx)+2*dx*dy;dx=nx;
      const rx=re[n+1],ry=im[n+1],ax=rx+dx,ay=ry+dy,m=ax*ax+ay*ay;
      if(m>256)return n+1-Math.log2(Math.log2(m)/2);
      if(m<1e-7*(rx*rx+ry*ry))return exact(px,py);
    }return max;
  }
  const deepSample=preciseSample??(orbit?(s.type==='mandelbrot'?perturbMandelbrot:perturbJulia):exact);
  function sample(x,y){
    const px=x+grid.x,py=y+grid.y;
    if(deep)return deepSample(px,py);
    const real=cxn+(px/W-.5)*scale,imag=cyn+(py-H/2)/W*scale;
    return custom?custom(real,imag):escapeFloat(real,imag,max,s.type,s.jr,s.ji);
  }
  const lane=d.lane??0,lanes=d.lanes??1;
  const bounded=depth>=7&&W*H>=10000?compileBoundedRecipe(studio?s.recipe:{steps:[{
    formula:s.type==='ship'?'ship':'z2',julia:s.type==='julia',re:s.jr,im:s.ji
  }]},max):null;
  const countRows=(first,end)=>Math.max(0,Math.ceil((end-first)/lanes));
  function fillBand(values,offset,left,right,first,end,step){
    const width=right-left;
    if(!studioTiles){fillTile(left,right,first,end);return;}
    // Finish each reference tile while its orbit is in the cache. Align to
    // the shared sampling grid so pan strips use the same reference centers.
    function tileEnd(index,shift,stride){
      const coordinate=(index+.5)*step+shift;
      const boundary=(Math.floor(coordinate/studioTileSize)+1)*studioTileSize;
      return index+stride*Math.ceil((boundary-coordinate)/(stride*step));
    }
    for(let y=first;y<end;){
      const bottom=Math.min(end,tileEnd(y,grid.y,lanes));
      for(let x=left;x<right;){
        const edge=Math.min(right,tileEnd(x,grid.x,1));
        fillTile(x,edge,y,bottom);
        x=edge;
      }
      y=bottom;
    }
    function fillTile(tileLeft,tileRight,top,bottom){
      if(!bounded){
        for(let y=top;y<bottom;y+=lanes){
          const start=offset+(y-first)/lanes*width-left;
          for(let x=tileLeft;x<tileRight;x++)values[start+x]=sample((x+.5)*step,(y+.5)*step);
        }
        return;
      }
      const columnBlock=16,rowBlock=4*lanes;
      for(let y=top;y<bottom;y+=rowBlock){
        const blockEnd=Math.min(bottom,y+rowBlock),rows=countRows(y,blockEnd),lastY=y+(rows-1)*lanes;
        const midY=(y+lastY+1)*step/2+grid.y;
        for(let x=tileLeft;x<tileRight;x+=columnBlock){
          const blockRight=Math.min(tileRight,x+columnBlock);
          const midX=(x+blockRight)*step/2+grid.x;
          const real=cxn+(midX/W-.5)*scale,imag=cyn+(midY-H/2)/W*scale;
          const radius=Math.hypot(blockRight-x-1,lastY-y)*step*scale/(2*W);
          let value=bounded(real,imag,radius);
          if(!Number.isFinite(value)&&preciseRegion)value=preciseRegion(midX,midY,radius);
          for(let row=y;row<blockEnd;row+=lanes){
            const start=offset+(row-first)/lanes*width+x-left;
            if(Number.isFinite(value))values.fill(value,start,start+blockRight-x);
            else for(let col=x;col<blockRight;col++)values[start+col-x]=sample((col+.5)*step,(row+.5)*step);
          }
        }
      }
    }
  }
  const start=performance.now();
  if(d.pan){
    const strips=panStrips(W,H,d.pan.dx,d.pan.dy).map(strip=>{
      const first=firstLaneRow(strip.y,lane,lanes),end=strip.y+strip.height;
      return {...strip,first,end,count:countRows(first,end)*strip.width};
    });
    const values=new Float64Array(strips.reduce((total,strip)=>total+strip.count,0));
    let offset=0;
    for(const {x,width,first,end,count} of strips){
      fillBand(values,offset,x,x+width,first,end,1);
      offset+=count;
    }
    postMessage({id:d.id,width:W,height:H,values,step:1,done:true,elapsed:Math.round(performance.now()-start),deep},[values.buffer]);
    return;
  }
  const steps=deep?[12,4,1]:[6,2,1];
  for(const [index,step] of steps.entries()){
    const w=Math.ceil(W/step),h=Math.ceil(H/step);
    const values=new Float64Array(w*countRows(lane,h));
    fillBand(values,0,0,w,lane,h,step);
    const done=step===1;
    const progress=done?100:Math.round(80*(index+1)/(steps.length-1));
    postMessage({id:d.id,width:w,height:h,values,step,done,progress,elapsed:Math.round(performance.now()-start),deep},[values.buffer]);
  }
}
