"use strict";

// Fit the reference artwork to the existing silhouette; never change collisions.
const KomaSprites = (() => {
  const sprites = [];
  const ratio = 32.3 / 28.6;
  const shoulderX = (.5 - ratio * Math.tan(Math.PI / 20)) / (1 - Math.tan(Math.PI / 10) * Math.tan(Math.PI / 20));
  const shoulderY = shoulderX * Math.tan(Math.PI / 10) / ratio;
  function roundAndBevel(tile, tier) {
    const ctx = tile.getContext("2d", { willReadFrequently: true });
    const w = tile.width, h = tile.height;
    const smallPiece = tier <= 2;
    const softSmallPiece = tier <= 1;
    const points = [{x:w/2,y:0},{x:w/2+shoulderX*w,y:shoulderY*h},
      {x:w,y:h},{x:0,y:h},{x:w/2-shoulderX*w,y:shoulderY*h}];
    // Round only the corners of the 144/117/81-degree reference polygon.
    // The flat face and its expression remain the original artwork.
    ctx.save(); ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.moveTo((points[4].x+points[0].x)/2,(points[4].y+points[0].y)/2);
    points.forEach((p,i) => {
      const next = points[(i+1)%points.length];
      ctx.arcTo(p.x,p.y,next.x,next.y,w*(smallPiece ? .18 : .12));
    });
    ctx.closePath(); ctx.fill(); ctx.restore();
    // Smooth, direction-independent rounded rim; no painted white edge lines.
    const frame = ctx.getImageData(0,0,w,h), px = frame.data;
    const distance = new Float32Array(w*h);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      const i=y*w+x;
      distance[i] = px[i*4+3]<128 ? 0 : Math.min(x+1,y+1,w-x,h-y);
    }
    for(let y=1;y<h;y++) for(let x=1;x<w-1;x++) {
      const i=y*w+x;
      distance[i]=Math.min(distance[i],distance[i-1]+1,distance[i-w]+1,
        distance[i-w-1]+Math.SQRT2,distance[i-w+1]+Math.SQRT2);
    }
    for(let y=h-2;y>=0;y--) for(let x=w-2;x>0;x--) {
      const i=y*w+x;
      distance[i]=Math.min(distance[i],distance[i+1]+1,distance[i+w]+1,
        distance[i+w-1]+Math.SQRT2,distance[i+w+1]+Math.SQRT2);
    }
    for(let i=0;i<distance.length;i++) {
      if(!px[i*4+3]) continue;
      const d=distance[i]/w;
      // Broader, brighter curved bevel. Pawn/lance use an open, gradual rolloff
      // rather than a narrow white ring at their small on-screen size.
      const light=softSmallPiece
        ? .34*(1-Math.exp(-d/.018))*Math.exp(-Math.pow(d/.105,2))
        : (smallPiece ? .54 : .52)*Math.exp(-Math.pow(
          (d-(smallPiece ? .055 : .041))/(smallPiece ? .045 : .035),2));
      const shade=softSmallPiece ? .22*Math.exp(-d/.035)
        : .26*Math.exp(-d/(smallPiece ? .016 : .011));
      for(let c=0;c<3;c++) px[i*4+c]*=1-shade;
      if(softSmallPiece) {
        // Brighten the pink/orange material without whitening the rim or eyes.
        const peak=Math.max(px[i*4],px[i*4+1],px[i*4+2]);
        const strength=Math.max(0,Math.min(1,(peak-90)/100));
        const brighter=Math.min(255,peak+30*strength);
        const saturation=(1+.30*strength)*brighter/Math.max(1,peak);
        for(let c=0;c<3;c++)px[i*4+c]=brighter-(peak-px[i*4+c])*saturation;
      }
      if(tier===8) {
        // Pale cherry-blossom material; retain the dark face and rosy cheeks.
        const r=px[i*4],g=px[i*4+1],b=px[i*4+2];
        if(r>g*1.2&&b>g*1.12&&b>r*.48) {
          const mix=.44*Math.max(0,Math.min(1,(g-35)/55));
          for(let c=0;c<3;c++)px[i*4+c]=px[i*4+c]*(1-mix)+[255,229,241][c]*mix;
        }
      } else if(tier===9) {
        // Champagne gold distinguishes the royal piece from the yellow gold.
        const r=px[i*4],g=px[i*4+1],b=px[i*4+2];
        const mix=.28*Math.max(0,Math.min(1,(r-140)/70))
          *Math.max(0,Math.min(1,(g/Math.max(1,r)-.60)/.20))
          *Math.max(0,Math.min(1,(.75-b/Math.max(1,r))/.20));
        for(let c=0;c<3;c++)px[i*4+c]=px[i*4+c]*(1-mix)+[255,243,184][c]*mix;
      }
      // Apply the white bevel after material tint so pink/orange stay vivid
      // on the flat face while the curved rim keeps its white reflection.
      for(let c=0;c<3;c++)px[i*4+c]=px[i*4+c]*(1-light)+255*light;
    }
    ctx.putImageData(frame,0,0);
  }
  const ready = new Promise((resolve, reject) => {
    const source = new Image();
    source.onerror = () => reject(new Error("Piece artwork could not be loaded"));
    source.onload = () => {
      const read = document.createElement("canvas"); read.width = source.width; read.height = source.height;
      const r = read.getContext("2d", { willReadFrequently: true }); r.drawImage(source, 0, 0);
      const pixels = r.getImageData(0, 0, read.width, read.height).data;
      for (const [sx, sy, sw, sh] of KomaPieceAtlas.frames) {
        const tile = document.createElement("canvas"); tile.width = 384; tile.height = Math.round(384 * ratio);
        const ctx = tile.getContext("2d");
        // Compress the generated roof to the real piece's 144-degree tip, then
        // map each row's opaque span to the physical left/right edge.
        for (let y = 0; y < tile.height; y++) {
          const t = (y + .5) / tile.height;
          const sourceT = t < shoulderY ? t / shoulderY * .17 : .17 + (t - shoulderY) / (1 - shoulderY) * .83;
          const yy = sy + Math.min(sh - 1, Math.floor(sourceT * sh));
          let left = sx, right = sx + sw - 1;
          while (left < right && pixels[(yy * read.width + left) * 4 + 3] < 200) left++;
          while (right > left && pixels[(yy * read.width + right) * 4 + 3] < 200) right--;
          const half = t < shoulderY ? shoulderX * t / shoulderY : shoulderX + (.5 - shoulderX) * (t - shoulderY) / (1 - shoulderY);
          const destWidth = 2 * half * tile.width;
          ctx.drawImage(source, left, yy, right - left + 1, 1, (tile.width - destWidth) / 2, y, destWidth, 1);
        }
        roundAndBevel(tile, sprites.length);
        sprites.push(tile);
      }
      resolve();
    };
    source.src = KomaPieceAtlas.url;
  });
  function draw(ctx, tier, vertices, width, height) {
    if (!sprites[tier]) return false;
    const top = Math.min(...vertices.map(p => p.y));
    ctx.save(); ctx.shadowColor = "#5b34532a"; ctx.shadowBlur = 4; ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
    if(tier===9) {ctx.shadowColor="#ffd35b99";ctx.shadowBlur=Math.max(4,width*.035);}
    ctx.drawImage(sprites[tier], -width / 2, top, width, height);
    if(tier===9) {
      ctx.shadowColor="#fff9cc";ctx.shadowBlur=width*.022;
      ctx.fillStyle="#fffef2";ctx.strokeStyle="#edbf5090";ctx.lineWidth=width*.003;
      for(const [x,y,r] of [[.31,.17,.034],[-.35,.48,.025],[.32,.86,.030]]) {
        const cx=x*width,cy=top+y*height,s=r*width;
        ctx.beginPath();ctx.moveTo(cx,cy-s);
        ctx.quadraticCurveTo(cx+s*.18,cy-s*.18,cx+s,cy);
        ctx.quadraticCurveTo(cx+s*.18,cy+s*.18,cx,cy+s);
        ctx.quadraticCurveTo(cx-s*.18,cy+s*.18,cx-s,cy);
        ctx.quadraticCurveTo(cx-s*.18,cy-s*.18,cx,cy-s);
        ctx.closePath();ctx.fill();ctx.stroke();
      }
    }
    ctx.restore(); return true;
  }
  const dreamBoard = new Image();
  const boardReady = new Promise((resolve,reject) => {
    dreamBoard.onload=resolve;
    dreamBoard.onerror=()=>reject(new Error("Dream board artwork could not be loaded"));
    dreamBoard.src=KomaPieceAtlas.boardUrl;
  });
  function board(ctx,width,height) {
    if(!dreamBoard.complete||!dreamBoard.naturalWidth) {
      ctx.fillStyle="#fff3fa";ctx.fillRect(0,0,width,height);return true;
    }
    ctx.drawImage(dreamBoard,0,0,width,height);
    return true;
  }
  return { ready: Promise.all([ready,boardReady]), draw, board, get loaded() { return sprites.length === 10; } };
})();
