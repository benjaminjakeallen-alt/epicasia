// GODZILLA RAMPAGE — an original comedic arcade platformer for Epic Asia.
// Climb the girders, dodge what Godzilla throws, grab your power-up
// (Chris: PICKAXE, Shea: CANDY CANE), rescue Emily / Heather at the top.
//
// The game logic below works in a 2D logical playfield (192 x 288, y down,
// HUD band at the top); render3d.js draws it as a lit voxel diorama with
// three.js, and hud.js draws the HUD and messages over it. Built into one
// offline HTML string by tools/build-rampage.mjs. The host injects
// window.RAMPAGE_INIT = { highScore, debug } and listens for messages:
// ready, score, haptic, exit.
import { createRenderer } from './render3d.js';

let INIT = window.RAMPAGE_INIT || {};

let W = 192, H = 288, HUD = 22;
let hudCanvas = document.getElementById('hud');

// ---- host bridge ------------------------------------------------------------
function post(msg) {
  try {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    else if (window.parent && window.parent !== window) window.parent.postMessage(Object.assign({ source: 'rampage' }, msg), '*');
  } catch { /* host gone */ }
}

// ---- cast -------------------------------------------------------------------
// Looks (voxel models) live in models.js, keyed by the same names.
let HEROES = {
  chris: { name: 'CHRIS', wife: 'emily', power: 'PICKAXE', powerMsg: 'PICKAXE POWER!', crown: true },
  shea: { name: 'SHEA', wife: 'heather', power: 'CANDY CANE', powerMsg: 'CANDY CANE POWER!' }
};
let WIVES = { emily: { name: 'EMILY' }, heather: { name: 'HEATHER' } };

// ---- themes & levels ---------------------------------------------------------
let THEMES = [
  { name: 'GODZILLA RAMPAGE', sky: ['#120d2e', '#3a2470'], girder: '#e0457b', dark: '#8f1f4a', rivet: '#ffd1e0', ladder: '#5ad1e8', deco: 'city', barrel: 'barrel', cart: 'barrel', drop: 'coal' },
  { name: 'COAL MINE CHAOS', sky: ['#0d0a07', '#33241a'], girder: '#a8713f', dark: '#5a3a1e', rivet: '#e6c28f', ladder: '#d1a865', deco: 'mine', barrel: 'barrel', cart: 'cart', drop: 'coal' },
  { name: 'CHRISTMAS CHAOS', sky: ['#06213d', '#13597e'], girder: '#e8f4ff', dark: '#7fa6c9', rivet: '#ff4d4d', ladder: '#4dd17a', deco: 'xmas', barrel: 'present', cart: 'snowball', drop: 'ornament' },
  { name: 'KAIJU SHOWDOWN', sky: ['#2a0606', '#8a2410'], girder: '#ff8a1f', dark: '#8a3b00', rivet: '#ffe08a', ladder: '#ffd23f', deco: 'fire', barrel: 'firebarrel', cart: 'boulder', drop: 'rock' }
];
// Girders: x1..x2, top surface y at the left (yL) and right (yR) ends.
// They alternate their slope, so barrels zig-zag down; index 6 is the
// rescue ledge above Godzilla.
let G = [
  { x1: 0, x2: 192, yL: 276, yR: 270 },
  { x1: 0, x2: 176, yL: 234, yR: 240 },
  { x1: 16, x2: 192, yL: 198, yR: 192 },
  { x1: 0, x2: 176, yL: 156, yR: 162 },
  { x1: 16, x2: 192, yL: 120, yR: 114 },
  { x1: 0, x2: 152, yL: 78, yR: 82 },
  { x1: 84, x2: 128, yL: 44, yR: 44 }
];
// Ladders [lower girder, x, broken?]; the ledge ladder (5 → 6 at x 118) is always there.
let LEVELS = [
  { ladders: [[0, 150], [0, 60, 1], [1, 30], [1, 100], [2, 160], [2, 80, 1], [3, 28], [3, 110], [4, 136], [4, 70, 1]],
    holes: [], tools: [[2, 120]], icy: [], throwEvery: 3.1, speed: 40, ladderChance: 0.22, cartChance: 0, dropEvery: 0, fire: 0 },
  { ladders: [[0, 40], [0, 140, 1], [1, 150], [1, 90, 1], [2, 30], [2, 120], [3, 160], [3, 60, 1], [4, 100]],
    holes: [[2, 96, 106], [4, 40, 50]], tools: [[1, 100], [3, 120]], icy: [], throwEvery: 2.6, speed: 46, ladderChance: 0.28, cartChance: 0.35, dropEvery: 5.5, fire: 0 },
  { ladders: [[0, 100], [0, 30, 1], [1, 160], [2, 60], [2, 130, 1], [3, 150], [4, 96], [4, 120, 1]],
    holes: [[3, 90, 100]], tools: [[1, 40], [4, 90]], icy: [1, 3], throwEvery: 2.3, speed: 50, ladderChance: 0.33, cartChance: 0.3, dropEvery: 4.6, fire: 0 },
  { ladders: [[0, 160], [1, 20], [1, 120, 1], [2, 170], [3, 30], [3, 90, 1], [4, 140]],
    holes: [[1, 70, 80], [2, 140, 150], [4, 100, 110]], tools: [[2, 60], [3, 140]], icy: [], throwEvery: 1.9, speed: 56, ladderChance: 0.38, cartChance: 0.3, dropEvery: 3.8, fire: 2 }
];

let WALK = 56, CLIMB = 52, JUMPV = 128, GRAV = 470, FALL_DEATH = 26, TOOL_TIME = 10;
let GZ_X = 4, GZ_W = 50; // Godzilla stands on girder 5 from x 4 to 54

