// Chain Gang Dynasty — up to four travellers chained together cross the
// Great Wall of China, side-on, in three stretches (levels.js). Runs inside
// the app's sandboxed iframe (null origin): the app passes
// window.CHAINGANG_INIT = { mode, me, players, highScore, debug } and relays
// network messages, because only the app can reach the room.
//
//   solo    you and bots (the other travellers) on this phone
//   host    this phone runs the one true simulation (sim.js) for the room,
//           takes everyone's inputs and sends snapshots ~12 times a second
//   client  sends its stick/buttons and draws the host's snapshots, a beat
//           behind so it can blend between them
//
// Messages to the app: ready, net {msg} (relay to the room), score, haptic,
// exit. From the app: net {msg}, peer-left {i}, host-left.

import { LEVELS } from './levels.js';
import { STEP, createSim, stepSim, botInput, simulateLevel } from './sim.js';
import { createRenderer } from './render3d.js';

const INIT = window.CHAINGANG_INIT || {};
export const HEROES = ['chris', 'jake', 'bennett', 'miles'];
export const NAMES = { chris: 'CHRIS', jake: 'JAKE', bennett: 'BENNETT', miles: 'MILES' };
export const COLORS = ['#ff2d95', '#18e0ff', '#ffe11a', '#b57bff']; // each place on the chain
const PAR = [110, 110, 120]; // seconds for a time bonus
const TITLE_T = 2.8, CLEAR_T = 4.5;
const SNAP_EVERY = 1 / 12, INPUT_EVERY = 0.25, INTERP = 0.15;

const NET = INIT.mode === 'host' || INIT.mode === 'client' ? INIT.mode : 'solo';
const ME = NET === 'solo' ? 0 : INIT.me | 0;
function defaultRoster() {
  const mine = HEROES.includes(INIT.hero) ? INIT.hero : 'chris';
  return [mine].concat(HEROES.filter((h) => h !== mine)).map((hero, i) => ({ hero, name: i ? NAMES[hero] : 'YOU', bot: i > 0 }));
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
};
export function levelScore(lv, time, falls) {
  return Math.max(250, Math.round(1000 + Math.max(0, PAR[lv] - time) * 10 - falls * 60));
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
    case 'whoops': SFX.whoops(); message(who ? 'WHOOPS, ' + who.name + '!' : 'WHOOPS!', '#ff2d95', 2); haptic('error'); break;
    case 'checkpoint': SFX.checkpoint(); message('WATCHTOWER!', '#18e0ff'); haptic('success'); break;
    case 'zip': SFX.zip(); break;
    case 'knock': SFX.knock(); if (ev.i === S.me) haptic('heavy'); break;
    case 'scramble': if (ev.i === S.me) SFX.scramble(); break;
    case 'done': SFX.gong(); break;
  }
  if (renderer) renderer.event(ev);
}

// ---- input: a joystick (walk), JUMP and GRAB; keys too -------------------------------------
const KEYS = { ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R', ' ': 'J', ArrowUp: 'J', w: 'J', W: 'J', z: 'J', Z: 'J',
  Shift: 'G', e: 'G', E: 'G', j: 'G', J: 'G', x: 'G', X: 'G', ArrowDown: 'G', s: 'G', S: 'G' };
const keys = { L: false, R: false, J: false, G: false };
const stickEl = document.querySelector('.stick'), knobEl = document.querySelector('.knob');
const jumpEl = document.getElementById('jumpbtn'), grabEl = document.getElementById('grabbtn');
const pad = { id: null, x: 0, jumpId: null, grabId: null, taps: 0 };
function readInput() {
  const kx = (keys.R ? 1 : 0) - (keys.L ? 1 : 0);
  return { x: kx || pad.x, jump: keys.J || pad.jumpId !== null, grab: keys.G || pad.grabId !== null };
}
function stickShow(kx, ky) {
  knobEl.style.transform = 'translate(' + (kx || 0) + 'px,' + (ky || 0) + 'px)';
  stickEl.classList.toggle('on', pad.id !== null);
  stickEl.setAttribute('data-dir', pad.x > 0.25 ? 'R' : pad.x < -0.25 ? 'L' : '');
}
function stickRead(e) {
  const r = stickEl.getBoundingClientRect(), R = Math.max(1, r.width / 2 - knobEl.offsetWidth / 2);
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  pad.x = dx / R;
  stickShow(dx, dy);
}
stickEl.addEventListener('pointerdown', (e) => {
  e.preventDefault(); audio();
  pad.id = e.pointerId; // a new thumb always takes over, so it can never stick
  try { stickEl.setPointerCapture(e.pointerId); } catch { /* ok */ }
  stickRead(e);
});
stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === pad.id) stickRead(e); });
function stickUp(e) { if (e.pointerId === pad.id) { pad.id = null; pad.x = 0; stickShow(0, 0); } }
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
window.addEventListener('pointerup', (e) => { stickUp(e); btnUp(e); }, true);
window.addEventListener('pointercancel', (e) => { stickUp(e); btnUp(e); }, true);
['touchend', 'touchcancel'].forEach((t) => document.addEventListener(t, (e) => { if (!e.touches.length) padRelease(); }, true));
function padRelease() {
  pad.id = null; pad.x = 0; pad.jumpId = null; pad.grabId = null;
  keys.L = keys.R = keys.J = keys.G = false;
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
  prev = S.sim.players.map((p) => ({ x: p.x, y: p.y }));
  if (S.auto) S.sim.players[S.me].bot = true;
  setMode('title');
}
const remote = {}; // host: latest input from each phone {x, jump, grab, taps}
const seenTaps = {};
let prev = null, acc = 0, sinceSnap = 0, events = [];

