// Tug of Wall — up to four travellers chained together cross the
// Great Wall of China, in four stretches (levels.js). Runs inside
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
import { SFX, audio, music, duck, isMuted, isMusicOn, setMuted, setMusic, musicState } from './sound.js';

const INIT = window.CHAINGANG_INIT || {};
export const HEROES = ['chris', 'jake', 'bennett', 'miles', 'mei'];
export const NAMES = { chris: 'CHRIS', jake: 'JAKE', bennett: 'BENNETT', miles: 'MILES', mei: 'MEI' };
export const COLORS = ['#ff2d95', '#18e0ff', '#ffe11a', '#b57bff']; // each place on the chain
const PAR = [110, 126, 172, 168]; // seconds for a time bonus (the 2nd and 3rd are 15% harder, the 3rd a quarter longer; the 4th, at night, everything at once)
/** A stretch's medal: gold for well under par with at most one fall, silver for par, bronze for getting there. */
export function medalFor(lv, time, falls) {
  return time <= PAR[lv] * 0.85 && falls <= 1 ? 'gold' : time <= PAR[lv] && falls <= 3 ? 'silver' : 'bronze';
}
// Emotes (review, Oct 17 2026): a speech bubble over your traveller, seen on every phone.
export const EMOTES = ['👋 HI!', '⏳ WAIT!', '➡️ THIS WAY!', '🙌 NICE!'];
const TIPS_HOLD = 12; // the first time ever (solo): the first title card waits for a tap, at most this long
const TITLE_T = 2.8, CLEAR_T = 4.5;
const PITCH = 0.42, HANG_PITCH = 0.12; // how far the camera looks down on you (and while you hang off a ledge)
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
  modeT: 0, level: 0, sim: null, scores: [], total: 0, falls: 0, fallsBy: [], menu: false, sent: false, tips: !!INIT.tips, emotes: [],
  hi: Math.max(0, INIT.highScore | 0), msgs: [], view: null, gone: false, auto: false,
  // where the camera looks (yaw 0 = +z): `base` follows the way on along the Wall by itself, `peek` is
  // a look round from dragging the screen that springs back when you let go
  cam: { yaw: Math.PI, base: Math.PI, peek: 0, pitch: PITCH, dragAt: -1e9, s: -1, hang: 0, lift: 0 },
};
/** Turns the camera to look along a direction on the ground. */
function lookAlong(dir) { S.cam.base = S.cam.yaw = Math.atan2(dir[0], dir[1]); S.cam.peek = 0; S.cam.s = -1; }
export function levelScore(lv, time, falls) {
  return Math.max(250, Math.round(1000 + Math.max(0, PAR[lv] - time) * 10 - falls * 60));
}

function lookBack() { // after a fall: face on from the watchtower everyone is back at
  const L = LEVELS[S.level], cp = S.view ? S.view.cp : 0;
  lookAlong(cp === 0 ? L.spawn.dir : L.checks[cp - 1].dir);
}
function setMode(m) { S.mode = m; S.modeT = 0; syncButtons(); }
function message(text, color, life) { S.msgs.push({ text, color: color || '#ffffff', t: 0, life: life || 1.6 }); }

