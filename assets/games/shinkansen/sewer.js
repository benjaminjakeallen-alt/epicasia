// The sewer under the line (Shinkansen Dash's secret, user Oct 12 2026: an
// open manhole in a gap between trains drops you into "a Mario brothers side
// scroller 2d board where you play an underground level where you end at a
// pipe you jump in"). Reach the pipe without dying → Jake is unlocked and you
// pop back up onto the trains, covered in sludge.
//
// Controls like Super Mario Bros. 3 (user, Oct 12 2026: "a joystick, jump
// button just like a Mario game and control very similar to a Mario 3 type
// game"): the stick walks, pushed all the way it runs; speed builds up and
// eases off, turning round at speed skids; the jump goes higher the longer
// the button is held (and higher still at a run), letting go early cuts it
// short, and you fall faster than you rise. A little steering in the air.
// Units are tiles, y up, the floor at y 0. Pits drop into sludge; pipes and
// brick ledges are solid; rats patrol (land on them to stomp them — hold
// jump to bounce higher —, touch them otherwise and you're done); coins are
// +10. Bricks break when you hit them from below with your head (+50); the
// first one broken in each row lets out a feather that drifts down — catch
// it for a tanuki suit, like Super Mario Bros. 3's (user, Oct 13 2026): tap
// jump in the air and the tail wags you down slowly, and a rat only knocks
// the suit off instead of finishing you. Land on top of the big pipe at the end to go in. Everything steps at
// a fixed 1/60 s so a run replays exactly — routeExists() searches stick and
// button inputs to prove the level can be finished.

export const STEP = 1 / 60;
const WALK = 5.5, RUN = 9, ACCEL = 13, RUN_ACCEL = 17, FRICTION = 15, SKID = 34, AIR_ACCEL = 11;
const JUMP_V = 13, JUMP_RUN_V = 1.6, G_HOLD = 32, G = 85, MAX_FALL = 18, STOMP_V = 8, STOMP_HOLD_V = 13;
const COYOTE = 0.08, BUFFER = 0.12, RUN_AT = 0.85, DEAD = 0.25;
export const PW = 0.75, PH = 1.4; // the player's box (x is its left edge, y its feet)

// ---- the level -------------------------------------------------------------------------
const FLOORS = [[-8, 18], [21.5, 44], [47.5, 70], [73, 84], [87.5, 110], [113.5, 165]]; // the gaps are sludge pits
const PIPES = [[13, 1.6, 1.2], [36, 1.6, 2.0], [64, 1.6, 1.6], [120, 1.6, 1.2], [126, 1.6, 2.0]]; // x, width, height
const LEDGES = [[52, 6, 1.7, 2.2], [97, 4, 1.7, 2.2]]; // x, width, bottom, top (brick blocks)
export const EXIT = { x: 146, w: 3, h: 2.2 }; // the big pipe: land on top to go in
const RATS = [[26, 33, 1.6], [55, 62, 1.8], [90, 96, 2.0], [100, 107, 2.2], [131, 139, 2.0]]; // patrol from, to, speed
const COINS = [
  [8, 1.2], [9, 1.2], [10, 1.2],
  [35.8, 3.0], [36.8, 3.6], [37.8, 3.0],
  [53, 3.0], [54.5, 3.0], [56, 3.0], [57.5, 3.0],
  [75, 1.2], [76, 1.2], [77, 1.2], [78, 1.2],
  [98, 3.0], [99.5, 3.0],
  [119.6, 2.6], [126.5, 3.4], [127.5, 3.4],
  [140, 1.2], [141, 1.2], [142, 1.2],
];
// Each brick of a ledge on its own: [x0, x1, y0, y1, row].
const BRICKS = LEDGES.flatMap(([x, w, b, t], row) => Array.from({ length: w }, (_, i) => [x + i, x + i + 1, b, t, row]));
export const LEVEL = { FLOORS, PIPES, LEDGES, BRICKS, EXIT, RATS, COINS, LENGTH: EXIT.x + EXIT.w + 4, CEILING: 6.5 };

