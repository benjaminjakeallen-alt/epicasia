// Chain Gang Dynasty — the simulation (no DOM, no three.js), so the host
// phone, headless tests and the level-checking bots all run the same code.
//
// Up to four travellers chained in a line (0–1–2–3) cross the Great Wall,
// side-on. Units are metres, y up, x along the wall; a player's x is the
// centre of their feet. Only the host runs this; the others draw its
// snapshots. Everything a level holds is data (levels.js): solid stone,
// crumbling stones, moving platforms (swinging lanterns, a parade dragon,
// carts), spinning prayer-wheel platforms, firework launch pads, rolling
// firecracker barrels, wind gusts, a zip line, checkpoints and the finish.
//
// The chain is a distance limit between neighbours, solved like a rope:
// pulled taut it drags the lighter end — someone in the air weighs more
// than someone on their feet, and someone holding GRAB on the ground is an
// anchor nobody can move. Fall below the wall for over a second and the
// whole gang goes back to the last checkpoint.

import { LEVELS } from './levels.js';

export const STEP = 1 / 60;
export const PW = 0.56, PH = 1.6, CHAIN = 5;
const GRAV = 26, MAX_FALL = 22, RUN = 5.4, ACC = 34, AIR_ACC = 16, FRICTION = 32, JUMP = 9.8;
const COYOTE = 0.1, BUFFER = 0.13, SCRAMBLE = 16.5, SCRAMBLE_EVERY = 0.75, FALL_TIME = 1.1;
const CRUMBLE_HEAVY = 0.3, CRUMBLE_STAND = 2.5, CRUMBLE_BACK = 3;
const ZIP_SPEED = 10, BARREL_R = 0.42, KNOCK = 0.45;

// ---- the level's moving parts at time t ------------------------------------------------------
function moverPos(m, t) {
  const p = m.path, w = (2 * Math.PI) / p.period;
  if (p.type === 'swing') { // a lantern on a rope from (px, py)
    const a = p.amp * Math.sin(w * t + (p.phase || 0));
    return { x: p.px + p.len * Math.sin(a), y: p.py - p.len * Math.cos(a) };
  }
  if (p.type === 'line') { // back and forth, easing at the ends
    const k = 0.5 - 0.5 * Math.cos(w * t + (p.phase || 0));
    return { x: p.ax + (p.bx - p.ax) * k, y: p.ay + (p.by - p.ay) * k };
  }
  // 'sine': the parade dragon's segments ride a travelling wave
  return { x: p.x0 + (p.ax || 0) * Math.sin(w * t + (p.phase || 0)), y: p.y0 + (p.ay || 0) * Math.sin(w * t + (p.phase || 0) + (p.lag || 0)) };
}
export function moverBox(m, t) {
  const a = moverPos(m, t), b = moverPos(m, t + 0.02);
  return { x0: a.x - m.w / 2, x1: a.x + m.w / 2, y0: a.y - m.h, y1: a.y, vx: (b.x - a.x) / 0.02, vy: (b.y - a.y) / 0.02 };
}
export function spinnerBoxes(s, t) {
  const out = [];
  for (let k = 0; k < s.n; k++) {
    const a = (2 * Math.PI * t) / s.period + (2 * Math.PI * k) / s.n, a2 = a + (2 * Math.PI * 0.02) / s.period;
    const x = s.cx + s.r * Math.cos(a), y = s.cy + s.r * Math.sin(a);
    const x2 = s.cx + s.r * Math.cos(a2), y2 = s.cy + s.r * Math.sin(a2);
    out.push({ x0: x - s.w / 2, x1: x + s.w / 2, y0: y - 0.35, y1: y, vx: (x2 - x) / 0.02, vy: (y2 - y) / 0.02, oneWay: true, mover: true, a });
  }
  return out;
}
export const windOn = (z, t) => ((t + (z.phase || 0)) % (z.on + z.off)) < z.on;

