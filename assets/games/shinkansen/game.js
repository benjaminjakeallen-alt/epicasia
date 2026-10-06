// SHINKANSEN DASH — an endless runner on the roofs of three bullet trains
// racing side by side from Tokyo to Kyoto (then round again, faster).
// Swipe left/right to hop trains, up to jump, down to slide. Jump the roof
// fairings, hop away from pantographs, slide under signal gantries and crows,
// grab onigiri, and get off a train before its nose runs out. A lucky cat
// (maneki-neko) saves you from one crash.
//
// The logic works in metres along the track: `S.dist` is how far the runner
// has come; everything ahead has an absolute distance `d` (z = S.dist - d in
// the scene). render3d.js draws it as a lit voxel world with three.js (the
// travellers' models are Godzilla Rampage's); hud.js draws text over it.
// Built into one offline HTML string by tools/build-games.mjs. The host
// injects window.SHINKANSEN_INIT = { highScore, debug } and listens for
// messages: ready, score, haptic, exit.
import { createRenderer } from './render3d.js';

const INIT = window.SHINKANSEN_INIT || {};

// ---- the world ------------------------------------------------------------------
const LANES = [-3.4, 0, 3.4]; // x of each train
const ROOF = 3.4; // roof height above the rails
const NOSE = 9; // length of a train's sloping nose
const CAR = 20; // car length; a gap between trains is two cars long
const LANE_OFF = [0, 7, 14]; // the cars of each train are staggered
const STAGE_LEN = 1000;
const STAGES = [
  { key: 'tokyo', name: 'TOKYO' },
  { key: 'country', name: 'RICE FIELDS' },
  { key: 'fuji', name: 'MOUNT FUJI' },
  { key: 'tea', name: 'TEA HILLS' },
  { key: 'kyoto', name: 'KYOTO' }
];
const HEROES = { chris: { name: 'CHRIS' }, shea: { name: 'SHEA' }, emily: { name: 'EMILY' }, heather: { name: 'HEATHER' } };
const ROSTER = ['chris', 'shea', 'emily', 'heather'];

// ---- the runner -----------------------------------------------------------------
const JUMP_V = 7.4, GRAV = 20, DIVE_V = -16; // a jump is ~1.37 m high, ~0.74 s long
const SLIDE_TIME = 0.72, LANE_TIME = 0.14, JUMP_BUFFER = 0.15;
const STAND_H = 1.7, SLIDE_H = 0.72;
const COIN = 25, NEKO = 100;

// What's on the roofs. lo/hi: height band above the roof that hits you.
const OBS = {
  hump: { len: 2.2, lo: 0, hi: 0.8 }, // a roof fairing: jump it
  panto: { len: 1.8, lo: 0, hi: 2.6 }, // a pantograph: too tall, hop trains
  crow: { len: 0.9, lo: 0.95, hi: 1.75 }, // slide under (or hop trains)
  gantry: { len: 0.7, lo: 1.0, hi: 1.9, all: true }, // a signal gantry over every train: slide
  onigiri: { len: 0.9, lo: 0.2, hi: 1.4, pickup: true },
  neko: { len: 0.9, lo: 0.2, hi: 1.5, pickup: true }
};

// ---- host bridge ------------------------------------------------------------------
function post(msg) {
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage(Object.assign({ source: 'shinkansen' }, msg), '*');
  } catch { /* host gone */ }
}
function haptic(kind) { post({ type: 'haptic', kind: kind }); }

// ---- state ------------------------------------------------------------------------
const S = {
  mode: 'select', // select | ready | run | crash | gameover
  sel: 0, hero: 'chris', t: 0, modeT: 0,
  dist: 0, speed: 0, score: 0, coins: 0, hi: Math.max(0, INIT.highScore | 0),
  stage: 0, lap: 0, maxStage: 0,
  p: null, obs: [], gaps: [], tunnels: [], msgs: [], pops: [], parts: [],
  nextRow: 0, nextGap: 0, nextTunnel: 0, shield: false, invuln: 0, calm: false,
  paused: false, menu: false, sentScore: false, shakeT: 0
};

