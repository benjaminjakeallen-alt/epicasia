// Chain Gang Dynasty — how the rope between two travellers hangs (no three.js,
// so the checks can run it headless). A rope of beads (verlet): pinned to each
// traveller's waist, it sags, lies on the walkway when slack and drapes over
// edges. The simulation (sim.js) only limits the distance between travellers;
// this is how the rope looks — and it never goes into anything: every bead,
// and every stretch between two beads, is pushed out of every solid box (the
// stone, the furniture, crumbling stones still there, launch pads, and the
// moving things where they are right now), last of all after the pulls.

import { moverBox } from './sim.js';

export const BEADS = 28, ROPE_R = 0.04;
const BEAD_R = ROPE_R + 0.04; // (a hair more than the rope's own thickness)

/** Every box the rope between a and b can touch, as things are at time t. */
export function ropeBoxes(L, t, crumbleGone, a, b, chainLen) {
  const pad = chainLen / 2 + 0.5, x0 = Math.min(a.x, b.x) - pad, x1 = Math.max(a.x, b.x) + pad, y0 = Math.min(a.y, b.y) - chainLen, y1 = Math.max(a.y, b.y) + 1;
  const z0 = Math.min(a.z, b.z) - pad, z1 = Math.max(a.z, b.z) + pad, out = [];
  const near = (s) => s.x1 > x0 && s.x0 < x1 && s.y1 > y0 && s.y0 < y1 && s.z1 > z0 && s.z0 < z1;
  for (const s of L.solids) if (near(s)) out.push(s);
  L.crumbles.forEach((c, k) => { if (!crumbleGone(k) && near(c)) out.push(c); });
  for (const m of L.movers) { const s = moverBox(m, t); if (near(s)) out.push(s); }
  for (const s of L.bouncers) if (near(s)) out.push(s);
  return out;
}

/** How deep a point is inside a box grown by r (≤ 0: outside), and which way is out. */
function depthIn(q, s, r) {
  const d = [s.x1 + r - q.x, q.x - (s.x0 - r), s.y1 + r - q.y, q.y - (s.y0 - r), s.z1 + r - q.z, q.z - (s.z0 - r)];
  let k = 0; for (let j = 1; j < 6; j++) if (d[j] < d[k]) k = j;
  return [d[k], k];
}
const AX = ['x', 'x', 'y', 'y', 'z', 'z'], SG = [1, -1, 1, -1, 1, -1];
const inside = (q, boxes) => boxes.some((s) => depthIn(q, s, BEAD_R)[0] > 0);
/** Is a point inside any of the boxes (where the rope ties on, say, with someone pressed against a tree)? */
export const insideAny = (q, boxes) => boxes.some((s) => depthIn(q, s, ROPE_R)[0] > 0);
/** Wedged where boxes meet (a rocket on a pad, a stone in a crack), pushing out of one
 *  pushes it into the next: then go the shortest of the six ways that clears them all. */
function escape(q, boxes) {
  if (!inside(q, boxes)) return;
  let best = null;
  for (let k = 0; k < 6; k++) {
    const p = { x: q.x, y: q.y, z: q.z };
    let moved = 0;
    for (let n = 0; n < 12; n++) {
      let step = 0;
      for (const s of boxes) {
        const d = depthIn(p, s, BEAD_R)[0];
        if (d <= 0) continue;
        // how far along this way to the box's far side
        const lo = { x: s.x0, y: s.y0, z: s.z0 }[AX[k]] - BEAD_R, hi = { x: s.x1, y: s.y1, z: s.z1 }[AX[k]] + BEAD_R;
        step = Math.max(step, SG[k] > 0 ? hi - p[AX[k]] : p[AX[k]] - lo);
      }
      if (!step) break;
      p[AX[k]] += (step + 1e-4) * SG[k]; moved += step;
    }
    if (!inside(p, boxes) && (!best || moved < best.moved)) best = { moved, p };
  }
  if (best) { q.x = best.p.x; q.y = best.p.y; q.z = best.p.z; }
}

/** Out the side it came in by (where it was at the start of the frame), so a
 *  rope pulled against something thin — a row of rockets, a post — goes round
 *  it instead of being squeezed out through the far side. */
