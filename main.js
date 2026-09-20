"use strict";

if (!window.Matter) throw new Error("Matter.js could not be loaded.");

const { Engine, Render, Runner, World, Bodies, Body, Events, Composite, Vertices } = Matter;
const WIDTH = 500;
const puzzle = PUZZLES.find(item => item.id === Number(new URL(location.href).searchParams.get("puzzle"))) || null;
const HEIGHT = puzzle ? 660 : 820;
// Fine adjustment: gold and above are 1% smaller than the enlarged sizes.
const NORMAL_PIECE_WIDTHS = [43, 58, 76, 98, 130.68, 166.32, 207.9, 251.46, 293.04, 336.6];
const DROP_Y = 82;
const DANGER_Y = 132;
const MAX_TIER = 9;
// Temporary color review. Set to false to restore the original drop pool.
const ENABLE_COLOR_REVIEW = false;
const COLOR_REVIEW_MODE = ENABLE_COLOR_REVIEW && !puzzle;
let colorReviewCursor = 0;
const GAME_OVER_DELAY = 10000;
// Absolute masses, independent of polygon area: pawn is heaviest, king lightest.
const PIECE_MASSES = [20, 18.5, 17, 15.5, 14, 12.8, 11.6, 10.4, 9.2, 8];
// Real wooden king reference: height 32.3 mm / width 28.6 mm.
// https://www.tohsin.com/koma/koma-sonota904.html
const PIECE_HEIGHT_RATIO = 32.3 / 28.6;
const CUTE_FONT = '"Mochiy Pop One", "Hiragino Maru Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
const brandArtwork = new Image();
brandArtwork.src = KomaPieceAtlas.logoUrl;
document.documentElement.style.setProperty("--piece-font", CUTE_FONT);
const STORAGE_KEY = "komamusubi-profile-fixed-v1";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const PIECES = [
  { label: "歩", name: "歩兵", personality: "けなげ", drop: ["一歩ずつ！", "がんばるよ"] },
  { label: "香", name: "香車", personality: "まっすぐ", drop: ["一直線！", "すすむよー"] },
  { label: "桂", name: "桂馬", personality: "はねっこ", drop: ["ぴょん！", "そこ行く？"] },
  { label: "銀", name: "銀将", personality: "クール", drop: ["任せて", "しずかにね"] },
  { label: "金", name: "金将", personality: "しっかり者", drop: ["どっしり", "守るよ！"] },
  { label: "角", name: "角行", personality: "ひらめき屋", drop: ["ななめ目線！", "見えてるよ"] },
  { label: "飛", name: "飛車", personality: "元気いっぱい", drop: ["びゅーん！", "道をあけて！"] },
  { label: "馬", name: "竜馬", personality: "ごきげん", drop: ["ぱからっ！", "いい調子♪"] },
  { label: "龍", name: "龍王", personality: "勇ましい", drop: ["いくよ！", "いざ勝負！"] },
  { label: "玉", name: "玉将", personality: "のんびり", drop: ["よきかな", "まあまあ♪"] },
];

const RAINBOW = [
  ["#ff7398", "#d73d6c", "#732342"],
  ["#ffb33f", "#df8120", "#79450b"],
  ["#bde644", "#7ea825", "#435c14"],
  ["#51dcb1", "#20a884", "#145b4c"],
  ["#ffe044", "#dca51a", "#76500c"],
  ["#4fd7ff", "#149fd1", "#145375"],
  ["#779dff", "#4769d9", "#293e89"],
  ["#b584ff", "#8246db", "#4d247d"],
  ["#f17bdb", "#c841aa", "#792665"],
  ["#ffd12e", "#e78b17", "#7a430a"],
];


const shell = document.getElementById("game-shell");
shell.style.aspectRatio = `${WIDTH} / ${HEIGHT}`;
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const nextEl = document.getElementById("next");
const modeEl = document.getElementById("mode");
const bannerEl = document.getElementById("banner");
const rotateButton = document.getElementById("rotate");
const resultModal = document.getElementById("result-modal");
const resultTitleEl = document.getElementById("result-title");
const finalScoreEl = document.getElementById("final-score");
const resultCard = document.getElementById("result-card");
const shareButton = document.getElementById("share");
const shareStatus = document.getElementById("share-status");
const restartButton = document.getElementById("restart");
const holdButton = document.getElementById("hold");
const helpModal = document.getElementById("help-modal");
const helpButton = document.getElementById("help");
const helpClose = document.getElementById("help-close");
const soundButton = document.getElementById("sound");
const boardStatus = document.getElementById("board-status");

const profile = loadProfile();
const isHome = !puzzle && new URL(location.href).searchParams.get("mode") !== "normal" && !new URL(location.href).searchParams.has("daily");
const validVolume = (v, fallback) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
let musicVolume = validVolume(profile.musicVolume, .3);
let effectsVolume = validVolume(profile.effectsVolume, .65);
const gameAudio = new KomagameAudio({ music: musicVolume, effects: effectsVolume });
let puzzleWon = false;
let puzzleSettledSince = null;
let previewTimer = null;
const puzzleModal = document.getElementById("puzzles-modal");
const audioModal = document.getElementById("audio-modal");
const initialBest = profile.best;
let bestCelebrated = false;
let soundEnabled = profile.sound !== false;
let heldTier = null;
let holdUsed = false;
let activePointer = null;
let dropReadyAt = 0;
let mergeCount = 0;
let returnFocus = null;
const upcoming = [];
let dropCount = 0;
let score = 0;
let best = initialBest || 0;
let highestTier = 0;
let nextTier = 0;
let dropX = WIDTH / 2;
let previewAngle = 0;
let canDrop = true;
let gameOver = false;
let royalCelebration = false;
let royalAchieved = false;
let modalPaused = false;
let dangerSince = null;
let nextSignature = null;
let queueRevision = 0;

let bannerTimer = 0;
const mergeQueue = new Set();
const particles = [];
const speechBubbles = [];
const mergeRings = [];

const engine = Engine.create();
engine.gravity.y = 1;
engine.positionIterations = 20;
engine.velocityIterations = 12;
engine.constraintIterations = 6;
const render = Render.create({
  element: shell,
  engine,
  options: { width: WIDTH, height: HEIGHT, wireframes: false, background: "#fffcf3", pixelRatio: Math.min(window.devicePixelRatio || 1, 2) },
});
render.canvas.classList.add("game-canvas");
render.canvas.tabIndex = 0;
render.canvas.setAttribute("aria-label", "盤面。左右キーで移動、下キーで落下、Rで回転、Hで持ち駒。");
Render.run(render);
const runner = Runner.create({ delta: 1000 / 120, maxFrameTime: 1000 / 30 });
Runner.run(runner, engine);

const wallOptions = { isStatic: true, render: { visible: false } };
World.add(engine.world, [
  Bodies.rectangle(WIDTH / 2, HEIGHT + 30, WIDTH + 120, 60, wallOptions),
  Bodies.rectangle(-30, HEIGHT / 2, 60, HEIGHT * 2, wallOptions),
  Bodies.rectangle(WIDTH + 30, HEIGHT / 2, 60, HEIGHT * 2, wallOptions),
]);

function loadProfile() {
  const legacyBest = 0;
  const fallback = { best: legacyBest, sound: true, tutorialSeen: false, puzzleBest: {}, puzzleVersion: "plain-field-v1" };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const previous = saved ? null : JSON.parse(localStorage.getItem("komamusubi-profile-v1"));
    return {
      ...fallback,
      sound: previous?.sound !== false, tutorialSeen: previous?.tutorialSeen === true,
      ...saved,
      puzzleVersion: "plain-field-v1",
      puzzleArchive: saved?.puzzleVersion === "plain-field-v1" ? (saved.puzzleArchive || {}) : { ...saved?.puzzleArchive, previous: saved?.puzzleBest || {} },
      puzzleBest: Object.fromEntries(Object.entries(saved?.puzzleBest || {}).filter(([k,v]) =>
        (saved?.puzzleVersion === "plain-field-v1" || Number(k) <= 10) &&
        PUZZLES.some(p => String(p.id) === k) && Number.isInteger(v) && v > 0)),
      best: Number.isFinite(saved?.best) && saved.best >= 0 ? saved.best : legacyBest,
    };
  } catch { return fallback; }
}

function saveProfile() {
  if (!COLOR_REVIEW_MODE) profile.best = best;
  profile.sound = soundEnabled;
  profile.musicVolume = musicVolume; profile.effectsVolume = effectsVolume;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch { /* Private mode may block storage. */ }
}