// A small seeded random, so a run's layout can be replayed (tests).
let seed = 1;
function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }

// ---- trains & gaps ---------------------------------------------------------------
// A gap in a lane runs from g0 (our train's nose starts sloping down) to g1
// (the next train's tail is back up to full height); both on car boundaries.
function gapAt(lane, d) {
  for (let i = 0; i < S.gaps.length; i++) {
    const g = S.gaps[i];
    if (g.lane === lane && d >= g.g0 && d <= g.g1) return g;
  }
  return null;
}
/** Roof height of a lane's train at distance d, or null where there's no train. */
function roofAt(lane, d) {
  const g = gapAt(lane, d);
  if (!g) return ROOF;
  if (d < g.g0 + NOSE) return noseHeight((d - g.g0) / NOSE);
  if (d > g.g1 - NOSE) return noseHeight((g.g1 - d) / NOSE);
  return null;
}
/** Roof height along a nose, t = 0 where it joins the train … 1 at the tip (matches the mesh). */
function noseHeight(t) {
  return ROOF - (ROOF - 1.1) * Math.pow(Math.max(0, Math.min(1, t)), 1.4);
}
/** Flat roof (no nose, no gap) for a margin around d. */
function flatAt(lane, d, margin) {
  for (let i = 0; i < S.gaps.length; i++) {
    const g = S.gaps[i];
    if (g.lane === lane && d + margin >= g.g0 && d - margin <= g.g1) return false;
  }
  return true;
}
function gridUp(lane, d) { return Math.ceil((d - LANE_OFF[lane]) / CAR) * CAR + LANE_OFF[lane]; }

function scheduleGap() {
  const lane = Math.floor(rnd() * 3);
  const g0 = gridUp(lane, S.nextGap);
  const g1 = g0 + CAR * 2;
  S.gaps.push({ lane: lane, g0: g0, g1: g1 });
  // a gap at a time, with breathing room between them
  S.nextGap = g1 + Math.max(110, 260 - S.stage * 25 - S.lap * 30) + rnd() * 140;
}
function scheduleTunnel() {
  const d0 = S.nextTunnel, len = 70 + rnd() * 90;
  S.tunnels.push({ d0: d0, d1: d0 + len });
  S.nextTunnel = d0 + len + 450 + rnd() * 500;
}
function inTunnel(d) { return S.tunnels.some(function (t) { return d >= t.d0 && d <= t.d1; }); }

// ---- the obstacle rows -------------------------------------------------------------
function add(type, lane, d, extra) {
  const o = Object.assign({ type: type, lane: lane, d: d, hit: false, gone: false, h: 0 }, extra || {});
  S.obs.push(o);
  return o;
}
function coinLine(lane, d0, n, arc) {
  for (let i = 0; i < n; i++) {
    const k = n > 1 ? i / (n - 1) : 0.5;
    add('onigiri', lane, d0 + i * 2.2, { h: arc ? Math.sin(k * Math.PI) * 1.2 : 0 });
  }
}
/**
 * One row of obstacles at distance d. Every row leaves at least one train
 * you can get through (no pantograph, train present) — fairnessProblems()
 * checks that over thousands of rows.
 */
