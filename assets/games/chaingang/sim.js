// Tug of Wall — the simulation (no DOM, no three.js), so the host
// phone, headless tests and the level-checking bots all run the same code.
//
// Third person, in 3D, like Chained Together: up to four travellers chained
// in a line (0–1–2–3) cross the Great Wall as it winds and climbs over the
// mountains. Metres, y up; a player's (x, y, z) is the middle of their feet.
// Only the host runs this; the other phones draw its snapshots. Everything
// a level holds is data (levels.js): stone (boxes), crumbling stones, moving
// platforms (swinging lanterns, the parade dragon, a prayer-wheel carousel,
// rope carts), firework launch pads, rolling firecracker barrels, gusts, a
// zip line, watchtowers (checkpoints) and the finish. Each level also has a
// `route` for the bots to follow.
//
// Online, each phone moves its own traveller itself (no waiting on the
// network): on the host the other phones' travellers are *puppets* — put
// where their phone last said, never moved by the host's physics, and as
// heavy as an anchor on the chain — and each other phone runs a *local* sim
// in which only its own traveller moves (the others are placed where the
// host's snapshots show them). The host still decides falls, watchtowers,
// crumbling stones, barrels and the finish.
//
// The chain is a distance limit between neighbours, solved like a rope:
// pulled taut it drags the lighter end — someone in the air weighs more than
// someone on their feet, and someone holding GRAB on the ground is an anchor
// nobody can move. JUMP while dangling climbs the chain. Fall below the wall
// for over a second and the whole gang goes back to the last watchtower.

import { LEVELS } from './levels.js';

export const STEP = 1 / 60;
export const R = 0.3, PH = 1.6, CHAIN = 5;
const GRAV = 26, MAX_FALL = 24, RUN = 5.4, ACC = 62, AIR_ACC = 20, FRICTION = 58, JUMP = 9.6, STEP_UP = 0.45;
// Feel (user, Oct 15 2026: "the controls are still too loose" — tuned from platformer practice):
// turning swings your run round at TURN rad/s instead of scrubbing it off, reversing gets a
// SKID boost, a tap of JUMP is a short hop (rising speed cut to JUMP_CUT on release), you fall
// FALL_MULT× harder than you rise with a little hang at the top (APEX), and the rope moves a
// traveller on the ground but doesn't leave them sliding (no velocity from it).
const TURN = 14, SKID = 1.8, JUMP_CUT = 0.5, FALL_MULT = 1.35, APEX_V = 1.2, APEX = 0.6;
/** Gravity for a vertical speed: harder on the way down, a little hang at the top while JUMP is held. */
export function gravity(vy, held) { return held && Math.abs(vy) < APEX_V ? GRAV * APEX : vy < 0 ? GRAV * FALL_MULT : GRAV; }
const COYOTE = 0.1, BUFFER = 0.13, SCRAMBLE = 16.5, SCRAMBLE_EVERY = 0.7, FALL_TIME = 1.1;
const CRUMBLE_HEAVY = 0.3, CRUMBLE_STAND = 2.5, CRUMBLE_BACK = 3;
const ZIP_SPEED = 10, BARREL_R = 0.45, KNOCK = 0.45, REACH = 3.2;
// reeling in (review, Oct 17 2026): dangling below a teammate who's dug in with GRAB on solid
// ground, you're hauled up the rope at REEL m/s, drawn in toward them
const REEL = 3.2, REEL_IN = 6;

// ---- the level's moving parts at time t ------------------------------------------------------
export function moverPos(m, t) {
  const p = m.path, w = (2 * Math.PI) / p.period, ph = w * t + (p.phase || 0);
  if (p.type === 'swing') { // a lantern on a rope from the pivot, swinging along (ux, uz)
    const a = p.amp * Math.sin(ph), s = Math.sin(a) * p.len;
    return { x: p.px + s * p.ux, y: p.py - p.len * Math.cos(a), z: p.pz + s * p.uz };
  }
  if (p.type === 'line') { // back and forth, easing at the ends
    const k = 0.5 - 0.5 * Math.cos(ph);
    return { x: p.ax + (p.bx - p.ax) * k, y: p.ay + (p.by - p.ay) * k, z: p.az + (p.bz - p.az) * k };
  }
  if (p.type === 'circle') return { x: p.cx + p.r * Math.cos(ph), y: p.cy, z: p.cz + p.r * Math.sin(ph) }; // the carousel
  // 'sine': the parade dragon's segments ride a travelling wave
  return { x: p.x0 + (p.ax || 0) * Math.sin(ph), y: p.y0 + (p.ay || 0) * Math.sin(ph + (p.lag || 0)), z: p.z0 + (p.az || 0) * Math.sin(ph) };
}
/** Where a moving thing's box is at time t (a part — a lantern's body, the
 *  dragon's head — rides its path at an offset: ox, oy, oz). */
export function moverBox(m, t) {
  const a = moverPos(m, t), b = moverPos(m, t + 0.02), x = a.x + (m.ox || 0), y = a.y + (m.oy || 0), z = a.z + (m.oz || 0);
  return { x0: x - m.w / 2, x1: x + m.w / 2, z0: z - m.d / 2, z1: z + m.d / 2, y0: y - m.h, y1: y,
    vx: (b.x - a.x) / 0.02, vy: (b.y - a.y) / 0.02, vz: (b.z - a.z) / 0.02 };
}
/** Below this, you've fallen: well under the last watchtower (or the start). */
export function fallLine(sim) {
  const L = sim.level, c = sim.cp === 0 ? L.spawn : L.checks[sim.cp - 1];
  return Math.max(L.fallY, c.y - 12);
}
export const windOn = (w, t) => ((t + (w.phase || 0)) % (w.on + w.off)) < w.on;
const inBox = (b, x, y, z) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1;