function randomDropTier() {
  if (COLOR_REVIEW_MODE) return colorReviewCursor++ % (MAX_TIER + 1);
  const pool = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3];
  return pool[Math.floor(Math.random() * pool.length)];
}

function prepareOpening() {
  if (COLOR_REVIEW_MODE) {
    colorReviewCursor = 0;
    nextTier = randomDropTier();
    upcoming.splice(0, upcoming.length, randomDropTier(), randomDropTier());
    return;
  }
  // An immediately matchable pair lets every new player learn by doing.
  nextTier = 0;
  upcoming.splice(0, upcoming.length, 0, randomDropTier());
}

function styleForTier(tier) {
  return RAINBOW[tier];
}

function dimensionsForTier(tier) {
  const width = puzzle ? 43 + tier * 16 : NORMAL_PIECE_WIDTHS[tier];
  return { width, height: width * PIECE_HEIGHT_RATIO };
}

function verticesForPiece(width, height) {
  // Roof slopes 18 degrees from horizontal; sides slope 9 from vertical.
  // This gives interior angles of 144, 117, 81, 81, 117 degrees.
  const roofSlope = Math.tan(18 * Math.PI / 180);
  const sideSlope = Math.tan(9 * Math.PI / 180);
  const shoulderX = (width / 2 - height * sideSlope) / (1 - roofSlope * sideSlope);
  const shoulderY = -height / 2 + shoulderX * roofSlope;
  const vertices = [
    { x: -width / 2, y: height / 2 }, { x: width / 2, y: height / 2 },
    { x: shoulderX, y: shoulderY }, { x: 0, y: -height / 2 },
    { x: -shoulderX, y: shoulderY },
  ];
  // Matter positions bodies by area centroid; use the same origin for previews.
  const center = Vertices.centre(vertices);
  return vertices.map(vertex => ({ x: vertex.x - center.x, y: vertex.y - center.y }));
}

function createPiece(x, y, tier, angle = 0) {
  const { width, height } = dimensionsForTier(tier);
  const localVertices = verticesForPiece(width, height);
  const piece = Bodies.fromVertices(x, y, [localVertices], {
    restitution: 0, friction: .55, frictionStatic: .9, frictionAir: .012,
    slop: .01,
    render: { visible: false },
  }, true);
  piece.gamePiece = { tier, landed: false, happyUntil: 0, popUntil: 0 };
  // Keep puzzle physics unchanged until that mode's dedicated balance pass.
  if (puzzle) Body.setDensity(piece, .004 + (MAX_TIER - tier) * .00045);
  else Body.setMass(piece, PIECE_MASSES[tier]);
  Body.setAngle(piece, angle);
  return piece;
}

function getPieces() {
  return Composite.allBodies(engine.world).filter((body) => body.gamePiece);
}

function drawPolygon(ctx, vertices) {
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i += 1) ctx.lineTo(vertices[i].x, vertices[i].y);
  ctx.closePath();
}

function drawCuteMarkings(ctx, tier, width, height, label, celebrating = false) {
  const ink = styleForTier(tier)[2];
  const faceY = height * .17;
  const eyeX = Math.max(6.5, width * .18);
  const eyeRadius = Math.max(2.2, Math.min(10, width * .044));
  ctx.fillStyle = ink;
  ctx.font = `700 ${Math.max(17, Math.min(92, width * .37))}px ${CUTE_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, -height * .19);
  ctx.fillStyle = "rgba(241,105,121,.52)";
  ctx.beginPath();
  ctx.ellipse(-eyeX * 1.6, faceY + eyeRadius * 1.15, eyeRadius * 1.4, eyeRadius * .85, 0, 0, Math.PI * 2);
  ctx.ellipse(eyeX * 1.6, faceY + eyeRadius * 1.15, eyeRadius * 1.4, eyeRadius * .85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1.8, width * .018);
  ctx.lineCap = "round";
  const expression = celebrating ? "happy" : ["round", "focus", "happy", "cool", "round", "curious", "happy", "round", "focus", "sleepy"][tier];
  if (expression === "happy") {
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * eyeX, faceY + eyeRadius * .7, eyeRadius * 1.25, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); }
  } else if (expression === "cool" || expression === "sleepy") {
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * eyeX - eyeRadius, faceY); ctx.lineTo(side * eyeX + eyeRadius, faceY + (expression === "cool" ? side * eyeRadius * .3 : 0)); ctx.stroke(); }
  } else {
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * eyeX, faceY, eyeRadius, 0, Math.PI * 2); ctx.fill(); }
    if (width >= 86) {
      ctx.fillStyle = "#fff";
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * eyeX - eyeRadius * .3, faceY - eyeRadius * .3, eyeRadius * .28, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = ink;
    }
  }
  const mouthY = faceY + Math.max(6.5, height * .08);
  if (celebrating || tier === 6) {
    ctx.beginPath(); ctx.ellipse(0, mouthY, Math.max(3.3, width * .05), Math.max(3, width * .04), 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f7a0a8"; ctx.beginPath(); ctx.arc(0, mouthY + eyeRadius * .55, Math.max(1.1, width * .014), Math.PI, 0); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(0, mouthY - eyeRadius, Math.max(4.5, width * .08), .18, Math.PI - .18); ctx.stroke();
  }
}

// Cache settled artwork at the canvas resolution; moving/rotating a piece then
// only needs one image draw. Keep the short merge animation on the live path.
const pieceArtwork = new Map();
const piecePortraits = new Map();
function piecePortrait(tier) {
  if (piecePortraits.has(tier)) return piecePortraits.get(tier);
  const { width, height } = dimensionsForTier(tier);
  const vertices = verticesForPiece(width, height);
  const top = Math.min(...vertices.map(v => v.y));
  const canvas = document.createElement("canvas");
  canvas.width = 320; canvas.height = Math.round(320 * height / width);
  const ctx = canvas.getContext("2d");
  ctx.scale(canvas.width / width, canvas.height / height);
  ctx.translate(width / 2, -top);
  paintPiece(ctx, {position:{x:0,y:0},angle:0,vertices,
    bounds:{min:{y:top},max:{y:top+height}},
    gamePiece:{tier,happyUntil:0,popUntil:0}});
  const url = canvas.toDataURL("image/png");
  piecePortraits.set(tier, url);
  return url;
}
function applyPortrait(element, tier) {
  element.dataset.pieceTier = tier;
  element.style.backgroundImage = `url("${piecePortrait(tier)}")`;
  element.style.backgroundColor = "transparent";
  element.style.color = "transparent";
}
function refreshPortraits() {
  pieceArtwork.clear(); piecePortraits.clear();
  document.querySelectorAll("[data-piece-tier]").forEach(element => applyPortrait(element, Number(element.dataset.pieceTier)));
  renderMenuPortraits();
  drawBestBadge(true);
  drawScoreBadge(true);
}
if (document.fonts) {
  document.fonts.ready.then(refreshPortraits);
  document.fonts.addEventListener("loadingdone", refreshPortraits);
}
Promise.all([KomaSprites.ready,KomaGlyphs.ready,KomaVisuals.ready]).then(refreshPortraits).catch(error => console.error(error));

function drawFlatPiece(ctx, body, alpha = 1) {
  const { tier, happyUntil, popUntil } = body.gamePiece;
  const now = performance.now();
  if (popUntil > now) { paintPiece(ctx, body, alpha); return; }
  const celebrating = happyUntil > now;
  const ratio = render.options.pixelRatio;
  const key = `${tier}:${celebrating}:${ratio}`;
  let artwork = pieceArtwork.get(key);
  if (!artwork) {
    const { width, height } = dimensionsForTier(tier);
    const vertices = verticesForPiece(width, height);
    const top = Math.min(...vertices.map(v => v.y)) - 16;
    const left = -width / 2 - 16;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil((width + 32) * ratio);
    canvas.height = Math.ceil((height + 32) * ratio);
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    context.translate(-left, -top);
    paintPiece(context, {
      position: { x: 0, y: 0 }, angle: 0, vertices,
      bounds: { min: { y: top + 16 }, max: { y: top + 16 + height } },
      gamePiece: { tier, happyUntil: celebrating ? Infinity : 0, popUntil: 0 },
    });
    artwork = { canvas, left, top, width: canvas.width / ratio, height: canvas.height / ratio };
    pieceArtwork.set(key, artwork);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
  ctx.drawImage(artwork.canvas, artwork.left, artwork.top, artwork.width, artwork.height);
  ctx.restore();
}

function paintPiece(ctx, body, alpha = 1) {
  const { tier, happyUntil, popUntil } = body.gamePiece;
  const { width, height } = dimensionsForTier(tier);
  const [fill, edge] = styleForTier(tier);
  const vertices = verticesForPiece(width, height);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
  const imagePiece = KomaSprites.draw(ctx, tier, vertices, width, height);
  if (!imagePiece) KomaVisuals.surface(ctx, vertices, width, height, fill, edge);
  if (popUntil > performance.now()) {
    const life = (popUntil - performance.now()) / 600;
    drawPolygon(ctx, vertices); ctx.strokeStyle = `rgba(255,255,255,${life * .7})`; ctx.lineJoin = "round"; ctx.lineWidth = 2 + life * 3; ctx.stroke();
  }
  const facePulse = !reducedMotion && popUntil > performance.now() ? 1 + Math.sin((popUntil - performance.now()) / 35) * .035 : 1;
  ctx.scale(facePulse, 2 - facePulse);
  if (imagePiece) {
    if (!KomaGlyphs.draw(ctx,tier,width,height,Math.min(...vertices.map(v=>v.y)))) {
    ctx.font = `700 ${Math.max(17, Math.min(88, width * .36))}px ${CUTE_FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = styleForTier(tier)[2];
    ctx.fillText(PIECES[tier].label, 0, -height * .18);
    }
  } else drawCuteMarkings(ctx, tier, width, height, PIECES[tier].label, happyUntil > performance.now());
  ctx.restore();
}