function makeRow(d) {
  const open = [0, 1, 2].filter(function (l) { return flatAt(l, d, 4); });
  if (!open.length) return [];
  const gapNear = open.length < 3; // a train is ending: no pantographs now
  const lvl = Math.min(4, S.stage + S.lap * 2);
  const r = rnd();
  const row = [];
  const put = function (type, lane, extra) { if (open.indexOf(lane) >= 0) row.push(add(type, lane, d, extra)); };
  if (r < 0.2) { // a fairing, often with onigiri arcing over it
    const l = pick(open); put('hump', l);
    if (rnd() < 0.6) coinLine(l, d - 3.3, 4, true);
  } else if (r < 0.36 && !gapNear) { // pantographs on two trains: find the third
    const free = pick(open);
    open.forEach(function (l) { if (l !== free) put('panto', l); });
    if (rnd() < 0.7) coinLine(free, d - 4, 4, false);
  } else if (r < 0.48) { // a signal gantry over everything: slide
    row.push(add('gantry', -1, d));
    if (rnd() < 0.5) coinLine(pick(open), d - 2, 3, false);
  } else if (r < 0.6 + lvl * 0.02) { // crows
    const n = lvl >= 2 && rnd() < 0.5 ? 2 : 1;
    const ls = open.slice().sort(function () { return rnd() - 0.5; }).slice(0, Math.min(n, open.length - (gapNear ? 0 : 0)));
    ls.forEach(function (l) { put('crow', l, { fly: 2 + rnd() * 2 }); });
  } else if (r < 0.76 && !gapNear) { // a mix across the three trains
    const kinds = ['panto', 'hump', lvl >= 1 ? 'crow' : 'hump'].sort(function () { return rnd() - 0.5; });
    open.forEach(function (l, i) { put(kinds[i], l); });
  } else if (r < 0.86) { // a fairing and a pantograph
    const ls = open.slice().sort(function () { return rnd() - 0.5; });
    put('hump', ls[0]);
    if (ls[1] !== undefined && !gapNear) put('panto', ls[1]);
  } else { // just onigiri
    coinLine(pick(open), d - 4, 5, false);
  }
  if (rnd() < 0.03 && !S.shield) put('neko', pick(open), { d: d - 7 });
  // Safety net: never a row with no way through.
  const passable = open.some(function (l) {
    return !row.some(function (o) { return o.lane === l && o.type === 'panto'; });
  });
  if (!passable) row.forEach(function (o) { if (o.type === 'panto') o.type = 'hump'; });
  return row;
}
function spawnAhead() {
  const ahead = S.dist + 170;
  while (S.nextGap < ahead + 60) scheduleGap();
  while (S.nextTunnel < ahead) scheduleTunnel();
  if (S.calm) return;
  while (S.nextRow < ahead) {
    makeRow(S.nextRow);
    S.nextRow += Math.max(13, S.speed * 0.95) + rnd() * 9;
  }
}
/** Checks the row generator: every row must leave a train you can get through. */
function fairnessProblems() {
  const keep = { seed: seed, obs: S.obs, gaps: S.gaps, stage: S.stage, lap: S.lap, nextGap: S.nextGap };
  const out = [];
  seed = 4242; S.obs = []; S.gaps = []; S.nextGap = 100;
  for (let stage = 0; stage < 5; stage++) {
    S.stage = stage; S.lap = stage === 4 ? 1 : 0;
    for (let i = 0; i < 600; i++) {
      const d = 100 + stage * 30000 + i * 15;
      while (S.nextGap < d + 200) scheduleGap();
      S.obs = [];
      const row = makeRow(d);
      const ok = [0, 1, 2].some(function (l) {
        return flatAt(l, d, 4) && !row.some(function (o) { return o.lane === l && o.type === 'panto' && Math.abs(o.d - d) < 1; });
      });
      if (!ok) out.push('stage ' + (stage + 1) + ' row ' + i + ': no way through');
      for (let a = 0; a < S.gaps.length; a++)
        for (let b = a + 1; b < S.gaps.length; b++)
          if (S.gaps[a].g1 > S.gaps[b].g0 - 40 && S.gaps[b].g1 > S.gaps[a].g0 - 40) { out.push('gaps overlap'); }
      S.gaps = S.gaps.filter(function (g) { return g.g1 > d - 100; });
    }
  }
  Object.assign(S, { obs: keep.obs, gaps: keep.gaps, stage: keep.stage, lap: keep.lap, nextGap: keep.nextGap });
  seed = keep.seed;
  return out.filter(function (x, i, a) { return a.indexOf(x) === i; });
}