// ---- state --------------------------------------------------------------------
let S = {
  mode: 'select', // select | intro | play | dying | rescue | tally | gameover | win
  hero: 'chris', sel: 0, level: 0, round: 0, score: 0, hi: Math.max(0, INIT.highScore | 0),
  lives: 3, extraGiven: false, t: 0, modeT: 0, bonus: 5000, bonusT: 0,
  player: null, hz: [], tools: [], parts: [], pops: [], msgs: [], snow: [],
  gz: { state: 'idle', t: 0, throwT: 2, dropT: 4, roarT: 6, mood: 0, shake: 0, firstThrow: true },
  holes: [], ladders: [], shakeT: 0, paused: false, sentScore: false
};

function lvl() { return LEVELS[S.level]; }
function theme() { return THEMES[S.level]; }
function hard() { return Math.pow(1.15, S.round); }

// ---- geometry -----------------------------------------------------------------
function solidAt(gi, x) {
  let g = G[gi]; if (x < g.x1 || x > g.x2) return false;
  let hs = S.holes[gi] || [];
  for (let i = 0; i < hs.length; i++) if (x >= hs[i][0] && x <= hs[i][1]) return false;
  return true;
}
function surf(gi, x) {
  let g = G[gi]; let cx = Math.min(g.x2 - 0.01, Math.max(g.x1, x));
  let mid = g.x1 + Math.floor((cx - g.x1) / 8) * 8 + 4;
  return Math.round(g.yL + (g.yR - g.yL) * (mid - g.x1) / (g.x2 - g.x1));
}
function downhill(gi) { let g = G[gi]; return g.yR > g.yL ? 1 : -1; }

// ---- sound (Web Audio, synthesized) -----------------------------------------------
let AC = null, muted = false, master = null;
try { muted = localStorage.getItem('rampage.muted') === '1'; } catch { /* storage off */ }
function audio() {
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.connect(AC.destination); } catch { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
  if (master) master.gain.value = muted ? 0 : 1;
  return AC;
}
function tone(f, d, type, vol, slideTo, delay) {
  let a = audio(); if (!a || muted) return;
  let t0 = a.currentTime + (delay || 0);
  let o = a.createOscillator(), g = a.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(f, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + d);
  g.gain.setValueAtTime(vol || 0.05, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + d + 0.02);
}
function noise(d, vol, freq, delay) {
  let a = audio(); if (!a || muted) return;
  let t0 = a.currentTime + (delay || 0), n = Math.floor(a.sampleRate * d);
  let buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
  let src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  f.type = 'lowpass'; f.frequency.value = freq || 800; g.gain.value = vol || 0.12;
  src.buffer = buf; src.connect(f); f.connect(g); g.connect(master); src.start(t0);
}
let SFX = {
  jump: function () { tone(420, 0.14, 'square', 0.045, 820); },
  over: function () { tone(880, 0.06, 'square', 0.04); tone(1320, 0.08, 'square', 0.04, 0, 0.06); },
  smash: function () { noise(0.22, 0.16, 1400); tone(140, 0.18, 'sawtooth', 0.06, 50); },
  pick: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.1, 'square', 0.045, 0, i * 0.07); }); },
  die: function () { tone(660, 0.9, 'square', 0.05, 80); },
  roar: function () { noise(0.9, 0.18, 380); tone(95, 0.9, 'sawtooth', 0.07, 55); },
  stomp: function () { tone(70, 0.2, 'sine', 0.22, 40); noise(0.12, 0.08, 300); },
  swing: function () { noise(0.12, 0.06, 2500); },
  climb: function () { tone(330, 0.03, 'triangle', 0.025); },
  tick: function () { tone(1200, 0.03, 'square', 0.025); },
  oneup: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0.09, 'square', 0.045, 0, i * 0.08); }); },
  rescue: function () { [523, 659, 784, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.16, 'square', 0.05, 0, i * 0.14); }); },
  over2: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.28, 'triangle', 0.06, 0, i * 0.26); }); }
};
// A tiny chiptune loop per level while playing (bass + blips).
let MUSIC = [
  [55, 0, 55, 65, 73, 0, 65, 55], [49, 0, 49, 58, 49, 0, 44, 0], [65, 82, 98, 82, 73, 87, 110, 87], [55, 55, 82, 55, 52, 52, 78, 52]
];
let musicT = 0, musicStep = 0;
function music(dt) {
  if (S.mode !== 'play' || muted) return;
  musicT -= dt;
  if (musicT <= 0) {
    musicT += 0.17 / Math.min(1.25, 0.95 + S.level * 0.08);
    let f = MUSIC[S.level][musicStep % 8];
    if (f) tone(f * 2, 0.13, 'triangle', 0.05);
    if (musicStep % 4 === 2) tone(f ? f * 6 : 440, 0.04, 'square', 0.015);
    musicStep++;
  }
}
function haptic(kind) { post({ type: 'haptic', kind: kind }); }

// ---- messages, popups, particles ------------------------------------------------------
function say(txt, dur, col) { S.msgs.push({ txt: txt, t: dur || 1.4, d: dur || 1.4, col: col || '#ffd43b' }); }
function pop(txt, x, y, col) { S.pops.push({ txt: txt, x: x, y: y, t: 0.9, col: col || '#ffffff' }); }
function burst(x, y, cols, n) {
  for (let i = 0; i < (n || 14); i++) {
    let a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 80;
    S.parts.push({ x: x, y: y, z: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, vz: (Math.random() * 2 - 1) * 50, t: 0.6 + Math.random() * 0.5, col: cols[i % cols.length], spin: Math.random() * 10, s: 1 + Math.random() * 1.6 });
  }
}
function addScore(n, x, y) {
  S.score += n; if (S.score > S.hi) S.hi = S.score;
  if (x !== undefined) pop('+' + n, x, y);
  if (!S.extraGiven && S.score >= 10000) { S.extraGiven = true; S.lives++; say('1UP!', 1.2, '#69db7c'); SFX.oneup(); }
}