function entrySide(q, s) {
  const r = BEAD_R, d = depthIn(q, s, r);
  if (q.px === undefined) return d;
  const was = [q.px >= s.x1 + r, q.px <= s.x0 - r, q.py >= s.y1 + r, q.py <= s.y0 - r, q.pz >= s.z1 + r, q.pz <= s.z0 - r];
  const cut = [s.x1 + r - q.x, q.x - (s.x0 - r), s.y1 + r - q.y, q.y - (s.y0 - r), s.z1 + r - q.z, q.z - (s.z0 - r)];
  let k = -1; for (let j = 0; j < 6; j++) if (was[j] && (k < 0 || cut[j] < cut[k])) k = j;
  return k < 0 ? d : [cut[k], k];
}
function pushOut(q, boxes) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const s of boxes) {
      if (depthIn(q, s, BEAD_R)[0] <= 0) continue;
      const [d, k] = entrySide(q, s);
      q[AX[k]] += d * SG[k]; moved = true;
      q.px += (q.x - q.px) * 0.6; q.pz += (q.z - q.pz) * 0.6; // friction against the stone
      if (k === 2) q.py = q.y; // resting on top: no bounce
    }
    if (!moved) return;
  }
  escape(q, boxes);
}
/** A stretch between two beads cutting through a corner: push both its ends out the way its middle is in. */
function pushSpan(a, b, boxes, fixedA, fixedB) {
  for (const u of [0.25, 0.5, 0.75]) {
    const m = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
    for (const s of boxes) {
      const [d, k] = depthIn(m, s, BEAD_R);
      if (d <= 0) continue;
      const ax = AX[k], v = d * SG[k];
      if (!fixedA) a[ax] += v * (fixedB ? 2 : 1.2);
      if (!fixedB) b[ax] += v * (fixedA ? 2 : 1.2);
    }
  }
}

/** One frame of the rope between A and B (waist points); r holds its beads. */
export function stepRope(r, A, B, boxes, dt, chainLen) {
  // its length: a little more than the gap (so it hangs in a curve rather
  // than piling up in coils), never more than the real rope
  const n = BEADS, gap = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z), seg = Math.min(chainLen, gap * 1.15 + 0.5) / (n - 1);
  if (!r.p || Math.hypot(r.p[0].x - A.x, r.p[0].y - A.y, r.p[0].z - A.z) > 3 || Math.hypot(r.p[n - 1].x - B.x, r.p[n - 1].y - B.y, r.p[n - 1].z - B.z) > 3) {
    r.p = Array.from({ length: n }, (_, k) => { const u = k / (n - 1), x = A.x + (B.x - A.x) * u, y = A.y + (B.y - A.y) * u, z = A.z + (B.z - A.z) * u; return { x, y, z, px: x, py: y, pz: z }; });
  }
  const P = r.p, g = 9.8 * Math.min(dt, 1 / 30) ** 2;
  for (let k = 1; k < n - 1; k++) { // move, with a little damping
    const q = P[k], vx = (q.x - q.px) * 0.94, vy = (q.y - q.py) * 0.94, vz = (q.z - q.pz) * 0.94;
    q.px = q.x; q.py = q.y; q.pz = q.z;
    q.x += vx; q.y += vy - g; q.z += vz;
  }
  const pin = () => { Object.assign(P[0], { x: A.x, y: A.y, z: A.z }); Object.assign(P[n - 1], { x: B.x, y: B.y, z: B.z }); };
  for (let it = 0; it < 16; it++) {
    pin();
    for (let k = 0; k < n - 1; k++) {
      const a = P[k], b = P[k + 1], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-6;
      const f = (d - seg) / d * (d < seg ? 0.5 : 1), wa = k === 0 ? 0 : k + 1 === n - 1 ? 1 : 0.5, wb = k + 1 === n - 1 ? 0 : k === 0 ? 1 : 0.5;
      a.x += dx * f * wa; a.y += dy * f * wa; a.z += dz * f * wa;
      b.x -= dx * f * wb; b.y -= dy * f * wb; b.z -= dz * f * wb;
    }
    if (it % 3 === 2) for (let k = 1; k < n - 1; k++) pushOut(P[k], boxes);
  }
  // last word: outside everything, beads and the stretches between them
  // (it may stretch a little round a corner rather than cut through it)
  for (let pass = 0; pass < 3; pass++) {
    pin();
    for (let k = 1; k < n - 1; k++) pushOut(P[k], boxes);
    for (let k = 0; k < n - 1; k++) pushSpan(P[k], P[k + 1], boxes, k === 0, k + 1 === n - 1);
  }
  for (let k = 1; k < n - 1; k++) pushOut(P[k], boxes);
  return P;
}

/** The line the rope is drawn along: each stretch between beads split in
 *  four, and every point of it pushed out of every box too — so even a
 *  stretch round a thin corner (a row of rockets on a pad's edge) bends round
 *  it rather than cutting through. */
