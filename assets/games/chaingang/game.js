// Chain Gang Dynasty — up to four travellers chained together cross the
// Great Wall of China, side-on, in three stretches (levels.js). Runs inside
// the app's sandboxed iframe (null origin): the app passes
// window.CHAINGANG_INIT = { mode, me, players, highScore, debug } and relays
// network messages, because only the app can reach the room.
//
//   solo    you and bots (the other travellers) on this phone
//   host    this phone runs the room's simulation (sim.js) and sends
//           snapshots 15 times a second; the other phones' travellers are
//           puppets in it, placed where their phones say they are
//   client  moves its own traveller itself, at once, in a local copy of the
//           sim (no waiting on the network — that was the lag), tells the host
//           where it is 15 times a second, and draws everyone else from the
//           host's snapshots, a beat behind so it can blend between them
//
// Messages to the app: ready, net {msg} (relay to the room), score, haptic,
// exit. From the app: net {msg}, peer-left {i}, host-left.

import { LEVELS } from './levels.js';
import { STEP, createSim, stepSim, botInput, simulateLevel, knock } from './sim.js';
import { createRenderer } from './render3d.js';

const INIT = window.CHAINGANG_INIT || {};
export const HEROES = ['chris', 'jake', 'bennett', 'miles', 'mei'];
export const NAMES = { chris: 'CHRIS', jake: 'JAKE', bennett: 'BENNETT', miles: 'MILES', mei: 'MEI' };
export const COLORS = ['#ff2d95', '#18e0ff', '#ffe11a', '#b57bff']; // each place on the chain
const PAR = [110, 126, 172]; // seconds for a time bonus (the 2nd and 3rd are 15% harder, the 3rd a quarter longer)
const TITLE_T = 2.8, CLEAR_T = 4.5;
const SNAP_EVERY = 1 / 15, STATE_EVERY = 1 / 15, INTERP = 0.12;

const NET = INIT.mode === 'host' || INIT.mode === 'client' ? INIT.mode : 'solo';
const ME = NET === 'solo' ? 0 : INIT.me | 0;
function defaultRoster() {
  const mine = HEROES.includes(INIT.hero) ? INIT.hero : 'chris';
  return [mine].concat(HEROES.filter((h) => h !== mine)).slice(0, 4).map((hero, i) => ({ hero, name: i ? NAMES[hero] : 'YOU', bot: i > 0 }));
}
const ROSTER = (Array.isArray(INIT.players) && INIT.players.length ? INIT.players : defaultRoster())
  .slice(0, 4).map((p, i) => ({ hero: HEROES.includes(p.hero) ? p.hero : HEROES[i], name: String(p.name || NAMES[p.hero] || 'TRAVELLER').slice(0, 14).toUpperCase(), bot: !!p.bot }));

function post(msg) {
  try { if (window.parent && window.parent !== window) window.parent.postMessage(Object.assign({ source: 'chaingang' }, msg), '*'); } catch { /* ok */ }
}
const send = (msg) => post({ type: 'net', msg });
function haptic(kind) { post({ type: 'haptic', kind }); }

// ---- state ------------------------------------------------------------------------------
export const S = {
  net: NET, me: ME, roster: ROSTER,
  mode: NET === 'client' ? 'wait' : 'lobby', // lobby (host: waiting for phones) → title → play → clear → … → finish
  modeT: 0, level: 0, sim: null, scores: [], total: 0, falls: 0, menu: false, sent: false,
  hi: Math.max(0, INIT.highScore | 0), msgs: [], view: null, gone: false, auto: false,
  cam: { yaw: Math.PI, pitch: 0.5, dragAt: -1e9 }, // where the camera looks (yaw 0 = +z)
};
/** Turns the camera to look along a direction on the ground. */
function lookAlong(dir) { S.cam.yaw = Math.atan2(dir[0], dir[1]); }
export function levelScore(lv, time, falls) {
  return Math.max(250, Math.round(1000 + Math.max(0, PAR[lv] - time) * 10 - falls * 60));
}

function lookBack() { // after a fall: face on from the watchtower everyone is back at
  const L = LEVELS[S.level], cp = S.view ? S.view.cp : 0;
  lookAlong(cp === 0 ? L.spawn.dir : L.checks[cp - 1].dir);
}
function setMode(m) { S.mode = m; S.modeT = 0; syncButtons(); }
function message(text, color, life) { S.msgs.push({ text, color: color || '#ffffff', t: 0, life: life || 1.6 }); }