// ---- level setup -------------------------------------------------------------------
function buildLevel() {
  let L = lvl();
  S.holes = [[], [], [], [], [], [], []];
  L.holes.forEach(function (h) { S.holes[h[0]].push([h[1], h[2]]); });
  S.ladders = L.ladders.map(function (d) { return mkLadder(d[0], d[0] + 1, d[1], !!d[2]); });
  S.ladders.push(mkLadder(5, 6, 118, false));
  R.buildLevel();
}
function mkLadder(lo, hi, x, broken) { return { lo: lo, hi: hi, x: x, broken: broken, top: surf(hi, x), bottom: surf(lo, x) }; }
function resetRun() {
  let L = lvl();
  S.player = { x: 30, y: surf(0, 30), vx: 0, vy: 0, st: 'ground', g: 0, face: 1, lad: null, anim: 0, tool: 0, swing: 0, cd: 0, fallFrom: 0, maxG: 0, dead: 0, jbuf: 0, coyote: 0 };
  S.hz = []; S.parts = []; S.pops = [];
  S.tools = L.tools.map(function (t) { return { g: t[0], x: t[1], y: surf(t[0], t[1]), taken: false }; });
  let gz = S.gz; gz.state = 'idle'; gz.t = 0; gz.throwT = 1.6; gz.dropT = L.dropEvery || 99; gz.roarT = 7; gz.mood = 0; gz.firstThrow = true;
  S.bonus = 5000 + S.level * 500; S.bonusT = 0;
}
function startLevel() {
  buildLevel(); resetRun();
  setMode('intro');
  let wife = WIVES[HEROES[S.hero].wife].name;
  say(wife + ' NEEDS YOU!', 2.2, '#ff8cc6');
  gzSet('roar', 1.1); SFX.roar(); haptic('heavy');
}
function setMode(m) { S.mode = m; S.modeT = 0; document.getElementById('over').classList.toggle('show', m === 'gameover'); R.modeChanged(m); }