// ---- events (from the sim on host/solo, from snapshots on clients) --------------------------
let renderer = null;
function onEvent(ev) {
  const who = S.view && S.view.players[ev.i];
  switch (ev.e) {
    case 'jump': if (ev.i === S.me) SFX.jump(); break;
    case 'land': if (ev.i === S.me) SFX.land(); break;
    case 'boing': SFX.boing(); if (ev.i === S.me) haptic('heavy'); break;
    case 'crumble': SFX.crumble(); break;
    case 'whoops': dropSteps.host = dropSteps.mine = 0; lookBack(); SFX.whoops(); message(who ? 'WHOOPS, ' + who.name + '!' : 'WHOOPS!', '#ff2d95', 2); haptic('error'); break;
    case 'restart': lookAlong(LEVELS[S.view ? S.view.lv : S.level].spawn.dir); message('BACK TO THE START!', '#ffd23f', 2); break;
    case 'checkpoint': SFX.checkpoint(); message('WATCHTOWER!', '#18e0ff'); haptic('success'); break;
    case 'zip': SFX.zip(); break;
    case 'knock': SFX.knock(); if (ev.i === S.me) haptic('heavy'); break;
    case 'scramble': if (ev.i === S.me) SFX.scramble(); break;
    case 'done': SFX.gong(); break;
    case 'emote': if (EMOTES[ev.k]) { S.emotes[ev.i] = { k: ev.k, t: 0 }; SFX.emote(); } break;
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
/** The stick (or keys) turned into a direction on the ground, from where the camera looks.
 *  A thumb on glass rarely pushes the stick all the way, so past a small dead zone it reaches
 *  full speed by 70% of its throw (a little gentler near the middle, for creeping along a
 *  ledge). And while you hold a direction other than "on", it stays the direction you chose
 *  even as the camera swings round a bend (otherwise a held stick runs you round in a curve). */
const DEAD = 0.15, FULL = 0.7;
const steer = { yaw: null };
function readInput() {
  const kx = (keys.R ? 1 : 0) - (keys.L ? 1 : 0), ky = (keys.B ? 1 : 0) - (keys.F ? 1 : 0);
  let sx = kx || pad.x, sy = ky || pad.y;
  const m = Math.hypot(sx, sy);
  if (m < DEAD) { sx = sy = 0; steer.yaw = null; } else {
    const k = Math.pow(Math.min(1, (m - DEAD) / (FULL - DEAD)), 0.8) / m;
    sx *= k; sy *= k;
  }
  let yaw = S.cam.yaw;
  if (sx || sy) {
    const off = Math.abs(Math.atan2(sx, -sy)); // 0 = straight on
    if (off > 0.6) { if (steer.yaw === null) steer.yaw = yaw; yaw = steer.yaw; } else steer.yaw = null;
  }
  const fx = Math.sin(yaw), fz = Math.cos(yaw); // forward; right is (−fz, fx)
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
  S.cam.peek = Math.max(-2.6, Math.min(2.6, S.cam.peek - (e.clientX - pad.lookX) * 0.009));
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
  if (e.key >= '1' && e.key <= '4') { sendEmote(+e.key - 1); return; }
  const k = KEYS[e.key];
  if (!k) return;
  audio();
  if (k === 'J' && !e.repeat && !keys.J) pad.taps++;
  keys[k] = true; e.preventDefault();
});
window.addEventListener('keyup', (e) => { const k = KEYS[e.key]; if (k) { keys[k] = false; e.preventDefault(); } });

// ---- emotes --------------------------------------------------------------------------------
const emoteBtn = document.getElementById('emotebtn'), emotesEl = document.getElementById('emotes');
function sendEmote(k) {
  if (!EMOTES[k] || !S.view || S.mode === 'wait' || S.mode === 'lobby' || S.mode === 'gone') return;
  const ev = { e: 'emote', i: S.me, k };
  if (S.net === 'client') send({ t: 'e', i: S.me, k }); else events.push(ev);
  onEvent(ev);
  showEmotes(false);
}
function showEmotes(on) { emotesEl.classList.toggle('show', on); emoteBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); }
emoteBtn.addEventListener('click', () => { audio(); showEmotes(!emotesEl.classList.contains('show')); });
emotesEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => sendEmote(+b.dataset.k)));
/** Host/solo: at a watchtower, one of the bots cheers. */
function botCheer() {
  const bots = S.roster.map((r, i) => (r.bot ? i : -1)).filter((i) => i >= 0 && i !== S.me);
  if (!bots.length) return;
  const ev = { e: 'emote', i: bots[Math.floor(Math.random() * bots.length)], k: 3 };
  events.push(ev); onEvent(ev);
}