// Sweep the actual polygon straight down. A first contact is either a falling
// vertex against a fixed edge, or a fixed vertex against a falling edge.
function predictDropContact(x, tier, angle, obstacles = getPieces()) {
  const size = dimensionsForTier(tier);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const falling = verticesForPiece(size.width, size.height).map(v => ({
    x: x + v.x * cos - v.y * sin, y: DROP_Y + v.x * sin + v.y * cos,
  }));
  const bottom = Math.max(...falling.map(v => v.y));
  let distance = Math.max(0, HEIGHT - bottom);
  let contacts = falling.filter(v => Math.abs(v.y - bottom) < 1e-6).map(v => ({ x: v.x, y: HEIGHT }));
  const consider = (travel, contact) => {
    if (travel < -1e-6 || travel > distance + 1e-6) return;
    if (travel < distance - 1e-6) contacts = [];
    distance = Math.max(0, travel);
    contacts.push(contact);
  };
  const edgeY = (a, b, atX) => {
    if (Math.abs(b.x - a.x) < 1e-8) return null;
    const t = (atX - a.x) / (b.x - a.x);
    return t < -1e-8 || t > 1 + 1e-8 ? null : a.y + t * (b.y - a.y);
  };
  const minX = Math.min(...falling.map(v => v.x));
  const maxX = Math.max(...falling.map(v => v.x));
  for (const body of obstacles) {
    if (body.bounds.max.x < minX || body.bounds.min.x > maxX) continue;
    const fixed = body.vertices;
    for (let i = 0; i < fixed.length; i++) {
      const a = fixed[i], b = fixed[(i + 1) % fixed.length];
      for (const vertex of falling) {
        const y = edgeY(a, b, vertex.x);
        if (y !== null) consider(y - vertex.y, { x: vertex.x, y });
      }
    }
    for (let i = 0; i < falling.length; i++) {
      const a = falling[i], b = falling[(i + 1) % falling.length];
      for (const vertex of fixed) {
        const y = edgeY(a, b, vertex.x);
        if (y !== null) consider(vertex.y - y, { x: vertex.x, y: vertex.y });
      }
    }
  }
  if (Math.abs(distance - (HEIGHT - bottom)) < 1e-6) {
    const bottomVertices = falling.filter(v => Math.abs(v.y - bottom) < 1e-6);
    return { distance, x: bottomVertices.reduce((sum, p) => sum + p.x, 0) / bottomVertices.length, y: HEIGHT };
  }
  const contact = contacts.reduce((nearest, p) => Math.abs(p.x - x) < Math.abs(nearest.x - x) ? p : nearest);
  return { distance, x: contact.x, y: contact.y };
}

function drawPreview(ctx) {
  const size = dimensionsForTier(nextTier);
  const vertices = verticesForPiece(size.width, size.height);
  const previewBottom = Math.max(...vertices.map(v => v.x * Math.sin(previewAngle) + v.y * Math.cos(previewAngle)));
  dropX = clampDropX(dropX, nextTier, previewAngle);
  ctx.save();
  const contact = predictDropContact(dropX, nextTier, previewAngle);
  ctx.setLineDash([3, 8]); ctx.strokeStyle = "rgba(94,122,80,.32)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(dropX, DROP_Y + previewBottom); ctx.lineTo(dropX, contact.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(94,122,80,.2)";
  ctx.beginPath(); ctx.ellipse(dropX, contact.y, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawFlatPiece(ctx, {
    position: { x: dropX, y: DROP_Y },
    angle: previewAngle,
    gamePiece: { tier: nextTier, happyUntil: 0, popUntil: 0 },
  });
}

function spawnParticles(x, y, color, amount = 20) {
  if (reducedMotion) return;
  amount = Math.min(amount, 45);
  if (particles.length > 180) particles.splice(0, particles.length - 180);
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.PI * 2 * i / amount + Math.random() * .3;
    const speed = 2 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1, radius: 3 + Math.random() * 5, life: 1, color, heart: i % 5 === 0 });
  }
}

function updateParticles(ctx) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += .16; p.life -= .032;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.translate(p.x, p.y);
    if (p.heart) { ctx.rotate(Math.PI / 4); ctx.fillRect(-p.radius / 2, -p.radius / 2, p.radius, p.radius); }
    else { ctx.beginPath(); ctx.arc(0, 0, p.radius * p.life, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}

function addSpeech(x, y, text) {
  if (speechBubbles.length >= 6) speechBubbles.shift();
  speechBubbles.push({ x, y, text, born: performance.now() });
}

function drawSpeech(ctx) {
  const now = performance.now();
  for (let i = speechBubbles.length - 1; i >= 0; i -= 1) {
    const bubble = speechBubbles[i];
    const age = now - bubble.born;
    if (age > 1250) { speechBubbles.splice(i, 1); continue; }
    const alpha = Math.min(1, age / 120, (1250 - age) / 250);
    const isPoints = /^\+[\d,]+$/.test(bubble.text);
    ctx.save(); ctx.globalAlpha = alpha; ctx.font = `700 ${isPoints ? 25 : 17}px ${CUTE_FONT}`;
    const w = ctx.measureText(bubble.text).width + 18;
    const x = Math.max(w / 2 + 5, Math.min(WIDTH - w / 2 - 5, bubble.x));
    const y = bubble.y - 35 - age * .018;
    if (isPoints) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      ctx.strokeStyle = "#9260af"; ctx.lineWidth = 6; ctx.strokeText(bubble.text, x, y + 2);
      ctx.strokeStyle = "#fffdf7"; ctx.lineWidth = 5; ctx.strokeText(bubble.text, x, y);
      const ink = ctx.createLinearGradient(0, y - 14, 0, y + 14);
      ink.addColorStop(0, "#d28ae7"); ink.addColorStop(.5, "#a252cd"); ink.addColorStop(1, "#703ba8");
      ctx.fillStyle = ink; ctx.fillText(bubble.text, x, y);
      ctx.restore(); continue;
    }
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#ba5ada"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - 18, w, 29, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#893bc3"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(bubble.text, x, y - 3);
    ctx.restore();
  }
}

function drawBoardSurface(ctx) { if (!KomaSprites.board(ctx, WIDTH, HEIGHT)) KomaVisuals.board(ctx, WIDTH, HEIGHT); }