// ---- sound (Web Audio, synthesized) ------------------------------------------------
let AC = null, master = null, muted = false;
try { muted = localStorage.getItem('shinkansen.muted') === '1'; } catch { /* storage off (sandboxed) */ }
function audio() {
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.connect(AC.destination); } catch { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
  if (master) master.gain.value = muted ? 0 : 1;
  return AC;
}
function tone(f, d, type, vol, slideTo, delay) {
  const a = audio(); if (!a || muted) return;
  const t0 = a.currentTime + (delay || 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(f, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + d);
  g.gain.setValueAtTime(vol || 0.05, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + d + 0.02);
}
function noise(d, vol, freq, delay) {
  const a = audio(); if (!a || muted) return;
  const t0 = a.currentTime + (delay || 0), n = Math.floor(a.sampleRate * d);
  const buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  f.type = 'lowpass'; f.frequency.value = freq || 800; g.gain.value = vol || 0.12;
  src.buffer = buf; src.connect(f); f.connect(g); g.connect(master); src.start(t0);
}
const SFX = {
  jump: function () { tone(380, 0.16, 'square', 0.04, 760); },
  slide: function () { noise(0.25, 0.08, 1800); },
  hop: function () { noise(0.1, 0.06, 3000); tone(600, 0.06, 'triangle', 0.03, 900); },
  coin: function () { tone(1318, 0.07, 'square', 0.035); tone(1760, 0.1, 'square', 0.035, 0, 0.06); },
  neko: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0.09, 'square', 0.04, 0, i * 0.07); }); },
  crash: function () { noise(0.6, 0.22, 900); tone(220, 0.6, 'sawtooth', 0.06, 50); },
  shield: function () { noise(0.3, 0.14, 2400); tone(880, 0.3, 'triangle', 0.05, 220); },
  horn: function () { tone(330, 0.7, 'sawtooth', 0.035); tone(415, 0.7, 'sawtooth', 0.03); },
  chime: function () { [659, 831, 988, 1319].forEach(function (f, i) { tone(f, 0.22, 'sine', 0.06, 0, i * 0.16); }); },
  count: function (hi) { tone(hi ? 1046 : 523, hi ? 0.35 : 0.14, 'square', 0.045); }
};
// A light chiptune loop while running.
const MELODY = [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 1046, 988, 784, 659, 587];
const BASS = [131, 131, 175, 175, 147, 147, 196, 196];
let musicT = 0, step = 0;
function music(dt) {
  if (S.mode !== 'run' || muted) return;
  musicT -= dt;
  if (musicT > 0) return;
  musicT += 0.15 / Math.min(1.3, 0.9 + S.speed / 90);
  if (step % 2 === 0) tone(MELODY[(step / 2) % 16], 0.12, 'triangle', 0.035);
  if (step % 4 === 0) tone(BASS[(step / 4) % 8], 0.3, 'square', 0.025);
  if (step % 4 === 2) noise(0.04, 0.03, 6000);
  step++;
}

// ---- messages & particles --------------------------------------------------------------
function say(txt, dur, col, big) { S.msgs.push({ txt: txt, t: dur || 1.4, d: dur || 1.4, col: col || '#ffd43b', big: !!big }); }
function burst(x, y, z, cols, n, spd) {
  for (let i = 0; i < (n || 14); i++) {
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, v = (spd || 4) * (0.5 + Math.random());
    S.parts.push({ x: x, y: y, z: z, vx: Math.cos(a) * Math.cos(b) * v, vy: Math.sin(b) * v + 2, vz: Math.sin(a) * Math.cos(b) * v, t: 0.5 + Math.random() * 0.5, col: cols[i % cols.length], s: 0.12 + Math.random() * 0.12 });
  }
}

