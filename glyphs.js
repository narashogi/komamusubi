"use strict";

// Rounded hand-lettering with prominent, rotation-independent puffed relief.
const KomaGlyphs = (() => {
  const masks = [], cache = new Map();
  const extraPlump = new Set([3,4,5,9]); // silver, gold, bishop, king
  // Lighter matching colors with a white reflection across the rounded crown.
  const palettes = [
    ["#d85d8a", "#ff9fc7", "#ffc1dd"],
    ["#d68d46", "#ffc484", "#ffdaa9"],
    ["#8cbb40", "#c8ee75", "#e0f8a5"],
    ["#47b59c", "#8deccf", "#b7f6e3"],
    ["#d2b039", "#ffe776", "#fff0a6"],
    ["#429fc6", "#88ddfa", "#b6edff"],
    ["#718cce", "#acc0ff", "#cbd8ff"],
    ["#a072ca", "#d5a5fa", "#e6c6ff"],
    ["#d85489", "#ff9fcc", "#ffc2df"],
    ["#d2ab30", "#ffe578", "#fff0aa"],
  ].map(colors => colors.map(color => [1,3,5].map(i=>parseInt(color.slice(i,i+2),16))));
  const ready = new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Kanji artwork could not be loaded"));
    image.onload = () => {
      for (const [x,y,w,h] of KomaPieceAtlas.glyphFrames) {
        const tile = document.createElement("canvas");tile.width=tile.height=256;
        const ctx=tile.getContext("2d",{willReadFrequently:true});
        const scale=232/Math.max(w,h);
        ctx.drawImage(image,x,y,w,h,(256-w*scale)/2,(256-h*scale)/2,w*scale,h*scale);
        const pixels=ctx.getImageData(0,0,256,256);
        // Add rounded stroke weight at atlas resolution, preserving enclosed
        // counters so complex kanji remain legible instead of becoming blobs.
        const alpha=new Uint8ClampedArray(256*256);
        for(let i=0;i<alpha.length;i++)alpha[i]=pixels.data[i*4+3];
        const outside=new Uint8Array(alpha.length), queue=[0];outside[0]=1;
        for(let q=0;q<queue.length;q++) {
          const i=queue[q],x=i%256,y=Math.floor(i/256);
          for(const n of [x>0?i-1:-1,x<255?i+1:-1,y>0?i-256:-1,y<255?i+256:-1]) {
            if(n>=0&&!outside[n]&&alpha[n]<128){outside[n]=1;queue.push(n);}
          }
        }
        const radius=extraPlump.has(masks.length)?6:3;
        for(let y=radius;y<256-radius;y++)for(let x=radius;x<256-radius;x++) {
          const i=y*256+x;
          if(alpha[i]<128&&!outside[i])continue;
          if(extraPlump.has(masks.length)&&alpha[i]<128) {
            // Retain narrow open channels between strokes while puffing their
            // outer contours, especially the metal radical in silver/gold.
            let left=false,right=false,above=false,below=false;
            for(let step=1;step<=12;step++) {
              left ||= x>=step&&alpha[i-step]>=128;
              right ||= x+step<256&&alpha[i+step]>=128;
              above ||= y>=step&&alpha[i-step*256]>=128;
              below ||= y+step<256&&alpha[i+step*256]>=128;
            }
            if((left&&right)||(above&&below)) {
              let touchesStroke=false;
              for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
                touchesStroke ||= alpha[i+dy*256+dx]>=128;
              if(!touchesStroke)continue;
            }
          }
          // Keep the original open slots between 龍's lower-right strokes.
          // Global thickening otherwise closes these narrow, exterior gaps.
          if(masks.length===8&&x>=148&&y>=125&&y<=205&&alpha[i]<255)continue;
          let value=alpha[i];
          for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++) {
            if(dx*dx+dy*dy<=radius*radius)value=Math.max(value,alpha[i+dy*256+dx]);
          }
          pixels.data[i*4+3]=value;
        }
        const distance=new Float32Array(256*256);
        for(let i=0;i<distance.length;i++)distance[i]=pixels.data[i*4+3]<128?0:256;
        for(let y=1;y<255;y++)for(let x=1;x<255;x++) {
          const i=y*256+x;
          distance[i]=Math.min(distance[i],distance[i-1]+1,distance[i-256]+1,
            distance[i-257]+Math.SQRT2,distance[i-255]+Math.SQRT2);
        }
        for(let y=254;y>0;y--)for(let x=254;x>0;x--) {
          const i=y*256+x;
          distance[i]=Math.min(distance[i],distance[i+1]+1,distance[i+256]+1,
            distance[i+255]+Math.SQRT2,distance[i+257]+Math.SQRT2);
        }
        masks.push({pixels,distance});
      }
      resolve();
    };
    image.src=KomaPieceAtlas.glyphUrl;
  });
  function draw(ctx,tier,width,height,top) {
    if(!masks[tier])return false;
    const key=tier;
    let tile=cache.get(key);
    if(!tile) {
      tile=document.createElement("canvas");tile.width=tile.height=256;
      const c=tile.getContext("2d"), {pixels,distance}=masks[tier];
      const out=c.createImageData(256,256);
      const [edge,body,highlight]=palettes[tier];
      for(let i=0;i<distance.length;i++) {
        out.data[i*4+3]=pixels.data[i*4+3];
        const d=distance[i];
        // Cel-style colored planes and crisp painted glints, not blurred gloss.
        const x=i%256,y=Math.floor(i/256);
        const facing=x>1&&x<254&&y>1&&y<254
          ? distance[i+2]-distance[i-2]+distance[i+512]-distance[i-512] : 0;
        const glint=d>=8.5&&d<=16.5&&facing>2.4;
        const tone=d<3?edge:d<12?body:highlight;
        for(let ch=0;ch<3;ch++) {
          out.data[i*4+ch]=glint?255:tone[ch];
        }
      }
      c.putImageData(out,0,0);cache.set(key,tile);
    }
    const glyphWidth=width*(extraPlump.has(tier)?.67:.63);
    const glyphHeight=width*.50;
    const edge=palettes[tier][0];
    ctx.save();ctx.shadowColor=`rgba(${edge.join(',')},.35)`;ctx.shadowBlur=Math.max(.5,width*.006);
    ctx.shadowOffsetX=ctx.shadowOffsetY=0;
    ctx.drawImage(tile,-glyphWidth/2,top+height*.34-glyphHeight/2,glyphWidth,glyphHeight);
    ctx.restore();return true;
  }
  return {ready,draw,get loaded(){return masks.length===10;}};
})();