// ---- sound (Web Audio, synthesized) ------------------------------------------------
let AC = null, master = null, muted = false;
try { muted = localStorage.getItem('chaingang.muted') === '1'; } catch { /* storage off (sandboxed) */ }
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.connect(AC.destination); } catch { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  if (master) master.gain.value = muted ? 0 : 1;
  return AC;
}
function tone(f, d, type, vol, slideTo, delay) {
  const a = audio(); if (!a || muted) return;
  const t0 = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
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
  jump: () => tone(330, 0.14, 'square', 0.03, 620),
  land: () => noise(0.06, 0.05, 600),
  boing: () => { noise(0.35, 0.12, 2600); tone(220, 0.4, 'sawtooth', 0.04, 880); [0.25, 0.32, 0.4].forEach((d) => noise(0.08, 0.12, 4000, d)); },
  crumble: () => { noise(0.7, 0.2, 420); tone(90, 0.6, 'sawtooth', 0.05, 40); },
  whoops: () => { [392, 370, 349, 311].forEach((f, i) => tone(f, i === 3 ? 0.6 : 0.24, 'sawtooth', 0.045, i === 3 ? 260 : 0, i * 0.22)); },
  checkpoint: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.04, 0, i * 0.09)); },
  zip: () => { tone(900, 0.6, 'sawtooth', 0.025, 1800); noise(0.6, 0.05, 3000); },
  knock: () => { noise(0.18, 0.18, 1500); [0, 0.07, 0.13].forEach((d) => noise(0.05, 0.14, 5000, d)); },
  scramble: () => tone(260, 0.08, 'triangle', 0.04, 420),
  gong: () => { tone(110, 2.4, 'sine', 0.18, 104); tone(166, 2, 'sine', 0.08); tone(247, 1.4, 'sine', 0.05); noise(0.4, 0.06, 900); },
  clear: () => { [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'square', 0.045, 0, i * 0.12)); },
};

// ---- events (from the sim on host/solo, from snapshots on clients) --------------------------
let renderer = null;
function onEvent(ev) {
  const who = S.view && S.view.players[ev.i];
  switch (ev.e) {
    case 'jump': if (ev.i === S.me) SFX.jump(); break;
    case 'land': if (ev.i === S.me) SFX.land(); break;
    case 'boing': SFX.boing(); if (ev.i === S.me) haptic('heavy'); break;
    case 'crumble': SFX.crumble(); break;
    case 'whoops': lookBack(); SFX.whoops(); message(who ? 'WHOOPS, ' + who.name + '!' : 'WHOOPS!', '#ff2d95', 2); haptic('error'); break;
    case 'checkpoint': SFX.checkpoint(); message('WATCHTOWER!', '#18e0ff'); haptic('success'); break;
    case 'zip': SFX.zip(); break;
    case 'knock': SFX.knock(); if (ev.i === S.me) haptic('heavy'); break;
    case 'scramble': if (ev.i === S.me) SFX.scramble(); break;
    case 'done': SFX.gong(); break;
  }
  if (renderer) renderer.event(ev);
}

// ---- input: a joystick (walk, relative to the camera), JUMP and GRAB; drag
// anywhere else to look around. Keys: arrows/WASD walk, Space jumps,
// Shift/E/J grabs, Q/R (or , and .) turn the camera.
const KEYS = { ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R', ArrowUp: 'F', w: 'F', W: 'F', ArrowDown: 'B', s: 'B', S: 'B',
  ' ': 'J', z: 'J', Z: 'J', Shift: 'G', e: 'G', E: 'G', j: 'G', J: 'G', x: 'G', X: 'G', q: 'CL', Q: 'CL', ',': 'CL', r: 'CR', R: 'CR', '.': 'CR' };