// ---- runs -----------------------------------------------------------------------------
function setMode(m) {
  S.mode = m; S.modeT = 0;
  document.getElementById('over').classList.toggle('show', m === 'gameover');
}
function newRun(hero) {
  S.hero = hero; S.sel = ROSTER.indexOf(hero);
  seed = INIT.seed || (Date.now() % 2147483646) + 1;
  Object.assign(S, {
    dist: 0, speed: 0, score: 0, coins: 0, stage: 0, lap: 0, maxStage: 0, obs: [], gaps: [], tunnels: [], parts: [], pops: [],
    nextRow: 60, nextGap: 260, nextTunnel: 380, jumps: 0, slides: 0, shield: false, invuln: 0, sentScore: false, calm: false
  });
  S.p = { lane: 1, from: 1, x: LANES[1], laneT: 1, y: ROOF, vy: 0, air: false, slideT: 0, jbuf: 0, dive: false, anim: 0, crash: null };
  S.msgs = [];
  setMode('ready');
  SFX.horn();
}
function sendScore(outcome) {
  if (S.sentScore || S.score <= 0) return;
  S.sentScore = true;
  post({ type: 'score', score: S.score, level: S.maxStage + 1, round: S.lap + 1, hero: S.hero, outcome: outcome });
}
function crash(why) {
  if (S.mode !== 'run') return;
  if (S.invuln > 0) return;
  if (S.shield && why !== 'fall') {
    S.shield = false; S.invuln = 1.2;
    say('LUCKY CAT SAVED YOU!', 1.6, '#ffe066');
    SFX.shield(); haptic('success');
    burst(S.p.x, S.p.y + 1, 0, ['#ffffff', '#ffe066', '#ff8787'], 24, 5);
    return;
  }
  S.p.crash = why;
  setMode('crash');
  SFX.crash(); haptic('error'); S.shakeT = 0.4;
  say(why === 'fall' ? 'MIND THE GAP!' : why === 'side' ? 'TOO LATE!' : 'OUCH!', 1.2, '#ff6b6b', true);
  burst(S.p.x, S.p.y + 1, 0, ['#ffffff', '#ffd43b', '#adb5bd'], 20, 5);
}

// ---- input ------------------------------------------------------------------------------
function act(dir) {
  audio();
  if (S.menu) return;
  if (S.mode === 'select') {
    if (dir === 'L') S.sel = (S.sel + 3) % 4;
    else if (dir === 'R') S.sel = (S.sel + 1) % 4;
    else if (dir === 'U' || dir === 'go') newRun(ROSTER[S.sel]);
    return;
  }
  if (S.mode === 'gameover') { if (dir === 'go') newRun(S.hero); return; }
  if (S.mode !== 'run' && S.mode !== 'ready') return;
  const p = S.p;
  if (dir === 'L' || dir === 'R') {
    const to = Math.max(0, Math.min(2, p.lane + (dir === 'L' ? -1 : 1)));
    if (to === p.lane) { SFX.hop(); return; }
    p.from = p.x; p.lane = to; p.laneT = 0; SFX.hop();
  } else if (dir === 'U') {
    if (!p.air) jump(p); else p.jbuf = JUMP_BUFFER;
  } else if (dir === 'D') {
    if (p.air) { p.vy = Math.min(p.vy, DIVE_V); p.dive = true; } else { p.slideT = SLIDE_TIME; S.slides++; SFX.slide(); }
  }
}
function jump(p) { p.air = true; p.vy = JUMP_V; p.slideT = 0; p.jbuf = 0; S.jumps++; SFX.jump(); }