// Every solid box that never changes: [x0, x1, y0, y1] (the bricks are added while unbroken).
const SOLIDS = [
  ...FLOORS.map(([a, b]) => [a, b, -20, 0]),
  ...PIPES.map(([x, w, h]) => [x, x + w, 0, h]),
  [EXIT.x, EXIT.x + EXIT.w, 0, EXIT.h],
];
const solidsOf = (s) => s.solids || (s.solids = SOLIDS.concat(BRICKS.filter((_, i) => !s.broken[i]))); // (rebuilt only when a brick breaks)
const SUIT_FALL = 2.2, WAG = 0.32, HURT = 1.6, BRICK_PTS = 50;

/** Where a let-out feather is, `age` s after it popped out: up, then drifting down, swaying. */
export function featherAt(f, t) {
  const age = t - f.t0, up = Math.min(1, age / 0.35);
  return { x: f.x + Math.sin(Math.max(0, age - 0.35) * 2.6) * 0.9, y: Math.max(0.35, f.y + up * 1.3 - Math.max(0, age - 0.35) * 0.9), tilt: Math.cos(Math.max(0, age - 0.35) * 2.6) * 0.6 };
}

/** Where rat i is at time t (its left edge) and which way it faces. */
export function ratAt(i, t) {
  const [a, b, v] = RATS[i], span = b - a, k = (t * v) % (2 * span);
  return k < span ? { x: a + k, dir: 1 } : { x: b - (k - span), dir: -1 };
}
export const RAT_W = 0.95, RAT_H = 0.7;

export function createSewer() {
  return {
    t: 0, x: 0, y: 0, vx: 0, vy: 0, ground: true, coyote: 0, buffer: 0, steps: 0, held: false, rising: false,
    face: 1, skid: false, stride: 0, airMax: WALK, peak: 0,
    coins: COINS.map(() => false), rats: RATS.map(() => true), stomps: 0, got: 0,
    broken: BRICKS.map(() => false), bricks: 0, rowsOpened: LEDGES.map(() => false), feathers: [], suit: false, wagT: 0, hurtT: 0, wags: 0,
    dead: null, done: null, events: [],
  };
}
const overlap = (ax0, ax1, ay0, ay1, b) => ax0 < b[1] && ax1 > b[0] && ay0 < b[3] && ay1 > b[2];
const toward = (v, to, by) => (v < to ? Math.min(to, v + by) : Math.max(to, v - by));
const LEFT_EDGE = LEVEL.FLOORS[0][0] + 0.5; // the wall at the start

/**
 * One fixed step. `stick` is the joystick's x, -1…1 (keys: ±1); `jump` is
 * whether the jump button is held (a press is when it goes down). Returns
 * the state; its events: 'jump', 'land', 'coin', 'stomp', 'skid', 'die', 'exit'.
 */