/** Every box something can stand on or bump into at time t. */
function solidsAt(sim, t) {
  const L = sim.level, out = [];
  for (const s of L.solids) out.push(s);
  L.crumbles.forEach((c, i) => { if (!sim.crumble[i].gone) out.push({ ...c, oneWay: true, crumble: i }); });
  L.movers.forEach((m, k) => out.push({ ...moverBox(m, t), oneWay: m.oneWay !== false, mover: true, id: 'm' + k }));
  L.spinners.forEach((s, k) => spinnerBoxes(s, t).forEach((b, j) => out.push({ ...b, id: 's' + k + '.' + j })));
  for (const b of L.bouncers) out.push({ x0: b.x0, x1: b.x1, y0: b.y - 0.5, y1: b.y, bounce: b.power || 17 });
  return out;
}
const overlaps = (x0, x1, y0, y1, b) => x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0;

// ---- the gang ---------------------------------------------------------------------------------
export function createSim(levelIndex, players) {
  const level = LEVELS[levelIndex];
  const sim = {
    levelIndex, level, t: 0, cp: 0, falls: 0, done: null, events: [],
    players: players.map((pl, i) => ({ hero: pl.hero, bot: !!pl.bot, i, x: 0, y: 0, vx: 0, vy: 0, ground: null, face: 1,
      jb: 0, coy: 0, held: false, grab: false, scrT: 0, knockT: 0, fallT: 0, zip: null, taut: false })),
    crumble: level.crumbles.map(() => ({ stood: 0, heavy: 0, n: 0, goneAt: 0, gone: false })),
    barrels: [], nextBarrel: level.rollers.map((r) => r.first || 0),
  };
  respawn(sim);
  return sim;
}

/** Back to the current checkpoint, lined up, the chain slack. */
function respawn(sim) {
  const x = sim.cp === 0 ? sim.level.start : sim.level.checks[sim.cp - 1], n = sim.players.length;
  sim.players.forEach((p, i) => {
    Object.assign(p, { x: x + (n - 1 - i) * 1.3, y: groundBelow(sim, x + (n - 1 - i) * 1.3, 30), vx: 0, vy: 0, ground: null, zip: null, fallT: 0, knockT: 0, grab: false });
  });
  sim.crumble.forEach((c) => { c.stood = 0; c.heavy = 0; c.n = 0; c.gone = false; });
  sim.barrels = [];
}
function groundBelow(sim, x, from) {
  let best = -Infinity;
  for (const s of solidsAt(sim, sim.t)) if (x >= s.x0 && x <= s.x1 && s.y1 <= from && s.y1 > best) best = s.y1;
  return best === -Infinity ? 0 : best;
}

/**
 * One fixed step. inputs[i] = { x: -1…1, jump: held, grab: held, tap } (bots are
 * driven by botInput). Returns the sim; sim.events lists what happened:
 * {e, i (who), k (which)}: jump, land, boing, crumble, whoops, checkpoint, zip, knock, scramble, done.
 */