/** Every box something can stand on or bump into at time t. */
function solidsAt(sim, t) {
  const L = sim.level, out = [];
  for (const s of L.solids) out.push(s);
  // (everything is solid all round — you can't walk into the side of a lantern or a stone, or jump up through it)
  L.crumbles.forEach((c, i) => { if (!sim.crumble[i].gone) out.push({ ...c, crumble: i, id: 'c' + i }); });
  L.movers.forEach((m, k) => out.push({ ...moverBox(m, t), kind: m.kind, mover: true, id: 'm' + k }));
  for (const b of L.bouncers) out.push({ ...b, bounce: b.power || 17 });
  return out;
}
const hit = (x, y, z, s, h = PH) => x + R > s.x0 && x - R < s.x1 && z + R > s.z0 && z - R < s.z1 && y + h > s.y0 && y < s.y1;

// ---- the gang ---------------------------------------------------------------------------------
export function createSim(levelIndex, players) {
  const level = LEVELS[levelIndex];
  const sim = {
    levelIndex, level, t: 0, cp: 0, falls: 0, fallsBy: players.map(() => 0), done: null, events: [],
    players: players.map((pl, i) => ({ hero: pl.hero, bot: !!pl.bot, i, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ground: null, face: 0,
      jb: 0, coy: 0, held: false, grab: false, scrT: 0, knockT: 0, fallT: 0, zip: null, taut: false, ni: 0, got: -1 })),
    crumble: level.crumbles.map(() => ({ stood: 0, heavy: 0, n: 0, goneAt: 0, gone: false })),
    barrels: [], nextBarrel: level.rollers.map((r) => r.first || 0),
  };
  respawn(sim);
  return sim;
}

/** Back to the current watchtower (or the start), lined up across the way, the chain slack. */
function respawn(sim) {
  const L = sim.level, c = sim.cp === 0 ? L.spawn : L.checks[sim.cp - 1];
  const [dx, dz] = c.dir, face = Math.atan2(dx, dz), n = sim.players.length;
  sim.players.forEach((p, i) => {
    // side by side across the walkway, facing on (so nobody stands in front of anyone's camera)
    const k = (i - (n - 1) / 2) * 0.8, x = c.x - dz * k, z = c.z + dx * k;
    Object.assign(p, { x, z, y: groundBelow(sim, x, z, c.y + 3), vx: 0, vy: 0, vz: 0, ground: null, zip: null, fallT: 0, knockT: 0, grab: false, face, got: sim.cp - 1 });
    p.ni = nearestNode(L, p);
  });
  sim.crumble.forEach((c) => { c.stood = 0; c.heavy = 0; c.n = 0; c.gone = false; });
  sim.barrels = [];
}
function groundBelow(sim, x, z, from) {
  let best = -Infinity;
  for (const s of solidsAt(sim, sim.t)) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && s.y1 <= from && s.y1 > best) best = s.y1;
  return best === -Infinity ? from - 3 : best;
}

/**
 * One fixed step. inputs[i] = { mx, mz (a direction on the ground, length ≤ 1),
 * jump: held, grab: held, tap (a press that came and went between steps) }.
 * sim.events lists what happened, as {e, i (who), k (which)}: jump, land,
 * boing, crumble, whoops, checkpoint, zip, knock, scramble, done.
 */