// ---- input ---------------------------------------------------------------------------
let held = { L: 0, R: 0, U: 0, D: 0, J: 0, A: 0 }, edge = { J: 0, A: 0, U: 0, D: 0, L: 0, R: 0 };
function press(k) { if (!held[k]) edge[k] = 1; held[k] = 1; audio(); }
function release(k) { held[k] = 0; }
let KEYMAP = { ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R', ArrowUp: 'U', w: 'U', W: 'U', ArrowDown: 'D', s: 'D', S: 'D', ' ': 'J', x: 'A', X: 'A', f: 'A', F: 'A', k: 'A', K: 'A' };
window.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { menuConfirm(); e.preventDefault(); return; }
  if (e.key === 'Escape' && S.mode === 'gameover') { toSelect(); return; }
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { setMenu(!S.menu); e.preventDefault(); return; }
  if (S.menu) return;
  let k = KEYMAP[e.key]; if (!k) return; e.preventDefault();
  if (!e.repeat) press(k);
});
window.addEventListener('keyup', function (e) { let k = KEYMAP[e.key]; if (k) release(k); });
// The d-pad is one touch zone: the direction comes from where the thumb is
// relative to its centre, so sliding between arrows (and diagonals, e.g.
// up-right onto a ladder) works without lifting.
const dpad = document.querySelector('.dpad');
const dpadBtns = {};
Array.prototype.forEach.call(dpad.querySelectorAll('[data-k]'), function (b) { dpadBtns[b.getAttribute('data-k')] = b; });
let dpadId = null;
function dpadSet(dirs) {
  ['U', 'D', 'L', 'R'].forEach(function (k) {
    if (dirs[k]) press(k); else if (held[k]) release(k);
    dpadBtns[k].classList.toggle('on', !!dirs[k]);
  });
}
function dpadRead(e) {
  const r = dpad.getBoundingClientRect();
  const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const ax = Math.abs(nx), ay = Math.abs(ny);
  return {
    L: nx < -0.3 && ax > ay * 0.45, R: nx > 0.3 && ax > ay * 0.45,
    U: ny < -0.3 && ay > ax * 0.45, D: ny > 0.3 && ay > ax * 0.45
  };
}
dpad.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  // A new thumb on the pad always takes over: if the last touch's "up" got
  // lost (a thumb sliding off the screen edge, a system gesture), the pad
  // must never stay stuck holding a direction.
  dpadId = e.pointerId;
  try { dpad.setPointerCapture(e.pointerId); } catch { /* ok */ }
  dpadSet(dpadRead(e));
});
dpad.addEventListener('pointermove', function (e) { if (e.pointerId === dpadId) dpadSet(dpadRead(e)); });
function dpadUp(e) { if (e.pointerId === dpadId) { dpadId = null; dpadSet({}); } }
dpad.addEventListener('pointerup', dpadUp);
dpad.addEventListener('pointercancel', dpadUp);
dpad.addEventListener('lostpointercapture', dpadUp);
let ptrKey = {};
Array.prototype.forEach.call(document.querySelectorAll('.acts [data-k]'), function (b) {
  let k = b.getAttribute('data-k');
  b.addEventListener('pointerdown', function (e) { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* ok */ } ptrKey[e.pointerId] = k; press(k); b.classList.add('on'); });
  let up = function (e) { if (ptrKey[e.pointerId] === k) { delete ptrKey[e.pointerId]; release(k); b.classList.remove('on'); } };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
});
// Belt and braces against stuck controls: a release anywhere counts, and
// when no finger is left on the screen (or the game loses focus) every
// control lets go.
window.addEventListener('pointerup', dpadUp, true);
window.addEventListener('pointercancel', dpadUp, true);
function releaseAll() {
  dpadId = null; dpadSet({});
  Object.keys(ptrKey).forEach(function (id) { release(ptrKey[id]); delete ptrKey[id]; });
  document.querySelectorAll('.acts [data-k].on').forEach(function (b) { b.classList.remove('on'); });
  Object.keys(held).forEach(release);
}
['touchend', 'touchcancel'].forEach(function (t) {
  document.addEventListener(t, function (e) { if (!e.touches.length) releaseAll(); }, true);
});
window.addEventListener('blur', releaseAll);
// Pause menu (the ❚❚ button or Escape): resume, sound, or leave — leaving
// is never one accidental tap next to the d-pad.
const pauseEl = document.getElementById('pause');
function setMenu(on) {
  S.menu = on; pauseEl.classList.toggle('show', on);
  if (on) { dpadSet({}); document.getElementById('resume').focus(); }
}
document.getElementById('pausebtn').addEventListener('click', function () { setMenu(true); });
document.getElementById('resume').addEventListener('click', function () { setMenu(false); });
document.getElementById('psound').addEventListener('click', toggleMute);
document.getElementById('exit').addEventListener('click', function () { sendScore('quit'); post({ type: 'exit' }); });
function syncMute() {
  document.getElementById('psound').textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
  if (master) master.gain.value = muted ? 0 : 1;
}
function toggleMute() { muted = !muted; try { localStorage.setItem('rampage.muted', muted ? '1' : '0'); } catch { /* ok */ } audio(); syncMute(); }
syncMute();
document.getElementById('again').addEventListener('click', function () { newGame(S.hero); });
document.getElementById('change').addEventListener('click', toSelect);
hudCanvas.addEventListener('pointerdown', function (e) {
  audio();
  let q = R.toLogical(e.clientX, e.clientY), x = q.x, y = q.y;
  if (S.mode === 'select') {
    if (y >= 96 && y < 168) startWith('chris');
    else if (y >= 176 && y < 248) startWith('shea');
  } else if (S.mode === 'intro') setMode('play');
  else if (S.mode === 'win' && S.modeT > 1.5) nextRound();
  void x;
});
function menuConfirm() {
  audio();
  if (S.mode === 'select') startWith(S.sel === 0 ? 'chris' : 'shea');
  else if (S.mode === 'gameover') newGame(S.hero);
  else if (S.mode === 'intro') setMode('play');
  else if (S.mode === 'win' && S.modeT > 1.5) nextRound();
}
function startWith(h) { S.sel = h === 'chris' ? 0 : 1; newGame(h); }
function newGame(h) {
  S.hero = h; S.level = 0; S.round = 0; S.score = 0; S.lives = 3; S.extraGiven = false; S.sentScore = false;
  startLevel();
}
function toSelect() { sendScore('gameover'); setMode('select'); }
function sendScore(outcome) {
  if (S.sentScore || S.score <= 0) return;
  S.sentScore = true;
  post({ type: 'score', score: S.score, level: S.level + 1, round: S.round + 1, hero: S.hero, outcome: outcome });
}

// ---- Godzilla ----------------------------------------------------------------------
function gzSet(st, dur) { S.gz.state = st; S.gz.t = dur; }
function updateGodzilla(dt) {
  let gz = S.gz, L = lvl(), p = S.player;
  gz.mood = Math.min(1, p ? Math.max(0, (p.maxG - 1) / 4) : 0);
  if (gz.shake > 0) gz.shake -= dt;
  if (gz.t > 0) {
    gz.t -= dt;
    if (gz.t <= 0) {
      if (gz.state === 'windup') { throwBarrel(); gzSet('throw', 0.3); return; }
      gz.state = 'idle';
    }
    if (gz.state === 'stomp' || gz.state === 'tantrum') { if (Math.floor(gz.t * 6) !== Math.floor((gz.t + dt) * 6)) { S.shakeT = 0.12; } }
    return;
  }
  if (S.mode !== 'play') return;
  gz.throwT -= dt * (gz.mood > 0.7 ? 1.25 : 1) * hard();
  gz.dropT -= dt * hard();
  gz.roarT -= dt;
  if (gz.throwT <= 0) { gz.throwT = L.throwEvery * (0.75 + Math.random() * 0.5); gzSet('windup', 0.5); return; }
  if (L.dropEvery && gz.dropT <= 0) {
    gz.dropT = L.dropEvery * (0.8 + Math.random() * 0.4);
    gzSet('stomp', 0.7); SFX.stomp(); haptic('light');
    let dx = Math.max(64, Math.min(184, (p ? p.x : 120) + (Math.random() * 48 - 24)));
    S.hz.push({ kind: 'drop', x: dx, y: HUD + 4, vy: 0, warn: 0.9, r: 5, jumped: true });
    return;
  }
  if (gz.roarT <= 0) {
    gz.roarT = 8 + Math.random() * 6; gzSet('roar', 1); SFX.roar();
    if (gz.mood > 0.6) say('GODZILLA IS ANGRY!', 1.3, '#ff6b6b');
  }
}
function throwBarrel() {
  let L = lvl(), T = theme();
  let cart = Math.random() < L.cartChance;
  let kind = cart ? T.cart : T.barrel;
  S.hz.push({ kind: cart ? 'cart' : 'barrel', look: kind, x: 56, y: surf(5, 56), g: 5, dir: 1, st: 'roll', vy: 0, r: cart ? 6 : 5, spin: 0, jumped: false, bounced: false, fast: cart ? 1.45 : 1 });
  SFX.stomp();
  if (S.gz.firstThrow) { S.gz.firstThrow = false; say('BARREL INCOMING!', 1.2); }
  else if (cart && Math.random() < 0.5) say('WATCH OUT!', 1, '#ffa94d');
}