export function stepSewer(s, stick, jump) {
  s.events = [];
  s.t += STEP;
  if (s.dead !== null || s.done !== null) return s;
  s.steps++;
  stick = Math.abs(stick) < DEAD ? 0 : Math.max(-1, Math.min(1, stick));
  const pressed = jump && !s.held;
  s.held = !!jump;
  if (pressed) s.buffer = BUFFER; else s.buffer = Math.max(0, s.buffer - STEP);
  s.coyote = s.ground ? COYOTE : Math.max(0, s.coyote - STEP);

  // ---- running: speed builds and eases off; turning round at speed skids
  const dir = Math.sign(stick), top = Math.abs(stick) >= RUN_AT ? RUN : WALK;
  const wasSkid = s.skid;
  s.skid = false;
  if (s.ground) {
    if (!dir) s.vx = toward(s.vx, 0, FRICTION * STEP);
    else if (s.vx * dir < 0) { s.vx = toward(s.vx, 0, SKID * STEP); s.skid = Math.abs(s.vx) > 2.5; }
    else if (Math.abs(s.vx) > top) s.vx = toward(s.vx, dir * top, FRICTION * STEP); // let go of run: back down to a walk
    else s.vx = toward(s.vx, dir * top, (top === RUN ? RUN_ACCEL : ACCEL) * STEP);
    if (dir) s.face = dir;
  } else if (dir) { // steering in the air, never faster than you took off
    s.vx = toward(s.vx, dir * s.airMax, (s.vx * dir < 0 ? AIR_ACCEL * 1.6 : AIR_ACCEL) * STEP);
  }
  if (s.skid && !wasSkid) s.events.push('skid');

  // ---- jumping: higher at a run, held = higher
  if (s.buffer > 0 && (s.ground || s.coyote > 0)) {
    s.vy = JUMP_V + JUMP_RUN_V * Math.min(1, Math.abs(s.vx) / RUN) * (Math.abs(s.vx) > WALK ? 1.4 : 1);
    s.ground = false; s.coyote = 0; s.buffer = 0; s.rising = true; s.airMax = Math.max(WALK, Math.abs(s.vx));
    if (s.skid) { s.vx = 0; s.skid = false; } // a skid jump turns you round on the spot
    s.peak = s.y;
    s.events.push('jump');
  }
  if (s.vy <= 0 || !s.held) s.rising = false; // let go: the jump is cut short
  s.vy = Math.max(-MAX_FALL, s.vy - (s.rising ? G_HOLD : G) * STEP);
  // the tanuki suit: tap jump while falling and the tail wags you down slowly
  if (s.suit && !s.ground && pressed && s.vy < 0) { s.wagT = WAG; s.wags++; s.events.push('wag'); }
  if (s.wagT > 0) { s.wagT -= STEP; s.vy = Math.max(s.vy, -SUIT_FALL); }
  if (s.hurtT > 0) s.hurtT -= STEP;

  // ---- vertical
  const solids = solidsOf(s);
  const y0 = s.y; let y = s.y + s.vy * STEP, landed = false;
  const bumped = [];
  for (const b of solids) {
    if (!overlap(s.x, s.x + PW, Math.min(y, y0), Math.max(y, y0) + PH, b)) continue;
    if (s.vy <= 0 && y0 >= b[3] - 1e-6 && y < b[3]) { y = b[3]; s.vy = 0; landed = true; } // landed on top
    else if (s.vy > 0 && y0 + PH <= b[2] + 1e-6 && y + PH > b[2]) { y = b[2] - PH; s.vy = 0; s.rising = false; if (b.length === 5) bumped.push(b); } // bumped a head
  }
  bumped.forEach((b) => { // a head-butt breaks the brick; the first in each row lets out a feather
    const i = BRICKS.indexOf(b); // (arrays are replaced, not changed, so states can share them)
    s.broken = s.broken.map((v, k) => v || k === i); s.solids = null; s.bricks++; s.events.push('brick');
    if (!s.rowsOpened[b[4]]) {
      s.rowsOpened = s.rowsOpened.map((v, k) => v || k === b[4]);
      s.feathers = s.feathers.concat([{ x: b[0] + 0.5, y: b[3], t0: s.t, got: false }]); s.events.push('feather');
    }
  });
  if (landed && !s.ground) { s.events.push('land'); s.airMax = WALK; }
  s.y = y; s.ground = landed;
  if (!s.ground) s.peak = Math.max(s.peak, s.y);

  // ---- horizontal: walls stop you from either side
  let x = s.x + s.vx * STEP;
  for (const b of solids) {
    if (!overlap(x, x + PW, s.y + 1e-4, s.y + PH, b)) continue;
    if (s.vx > 0 && s.x + PW <= b[0] + 1e-6) { x = Math.min(x, b[0] - PW); s.vx = 0; }
    else if (s.vx < 0 && s.x >= b[1] - 1e-6) { x = Math.max(x, b[1]); s.vx = 0; }
  }
  if (x < LEFT_EDGE) { x = LEFT_EDGE; s.vx = Math.max(0, s.vx); }
  s.x = x;
  s.stride += Math.abs(s.vx) * STEP;
  // coins
  COINS.forEach(([cx, cy], i) => {
    if (!s.coins[i] && Math.abs(cx - (s.x + PW / 2)) < 0.7 && cy > s.y - 0.4 && cy < s.y + PH + 0.3) { s.coins[i] = true; s.got++; s.events.push('coin'); }
  });
  // feathers: catch one for the tanuki suit
  s.feathers.forEach((f, k) => {
    if (f.got) return;
    const p = featherAt(f, s.t);
    if (Math.abs(p.x - (s.x + PW / 2)) < 0.75 && p.y > s.y - 0.4 && p.y < s.y + PH + 0.4) {
      s.feathers = s.feathers.map((q, j) => (j === k ? { ...q, got: true } : q));
      s.events.push(s.suit ? 'feather-again' : 'suit'); s.suit = true;
    }
  });
  // rats
  for (let i = 0; i < RATS.length; i++) {
    if (!s.rats[i] || s.hurtT > 0) continue;
    const r = ratAt(i, s.t);
    if (!overlap(s.x, s.x + PW, s.y, s.y + PH, [r.x, r.x + RAT_W, 0, RAT_H])) continue;
    if (s.vy < 0 && s.y > RAT_H - 0.45) { // stomped (hold jump to bounce high)
      s.rats[i] = false; s.stomps++; s.vy = s.held ? STOMP_HOLD_V : STOMP_V; s.rising = s.held; s.ground = false; s.events.push('stomp');
    } else if (s.suit) { s.suit = false; s.hurtT = HURT; s.wagT = 0; s.events.push('shrink'); } // the suit takes the hit
    else { s.dead = s.t; s.events.push('die'); return s; }
  }
  if (s.y < -2.5) { s.dead = s.t; s.events.push('die'); return s; } // into the sludge
  // the end pipe: standing on top of it → in you go
  if (s.ground && s.y >= EXIT.h - 1e-3 && s.x + PW > EXIT.x + 0.2 && s.x < EXIT.x + EXIT.w - 0.2) { s.done = s.t; s.vx = 0; s.events.push('exit'); }
  return s;
}

