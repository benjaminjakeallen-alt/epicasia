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
import { SFX, audio, music, musicState, duck, muffled, isMuted, isMusicOn, setMuted, setMusic, setQuiet } from './sound.js';
import { createSewer, stepSewer, featherAt, STEP as SEWER_STEP, BLOCK as SEWER_BLOCK, sewerPoints, routeExists, replay as sewerReplay } from './sewer.js';

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
// Each traveller's special skill (user, Oct 12 2026), shown under their name on the ring and
// told once as a run starts. skill(h) is off in simulate(), so the fairness checks stay honest.
const HEROES = {
  chris: { name: 'CHRIS', skill: 'MINER\'S LAMP · PICKAXE', hint: 'PICKAXE SMASHES FAIRINGS · LAMP LIGHTS TUNNELS' },
  bennett: { name: 'BENNETT', skill: 'PONCHO GLIDE', hint: 'SWIPE UP AND HOLD TO GLIDE' },
  emily: { name: 'EMILY', skill: 'ENDLESS SLIDE', hint: 'SWIPE DOWN AND HOLD TO KEEP SLIDING' },
  miles: { name: 'MILES', skill: 'DOUBLE JUMPS', hint: 'SWIPE UP AGAIN IN THE AIR' },
  nicole: { name: 'NICOLE', skill: 'BOBA MAGNET · AUTO SLIDE', hint: 'PICKUPS COME TO YOU · SHE DUCKS CROWS' },
  jake: { name: 'JAKE', skill: 'MANHOLE SKATEBOARD', hint: 'EVERY 30 ONIGIRI: A SKATEBOARD' },
  liam: { name: 'LIAM', skill: 'NINJA STARS', hint: 'CROWS DON\'T STAND A CHANCE' },
  mei: { name: 'MEI', skill: 'KAWAII CHARM', hint: 'TAP TO CHARM · HEARTS CLEAR THE WAY' }
};
const skill = (h) => S.hero === h && !S.simulating;
// (balanced Oct 17 2026: Jake's board was far stronger than Bennett's glide — the board now
// comes every 40 onigiri for 10 s, the glide falls slower)
const SMASH_EVERY = 8, GLIDE_V = 1.2, BOARD_EVERY = 40, BOARD_TIME = 10;
// Mei's kawaii charm (user, Oct 15 2026): tap the screen (or C) → a peace-sign pose and a burst of
// hearts; for CHARM_TIME anything on her roof she'd run into pops into hearts. Back after CHARM_EVERY.
const CHARM_TIME = 2.5, CHARM_EVERY = 12, CHARM_PTS = 20;
// Missions (review, Oct 17 2026): three short goals a run, shown before it starts; each done is
// +MISSION_PTS. A multiplier (×1…×5) grows every MULT_EVERY metres you run without a knock and
// multiplies everything you pick up or smash (not the distance); a lucky cat saving you resets it.
const MISSION_PTS = 500, MULT_EVERY = 750;
const MISSIONS = [
  { id: 'jumps', txt: 'JUMP 15 TIMES', goal: 15, at: () => S.jumps },
  { id: 'slides', txt: 'SLIDE 10 TIMES', goal: 10, at: () => S.slides },
  { id: 'hops', txt: 'HOP TRAINS 25 TIMES', goal: 25, at: () => S.hops },
  { id: 'onigiri', txt: 'GRAB 30 ONIGIRI', goal: 30, at: () => S.coins },
  { id: 'fuji', txt: 'REACH MOUNT FUJI', goal: 2000, at: () => S.dist },
  { id: 'kyoto', txt: 'REACH KYOTO', goal: 4000, at: () => S.dist },
  { id: 'score', txt: 'SCORE 5,000', goal: 5000, at: () => S.score },
  { id: 'neko', txt: 'GRAB A LUCKY CAT', goal: 1, at: () => S.nekos },
  { id: 'mult', txt: 'REACH ×4', goal: 4, at: () => S.mult },
];
const BEST_MIN = 250; // (a "your best" gate only once there's a best worth chasing)
const ROSTER = ['chris', 'bennett', 'emily', 'miles', 'nicole', 'jake', 'liam', 'mei'];
// Chris and Bennett (who replaced Shea here, user Oct 11 2026) play from the start, and Mei (Oct 14 2026).
// Secret travellers (user, Oct 11 2026): reach Mount Fuji in a run to
// unlock Emily; Miles (who replaced Heather here) needs a golden guitar; Nicole a boba tea. The app remembers unlocks
// per phone (the game's own storage is off in its sandbox) and passes them
// back in INIT.unlocked. Locked ones are a surprise (user, Oct 11 2026):
// the line-up shows a silhouette and "???", never their name or how to earn them.
const UNLOCK = {
  emily: { at: 2 * STAGE_LEN },
  // Miles (user, Oct 11 2026): first find a spring — it gives one double
  // jump (swipe up again in the air) — then a golden guitar floats up
  // ahead, too high for a single jump.
  miles: { item: 'guitar' },
  // Nicole (user, Oct 11 2026): grab a boba tea. They only float over the
  // roofs in the fast end of the line (Tea Hills on, every later round) and
  // need a jump.
  nicole: { item: 'boba' },
  // Jake (user, Oct 12 2026): twice a round a gap between trains has an open
  // manhole; drop in and get through the sewer level (sewer.js) to the pipe.
  jake: { item: 'sewer' },
  // Liam (user, Oct 12 2026): score 30,000 points in a run.
  liam: { score: 30000 }
};
// Where in each 5 km round the manholes come (the first gap past each).
const MANHOLES = [1300, 3500];
function manholeAfter(d) {
  for (let lap = Math.floor(d / (5 * STAGE_LEN)); ; lap++) {
    for (const m of MANHOLES) { const at = lap * 5 * STAGE_LEN + m; if (at > d + 400) return at; }
  }
}
const BOBA_FROM = 3 * STAGE_LEN, BOBA = 250;
const SPRING_FROM = STAGE_LEN, GUITAR_AFTER = 200, GUITAR = 500; // springs from Rice Fields on; the guitar ≥ 200 m past one

// ---- the runner -----------------------------------------------------------------
const JUMP_V = 7.4, GRAV = 20, DIVE_V = -16; // a jump is ~1.37 m high, ~0.74 s long
const SLIDE_TIME = 0.72, LANE_TIME = 0.15, JUMP_BUFFER = 0.15;
const STAND_H = 1.7, SLIDE_H = 0.72;
const COIN = 25, NEKO = 100;