// ---- player ---------------------------------------------------------------------------
// Forgiving ladders: grab one within LADDER_REACH of its centre (snaps on).
const LADDER_REACH = 9;
// Forgiving jumps: a press up to JUMP_BUFFER s before landing still jumps;
// so does one up to COYOTE s after walking off an edge.
const JUMP_BUFFER = 0.14, COYOTE = 0.1;
// Every level must be winnable: each girder 0..4 needs a climbable ladder up,
// and one onto Godzilla's girder (5) must land clear of his stomp zone with
// a walk to the ledge ladder. (Level 3 once only had a ladder up into his
// feet.) Checked by e2e/rampage.spec.ts via __rampage.routeProblems().
function routeProblems() {
  const out = [];
  const stompEdge = GZ_X + GZ_W + 4;
  LEVELS.forEach(function (L, li) {
    for (let gi = 0; gi < 5; gi++) {
      const ups = L.ladders.filter(function (d) { return d[0] === gi && !d[2]; });
      const safe = gi === 4 ? ups.filter(function (d) { return d[1] - LADDER_REACH > stompEdge; }) : ups;
      if (!safe.length) out.push('level ' + (li + 1) + ': no safe ladder up from girder ' + gi);
    }
  });
  return out;
}
function ladderNear(gi, x, atTop) {
  let best = null;
  for (let i = 0; i < S.ladders.length; i++) {
    let l = S.ladders[i];
    if (Math.abs(l.x - x) > LADDER_REACH) continue;
    if (!(atTop ? (l.hi === gi && !l.broken) : l.lo === gi)) continue;
    if (!best || Math.abs(l.x - x) < Math.abs(best.x - x)) best = l;
  }
  return best;
}
function jump(p) { p.st = 'air'; p.vy = -JUMPV; p.fallFrom = p.y; p.jbuf = 0; p.coyote = 0; SFX.jump(); }
function updatePlayer(dt) {
  let p = S.player, L = lvl();
  if (p.cd > 0) p.cd -= dt;
  if (p.swing > 0) p.swing -= dt;
  if (p.tool > 0) {
    p.tool -= dt;
    if (p.tool <= 0) { p.tool = 0; tone(300, 0.3, 'square', 0.04, 120); }
  }
  if (edge.A && p.tool > 0 && p.cd <= 0) { p.swing = 0.28; p.cd = 0.38; SFX.swing(); }
  if (edge.J) p.jbuf = JUMP_BUFFER; else if (p.jbuf > 0) p.jbuf -= dt;
  if (p.coyote > 0) p.coyote -= dt;

  if (p.st === 'ground') {
    if (held.U) { let lu = ladderNear(p.g, p.x, false); if (lu) { p.st = 'climb'; p.lad = lu; p.x = lu.x; p.vx = 0; return; } }
    if (held.D) { let ld = ladderNear(p.g, p.x, true); if (ld) { p.st = 'climb'; p.lad = ld; p.x = ld.x; p.y = ld.top + 2; p.vx = 0; return; } }
    let target = (held.R - held.L) * WALK;
    if (L.icy.indexOf(p.g) >= 0) p.vx += (target - p.vx) * Math.min(1, dt * 2.6);
    else p.vx = target;
    if (target) p.face = target > 0 ? 1 : -1;
    let nx = Math.max(4, Math.min(W - 4, p.x + p.vx * dt));
    if (nx === p.x) p.vx = 0; // against the edge: stand, don't walk on the spot
    p.x = nx;
    if (p.vx) p.anim += dt * 9;
    if (p.jbuf > 0) { jump(p); return; }
    if (solidAt(p.g, p.x)) p.y = surf(p.g, p.x);
    else { p.st = 'air'; p.vy = 0; p.fallFrom = p.y; p.coyote = COYOTE; }
    if (p.g === 5 && p.x < GZ_X + GZ_W + 4) die('stomp');
  } else if (p.st === 'air') {
    if (p.coyote > 0 && p.jbuf > 0) { jump(p); return; } // just walked off an edge
    // a little steering in the air
    let want = (held.R - held.L) * WALK;
    if (want) { p.vx += (want - p.vx) * Math.min(1, dt * 3); p.face = want > 0 ? 1 : -1; }
    let prev = p.y;
    p.vy += GRAV * dt; p.y += p.vy * dt;
    p.x = Math.max(4, Math.min(W - 4, p.x + p.vx * dt));
    if (p.vy > 0) {
      for (let gi = 0; gi < G.length; gi++) {
        if (!solidAt(gi, p.x)) continue;
        let s = surf(gi, p.x);
        if (prev <= s + 0.5 && p.y >= s) {
          if (p.y - p.fallFrom > FALL_DEATH) { p.y = s; die('fall'); return; }
          p.y = s; p.st = 'ground'; p.g = gi; p.vy = 0;
          reached(gi);
          if (p.jbuf > 0 && S.mode === 'play') jump(p); // pressed just before landing
          break;
        }
      }
    }
    if (p.y > H + 10) die('fall');
  } else if (p.st === 'climb') {
    let l = p.lad, dir = held.D - held.U;
    let minY = l.broken ? l.bottom - (l.bottom - l.top) * 0.42 : l.top;
    p.y += dir * CLIMB * dt;
    if (dir) { p.anim += dt * 8; if (Math.floor(p.anim) % 2 === 0 && Math.random() < 0.08) SFX.climb(); }
    if (p.y <= minY) {
      if (l.broken) p.y = minY;
      else { p.y = l.top; p.st = 'ground'; p.g = l.hi; reached(l.hi); }
    }
    if (p.y >= l.bottom) { p.y = l.bottom; p.st = 'ground'; p.g = l.lo; }
    // step off sideways near either end of the ladder
    else if (p.st === 'climb' && (held.L || held.R) && !dir) {
      if (!l.broken && p.y - l.top < 5) { p.y = l.top; p.st = 'ground'; p.g = l.hi; reached(l.hi); }
      else if (l.bottom - p.y < 5) { p.y = l.bottom; p.st = 'ground'; p.g = l.lo; }
    }
  }
  // power-up pickup
  for (let i = 0; i < S.tools.length; i++) {
    let t = S.tools[i];
    if (!t.taken && Math.abs(t.x - p.x) < 8 && Math.abs(t.y - p.y) < 10) {
      t.taken = true; p.tool = TOOL_TIME; addScore(200, t.x, t.y - 16);
      say(HEROES[S.hero].powerMsg, 1.6, '#ffa94d'); SFX.pick(); haptic('success');
      gzSet('shocked', 1.2); burst(t.x, t.y - 8, ['#ffd43b', '#ffffff', '#ffa94d'], 18);
    }
  }
  // Swinging: smash what's in reach (ahead and overhead).
  if (p.swing > 0.05 && p.tool > 0) {
    let x0 = p.face > 0 ? p.x - 4 : p.x - 24, x1 = p.face > 0 ? p.x + 24 : p.x + 4;
    for (let j = S.hz.length - 1; j >= 0; j--) {
      let h = S.hz[j];
      if (h.x + h.r > x0 && h.x - h.r < x1 && h.y > p.y - 30 && h.y - h.r < p.y + 2 && !(h.kind === 'drop' && h.warn > 0)) {
        S.hz.splice(j, 1);
        addScore(h.kind === 'fire' ? 500 : 300, h.x, h.y - 10);
        burst(h.x, h.y, smashColors(h), 16); SFX.smash(); haptic('light'); S.shakeT = 0.1;
        if (Math.random() < 0.35) say('KAIJU KABOOM!', 1, '#ffd43b');
        if (S.gz.state === 'idle') gzSet('shocked', 0.5);
      }
    }
  }
}
function smashColors(h) {
  let lk = h.look || h.kind;
  if (lk === 'present') return ['#e03131', '#ffd43b', '#ffffff'];
  if (lk === 'snowball' || lk === 'ornament') return ['#ffffff', '#a5d8ff', '#e03131'];
  if (lk === 'cart' || lk === 'coal') return ['#212529', '#868e96', '#ffd43b'];
  if (lk === 'firebarrel' || lk === 'boulder' || lk === 'rock' || h.kind === 'fire') return ['#ff922b', '#ffd43b', '#e03131'];
  return ['#b5651d', '#7a4416', '#ffd43b'];
}
function reached(gi) {
  let p = S.player;
  if (gi > p.maxG) {
    if (gi < 6) addScore(50 * gi, p.x, p.y - 18);
    p.maxG = gi;
  }
  if (gi === 6) rescue();
}
function die(why) {
  let p = S.player; if (S.mode !== 'play') return;
  p.dead = 1.3; setMode('dying');
  SFX.die(); haptic('error'); gzSet('laugh', 1.4);
  say(why === 'fall' ? 'OUCH!' : why === 'stomp' ? 'STOMPED!' : 'WATCH OUT!', 1.2, '#ff6b6b');
}
function rescue() {
  setMode('rescue');
  addScore(2000);
  let wife = WIVES[HEROES[S.hero].wife].name;
  say(wife + ' RESCUED!', 2.6, '#ff8cc6');
  gzSet('tantrum', 3); SFX.rescue(); haptic('success');
  S.hz = [];
}