export function stepSim(sim, inputs) {
  const dt = STEP, L = sim.level;
  sim.events = [];
  if (sim.done !== null) { sim.t += dt; return sim; }
  sim.t += dt;
  const t = sim.t, solids = solidsAt(sim, t);

  // crumbling stones hold one traveller: two at once (or one lingering) and
  // they give way; they come back a few seconds later
  sim.crumble.forEach((c, i) => {
    if (c.gone) { if (t - c.goneAt > CRUMBLE_BACK) { c.gone = false; c.stood = c.heavy = 0; } return; }
    c.n = sim.players.filter((p) => p.ground && p.ground.crumble === i).length;
    c.heavy = c.n >= 2 ? c.heavy + dt : 0;
    c.stood = c.n ? c.stood + dt : Math.max(0, c.stood - dt);
    if (c.heavy > CRUMBLE_HEAVY || c.stood > CRUMBLE_STAND) { c.gone = true; c.goneAt = t; sim.events.push({ e: 'crumble', k: i }); }
  });

  sim.players.forEach((p, i) => {
    const inp = inputs[i] || { x: 0, jump: false, grab: false };
    const pressed = (inp.jump && !p.held) || !!inp.tap; // (tap: a press that came and went between steps)
    p.held = !!inp.jump;
    p.jb = pressed ? BUFFER : Math.max(0, p.jb - dt);
    p.coy = p.ground ? COYOTE : Math.max(0, p.coy - dt);
    if (p.scrT > 0) p.scrT -= dt;
    if (p.knockT > 0) p.knockT -= dt;
    const ground = p.ground;

    // GRAB: on the ground (or against a wall) you dig in and become the gang's anchor
    const wallSide = touchingWall(p, solids);
    p.grab = !!inp.grab && (ground || wallSide) && !p.zip;
    // …or hang on to the zip line
    if (inp.grab && !p.zip && !ground) for (const z of L.zips) { const s = onZip(p, z); if (s !== null) { p.zip = { z, s, v: Math.max(3, Math.abs(p.vx)) }; sim.events.push({ e: 'zip', i }); } }
    if (p.zip && !inp.grab) { p.zip = null; } // let go
    if (p.zip) { rideZip(sim, p, dt); return; }
    if (p.grab) { p.vx = 0; p.vy = ground ? 0 : Math.max(p.vy, -1); if (ground) carry(p, ground, dt); return; }

    // run
    const dir = p.knockT > 0 ? 0 : Math.sign(inp.x) * (Math.abs(inp.x) > 0.25 ? 1 : 0);
    const want = dir * RUN * Math.min(1, Math.abs(inp.x) * 1.4);
    if (p.knockT <= 0) {
      if (ground) p.vx = dir ? approach(p.vx, want, ACC * dt) : approach(p.vx, 0, FRICTION * dt);
      else if (dir) p.vx = approach(p.vx, want, AIR_ACC * dt);
    }
    if (dir) p.face = dir;
    // wind gusts push you along
    for (const z of L.winds) if (p.x > z.x0 && p.x < z.x1 && windOn(z, t)) p.vx += z.force * dt;

    // jump; or, dangling on a taut chain, scramble up it
    if (p.jb > 0 && (ground || p.coy > 0)) {
      // leaving something that moves, you keep its motion
      if (ground && ground.mover) { p.vx += ground.vx || 0; }
      p.vy = JUMP + (ground && ground.mover ? Math.max(0, ground.vy || 0) : 0); p.ground = null; p.coy = 0; p.jb = 0; sim.events.push({ e: 'jump', i });
    } else if (pressed && !ground && p.taut && p.scrT <= 0) {
      // climb the chain toward whoever is holding you up
      const up = [sim.players[i - 1], sim.players[i + 1]].filter((q) => q && q.y > p.y + 0.3).sort((a, b) => b.y - a.y)[0];
      if (up) {
        const dx = up.x - p.x, dy = up.y + 0.4 - p.y;
        p.vy = Math.min(SCRAMBLE, Math.sqrt(2 * GRAV * Math.max(1, dy + 0.3))); p.vx = Math.max(-5, Math.min(5, dx * 1.6));
      } else p.vy = SCRAMBLE;
      p.scrT = SCRAMBLE_EVERY; sim.events.push({ e: 'scramble', i });
    }
    p.vy = Math.max(-MAX_FALL, p.vy - GRAV * dt);
    if (ground && p.vy <= 0) carry(p, ground, dt);
    move(sim, p, solids, dt);
  });

  chain(sim, solids);

  // barrels: spawned up the wall, rolling down it; they knock you back
  L.rollers.forEach((r, k) => {
    if (t >= sim.nextBarrel[k]) { sim.nextBarrel[k] = t + r.every; sim.barrels.push({ x: r.x, y: r.y, vx: r.dir * r.speed, vy: 0, spin: 0 }); }
  });
  sim.barrels = sim.barrels.filter((b) => {
    b.vy = Math.max(-MAX_FALL, b.vy - GRAV * dt);
    b.y += b.vy * dt; b.x += b.vx * dt; b.spin += (b.vx * dt) / BARREL_R;
    for (const s of solids) if (!s.oneWay && b.x > s.x0 && b.x < s.x1 && b.y - BARREL_R < s.y1 && b.y > s.y1 - 0.6 && b.vy <= 0) { b.y = s.y1 + BARREL_R; b.vy = 0; }
    for (const p of sim.players) {
      if (p.knockT > 0 || Math.abs(p.x - b.x) > PW / 2 + BARREL_R || b.y < p.y - 0.2 || b.y > p.y + PH * 0.7) continue;
      p.vx = Math.sign(b.vx) * 7.5; p.vy = 5.5; p.ground = null; p.knockT = KNOCK; sim.events.push({ e: 'knock', i: p.i });
    }
    return b.y > L.fallY - 4 && b.x > L.start - 20 && b.x < L.finish + 20;
  });

  // falling off the wall: a moment below it and everyone goes back to the checkpoint
  let lost = false;
  for (const p of sim.players) { if (p.y < L.fallY) { p.fallT += dt; if (p.fallT > FALL_TIME) lost = true; } else p.fallT = 0; }
  if (lost) { sim.falls++; sim.events.push({ e: 'whoops', i: sim.players.findIndex((p) => p.fallT > FALL_TIME) }); respawn(sim); return sim; }

  // checkpoints: once the whole gang is past a watchtower
  const minX = Math.min(...sim.players.map((p) => p.x));
  while (sim.cp < L.checks.length && minX > L.checks[sim.cp]) { sim.cp++; sim.events.push({ e: 'checkpoint', k: sim.cp }); }
  const mid = sim.players.reduce((a, p) => a + p.x, 0) / sim.players.length;
  if (mid > L.finish && sim.players.every((p) => p.y > L.fallY + 2)) { sim.done = t; sim.events.push({ e: 'done' }); }
  return sim;
}