// What's on the roofs. lo/hi: height band above the roof that hits you.
const OBS = {
  hump: { len: 2.2, lo: 0, hi: 0.8 }, // a roof fairing: jump it
  panto: { len: 1.8, lo: 0, hi: 2.6 }, // a pantograph: too tall, hop trains
  crow: { len: 0.9, lo: 0.95, hi: 1.75 }, // slide under (or hop trains)
  gantry: { len: 0.7, lo: 1.0, hi: 1.9, all: true }, // a signal gantry over every train: slide
  onigiri: { len: 0.9, lo: 0.2, hi: 1.4, pickup: true },
  neko: { len: 0.9, lo: 0.2, hi: 1.5, pickup: true },
  boba: { len: 1.0, lo: 1.9, hi: 2.9, pickup: true }, // floats above head height: jump for it
  spring: { len: 0.9, lo: 0.2, hi: 1.4, pickup: true }, // one double jump
  // Above a single jump's reach (head at most 1.37 + 1.7 = 3.07 m): only a double jump gets there.
  guitar: { len: 1.2, lo: 3.3, hi: 4.5, pickup: true }
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
  dist: 0, speed: 0, score: 0, coins: 0, bobas: 0, guitars: 0, doubles: 0, spring: false, guitarDue: 0, hi: Math.max(0, INIT.highScore | 0),
  best: Math.max(0, +INIT.bestDist || 0), tips: !!INIT.tips, tipsT: 0, mult: 1, multD: 0, missions: [], hops: 0, nekos: 0,
  stage: 0, lap: 0, maxStage: 0,
  p: null, obs: [], gaps: [], tunnels: [], msgs: [], pops: [], parts: [], stars: [], throws: 0, kills: 0, throwT: -9,
  nextRow: 0, nextGap: 0, nextTunnel: 0, shield: false, invuln: 0, calm: false,
  paused: false, menu: false, sentScore: false, shakeT: 0,
  unlocked: new Set(['chris', 'bennett', 'mei'].concat((INIT.unlocked || []).filter(function (h) { return UNLOCK[h]; }))),
  hint: null, simulating: false, sewer: null, sludge: false, nextManhole: MANHOLES[0], sewers: 0
};
function locked(h) { return !S.unlocked.has(h); }
/** Turn the character ring so traveller i is at the front (the short way round). */
function turnTo(i) {
  const n = ROSTER.length, to = ((i % n) + n) % n;
  let step = to - S.sel;
  if (step > n / 2) step -= n; else if (step < -n / 2) step += n;
  S.ring = (S.ring || 0) + step; S.sel = to;
}
/** Start a run as h — or, if h isn't earned yet, just say it's a secret. */
function pickHero(h) {
  if (!locked(h)) { newRun(h); return; }
  S.hint = { txt: 'A SECRET TRAVELER · KEEP PLAYING TO FIND THEM', t: 2.4 }; // no name, no clue (user: "they need to just figure out the secrets")
  SFX.locked(); haptic('error');
}
function unlockHero(h) {
  if (S.simulating || !locked(h)) return;
  S.unlocked.add(h);
  post({ type: 'unlock', key: h });
  say(HEROES[h].name + ' UNLOCKED!', 2.6, '#ff8cc6', true);
  SFX.neko(); haptic('success');
  if (S.p) burst(S.p.x, S.p.y + 1.2, 0, ['#ff8cc6', '#ffe066', '#ffffff'], 26, 5);
}

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
  const g = { lane: lane, g0: g0, g1: g1 };
  if (g0 >= S.nextManhole) { g.manhole = true; S.nextManhole = manholeAfter(g0); } // (no random draw: layouts don't change)
  S.gaps.push(g);
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
// A train counts as open for a row only if it runs on well past it (if it
// ended just after a pair of pantographs, you'd hop onto it with no time to
// hop off) and has been back up to full height for a while (crossing the
// rising tail of a returning train to dodge pantographs is near impossible).
// Found by simulate(): a perfect bot kept dying on exactly those rows.
const OPEN_BEFORE = 30, OPEN_AFTER = 26;
function openAt(l, d) { return flatAt(l, d + (OPEN_AFTER - OPEN_BEFORE) / 2, (OPEN_AFTER + OPEN_BEFORE) / 2); }
function makeRow(d) {
  const open = [0, 1, 2].filter(function (l) { return openAt(l, d); });
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
    ls.forEach(function (l) { put('crow', l); }); // they hover where they are (a crow that flew at you could land on the row before)
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
  // A boba tea (unlocks Nicole) — only from Tea Hills on, so earlier layouts
  // never change. Over a train with nothing else on it in this row, and never
  // under a gantry, so the jump for it can't land you in anything.
  if (d >= BOBA_FROM && rnd() < 0.06 && !S.obs.some(function (o) { return o.type === 'boba' && !o.gone && o.d > d - 120; })) {
    const clear = open.filter(function (l) { return !row.some(function (o) { return o.lane === l || o.lane === -1; }); });
    if (clear.length && !row.some(function (o) { return o.type === 'gantry'; })) put('boba', pick(clear), { d: d - 12 });
  }
  // A spring (one double jump) from Rice Fields on; while you hold one, a
  // golden guitar floats up ≥ 200 m further on, over a train with nothing
  // else on it in that row (the random draws only start past 1 km / once a
  // spring is held, so earlier layouts never change).
  const clearLanes = function () {
    if (row.some(function (o) { return o.type === 'gantry'; })) return [];
    return open.filter(function (l) { return !row.some(function (o) { return o.lane === l; }); });
  };
  const near = function (type, back) { return S.obs.some(function (o) { return o.type === type && !o.gone && o.d > d - back; }); };
  // (missed the guitar but still holding the spring? another one comes along)
  if (S.spring && !S.guitarDue && !near('guitar', 400)) S.guitarDue = d + GUITAR_AFTER;
  if (S.spring && S.guitarDue && d >= S.guitarDue && !near('guitar', 150)) {
    const cl = clearLanes();
    if (cl.length) { put('guitar', pick(cl), { d: d - 12 }); S.guitarDue = 0; }
  } else if (d >= SPRING_FROM && !S.spring && rnd() < 0.035 && !near('spring', 300)) {
    const cl = clearLanes();
    if (cl.length) put('spring', pick(cl), { d: d - 6 });
  }
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
  const keep = { seed: seed, obs: S.obs, gaps: S.gaps, stage: S.stage, lap: S.lap, nextGap: S.nextGap, spring: S.spring, guitarDue: S.guitarDue, nextManhole: S.nextManhole };
  const out = [];
  S.spring = false; S.guitarDue = 0;
  seed = 4242; S.obs = []; S.gaps = []; S.nextGap = 100;
  for (let stage = 0; stage < 5; stage++) {
    S.stage = stage; S.lap = stage === 4 ? 1 : 0;
    for (let i = 0; i < 600; i++) {
      const d = 100 + stage * 30000 + i * 15;
      while (S.nextGap < d + 200) scheduleGap();
      S.obs = [];
      const row = makeRow(d);
      const ok = [0, 1, 2].some(function (l) {
        return openAt(l, d) && !row.some(function (o) { return o.lane === l && o.type === 'panto' && Math.abs(o.d - d) < 1; });
      });
      if (!ok) out.push('stage ' + (stage + 1) + ' row ' + i + ': no way through');
      for (let a = 0; a < S.gaps.length; a++)
        for (let b = a + 1; b < S.gaps.length; b++)
          if (S.gaps[a].g1 > S.gaps[b].g0 - 40 && S.gaps[b].g1 > S.gaps[a].g0 - 40) { out.push('gaps overlap'); }
      S.gaps = S.gaps.filter(function (g) { return g.g1 > d - 100; });
    }
  }
  // Boba teas: never before Tea Hills, and enough after it to find one
  // (over five layouts, so one unlucky sequence doesn't decide it).
  let early = 0, late = 0, dry = 0;
  for (let k = 0; k < 5; k++) {
    seed = 77 + k * 1013; S.gaps = []; S.nextGap = 100; S.obs = []; S.spring = false;
    let here = 0;
    for (let d = 100; d < 2 * BOBA_FROM; d += 30) {
      while (S.nextGap < d + 200) scheduleGap();
      makeRow(d).forEach(function (o) { if (o.type === 'boba') { if (d < BOBA_FROM) early++; else { late++; here++; } } });
      S.obs = S.obs.filter(function (o) { return o.d > d - 150; });
    }
    if (!here) dry++;
  }
  if (early) out.push(early + ' boba before Tea Hills');
  if (dry || late < 10) out.push(late + ' boba in 5 × 3 km, ' + dry + ' layouts with none');
  S.spring = false;
  // Manholes: exactly two a round, the first gaps past 1,300 m and 3,500 m.
  seed = 5; S.gaps = []; S.nextGap = 100; S.nextManhole = MANHOLES[0];
  while (S.nextGap < 15000) scheduleGap();
  for (let r = 0; r < 3; r++) {
    const m = S.gaps.filter(function (g) { return g.manhole && g.g0 >= r * 5000 && g.g0 < (r + 1) * 5000; });
    if (m.length !== 2) out.push('round ' + (r + 1) + ' has ' + m.length + ' manholes');
    else if (m[0].g0 < r * 5000 + 1300 || m[1].g0 < r * 5000 + 3500) out.push('round ' + (r + 1) + ' manholes too early');
  }
  // Springs: none before Rice Fields, a few after; no guitar without one.
  seed = 91; S.gaps = []; S.nextGap = 100; S.obs = [];
  let springsEarly = 0, springs = 0, guitars = 0;
  for (let d = 100; d < 6000; d += 30) {
    while (S.nextGap < d + 200) scheduleGap();
    makeRow(d).forEach(function (o) { if (o.type === 'spring') { if (d < SPRING_FROM) springsEarly++; else springs++; } if (o.type === 'guitar') guitars++; });
    S.obs = S.obs.filter(function (o) { return o.d > d - 350; });
  }
  if (springsEarly) out.push(springsEarly + ' springs before Rice Fields');
  if (springs < 2) out.push('only ' + springs + ' springs in 5 km');
  if (guitars) out.push('a guitar without a spring');
  // Holding a spring: a guitar comes ≥ 200 m on, soon after, over a clear train.
  S.spring = true; S.guitarDue = 2200; S.obs = [];
  let at = -1;
  for (let d = 1900; d < 2700 && at < 0; d += 30) {
    while (S.nextGap < d + 200) scheduleGap();
    const row = makeRow(d), g = row.find(function (o) { return o.type === 'guitar'; });
    if (g) {
      at = g.d;
      if (row.some(function (o) { return o !== g && (o.lane === g.lane || o.lane === -1); })) out.push('guitar shares a train with an obstacle');
      if (!openAt(g.lane, g.d)) out.push('guitar over an ending train');
    }
  }
  if (at < 0) out.push('no guitar within 500 m of being due');
  else if (at < 2200 - 12) out.push('guitar came too soon');
  // Missed it, spring still held: another guitar follows.
  let again = false;
  for (let d = at + 42; d < at + 1200 && !again; d += 30) {
    while (S.nextGap < d + 200) scheduleGap();
    again = makeRow(d).some(function (o) { return o.type === 'guitar'; });
  }
  if (at >= 0 && !again) out.push('no second guitar after missing one');
  Object.assign(S, { obs: keep.obs, gaps: keep.gaps, stage: keep.stage, lap: keep.lap, nextGap: keep.nextGap, spring: keep.spring, guitarDue: keep.guitarDue, nextManhole: keep.nextManhole });
  seed = keep.seed;
  return out.filter(function (x, i, a) { return a.indexOf(x) === i; });
}