export function stepSim(sim, inputs) {
  const dt = STEP, L = sim.level;
  sim.events = [];
  sim.t += dt;
  if (sim.done !== null) return sim;
  const t = sim.t, solids = solidsAt(sim, t);

  // crumbling stones hold one traveller: two at once (or one lingering) and
  // they give way; they come back a few seconds later
  const local = sim.local !== undefined; // a phone's own copy: only its own traveller moves (see the top)
  if (!local) sim.crumble.forEach((c, i) => {
    // (back only once nobody's standing where it was — it never comes back around someone)
    if (c.gone) { if (t - c.goneAt > (L.crumbleBack || CRUMBLE_BACK) && !sim.players.some((p) => hit(p.x, p.y, p.z, L.crumbles[i]))) { c.gone = false; c.stood = c.heavy = 0; } return; }
    c.n = sim.players.filter((p) => p.ground && p.ground.crumble === i).length;
    c.heavy = c.n >= 2 ? c.heavy + dt : 0;
    c.stood = c.n ? c.stood + dt : Math.max(0, c.stood - dt);
    if (c.heavy > CRUMBLE_HEAVY || c.stood > (L.crumbleStand || CRUMBLE_STAND)) { c.gone = true; c.goneAt = t; sim.events.push({ e: 'crumble', k: i }); }
  });

  // a gang all in the air can't keep climbing its own chain for ever: two
  // seconds with nobody holding on to anything (feet, GRAB, the zip line) and
  // the climbing stops — everyone drops
  sim.airT = sim.players.some((p) => p.ground || p.grab || p.zip) ? 0 : (sim.airT || 0) + dt;
  const anchored = sim.airT < 2;

  sim.players.forEach((p, i) => {
    if (p.puppet || (local && i !== sim.local)) return; // moved by its own phone / placed from the host's snapshots
    const inp = inputs[i] || {};
    const pressed = (inp.jump && !p.held) || !!inp.tap;
    p.held = !!inp.jump;
    p.jb = pressed ? BUFFER : Math.max(0, p.jb - dt);
    p.coy = p.ground ? COYOTE : Math.max(0, p.coy - dt);
    if (p.scrT > 0) p.scrT -= dt;
    if (p.knockT > 0) p.knockT -= dt;
    const ground = p.ground;

    // GRAB: on the ground (or against a wall) you dig in and become the gang's anchor
    p.grab = !!inp.grab && !!(ground || touchingWall(p, solids)) && !p.zip;
    // …or, in the air, catch the zip line
    if (inp.grab && !p.zip && !ground) for (const z of L.zips) { const s = onZip(p, z); if (s !== null) { p.zip = { z, s, v: Math.max(3, Math.hypot(p.vx, p.vz)) }; sim.events.push({ e: 'zip', i }); } }
    if (p.zip && !inp.grab) p.zip = null; // let go
    if (p.zip) { rideZip(p, dt); return; }
    if (p.grab) { p.vx = p.vz = 0; p.vy = ground ? 0 : Math.max(p.vy, -1); if (ground) carry(p, ground, dt); return; }

    // run, in the direction asked for
    let mx = +inp.mx || 0, mz = +inp.mz || 0;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }
    const on = p.knockT <= 0 && mag > 0.2, sp = RUN * Math.min(1, mag * 1.3);
    const wx = on ? (mx / Math.max(mag, 1e-6)) * sp : 0, wz = on ? (mz / Math.max(mag, 1e-6)) * sp : 0;
    if (p.knockT <= 0) {
      if (ground && on) {
        const v = Math.hypot(p.vx, p.vz);
        if (v > 0.5) {
          const dot = (p.vx * wx + p.vz * wz) / (v * sp);
          if (dot > -0.5) { // steering: swing the run round toward the stick, keeping its speed
            let d = Math.atan2(wx, wz) - Math.atan2(p.vx, p.vz);
            d = Math.atan2(Math.sin(d), Math.cos(d));
            const a = Math.atan2(p.vx, p.vz) + Math.max(-TURN * dt, Math.min(TURN * dt, d));
            p.vx = Math.sin(a) * v; p.vz = Math.cos(a) * v;
          }
          approach2(p, wx, wz, ACC * (dot < -0.5 ? SKID : 1) * dt); // (turning right round: a skid boost)
        } else approach2(p, wx, wz, ACC * dt);
      } else if (ground) approach2(p, 0, 0, FRICTION * dt);
      else if (on) approach2(p, wx, wz, AIR_ACC * dt);
    }
    if (on) p.face = Math.atan2(mx, mz);
    // gusts push you along
    for (const w of L.winds) if (inBox(w, p.x, p.y + 0.5, p.z) && windOn(w, t)) { p.vx += w.fx * dt; p.vz += w.fz * dt; }

    // jump; or, dangling on a taut chain, climb up it
    if (p.jb > 0 && (ground || p.coy > 0)) {
      // a jump carries you the way the stick points, even from a standstill
      if (on) { const along = p.vx * (wx / sp) + p.vz * (wz / sp), want = sp * 0.85; if (along < want) { p.vx += (wx / sp) * (want - along); p.vz += (wz / sp) * (want - along); } }
      if (ground && ground.mover) { p.vx += ground.vx || 0; p.vz += ground.vz || 0; } // leaving something that moves, you keep its motion
      p.vy = JUMP + (ground && ground.mover ? Math.max(0, ground.vy || 0) : 0); p.ground = null; p.coy = 0; p.jb = 0; p.hop = true;
      sim.events.push({ e: 'jump', i });
    } else if (pressed && !ground && p.taut && p.scrT <= 0 && anchored) {
      const up = [sim.players[i - 1], sim.players[i + 1]].filter((q) => q && q.y > p.y + 0.3).sort((a, b) => b.y - a.y)[0];
      if (up) {
        const dy = up.y + 0.4 - p.y;
        p.vy = Math.min(SCRAMBLE, Math.sqrt(2 * GRAV * Math.max(1, dy + 0.3)));
        p.vx = Math.max(-5, Math.min(5, (up.x - p.x) * 1.6)); p.vz = Math.max(-5, Math.min(5, (up.z - p.z) * 1.6));
        p.scrT = SCRAMBLE_EVERY; sim.events.push({ e: 'scramble', i });
      }
    }
    // let go of JUMP on the way up: a shorter hop (bots always jump full height — their jumps are planned)
    if (p.hop && !p.held && !p.bot && p.vy > 0) { p.vy *= JUMP_CUT; p.hop = false; }
    if (p.ground || p.vy <= 0) p.hop = false;
    p.vy = Math.max(-MAX_FALL, p.vy - gravity(p.vy, p.held || p.bot) * dt);
    p.reeled = false;
    if (!ground && anchored && p.knockT <= 0) {
      // (by distance, not the taut flag: that flickers while you bounce on the end of the rope)
      const up = [sim.players[i - 1], sim.players[i + 1]].find((q) => q && q.grab && q.ground && q.y > p.y - 0.5 && Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) > 1.2);
      if (up) {
        const dx = up.x - p.x, dz = up.z - p.z, d = Math.hypot(dx, dz) || 1;
        p.vy = Math.max(p.vy, REEL); p.reeled = true;
        if (d > 0.8 && (p.vx * dx + p.vz * dz) / d < 2.5) { p.vx += (dx / d) * REEL_IN * dt; p.vz += (dz / d) * REEL_IN * dt; }
      }
    }
    if (ground && p.vy <= 0) carry(p, ground, dt);
    move(sim, p, solids, dt);
  });

  // travellers don't stand inside each other: a soft push apart
  for (let a = 0; a < sim.players.length; a++) for (let b = a + 1; b < sim.players.length; b++) {
    const p = sim.players[a], q = sim.players[b];
    if (p.zip || q.zip || Math.abs(p.y - q.y) > 1.3) continue;
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), min = R * 2 - 0.05;
    if (d >= min) continue;
    const nx = d > 1e-4 ? dx / d : Math.cos(a + b), nz = d > 1e-4 ? dz / d : Math.sin(a + b), push = (min - d) * 0.5;
    const wp = p.grab || p.puppet ? 0 : 1, wq = q.grab || q.puppet ? 0 : 1, w = wp + wq || 1;
    p.x -= nx * push * 2 * (wp / w); p.z -= nz * push * 2 * (wp / w);
    q.x += nx * push * 2 * (wq / w); q.z += nz * push * 2 * (wq / w);
  }

  chain(sim, solids);
  if (local) return sim; // the rest is the host's to decide

  // barrels: rolled from a stack, along the wall; they knock you back
  L.rollers.forEach((r, k) => {
    if (t >= sim.nextBarrel[k]) { sim.nextBarrel[k] = t + r.every; sim.barrels.push({ x: r.x, y: r.y, z: r.z, vx: r.dx * r.speed, vz: r.dz * r.speed, vy: 0, spin: 0, dx: r.dx, dz: r.dz }); }
  });
  sim.barrels = sim.barrels.filter((b) => {
    b.vy = Math.max(-MAX_FALL, b.vy - GRAV * dt);
    b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt; b.spin += (Math.hypot(b.vx, b.vz) * dt) / BARREL_R;
    for (const s of solids) {
      if (s.oneWay || b.x < s.x0 || b.x > s.x1 || b.z < s.z0 || b.z > s.z1) continue;
      if (b.y - BARREL_R < s.y1 && b.y > s.y1 - 0.7 && b.vy <= 0) { b.y = s.y1 + BARREL_R; b.vy = 0; }
    }
    for (const p of sim.players) {
      if (p.knockT > 0 || p.zip || Math.hypot(p.x - b.x, p.z - b.z) > R + BARREL_R || b.y < p.y - 0.2 || b.y > p.y + PH * 0.7) continue;
      knock(p, b.dx, b.dz);
      sim.events.push({ e: 'knock', i: p.i, dx: b.dx, dz: b.dz }); // (a puppet's phone knocks itself back when it hears)
    }
    return b.y > L.fallY - 4;
  });

  // falling: a moment well below the last watchtower and everyone goes back to it
  let lost = -1;
  const fall = fallLine(sim);
  sim.players.forEach((p, i) => { if (p.y < fall) { p.fallT += dt; if (p.fallT > FALL_TIME && lost < 0) lost = i; } else p.fallT = 0; });
  if (lost >= 0) { sim.falls++; sim.fallsBy[lost]++; sim.rs = (sim.rs || 0) + 1; sim.events.push({ e: 'whoops', i: lost }); respawn(sim); return sim; }

  // watchtowers, then the finish: one counts once every traveller has been
  // there (or somewhere further on — so a tower someone went round never
  // holds the gang up)
  for (const p of sim.players) for (let k = Math.max(sim.cp, p.got + 1); k <= L.checks.length; k++) {
    const goal = k < L.checks.length ? L.checks[k] : L.finish;
    if (Math.hypot(p.x - goal.x, p.z - goal.z) < REACH && p.y > goal.y - 0.6 && p.y < goal.y + 3) p.got = k;
  }
  const all = Math.min(...sim.players.map((p) => p.got));
  while (sim.cp <= all && sim.cp < L.checks.length) { sim.cp++; sim.events.push({ e: 'checkpoint', k: sim.cp }); }
  if (all >= L.checks.length) { sim.done = t; sim.events.push({ e: 'done' }); }
  return sim;
}