const keys = { L: false, R: false, F: false, B: false, J: false, G: false, CL: false, CR: false };
const stickEl = document.querySelector('.stick'), knobEl = document.querySelector('.knob');
const jumpEl = document.getElementById('jumpbtn'), grabEl = document.getElementById('grabbtn');
const pad = { id: null, x: 0, y: 0, jumpId: null, grabId: null, taps: 0, lookId: null, lookX: 0, lookY: 0 };
/** The stick (or keys) turned into a direction on the ground, from where the camera looks. */
function readInput() {
  const kx = (keys.R ? 1 : 0) - (keys.L ? 1 : 0), ky = (keys.B ? 1 : 0) - (keys.F ? 1 : 0);
  let sx = kx || pad.x, sy = ky || pad.y;
  const m = Math.hypot(sx, sy);
  if (m > 1) { sx /= m; sy /= m; }
  const fx = Math.sin(S.cam.yaw), fz = Math.cos(S.cam.yaw); // forward; right is (−fz, fx)
  const mx = fx * -sy + -fz * sx, mz = fz * -sy + fx * sx;
  return { mx: Math.round(mx * 100) / 100, mz: Math.round(mz * 100) / 100, jump: keys.J || pad.jumpId !== null, grab: keys.G || pad.grabId !== null };
}
function stickShow(kx, ky) {
  knobEl.style.transform = 'translate(' + (kx || 0) + 'px,' + (ky || 0) + 'px)';
  stickEl.classList.toggle('on', pad.id !== null);
  stickEl.setAttribute('data-dir', [pad.y < -0.3 ? 'U' : '', pad.y > 0.3 ? 'D' : '', pad.x < -0.3 ? 'L' : '', pad.x > 0.3 ? 'R' : ''].join(' ').trim());
}
function stickRead(e) {
  const r = stickEl.getBoundingClientRect(), R = Math.max(1, r.width / 2 - knobEl.offsetWidth / 2);
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  pad.x = dx / R; pad.y = dy / R;
  stickShow(dx, dy);
}
stickEl.addEventListener('pointerdown', (e) => {
  e.preventDefault(); audio();
  pad.id = e.pointerId; // a new thumb always takes over, so it can never stick
  try { stickEl.setPointerCapture(e.pointerId); } catch { /* ok */ }
  stickRead(e);
});
stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === pad.id) stickRead(e); });
function stickUp(e) { if (e.pointerId === pad.id) { pad.id = null; pad.x = pad.y = 0; stickShow(0, 0); } }
// look around: drag anywhere that isn't a control
const stageEl = document.getElementById('stage');
stageEl.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, .stick, .card')) return;
  pad.lookId = e.pointerId; pad.lookX = e.clientX; pad.lookY = e.clientY; audio();
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pad.lookId) return;
  S.cam.yaw -= (e.clientX - pad.lookX) * 0.009;
  S.cam.pitch = Math.max(0.05, Math.min(1.1, S.cam.pitch + (e.clientY - pad.lookY) * 0.006));
  pad.lookX = e.clientX; pad.lookY = e.clientY; S.cam.dragAt = performance.now();
});
function lookUp(e) { if (e.pointerId === pad.lookId) pad.lookId = null; }
function btnDown(el, k) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); audio();
    pad[k] = e.pointerId; el.classList.add('on');
    if (k === 'jumpId') pad.taps++;
    try { el.setPointerCapture(e.pointerId); } catch { /* ok */ }
  });
}
btnDown(jumpEl, 'jumpId'); btnDown(grabEl, 'grabId');
function btnUp(e) {
  if (e.pointerId === pad.jumpId) { pad.jumpId = null; jumpEl.classList.remove('on'); }
  if (e.pointerId === pad.grabId) { pad.grabId = null; grabEl.classList.remove('on'); }
}
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => { stickEl.addEventListener(t, stickUp); jumpEl.addEventListener(t, btnUp); grabEl.addEventListener(t, btnUp); });
window.addEventListener('pointerup', (e) => { stickUp(e); btnUp(e); lookUp(e); }, true);
window.addEventListener('pointercancel', (e) => { stickUp(e); btnUp(e); lookUp(e); }, true);
['touchend', 'touchcancel'].forEach((t) => document.addEventListener(t, (e) => { if (!e.touches.length) padRelease(); }, true));
function padRelease() {
  pad.id = null; pad.x = pad.y = 0; pad.jumpId = null; pad.grabId = null; pad.lookId = null;
  Object.keys(keys).forEach((k) => { keys[k] = false; });
  jumpEl.classList.remove('on'); grabEl.classList.remove('on'); stickShow(0, 0);
}
window.addEventListener('blur', padRelease);
document.addEventListener('visibilitychange', () => { if (document.hidden) padRelease(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { setMenu(!S.menu); e.preventDefault(); return; }
  if (S.menu) return;
  const k = KEYS[e.key];
  if (!k) return;
  audio();
  if (k === 'J' && !e.repeat && !keys.J) pad.taps++;
  keys[k] = true; e.preventDefault();
});
window.addEventListener('keyup', (e) => { const k = KEYS[e.key]; if (k) { keys[k] = false; e.preventDefault(); } });

// ---- menus ---------------------------------------------------------------------------------
const pauseEl = document.getElementById('pause'), overEl = document.getElementById('over');
function setMenu(on) {
  S.menu = on; pauseEl.classList.toggle('show', on);
  padRelease();
  if (on) document.getElementById('resume').focus();
}
document.getElementById('pausebtn').addEventListener('click', () => setMenu(true));
document.getElementById('resume').addEventListener('click', () => setMenu(false));
document.getElementById('psound').addEventListener('click', () => {
  muted = !muted; try { localStorage.setItem('chaingang.muted', muted ? '1' : '0'); } catch { /* ok */ }
  audio(); syncMute();
});
function syncMute() { document.getElementById('psound').textContent = muted ? 'SOUND: OFF' : 'SOUND: ON'; if (master) master.gain.value = muted ? 0 : 1; }
syncMute();
function leave() { sendScore('quit'); post({ type: 'exit' }); }
document.getElementById('exit').addEventListener('click', leave);
document.getElementById('leave').addEventListener('click', leave);
document.getElementById('again').addEventListener('click', () => {
  if (S.net === 'client') return;
  startRun();
});
function syncButtons() {
  const over = S.mode === 'finish' || S.mode === 'gone';
  overEl.classList.toggle('show', over);
  document.getElementById('again').style.display = over && S.net !== 'client' && S.mode !== 'gone' ? '' : 'none';
  document.querySelector('#pad').classList.toggle('show', !over);
}

// ---- scores ---------------------------------------------------------------------------------
function sendScore(outcome) {
  if (S.sent || S.total <= 0) return;
  S.sent = true;
  S.hi = Math.max(S.hi, S.total);
  post({ type: 'score', score: S.total, level: Math.max(1, S.scores.length), round: 1, hero: S.roster[S.me].hero, outcome });
}

// ---- the run (host and solo) -----------------------------------------------------------------
const ready = new Set([S.me]); // host: phones whose game has loaded
let lobbyWait = 0;
function startRun() {
  Object.assign(S, { scores: [], total: 0, falls: 0, sent: false, level: 0 });
  startLevel(0);
}
function startLevel(lv) {
  S.level = lv;
  S.sim = createSim(lv, S.roster.map((r) => ({ hero: r.hero, bot: r.bot })));
  // the other phones' travellers: puppets, moved by their own phones
  if (S.net === 'host') S.sim.players.forEach((p, i) => { p.puppet = !p.bot && i !== S.me; });
  lookAlong(LEVELS[lv].spawn.dir);
  prev = S.sim.players.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  if (S.auto) S.sim.players[S.me].bot = true;
  setMode('title');
}
const remote = {}; // host: where each phone last said its traveller is
const seenTaps = {};
let prev = null, acc = 0, sinceSnap = 0, events = [];

function inputsFor(sim) {
  return sim.players.map((p, i) => {
    if (p.bot) return botInput(sim, i);
    if (i === S.me) return myInput();
    return {}; // a puppet: its phone moves it (placePuppets)
  });
}
function myInput() {
  if (S.menu) return { mx: 0, mz: 0, jump: false, grab: false };
  const inp = readInput(), tap = pad.taps > (seenTaps.me || 0);
  seenTaps.me = pad.taps;
  return Object.assign(inp, { tap });
}
/** Host: each puppet goes where its phone last said, carried on a moment by
 *  its speed (so it glides rather than hopping 15 times a second). */
// (debug.fall: steps of game time left to hold the gang below the wall — counted in steps, not
// seconds, because a page in the background only ticks about once a second)
const dropSteps = { host: 0, mine: 0 };
function dropNow(which) {
  if (dropSteps[which] <= 0) return;
  if (which === 'host' && S.sim) S.sim.players.forEach((p) => { if (!p.puppet) { p.y = S.sim.level.fallY - 5; p.vy = 0; } });
  if (which === 'mine' && mine.sim) { const m = mine.sim.players[S.me]; m.y = mine.sim.level.fallY - 5; m.vy = 0; }
}
function placePuppets(sim) {
  const now = performance.now();
  sim.players.forEach((p, i) => {
    if (!p.puppet) return;
    if (p.knockT > 0) p.knockT -= STEP;
    const r = remote[i];
    if (!r || r.lv !== S.level || r.rs !== (sim.rs || 0)) return; // nothing yet, or from before a fall: stay put
    const age = Math.min(0.1, (now - r.at) / 1000);
    Object.assign(p, { x: r.x + r.vx * age, y: r.y + (r.f & 1 ? 0 : r.vy * age), z: r.z + r.vz * age, vx: r.vx, vy: r.vy, vz: r.vz, face: r.face });
    p.ground = r.f & 1 ? (r.c >= 0 ? { crumble: r.c, id: 'c' + r.c } : { puppet: true }) : null;
    p.grab = !!(r.f & 2); p.zip = r.f & 4 ? { puppet: true } : null;
  });
}

function hostUpdate(dt) {
  if (S.mode === 'lobby') {
    lobbyWait += dt;
    // every phone in the room has loaded its game (or long enough has passed)
    const humans = S.roster.map((r, i) => (!r.bot ? i : -1)).filter((i) => i >= 0);
    if (humans.every((i) => ready.has(i)) || lobbyWait > 8) startRun();
    return;
  }
  if (S.mode === 'title') { if (S.modeT > TITLE_T) setMode('play'); }
  else if (S.mode === 'clear') {
    if (S.modeT > CLEAR_T) {
      if (S.level + 1 < LEVELS.length) startLevel(S.level + 1);
      else { setMode('finish'); sendScore('finish'); }
    }
  }
  if (S.mode === 'play' && !(S.menu && S.net === 'solo')) {
    acc += Math.min(dt, 0.1);
    while (acc >= STEP) {
      acc -= STEP;
      prev = S.sim.players.map((p) => ({ x: p.x, y: p.y, z: p.z }));
      placePuppets(S.sim);
      dropNow('host'); if (dropSteps.host > 0) dropSteps.host--;
      stepSim(S.sim, inputsFor(S.sim));
      for (const ev of S.sim.events) { events.push(ev); onEvent(ev); }
      if (S.sim.done !== null) {
        const sc = levelScore(S.level, S.sim.done, S.sim.falls);
        S.scores.push({ score: sc, time: S.sim.done, falls: S.sim.falls });
        S.total += sc; S.falls += S.sim.falls;
        SFX.clear(); haptic('success');
        setMode('clear');
        break;
      }
    }
  } else acc = 0;
  if (S.net === 'host') {
    sinceSnap += dt;
    if (sinceSnap >= SNAP_EVERY) { sinceSnap = 0; send(snapshot()); events = []; }
  } else events = [];
}

// ---- snapshots ---------------------------------------------------------------------------------
const r2 = (v) => Math.round(v * 100) / 100;
function snapshot() {
  const sim = S.sim;
  return {
    t: 's', mode: S.mode, mt: r2(S.modeT), lv: S.level, tm: sim ? r2(sim.t) : 0, cp: sim ? sim.cp : 0, f: sim ? sim.falls : 0, rs: sim ? sim.rs || 0 : 0,
    sc: S.scores, bots: S.roster.map((r) => (r.bot ? 1 : 0)),
    ps: sim ? sim.players.map((p) => [r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vy), r2(p.vz), flagsOf(p), r2(p.face)]) : [],
    cr: sim ? sim.crumble.map((c) => (c.gone ? -1 : r2(c.stood + c.heavy * 4))) : [],
    br: sim ? sim.barrels.map((b) => [r2(b.x), r2(b.y), r2(b.z), r2(b.spin), b.dx, b.dz]) : [],
    ev: events,
  };
}
const flagsOf = (p) => (p.ground ? 1 : 0) | (p.grab ? 2 : 0) | (p.zip ? 4 : 0) | (p.taut ? 8 : 0) | (p.knockT > 0 ? 16 : 0);
const snaps = []; // client: the last few snapshots, oldest first
let clientClock = null, lastSnapAt = 0;
function onSnapshot(s) {
  if (S.gone) return;
  const prevMode = S.mode, prevLevel = S.level;
  if (s.lv !== S.level || !snaps.length) { snaps.length = 0; lookAlong(LEVELS[s.lv].spawn.dir); }
  S.level = s.lv; S.scores = s.sc || []; S.total = S.scores.reduce((a, b) => a + b.score, 0);
  S.roster.forEach((r, i) => { r.bot = !!(s.bots && s.bots[i]); });
  if (s.mode !== prevMode || s.lv !== prevLevel) {
    if (prevMode === 'finish') S.sent = false; // the host started again
    setMode(s.mode);
    if (s.mode === 'clear') { SFX.clear(); haptic('success'); }
    if (s.mode === 'finish') sendScore('finish');
  }
  S.modeT = s.mt;
  snaps.push(s);
  while (snaps.length > 8) snaps.shift();
  if (clientClock === null || Math.abs(clientClock - (s.tm - INTERP)) > 0.6) clientClock = s.tm - INTERP;
  lastSnapAt = performance.now();
  for (const ev of s.ev || []) {
    // a barrel hit us on the host: knock our own traveller back here
    if (ev.e === 'knock' && ev.i === S.me && mine.sim && mine.lv === s.lv) knock(mine.sim.players[S.me], ev.dx || 0, ev.dz || 0);
    onEvent(ev);
  }
}
// Client: your own traveller lives in a local copy of the sim, where only it
// moves (the others are put where the host's snapshots show them, a beat
// behind). After a fall or on a new stretch the host's word wins: it jumps
// to where the host has it.
const mine = { sim: null, lv: -1, rs: -1, acc: 0, prev: null };
let sinceState = 0, sinceHello = 0;
function syncMine(s) {
  const q = s.ps[S.me];
  if (!q) return;
  if (!mine.sim || mine.lv !== s.lv) {
    mine.sim = createSim(s.lv, S.roster.map((r) => ({ hero: r.hero, bot: false })));
    mine.sim.local = S.me; mine.lv = s.lv; mine.rs = -1;
  }
  // the host moved us (back to a watchtower, or still on a title card): go where it says
  if (mine.rs !== (s.rs || 0) || S.mode !== 'play') {
    mine.rs = s.rs || 0;
    Object.assign(mine.sim.players[S.me], { x: q[0], y: q[1], z: q[2], vx: 0, vy: 0, vz: 0, ground: null, zip: null, grab: false, knockT: 0, fallT: 0, face: q[7] });
    mine.prev = null;
  }
}
function clientUpdate(dt) {
  // say hello until the host's snapshots arrive
  if (!snaps.length) {
    sinceHello += dt;
    if (sinceHello > 1) { sinceHello = 0; send({ t: 'hi', i: S.me }); }
    return;
  }
  if (clientClock !== null) {
    const newest = snaps[snaps.length - 1].tm, target = newest - INTERP;
    clientClock += dt;
    clientClock += (target - clientClock) * Math.min(1, dt * 2); // drift toward the host's time
  }
  const last = snaps[snaps.length - 1];
  syncMine(last);
  if (S.mode !== 'play' || !mine.sim) return;
  // step our own traveller at once, the others placed from the snapshots
  const sim = mine.sim, me = sim.players[S.me], view = clientView();
  mine.acc += Math.min(dt, 0.1);
  while (mine.acc >= STEP) {
    mine.acc -= STEP;
    mine.prev = { x: me.x, y: me.y, z: me.z };
    sim.t = clientClock + INTERP; // (the host's "now", near enough: the moving things are where they'll be)
    view.players.forEach((q, i) => {
      if (i === S.me) return;
      Object.assign(sim.players[i], { x: q.x, y: q.y, z: q.z, vx: q.vx, vy: q.vy, vz: q.vz, grab: q.grab, ground: q.ground ? { ghost: true } : null, zip: q.zip ? { ghost: true } : null });
    });
    view.crumble.forEach((c, k) => { sim.crumble[k].gone = c.gone; });
    dropNow('mine');
    stepSim(sim, sim.players.map((_, i) => (i === S.me ? myInput() : {})));
    dropNow('mine'); if (dropSteps.mine > 0) dropSteps.mine--; // (and after: our rope to the others, as this phone last saw them, mustn't haul us back up)
    for (const ev of sim.events) if (ev.i === S.me) onEvent(ev);
  }
  // tell the host where we are
  sinceState += dt;
  if (sinceState >= STATE_EVERY) {
    sinceState = 0;
    const g = me.ground, flags = (g ? 1 : 0) | (me.grab ? 2 : 0) | (me.zip ? 4 : 0);
    send({ t: 'p', i: S.me, lv: mine.lv, rs: mine.rs, x: r2(me.x), y: r2(me.y), z: r2(me.z), vx: r2(me.vx), vy: r2(me.vy), vz: r2(me.vz), f: flags, c: g && g.crumble !== undefined ? g.crumble : -1, face: r2(me.face) });
  }
}
function clientView() {
  if (!snaps.length) return null;
  let a = snaps[0], b = snaps[snaps.length - 1];
  for (let k = 0; k + 1 < snaps.length; k++) if (snaps[k].tm <= clientClock && snaps[k + 1].tm >= clientClock) { a = snaps[k]; b = snaps[k + 1]; break; }
  const span = b.tm - a.tm, k = span > 0 ? Math.max(0, Math.min(1, (clientClock - a.tm) / span)) : 1;
  const lerp = (u, v) => u + (v - u) * k;
  const t = span > 0 ? lerp(a.tm, b.tm) : b.tm;
  // (moving things are drawn where our own traveller has them — "now" — so we never seem to stand beside a cart)
  const own = mine.sim && S.mode === 'play' && mine.lv === b.lv;
  return {
    lv: b.lv, t: own ? mine.sim.t : t, cp: b.cp, falls: b.f,
    players: b.ps.map((q, i) => {
      if (i === S.me && mine.sim && S.mode === 'play' && mine.lv === b.lv) { // ourselves: from our own sim, right now
        const m = mine.sim.players[S.me], o = mine.prev || m, k2 = Math.min(1, mine.acc / STEP);
        return makePlayer(i, o.x + (m.x - o.x) * k2, o.y + (m.y - o.y) * k2, o.z + (m.z - o.z) * k2, m.vx, m.vy, m.vz, flagsOf(m), m.face);
      }
      const p = a.ps[i] || q;
      let df = q[7] - p[7]; df = Math.atan2(Math.sin(df), Math.cos(df));
      return makePlayer(i, lerp(p[0], q[0]), lerp(p[1], q[1]), lerp(p[2], q[2]), q[3], q[4], q[5], q[6], p[7] + df * k);
    }),
    crumble: b.cr.map((c) => ({ gone: c < 0, stood: Math.max(0, c) })),
    barrels: b.br.map((q) => {
      const p = a.br.find((o) => Math.hypot(o[0] - q[0], o[2] - q[2]) < 1.5) || q;
      return { x: lerp(p[0], q[0]), y: lerp(p[1], q[1]), z: lerp(p[2], q[2]), spin: q[3], dx: q[4], dz: q[5] };
    }),
  };
}
function makePlayer(i, x, y, z, vx, vy, vz, flags, face) {
  const r = S.roster[i];
  return { i, hero: r.hero, name: i === S.me ? 'YOU' : r.name, color: COLORS[i], bot: r.bot, me: i === S.me,
    x, y, z, vx, vy, vz, ground: !!(flags & 1), grab: !!(flags & 2), zip: !!(flags & 4), taut: !!(flags & 8), knock: !!(flags & 16), face: face || 0 };
}
function hostView() {
  const sim = S.sim;
  if (!sim) return null;
  const k = Math.min(1, acc / STEP);
  return {
    lv: S.level, t: sim.t, cp: sim.cp, falls: sim.falls,
    players: sim.players.map((p, i) => {
      const q = prev && prev[i] ? prev[i] : p;
      return makePlayer(i, q.x + (p.x - q.x) * k, q.y + (p.y - q.y) * k, q.z + (p.z - q.z) * k, p.vx, p.vy, p.vz, flagsOf(p), p.face);
    }),
    crumble: sim.crumble.map((c) => ({ gone: c.gone, stood: c.stood + c.heavy * 4 })),
    barrels: sim.barrels.map((b) => ({ x: b.x, y: b.y, z: b.z, spin: b.spin, dx: b.dx, dz: b.dz })),
  };
}