// ---- messages & particles --------------------------------------------------------------
/** Points for something picked up or smashed: × the multiplier. */
function pts(n) { return n * S.mult; }
/** A burst of real hearts (Mei's charm). */
function hearts(x, y, z, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (spd || 3) * (0.5 + Math.random());
    S.parts.push({ x: x, y: y, z: z, vx: Math.cos(a) * v, vy: 1.5 + Math.random() * v, vz: Math.sin(a) * v * 0.6, t: 0.7 + Math.random() * 0.5, col: ['#ff8fc7', '#ff5fa2', '#ffd6ec'][i % 3], s: 0.16 + Math.random() * 0.1, heart: true, spin: Math.random() * 6 });
  }
}
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
  document.getElementById('pad').classList.toggle('show', m === 'sewer');
}
function newRun(hero) {
  S.hero = hero; turnTo(ROSTER.indexOf(hero));
  seed = INIT.seed || (Date.now() % 2147483646) + 1;
  S.runId = (S.runId || 0) + 1;
  Object.assign(S, {
    dist: 0, speed: 0, score: 0, coins: 0, bobas: 0, guitars: 0, doubles: 0, spring: false, guitarDue: 0, stage: 0, lap: 0, maxStage: 0, obs: [], gaps: [], tunnels: [], parts: [], pops: [],
    nextRow: 60, nextGap: 260, nextTunnel: 380, jumps: 0, slides: 0, shield: false, invuln: 0, sentScore: false, calm: false,
    sewer: null, sludge: false, nextManhole: MANHOLES[0], sewers: 0, stars: [], throws: 0, kills: 0, throwT: -9,
    hops: 0, nekos: 0, mult: 1, multD: 0, missions: [], bestPassed: false, smashReady: 0, smashT: -9, smashes: 0, charmReady: 0, charmT: 0, charmAt: -9, charms: 0, charmed: 0, glides: 0, magnets: 0, autoSlides: 0, boardCount: 0, boardT: 0, boards: 0
  });
  { // three missions, different each run
    const pool = MISSIONS.slice(); S.missions = [];
    for (let k = 0; k < 3; k++) { const i = Math.floor(Math.random() * pool.length); S.missions.push({ m: pool[i], done: false }); pool.splice(i, 1); }
  }
  S.p = { lane: 1, from: 1, x: LANES[1], laneT: 1, y: ROOF, vy: 0, air: false, slideT: 0, jbuf: 0, dive: false, anim: 0, crash: null, doubled: false, gliding: false };
  S.msgs = [];
  setMode('ready');
  SFX.horn();
}
function sendScore(outcome) {
  if (S.sentScore || S.score <= 0) return;
  S.sentScore = true;
  post({ type: 'score', score: S.score, level: S.maxStage + 1, round: S.lap + 1, hero: S.hero, outcome: outcome });
  if (S.dist > S.best) { S.best = Math.round(S.dist); post({ type: 'best', dist: S.best }); }
}
function crash(why) {
  if (S.mode !== 'run') return;
  if (S.invuln > 0 || S.boardT > 0) return;
  if (S.shield && why !== 'fall') {
    S.shield = false; S.invuln = 1.2; S.mult = 1; S.multD = S.dist;
    say('LUCKY CAT SAVED YOU!', 1.6, '#ffe066');
    SFX.shield(); haptic('success');
    burst(S.p.x, S.p.y + 1, 0, ['#ffffff', '#ffe066', '#ff8787'], 24, 5);
    return;
  }
  S.p.crash = why;
  S.lastCrash = { why: why, y: +(S.p.y - ROOF).toFixed(2), air: S.p.air, vy: +S.p.vy.toFixed(1), slideT: +S.p.slideT.toFixed(2), lane: S.p.lane, laneT: +S.p.laneT.toFixed(2), x: +S.p.x.toFixed(2), speed: +S.speed.toFixed(1),
    gaps: S.gaps.map(function (g) { return g.lane + ':' + Math.round(g.g0 - S.dist) + '..' + Math.round(g.g1 - S.dist); }), near: S.obs.filter(function (o) { return o.d - S.dist > -12 && o.d - S.dist < 45 && !OBS[o.type].pickup; }).map(function (o) { return o.type + '@' + o.lane + ':' + (o.d - S.dist).toFixed(1) + (o.hit ? '!' : ''); }) };
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
    if (dir === 'L') { turnTo(S.sel - 1); SFX.hop(); haptic('light'); }
    else if (dir === 'R') { turnTo(S.sel + 1); SFX.hop(); haptic('light'); }
    else if (dir === 'U' || dir === 'go') pickHero(ROSTER[S.sel]);
    return;
  }
  if (S.mode === 'gameover') { if (dir === 'go') newRun(S.hero); return; }
  if (S.mode === 'sewer') return; // the sewer has its own pad (below)
  if (S.mode !== 'run' && S.mode !== 'ready') return;
  if (S.mode === 'ready') S.tipsT = 99; // (a move skips the how-to-play card)
  const p = S.p;
  if (dir === 'L' || dir === 'R') {
    const to = Math.max(0, Math.min(2, p.lane + (dir === 'L' ? -1 : 1)));
    if (to === p.lane) { SFX.hop(); return; }
    p.from = p.x; p.lane = to; p.laneT = 0; SFX.hop(); S.hops++;
  } else if (dir === 'U') {
    if (!p.air) jump(p);
    else if (skill('miles') && !p.doubled && p.y > (roofAt(p.lane, S.dist) || ROOF) + 0.3) { p.doubled = true; doubleJump(p, true); }
    else if (S.spring && S.mode === 'run' && p.y > (roofAt(p.lane, S.dist) || ROOF) + 0.3) doubleJump(p);
    else p.jbuf = JUMP_BUFFER;
  } else if (dir === 'D') {
    if (p.air) { p.vy = Math.min(p.vy, DIVE_V); p.dive = true; } else { p.slideT = SLIDE_TIME; S.slides++; SFX.slide(); }
  }
}
/** The spring's one double jump: a second full jump from mid-air. */
function doubleJump(p, free) {
  if (!free) S.spring = false; // (Miles's own double jumps don't use the spring up)
  S.doubles++;
  p.vy = JUMP_V; p.dive = false; p.jbuf = 0; p.jumpT = S.t;
  SFX.spring(); burst(p.x, p.y, 0, ['#8ce99a', '#ffffff', '#d3f9d8'], 12, 3);
}
function jump(p) { p.air = true; p.vy = JUMP_V; p.slideT = 0; p.jbuf = 0; p.jumpT = S.t; S.jumps++; SFX.jump(); }