// ---- hazards ----------------------------------------------------------------------------
function updateHazards(dt) {
  let L = lvl(), p = S.player, sp = L.speed * hard();
  for (let i = S.hz.length - 1; i >= 0; i--) {
    let h = S.hz[i];
    if (h.kind === 'drop') {
      if (h.warn > 0) { h.warn -= dt; continue; }
      h.vy = Math.min(150, h.vy + GRAV * 0.5 * dt); h.y += h.vy * dt;
      if (h.y > H + 10) { S.hz.splice(i, 1); continue; }
    } else if (h.kind === 'fire') {
      updateFire(h, dt);
    } else if (h.st === 'roll') {
      let prevX = h.x;
      h.x += h.dir * sp * h.fast * dt; h.spin += h.dir * dt * 10;
      if (h.kind === 'barrel') {
        for (let k = 0; k < S.ladders.length; k++) {
          let l = S.ladders[k];
          if (l.hi !== h.g || l.hi === 6) continue;
          if ((prevX - l.x) * (h.x - l.x) <= 0 && Math.random() < L.ladderChance + (p && p.g < h.g && Math.abs(p.x - l.x) < 40 ? 0.25 : 0)) {
            h.st = 'ladder'; h.x = l.x; h.lad = l; break;
          }
        }
      }
      if (h.st === 'roll') {
        if (solidAt(h.g, h.x)) h.y = surf(h.g, h.x);
        else if (h.g === 0 && (h.x < 0 || h.x > W)) {
          S.hz.splice(i, 1);
          if (L.fire && countFire() < L.fire + Math.min(2, S.round)) spawnFire();
          continue;
        } else { h.st = 'fall'; h.vy = 0; }
      }
    } else if (h.st === 'ladder') {
      h.y += 58 * dt;
      if (h.y >= h.lad.bottom) { h.y = h.lad.bottom; h.g = h.lad.lo; h.st = 'roll'; h.dir = downhill(h.g); }
    } else if (h.st === 'fall') {
      let py = h.y;
      h.vy += GRAV * dt; h.y += h.vy * dt; h.x += h.dir * sp * 0.35 * dt;
      if (h.vy > 0) {
        for (let gi = h.g - 1; gi >= 0; gi--) {
          if (!solidAt(gi, h.x)) continue;
          let s = surf(gi, h.x);
          if (py <= s + 0.5 && h.y >= s) {
            h.y = s; h.g = gi; h.dir = downhill(gi);
            if (!h.bounced) { h.vy = -70; h.bounced = true; h.y = s - 1; }
            else { h.st = 'roll'; h.vy = 0; h.bounced = false; }
            break;
          }
        }
      }
      if (h.y > H + 10) { S.hz.splice(i, 1); continue; }
    }
    // collide with the player
    if (S.mode === 'play' && p) {
      let px0 = p.x - 4, px1 = p.x + 4, py0 = p.y - 14, py1 = p.y;
      let cy = h.kind === 'drop' || h.kind === 'fire' ? h.y : h.y - h.r;
      let nx = Math.max(px0, Math.min(h.x, px1)), ny = Math.max(py0, Math.min(cy, py1));
      let hitR = h.r - 1;
      if (!(h.kind === 'drop' && h.warn > 0) && (h.x - nx) * (h.x - nx) + (cy - ny) * (cy - ny) < hitR * hitR) { die('hit'); return; }
      // jumped over it
      if (p.st === 'air' && !h.jumped && Math.abs(h.x - p.x) < 6 && cy > p.y && cy - p.y < 28) {
        h.jumped = true; addScore(100, p.x, p.y - 20); SFX.over();
      }
    }
  }
}
function countFire() { let n = 0; S.hz.forEach(function (h) { if (h.kind === 'fire') n++; }); return n; }
function spawnFire() {
  S.hz.push({ kind: 'fire', x: 10, y: surf(0, 10), g: 0, dir: 1, st: 'walk', r: 5, jumped: false, t: 0, lad: null });
  say('ATOMIC FIRE!', 1, '#74c0fc');
}
function updateFire(h, dt) {
  let p = S.player; h.t += dt;
  if (h.st === 'climb') {
    h.y -= 22 * dt;
    if (h.y <= h.lad.top) { h.y = h.lad.top; h.g = h.lad.hi; h.st = 'walk'; }
    return;
  }
  let want = p && p.g === h.g ? (p.x > h.x ? 1 : -1) : h.dir;
  if (Math.random() < dt * 0.6) want = -want;
  h.dir = want;
  let nx = h.x + h.dir * 24 * dt;
  if (!solidAt(h.g, nx) || nx < 6 || nx > W - 6) { h.dir = -h.dir; nx = h.x; }
  h.x = nx; h.y = surf(h.g, h.x);
  if (p && p.g > h.g) {
    for (let k = 0; k < S.ladders.length; k++) {
      let l = S.ladders[k];
      if (l.lo === h.g && !l.broken && l.hi < 5 && Math.abs(l.x - h.x) < 1.5 && Math.random() < 0.5) { h.st = 'climb'; h.lad = l; h.x = l.x; break; }
    }
  }
}