// ---- messages from the app ----------------------------------------------------------------------
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.source !== 'chaingang-app') return;
  if (d.type === 'net' && d.msg) {
    const m = d.msg;
    if (S.net === 'host') {
      if (m.t === 'hi' && typeof m.i === 'number') ready.add(m.i);
      else if (m.t === 'p' && typeof m.i === 'number' && m.i !== S.me && m.i >= 0 && m.i < S.roster.length) {
        ready.add(m.i);
        const n = (v) => (Number.isFinite(+v) ? +v : 0);
        remote[m.i] = { lv: m.lv | 0, rs: m.rs | 0, x: n(m.x), y: n(m.y), z: n(m.z), vx: n(m.vx), vy: n(m.vy), vz: n(m.vz), f: m.f | 0, c: Number.isInteger(m.c) ? m.c : -1, face: n(m.face), at: performance.now() };
      }
    } else if (S.net === 'client' && m.t === 's') onSnapshot(m);
  } else if (d.type === 'peer-left' && S.net === 'host' && typeof d.i === 'number' && S.roster[d.i]) {
    // someone's phone left: a bot carries on in their place
    S.roster[d.i].bot = true;
    if (S.sim) Object.assign(S.sim.players[d.i], { bot: true, puppet: false });
    message(S.roster[d.i].name + ' LEFT · A BOT TOOK OVER', '#ffe11a', 2.4);
  } else if (d.type === 'host-left' && S.net === 'client') {
    S.gone = true; setMode('gone');
  }
});