/** Knocked back by a barrel rolling along (dx, dz). */
export function knock(p, dx, dz) {
  p.vx = dx * 7.5; p.vz = dz * 7.5; p.vy = 5.5; p.ground = null; p.knockT = KNOCK; p.grab = false;
}
function approach2(p, tx, tz, by) {
  const dx = tx - p.vx, dz = tz - p.vz, d = Math.hypot(dx, dz);
  if (d <= by) { p.vx = tx; p.vz = tz; } else { p.vx += (dx / d) * by; p.vz += (dz / d) * by; }
}
function carry(p, g, dt) { if (g.vx || g.vy || g.vz) { p.x += (g.vx || 0) * dt; p.y += (g.vy || 0) * dt; p.z += (g.vz || 0) * dt; } }
function touchingWall(p, solids) {
  for (const s of solids) if (!s.oneWay && p.x + R + 0.1 > s.x0 && p.x - R - 0.1 < s.x1 && p.z + R + 0.1 > s.z0 && p.z - R - 0.1 < s.z1 && p.y + PH - 0.1 > s.y0 && p.y + 0.1 < s.y1) return true;
  return false;
}

/** Moves a player through the level's boxes: x, then z, then y; low ledges are stepped up. */
function move(sim, p, solids, dt) {
  const oy = p.y;
  for (const ax of ['x', 'z']) {
    const v = ax === 'x' ? p.vx : p.vz, o = p[ax];
    p[ax] += v * dt;
    for (const s of solids) {
      if (s.oneWay || !hit(p.x, p.y + 0.02, p.z, s, PH - 0.02)) continue;
      const lo = ax === 'x' ? s.x0 : s.z0, hi = ax === 'x' ? s.x1 : s.z1;
      // a low step: walk up onto it
      if (p.ground && s.y1 - p.y <= STEP_UP && s.y1 > p.y && !solids.some((q) => q !== s && !q.oneWay && hit(p.x, s.y1 + 0.01, p.z, q))) { p.y = s.y1; continue; }
      if (o + R <= lo + 0.02) { p[ax] = lo - R; if (v > 0) { if (ax === 'x') p.vx = 0; else p.vz = 0; } }
      else if (o - R >= hi - 0.02) { p[ax] = hi + R; if (v < 0) { if (ax === 'x') p.vx = 0; else p.vz = 0; } }
    }
  }
  p.y += p.vy * dt;
  const was = p.ground;
  p.ground = null;
  for (const s of solids) {
    const lo = Math.min(p.y, oy), hi = Math.max(p.y, oy) + (s.oneWay ? 0.001 : PH);
    if (!(p.x + R > s.x0 && p.x - R < s.x1 && p.z + R > s.z0 && p.z - R < s.z1 && hi > s.y0 && lo < s.y1)) continue;
    if (p.vy <= 0 && oy >= s.y1 - 0.05 - Math.abs(s.vy || 0) * dt && p.y <= s.y1) {
      p.y = s.y1;
      if (s.kind === 'tree') { // nobody stands on a pine's tip: you slide off it
        const ax = p.x - (s.x0 + s.x1) / 2, az = p.z - (s.z0 + s.z1) / 2, d = Math.hypot(ax, az) || 1;
        p.vx = (ax / d) * 3; p.vz = (az / d) * 3; p.vy = 0;
        continue;
      }
      p.ground = s;
      if (s.bounce) { p.vy = s.bounce; p.ground = null; sim.events.push({ e: 'boing', i: p.i }); }
      else p.vy = 0;
    } else if (!s.oneWay && p.vy > 0 && oy + PH <= s.y0 + 0.05) {
      p.y = s.y0 - PH; p.vy = 0;
      // hauled up into the underside of something: slide out toward whoever's pulling
      // (straight under them — a cart, a lantern — slide out to its nearest edge, then round it)
      const up = [sim.players[p.i - 1], sim.players[p.i + 1]].find((q) => q && q.y > p.y + 1);
      if (p.taut && up) {
        let dx = up.x - p.x, dz = up.z - p.z;
        if (Math.hypot(dx, dz) < 1.2 || (up.x > s.x0 && up.x < s.x1 && up.z > s.z0 && up.z < s.z1)) {
          const out = [[s.x0 - p.x, 0], [s.x1 - p.x, 0], [0, s.z0 - p.z], [0, s.z1 - p.z]].sort((u, v) => Math.hypot(...u) - Math.hypot(...v))[0];
          [dx, dz] = out;
        }
        const d = Math.hypot(dx, dz) || 1; p.vx = (dx / d) * 5; p.vz = (dz / d) * 5;
      }
    }
  }
  if (p.ground && !was) sim.events.push({ e: 'land', i: p.i });
}