/** Points for a finished level: coins, stomps, and a bonus for getting out. */
export const sewerPoints = (s) => s.got * 10 + s.stomps * 100 + s.bricks * BRICK_PTS + (s.done !== null ? 500 : 0);

/** Inputs are chosen every BLOCK steps: [stick, jump held]. */
export const BLOCK = 5;
const MOVES = [[1, 1], [1, 0], [0.6, 1], [0.6, 0], [0, 0], [-0.6, 0]];
const clone = (s) => ({ ...s, coins: s.coins.slice(), rats: s.rats.slice(), events: [] }); // (broken / rowsOpened / feathers are copy-on-write)

/** Plays a plan (one [stick, jump] per BLOCK steps; then hands off) to the end. */
export function replay(plan, maxSteps = 60 * 90) {
  const s = createSewer();
  while (s.dead === null && s.done === null && s.steps < maxSteps) {
    const m = plan[Math.floor(s.steps / BLOCK)] || [0, 0];
    stepSewer(s, m[0], m[1]);
  }
  return { done: s.done !== null, dead: s.dead !== null, x: +s.x.toFixed(2), steps: s.steps, coins: s.got, stomps: s.stomps };
}

/**
 * Searches stick and button inputs (one of MOVES every BLOCK steps) for a
 * way to the end pipe. Returns the plan, or null if the level can't be done.
 * States are grouped by position, speed, whether jump is held and which rats
 * are left; the one furthest ahead stands for its group, and only the
 * furthest few hundred are kept. Any plan found is real: it's replayed.
 */
export function routeExists(maxBlocks = 60 * 60 / BLOCK) {
  let frontier = [{ s: createSewer(), plan: [] }];
  for (let n = 0; n < maxBlocks && frontier.length; n++) {
    const next = new Map();
    for (const { s, plan } of frontier) {
      for (const m of MOVES) {
        const c = clone(s);
        for (let k = 0; k < BLOCK && c.dead === null && c.done === null; k++) stepSewer(c, m[0], m[1]);
        if (c.dead !== null) continue;
        const p = plan.concat([m]);
        if (c.done !== null) return replay(p).done ? p : null;
        const key = Math.round(c.x * 2) + ':' + Math.round(c.y * 3) + ':' + Math.round(c.vx) + ':' + Math.round(c.vy / 2) + ':' + (c.rising ? 1 : 0) + c.rats.join('');
        const had = next.get(key);
        if (!had || c.x > had.s.x) next.set(key, { s: c, plan: p });
      }
    }
    frontier = [...next.values()].sort((a, b) => b.s.x - a.s.x).slice(0, 200);
  }
  return null;
}