const approach = (v, to, by) => (v < to ? Math.min(to, v + by) : Math.max(to, v - by));
function carry(p, g, dt) { if (g.vx || g.vy) { p.x += (g.vx || 0) * dt; p.y += (g.vy || 0) * dt; } }
function touchingWall(p, solids) {
  for (const s of solids) if (!s.oneWay && overlaps(p.x - PW / 2 - 0.08, p.x + PW / 2 + 0.08, p.y + 0.1, p.y + PH - 0.1, s)) return true;
  return false;
}

/** Moves a player through the level's boxes: x then y, landing on tops (one-way boxes only from above). */
function move(sim, p, solids, dt) {
  const ox = p.x, oy = p.y;
  p.x += p.vx * dt;
  for (const s of solids) {
    if (s.oneWay || !overlaps(p.x - PW / 2, p.x + PW / 2, p.y + 0.02, p.y + PH, s)) continue;
    if (ox <= s.x0 + 0.01) { p.x = s.x0 - PW / 2; if (p.vx > 0) p.vx = 0; }
    else if (ox >= s.x1 - 0.01) { p.x = s.x1 + PW / 2; if (p.vx < 0) p.vx = 0; }
  }
  p.y += p.vy * dt;
  const was = p.ground;
  p.ground = null;
  for (const s of solids) {
    if (!overlaps(p.x - PW / 2, p.x + PW / 2, Math.min(p.y, oy), Math.max(p.y, oy) + (s.oneWay ? 0.001 : PH), s)) continue;
    if (p.vy <= 0 && oy >= s.y1 - 0.05 - Math.abs(s.vy || 0) * dt && p.y <= s.y1) {
      p.y = s.y1; p.ground = s;
      if (s.bounce) { p.vy = s.bounce; p.ground = null; sim.events.push({ e: 'boing', i: p.i }); }
      else p.vy = 0;
    } else if (!s.oneWay && p.vy > 0 && oy + PH <= s.y0 + 0.05) { p.y = s.y0 - PH; p.vy = 0; }
  }
  if (p.ground && !was) sim.events.push({ e: 'land', i: p.i });
}