function inputsFor(sim) {
  return sim.players.map((p, i) => {
    if (p.bot) return botInput(sim, i);
    if (i === S.me) {
      const inp = readInput(), tap = pad.taps > (seenTaps.me || 0);
      seenTaps.me = pad.taps;
      return Object.assign(inp, { tap });
    }
    const r = remote[i];
    if (!r) return { x: 0, jump: false, grab: false };
    const tap = (r.taps | 0) > (seenTaps[i] | 0);
    seenTaps[i] = r.taps | 0;
    return { x: r.x, jump: r.jump, grab: r.grab, tap };
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
      prev = S.sim.players.map((p) => ({ x: p.x, y: p.y }));
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
    t: 's', mode: S.mode, mt: r2(S.modeT), lv: S.level, tm: sim ? r2(sim.t) : 0, cp: sim ? sim.cp : 0, f: sim ? sim.falls : 0,
    sc: S.scores, bots: S.roster.map((r) => (r.bot ? 1 : 0)),
    ps: sim ? sim.players.map((p) => [r2(p.x), r2(p.y), r2(p.vx), r2(p.vy),
      (p.ground ? 1 : 0) | (p.grab ? 2 : 0) | (p.zip ? 4 : 0) | (p.taut ? 8 : 0) | (p.knockT > 0 ? 16 : 0), p.face]) : [],
    cr: sim ? sim.crumble.map((c) => (c.gone ? -1 : r2(c.stood + c.heavy * 4))) : [],
    br: sim ? sim.barrels.map((b) => [r2(b.x), r2(b.y), r2(b.spin)]) : [],
    ev: events,
  };
}
const snaps = []; // client: the last few snapshots, oldest first
let clientClock = null, lastSnapAt = 0;
function onSnapshot(s) {
  if (S.gone) return;
  const prevMode = S.mode, prevLevel = S.level;
  if (s.lv !== S.level || !snaps.length) snaps.length = 0;
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
  for (const ev of s.ev || []) onEvent(ev);
}
let lastSent = '', sinceInput = 0;
function clientUpdate(dt) {
  // say hello until the host's snapshots arrive
  if (!snaps.length) {
    sinceInput += dt;
    if (sinceInput > 1) { sinceInput = 0; send({ t: 'hi', i: S.me }); }
    return;
  }
  if (clientClock !== null) {
    const newest = snaps[snaps.length - 1].tm, target = newest - INTERP;
    clientClock += dt;
    clientClock += (target - clientClock) * Math.min(1, dt * 2); // drift toward the host's time
  }
  if (S.mode === 'play' || S.mode === 'title') {
    const inp = S.menu ? { x: 0, jump: false, grab: false } : readInput();
    const msg = { t: 'i', i: S.me, x: Math.round(inp.x * 10) / 10, jump: inp.jump, grab: inp.grab, taps: pad.taps };
    const key = JSON.stringify(msg);
    sinceInput += dt;
    if (key !== lastSent || sinceInput > INPUT_EVERY) { send(msg); lastSent = key; sinceInput = 0; }
  }
}
function clientView() {
  if (!snaps.length) return null;
  let a = snaps[0], b = snaps[snaps.length - 1];
  for (let k = 0; k + 1 < snaps.length; k++) if (snaps[k].tm <= clientClock && snaps[k + 1].tm >= clientClock) { a = snaps[k]; b = snaps[k + 1]; break; }
  const span = b.tm - a.tm, k = span > 0 ? Math.max(0, Math.min(1, (clientClock - a.tm) / span)) : 1;
  const lerp = (u, v) => u + (v - u) * k;
  const t = span > 0 ? lerp(a.tm, b.tm) : b.tm;
  return {
    lv: b.lv, t, cp: b.cp, falls: b.f,
    players: b.ps.map((q, i) => {
      const p = a.ps[i] || q;
      return makePlayer(i, lerp(p[0], q[0]), lerp(p[1], q[1]), q[2], q[3], q[4], q[5]);
    }),
    crumble: b.cr.map((c) => ({ gone: c < 0, stood: Math.max(0, c) })),
    barrels: b.br.map((q) => { const p = a.br.find((o) => Math.abs(o[0] - q[0]) < 1.5) || q; return { x: lerp(p[0], q[0]), y: lerp(p[1], q[1]), spin: q[2] }; }),
  };
}
function makePlayer(i, x, y, vx, vy, flags, face) {
  const r = S.roster[i];
  return { i, hero: r.hero, name: i === S.me ? 'YOU' : r.name, color: COLORS[i], bot: r.bot, me: i === S.me,
    x, y, vx, vy, ground: !!(flags & 1), grab: !!(flags & 2), zip: !!(flags & 4), taut: !!(flags & 8), knock: !!(flags & 16), face: face || 1 };
}
function hostView() {
  const sim = S.sim;
  if (!sim) return null;
  const k = Math.min(1, acc / STEP);
  return {
    lv: S.level, t: sim.t, cp: sim.cp, falls: sim.falls,
    players: sim.players.map((p, i) => {
      const q = prev && prev[i] ? prev[i] : p;
      return makePlayer(i, q.x + (p.x - q.x) * k, q.y + (p.y - q.y) * k, p.vx, p.vy,
        (p.ground ? 1 : 0) | (p.grab ? 2 : 0) | (p.zip ? 4 : 0) | (p.taut ? 8 : 0) | (p.knockT > 0 ? 16 : 0), p.face);
    }),
    crumble: sim.crumble.map((c) => ({ gone: c.gone, stood: c.stood + c.heavy * 4 })),
    barrels: sim.barrels.map((b) => ({ x: b.x, y: b.y, spin: b.spin })),
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
      else if (m.t === 'i' && typeof m.i === 'number' && m.i !== S.me && m.i >= 0 && m.i < S.roster.length) {
        ready.add(m.i);
        remote[m.i] = { x: Math.max(-1, Math.min(1, +m.x || 0)), jump: !!m.jump, grab: !!m.grab, taps: m.taps | 0 };
      }
    } else if (S.net === 'client' && m.t === 's') onSnapshot(m);
  } else if (d.type === 'peer-left' && S.net === 'host' && typeof d.i === 'number' && S.roster[d.i]) {
    // someone's phone left: a bot carries on in their place
    S.roster[d.i].bot = true;
    if (S.sim) S.sim.players[d.i].bot = true;
    message(S.roster[d.i].name + ' LEFT · A BOT TOOK OVER', '#ffe11a', 2.4);
  } else if (d.type === 'host-left' && S.net === 'client') {
    S.gone = true; setMode('gone');
  }
});