// ---- main update -----------------------------------------------------------------------
function update(dt) {
  S.t += dt; S.modeT += dt;
  if (S.shakeT > 0) S.shakeT -= dt;
  for (let i = S.msgs.length - 1; i >= 0; i--) { S.msgs[i].t -= dt; if (S.msgs[i].t <= 0) S.msgs.splice(i, 1); }
  for (let j = S.pops.length - 1; j >= 0; j--) { let pp = S.pops[j]; pp.t -= dt; pp.y -= 18 * dt; if (pp.t <= 0) S.pops.splice(j, 1); }
  for (let k = S.parts.length - 1; k >= 0; k--) { let q = S.parts[k]; q.t -= dt; q.vy += 260 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.spin += dt * 9; if (q.t <= 0) S.parts.splice(k, 1); }
  updateWeather(dt);

  if (S.mode === 'select') { if (edge.U || edge.L) S.sel = 0; if (edge.D || edge.R) S.sel = 1; if (edge.J) startWith(S.sel === 0 ? 'chris' : 'shea'); }
  else if (S.mode === 'intro') { updateGodzilla(dt); if (S.modeT > 2.4 || edge.J) { setMode('play'); say('GO!', 0.8, '#69db7c'); } }
  else if (S.mode === 'play') {
    updateGodzilla(dt); updatePlayer(dt); if (S.mode === 'play') updateHazards(dt); music(dt);
    S.bonusT += dt; if (S.bonusT >= 2) { S.bonusT -= 2; S.bonus = Math.max(0, S.bonus - 100); }
  } else if (S.mode === 'dying') {
    updateGodzilla(dt); S.player.dead -= dt;
    if (S.player.dead <= 0) {
      S.lives--;
      if (S.lives < 0) { S.lives = 0; setMode('gameover'); SFX.over2(); sendScore('gameover'); }
      else { resetRun(); setMode('intro'); say(WIVES[HEROES[S.hero].wife].name + ' NEEDS YOU!', 1.8, '#ff8cc6'); }
    }
  } else if (S.mode === 'rescue') {
    updateGodzilla(dt);
    if (S.modeT > 3.2) { setMode('tally'); say('RESCUE COMPLETE!', 2, '#69db7c'); }
  } else if (S.mode === 'tally') {
    if (S.bonus > 0) { let d = Math.min(S.bonus, 100); S.bonus -= d; addScore(d); if (Math.floor(S.modeT * 20) % 2 === 0) SFX.tick(); }
    else if (S.modeT > 1.8) {
      if (S.level < LEVELS.length - 1) { S.level++; startLevel(); }
      else { setMode('win'); say('YOU SAVED THE DAY!', 4, '#ffd43b'); SFX.rescue(); }
    }
  } else if (S.mode === 'win') {
    updateGodzilla(dt);
    if (S.modeT > 5) nextRound();
  }
  edge.J = edge.A = edge.U = edge.D = edge.L = edge.R = 0;
}
function nextRound() { S.round++; S.level = 0; startLevel(); say('ROUND ' + (S.round + 1) + '!', 1.6, '#ffd43b'); }