const KEYS = { ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R', ArrowUp: 'U', w: 'U', W: 'U', ' ': 'U', ArrowDown: 'D', s: 'D', S: 'D' };
window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { setMenu(!S.menu); e.preventDefault(); return; }
  if (S.menu) return;
  if (e.key === 'Enter') { act('go'); e.preventDefault(); return; }
  const k = KEYS[e.key];
  if (k && !e.repeat) { act(k); e.preventDefault(); }
});
// Swipes anywhere on the screen; one move per swipe (lift and swipe again).
const stage = document.getElementById('stage');
const SWIPE = 22; // px
let touch = null;
stage.addEventListener('pointerdown', function (e) {
  if (e.target.closest && e.target.closest('button')) return;
  audio();
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), fired: false };
});
stage.addEventListener('pointermove', function (e) {
  if (!touch || touch.id !== e.pointerId || touch.fired) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
  touch.fired = true;
  act(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'L' : 'R') : (dy < 0 ? 'U' : 'D'));
});
function touchEnd(e) {
  if (!touch || touch.id !== e.pointerId) return;
  const tapped = !touch.fired && performance.now() - touch.t < 400;
  const x = e.clientX;
  touch = null;
  if (!tapped) return;
  if (S.mode === 'select') {
    const i = R.heroAt(x);
    if (i >= 0) { S.sel = i; newRun(ROSTER[i]); }
  } else if (S.mode === 'ready') S.modeT = Math.max(S.modeT, 2.4);
}
stage.addEventListener('pointerup', touchEnd);
stage.addEventListener('pointercancel', function () { touch = null; });
window.addEventListener('blur', function () { touch = null; });

const pauseEl = document.getElementById('pause');
function setMenu(on) {
  S.menu = on; pauseEl.classList.toggle('show', on);
  if (on) document.getElementById('resume').focus();
}
document.getElementById('pausebtn').addEventListener('click', function () { setMenu(true); });
document.getElementById('resume').addEventListener('click', function () { setMenu(false); });
document.getElementById('psound').addEventListener('click', function () {
  muted = !muted; try { localStorage.setItem('shinkansen.muted', muted ? '1' : '0'); } catch { /* ok */ }
  audio(); syncMute();
});
document.getElementById('exit').addEventListener('click', function () { sendScore('quit'); post({ type: 'exit' }); });
document.getElementById('again').addEventListener('click', function () { newRun(S.hero); });
document.getElementById('change').addEventListener('click', function () { setMode('select'); });
function syncMute() { document.getElementById('psound').textContent = muted ? 'SOUND: OFF' : 'SOUND: ON'; if (master) master.gain.value = muted ? 0 : 1; }
syncMute();

// ---- update -----------------------------------------------------------------------------
function speedFor(d) { return Math.min(36, 15 + d * 0.0045); }

function updateRunner(dt) {
  const p = S.p;
  // hop between trains
  if (p.laneT < 1) {
    p.laneT = Math.min(1, p.laneT + dt / LANE_TIME);
    p.x = p.from + (LANES[p.lane] - p.from) * (1 - Math.pow(1 - p.laneT, 2));
  }
  const lane = nearestLane(p.x);
  const roof = roofAt(lane, S.dist);
  // warn once when the train you're on is about to end
  S.gaps.forEach(function (g) {
    const ahead = g.g0 - S.dist;
    if (!g.warned && g.lane === p.lane && ahead > 0 && ahead < 15 + S.speed * 2.2) { g.warned = true; say('END OF THE TRAIN — HOP!', 1.5, '#ff9f43'); haptic('light'); }
  });
  if (p.slideT > 0) p.slideT -= dt;
  if (p.jbuf > 0) p.jbuf -= dt;
  if (S.invuln > 0) S.invuln -= dt;
  p.anim += dt * (6 + S.speed * 0.25);

  if (p.air) {
    p.vy -= GRAV * dt; p.y += p.vy * dt;
    if (roof !== null && p.y <= roof && p.vy <= 0) {
      p.y = roof; p.air = false; p.vy = 0;
      if (p.dive) { p.dive = false; p.slideT = SLIDE_TIME; SFX.slide(); }
      if (p.jbuf > 0) jump(p);
    } else if (p.y < 0.6) return crash('fall');
  } else if (roof === null) {
    p.air = true; p.vy = 0; // ran off the nose
  } else if (roof > p.y + 0.5) {
    return crash('side'); // hopped into the side of a train from down on a nose
  } else {
    p.y = roof;
    if (roof < ROOF - 0.05 && p.slideT <= 0 && Math.floor(S.t * 4) % 3 === 0 && S.modeT > 0.2) { /* sliding down the nose */ }
  }
  if (!p.air && roof !== null && roof < 1.4) { p.air = true; p.vy = 0; }

  // obstacles & pickups
  const h = p.slideT > 0 ? SLIDE_H : STAND_H;
  for (let i = 0; i < S.obs.length; i++) {
    const o = S.obs[i];
    if (o.gone || o.hit) continue;
    const def = OBS[o.type];
    if (Math.abs(o.d - S.dist) > def.len / 2 + 0.35) continue;
    if (!def.all && o.lane !== lane) continue;
    const base = def.all ? ROOF : (roofAt(o.lane, o.d) || ROOF);
    const lo = base + def.lo + (o.h || 0), hi = base + def.hi + (o.h || 0);
    if (p.y + h <= lo || p.y >= hi) continue;
    if (def.pickup) {
      o.gone = true;
      if (o.type === 'onigiri') { S.coins++; S.score += COIN; SFX.coin(); S.pops.push({ txt: '+' + COIN, t: 0.7, x: o.lane, y: lo + 0.8, d: o.d }); }
      else { S.shield = true; S.score += NEKO; SFX.neko(); haptic('success'); say('LUCKY CAT!', 1.4, '#ffe066'); }
      continue;
    }
    o.hit = true;
    crash(o.type);
    if (S.mode !== 'run') return;
    o.gone = true; // the lucky cat smashed it
  }
}
function nearestLane(x) { let b = 0; for (let i = 1; i < 3; i++) if (Math.abs(LANES[i] - x) < Math.abs(LANES[b] - x)) b = i; return b; }