/** The chain: neighbours never further apart than CHAIN; the lighter end gives. */
function chain(sim, solids) {
  const ps = sim.players;
  ps.forEach((p) => { p.taut = false; });
  const inv = (p) => (p.grab ? 0 : p.zip ? 0.15 : p.ground ? 0.35 : 1);
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i + 1 < ps.length; i++) {
      const a = ps[i], b = ps[i + 1];
      const dx = b.x - a.x, dy = b.y + 1.0 - (a.y + 1.0), d = Math.hypot(dx, dy);
      if (d <= CHAIN) continue;
      const wa = inv(a), wb = inv(b), w = wa + wb;
      a.taut = b.taut = true;
      if (!w) continue;
      const nx = dx / d, ny = dy / d, over = d - CHAIN;
      a.x += nx * over * (wa / w); a.y += ny * over * (wa / w);
      b.x -= nx * over * (wb / w); b.y -= ny * over * (wb / w);
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; // separating speed
      if (rv > 0) {
        a.vx += nx * rv * (wa / w); a.vy += ny * rv * (wa / w);
        b.vx -= nx * rv * (wb / w); b.vy -= ny * rv * (wb / w);
      }
    }
  }
  // the pull mustn't drag anyone into stone: push back out the shortest way
  for (const p of ps) for (const s of solids) {
    if (s.oneWay || !overlaps(p.x - PW / 2, p.x + PW / 2, p.y, p.y + PH, s)) continue;
    const pens = [[s.x1 - (p.x - PW / 2), 'r'], [p.x + PW / 2 - s.x0, 'l'], [s.y1 - p.y, 'u'], [p.y + PH - s.y0, 'd']].sort((u, v) => u[0] - v[0]);
    const [amt, side] = pens[0];
    if (side === 'r' || side === 'l') {
      p.x += side === 'r' ? amt : -amt;
      // hauled against a wall face by a taut chain: the pull drags you up it
      if (p.taut && !p.ground && p.y < s.y1 && s.y1 - p.y < 2.6) { p.y = Math.min(s.y1 + 0.02, p.y + amt * 1.6); p.vy = Math.max(p.vy, 0); }
    }
    else if (side === 'u') { p.y += amt; if (p.vy < 0) p.vy = 0; p.ground = s; } else { p.y -= amt; if (p.vy > 0) p.vy = 0; }
  }
}

// ---- the zip line -----------------------------------------------------------------------------
function onZip(p, z) {
  const hx = p.x, hy = p.y + PH + 0.2; // hands up
  const ex = z.bx - z.ax, ey = z.by - z.ay, len2 = ex * ex + ey * ey;
  const s = ((hx - z.ax) * ex + (hy - z.ay) * ey) / len2;
  if (s < 0 || s > 0.97) return null;
  const cx = z.ax + ex * s, cy = z.ay + ey * s;
  return Math.hypot(hx - cx, hy - cy) < 0.9 ? s : null;
}
function rideZip(sim, p, dt) {
  const z = p.zip.z, len = Math.hypot(z.bx - z.ax, z.by - z.ay);
  p.zip.v = Math.min(ZIP_SPEED, p.zip.v + 9 * dt);
  p.zip.s += (p.zip.v * dt) / len;
  const s = Math.min(1, p.zip.s);
  p.x = z.ax + (z.bx - z.ax) * s; p.y = z.ay + (z.by - z.ay) * s - PH - 0.2;
  p.vx = ((z.bx - z.ax) / len) * p.zip.v; p.vy = ((z.by - z.ay) / len) * p.zip.v;
  p.ground = null;
  if (s >= 1) { p.zip = null; } // off the end, flying on
}