Events.on(render, "afterRender", () => {
  const ctx = render.context;
  drawBoardSurface(ctx);
  for (let i = mergeRings.length - 1; i >= 0; i--) {
    const ring = mergeRings[i];
    const progress = (performance.now() - ring.born) / 550;
    if (progress >= 1) { mergeRings.splice(i, 1); continue; }
    ctx.save(); ctx.globalAlpha = (1 - progress) * .7;
    ctx.strokeStyle = ring.color; ctx.lineWidth = 4 * (1 - progress);
    ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius * (.5 + progress), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  for (const body of getPieces()) drawFlatPiece(ctx, body);
  if (!puzzle) {
  ctx.save();
  ctx.setLineDash([6, 8]); ctx.strokeStyle = dangerSince !== null ? "#c77969" : "rgba(182,109,96,.35)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, DANGER_Y); ctx.lineTo(WIDTH, DANGER_Y); ctx.stroke();
  ctx.setLineDash([]); ctx.font = "700 11px sans-serif"; ctx.textAlign = "right";
  if (dangerSince !== null) {
    ctx.fillStyle = "rgba(197,106,92,.1)"; ctx.fillRect(0, 0, WIDTH, DANGER_Y);
    ctx.fillStyle = "#c77969"; ctx.fillRect(0, DANGER_Y - 3, WIDTH * Math.min(1, (engine.timing.timestamp - dangerSince) / GAME_OVER_DELAY), 3);
  }
  ctx.restore();
  }
  if (nextTier !== null && canDrop && !gameOver && !modalPaused) drawPreview(ctx);
  updateParticles(ctx); drawSpeech(ctx);
});

function ensureAudio() {
  if (!soundEnabled) return;
  syncAudio();
  void gameAudio.unlock();
}

function syncAudio() {
  gameAudio.setVolume("effects", soundEnabled ? effectsVolume : 0);
  gameAudio.setVolume("music", soundEnabled ? musicVolume : 0);
  gameAudio.setPlaying(soundEnabled && !document.hidden && !gameOver && !modalPaused);
}

function tone(frequency, duration, type = "sine", gain = .045, delay = 0) {
  if (soundEnabled) gameAudio.tone(frequency, duration, type, gain * 2, delay);
}

function playMergeSound(tier) {
  ensureAudio();
  const base = 250 * Math.pow(2, tier / 12);
  tone(base, .18, "sine", .05); tone(base * 1.25, .22, "triangle", .035, .07);
  if (tier >= 4) tone(base * 1.5, .25, "sine", .04, .14);
}

function playSpecialSound(mate = false) {
  ensureAudio();
  const notes = mate ? [392, 523, 659, 784] : [330, 440, 554];
  notes.forEach((note, i) => tone(note, .28, "triangle", .045, i * .09));
}

function announce(text) {
  window.clearTimeout(bannerTimer);
  bannerEl.textContent = text;
  bannerEl.classList.remove("show");
  void bannerEl.offsetWidth;
  bannerEl.classList.add("show");
  bannerTimer = window.setTimeout(() => bannerEl.classList.remove("show"), 1350);
}

function drawScoreBadge(force = false) {
  if (puzzle) return;
  const canvas = document.getElementById("score-badge");
  if (!force && canvas.dataset.score === String(score)) return;
  canvas.dataset.score = score;
  KomaVisuals.score(canvas, score, false, false);
}

function drawBestBadge(force = false) {
  if (puzzle) return;
  const canvas = document.getElementById("best-badge");
  const signature = `${best}:${bestCelebrated}`;
  if (!force && canvas.dataset.signature === signature) return;
  canvas.dataset.signature = signature;
  KomaVisuals.score(canvas, best, true, bestCelebrated);
}

function updateHud() {
  scoreEl.textContent = score.toLocaleString("ja-JP");
  scoreEl.setAttribute("aria-label", `得点 ${score}`);
  drawScoreBadge();
  bestEl.textContent = best.toLocaleString("ja-JP");
  bestEl.setAttribute("aria-label", `最高得点 ${best}`);
  drawBestBadge();
  const visibleNext = puzzle ? upcoming : upcoming.slice(0, 2);
  const updatedSignature = `${queueRevision}:${visibleNext.join(",")}`;
  // HUD refreshes also happen on merges, cooldowns and modal changes. Preserve
  // the queue DOM then, so its CSS animation cannot restart on replacement nodes.
  if (nextSignature !== updatedSignature) {
    nextEl.classList.remove("queue-slide");
    nextEl.replaceChildren(...visibleNext.map((tier, index) => {
      const piece = miniPiece(tier);
      const item = document.createElement("span");
      item.className = `next-item${index === 0 ? " is-next" : ""}`;
      item.setAttribute("aria-label", `${index + 1}番目、${PIECES[tier].name}`);
      if (index === 0) {
        const label = document.createElement("span"); label.className = "queue-label";
        label.textContent = "つぎ"; item.append(label);
      } else {
        const arrow = document.createElement("span"); arrow.className = "queue-arrow";
        arrow.textContent = "›"; arrow.setAttribute("aria-hidden", "true"); item.append(arrow);
      }
      item.append(piece);
      return item;
    }));
    if (puzzle && !visibleNext.length) nextEl.textContent = "残りなし";
    nextEl.previousElementSibling.textContent = puzzle ? "このあと全部 · 左から順に" : "このあと";
    nextEl.setAttribute("aria-label", visibleNext.length ? `次の駒：${visibleNext.map(tier => PIECES[tier].name).join("、")}` : "次に出る駒はありません");
    if (nextSignature !== null && !reducedMotion) {
      nextEl.classList.add("queue-slide");
    }
    nextSignature = updatedSignature;
  }
  modeEl.textContent = puzzle ? `PUZZLE ${puzzle.id}` : "SCORE";
  document.getElementById("hold-piece").textContent = heldTier === null ? "＋" : PIECES[heldTier].label;
  document.getElementById("hold-piece").style.color = heldTier === null ? "" : styleForTier(heldTier)[2];
  document.getElementById("hold-piece").classList.toggle("has-piece", heldTier !== null);
  document.getElementById("hold-piece").style.background = heldTier === null ? "" : styleForTier(heldTier)[0];
  const heldPieceEl = document.getElementById("hold-piece");
  if (heldTier !== null) applyPortrait(heldPieceEl, heldTier);
  else { delete heldPieceEl.dataset.pieceTier; heldPieceEl.style.backgroundImage = ""; }
  document.getElementById("hold-hint").textContent = holdUsed ? "次の一手で" : heldTier === null ? "とっておく" : "入れかえる";
  holdButton.disabled = gameOver || modalPaused || (puzzle && (holdUsed || !canDrop)) || (nextTier === null && heldTier === null);
  rotateButton.disabled = !canDrop || gameOver || modalPaused || nextTier === null;
  for (const control of document.querySelectorAll("#aim-controls button, #aim-controls input")) control.disabled = rotateButton.disabled;
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.setAttribute("aria-label", soundEnabled ? "音をオフにする" : "音をオンにする");
  updatePuzzleHud();
}


function miniPiece(tier) {
  const token = document.createElement("span");
  token.className = "mini-piece";
  token.textContent = PIECES[tier].label;
  token.title = PIECES[tier].name;
  applyPortrait(token, tier);
  return token;
}


function markLanded({ bodyA, bodyB }) {
  if (bodyA.gamePiece && bodyB.isStatic) bodyA.gamePiece.landed = true;
  if (bodyB.gamePiece && bodyA.isStatic) bodyB.gamePiece.landed = true;
  if (bodyA.gamePiece && bodyB.gamePiece) {
    if (bodyA.gamePiece.landed) bodyB.gamePiece.landed = true;
    if (bodyB.gamePiece.landed) bodyA.gamePiece.landed = true;
  }
}

function scheduleMerge(a, b) {
  if (!a.gamePiece || !b.gamePiece || !a.gamePiece.landed || !b.gamePiece.landed) return;
  if (a.gamePiece.tier !== b.gamePiece.tier || a.gamePiece.tier >= MAX_TIER) return;
  if (mergeQueue.has(a.id) || mergeQueue.has(b.id)) return;
  mergeQueue.add(a.id); mergeQueue.add(b.id);
  queueMicrotask(() => mergePieces(a, b));
}

function mergeScore(sourceTier) {
  const bonus = sourceTier === 6 ? 100 : sourceTier === 7 ? 200 : sourceTier === 8 ? 500 : 0;
  return (sourceTier + 1) ** 2 * 10 + bonus;
}

function mergePieces(a, b) {
  if (gameOver || modalPaused) { mergeQueue.delete(a.id); mergeQueue.delete(b.id); return; }
  const bodies = getPieces();
  if (!bodies.includes(a) || !bodies.includes(b)) { mergeQueue.delete(a.id); mergeQueue.delete(b.id); return; }
  const sourceTier = a.gamePiece.tier;
  const x = (a.position.x + b.position.x) / 2;
  const y = (a.position.y + b.position.y) / 2;
  const resultTier = sourceTier + 1;
  const velocity = { x: (a.velocity.x + b.velocity.x) / 2, y: (a.velocity.y + b.velocity.y) / 2 - 1.2 };
  World.remove(engine.world, a); World.remove(engine.world, b);
  const merged = createPiece(x, y, resultTier);
  merged.gamePiece.landed = true; merged.gamePiece.happyUntil = performance.now() + 900; merged.gamePiece.popUntil = performance.now() + 600;
  Body.setVelocity(merged, velocity); Body.setAngularVelocity(merged, (a.angularVelocity + b.angularVelocity) / 2);
  World.add(engine.world, merged);
  mergeCount += 1;
  const gained = mergeScore(sourceTier);
  score += gained;
  highestTier = Math.max(highestTier, resultTier);
  spawnParticles(x, y, styleForTier(resultTier)[0], 18 + resultTier * 2);
  if (!reducedMotion) {
    if (mergeRings.length >= 12) mergeRings.shift();
    mergeRings.push({ x, y, born: performance.now(), color: styleForTier(resultTier)[1], radius: dimensionsForTier(resultTier).width });
    const scoreBadge = document.getElementById("score-badge");
    scoreBadge.getAnimations().forEach(animation => animation.cancel());
    scoreBadge.animate([{ transform: "scale(1)" }, { transform: "scale(1.09)", offset: .35 }, { transform: "scale(1)" }], { duration: 360, easing: "ease-out" });
  }
  addSpeech(x, y, `+${gained}`);
  playMergeSound(resultTier);
  if (resultTier === 9) triggerMate(merged);
  if (!puzzle && score > best) {
    best = score; saveProfile();
    if (initialBest > 0 && !bestCelebrated) {
      bestCelebrated = true;
      document.getElementById("best-caption").textContent = "記録更新";
      bestEl.parentElement.classList.add("record-achieved", "record-burst");
      setTimeout(() => bestEl.parentElement.classList.remove("record-burst"), 900);
      [659, 831, 988].forEach((frequency, i) => tone(frequency, .13, "sine", .045, i * .07));
    }
  }
  if (puzzle) puzzleSettledSince = null;
  updateHud();
  mergeQueue.delete(a.id); mergeQueue.delete(b.id);
}

function triggerMate(king) {
  for (const body of getPieces()) {
    if (body !== king && body.gamePiece.tier <= 3) {
      spawnParticles(body.position.x, body.position.y, styleForTier(body.gamePiece.tier)[0], 8);
      World.remove(engine.world, body);
    }
  }
  announce("玉将誕生！"); addSpeech(king.position.x, king.position.y, "よき一局♪"); playSpecialSound(true);
  if (!puzzle && !royalAchieved) {
    royalAchieved = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (gameOver) return;
      royalCelebration = true;
      resultTitleEl.textContent = "玉将、できました。";
      finalScoreEl.textContent = `${dropCount}手で到達 · ${score.toLocaleString("ja-JP")}点`;
      document.getElementById("result-eyebrow").textContent = "二枚の龍が、ついにひとつに。";
      document.getElementById("result-summary").textContent = "この一局を、記念に残そう。";
      restartButton.textContent = "続きを遊ぶ";
      drawResultCard();
      openModal(resultModal, restartButton);
    }));
  }
}