/** The chain: neighbours never further apart than CHAIN; the lighter end gives. */
function chain(sim, solids) {
  const ps = sim.players;
  ps.forEach((p) => { p.taut = false; });
  const inv = (p) => (p.grab || p.puppet ? 0 : p.zip ? 0.15 : p.ground ? 0.35 : 1);
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i + 1 < ps.length; i++) {
      const a = ps[i], b = ps[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz);
      if (d <= CHAIN) continue;
      const wa = inv(a), wb = inv(b), w = wa + wb;
      a.taut = b.taut = true;
      if (!w) continue;
      const nx = dx / d, ny = dy / d, nz = dz / d, over = d - CHAIN;
      a.x += nx * over * (wa / w); a.y += ny * over * (wa / w); a.z += nz * over * (wa / w);
      b.x -= nx * over * (wb / w); b.y -= ny * over * (wb / w); b.z -= nz * over * (wb / w);
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz; // separating speed
      if (rv > 0) { // (someone on the ground is moved by the rope but not set sliding by it)
        if (!a.ground) { a.vx += nx * rv * (wa / w); a.vy += ny * rv * (wa / w); a.vz += nz * rv * (wa / w); }
        if (!b.ground) { b.vx -= nx * rv * (wb / w); b.vy -= ny * rv * (wb / w); b.vz -= nz * rv * (wb / w); }
      }
    }
  }
  // the pull mustn't drag anyone into stone: push back out the shortest way
  // (again, if that put them into the next piece — the rock under a piece, a battlement)
  for (let pass = 0; pass < 4; pass++) for (const p of ps) for (const s of solids) {
    if (p.puppet || (sim.local !== undefined && p.i !== sim.local) || s.oneWay || !hit(p.x, p.y, p.z, s)) continue;
    const pens = [[s.x1 - (p.x - R), 'x', 1], [p.x + R - s.x0, 'x', -1], [s.z1 - (p.z - R), 'z', 1], [p.z + R - s.z0, 'z', -1], [s.y1 - p.y, 'y', 1], [p.y + PH - s.y0, 'y', -1]]
      .sort((u, v) => u[0] - v[0]);
    const [amt, ax, sg] = pens[0];
    if (ax !== 'y') {
      p[ax] += amt * sg;
      // hauled against a wall face by a taut chain: the pull drags you up it
      if (p.taut && !p.ground && p.y < s.y1 && s.y1 - p.y < 2.6) { p.y = Math.min(s.y1 + 0.02, p.y + amt * 1.6); p.vy = Math.max(p.vy, 0); }
    } else if (sg > 0) { p.y += amt; if (p.vy < 0) p.vy = 0; p.ground = s; } else { p.y -= amt; if (p.vy > 0) p.vy = 0; }
  }
}

// ---- the zip line -----------------------------------------------------------------------------
function onZip(p, z) {
  const h = [p.x, p.y + PH + 0.2, p.z]; // hands up
  const e = [z.b[0] - z.a[0], z.b[1] - z.a[1], z.b[2] - z.a[2]], len2 = e[0] ** 2 + e[1] ** 2 + e[2] ** 2;
  const s = ((h[0] - z.a[0]) * e[0] + (h[1] - z.a[1]) * e[1] + (h[2] - z.a[2]) * e[2]) / len2;
  if (s < 0 || s > 0.97) return null;
  return Math.hypot(h[0] - (z.a[0] + e[0] * s), h[1] - (z.a[1] + e[1] * s), h[2] - (z.a[2] + e[2] * s)) < 0.9 ? s : null;
}
function rideZip(p, dt) {
  const z = p.zip.z, e = [z.b[0] - z.a[0], z.b[1] - z.a[1], z.b[2] - z.a[2]], len = Math.hypot(...e);
  p.zip.v = Math.min(ZIP_SPEED, p.zip.v + 9 * dt);
  p.zip.s += (p.zip.v * dt) / len;
  const s = Math.min(1, p.zip.s);
  p.x = z.a[0] + e[0] * s; p.y = z.a[1] + e[1] * s - PH - 0.2; p.z = z.a[2] + e[2] * s;
  p.vx = (e[0] / len) * p.zip.v; p.vy = (e[1] / len) * p.zip.v; p.vz = (e[2] / len) * p.zip.v;
  p.face = Math.atan2(e[0], e[2]);
  p.ground = null;
  if (s >= 1) p.zip = null; // off the end, flying on
}