// ---- bots ------------------------------------------------------------------------------------
// Empty places in a gang are filled by bots, and the level checks drive a
// whole gang of them: each follows the one ahead of it on the chain (the
// front one heads for the finish), jumps walls, gaps it can clear (checked
// by flying the jump through the level as it will be), barrels and taller
// teammates, scrambles up the chain when dangling, holds on (GRAB) when a
// teammate is hanging off an edge, and rides zip lines.
export function botInput(sim, i, lead = i === 0) {
  const p = sim.players[i], L = sim.level, t = sim.t;
  const out = { x: 0, jump: false, grab: false };
  if (p.zip) { out.grab = true; return out; }
  // in the air by a zip line: catch it
  if (!p.ground) for (const z of L.zips) if (onZip(p, z) !== null) { out.grab = true; return out; }
  const ahead = lead ? null : sim.players[i - 1];
  const behind = sim.players[i + 1];
  const solids = solidsAt(sim, t);
  const footing = (x) => solids.some((s) => x > s.x0 && x < s.x1 && s.y1 <= p.y + 0.05 && s.y1 > p.y - 0.6 && s.crumble === undefined);
  // a gust blowing: dig in until it passes
  if (p.ground && L.winds.some((z) => p.x > z.x0 - 1 && p.x < z.x1 && windOn(z, t + 0.15))) { out.grab = true; return out; }
  // someone hanging off an edge: haul them up by walking away from them
  const hanging = sim.players.find((q) => q !== p && !q.ground && !q.zip && q.y < p.y - 1 && q.fallT === 0 && Math.abs(q.vy) < 6 && q.taut);
  if (hanging && p.ground) {
    const away = Math.sign(p.x - hanging.x) || 1;
    if (footing(p.x + away * 0.8)) out.x = away; else out.grab = true;
    return out;
  }
  // dangling on the chain: scramble up it
  const above = [ahead, behind].find((q) => q && q.y > p.y + 0.8);
  if (!p.ground && p.taut && above) { out.jump = !p.held; p.botAir = Math.sign(above.x - p.x) * 0.6; out.x = p.botAir; return out; }
  const goal = lead ? L.finish + 4 : ahead.x - 1.3;
  if (!p.ground) { out.x = p.botAir ?? (Math.abs(goal - p.x) > 0.4 ? Math.sign(goal - p.x) : 0); return out; }
  p.botAir = undefined;
  const dx = goal - p.x, dir = Math.abs(dx) > 0.4 ? Math.sign(dx) : 0;
  // the front one waits while anyone behind is far back or below
  if (lead && sim.players.some((q, k) => k > 0 && (Math.abs(q.x - p.x) > CHAIN * (k + 0.2) || (!q.ground && q.y < p.y - 0.8)))) return out;
  out.x = dir;
  if (!dir) return out;
  // a zip line's start overhead: jump for it
  for (const z of L.zips) if (Math.abs(p.x - z.ax) < 1.2 && z.ay > p.y + PH && z.ay < p.y + PH + 2.5) { out.jump = !p.held; p.botAir = dir; return out; }
  // a barrel rolling at us
  if (sim.barrels.some((b) => Math.abs(b.y - (p.y + BARREL_R)) < 1 && (b.x - p.x) * dir > 0 && Math.abs(b.x - p.x) < 2.4 && Math.sign(b.vx) === -dir)) { out.jump = !p.held; p.botAir = dir; return out; }
  // in a gusty stretch: only jump with a calm second ahead
  const gusty = L.winds.some((z) => p.x > z.x0 - 2 && p.x < z.x1 + 4 && [0.3, 0.6, 0.9].some((d) => windOn(z, t + d)));
  // a wall: jump
  const wall = solids.some((s) => !s.oneWay && overlaps(p.x + dir * 0.3 - 0.01, p.x + dir * 0.9, p.y + 0.3, p.y + PH, s) && s.y1 - p.y < 2.4);
  if (wall) { if (gusty) { out.grab = true; out.x = 0; return out; } out.jump = !p.held; p.botAir = dir; return out; }
  // riding something that moves: stay near its middle until a jump lands safely
  if (p.ground.mover) {
    const calm = sim.botJumpT !== t && sim.players.every((q) => q === p || q.ground || q.zip);
    const air = calm ? landing(sim, p, dir) : null;
    if (air !== null) { out.jump = !p.held; p.botAir = air; sim.botJumpT = t; return out; }
    const wait = dir > 0 ? p.ground.x1 - 0.6 : p.ground.x0 + 0.6; // by the leading edge
    out.x = Math.abs(wait - p.x) > 0.2 ? Math.sign(wait - p.x) * 0.5 : 0;
    return out;
  }
  // a gap (or crumbling stone) ahead: jump when the landing is safe, nearest first
  const onCrumble = p.ground.crumble !== undefined;
  if (!footing(p.x + dir * 0.7) || onCrumble) {
    if (!onCrumble && footing(p.x + dir * 0.35)) return out; // get right to the edge first
    if (gusty || sim.botJumpT === t || sim.players.some((q) => q !== p && !q.ground && !q.zip)) { out.x = 0; return out; } // one at a time
    const hurry = onCrumble && sim.crumble[p.ground.crumble].stood > 1.6;
    const air = landing(sim, p, dir, hurry ? 1.2 : 0);
    if (air === null) { out.x = 0; return out; }
    out.jump = !p.held; p.botAir = air; sim.botJumpT = t;
  }
  return out;
}
/** Flies a jump through the level as it will be, at a few air speeds; the
 *  stick value that lands nearest on safe footing, or null. */