const keyHeld = {};
/** Is a swipe (or key) in this direction still being held? (Bennett's glide, Emily's slide) */
function held(dir) { return !!((touch && touch.fired && touch.dir === dir) || keyHeld[dir]); }
const KEYS = { ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R', ArrowUp: 'U', w: 'U', W: 'U', ' ': 'U', ArrowDown: 'D', s: 'D', S: 'D' };
window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { setMenu(!S.menu); e.preventDefault(); return; }
  if (S.menu) return;
  if (e.key === 'Enter') { act('go'); e.preventDefault(); return; }
  if (S.mode === 'sewer' && SEWER_KEYS[e.key]) { const k = SEWER_KEYS[e.key]; padKeys[k] = true; if (k === 'J' && !e.repeat) pad.tapped = true; e.preventDefault(); return; }
  const k = KEYS[e.key];
  if (k) keyHeld[k] = true;
  if (k && !e.repeat) { act(k); e.preventDefault(); }
  if ((e.key === 'c' || e.key === 'C' || e.key === 'Shift') && !e.repeat) { charm(); e.preventDefault(); }
});
window.addEventListener('keyup', function (e) { if (SEWER_KEYS[e.key]) padKeys[SEWER_KEYS[e.key]] = false; if (KEYS[e.key]) keyHeld[KEYS[e.key]] = false; });
// Swipes anywhere on the screen; one move per swipe (lift and swipe again).
const stage = document.getElementById('stage');
const SWIPE = 22; // px
let touch = null;
stage.addEventListener('pointerdown', function (e) {
  if (e.target.closest && (e.target.closest('button') || e.target.closest('#pad'))) return;
  audio();
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), fired: false };
});
stage.addEventListener('pointermove', function (e) {
  if (!touch || touch.id !== e.pointerId || touch.fired) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
  touch.fired = true;
  if (S.mode === 'select' && Math.abs(dx) > Math.abs(dy)) { act(dx < 0 ? 'R' : 'L'); return; } // drag the ring: the one to the right comes round
  touch.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'L' : 'R') : (dy < 0 ? 'U' : 'D');
  act(touch.dir);
});
function touchEnd(e) {
  if (!touch || touch.id !== e.pointerId) return;
  const tapped = !touch.fired && performance.now() - touch.t < 400;
  const x = e.clientX;
  touch = null;
  if (!tapped) return;
  if (S.mode === 'select') {
    const i = R.heroAt(x, e.clientY);
    // the one at the front plays; tapping another turns the ring to them
    if (i === S.sel) pickHero(ROSTER[i]);
    else if (i >= 0) { turnTo(i); SFX.hop(); haptic('light'); }
    else act(x < window.innerWidth / 2 ? 'L' : 'R');
  } else if (S.mode === 'ready') { S.tipsT = 99; S.modeT = Math.max(S.modeT, 2.4); }
  else if (S.mode === 'run') charm();
}
/** Mei's kawaii charm: a tap while she runs. */
function charm() {
  if (!skill('mei') || S.mode !== 'run') return;
  if (S.t < S.charmReady) { say('CHARM IN ' + Math.ceil(S.charmReady - S.t) + 's', 0.8, '#ffc9e3'); return; }
  S.charmT = CHARM_TIME; S.charmReady = S.t + CHARM_EVERY; S.charmAt = S.t; S.charms++;
  say('KAWAII!', 1.1, '#ff8fc7', true); SFX.charm(); haptic('success');
  hearts(S.p.x, S.p.y + 1.3, 0, 22, 4);
}
stage.addEventListener('pointerup', touchEnd);
stage.addEventListener('pointercancel', function () { touch = null; });
window.addEventListener('blur', function () { touch = null; padRelease(); Object.keys(keyHeld).forEach(function (k) { keyHeld[k] = false; }); });