// The camera turns with Q/R (or , .), by dragging, and otherwise drifts round
// behind you as you run forward — only forward: drifting while you steer
// sideways turned "left" with it, so a held stick ran you round in a curve.
function steerCamera(dt) {
  if (keys.CL) S.cam.yaw += dt * 2.2;
  if (keys.CR) S.cam.yaw -= dt * 2.2;
  const me = S.view && S.view.players[S.me];
  if (!me || performance.now() - S.cam.dragAt < 1500 || keys.CL || keys.CR) return;
  const sx = ((keys.R ? 1 : 0) - (keys.L ? 1 : 0)) || pad.x, sy = ((keys.B ? 1 : 0) - (keys.F ? 1 : 0)) || pad.y;
  if (!me.zip && (sy > -0.5 || Math.abs(sx) > 0.5)) return; // steering, not running on (on the zip line it always follows)
  const speed = Math.hypot(me.vx, me.vz);
  if (speed < 1.5 || !me.ground && !me.zip) return;
  let d = Math.atan2(me.vx, me.vz) - S.cam.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) < 1.2) S.cam.yaw += d * Math.min(1, dt * 1.6 * Math.min(1, speed / 5));
}

// ---- the frame loop ----------------------------------------------------------------------------
renderer = createRenderer({
  glCanvas: document.getElementById('gl'), hudCanvas: document.getElementById('hud'), stage: document.getElementById('stage'),
  game: { S, LEVELS, COLORS, NAMES, PAR },
});
let last = performance.now();
function frame(now) {
  tick(now);
  requestAnimationFrame(frame);
}
// A hidden page gets no animation frames; a timer keeps the game (and,
// on the host, everyone's game) going until it's back in front.
setInterval(() => { const now = performance.now(); if (now - last > 150) tick(now); }, 100);
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  S.modeT += dt;
  S.msgs.forEach((m) => { m.t += dt; });
  S.msgs = S.msgs.filter((m) => m.t < m.life);
  if (S.net === 'client') {
    clientUpdate(dt);
    // the host has gone quiet: say so (the app tells us if it really left)
    S.stale = snaps.length > 0 && performance.now() - lastSnapAt > 4000 && S.mode !== 'finish';
  } else hostUpdate(dt);
  S.view = S.net === 'client' ? clientView() : hostView();
  steerCamera(dt);
  if (!document.hidden) renderer.draw(now / 1000, dt);
}
syncButtons();
requestAnimationFrame(frame);