export function ropePath(P, boxes) {
  const out = [];
  for (let k = 0; k < P.length; k++) {
    out.push({ x: P[k].x, y: P[k].y, z: P[k].z });
    if (k + 1 === P.length) break;
    for (const u of [0.25, 0.5, 0.75]) out.push({ x: P[k].x + (P[k + 1].x - P[k].x) * u, y: P[k].y + (P[k + 1].y - P[k].y) * u, z: P[k].z + (P[k + 1].z - P[k].z) * u });
  }
  for (let pass = 0; pass < 2; pass++) for (let k = 1; k < out.length - 1; k++) {
    const q = out[k];
    for (let rep = 0; rep < 3; rep++) {
      let moved = false;
      for (const s of boxes) { const [d, ax] = depthIn(q, s, BEAD_R); if (d > 0) { q[AX[ax]] += d * SG[ax]; moved = true; } }
      if (!moved) break;
    }
    escape(q, boxes);
  }
  // pulled tight over an edge, a stretch can still cut the corner between two
  // points that are each outside: put a point out round the corner between them
  const path = [out[0]];
  for (let k = 0; k + 1 < out.length; k++) { round(out[k], out[k + 1], boxes, path, 0); path.push(out[k + 1]); }
  return path.length <= ROPE_POINTS ? path : out;
}
export const ROPE_POINTS = (BEADS - 1) * 4 + 1 + 40; // (the drawn line's most points: room for a few corners)
function round(a, b, boxes, path, depth) {
  if (depth > 3) return;
  let worst = 0, at = null;
  for (let u = 0.125; u < 1; u += 0.125) {
    const q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
    for (const s of boxes) { const d = depthIn(q, s, ROPE_R)[0]; if (d > worst) { worst = d; at = q; } }
  }
  if (!at) return;
  // the two ends either side of a thin box (through a launch pad, a plank): no nudge
  // fixes that — go round its nearest edge instead
  const s = boxes.find((q) => depthIn(at, q, ROPE_R)[0] > 0), r = BEAD_R + 0.01;
  const lo = (ax) => ({ x: s.x0, y: s.y0, z: s.z0 })[ax] - r, hi = (ax) => ({ x: s.x1, y: s.y1, z: s.z1 })[ax] + r;
  const lo0 = (ax) => ({ x: s.x0, y: s.y0, z: s.z0 })[ax], hi0 = (ax) => ({ x: s.x1, y: s.y1, z: s.z1 })[ax]; // (the ends sit just outside it)
  const cross = ['x', 'y', 'z'].find((ax) => (a[ax] <= lo0(ax) && b[ax] >= hi0(ax)) || (b[ax] <= lo0(ax) && a[ax] >= hi0(ax)));
  if (cross) {
    // (the nearest edge whose way round is clear — not one where the pad runs on into the next piece)
    const ways = [];
    for (const ax of ['x', 'y', 'z']) if (ax !== cross) for (const [v, d] of [[lo(ax), at[ax] - lo(ax)], [hi(ax), hi(ax) - at[ax]]]) {
      const p1 = { ...at }, p2 = { ...at };
      p1[ax] = p2[ax] = v;
      p1[cross] = a[cross] < b[cross] ? lo(cross) : hi(cross); p2[cross] = a[cross] < b[cross] ? hi(cross) : lo(cross);
      ways.push({ d, p1, p2, clear: !inside(p1, boxes) && !inside(p2, boxes) });
    }
    ways.sort((u, v) => (u.clear === v.clear ? u.d - v.d : u.clear ? -1 : 1));
    const { p1, p2 } = ways[0];
    round(a, p1, boxes, path, depth + 1); path.push(p1); round(p1, p2, boxes, path, depth + 1); path.push(p2); round(p2, b, boxes, path, depth + 1);
    return;
  }
  escape(at, boxes);
  round(a, at, boxes, path, depth + 1); path.push(at); round(at, b, boxes, path, depth + 1);
}

/** How far the rope goes into anything (for the checks): the deepest any point along it is inside a box. */
export function ropeDepth(P, boxes) {
  let worst = 0;
  for (let k = 0; k + 1 < P.length; k++) for (let u = 0; u <= 1; u += 0.125) {
    const q = { x: P[k].x + (P[k + 1].x - P[k].x) * u, y: P[k].y + (P[k + 1].y - P[k].y) * u, z: P[k].z + (P[k + 1].z - P[k].z) * u };
    for (const s of boxes) { const [d] = depthIn(q, s, 0); if (d > worst) worst = d; }
  }
  return worst;
}