// ---- bots ------------------------------------------------------------------------------------
// Empty places in a gang are filled by bots, and the level checks drive a
// whole gang of them. Each walks the level's route (node by node), but never
// pulls away from its neighbours on the chain; it crosses gaps one at a time
// (checked by flying the jump through the level as it will be), jumps walls,
// hops on and off moving things when the landing is right, jumps barrels,
// digs in for gusts, hauls up a teammate hanging off an edge, climbs the
// chain when dangling, and rides the zip line.
function nearestNode(L, p) {
  let best = 0, bd = Infinity;
  L.route.forEach((n, k) => { const d = Math.hypot(n.p[0] - p.x, (n.p[1] - p.y) * 2, n.p[2] - p.z); if (d < bd) { bd = d; best = k; } });
  return best;
}
/** How far along the route (in metres) a point is, by the nearest stretch of it. */
function routeAt(L, q) {
  const Rt = L.route;
  if (!L.routeLen) { L.routeLen = [0]; for (let k = 1; k < Rt.length; k++) L.routeLen.push(L.routeLen[k - 1] + Math.hypot(Rt[k].p[0] - Rt[k - 1].p[0], Rt[k].p[2] - Rt[k - 1].p[2])); }
  let best = 0, bd = Infinity;
  for (let k = 0; k + 1 < Rt.length; k++) {
    const a = Rt[k].p, b = Rt[k + 1].p, ex = b[0] - a[0], ez = b[2] - a[2], l2 = ex * ex + ez * ez || 1;
    const s = Math.max(0, Math.min(1, ((q.x - a[0]) * ex + (q.z - a[2]) * ez) / l2));
    const d = Math.hypot(a[0] + ex * s - q.x, (a[1] + (b[1] - a[1]) * s - q.y) * 0.5, a[2] + ez * s - q.z);
    if (d < bd) { bd = d; best = L.routeLen[k] + s * Math.sqrt(l2); }
  }
  return best;
}
/** How far a traveller is from the leg of the route they're on (from the last node to the next). */
function offLeg(L, p) {
  const b = L.route[p.ni].p, a = L.route[Math.max(0, p.ni - 1)].p;
  const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], l2 = ex * ex + ey * ey + ez * ez || 1;
  const s = Math.max(0, Math.min(1, ((p.x - a[0]) * ex + (p.y - a[1]) * ey + (p.z - a[2]) * ez) / l2));
  return Math.hypot(a[0] + ex * s - p.x, (a[1] + ey * s - p.y) * 2, a[2] + ez * s - p.z);
}
// battlements, the rock under the pieces, pines, barrel stacks, gate posts:
// solid, but nothing a bot means to land on
const FURNITURE = new Set(['under', 'merlon', 'tree', 'post', 'barrels', 'tower', 'hub', 'gong', 'rockets', 'part']);
const flat = (dx, dz) => { const d = Math.hypot(dx, dz) || 1; return [dx / d, dz / d]; };
// (is there solid, unmoving stone under a route node? if not, it's a jump onto something)
const footingAt = (solids, n) => solids.some((s) => n[0] > s.x0 && n[0] < s.x1 && n[2] > s.z0 && n[2] < s.z1 && Math.abs(s.y1 - n[1]) < 0.6 && !s.mover && s.crumble === undefined);