function handleCollisions(event) {
  for (const pair of event.pairs) markLanded(pair);
  for (const pair of event.pairs) scheduleMerge(pair.bodyA, pair.bodyB);
}
Events.on(engine, "collisionStart", handleCollisions);
Events.on(engine, "collisionActive", handleCollisions);

function setBoardStatus(text) {
  if (boardStatus.textContent !== text) boardStatus.textContent = text;
}

Events.on(engine, "afterUpdate", () => {
  if (gameOver || modalPaused) return;
  const now = engine.timing.timestamp;
  if (!canDrop && now >= dropReadyAt && (!puzzle || (dropCount < puzzle.moves && (nextTier !== null || heldTier !== null)))) { canDrop = true; updateHud(); }
  if (puzzle) { updatePuzzleTurn(); return; }
  const aboveLine = getPieces().some((body) => body.gamePiece.landed && body.bounds.min.y < DANGER_Y);
  shell.classList.toggle("danger", aboveLine);
  if (!aboveLine) { dangerSince = null; setBoardStatus(""); return; }
  if (dangerSince === null) dangerSince = now;
  setBoardStatus(String(Math.max(0, Math.ceil((GAME_OVER_DELAY - (now - dangerSince)) / 1000))));
  if (now - dangerSince >= GAME_OVER_DELAY) finishGame();
});

function pointerX(event) {
  const rect = render.canvas.getBoundingClientRect();
  // Remove subpixel conversion noise so the same aim is stable across screen widths.
  return Math.round((event.clientX - rect.left) * WIDTH / rect.width * 1000) / 1000;
}

function clampDropX(x, tier, angle) {
  const { width, height } = dimensionsForTier(tier);
  const xs = verticesForPiece(width, height).map(v => v.x * Math.cos(angle) - v.y * Math.sin(angle));
  return Math.max(2 - Math.min(...xs), Math.min(WIDTH - 2 - Math.max(...xs), x));
}

function updateDropPosition(event) {
  dropX = clampDropX(pointerX(event), nextTier, previewAngle);
}

render.canvas.addEventListener("pointermove", (event) => {
  if (nextTier !== null && !gameOver && !modalPaused && (activePointer === event.pointerId || event.pointerType === "mouse")) updateDropPosition(event);
});
render.canvas.addEventListener("pointerdown", (event) => {
  if (nextTier === null || !canDrop || gameOver || modalPaused || activePointer !== null || !event.isPrimary || event.button !== 0) return;
  event.preventDefault(); ensureAudio(); updateDropPosition(event);
  activePointer = event.pointerId;
  render.canvas.setPointerCapture(event.pointerId);
  render.canvas.focus({ preventScroll: true });
});
render.canvas.addEventListener("pointerup", event => {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
  if (render.canvas.hasPointerCapture(event.pointerId)) render.canvas.releasePointerCapture(event.pointerId);
  const rect = render.canvas.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
  updateDropPosition(event);
  dropPiece();
});
render.canvas.addEventListener("pointercancel", () => { activePointer = null; });
render.canvas.addEventListener("lostpointercapture", () => { activePointer = null; });

function dropPiece() {
  if (nextTier === null || !canDrop || gameOver || modalPaused || document.hidden || (puzzle && dropCount >= puzzle.moves)) return;
  ensureAudio(); canDrop = false; holdUsed = false;
  dropX = clampDropX(dropX, nextTier, previewAngle);
  const droppedTier = nextTier;
  const piece = createPiece(dropX, DROP_Y, droppedTier, previewAngle);
  World.add(engine.world, piece);
  highestTier = Math.max(highestTier, droppedTier);
  dropCount += 1; nextTier = upcoming.shift() ?? null; queueRevision += 1; if (!puzzle) upcoming.push(randomDropTier()); previewAngle = 0;
  puzzleSettledSince = null;
  dropReadyAt = engine.timing.timestamp + 420;
  tone(190, .065, "sine", .025);
  updateHud();
}

rotateButton.addEventListener("click", () => {
  if (nextTier === null || gameOver || modalPaused || !canDrop) return;
  ensureAudio(); tone(420, .07, "triangle", .018);
  previewAngle = (previewAngle + Math.PI / 2) % (Math.PI * 2);
  dropX = clampDropX(dropX, nextTier, previewAngle);
});

function pauseForModal() {
  activePointer = null;
  if (!gameOver) { Runner.stop(runner); modalPaused = true; }
  updateHud(); syncAudio();
}

function resumeFromModal() {
  if (isHome) { syncAudio(); return; }
  if (!gameOver && modalPaused) { modalPaused = false; if (!document.hidden) Runner.run(runner, engine); }
  updateHud(); syncAudio();
}

function openModal(modal, focusTarget) {
  returnFocus = document.activeElement;
  pauseForModal();
  modal.hidden = false;
  document.querySelector(".app").inert = true;
  focusTarget.focus();
}

function closeModal(modal) {
  modal.hidden = true;
  document.querySelector(".app").inert = false;
  resumeFromModal();
  (returnFocus || render.canvas).focus({ preventScroll: true });
}

holdButton.addEventListener("click", () => {
  if (gameOver || modalPaused || (puzzle && (!canDrop || holdUsed)) || (nextTier === null && heldTier === null)) return;
  ensureAudio();
  const outgoing = nextTier;
  if (heldTier === null) queueRevision += 1;
  nextTier = heldTier === null ? (upcoming.shift() ?? null) : heldTier;
  if (heldTier === null && !puzzle) upcoming.push(randomDropTier());
  heldTier = outgoing;
  holdUsed = Boolean(puzzle); previewAngle = 0;
  tone(340, .09, "triangle", .025);
  updateHud();
});