// ---- the sewer's pad: a joystick and a jump button, like a Mario game ----------------
// (user, Oct 12 2026). The stick's x walks; pushed all the way it runs.
// Arrow keys / A-D run, Space / ↑ / W / Z / K jump (hold it to jump higher).
const SEWER_KEYS = { ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R', ' ': 'J', ArrowUp: 'J', w: 'J', W: 'J', z: 'J', Z: 'J', k: 'J', K: 'J' };
const padKeys = { L: false, R: false, J: false };
const padEl = document.getElementById('pad'), stickEl = padEl.querySelector('.stick'), knobEl = padEl.querySelector('.knob'), jumpEl = document.getElementById('jumpbtn');
const pad = { id: null, x: 0, jumpId: null, tapped: false }; // tapped: a press that's let go before the next step still jumps
function padInput() {
  const keys = (padKeys.R ? 1 : 0) - (padKeys.L ? 1 : 0);
  const jump = padKeys.J || pad.jumpId !== null || pad.tapped;
  pad.tapped = false;
  return [keys || pad.x, jump];
}
function stickShow(kx, ky, dir) {
  knobEl.style.transform = 'translate(' + (kx || 0) + 'px,' + (ky || 0) + 'px)';
  stickEl.classList.toggle('on', pad.id !== null);
  stickEl.setAttribute('data-dir', dir || '');
}
function stickRead(e) {
  const r = stickEl.getBoundingClientRect(), R = Math.max(1, r.width / 2 - knobEl.offsetWidth / 2);
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  pad.x = dx / R;
  stickShow(dx, dy, pad.x > 0.25 ? 'R' : pad.x < -0.25 ? 'L' : '');
}
stickEl.addEventListener('pointerdown', function (e) {
  e.preventDefault(); audio();
  pad.id = e.pointerId; // a new thumb always takes over, so it can never stick
  try { stickEl.setPointerCapture(e.pointerId); } catch { /* ok */ }
  stickRead(e);
});
stickEl.addEventListener('pointermove', function (e) { if (e.pointerId === pad.id) stickRead(e); });
function stickUp(e) { if (e.pointerId === pad.id) { pad.id = null; pad.x = 0; stickShow(0, 0, ''); } }
function jumpUp(e) { if (e.pointerId === pad.jumpId) { pad.jumpId = null; jumpEl.classList.remove('on'); } }
jumpEl.addEventListener('pointerdown', function (e) {
  e.preventDefault(); audio();
  pad.jumpId = e.pointerId; pad.tapped = true; jumpEl.classList.add('on');
  try { jumpEl.setPointerCapture(e.pointerId); } catch { /* ok */ }
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { stickEl.addEventListener(t, stickUp); jumpEl.addEventListener(t, jumpUp); });
window.addEventListener('pointerup', function (e) { stickUp(e); jumpUp(e); }, true);
window.addEventListener('pointercancel', function (e) { stickUp(e); jumpUp(e); }, true);
['touchend', 'touchcancel'].forEach(function (t) { document.addEventListener(t, function (e) { if (!e.touches.length) padRelease(); }, true); });
function padRelease() {
  pad.id = null; pad.x = 0; pad.jumpId = null; pad.tapped = false; padKeys.L = padKeys.R = padKeys.J = false;
  jumpEl.classList.remove('on'); stickShow(0, 0, '');
}

const pauseEl = document.getElementById('pause');
function setMenu(on) {
  S.menu = on; pauseEl.classList.toggle('show', on); duck(on);
  padRelease();
  if (on) document.getElementById('resume').focus();
}
document.getElementById('pausebtn').addEventListener('click', function () { setMenu(true); });
document.getElementById('resume').addEventListener('click', function () { setMenu(false); });
document.getElementById('psound').addEventListener('click', function () { setMuted(!isMuted()); syncMute(); });
document.getElementById('pmusic').addEventListener('click', function () { setMusic(!isMusicOn()); syncMute(); });
document.getElementById('exit').addEventListener('click', function () { sendScore('quit'); post({ type: 'exit' }); });
document.getElementById('again').addEventListener('click', function () { newRun(S.hero); });
document.getElementById('change').addEventListener('click', function () { setMode('select'); });
function syncMute() {
  document.getElementById('psound').textContent = isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
  document.getElementById('pmusic').textContent = isMusicOn() ? 'MUSIC: ON' : 'MUSIC: OFF';
}
syncMute();

// ---- update -----------------------------------------------------------------------------
// The first lap speeds up from 15 to 32 m/s; then every time you pass Kyoto (each 5 km lap) the
// trains go up a gear — 3.5 m/s faster, eased in over the first 400 m back in Tokyo — up to 50
// (user, Oct 15 2026: "Shinkansen dash should get faster every time you pass Kyoto").
const LAP_LEN = 5000, LAP_GEAR = 3.5, TOP = 50;
function speedFor(d) {
  const lap = Math.floor(d / LAP_LEN);
  if (lap === 0) return Math.min(32, 15 + d * 0.0045);
  return Math.min(TOP, 32 + LAP_GEAR * (lap - 1) + LAP_GEAR * Math.min(1, (d - lap * LAP_LEN) / 400));
}

function updateRunner(dt) {
  const p = S.p;
  // hop between trains
  if (p.laneT < 1) {
    p.laneT = Math.min(1, p.laneT + dt / LANE_TIME);
    p.x = p.from + (LANES[p.lane] - p.from) * (1 - Math.pow(1 - p.laneT, 3));
  }
  const lane = nearestLane(p.x);
  const realRoof = roofAt(lane, S.dist);
  let roof = realRoof;
  if (S.boardT > 0 && (roof === null || roof < ROOF)) roof = ROOF; // Jake's skateboard rolls right over the gaps
  // warn once when the train you're on is about to end
  S.gaps.forEach(function (g) {
    const ahead = g.g0 - S.dist;
    if (!g.warned && g.lane === p.lane && ahead > 0 && ahead < 15 + S.speed * 2.2) { g.warned = true; say('END OF THE TRAIN — HOP!', 1.5, '#ff9f43'); haptic('light'); }
  });
  if (p.slideT > 0) {
    p.slideT -= dt;
    if (skill('emily') && held('D') && !p.air) p.slideT = Math.max(p.slideT, 0.15); // Emily: hold it and she keeps sliding
  }
  if (skill('nicole') && !p.air && p.slideT <= 0.05) { // Nicole ducks crows on her own
    const crow = S.obs.find(function (o) { const a = o.d - S.dist; return o.type === 'crow' && !o.gone && !o.hit && o.lane === p.lane && a > -0.3 && a < S.speed * 0.22 + 1.4; });
    if (crow) { p.slideT = SLIDE_TIME; S.slides++; S.autoSlides++; SFX.slide(); }
  }
  if (skill('chris') && S.t >= S.smashReady) { // Chris's pickaxe smashes a fairing in his way
    const hump = S.obs.find(function (o) { const a = o.d - S.dist; return o.type === 'hump' && !o.gone && !o.hit && o.lane === p.lane && a > 0.2 && a < S.speed * 0.12 + 2.2; });
    if (hump) {
      hump.gone = true; S.smashReady = S.t + SMASH_EVERY; S.smashT = S.t; S.smashes++; S.score += pts(COIN);
      const y = (roofAt(hump.lane, hump.d) || ROOF) + 0.4, from = S.parts.length;
      burst(LANES[hump.lane], y, S.dist - hump.d, ['#c9ced6', '#8e98a3', '#5c636d', '#ffffff'], 18, 4);
      for (let k = from; k < S.parts.length; k++) S.parts[k].vz += S.speed;
      S.pops.push({ txt: '+' + COIN, t: 0.7, x: hump.lane, y: y + 0.6, d: hump.d });
      SFX.thunk(); haptic('light');
      if (S.smashes === 1) say('PICKAXE SMASH!', 1.1, '#ffd43b');
    }
  }
  if (S.boardT > 0 && (S.boardT -= dt) <= 0) {
    if (realRoof === null || realRoof < ROOF - 0.05) S.boardT = 0.05; // (never ends over a gap: rolls on to the next roof)
    else { S.boardT = 0; S.invuln = 1.2; say('BOARD\'S DONE', 1.2, '#ffffff'); }
  }
  if (p.jbuf > 0) p.jbuf -= dt;
  if (S.invuln > 0) S.invuln -= dt;
  if (S.charmT > 0) { // (hearts trail off her while it lasts)
    S.charmT -= dt;
    if (Math.floor(S.t * 10) !== Math.floor((S.t - dt) * 10)) S.parts.push({ x: p.x + (Math.random() - 0.5) * 0.8, y: p.y + 0.8 + Math.random() * 1.2, z: 0, vx: (Math.random() - 0.5) * 0.8, vy: 1.4, vz: 2, t: 0.7, col: Math.random() < 0.5 ? '#ff8fc7' : '#ffd6ec', s: 0.14, heart: true });
  }
  p.anim += dt * (6 + S.speed * 0.25);

  if (p.air) {
    p.vy -= GRAV * dt;
    p.gliding = skill('bennett') && held('U') && !p.dive && p.vy < -GLIDE_V; // Bennett's poncho catches the air
    if (p.gliding) { p.vy = -GLIDE_V; S.glides += dt; }
    p.y += p.vy * dt;
    if (roof !== null && p.y <= roof && p.vy <= 0) {
      p.y = roof; p.air = false; p.vy = 0; p.landT = S.t; p.doubled = false; p.gliding = false;
      if (p.dive) { p.dive = false; p.slideT = SLIDE_TIME; SFX.slide(); }
      if (p.jbuf > 0) jump(p);
    } else if (p.y < ROOF - 1.6 && manholeUnder(lane)) return enterSewer();
    else if (p.y < 0.6) return crash('fall');
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
    // Nicole's boba magnet: onigiri, boba, lucky cats and springs on her train or the next come to her
    const magnet = def.pickup && o.type !== 'guitar' && skill('nicole') && Math.abs(o.lane - lane) <= 1;
    if (Math.abs(o.d - S.dist) > def.len / 2 + (magnet ? 1.2 : 0.35)) continue;
    if (!def.all && o.lane !== lane && !magnet) continue;
    const base = def.all ? ROOF : (roofAt(o.lane, o.d) || ROOF);
    const lo = base + def.lo + (o.h || 0), hi = base + def.hi + (o.h || 0);
    if (!magnet && (p.y + h <= lo || p.y >= hi)) continue;
    if (magnet && (o.lane !== lane || p.y + h <= lo || p.y >= hi)) S.magnets++;
    if (!def.pickup && S.charmT > 0) { // Mei's charm: it pops into hearts
      o.gone = true; S.score += pts(CHARM_PTS); S.charmed++;
      hearts(LANES[o.lane], lo + 0.5, S.dist - o.d, 12, 4);
      S.pops.push({ txt: '+' + pts(CHARM_PTS) + ' ♥', t: 0.8, x: o.lane, y: lo + 0.8, d: o.d });
      SFX.pop();
      continue;
    }
    if (!def.pickup && S.boardT > 0) { // the skateboard ploughs through
      o.gone = true; S.score += pts(COIN);
      burst(LANES[o.lane], lo + 0.4, S.dist - o.d, ['#c9ced6', '#ffd43b', '#ffffff'], 14, 4);
      SFX.thunk();
      continue;
    }
    if (def.pickup) {
      o.gone = true; o.gotT = S.t; // (drawn flying off for a moment)
      burst(LANES[o.lane], lo + 0.5, 0, o.type === 'onigiri' ? ['#ffffff', '#ffe066', '#b2f2bb'] : ['#ffe066', '#ff8787', '#ffffff'], 10, 3);
      if (o.type === 'onigiri') {
        const got = pts(COIN * (skill('chris') && inTunnel(S.dist) ? 2 : 1)); // Chris's miner's lamp: double in tunnels
        S.coins++; S.score += got; SFX.coin(); S.pops.push({ txt: '+' + got, t: 0.7, x: o.lane, y: lo + 0.8, d: o.d });
        if (skill('jake') && S.boardT <= 0 && ++S.boardCount >= BOARD_EVERY) { // Jake: every BOARD_EVERY, the manhole skateboard
          S.boardCount = 0; S.boardT = BOARD_TIME; S.boards++;
          say('MANHOLE SKATEBOARD!', 1.8, '#ffd43b', true); SFX.neko(); haptic('success');
        }
      }
      else if (o.type === 'boba') {
        S.score += pts(BOBA); S.bobas++; SFX.neko(); S.pops.push({ txt: '+' + pts(BOBA), t: 0.9, x: o.lane, y: lo + 0.8, d: o.d });
        if (locked('nicole')) unlockHero('nicole'); else say('BOBA!', 1.2, '#ffc9a3');
      } else if (o.type === 'spring') {
        S.spring = true; S.guitarDue = S.dist + GUITAR_AFTER; SFX.spring(); haptic('success'); say('SPRING! DOUBLE JUMP', 1.6, '#8ce99a');
      } else if (o.type === 'guitar') {
        S.score += pts(GUITAR); S.guitars++; SFX.chime(); S.pops.push({ txt: '+' + pts(GUITAR), t: 0.9, x: o.lane, y: lo + 0.8, d: o.d });
        burst(LANES[o.lane], lo + 0.5, 0, ['#ffd43b', '#fff3bf', '#ffffff'], 24, 5);
        if (locked('miles')) unlockHero('miles'); else say('GOLDEN GUITAR!', 1.4, '#ffd43b');
      } else { S.shield = true; S.nekos++; S.score += pts(NEKO); SFX.neko(); haptic('success'); say('LUCKY CAT!', 1.4, '#ffe066'); }
      continue;
    }
    o.hit = true;
    crash(o.type);
    if (S.mode !== 'run') return;
    o.gone = true; // the lucky cat smashed it
  }
}
// ---- Liam's skill: ninja stars -------------------------------------------------------
// (user, Oct 12 2026: "Liam … should throw ninja stars at birds and kill them
// when he gets close to them automatically as his advantage skill"). A crow
// ahead on his train, once it's close, gets a star: thrown so it lands with
// room to spare whatever the speed (STAR_TIME at today's speed + 1.5 m), the
// crow tumbles off in a puff of feathers, +50. Crows on other trains are left
// alone — hop into one too late and it still gets you.
const STAR_TIME = 0.16, STAR_REACH = 9, CROW_KILL = 50;
function ninjaStars(dt) {
  const p = S.p, near = S.speed * STAR_TIME + 1.5;
  S.obs.forEach(function (o) {
    if (o.type !== 'crow' || o.gone || o.hit || o.marked || o.lane !== p.lane) return;
    const ahead = o.d - S.dist;
    if (ahead < near || ahead > near + STAR_REACH) return;
    o.marked = true; S.throws++; S.throwT = S.t;
    S.stars.push({ o: o, t: 0, x0: p.x, y0: p.y + 1.25 });
    SFX.star();
  });
  for (let i = S.stars.length - 1; i >= 0; i--) {
    const st = S.stars[i];
    if ((st.t += dt) < STAR_TIME) continue;
    S.stars.splice(i, 1);
    const o = st.o, y = (roofAt(o.lane, o.d) || ROOF) + 1.35, z = S.dist - o.d;
    o.gone = true; o.killT = S.t; S.kills++; S.score += pts(CROW_KILL);
    S.pops.push({ txt: '+' + pts(CROW_KILL), t: 0.8, x: o.lane, y: y + 0.5, d: o.d });
    const from = S.parts.length;
    burst(LANES[o.lane], y, z, ['#15171c', '#2c313a', '#ffffff'], 14, 3);
    for (let k = from; k < S.parts.length; k++) S.parts[k].vz += S.speed; // the feathers come past with the train
    SFX.thunk(); haptic('light');
    if (S.kills === 1) say('NINJA STAR!', 1.1, '#ff6b6b');
  }
}

// ---- the sewer (Jake's secret) ------------------------------------------------------
function manholeUnder(lane) {
  return !S.simulating && S.gaps.some(function (g) { return g.manhole && g.lane === lane && S.dist > g.g0 - NOSE && S.dist < g.g1; });
}
function enterSewer() {
  S.sewer = { s: createSewer(), acc: 0, cam: -2.2, plan: S.sewerPlan || null };
  padRelease();
  setMode('sewer');
  SFX.sewer(); haptic('success');
}
function updateSewer(dt) {
  const sw = S.sewer, s = sw.s;
  sw.acc += dt;
  while (sw.acc >= SEWER_STEP) { // fixed steps, so a run replays exactly
    sw.acc -= SEWER_STEP;
    let m = padInput();
    if (sw.plan) m = sw.plan[Math.floor(s.steps / SEWER_BLOCK)] || [0, 0];
    stepSewer(s, m[0], m[1]);
    s.events.forEach(function (e) {
      if (e === 'jump') SFX.jump();
      else if (e === 'coin') SFX.coin();
      else if (e === 'stomp') { SFX.hop(); haptic('light'); }
      else if (e === 'skid') SFX.slide();
      else if (e === 'brick') { SFX.thunk(); haptic('light'); }
      else if (e === 'feather') SFX.spring();
      else if (e === 'suit') { SFX.neko(); haptic('success'); say('TANUKI SUIT!', 1.6, '#ffd43b', true); say('TAP JUMP IN THE AIR TO FLOAT', 2.4, '#ffffff'); }
      else if (e === 'feather-again') SFX.coin();
      else if (e === 'wag') SFX.wag();
      else if (e === 'shrink') { SFX.shield(); haptic('error'); say('SUIT LOST!', 1.2, '#ff8787'); }
      else if (e === 'die') { SFX.crash(); haptic('error'); }
      else if (e === 'exit') { SFX.pipe(); haptic('success'); }
    });
  }
  if (s.done !== null && s.t - s.done > 1.1) exitSewer();
  else if (s.dead !== null && s.t - s.dead > 1.6) { // into the sludge or caught by a rat: the run is over
    S.score += sewerPoints(s); if (S.score > S.hi) S.hi = S.score;
    S.sewer = null; setMode('gameover'); sendScore('gameover');
  }
}
/** Out of the end pipe: back up onto a train, covered in sludge until the run ends. */
function exitSewer() {
  const pts = sewerPoints(S.sewer.s);
  S.score += pts; if (S.score > S.hi) S.hi = S.score;
  S.sewer = null; S.sewers++; S.sludge = true;
  setMode('run');
  const p = S.p, open = [1, 0, 2].filter(function (l) { return flatAt(l, S.dist + 20, 30); });
  const lane = open.length ? open[0] : 1;
  Object.assign(p, { lane: lane, from: LANES[lane], x: LANES[lane], laneT: 1, y: ROOF + 3, vy: 0, air: true, slideT: 0, jbuf: 0, dive: false });
  S.invuln = 2.2;
  S.obs = S.obs.filter(function (o) { return o.d - S.dist > 45 || o.d < S.dist; }); // a clear stretch to land on
  say('+' + pts, 1.6, '#ffe066', true);
  if (locked('jake')) unlockHero('jake'); else say('BACK UP TOP!', 1.6, '#c69a6a');
  scoreUnlocks();
  burst(p.x, p.y, 0, ['#7a4e24', '#5a3a1a', '#a0703c'], 26, 5);
}

/** Travellers earned with points (Liam: 30,000 in one run). */
function scoreUnlocks() {
  ROSTER.forEach(function (h) { if (UNLOCK[h] && UNLOCK[h].score && locked(h) && S.score >= UNLOCK[h].score) unlockHero(h); });
}

function nearestLane(x) { let b = 0; for (let i = 1; i < 3; i++) if (Math.abs(LANES[i] - x) < Math.abs(LANES[b] - x)) b = i; return b; }

function update(dt) {
  S.t += dt; S.modeT += dt;
  if (S.shakeT > 0) S.shakeT -= dt;
  if (S.hint && (S.hint.t -= dt) <= 0) S.hint = null;
  for (let i = S.msgs.length - 1; i >= 0; i--) { S.msgs[i].t -= dt; if (S.msgs[i].t <= 0) S.msgs.splice(i, 1); }
  for (let i = S.pops.length - 1; i >= 0; i--) { S.pops[i].t -= dt; S.pops[i].y += dt * 1.5; if (S.pops[i].t <= 0) S.pops.splice(i, 1); }
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const q = S.parts[i]; q.t -= dt; q.vy -= 12 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    if (q.t <= 0) S.parts.splice(i, 1);
  }

  if (S.mode === 'sewer') { updateSewer(dt); return; }
  if (S.sludge && S.mode === 'run' && S.p && Math.floor(S.t * 8) !== Math.floor((S.t - dt) * 8)) { // sludge drips off you
    S.parts.push({ x: S.p.x + (Math.random() - 0.5) * 0.6, y: S.p.y + 0.6 + Math.random() * 1.1, z: 0, vx: (Math.random() - 0.5) * 0.6, vy: -0.5, vz: 1.5, t: 0.6, col: Math.random() < 0.5 ? '#6b4423' : '#4a2f16', s: 0.12 });
  }
  if (S.mode === 'ready') {
    const k = S.modeT;
    if (Math.floor(k / 0.8) !== Math.floor((k - dt) / 0.8) && k < 2.4) SFX.count(false);
    S.speed = Math.min(speedFor(0), S.speed + dt * 12);
    S.dist += S.speed * dt * 0.4;
    // the first time ever: the countdown waits on the how-to-play card (a tap or a swipe goes on)
    if (S.tips && !S.simulating && k >= 2.3) {
      S.tipsT += dt;
      if (S.tipsT < 9) { S.modeT = 2.3; spawnAhead(); return; }
      S.tips = false; post({ type: 'tips-seen' });
    }
    if (k >= 2.4) { setMode('run'); SFX.count(true); say('GO!', 0.8, '#69db7c', true); if (!S.simulating && HEROES[S.hero].hint) say(HEROES[S.hero].hint, 2.6, '#ffe066'); }
    spawnAhead();
  } else if (S.mode === 'run') {
    S.speed = speedFor(S.dist);
    const before = S.dist;
    S.dist += S.speed * dt;
    S.score += Math.floor(S.dist) - Math.floor(before);
    ROSTER.forEach(function (h) { if (UNLOCK[h] && UNLOCK[h].at && locked(h) && S.dist >= UNLOCK[h].at) unlockHero(h); });
    if (S.mult < 5 && S.dist - S.multD >= MULT_EVERY) { S.mult++; S.multD = S.dist; say('×' + S.mult + ' MULTIPLIER!', 1.2, '#8ce99a'); SFX.mult(); }
    S.missions.forEach(function (q) {
      if (!q.done && q.m.at() >= q.m.goal) { q.done = true; S.score += MISSION_PTS; say('MISSION DONE: ' + q.m.txt, 1.8, '#ffe066'); SFX.chime(); haptic('success'); }
    });
    if (!S.bestPassed && S.best >= BEST_MIN && S.dist >= S.best && !S.simulating) {
      S.bestPassed = true; say('NEW BEST!', 1.8, '#ffe066', true); SFX.lap(); haptic('success');
      burst(S.p.x, S.p.y + 2, 0, ['#ffe066', '#ffffff', '#ffa94d'], 30, 6);
    }
    scoreUnlocks();
    if (S.score > S.hi) S.hi = S.score;
    spawnAhead();
    if (skill('liam')) ninjaStars(dt);
    updateRunner(dt);
    // stages: Tokyo → … → Kyoto, then round again
    const st = Math.floor(S.dist / STAGE_LEN), stage = st % 5, lap = Math.floor(st / 5);
    if (stage !== S.stage || lap !== S.lap) {
      S.stage = stage; S.lap = lap; S.maxStage = Math.max(S.maxStage, lap > 0 ? 4 : stage);
      if (stage === 0) { say('ROUND ' + (lap + 1) + '!', 2, '#ffe066', true); say('BACK TO TOKYO · FASTER!', 2, '#ffffff'); SFX.lap(); }
      else say(STAGES[stage].name, 2.2, '#ffffff', true);
      SFX.chime(); haptic('light');
    }
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
  game: { S: S, UNLOCK: UNLOCK, locked: locked, LANES: LANES, ROOF: ROOF, noseHeight: noseHeight, NOSE: NOSE, CAR: CAR, LANE_OFF: LANE_OFF, STAGES: STAGES, STAGE_LEN: STAGE_LEN, HEROES: HEROES, ROSTER: ROSTER, OBS: OBS, roofAt: roofAt, inTunnel: inTunnel, SLIDE_TIME: SLIDE_TIME, BEST_MIN: BEST_MIN,
    passBy: function () { SFX.pass(); } }
});
window.addEventListener('resize', function () { R.layout(); });
let last = 0;
const STEP = 1 / 60;
function frame(ts) {
  const dt = Math.min(0.25, last ? (ts - last) / 1000 : STEP); last = ts;
  // Advance by exactly the time that passed, in steps of at most 1/60 s. (A
  // fixed-step accumulator without interpolation made the world move 0 or 2
  // steps on some frames — a visible stutter at these speeds, worst on 120 Hz
  // screens where every other frame had no step at all.)
  if (!S.paused && !S.menu) { let left = dt; while (left > 1e-6) { const h = Math.min(STEP, left); update(h); left -= h; } }
  // the song plays through a run (muffled down in the sewer), a beat quicker every lap
  music(S.mode === 'run' || S.mode === 'sewer' || S.mode === 'ready', S.runId, S.lap, S.speed); muffled(S.mode === 'sewer' || (S.mode === 'run' && inTunnel(S.dist)), S.mode === 'sewer' ? 650 : 1800);
  R.render(dt);
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', function () {
  S.paused = document.hidden; last = 0;
  if (document.hidden && (S.mode === 'run' || S.mode === 'ready' || S.mode === 'sewer')) setMenu(true);
});

