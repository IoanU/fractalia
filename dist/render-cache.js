// Palette, phase, names and layout do not affect mathematical escape values.
export function renderKey(state,iterations){
  return JSON.stringify([state.type,state.digits,state.cx,state.cy,state.span,state.jr,state.ji,iterations]);
}

// Cover the screen with either panel layout, before fullscreen is ever opened.
// Extra vertical coverage is cropped at display time, keeping both axes uniform.
export function rasterPlan({width,height,screenWidth,screenHeight,dpr=1,panelWidth=244}){
  const fullWidth=Math.max(width,screenWidth||width);
  const fullHeight=Math.max(height,screenHeight||height);
  const panel=fullWidth>720?Math.min(panelWidth,fullWidth/2):0;
  const aspect=Math.max(height/width,fullHeight/(fullWidth-panel));
  const rasterWidth=Math.max(1,Math.ceil(fullWidth*dpr));
  return{width:rasterWidth,height:Math.max(1,Math.ceil(rasterWidth*aspect))};
}

export function framePlacement(frame,width,height){
  const visibleHeight=frame.width*height/width;
  if(visibleHeight<=frame.height){
    return{sx:0,sy:(frame.height-visibleHeight)/2,sw:frame.width,sh:visibleHeight,dx:0,dy:0,dw:width,dh:height};
  }
  // A radically narrower resized window can exceed the screen's planned field.
  // Keep geometry intact until the next view render rather than stretch pixels.
  const drawnHeight=frame.height*width/frame.width;
  return{sx:0,sy:0,sw:frame.width,sh:frame.height,dx:0,dy:(height-drawnHeight)/2,dw:width,dh:drawnHeight};
}

export class RenderCache{
  constructor({maxEntries=3,maxBytes=96*1024*1024}={}){this.maxEntries=maxEntries;this.maxBytes=maxBytes;this.entries=new Map();this.bytes=0;}
  get(key){const frame=this.entries.get(key);if(frame){this.entries.delete(key);this.entries.set(key,frame);}return frame;}
  set(key,frame){
    const existing=this.entries.get(key);if(existing){this.bytes-=this.sizeOf(existing);this.entries.delete(key);if(existing!==frame)this.release(existing);}
    this.entries.set(key,frame);this.bytes+=this.sizeOf(frame);
    while(this.entries.size>1&&(this.entries.size>this.maxEntries||this.bytes>this.maxBytes)){
      const oldest=this.entries.keys().next().value,entry=this.entries.get(oldest);
      this.entries.delete(oldest);this.bytes-=this.sizeOf(entry);this.release(entry);
    }
  }
  sizeOf(frame){return frame.width*frame.height*4+(frame.field?.byteLength||0);}
  release(frame){frame.width=0;frame.height=0;frame.field=null;}
}
