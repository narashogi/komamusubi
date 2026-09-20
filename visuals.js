"use strict";

// The approved toy-like visual direction. Rendering only: no physics or RNG changes.
const KomaVisuals = (() => {
  let grain;
  const boards = new Map();
  function texture(ctx) {
    if (!grain) {
      grain = document.createElement("canvas"); grain.width = grain.height = 96;
      const g = grain.getContext("2d"), pixels = g.createImageData(96, 96);
      let seed = 3917;
      for (let i = 0; i < pixels.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const light = seed & 0x100000 ? 255 : 35;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = light;
        pixels.data[i + 3] = (seed >>> 24) % 9;
      }
      g.putImageData(pixels, 0, 0);
    }
    return ctx.createPattern(grain, "repeat");
  }
  function polygon(ctx, points) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
  }
  function surface(ctx, vertices, width, height, fill, edge) {
    const top = Math.min(...vertices.map(v => v.y));
    ctx.save(); ctx.lineJoin = "round";
    // Ambient shading has no preferred direction, so cached artwork can rotate.
    ctx.shadowColor = "#62334f36"; ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    polygon(ctx, vertices); ctx.fillStyle = edge; ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save(); polygon(ctx, vertices); ctx.clip();
    ctx.fillStyle = edge; ctx.fillRect(-width / 2, top, width, height);
    const face = vertices.map(v => ({ x: v.x * .94, y: v.y * .94 }));
    polygon(ctx, face); ctx.fillStyle = fill; ctx.fill();
    const light = ctx.createRadialGradient(0, 0, 0, 0, 0, height * .65);
    light.addColorStop(0, "#ffffff32"); light.addColorStop(.7, "#ffffff12"); light.addColorStop(1, "#6b285a13");
    ctx.fillStyle = light; ctx.fill();
    ctx.fillStyle = texture(ctx); ctx.fill();
    ctx.strokeStyle = "#ffffff65"; ctx.lineWidth = Math.max(.7, width * .009); ctx.stroke();
    const inset = vertices.map(v => ({ x: v.x * .87, y: v.y * .87 }));
    polygon(ctx, inset); ctx.strokeStyle = "#ffffff47"; ctx.lineWidth = Math.max(.6, width * .006); ctx.stroke();
    ctx.restore(); ctx.restore();
  }
  function blossom(ctx, x, y, radius) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = "#eea68b";
    for (let i = 0; i < 5; i++) { ctx.rotate(Math.PI * 2 / 5); ctx.beginPath(); ctx.ellipse(0, -radius * .5, radius * .42, radius * .55, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "#fff7e8"; ctx.beginPath(); ctx.arc(0, 0, radius * .13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff7e8"; ctx.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) { ctx.rotate(Math.PI * 2 / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -radius * .37); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -radius * .38, radius * .065, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function clouds(ctx, x, y, size) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = "#ecc58e";
    for (const [dx, dy, r] of [[0, 0, .6], [.6, -.1, .4], [-.55, .1, .45]]) { ctx.beginPath(); ctx.ellipse(dx * size, dy * size, r * size, size * .26, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function board(ctx, width, height) {
    const key = `${width}:${height}`;
    let image = boards.get(key);
    if (!image) {
      image = document.createElement("canvas"); image.width = width * 2; image.height = height * 2;
      const c = image.getContext("2d"); c.scale(2, 2);
      const wash = c.createLinearGradient(0, 0, width, height);
      wash.addColorStop(0, "#fff8e9"); wash.addColorStop(.55, "#fffaf1"); wash.addColorStop(1, "#fbead0");
      c.fillStyle = wash; c.fillRect(0, 0, width, height);
      c.globalAlpha = .2;
      blossom(c, 12, 77, 34); blossom(c, width - 34, height * .43, 35);
      clouds(c, width - 25, 34, 51); clouds(c, width - 30, height * .51, 39);
      c.strokeStyle = "#e9bd85"; c.lineWidth = 5;
      for (const [x, y] of [[-12, height * .51], [39, height * .55], [width + 5, height * .92]]) {
        for (const r of [19, 31, 43, 55]) { c.beginPath(); c.arc(x, y, r, Math.PI, 0); c.stroke(); }
      }
      c.globalAlpha = 1; c.fillStyle = texture(c); c.fillRect(0, 0, width, height);
      const floor = c.createLinearGradient(0, height - 14, 0, height);
      floor.addColorStop(0, "#bb845200"); floor.addColorStop(1, "#bb845227");
      c.fillStyle = floor; c.fillRect(0, height - 14, width, 14);
      boards.set(key, image);
    }
    ctx.drawImage(image, 0, 0, width, height);
  }
  const scoreArt = new Image();
  const ready = new Promise((resolve,reject) => {
    scoreArt.onload=resolve;
    scoreArt.onerror=()=>reject(new Error("Score artwork could not be loaded"));
    scoreArt.src=KomaPieceAtlas.scoreUrl;
  });
  // Rounded numeral paths avoid the display font's small notches at HUD sizes.
  const numeralPaths = Object.fromEntries(Object.entries({
    "0":"M13 3 C3 3 3 12 3 19 C3 27 3 35 13 35 C23 35 23 27 23 19 C23 12 23 3 13 3 Z",
    "1":"M6 10 L14 3 L14 35 M6 35 L22 35",
    "2":"M3 10 C4 0 23 0 23 11 C23 18 5 24 3 35 L24 35",
    "3":"M3 6 C13 -1 24 3 23 11 C23 17 18 19 12 19 C19 18 24 22 23 28 C22 37 9 38 3 32",
    "4":"M20 35 L20 3 L2 25 L25 25",
    "5":"M23 3 L5 3 L4 18 C13 12 24 16 23 27 C23 37 9 38 3 32",
    "6":"M22 5 C8 -3 2 11 3 25 C3 38 23 39 23 26 C23 15 8 14 3 23",
    "7":"M3 3 L24 3 C18 12 12 23 10 35",
    "8":"M13 19 C-1 18 0 3 13 3 C26 3 27 18 13 19 C-2 20 -1 35 13 35 C27 35 28 20 13 19 Z",
    "9":"M4 33 C18 41 24 27 23 13 C23 0 3 -1 3 12 C3 23 18 24 23 15",
    ",":"M5 31 Q6 37 2 41"
  }).map(([digit,path])=>[digit,new Path2D(path)]));
  function candyNumber(ctx,text,best) {
    const advance=c=>c===","?13:33;
    const width=[...text].reduce((sum,c)=>sum+advance(c),0)-7;
    const scale=Math.min(1.16,151/(width+11));
    ctx.save();ctx.translate(100-width*scale/2,49);ctx.scale(scale,scale);
    ctx.lineJoin="round";ctx.lineCap="round";
    const fill=ctx.createLinearGradient(0,0,0,38);
    fill.addColorStop(0,best?"#a67dde":"#ed83b7");
    fill.addColorStop(.5,best?"#8b5cc8":"#d95095");
    fill.addColorStop(1,best?"#754bb1":"#bd387b");
    let x=0;
    for(const c of text){
      ctx.save();ctx.translate(x,0);
      ctx.strokeStyle=best?"#c5acdf":"#e6aec9";ctx.lineWidth=11;
      ctx.translate(0,1.5);ctx.stroke(numeralPaths[c]);ctx.translate(0,-1.5);
      ctx.strokeStyle="#fff";ctx.lineWidth=10.5;ctx.stroke(numeralPaths[c]);
      ctx.strokeStyle=fill;ctx.lineWidth=7;ctx.stroke(numeralPaths[c]);
      ctx.restore();x+=advance(c);
    }
    ctx.restore();
  }
  const scoreRenderState=new Map();
  const scoreSurface=document.createElement("canvas");
  scoreSurface.width=1200;scoreSurface.height=660;
  const scoreReduction=document.createElement("canvas");
  let resizeFrame;
  const refreshScoreSize=()=>{
    cancelAnimationFrame(resizeFrame);
    resizeFrame=requestAnimationFrame(()=>{
      for(const [canvas,args] of scoreRenderState)score(canvas,...args);
    });
  };
  const scoreResizeObserver=new ResizeObserver(refreshScoreSize);
  window.addEventListener("resize",refreshScoreSize);
  function score(canvas,value,best,updated) {
    if(!scoreRenderState.has(canvas))scoreResizeObserver.observe(canvas);
    scoreRenderState.set(canvas,[value,best,updated]);
    const ctx=scoreSurface.getContext("2d");ctx.setTransform(6,0,0,6,0,0);ctx.clearRect(0,0,200,110);
    if(scoreArt.complete&&scoreArt.naturalWidth) {
      ctx.drawImage(scoreArt,...KomaPieceAtlas.scoreFrames[best?1:0],0,0,200,110);
    } else {
      ctx.fillStyle=best?"#eee0fc":"#ffe1ef";ctx.beginPath();ctx.roundRect(1,4,198,102,20);ctx.fill();
    }
    ctx.textAlign="center";ctx.textBaseline="middle";
    const ink=best?"#7652b2":"#bc427f";
    ctx.lineJoin="round";
    ctx.font='400 15px "Mochiy Pop One",sans-serif';
    const label=best?(updated?"\u8a18\u9332\u66f4\u65b0":"BEST"):"SCORE";
    ctx.strokeStyle="#ffffff";ctx.lineWidth=3;ctx.strokeText(label,100,29);
    ctx.fillStyle=ink;ctx.fillText(label,100,29);
    candyNumber(ctx,value.toLocaleString("ja-JP"),best);
    // Match the actual screen pixels, including the desktop phone-preview scale.
    // Successive high-quality reductions prevent thin outlines from aliasing
    // when the browser shrinks a large canvas in a single compositor step.
    const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
    const width=Math.max(1,Math.round((rect.width||125)*dpr));
    const height=Math.max(1,Math.round((rect.height||65)*dpr));
    let source=scoreSurface,sw=source.width,sh=source.height;
    while(sw>width*2&&sh>height*2){
      scoreReduction.width=Math.ceil(sw/2);scoreReduction.height=Math.ceil(sh/2);
      const reduced=scoreReduction.getContext("2d");
      reduced.imageSmoothingEnabled=true;reduced.imageSmoothingQuality="high";
      reduced.drawImage(source,0,0,sw,sh,0,0,scoreReduction.width,scoreReduction.height);
      sw=scoreReduction.width;sh=scoreReduction.height;
      const work=scoreSurface.getContext("2d");work.setTransform(1,0,0,1,0,0);
      work.clearRect(0,0,1200,660);work.drawImage(scoreReduction,0,0);
      source=scoreSurface;
    }
    if(canvas.width!==width)canvas.width=width;
    if(canvas.height!==height)canvas.height=height;
    const output=canvas.getContext("2d");output.setTransform(1,0,0,1,0,0);
    output.clearRect(0,0,width,height);output.imageSmoothingEnabled=true;output.imageSmoothingQuality="high";
    output.drawImage(source,0,0,sw,sh,0,0,width,height);
  }
  return { surface, board, score, ready };
})();