// ---- menus ---------------------------------------------------------------------------------
const pauseEl = document.getElementById('pause'), overEl = document.getElementById('over');
function setMenu(on) {
  S.menu = on; pauseEl.classList.toggle('show', on); duck(on);
  padRelease();
  if (on) document.getElementById('resume').focus();
}
document.getElementById('pausebtn').addEventListener('click', () => setMenu(true));
document.getElementById('resume').addEventListener('click', () => setMenu(false));
// back to the start of this stretch (user, Oct 17 2026): the host (or you, playing alone) starts it
// again; anyone else asks the host, who does it for the whole gang
document.getElementById('restart').addEventListener('click', () => {
  setMenu(false);
  if (S.net === 'client') send({ t: 'restart', i: S.me });
  else restartLevel();
});
document.getElementById('psound').addEventListener('click', () => { setMuted(!isMuted()); syncMute(); });
document.getElementById('pmusic').addEventListener('click', () => { setMusic(!isMusicOn()); syncMute(); });
function syncMute() {
  document.getElementById('psound').textContent = isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
  document.getElementById('pmusic').textContent = isMusicOn() ? 'MUSIC: ON' : 'MUSIC: OFF';
}
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
  if (over) showEmotes(false);
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
  Object.assign(S, { scores: [], total: 0, falls: 0, fallsBy: S.roster.map(() => 0), sent: false, level: 0 });
  startLevel(0);
}
/** The stretch again from its start (the clock too); the falls so far still count. */
function restartLevel() {
  if (!S.sim || !['title', 'play'].includes(S.mode)) return;
  const falls = S.sim.falls, fallsBy = S.sim.fallsBy.slice(), rs = (S.sim.rs || 0) + 1;
  startLevel(S.level);
  Object.assign(S.sim, { falls, fallsBy, rs }); // (a new rs: everyone's phone goes where the host puts them)
  const ev = { e: 'restart' }; events.push(ev); onEvent(ev);
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
  if (S.mode === 'title') {
    if (S.tips && S.net === 'solo' && S.level === 0) { // the first time: the how-to-play card waits for JUMP
      S.tipsT = (S.tipsT || 0) + dt;
      if (S.tipsT < 1) S.tipTaps = pad.taps; // (a press from before the card doesn't count)
      else if (pad.taps > S.tipTaps || S.tipsT > TIPS_HOLD) { S.tips = false; post({ type: 'tips-seen' }); S.modeT = TITLE_T - 0.4; seenTaps.me = pad.taps; }
      if (S.tips) S.modeT = Math.min(S.modeT, 1.2);
    } else if (S.modeT > TITLE_T) setMode('play');
  }
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
      for (const ev of S.sim.events) { events.push(ev); onEvent(ev); if (ev.e === 'checkpoint') botCheer(); }
      if (S.sim.done !== null) {
        const sc = levelScore(S.level, S.sim.done, S.sim.falls);
        S.scores.push({ score: sc, time: S.sim.done, falls: S.sim.falls, medal: medalFor(S.level, S.sim.done, S.sim.falls) });
        S.total += sc; S.falls += S.sim.falls;
        S.sim.fallsBy.forEach((n, i) => { S.fallsBy[i] = (S.fallsBy[i] || 0) + n; });
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
    sc: S.scores, fb: S.fallsBy, bots: S.roster.map((r) => (r.bot ? 1 : 0)),
    ps: sim ? sim.players.map((p) => [r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vy), r2(p.vz), flagsOf(p), r2(p.face)]) : [],
    cr: sim ? sim.crumble.map((c) => (c.gone ? -1 : r2(c.stood + c.heavy * 4))) : [],
    br: sim ? sim.barrels.map((b) => [r2(b.x), r2(b.y), r2(b.z), r2(b.spin), b.dx, b.dz]) : [],
    ev: events,
  };
}
const flagsOf = (p) => (p.ground ? 1 : 0) | (p.grab ? 2 : 0) | (p.zip ? 4 : 0) | (p.taut ? 8 : 0) | (p.knockT > 0 ? 16 : 0) | (p.hung ? 32 : 0);
const snaps = []; // client: the last few snapshots, oldest first
let clientClock = null, lastSnapAt = 0;
function onSnapshot(s) {
  if (S.gone) return;
  const prevMode = S.mode, prevLevel = S.level;
  if (s.lv !== S.level || !snaps.length) { snaps.length = 0; lookAlong(LEVELS[s.lv].spawn.dir); }
  S.level = s.lv; S.scores = s.sc || []; S.total = S.scores.reduce((a, b) => a + b.score, 0); S.fallsBy = Array.isArray(s.fb) ? s.fb : [];
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
    if (ev.e === 'emote' && ev.i === S.me) continue; // (ours was shown when we sent it)
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
/** The snapshots to place the others from: the newest alone, if those are from before a reset. */
function afterReset(a, b, newest) {
  return (a.rs || 0) !== (newest.rs || 0) || (b.rs || 0) !== (newest.rs || 0) ? [newest, newest] : [a, b];
}
function clientView() {
  if (!snaps.length) return null;
  let a = snaps[0], b = snaps[snaps.length - 1];
  for (let k = 0; k + 1 < snaps.length; k++) if (snaps[k].tm <= clientClock && snaps[k + 1].tm >= clientClock) { a = snaps[k]; b = snaps[k + 1]; break; }
  // just after a fall the host has put everyone back at the watchtower: show them there now, not a beat
  // behind where they were still falling (our own rope to those old places dragged us off the platform —
  // "looks like respawn isn't on the platform but too low")
  [a, b] = afterReset(a, b, snaps[snaps.length - 1]);
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
    x, y, z, vx, vy, vz, ground: !!(flags & 1), grab: !!(flags & 2), zip: !!(flags & 4), taut: !!(flags & 8), knock: !!(flags & 16), hung: !!(flags & 32), face: face || 0 };
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
      else if (m.t === 'restart' && typeof m.i === 'number' && S.roster[m.i]) restartLevel();
      else if (m.t === 'e' && typeof m.i === 'number' && m.i !== S.me && S.roster[m.i] && EMOTES[m.k]) { const ev = { e: 'emote', i: m.i, k: m.k | 0 }; events.push(ev); onEvent(ev); }
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

// The camera looks the way on along the Wall by itself (user, Oct 15 2026: "keep the camera
// behind the player… so you don't have to control it"): it follows the level's route a few
// metres ahead of wherever you are on it, so ↑ always walks on, and turns round the bends
// with you. Dragging the screen (or Q/R) only looks round; let go and it swings back.
function routeTrack(L, q, from) {
  const Rt = L.route;
  if (!L.camLen) { L.camLen = [0]; for (let k = 1; k < Rt.length; k++) L.camLen.push(L.camLen[k - 1] + Math.hypot(Rt[k].p[0] - Rt[k - 1].p[0], Rt[k].p[2] - Rt[k - 1].p[2])); }
  let best = -1, bd = Infinity;
  for (let k = 0; k + 1 < Rt.length; k++) {
    // (keep to the stretch of route near where we were: the climb winds back over itself)
    if (from >= 0 && (L.camLen[k + 1] < from - 10 || L.camLen[k] > from + 20)) continue;
    const a = Rt[k].p, b = Rt[k + 1].p, ex = b[0] - a[0], ez = b[2] - a[2], l2 = ex * ex + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((q.x - a[0]) * ex + (q.z - a[2]) * ez) / l2));
    const d = Math.hypot(a[0] + ex * u - q.x, (a[1] + (b[1] - a[1]) * u - q.y) * 0.6, a[2] + ez * u - q.z);
    if (d < bd) { bd = d; best = L.camLen[k] + u * Math.sqrt(l2); }
  }
  if (from >= 0 && bd > 6) return routeTrack(L, q, -1); // fell or was carried somewhere else
  return best;
}
function routePoint(L, s) {
  const Rt = L.route, len = L.camLen;
  let k = 0; while (k + 2 < Rt.length && len[k + 1] < s) k++;
  const seg = len[k + 1] - len[k] || 1, u = Math.max(0, Math.min(1, (s - len[k]) / seg));
  return [Rt[k].p[0] + (Rt[k + 1].p[0] - Rt[k].p[0]) * u, Rt[k].p[2] + (Rt[k + 1].p[2] - Rt[k].p[2]) * u];
}
function steerCamera(dt) {
  const C = S.cam;
  if (keys.CL) { C.peek += dt * 2.2; C.dragAt = performance.now(); }
  if (keys.CR) { C.peek -= dt * 2.2; C.dragAt = performance.now(); }
  const me = S.view && S.view.players[S.me], L = LEVELS[S.view ? S.view.lv : S.level];
  // hanging off a ledge on the rope (user, Oct 17 2026: "the camera should swing in front of the
  // character so they can see how to jump up from a fall"): look from out over the drop at you and
  // the teammate holding you, level with you and tilted up to the ledge, so ↑ climbs toward them
  const anchor = me && me.hung ? [S.view.players[S.me - 1], S.view.players[S.me + 1]].filter((q) => q && q.y > me.y + 0.3).sort((a, b) => b.y - a.y)[0] : null;
  C.hang += ((anchor ? 1 : 0) - C.hang) * (1 - Math.exp(-dt * (anchor ? 5 : 2.5)));
  if (anchor) C.lift = Math.max(0, Math.min(4, anchor.y - me.y)) * 0.55;
  // let go of the look round: swing back behind
  if (pad.lookId === null && performance.now() - C.dragAt > 600) {
    const k = 1 - Math.exp(-dt * 3);
    C.peek -= C.peek * k; C.pitch += (PITCH + (HANG_PITCH - PITCH) * C.hang - C.pitch) * k;
  }
  if (anchor && Math.hypot(anchor.x - me.x, anchor.z - me.z) > 0.4) {
    let d = Math.atan2(anchor.x - me.x, anchor.z - me.z) - C.base;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    C.base += d * (1 - Math.exp(-dt * 5));
    C.s = -1; // (back on your feet, find your place on the route again)
  } else if (me && L && L.route.length > 1 && (S.mode === 'play' || S.mode === 'title')) {
    C.s = routeTrack(L, me, C.s);
    const total = L.camLen[L.camLen.length - 1];
    const a = routePoint(L, Math.max(0, C.s - 1.5));
    let ahead = 6, b = routePoint(L, Math.min(total, C.s + ahead));
    while (Math.hypot(b[0] - a[0], b[1] - a[1]) < 2.5 && ahead < 20) b = routePoint(L, Math.min(total, C.s + (ahead += 2)));
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.5) {
      let d = Math.atan2(b[0] - a[0], b[1] - a[1]) - C.base;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      C.base += d * (1 - Math.exp(-dt * (C.hang > 0.02 ? 4 : 2.2))); // (back behind you briskly once you're up off a hang)
    }
  }
  C.yaw = C.base + C.peek;
}