function landing(sim, p, dir, slack = 0) {
  let best = null, bestScore = Infinity;
  for (const k of [0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1]) {
    const g = p.ground && p.ground.mover ? p.ground : null;
    let x = p.x, y = p.y, vx = p.vx + (g ? g.vx || 0 : 0), vy = JUMP + (g ? Math.max(0, g.vy || 0) : 0);
    const want = dir * RUN * Math.min(1, k * 1.4);
    for (let f = 1; f <= 100; f++) {
      const dt = STEP, t = sim.t + f * dt;
      vx = approach(vx, want, AIR_ACC * dt);
      vy -= GRAV * dt; x += vx * dt; y += vy * dt;
      if (vy > 0) continue;
      let hit = null;
      for (const s of solidsAt(sim, t)) if (x > s.x0 && x < s.x1 && y <= s.y1 && y > s.y1 - 0.5) { hit = s; break; }
      if (hit) {
        const margin = Math.min(x - hit.x0, hit.x1 - x);
        const busy = hit.crumble !== undefined && (sim.crumble[hit.crumble].n > 0 || sim.crumble[hit.crumble].stood > 1.3);
        const near = [sim.players[p.i - 1], sim.players[p.i + 1]].every((q) => !q || Math.hypot(q.x - x, q.y - hit.y1) < CHAIN - 0.15 + slack);
        const ok = margin > 0.3 && !busy && near && hit.y1 > sim.level.fallY + 3 && (x - p.x) * dir > 0.7 && !(hit.id && p.ground && p.ground.id === hit.id);
        // the nearest footing first, and well onto it
        const score = Math.abs(x - p.x) - Math.min(margin, 1.2) * 1.5;
        if (ok && score < bestScore) { bestScore = score; best = dir * k; }
        break;
      }
      if (y < sim.level.fallY) break;
    }
  }
  return best;
}

/** Headless: a whole gang of bots plays a level. Returns how it went. */
export function simulateLevel(levelIndex, n = 4, maxSeconds = 300, startAt = 0) {
  const sim = createSim(levelIndex, Array.from({ length: n }, () => ({ hero: 'chris', bot: true })));
  sim.t = startAt; // a different moment for everything that moves
  sim.nextBarrel = sim.nextBarrel.map((v) => v + startAt);
  const steps = maxSeconds * 60;
  for (let k = 0; k < steps && sim.done === null; k++) stepSim(sim, sim.players.map((_, i) => botInput(sim, i)));
  return { done: sim.done !== null, time: +(sim.done ?? sim.t).toFixed(1), falls: sim.falls, cp: sim.cp, x: +Math.max(...sim.players.map((p) => p.x)).toFixed(1) };
}