helpButton.addEventListener("click", () => {
  KomaTutorial.reset();
  openModal(helpModal, document.getElementById('help-next'));
});
helpClose.addEventListener("click", () => {
  profile.tutorialSeen = true; saveProfile(); closeModal(helpModal);
});
soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  clearTimeout(previewTimer); syncAudio();
  if (soundEnabled) { ensureAudio(); tone(523, .12); }
  saveProfile(); updateHud();
});

function resultRank() {
  if (puzzle) return puzzleWon ? "詰めこま クリア！" : "もう一度、考えよう";
  if (highestTier >= 9) return "天下統一・こま名人";
  if (highestTier >= 8) return "龍王級むすび師";
  if (highestTier >= 7) return "合体の達人";
  if (highestTier >= 5) return "こまむすび上手";
  if (score >= 500) return "期待の棋士";
  return "はじめの一歩";
}

function drawResultCard() {
  const ctx = resultCard.getContext("2d");
  ctx.fillStyle = "#f7f0fa"; ctx.fillRect(0, 0, 720, 900);
  ctx.fillStyle = "#fffdfa"; ctx.beginPath(); ctx.roundRect(24, 24, 672, 852, 30); ctx.fill();
  ctx.fillStyle = "#512d7d"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if(brandArtwork.complete&&brandArtwork.naturalWidth) {
    const logoWidth=290,logoHeight=logoWidth*brandArtwork.naturalHeight/brandArtwork.naturalWidth;
    ctx.drawImage(brandArtwork,360-logoWidth/2,12,logoWidth,logoHeight);
  } else {
    ctx.font = `42px ${CUTE_FONT}`; ctx.fillText("こまむすび", 360, 65);
  }
  ctx.font = `22px ${CUTE_FONT}`; ctx.fillStyle = "#aa7842";
  ctx.fillText(puzzle ? `第${puzzle.id}問 ${puzzleStars(puzzle)}` : highestTier >= 9 ? "玉将達成" : `${PIECES[highestTier].name}まで到達`, 360, 115);
  const boardHeight = 470, boardWidth = boardHeight * WIDTH / HEIGHT;
  ctx.save(); ctx.beginPath(); ctx.roundRect(360 - boardWidth / 2, 148, boardWidth, boardHeight, 14); ctx.clip(); ctx.drawImage(render.canvas, 360 - boardWidth / 2, 148, boardWidth, boardHeight); ctx.restore();
  ctx.strokeStyle = "#ddcfbc"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(360 - boardWidth / 2, 148, boardWidth, boardHeight, 14); ctx.stroke();
  ctx.fillStyle = "#967f9e"; ctx.font = "600 13px sans-serif"; ctx.fillText(puzzle ? "使用手数 / 制限手数" : "SCORE", 360, 643);
  ctx.fillStyle = "#512d7d"; ctx.font = "800 64px sans-serif"; ctx.fillText(puzzle ? `${dropCount} / ${puzzle.moves}` : score.toLocaleString("ja-JP"), 360, 694);
  ctx.font = `24px ${CUTE_FONT}`; ctx.fillText(resultRank(), 360, 754);
  ctx.font = "19px sans-serif"; ctx.fillStyle = "#8f7c98";
  ctx.fillText(puzzle ? `目標 ${puzzleObjective(puzzle)} · 使用 ${dropCount}手` : `${dropCount}手 · ${mergeCount}合体`, 360, 801, 650);
  ctx.font = "18px sans-serif";
  ctx.fillText(puzzle ? `詰めこま ${puzzle.id} ${puzzleWon ? "CLEAR" : "TRY AGAIN"}  #こまむすび` : "#こまむすび", 360, 853);
}

function finishGame() {
  if (puzzle) { finishPuzzle(false); return; }
  if (gameOver) return;
  royalCelebration = false;
  restartButton.textContent = "もう一度遊ぶ";
  shareStatus.textContent = "";
  document.getElementById("share-text").hidden = true;
  gameOver = true; canDrop = false; rotateButton.disabled = true; Runner.stop(runner);
  activePointer = null;
  if (score > best) best = score;
  saveProfile();
  syncAudio(); gameAudio.result(false);
  resultTitleEl.textContent = resultRank();
  finalScoreEl.textContent = `${score.toLocaleString("ja-JP")} 点 ／ ${PIECES[highestTier].name}まで育った！`;
  document.getElementById("result-eyebrow").textContent = score > initialBest ? "自己ベスト更新。いい一手が、実った。" : "おつかれさま、いい一局。";
  document.getElementById("result-summary").textContent = `${dropCount}手 · ${mergeCount}合体`;
  updateHud();
  // Capture after the last board frame. Redraw when the local font finishes loading.
  const showResult = () => { drawResultCard(); resultModal.hidden = false; document.querySelector(".app").inert = true; restartButton.focus(); };
  requestAnimationFrame(() => requestAnimationFrame(showResult));
  document.fonts.ready.then(() => { if (gameOver) drawResultCard(); });
}

function canvasBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function resultShareText() {
  if (royalCelebration) {
    const url = KomaShare.url(location.href);
    return `二枚の龍をむすんで、玉将できました！ ${dropCount}手・${score}点 #こまむすび${url ? `\n${url}` : ""}`;
  }
  const text = puzzle ? `「こまむすび」詰めこま第${puzzle.id}問「${puzzle.title}」${puzzleStars(puzzle)} ${puzzleWon ? `${dropCount}手でクリア！` : "に挑戦中！"} #こまむすび` : `「こまむすび」で${score}点！ ${dropCount}手・${mergeCount}合体、${PIECES[highestTier].name}まで育ちました。 #こまむすび`;
  const url = KomaShare.url(location.href, puzzle?.id);
  return text + (url ? `\n${url}` : "");
}

document.getElementById("copy-result").addEventListener("click", async () => {
  const text = resultShareText();
  try {
    await navigator.clipboard.writeText(text);
    shareStatus.textContent = "結果と遊べるリンクをコピーしました";
    if (location.protocol === "file:") shareStatus.textContent = "結果をコピーしました。遊べるリンクはWeb公開後に付きます";
  } catch {
    const field = document.getElementById("share-text");
    field.hidden = false; field.value = text; field.focus(); field.select();
    shareStatus.textContent = "下の文章を選択してコピーできます";
  }
});

shareButton.addEventListener("click", async () => {
  const text = resultShareText();
  shareButton.disabled = true;
  try {
    const blob = await canvasBlob(resultCard);
    if (!blob) throw new Error("Result image could not be generated");
    const file = new File([blob], "komamusubi-result.png", { type: "image/png" });
    if (file && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: "こまむすび", text, files: [file] });
      shareStatus.textContent = "シェアしました！";
    } else {
      downloadResult(blob);
      let copied = false;
      try { if (navigator.clipboard) { await navigator.clipboard.writeText(text); copied = true; } } catch { /* Image download remains available. */ }
      shareStatus.textContent = copied ? "結果画像を保存し、文章をコピーしました" : "結果画像を保存しました";
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      try { const blob = await canvasBlob(resultCard); if (!blob) throw error; downloadResult(blob); shareStatus.textContent = "共有の代わりに結果画像を保存しました"; }
      catch { shareStatus.textContent = "画像を保存できませんでした。画面のスクリーンショットをご利用ください"; }
    }
  } finally { shareButton.disabled = false; }
});

function downloadResult(blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = "komamusubi-result.png";
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

document.addEventListener("keydown", event => {
  const modal = document.querySelector(".modal:not([hidden])");
  if (modal) {
    if (event.key === "Escape" && modal !== resultModal) {
      event.preventDefault();
      if (modal === helpModal) helpClose.click();
      else if (modal === puzzleModal) document.getElementById("puzzles-close").click();
      else document.getElementById("audio-close").click();
    }
    if (event.key === "Tab") {
      const targets = [...modal.querySelectorAll("button:not(:disabled):not([hidden]),input:not(:disabled)")];
      const first = targets[0], last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest("input,textarea,select")) return;
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowdown", "r", "h", "escape"].includes(key)) event.preventDefault();
  if (gameOver || modalPaused || activePointer !== null) return;
  if (nextTier !== null && key === "arrowleft") adjustAim(event.shiftKey ? -1 : -14);
  if (nextTier !== null && key === "arrowright") adjustAim(event.shiftKey ? 1 : 14);
  if (!event.repeat) {
    if (key === "arrowdown") dropPiece();
    if (key === "r") rotateButton.click();
    if (key === "h") holdButton.click();
    if (key === "escape") helpButton.click();
  }
});

restartButton.addEventListener("click", () => {
  if (royalCelebration && !gameOver) {
    royalCelebration = false;
    closeModal(resultModal);
    return;
  }
  window.location.reload();
});
render.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { activePointer = null; if (!gameOver) Runner.stop(runner); }
  else if (!document.hidden && !gameOver && !modalPaused) Runner.run(runner, engine);
  clearTimeout(previewTimer); syncAudio();
});