window.__dash = {
  get mode() { return S.mode; }, get score() { return S.score; }, get dist() { return S.dist; }, get speed() { return S.speed; },
  get lane() { return S.p ? S.p.lane : null; }, get hero() { return S.hero; }, get hi() { return S.hi; }, get coins() { return S.coins; },
  get stage() { return S.stage + 1; }, get round() { return S.lap + 1; }, get shield() { return S.shield; }, get menu() { return S.menu; },
  get y() { return S.p ? S.p.y - ROOF : null; }, get air() { return !!(S.p && S.p.air); }, get sliding() { return !!(S.p && S.p.slideT > 0); },
  get gl() { return R.hasGL; }, get sel() { return S.sel; }, get ringSettled() { return R.ringSettled(); }, get locked() { return ROSTER.filter(locked); }, get hint() { return S.hint && S.hint.txt; }, get jumps() { return S.jumps; }, get bobas() { return S.bobas; }, get guitars() { return S.guitars; }, get doubles() { return S.doubles; }, get spring() { return S.spring; }, get skills() { return { smashes: S.smashes, glides: +S.glides.toFixed(2), magnets: S.magnets, autoSlides: S.autoSlides, boardCount: S.boardCount, boardT: +S.boardT.toFixed(2), boards: S.boards, doubles: S.doubles, gliding: !!(S.p && S.p.gliding) }; }, get throws() { return S.throws; }, get mult() { return S.mult; }, get missions() { return S.missions.map(function (q) { return { id: q.m.id, done: q.done }; }); }, get best() { return S.best; }, get bestPassed() { return S.bestPassed; }, get tips() { return S.tips; }, get music() { return musicState(); }, get charm() { return { ready: S.t >= S.charmReady, on: S.charmT > 0, charms: S.charms, charmed: S.charmed }; }, get kills() { return S.kills; }, get sludge() { return S.sludge; }, get sewers() { return S.sewers; },
  get sewer() { const w = S.sewer && S.sewer.s; return w ? { bricks: w.bricks, suit: w.suit, wags: w.wags, hurt: w.hurtT > 0, feathers: w.feathers.filter(function (f) { return !f.got; }).map(function (f) { return featherAt(f, w.t); }), x: +w.x.toFixed(2), y: +w.y.toFixed(2), vx: +w.vx.toFixed(2), peak: +w.peak.toFixed(2), ground: w.ground, face: w.face, skid: w.skid, coins: w.got, stomps: w.stomps, done: w.done !== null, dead: w.dead !== null, steps: w.steps } : null; },
  sewerRoute: function () { return routeExists(); }, sewerReplay: function (plan) { return sewerReplay(plan); }, get slides() { return S.slides; }, get invuln() { return S.invuln > 0; },
  fairnessProblems: fairnessProblems,
  programs: function () { return R.programs(); },
  shown: function (kind) { return R.shown(kind); }, // where the visible models of a kind are (tests)
  heroPoint: function (i) { return R.heroPoint(i); } // where hero i stands on the select screen (client px, tests)
};
if (INIT.debug) {
  window.__dash.sfx = SFX;
  window.__dash.debug = {
    calm: function () { S.calm = true; S.obs.length = 0; S.gaps.length = 0; S.nextGap = 1e9; },
    spawn: function (type, lane, ahead) { add(type, lane, S.dist + ahead); },
    gap: function (lane, ahead) { const g0 = gridUp(lane, S.dist + ahead); S.gaps.push({ lane: lane, g0: g0, g1: g0 + CAR * 2 }); return g0 - S.dist; },
    lane: function (l) { const p = S.p; p.lane = l; p.x = LANES[l]; p.laneT = 1; },
    score: function (n) { S.score = n; }, // (tests: jump to a score)
    mult: function (n) { S.mult = n; },
    best: function (d) { S.best = d; S.bestPassed = false; },
    missions: function (ids) { S.missions = ids.map(function (id) { return { m: MISSIONS.find(function (m) { return m.id === id; }), done: false }; }); },
    setDist: function (d) { S.dist = d; S.nextRow = d + 60; S.obs.length = 0; },
    shield: function () { S.shield = true; },
    spring: function () { S.spring = true; },
    manhole: function (lane, ahead) { const g0 = gridUp(lane, S.dist + ahead); S.gaps.push({ lane: lane, g0: g0, g1: g0 + CAR * 2, manhole: true }); return g0 - S.dist; },
    sewer: function () { enterSewer(); },
    sewerPut: function (x, y) { const w = S.sewer && S.sewer.s; if (w) Object.assign(w, { x: x, y: y, vx: 0, vy: 0, ground: y <= 0 }); }, // (tests)
    sewerPlan: function (plan) { S.sewerPlan = plan || null; if (S.sewer) S.sewer.plan = S.sewerPlan; }, // [stick, jump] per BLOCK steps
    gameOver: function (score) { S.score = score | 0; if (S.score > S.hi) S.hi = S.score; S.invuln = 0; S.boardT = 0; S.shield = false; crash('hit'); },
    pause: function (on) { S.paused = !!on; },
    step: function (n) { for (let i = 0; i < n; i++) update(1 / 60); }, // (tests, while paused: exact game time)
    boardCount: function (n) { S.boardCount = n; }, // (tests: onigiri towards Jake's skateboard)
    go: function () { if (S.mode === 'ready') S.modeT = 2.4; },
    simulate: simulate
  };
}

