// The sewer under the line (Shinkansen Dash's secret, user Oct 12 2026: an
// open manhole in a gap between trains drops you into "a Mario brothers side
// scroller 2d board where you play an underground level where you end at a
// pipe you jump in"). Reach the pipe without dying → Jake is unlocked and you
// pop back up onto the trains, covered in sludge.
//
// You run on your own (like the dash); swipe up / tap / ↑ / Space jumps.
// Units are tiles, y up, the floor at y 0. Pits drop into sludge; pipes and
// brick ledges are solid; rats patrol (land on them to stomp them, touch them
// otherwise and you're done); coins are +10. Land on top of the big pipe at
// the end to go in. Everything steps at a fixed 1/60 s so a run replays
// exactly — routeExists() searches every jump timing to prove the level can
// be finished.

export const STEP = 1 / 60;
const RUN = 6.2, JUMP_V = 14, G = 40, COYOTE = 0.08, BUFFER = 0.12;
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
export const LEVEL = { FLOORS, PIPES, LEDGES, EXIT, RATS, COINS, LENGTH: EXIT.x + EXIT.w + 4, CEILING: 6.5 };

// Every solid box: [x0, x1, y0, y1].
const SOLIDS = [
  ...FLOORS.map(([a, b]) => [a, b, -20, 0]),
  ...PIPES.map(([x, w, h]) => [x, x + w, 0, h]),
  ...LEDGES.map(([x, w, b, t]) => [x, x + w, b, t]),
  [EXIT.x, EXIT.x + EXIT.w, 0, EXIT.h],
];
export const solids = () => SOLIDS;

/** Where rat i is at time t (its left edge) and which way it faces. */
export function ratAt(i, t) {
  const [a, b, v] = RATS[i], span = b - a, k = (t * v) % (2 * span);
  return k < span ? { x: a + k, dir: 1 } : { x: b - (k - span), dir: -1 };
}
export const RAT_W = 0.95, RAT_H = 0.7;

export function createSewer() {
  return {
    t: 0, x: 0, y: 0, vy: 0, ground: true, coyote: 0, buffer: 0, steps: 0,
    coins: COINS.map(() => false), rats: RATS.map(() => true), stomps: 0, got: 0,
    dead: null, done: null, enterT: 0, events: [],
  };
}
const overlap = (ax0, ax1, ay0, ay1, b) => ax0 < b[1] && ax1 > b[0] && ay0 < b[3] && ay1 > b[2];

/**
 * One fixed step. `jump` = a jump was pressed this step. Returns the new
 * state's events: 'jump', 'land', 'coin', 'stomp', 'die', 'exit'.
 */
export function stepSewer(s, jump) {
  s.events = [];
  if (s.dead !== null || s.done !== null) { s.t += STEP; return s; }
  s.t += STEP; s.steps++;
  if (jump) s.buffer = BUFFER; else s.buffer = Math.max(0, s.buffer - STEP);
  s.coyote = s.ground ? COYOTE : Math.max(0, s.coyote - STEP);
  if (s.buffer > 0 && (s.ground || s.coyote > 0)) {
    s.vy = JUMP_V; s.ground = false; s.coyote = 0; s.buffer = 0; s.events.push('jump');
  }
  // vertical
  s.vy -= G * STEP;
  const y0 = s.y; let y = s.y + s.vy * STEP, landed = false;
  for (const b of SOLIDS) {
    if (!overlap(s.x, s.x + PW, Math.min(y, y0), Math.max(y, y0) + PH, b)) continue;
    if (s.vy <= 0 && y0 >= b[3] - 1e-6 && y < b[3]) { y = b[3]; s.vy = 0; landed = true; } // landed on top
    else if (s.vy > 0 && y0 + PH <= b[2] + 1e-6 && y + PH > b[2]) { y = b[2] - PH; s.vy = 0; } // bumped a head
  }
  if (landed && !s.ground) s.events.push('land');
  s.y = y; s.ground = landed;
  // horizontal (you run on your own; a wall just holds you until you jump)
  let x = s.x + RUN * STEP;
  for (const b of SOLIDS) if (overlap(x, x + PW, s.y + 1e-4, s.y + PH, b) && s.x + PW <= b[0] + 1e-6) x = Math.min(x, b[0] - PW);
  s.x = x;
  // coins
  COINS.forEach(([cx, cy], i) => {
    if (!s.coins[i] && Math.abs(cx - (s.x + PW / 2)) < 0.7 && cy > s.y - 0.4 && cy < s.y + PH + 0.3) { s.coins[i] = true; s.got++; s.events.push('coin'); }
  });
  // rats
  for (let i = 0; i < RATS.length; i++) {
    if (!s.rats[i]) continue;
    const r = ratAt(i, s.t);
    if (!overlap(s.x, s.x + PW, s.y, s.y + PH, [r.x, r.x + RAT_W, 0, RAT_H])) continue;
    if (s.vy < 0 && s.y > RAT_H - 0.45) { s.rats[i] = false; s.stomps++; s.vy = JUMP_V * 0.6; s.ground = false; s.events.push('stomp'); }
    else { s.dead = s.t; s.events.push('die'); return s; }
  }
  if (s.y < -2.5) { s.dead = s.t; s.events.push('die'); return s; } // into the sludge
  // the end pipe: standing on top of it → in you go
  if (s.ground && s.y >= EXIT.h - 1e-3 && s.x + PW > EXIT.x + 0.2 && s.x < EXIT.x + EXIT.w - 0.2) { s.done = s.t; s.events.push('exit'); }
  return s;
}

/** Points for a finished level: coins, stomps, and a bonus for getting out. */
export const sewerPoints = (s) => s.got * 10 + s.stomps * 100 + (s.done !== null ? 500 : 0);

/**
 * Searches every jump timing (a jump can only start on the ground, so the
 * choice is "jump now or not" on each grounded step) for a way to the end
 * pipe. Returns the steps to jump on, or null if the level can't be done.
 */
export function routeExists(maxSteps = 60 * 60) {
  const clone = (s) => ({ ...s, coins: s.coins.slice(), rats: s.rats.slice(), events: [] });
  let frontier = [{ s: createSewer(), plan: [] }];
  // (plans are short: only the jump steps)
  for (let n = 0; n < maxSteps && frontier.length; n++) {
    const next = new Map();
    for (const { s, plan } of frontier) {
      const opts = s.ground || s.coyote > 0 ? [false, true] : [false];
      for (const j of opts) {
        const c = stepSewer(clone(s), j);
        if (c.dead !== null) continue;
        const p = j ? plan.concat(n) : plan;
        if (c.done !== null) return p;
        // States are grouped by tile, height, speed and which rats are left;
        // the one furthest ahead stands for its group (otherwise every way of
        // waiting at a pipe multiplies the search). Any route found is real:
        // it's replayed step by step.
        const key = Math.round(c.x) + ':' + Math.round(c.y * 10) + ':' + Math.round(c.vy) + ':' + c.rats.join('');
        const had = next.get(key);
        if (!had || c.x > had.s.x) next.set(key, { s: c, plan: p });
      }
    }
    frontier = [...next.values()];
  }
  return null;
}