function setupPuzzle() {
  document.body.classList.add("puzzle-mode");
  nextTier = puzzle.queue[0];
  upcoming.push(...puzzle.queue.slice(1));
  for (const [tier, x, angle] of puzzle.board) {
    const body = createPiece(x, 0, tier, angle);
    Body.translate(body, { x: 0, y: HEIGHT - body.bounds.max.y - .1 });
    body.gamePiece.landed = true;
    World.add(engine.world, body);
    highestTier = Math.max(highestTier, tier);
  }
  document.getElementById("puzzle-info").hidden = false;
  document.getElementById("puzzle-title").textContent = `第${puzzle.id}問 · ${puzzle.title} ${puzzleStars(puzzle)}`;
  document.getElementById("puzzle-hint-text").textContent = puzzle.hint;
}

function puzzleStars(stage) {
  return "★".repeat(stage.difficulty) + "☆".repeat(5 - stage.difficulty);
}

function puzzleObjective(stage) {
  return `「${PIECES[stage.target].name}」`;
}

function updatePuzzleHud() {
  if (!puzzle) return;
  modeEl.textContent = `詰めこま 第${puzzle.id}問`;
  bestEl.textContent = profile.puzzleBest[puzzle.id] ? `最短 ${profile.puzzleBest[puzzle.id]}手` : "未クリア";
  document.getElementById("puzzle-record").textContent = bestEl.textContent;
  document.getElementById("puzzle-remaining").textContent = `残り ${Math.max(0, puzzle.moves - dropCount)}手`;
  setBoardStatus("");
  document.getElementById("puzzle-retry").disabled = gameOver;
}

function updatePuzzleTurn() {
  if (highestTier >= puzzle.target) { finishPuzzle(true); return; }
  // During play, only the shared drop cooldown applies. Resolve failure only
  // after all usable moves are gone; moving pieces can still complete a merge.
  if (dropCount < puzzle.moves && (nextTier !== null || heldTier !== null)) return;
  if (mergeQueue.size) return;
  const now = engine.timing.timestamp;
  if (now < dropReadyAt) return;
  const pieces = getPieces();
  const total = pieces.reduce((sum, body) => sum + 2 ** body.gamePiece.tier, 0);
  if (total < 2 ** puzzle.target) { finishPuzzle(false); return; }
  const still = pieces.every(body => body.speed < .25 && Math.abs(body.angularVelocity) < .015);
  if (!still) puzzleSettledSince = null;
  else if (puzzleSettledSince === null) puzzleSettledSince = now;
  if (puzzleSettledSince !== null && now - puzzleSettledSince > 700) finishPuzzle(false);
}

function finishPuzzle(won) {
  if (gameOver) return;
  puzzleWon = won; gameOver = true; canDrop = false; activePointer = null;
  Runner.stop(runner); syncAudio(); gameAudio.result(won);
  if (won) {
    profile.puzzleBest[puzzle.id] = Math.min(profile.puzzleBest[puzzle.id] || Infinity, dropCount);
    saveProfile();
    spawnParticles(WIDTH/2, HEIGHT*.35, "#ffd12e", 45);
  }
  resultTitleEl.textContent = resultRank();
  document.getElementById("result-eyebrow").textContent = `第${puzzle.id}問 · ${puzzle.title}`;
  finalScoreEl.textContent = won ? `${dropCount}手で目標達成！ ${puzzleStars(puzzle)}` : `${puzzle.moves}手で目標に届きませんでした`;
  document.getElementById("result-summary").textContent = won ? (puzzle.id === PUZZLES.length ? "最後の問題クリア！ 問題一覧から再挑戦できます。" : "次の問題にも挑戦しよう") : "ヒントを見て、配置や持ち駒を変えてみよう";
  restartButton.textContent = "同じ問題に再挑戦";
  document.getElementById("puzzle-next").hidden = !won || puzzle.id === PUZZLES.length;
  document.getElementById("puzzle-select-result").hidden = false;
  updateHud();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    drawResultCard(); resultModal.hidden = false; document.querySelector(".app").inert = true;
    (won && puzzle.id < PUZZLES.length ? document.getElementById("puzzle-next") : restartButton).focus();
  }));
}

function navigatePuzzle(id) {
  const url = new URL(location.href);
  url.searchParams.delete("daily"); url.searchParams.delete("target");
  if (id) url.searchParams.delete("mode"); else url.searchParams.set("mode", "normal");
  if (id) url.searchParams.set("puzzle", String(id)); else url.searchParams.delete("puzzle");
  location.assign(url.href);
}

function renderPuzzleList(difficulty = 0) {
  const list = document.getElementById("puzzle-list"); list.replaceChildren();
  for (const stage of PUZZLES.filter(stage => !difficulty || stage.difficulty === difficulty)) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "stage-button";
    button.dataset.stage = stage.id;
    const record = profile.puzzleBest[stage.id];
    const heading = document.createElement("span"); heading.className = "stage-heading";
    heading.textContent = `第${stage.id}問`;
    const stars = document.createElement("span"); stars.className = "stage-stars";
    stars.textContent = "★".repeat(stage.difficulty); heading.append(stars);
    const title = document.createElement("strong"); title.className = "stage-title"; title.textContent = stage.title;
    const detail = document.createElement("span"); detail.className = "stage-detail";
    detail.textContent = `${stage.moves}手で${puzzleObjective(stage)}`;
    const status = document.createElement("span"); status.className = "stage-status";
    status.textContent = record ? `✓ クリア · 最短${record}手` : "挑戦する ›";
    button.append(heading, title, detail, status);
    button.setAttribute("aria-label", `第${stage.id}問 ${stage.title}、難易度5段階中${stage.difficulty}、${record ? "クリア済み、" : ""}${stage.moves}手、${puzzleObjective(stage)}`);
    button.dataset.difficulty = stage.difficulty;
    button.classList.toggle("cleared", Boolean(record));
    button.addEventListener("click", () => navigatePuzzle(stage.id));
    list.append(button);
  }
}

function showPuzzles() {
  const filters = document.getElementById("puzzle-filters"); filters.replaceChildren();
  for (let difficulty = 0; difficulty <= 5; difficulty++) {
    const button = document.createElement("button"); button.type = "button";
    button.textContent = difficulty ? `★${difficulty}` : "全50問";
    button.setAttribute("aria-pressed", String(difficulty === 0));
    button.setAttribute("aria-label", difficulty ? `難易度${difficulty}の10問を表示` : "全50問を表示");
    button.addEventListener("click", () => {
      for (const filter of filters.children) filter.setAttribute("aria-pressed", String(filter === button));
      renderPuzzleList(difficulty);
    });
    filters.append(button);
  }
  renderPuzzleList();
  const list = document.getElementById("puzzle-list");
  openModal(puzzleModal, list.querySelector("button"));
}

function adjustAim(amount) {
  if (nextTier === null || !canDrop || gameOver || modalPaused || activePointer !== null) return;
  dropX = clampDropX(dropX + amount, nextTier, previewAngle);
}
document.getElementById("aim-left").addEventListener("click", () => adjustAim(-1));
document.getElementById("aim-right").addEventListener("click", () => adjustAim(1));
document.getElementById("aim-drop").addEventListener("click", () => { ensureAudio(); dropPiece(); });