// ---- for tests ---------------------------------------------------------------------------------
window.__chain = {
  get mode() { return S.mode; }, get net() { return S.net; }, get me() { return S.me; }, get level() { return S.level; },
  get total() { return S.total; }, get scores() { return S.scores; }, get falls() { return S.view ? S.view.falls : 0; },
  get cp() { return S.view ? S.view.cp : 0; }, get menu() { return S.menu; }, get gl() { return renderer.gl; }, get camYaw() { return S.cam.yaw; },
  get players() { return S.view ? S.view.players.map((p) => ({ x: p.x, y: p.y, z: p.z, hero: p.hero, bot: p.bot, ground: p.ground, grab: p.grab })) : []; },
  get roster() { return S.roster.map((r) => Object.assign({}, r)); },
  screenPoint: (x, y) => renderer.screenPoint(x, y),
  // a whole gang of bots plays a stretch headless (the levels must be winnable)
  simulate: (lv, n, startAt) => simulateLevel(lv, n, 240, startAt || 0),
  programs: () => renderer.programs(),
};
if (INIT.debug) {
  window.__chain.debug = {
    // let a bot drive this phone's traveller (host/solo only)
    auto(on) { S.auto = on !== false; if (S.sim) S.sim.players[S.me].bot = S.auto || S.roster[S.me].bot; },
    finishLevel() { // straight past every watchtower to the finish
      if (!S.sim || S.mode !== 'play') return;
      const f = S.sim.level.finish;
      S.sim.cp = S.sim.level.checks.length;
      S.sim.players.forEach((p, i) => { Object.assign(p, { x: f.x - f.dir[0] * i * 0.8, y: f.y + 0.3, z: f.z - f.dir[1] * i * 0.8, vx: 0, vy: 0, vz: 0 }); });
    },
    setLevel(n) { if (S.net !== 'client') startLevel(n); },
    // the whole gang off the wall, held below it for 1.5 s of game time (long enough to count as a fall) — on a
    // client only our own traveller: the others are the host's to drop
    fall() { dropSteps.host = dropSteps.mine = 90; dropNow('host'); dropNow('mine'); },
    warp(x, y, z, yaw) { if (S.sim) S.sim.players.forEach((p, i) => { Object.assign(p, { x, y: y + i * 0.01, z: z + i * 1.2, vx: 0, vy: 0, vz: 0 }); p.ni = 0; }); if (yaw !== undefined) S.cam.yaw = yaw; },
    skipTitle() { if (S.mode === 'title') S.modeT = TITLE_T + 1; if (S.mode === 'clear') S.modeT = CLEAR_T + 1; },
  };
}
post({ type: 'ready' });