/**
 * Plays a whole run headless with a perfect-reaction bot, through the real
 * update loop (development/tests only). If even the bot can't get through,
 * some sequence of rows is unwinnable. Returns how far it got and why it stopped.
 */
function simulate(runSeed, metres) {
  const keepSeed = INIT.seed;
  INIT.seed = runSeed;
  newRun('chris');
  S.modeT = 2.4;
  setQuiet(true);
  S.simulating = true; // (the bot can't earn travellers)
  let steps = 0;
  const lane = function () { return S.p.lane; };
  const blocked = function (l, from, to) { // a pantograph, or no flat train, ahead in lane l
    if (!flatAt(l, S.dist + (from + to) / 2, (to - from) / 2 + NOSE * 0.3)) return true;
    return S.obs.some(function (o) { return !o.gone && o.lane === l && o.type === 'panto' && o.d - S.dist > from && o.d - S.dist < to; });
  };
  const busy = function (l, to) { // anything at all (but onigiri) close ahead in lane l
    return S.obs.some(function (o) { return !o.gone && !OBS[o.type].pickup && (o.lane === l || OBS[o.type].all) && o.d - S.dist > -1.5 && o.d - S.dist < to; });
  };
  while (S.dist < metres && steps < 60 * 60 * 20) {
    if (S.mode === 'ready' || S.mode === 'run') {
      const p = S.p, v = Math.max(S.speed, 10), reach = v * 0.5 + 3;
      if (p.laneT >= 1 && blocked(lane(), -1, reach)) {
        const order = [lane() - 1, lane() + 1, lane() - 2, lane() + 2].filter(function (l) { return l >= 0 && l < 3; });
        const ok = order.filter(function (l) { return !blocked(l, -1, reach + 6) && (Math.abs(l - lane()) === 1 || !blocked(1, -1, 4)); });
        const to = ok.find(function (l) { return !busy(l, 4); }) ?? ok[0];
        if (to !== undefined) { act(to < lane() ? 'L' : 'R'); }
      }
      const next = S.obs.filter(function (o) { return !o.gone && (o.lane === lane() || OBS[o.type].all) && !OBS[o.type].pickup && o.d - S.dist > -0.5; })
        .sort(function (a, b) { return a.d - b.d; })[0];
      if (next) {
        const ahead = next.d - S.dist;
        if (next.type === 'hump' && !p.air && ahead < v * 0.2 + 1.6) act('U');
        if ((next.type === 'gantry' || next.type === 'crow') && ahead < v * 0.22 + 1.2 && p.slideT <= 0.05) act('D');
      }
    } else break;
    update(STEP);
    steps++;
  }
  setQuiet(false);
  S.simulating = false;
  INIT.seed = keepSeed;
  const out = { dist: Math.round(S.dist), mode: S.mode, why: S.p.crash || null, stage: S.stage + 1, round: S.lap + 1, at: S.mode === 'crash' ? S.lastCrash : null };
  setMode('select');
  return out;
}

R.layout();
requestAnimationFrame(frame);
post({ type: 'ready' });