function updateWeather(dt) {
  let T = theme();
  if (T.deco !== 'xmas' && T.deco !== 'fire') { S.snow.length = 0; return; }
  while (S.snow.length < 36) S.snow.push({ x: Math.random() * W, y: Math.random() * H, v: 10 + Math.random() * 18, w: Math.random() * 6 });
  S.snow.forEach(function (f) {
    f.w += dt;
    if (T.deco === 'xmas') { f.y += f.v * dt; f.x += Math.sin(f.w) * 6 * dt; if (f.y > H) { f.y = HUD; f.x = Math.random() * W; } }
    else { f.y -= f.v * dt; f.x += Math.sin(f.w * 2) * 8 * dt; if (f.y < HUD) { f.y = H; f.x = Math.random() * W; } }
  });
}


// ---- renderer, loop & hooks -------------------------------------------------------------
const R = createRenderer({
  glCanvas: document.getElementById('gl'), hudCanvas: hudCanvas, stage: document.getElementById('stage'),
  game: {
    S: S, G: G, W: W, H: H, HUD: HUD, GZ_X: GZ_X, GZ_W: GZ_W, TOOL_TIME: TOOL_TIME,
    HEROES: HEROES, WIVES: WIVES, THEMES: THEMES, LEVELS: LEVELS,
    lvl: lvl, theme: theme, surf: surf, solidAt: solidAt
  }
});
window.addEventListener('resize', function () { R.layout(); });
// Fixed 60 Hz steps, so the game runs at the same speed on a slow device.
let last = 0, acc = 0, STEP = 1 / 60;
function frame(ts) {
  let dt = Math.min(0.25, last ? (ts - last) / 1000 : STEP); last = ts;
  if (!S.paused && !S.menu) { acc += dt; while (acc >= STEP) { update(STEP); acc -= STEP; } }
  R.render(dt);
  let atk = document.getElementById('atk');
  let ready = S.player && S.player.tool > 0 && S.mode === 'play';
  if (atk.classList.contains('ready') !== !!ready) atk.classList.toggle('ready', !!ready);
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', function () { S.paused = document.hidden; last = 0; if (document.hidden) releaseAll(); });

// Testing / debugging hooks (the host only enables cheats in development).
window.__rampage = {
  get mode() { return S.mode; }, get score() { return S.score; }, get lives() { return S.lives; }, get level() { return S.level + 1; },
  get hero() { return S.hero; }, get hi() { return S.hi; },
  get player() { return S.player && { x: S.player.x, y: S.player.y, st: S.player.st, g: S.player.g, vx: S.player.vx, tool: S.player.tool }; },
  get hazards() { return S.hz.length; },
  get menu() { return !!S.menu; },
  routeProblems: routeProblems,
  get gl() { return R.hasGL; },
  screenPoint: function (x, y) { return R.fromLogical(x, y); } // logical → client px (tests)
};
if (INIT.debug) {
  window.__rampage.debug = {
    giveTool: function () { if (S.player) { S.player.tool = TOOL_TIME; } },
    rescue: function () { if (S.mode === 'play') { S.player.g = 6; rescue(); } },
    die: function () { die('hit'); },
    gameOver: function (score) { S.score = score | 0; if (S.score > S.hi) S.hi = S.score; S.lives = 0; die('hit'); },
    spawnBarrelAt: function (x) { let p = S.player; S.hz.push({ kind: 'barrel', look: theme().barrel, x: x, y: surf(p.g, x), g: p.g, dir: x > p.x ? -1 : 1, st: 'roll', vy: 0, r: 5, spin: 0, jumped: false, bounced: false, fast: 0.01 }); },
    pause: function (on) { S.paused = !!on; },
    setLevel: function (n) { S.level = Math.max(0, Math.min(3, n - 1)); startLevel(); },
    setGodzilla: function (st, dur) { gzSet(st, dur || 2); },
    place: function (x, g) { const p = S.player; p.x = x; p.g = g; p.y = surf(g, x); p.st = 'ground'; p.vx = 0; },
    calm: function () { S.gz.throwT = 999; S.gz.dropT = 999; S.gz.roarT = 999; S.hz.length = 0; }
  };
}

R.layout();
requestAnimationFrame(frame);
post({ type: 'ready' });