function update(dt) {
  S.t += dt; S.modeT += dt;
  if (S.shakeT > 0) S.shakeT -= dt;
  for (let i = S.msgs.length - 1; i >= 0; i--) { S.msgs[i].t -= dt; if (S.msgs[i].t <= 0) S.msgs.splice(i, 1); }
  for (let i = S.pops.length - 1; i >= 0; i--) { S.pops[i].t -= dt; S.pops[i].y += dt * 1.5; if (S.pops[i].t <= 0) S.pops.splice(i, 1); }
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const q = S.parts[i]; q.t -= dt; q.vy -= 12 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    if (q.t <= 0) S.parts.splice(i, 1);
  }

  if (S.mode === 'ready') {
    const k = S.modeT;
    if (Math.floor(k / 0.8) !== Math.floor((k - dt) / 0.8) && k < 2.4) SFX.count(false);
    S.speed = Math.min(speedFor(0), S.speed + dt * 12);
    S.dist += S.speed * dt * 0.4;
    if (k >= 2.4) { setMode('run'); SFX.count(true); say('GO!', 0.8, '#69db7c', true); }
    spawnAhead();
  } else if (S.mode === 'run') {
    S.speed = speedFor(S.dist);
    const before = S.dist;
    S.dist += S.speed * dt;
    S.score += Math.floor(S.dist) - Math.floor(before);
    if (S.score > S.hi) S.hi = S.score;
    // crows fly at you
    S.obs.forEach(function (o) { if (o.type === 'crow') o.d -= (o.fly || 2) * dt; });
    spawnAhead();
    updateRunner(dt);
    // stages: Tokyo → … → Kyoto, then round again
    const st = Math.floor(S.dist / STAGE_LEN), stage = st % 5, lap = Math.floor(st / 5);
    if (stage !== S.stage || lap !== S.lap) {
      S.stage = stage; S.lap = lap; S.maxStage = Math.max(S.maxStage, lap > 0 ? 4 : stage);
      if (stage === 0) { say('ROUND ' + (lap + 1) + '!', 2, '#ffe066', true); say('BACK TO TOKYO, FASTER', 2, '#ffffff'); }
      else say(STAGES[stage].name, 2.2, '#ffffff', true);
      SFX.chime(); haptic('light');
    }
    music(dt);
  } else if (S.mode === 'crash') {
    S.speed = Math.max(0, S.speed - dt * 40);
    S.dist += S.speed * dt;
    const p = S.p;
    if (p.crash === 'fall' || p.air) { p.vy -= GRAV * dt; p.y = Math.max(-3, p.y + p.vy * dt); }
    if (S.modeT > 1.3) { setMode('gameover'); sendScore('gameover'); }
  }
  // forget what's behind
  S.obs = S.obs.filter(function (o) { return o.d > S.dist - 12; });
  S.gaps = S.gaps.filter(function (g) { return g.g1 > S.dist - 30; });
  S.tunnels = S.tunnels.filter(function (t) { return t.d1 > S.dist - 30; });
}

