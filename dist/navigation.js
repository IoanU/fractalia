export function wheelZoomFactor(delta,mode,height){
  if(!Number.isFinite(delta)||!delta)return 1;
  const pixels=delta*(mode===1?16:mode===2?height:1);
  return Math.exp(Math.max(-180,Math.min(180,pixels))*.0025);
}

export function projectView(source,view){
  if(!source?.width||!source.height||!source.view)return null;
  const from=source.view;
  if(!['type','jr','ji'].every(key=>from[key]===view[key]))return null;
  if(view.type==='studio'&&JSON.stringify(from.recipe)!==JSON.stringify(view.recipe))return null;
  const digits=Math.max(from.digits,view.digits),a=10n**BigInt(digits-from.digits),b=10n**BigInt(digits-view.digits);
  const span=BigInt(view.span)*b,ratio=value=>Number(value*1000000000n/span)/1e9;
  // Normalize differences before converting to Number, even when span underflows Float64.
  return {source,scale:ratio(BigInt(from.span)*a),
    x:ratio(BigInt(from.cx)*a-BigInt(view.cx)*b),y:ratio(BigInt(from.cy)*a-BigInt(view.cy)*b)};
}

function bands(origin,size,limit,samples){
  const start=Math.max(0,origin),end=Math.min(limit,origin+size);
  const result=[];
  // Stretch a downsampled edge over the unknown strip, keeping the overlap sharp.
  if(start>0)result.push({at:0,size:start,from:0,count:1,edge:true});
  result.push({at:start,size:end-start,from:(start-origin)/size*samples,count:(end-start)/size*samples});
  if(end<limit)result.push({at:end,size:limit-end,from:samples-1,count:1,edge:true});
  return result;
}

export function paintNavigation(ctx,preview,proxy,width,height){
  const {source,scale,x,y}=preview,dw=width*scale,dh=dw*source.height/source.width;
  const left=(width-dw)/2+x*width,top=(height-dh)/2+y*width;
  if(!Number.isFinite(left+top+dw+dh)||dw<=0||dh<=0||left>=width||top>=height||left+dw<=0||top+dh<=0){
    ctx.drawImage(proxy,0,0,width,height);
    return;
  }
  if(left>0||top>0||left+dw<width||top+dh<height){
    const columns=bands(left,dw,width,proxy.width),rows=bands(top,dh,height,proxy.height);
    for(const row of rows)for(const col of columns){
      if(row.edge||col.edge)ctx.drawImage(proxy,col.from,row.from,col.count,row.count,col.at,row.at,col.size,row.size);
    }
  }
  ctx.drawImage(source,left,top,dw,dh);
}