// Music while the game is on; soft footsteps, a rope creak when it pulls tight on you, and
// a rustle when you dig in.
const heard = { step: 0, steps: 0, taut: false, creakAt: 0, grab: false };
function soundTick(dt) {
  music(S.mode !== 'gone', S.view ? S.view.lv : S.level);
  const me = S.view && S.view.players[S.me];
  if (!me || S.mode !== 'play') return;
  const speed = Math.hypot(me.vx, me.vz);
  if (me.ground && !me.grab && speed > 1.2) {
    heard.step += dt * speed;
    if (heard.step > 1.25) { heard.step = 0; SFX.step(heard.steps++); }
  } else heard.step = 0.9; // (the first step comes soon after you set off)
  const now = performance.now();
  if (me.taut && !heard.taut && now - heard.creakAt > 900) { SFX.creak(); heard.creakAt = now; }
  heard.taut = me.taut;
  if (me.grab && !heard.grab && me.ground) SFX.grab();
  heard.grab = me.grab;
}

// ---- the frame loop ----------------------------------------------------------------------------
renderer = createRenderer({
  glCanvas: document.getElementById('gl'), hudCanvas: document.getElementById('hud'), stage: document.getElementById('stage'),
  game: { S, LEVELS, COLORS, NAMES, PAR, EMOTES, boom: () => SFX.boom() },
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
  S.emotes = S.emotes.map((e) => (e && (e.t += dt) < 2.4 ? e : null));
  if (S.net === 'client') {
    clientUpdate(dt);
    // the host has gone quiet: say so (the app tells us if it really left)
    S.stale = snaps.length > 0 && performance.now() - lastSnapAt > 4000 && S.mode !== 'finish';
  } else hostUpdate(dt);
  S.view = S.net === 'client' ? clientView() : hostView();
  soundTick(dt);
  steerCamera(dt);
  if (!document.hidden) renderer.draw(now / 1000, dt);
}
syncButtons();
requestAnimationFrame(frame);

// ---- for tests ---------------------------------------------------------------------------------
window.__chain = {
  get mode() { return S.mode; }, get net() { return S.net; }, get me() { return S.me; }, get level() { return S.level; },
  get total() { return S.total; }, get scores() { return S.scores; }, get falls() { return S.view ? S.view.falls : 0; },
  get cp() { return S.view ? S.view.cp : 0; }, get tips() { return S.tips; }, get fallsBy() { return S.fallsBy.slice(); }, get emotes() { return S.emotes.map((e) => (e ? EMOTES[e.k] : null)); }, get menu() { return S.menu; }, get gl() { return renderer.gl; }, get camYaw() { return S.cam.yaw; }, get camHang() { return S.cam.hang; }, get music() { return musicState(); }, get route() { const L = LEVELS[S.view ? S.view.lv : S.level]; return L.route.map((n) => ({ p: n.p, jump: !!n.jump })); },
  get players() { return S.view ? S.view.players.map((p) => ({ x: p.x, y: p.y, z: p.z, hero: p.hero, bot: p.bot, ground: p.ground, grab: p.grab, hung: p.hung })) : []; },
  get roster() { return S.roster.map((r) => Object.assign({}, r)); },
  screenPoint: (x, y) => renderer.screenPoint(x, y),
  // a whole gang of bots plays a stretch headless (the levels must be winnable)
  simulate: (lv, n, startAt) => simulateLevel(lv, n, 240, startAt || 0),
  // reeling in, headless: one traveller hangs off the first island's edge; the other stands, with or without GRAB
  reelTest: (grab) => {
    const sim = createSim(0, [{ hero: 'chris' }, { hero: 'jake' }]), sp = sim.level.spawn, [a, b] = sim.players;
    Object.assign(a, { x: sp.x + 1, y: sp.y, z: sp.z }); Object.assign(b, { x: sp.x + 3.7, y: sp.y - 4.2, z: sp.z });
    for (let k = 0; k < 210; k++) stepSim(sim, [{ grab: !!grab }, {}]);
    return { hanging: +(b.y - sp.y).toFixed(2), standing: +a.x.toFixed(2), onTop: !!b.ground && b.y > sp.y - 0.3 };
  },
  // three people online, headless (user, Oct 17 2026: "when we all fell we all whipped in a circle and we
  // never reset"): a host and two phones as they really run — the host moves its own traveller and places
  // the others where their phones last said (repD steps ago); each phone moves only its own and places the
  // others from the host's snapshots (snapD steps old). All three dropped off the first island at once.
  netFallTest: (lv, snapD, repD) => {
    const roster = [0, 1, 2].map(() => ({ hero: 'chris', bot: false }));
    const host = createSim(lv, roster); host.players.forEach((p, i) => { p.puppet = i !== 0; });
    const phones = [1, 2].map((i) => { const q = createSim(lv, roster); q.local = i; return q; });
    const sp = host.level.spawn;
    for (const q of [host, ...phones]) q.players.forEach((p, i) => Object.assign(p, { x: sp.x + 4.5 + i * 0.4, y: sp.y + 0.5, z: sp.z - i * 1.5, vx: 3, vy: 2, vz: 0, ground: null }));
    const state = (p) => ({ x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, ground: !!p.ground, grab: p.grab });
    const snapsT = [], reps = { 1: [], 2: [] }, rsSeen = { 1: 0, 2: 0 };
    let whoops = 0;
    for (let k = 0; k < 60 * 20; k++) {
      for (const i of [1, 2]) { const r = reps[i][reps[i].length - 1 - repD]; if (r && r.rs === (host.rs || 0)) Object.assign(host.players[i], r, { ground: r.ground ? { puppet: true } : null, zip: null }); }
      stepSim(host, host.players.map(() => ({})));
      whoops += host.events.filter((e) => e.e === 'whoops').length;
      snapsT.push({ rs: host.rs || 0, ps: host.players.map(state) });
      phones.forEach((q, j) => {
        const me = j + 1, newest = snapsT[snapsT.length - 1], [s0] = afterReset(snapsT[Math.max(0, snapsT.length - 1 - snapD)], newest, newest);
        if (rsSeen[me] !== newest.rs) { rsSeen[me] = newest.rs; Object.assign(q.players[me], newest.ps[me], { vx: 0, vy: 0, vz: 0, ground: null, zip: null, grab: false, fallT: 0 }); }
        q.t = host.t;
        s0.ps.forEach((o, i) => { if (i !== me) Object.assign(q.players[i], o, { ground: o.ground ? { ghost: true } : null, zip: null }); });
        stepSim(q, q.players.map(() => ({})));
        reps[me].push(Object.assign(state(q.players[me]), { rs: rsSeen[me] }));
      });
    }
    const ps = [host.players[0], phones[0].players[1], phones[1].players[2]];
    return { whoops, standing: ps.every((p) => !!p.ground && Math.abs(p.y - sp.y) < 0.3 && Math.hypot(p.x - sp.x, p.z - sp.z) < 3) };
  },
  programs: () => renderer.programs(),
};
if (INIT.debug) {
  window.__chain.sfx = SFX;
  window.__chain.debug = {
    // let a bot drive this phone's traveller (host/solo only)
    auto(on) { S.auto = on !== false; if (S.sim) S.sim.players[S.me].bot = S.auto || S.roster[S.me].bot; },
    finishLevel() { // straight past every watchtower to the finish
      if (!S.sim || S.mode !== 'play') return;
      dropSteps.host = dropSteps.mine = 0;
      const f = S.sim.level.finish;
      S.sim.cp = S.sim.level.checks.length;
      S.sim.players.forEach((p, i) => { Object.assign(p, { x: f.x - f.dir[0] * i * 0.8, y: f.y + 0.3, z: f.z - f.dir[1] * i * 0.8, vx: 0, vy: 0, vz: 0 }); });
    },
    setLevel(n) { if (S.net !== 'client') startLevel(n); },
    // the whole gang off the wall, held below it for 1.5 s of game time (long enough to count as a fall) — on a
    // client only our own traveller: the others are the host's to drop
    fall() { dropSteps.host = dropSteps.mine = 90; dropNow('host'); dropNow('mine'); },
    warp(x, y, z, yaw) { if (S.sim) S.sim.players.forEach((p, i) => { Object.assign(p, { x, y: y + i * 0.01, z: z + i * 1.2, vx: 0, vy: 0, vz: 0 }); p.ni = 0; }); if (yaw !== undefined) { S.cam.base = S.cam.yaw = yaw; S.cam.peek = 0; } S.cam.s = -1; },
    // you hanging 4 m down off the side of the first island, the others standing near its edge
    hang() {
      if (!S.sim) return;
      const sp = S.sim.level.spawn;
      S.sim.players.forEach((p, i) => { Object.assign(p, i === S.me ? { x: sp.x + 3.7, y: sp.y - 4.2, z: sp.z } : { x: sp.x + 1 - i * 0.7, y: sp.y + 0.05, z: sp.z }, { vx: 0, vy: 0, vz: 0, hung: false }); p.ni = 0; });
    },
    skipTitle() { if (S.mode === 'title') S.modeT = TITLE_T + 1; if (S.mode === 'clear') S.modeT = CLEAR_T + 1; },
  };
}
post({ type: 'ready' });