// ---- renderer, loop & hooks ---------------------------------------------------------------
const R = createRenderer({
  glCanvas: document.getElementById('gl'), hudCanvas: document.getElementById('hud'), stage: stage,
  game: { S: S, LANES: LANES, ROOF: ROOF, noseHeight: noseHeight, NOSE: NOSE, CAR: CAR, LANE_OFF: LANE_OFF, STAGES: STAGES, STAGE_LEN: STAGE_LEN, HEROES: HEROES, ROSTER: ROSTER, OBS: OBS, roofAt: roofAt, inTunnel: inTunnel, SLIDE_TIME: SLIDE_TIME }
});
window.addEventListener('resize', function () { R.layout(); });
let last = 0, acc = 0;
const STEP = 1 / 60;
function frame(ts) {
  const dt = Math.min(0.25, last ? (ts - last) / 1000 : STEP); last = ts;
  if (!S.paused && !S.menu) { acc += dt; while (acc >= STEP) { update(STEP); acc -= STEP; } }
  R.render(dt);
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', function () {
  S.paused = document.hidden; last = 0;
  if (document.hidden && (S.mode === 'run' || S.mode === 'ready')) setMenu(true);
});

window.__dash = {
  get mode() { return S.mode; }, get score() { return S.score; }, get dist() { return S.dist; }, get speed() { return S.speed; },
  get lane() { return S.p ? S.p.lane : null; }, get hero() { return S.hero; }, get hi() { return S.hi; }, get coins() { return S.coins; },
  get stage() { return S.stage + 1; }, get round() { return S.lap + 1; }, get shield() { return S.shield; }, get menu() { return S.menu; },
  get y() { return S.p ? S.p.y - ROOF : null; }, get air() { return !!(S.p && S.p.air); }, get sliding() { return !!(S.p && S.p.slideT > 0); },
  get gl() { return R.hasGL; }, get sel() { return S.sel; }, get jumps() { return S.jumps; }, get slides() { return S.slides; }, get invuln() { return S.invuln > 0; },
  fairnessProblems: fairnessProblems,
  heroPoint: function (i) { return R.heroPoint(i); } // where hero i stands on the select screen (client px, tests)
};
if (INIT.debug) {
  window.__dash.debug = {
    calm: function () { S.calm = true; S.obs.length = 0; S.gaps.length = 0; S.nextGap = 1e9; },
    spawn: function (type, lane, ahead) { add(type, lane, S.dist + ahead, type === 'crow' ? { fly: 0 } : {}); },
    gap: function (lane, ahead) { const g0 = gridUp(lane, S.dist + ahead); S.gaps.push({ lane: lane, g0: g0, g1: g0 + CAR * 2 }); return g0 - S.dist; },
    lane: function (l) { const p = S.p; p.lane = l; p.x = LANES[l]; p.laneT = 1; },
    setDist: function (d) { S.dist = d; S.nextRow = d + 60; S.obs.length = 0; },
    shield: function () { S.shield = true; },
    gameOver: function (score) { S.score = score | 0; if (S.score > S.hi) S.hi = S.score; crash('hit'); },
    pause: function (on) { S.paused = !!on; },
    go: function () { if (S.mode === 'ready') S.modeT = 2.4; }
  };
}

R.layout();
requestAnimationFrame(frame);
post({ type: 'ready' });