// ---- the frame loop ----------------------------------------------------------------------------
renderer = createRenderer({
  glCanvas: document.getElementById('gl'), hudCanvas: document.getElementById('hud'), stage: document.getElementById('stage'),
  game: { S, LEVELS, COLORS, NAMES, PAR },
});
let last = performance.now();
function frame(now) {
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
  renderer.draw(now / 1000, dt);
  requestAnimationFrame(frame);
}
syncButtons();
requestAnimationFrame(frame);

// ---- for tests ---------------------------------------------------------------------------------
window.__chain = {
  get mode() { return S.mode; }, get net() { return S.net; }, get me() { return S.me; }, get level() { return S.level; },
  get total() { return S.total; }, get scores() { return S.scores; }, get falls() { return S.view ? S.view.falls : 0; },
  get cp() { return S.view ? S.view.cp : 0; }, get menu() { return S.menu; }, get gl() { return renderer.gl; },
  get players() { return S.view ? S.view.players.map((p) => ({ x: p.x, y: p.y, hero: p.hero, bot: p.bot, ground: p.ground, grab: p.grab })) : []; },
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
    finishLevel() { if (S.sim && S.mode === 'play') { S.sim.players.forEach((p) => { p.x = S.sim.level.finish + 1; p.y = 30; }); } },
    setLevel(n) { if (S.net !== 'client') startLevel(n); },
    fall() { if (S.sim) S.sim.players[S.me].y = S.sim.level.fallY - 5; },
    warp(x, y) { if (S.sim) S.sim.players.forEach((p, i) => { p.x = x - i * 1.3; p.y = y; p.vx = p.vy = 0; }); },
    skipTitle() { if (S.mode === 'title') S.modeT = TITLE_T + 1; if (S.mode === 'clear') S.modeT = CLEAR_T + 1; },
  };
}
post({ type: 'ready' });