export function botInput(sim, i) {
  const p = sim.players[i], L = sim.level, t = sim.t;
  const out = { mx: 0, mz: 0, jump: false, grab: false };
  if (p.zip) { out.grab = true; return out; }
  if (!p.ground) for (const z of L.zips) if (onZip(p, z) !== null) { out.grab = true; return out; } // catch the zip line
  const nbrs = [sim.players[i - 1], sim.players[i + 1]].filter(Boolean);
  const solids = solidsAt(sim, t);
  const footing = (x, z, y = p.y) => solids.some((s) => !FURNITURE.has(s.kind) && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1 && s.y1 <= y + 0.5 && s.y1 > y - 0.6 && s.crumble === undefined && !s.mover);
  // a gust: dig in until it passes
  if (p.ground && L.winds.some((w) => inBox({ ...w, x0: w.x0 - 1, x1: w.x1 + 1, z0: w.z0 - 1, z1: w.z1 + 1 }, p.x, p.y + 0.5, p.z) && windOn(w, t + 0.15))) { out.grab = true; return out; }
  // someone hanging off an edge: the one next to us on the rope, dig in (GRAB) and reel them in;
  // anyone further down the rope, haul up by walking away from them
  const hanging = sim.players.find((q) => q !== p && !q.ground && !q.zip && q.y < p.y - 1 && q.fallT === 0 && Math.abs(q.vy) < 6 && q.taut);
  if (hanging && p.ground && nbrs.includes(hanging) && !p.ground.mover && p.ground.crumble === undefined) { out.grab = true; return out; }
  if (hanging && p.ground) {
    const [ax, az] = flat(p.x - hanging.x, p.z - hanging.z);
    if (footing(p.x + ax * 0.8, p.z + az * 0.8)) { out.mx = ax; out.mz = az; } else out.grab = true;
    return out;
  }
  // dangling: climb the chain
  const above = nbrs.find((q) => q.y > p.y + 0.8);
  // (hanging under something — a cart, a lantern, a piece of the wall: out to its nearest edge first, then climb)
  const roof = !p.ground && p.taut && above && solids.find((s) => !s.oneWay && p.x > s.x0 - R && p.x < s.x1 + R && p.z > s.z0 - R && p.z < s.z1 + R && s.y0 > p.y + PH - 0.3 && s.y0 < p.y + PH + 3);
  if (roof) {
    const out2 = [[roof.x0 - R - 0.4 - p.x, 0], [roof.x1 + R + 0.4 - p.x, 0], [0, roof.z0 - R - 0.4 - p.z], [0, roof.z1 + R + 0.4 - p.z]].sort((u, v) => Math.hypot(...u) - Math.hypot(...v))[0];
    const [ax, az] = flat(out2[0], out2[1]); out.mx = ax; out.mz = az; p.botAir = [ax, az]; return out;
  }
  if (!p.ground && p.taut && above) { out.jump = !p.held; const [ax, az] = flat(above.x - p.x, above.z - p.z); out.mx = ax * 0.6; out.mz = az * 0.6; p.botAir = [out.mx, out.mz]; return out; }

  // where next on the route (skipping ahead if something carried us past a node — the zip line)
  // (…or back, if a fall or a crumbled stone left us behind it)
  if (p.ground) {
    const k = nearestNode(L, p);
    const legLow = Math.min(L.route[p.ni].p[1], L.route[Math.max(0, p.ni - 1)].p[1]);
    if (k > p.ni || (k < p.ni && (offLeg(L, p) > 2.8 || p.y < legLow - 0.5))) p.ni = k;
  }
  while (p.ni < L.route.length - 1) {
    const n = L.route[p.ni];
    const nx = L.route[p.ni + 1].p;
    // gone round it (a tree or someone in the way): on, if it's behind us now, or we're on the island it's the middle of
    const solid = p.ground && !p.ground.mover && p.ground.crumble === undefined;
    const past = solid && !n.pad && p.y > n.p[1] - 0.15 && ((n.near && Math.abs(n.p[1] - p.y) < 0.15 && Math.hypot(n.p[0] - p.x, n.p[2] - p.z) < n.near + 0.5)
      || Math.hypot(nx[0] - p.x, nx[2] - p.z) < Math.hypot(nx[0] - n.p[0], nx[2] - n.p[2]) - 0.3);
    if ((Math.hypot(n.p[0] - p.x, n.p[2] - p.z) < (n.near || 0.9) || past) && Math.abs(n.p[1] - p.y) < 1.4 && (p.ground || n.pad || n.near)) p.ni++;
    else break;
  }
  const node = L.route[p.ni];
  const [dx, dz] = flat(node.p[0] - p.x, node.p[2] - p.z);
  // up on something that isn't the way (a rocket rack, a barrel stack): straight off it, toward the way on
  if (p.ground && FURNITURE.has(p.ground.kind)) { out.mx = dx; out.mz = dz; return out; }
  if (!p.ground) { const a = p.botAir || [dx, dz]; out.mx = a[0]; out.mz = a[1]; return out; }
  p.botAir = null;
  const toNode = Math.hypot(node.p[0] - p.x, node.p[2] - p.z);
  // with people playing, never get further along than the furthest of them (they lead)
  const humans = sim.players.filter((q) => !q.bot);
  if (humans.length && routeAt(L, p) > Math.max(...humans.map((q) => routeAt(L, q))) + 1.5) return out;
  // keep the chain's order: never get ahead of the bot in front
  const front = sim.players[i - 1];
  const frontTo = front ? Math.hypot(node.p[0] - front.x, node.p[2] - front.z) : 0;
  if (front && front.bot && (p.ni > front.ni || (p.ni === front.ni && frontTo > toNode - 0.3)) && !p.ground.mover && p.ground.crumble === undefined) return out;
  // don't pull away from the gang
  const away = nbrs.some((q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > CHAIN - 0.7 && Math.hypot(p.x + dx * 0.5 - q.x, p.z + dz * 0.5 - q.z) > Math.hypot(p.x - q.x, p.z - q.z) + 0.1);
  if (away || (p.ni === L.route.length - 1 && toNode < 0.6)) return out;
  out.mx = dx; out.mz = dz;
  // in a gusty stretch: only jump with a calm second ahead
  // (a gust that reaches where we are or where we're jumping to — not one on the stairs behind us)
  const gusty = L.winds.some((w) => {
    const g = { ...w, x0: w.x0 - 1, x1: w.x1 + 1, z0: w.z0 - 1, z1: w.z1 + 1, y0: w.y0 - 2, y1: w.y1 + 2 };
    return (inBox(g, p.x, p.y + 0.5, p.z) || inBox(g, node.p[0], node.p[1] + 0.5, node.p[2])) && [0.3, 0.6, 0.9].some((d) => windOn(w, t + d));
  });
  // a zip line's start overhead: jump for it
  for (const z of L.zips) if (Math.hypot(p.x - z.a[0], p.z - z.a[2]) < 1.3 && z.a[1] > p.y + PH && z.a[1] < p.y + PH + 2.5) { out.jump = !p.held; p.botAir = [dx, dz]; return out; }
  // a barrel rolling at us
  if (sim.barrels.some((b) => Math.abs(b.y - (p.y + BARREL_R)) < 1 && Math.hypot(b.x - p.x, b.z - p.z) < 2.4 && (b.x - p.x) * b.vx + (b.z - p.z) * b.vz < 0)) { out.jump = !p.held; p.botAir = [dx, dz]; return out; }
  // a wall: jump
  const wall = solids.some((s) => !s.oneWay && !s.bounce && hit(p.x + dx * 0.5, p.y + STEP_UP + 0.05, p.z + dz * 0.5, s, PH - STEP_UP - 0.1) && s.y1 - p.y < 2.2);
  if (wall) { if (gusty) { out.mx = out.mz = 0; out.grab = true; return out; } out.jump = !p.held; p.botAir = [dx, dz]; return out; }
  // standing on something that moves: wait for a jump that lands right
  const calm = sim.botJumpT !== t && sim.players.every((q) => q === p || q.ground || q.zip);
  if (p.ground.mover) {
    const air = calm ? landing(sim, p, node) : null;
    if (air) { out.jump = !p.held; p.botAir = air; sim.botJumpT = t; return out; }
    // ride near its leading edge, ready to go
    const g = p.ground, cx = (g.x0 + g.x1) / 2 + dx * Math.max(0, (g.x1 - g.x0) / 2 - 0.65), cz = (g.z0 + g.z1) / 2 + dz * Math.max(0, (g.z1 - g.z0) / 2 - 0.65);
    const d = Math.hypot(cx - p.x, cz - p.z);
    out.mx = d > 0.3 ? ((cx - p.x) / d) * 0.5 : 0; out.mz = d > 0.3 ? ((cz - p.z) / d) * 0.5 : 0;
    return out;
  }
  // a gap (or a crumbling stone, or something moving) ahead: jump when the landing is safe, nearest first
  const onCrumble = p.ground.crumble !== undefined;
  const ahead = (k) => footing(p.x + dx * k, p.z + dz * k);
  if (!ahead(0.6) || onCrumble || (node.jump && toNode < 4.5 && !footingAt(solids, node.p) && !node.pad)) {
    if (!onCrumble && ahead(0.3) && !node.jump) return out; // get right to the edge first
    if (!onCrumble && node.jump && ahead(0.6) && footingAt(solids, node.p) === false && toNode > 3.2) return out;
    if (gusty || !calm) { out.mx = out.mz = 0; return out; } // one at a time
    const hurry = onCrumble && sim.crumble[p.ground.crumble].stood > 1.6 * (L.crumbleStand || 2.5) / 2.5; // (sooner on a harder stretch)
    const air = landing(sim, p, node, hurry ? 1.2 : 0);
    if (!air && !node.jump && !onCrumble) {
      // no jump to make, just no stone on the straight line from here (we're
      // on a corner — round a tree, say): step back toward the middle first
      const g = p.ground, [cx, cz] = flat((g.x0 + g.x1) / 2 - p.x, (g.z0 + g.z1) / 2 - p.z);
      out.mx = cx * 0.6; out.mz = cz * 0.6; return out;
    }
    if (!air) { out.mx = out.mz = 0; return out; }
    out.jump = !p.held; p.botAir = air; sim.botJumpT = t;
  }
  return out;
}

/** Flies a jump toward the node through the level as it will be, at a few
 *  speeds; the steering that lands nearest the node on safe footing, or null. */
function landing(sim, p, node, slack = 0) {
  const g = p.ground && p.ground.mover ? p.ground : null;
  const [dx, dz] = flat(node.p[0] - p.x, node.p[2] - p.z);
  const before = Math.hypot(node.p[0] - p.x, node.p[2] - p.z);
  let best = null, bestScore = Infinity;
  for (const k of [0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1]) {
    const sp = RUN * Math.min(1, k * 1.3), wx = dx * sp, wz = dz * sp;
    let vx = p.vx, vz = p.vz;
    const along = vx * dx + vz * dz; if (along < sp * 0.85) { vx += dx * (sp * 0.85 - along); vz += dz * (sp * 0.85 - along); }
    vx += g ? g.vx : 0; vz += g ? g.vz : 0;
    let x = p.x, y = p.y, z = p.z, vy = JUMP + (g ? Math.max(0, g.vy) : 0);
    for (let f = 1; f <= 100; f++) {
      const t = sim.t + f * STEP;
      const ddx = wx - vx, ddz = wz - vz, dd = Math.hypot(ddx, ddz), by = AIR_ACC * STEP;
      if (dd <= by) { vx = wx; vz = wz; } else { vx += (ddx / dd) * by; vz += (ddz / dd) * by; }
      vy -= gravity(vy, true) * STEP; x += vx * STEP; y += vy * STEP; z += vz * STEP;
      const all = solidsAt(sim, t);
      // flying into something on the way (the carousel's drum, a battlement): not this one
      if (all.some((q) => x + R > q.x0 && x - R < q.x1 && z + R > q.z0 && z - R < q.z1 && y + PH > q.y0 && y < q.y1 - 0.5)) break;
      if (vy > 0) continue;
      let s = null;
      for (const q of all) if (!FURNITURE.has(q.kind) && x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && y <= q.y1 && y > q.y1 - 0.5) { s = q; break; }
      if (s) {
        // well onto it: footing (this or a neighbouring step) all round the landing spot
        const under = (ox, oz) => all.some((q) => x + ox > q.x0 && x + ox < q.x1 && z + oz > q.z0 && z + oz < q.z1 && Math.abs(q.y1 - s.y1) < 0.5 && (q.mover ? q.id === s.id : true));
        const margin = [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].every(([ox, oz]) => under(ox, oz)) ? Math.min(1, Math.min(x - s.x0, s.x1 - x, z - s.z0, s.z1 - z) + 0.3) : 0;
        const busy = s.crumble !== undefined && (sim.players.some((q) => q !== p && q.ground && q.ground.crumble === s.crumble) || sim.crumble[s.crumble].stood > 1.3 * (sim.level.crumbleStand || 2.5) / 2.5);
        const near = [sim.players[p.i - 1], sim.players[p.i + 1]].every((q) => !q || Math.hypot(q.x - x, q.y - s.y1, q.z - z) < CHAIN - 0.15 + slack);
        const after = Math.hypot(node.p[0] - x, node.p[2] - z);
        const same = s.id && p.ground && p.ground.id === s.id;
        const ok = margin > 0.25 && !busy && near && !s.bounce && s.y1 > fallLine(sim) + 3 && after < before - 0.6 && !same;
        const score = after - Math.min(margin, 1) * 1.5;
        if (ok && score < bestScore) { bestScore = score; best = [dx * k, dz * k]; }
        break;
      }
      if (y < fallLine(sim)) break;
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
  const lead = sim.players.reduce((a, p) => Math.max(a, p.ni), 0);
  return { done: sim.done !== null, time: +((sim.done ?? sim.t) - startAt).toFixed(1), falls: sim.falls, cp: sim.cp, node: lead };
}