document.getElementById("puzzles-open").addEventListener("click", showPuzzles);
document.getElementById("puzzle-select-result").addEventListener("click", () => { resultModal.hidden = true; showPuzzles(); });
document.getElementById("puzzles-close").addEventListener("click", () => {
  closeModal(puzzleModal);
  if (gameOver) { resultModal.hidden = false; document.querySelector(".app").inert = true; restartButton.focus(); }
});
document.getElementById("normal-mode").addEventListener("click", () => navigatePuzzle(null));
const menuFriends = document.getElementById("menu-friends");
menuFriends.addEventListener("click", () => {
  if (menuFriends.classList.contains("is-greeting")) return;
  menuFriends.classList.add("is-greeting");
  setTimeout(() => menuFriends.classList.remove("is-greeting"), 850);
});
document.getElementById("puzzle-next").addEventListener("click", () => navigatePuzzle(puzzle.id + 1));
document.getElementById("puzzle-retry").addEventListener("click", () => location.reload());
document.getElementById("puzzle-hint").addEventListener("click", () => {
  const hint = document.getElementById("puzzle-hint-text"); hint.hidden = !hint.hidden;
  document.getElementById("puzzle-hint").textContent = hint.hidden ? "ヒントを見る" : "ヒントを閉じる";
  document.getElementById("puzzle-hint").setAttribute("aria-expanded", String(!hint.hidden));
});

function updateAudioControls() {
  for (const [kind, value] of [["music", musicVolume], ["effects", effectsVolume]]) {
    document.getElementById(`${kind}-volume`).value = Math.round(value * 100);
    document.getElementById(`${kind}-value`).textContent = `${Math.round(value * 100)}%`;
  }
  document.getElementById("audio-status").textContent = soundEnabled ? "" : "全体の音がオフです。音を試すとオンになります。";
}
document.getElementById("audio-open").addEventListener("click", () => { updateAudioControls(); openModal(audioModal, document.getElementById("music-volume")); });
document.getElementById("audio-close").addEventListener("click", () => { clearTimeout(previewTimer); gameAudio.setPlaying(false); closeModal(audioModal); });
for (const kind of ["music", "effects"]) {
  document.getElementById(`${kind}-volume`).addEventListener("input", event => {
    const value = Number(event.target.value)/100;
    if (kind === "music") musicVolume = value; else effectsVolume = value;
    gameAudio.setVolume(kind, soundEnabled ? value : 0);
    saveProfile(); updateAudioControls();
  });
}
document.getElementById("audio-preview").addEventListener("click", async () => {
  soundEnabled = true; saveProfile(); syncAudio();
  await gameAudio.unlock();
  if (audioModal.hidden || document.hidden) return;
  clearTimeout(previewTimer); gameAudio.setPlaying(true); gameAudio.result(true);
  previewTimer = setTimeout(() => { gameAudio.setPlaying(false); document.getElementById("audio-status").textContent = "試聴が終了しました"; }, 5000);
  updateAudioControls(); document.getElementById("audio-status").textContent = gameAudio.context ? "試聴中…" : "このブラウザでは音を再生できません";
});
helpClose.addEventListener("click", ensureAudio);
window.addEventListener("pagehide", () => { clearTimeout(previewTimer); gameAudio.setPlaying(false); });

// Use the physical outline for HTML pieces too, normalized to their bounding box.
const normalizedOutline = verticesForPiece(1, PIECE_HEIGHT_RATIO);
const outlineTop = Math.min(...normalizedOutline.map(v => v.y));
// Every menu character is a scaled copy of the board artwork.
function renderMenuPortraits() {
  for (const [selector, cx, bottom, width, tier] of [
    [".friend-left",87,222,110,0],
    [".friend-right",271,219,120,7],
    [".friend-center",181,236,166,9],
  ]) {
    const group = document.querySelector(selector);
    const height = width * PIECE_HEIGHT_RATIO;
    const portrait = document.createElementNS("http://www.w3.org/2000/svg", "image");
    portrait.setAttribute("x", cx - width / 2);
    portrait.setAttribute("y", bottom - height);
    portrait.setAttribute("width", width);
    portrait.setAttribute("height", height);
    portrait.setAttribute("href", piecePortrait(tier));
    group.replaceChildren(portrait);
  }
}
renderMenuPortraits();
document.documentElement.style.setProperty("--piece-ratio", `1 / ${PIECE_HEIGHT_RATIO}`);
document.documentElement.style.setProperty("--piece-outline", `polygon(${normalizedOutline.map(v => `${(v.x + .5) * 100}% ${(v.y - outlineTop) / PIECE_HEIGHT_RATIO * 100}%`).join(",")})`);
if (puzzle) setupPuzzle(); else prepareOpening();
updateHud();
document.body.classList.toggle("home-mode", isHome);
document.getElementById("top-menu").hidden = !isHome;
if (isHome) {
  document.getElementById("audio-close").textContent = "メニューへ戻る";
}
if (isHome) { Runner.stop(runner); modalPaused = true; syncAudio(); }
else if (!profile.tutorialSeen) { KomaTutorial.reset(); openModal(helpModal, document.getElementById('help-next')); }

// Desktop previews scale a complete 390 x 844 phone screen. Layout measurements
// stay in phone coordinates, so resizing the editor never rearranges the UI.
const phoneScreen = document.getElementById("phone-screen");
let previewScale = 1;
function sizePhonePreview() {
  const touchPhone = window.matchMedia("(pointer: coarse)").matches && window.innerWidth <= 720;
  const phoneWidth = touchPhone ? window.innerWidth : 390;
  const phoneHeight = touchPhone ? window.innerHeight : 844;
  document.body.classList.toggle("compact-home", phoneHeight < 720);
  previewScale = Math.min(1, window.innerWidth / phoneWidth, window.innerHeight / phoneHeight);
  const style = document.documentElement.style;
  style.setProperty("--phone-width", `${phoneWidth}px`);
  style.setProperty("--phone-height", `${phoneHeight}px`);
  style.setProperty("--preview-width", `${phoneWidth * previewScale}px`);
  style.setProperty("--preview-height", `${phoneHeight * previewScale}px`);
  style.setProperty("--preview-scale", String(previewScale));
}
sizePhonePreview();
const boardFrame = document.querySelector(".board-frame");
const playColumn = document.querySelector(".play-column");
let boardFitFrame = 0;
function fitBoardToViewport() {
  boardFitFrame = 0;
  const px = value => parseFloat(value) || 0;
  const frameStyle = getComputedStyle(boardFrame);
  const shellStyle = getComputedStyle(shell);
  const extraWidth = px(frameStyle.paddingLeft) + px(frameStyle.paddingRight) + px(frameStyle.borderLeftWidth) + px(frameStyle.borderRightWidth);
  const extraHeight = px(frameStyle.paddingTop) + px(frameStyle.paddingBottom) + px(frameStyle.borderTopWidth) + px(frameStyle.borderBottomWidth);
  const shellBordersX = px(shellStyle.borderLeftWidth) + px(shellStyle.borderRightWidth);
  const shellBordersY = px(shellStyle.borderTopWidth) + px(shellStyle.borderBottomWidth);
  let footerHeight = px(getComputedStyle(document.querySelector(".app")).paddingBottom) + 6;
  for (let item = boardFrame.nextElementSibling; item; item = item.nextElementSibling) {
    const style = getComputedStyle(item);
    if (style.display !== "none") footerHeight += item.offsetHeight + px(style.marginTop) + px(style.marginBottom);
  }
  const top = (boardFrame.getBoundingClientRect().top - phoneScreen.getBoundingClientRect().top) / previewScale;
  const available = phoneScreen.clientHeight - top - footerHeight;
  const width = Math.min(playColumn.clientWidth, Math.max(100,
    (available - extraHeight - shellBordersY) * WIDTH / HEIGHT + shellBordersX + extraWidth));
  playColumn.style.setProperty("--fitted-board-width", `${Math.floor(width)}px`);
}
function scheduleBoardFit() {
  if (!boardFitFrame) boardFitFrame = requestAnimationFrame(fitBoardToViewport);
}
const boardFitObserver = new ResizeObserver(scheduleBoardFit);
for (const item of [playColumn, document.querySelector(".masthead"), ...playColumn.children]) boardFitObserver.observe(item);
window.addEventListener("resize", () => { sizePhonePreview(); scheduleBoardFit(); });
document.fonts.ready.then(scheduleBoardFit);
scheduleBoardFit();

// Reveal only the final route, artwork, fonts and phone layout. The initial
// HTML and fallback canvas must never flash between menu and game navigation.
Promise.all([
  document.fonts.ready, KomaSprites.ready, KomaGlyphs.ready, KomaVisuals.ready,
  ...Array.from(document.querySelectorAll('.brand-logo,.home-logo'), image => image.decode()),
]).then(() => {
  refreshPortraits();
  KomaTutorial.refresh();
  sizePhonePreview();
  requestAnimationFrame(() => {
    fitBoardToViewport();
    requestAnimationFrame(() => {
      Render.world(render);
      document.documentElement.classList.remove('app-loading');
    });
  });
}).catch(error => { console.error(error); window.failAppStartup(); });
