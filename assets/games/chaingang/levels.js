// Tug of Wall — the four stretches, in 3D: a climb up into the sky,
// like Chained Together, through floating pieces of the Great Wall, rock
// islands and planks, spiralling upward over a sea of cloud. Pure data,
// read by the simulation (sim.js) and drawn by render3d.js. Metres, y up.
// A jump rises ~1.8 m and carries ~4 m; the chain between two travellers is
// 5 m; steps up to 0.45 m are walked.
//
// Each level is laid out by a "course" builder that walks a cursor forward
// (only ever along x or z, so every piece is an axis-aligned box), turning
// right at landings, so the way climbs in a square spiral and you see the
// pieces above you. The builder also writes the bots' route as it goes.
//
//   solids    stone, rock and planks: boxes {x0, x1, y0, y1, z0, z1, kind}
//   crumbles  stones that hold one traveller (two at once and they go)
//   movers    platforms on a path: 'swing' (a lantern), 'sine' (the dragon),
//             'circle' (the prayer-wheel carousel), 'line' (a rope cart)
//   bouncers  firework launch pads
//   rollers   where firecracker barrels start rolling, and which way
//   winds     gusts: a box, a push (fx, fz in m/s²), on/off seconds
//   zips      a zip line from a to b
//   spawn, checks, finish   where the gang starts, the watchtowers, the end
//   route     the way through, node by node, for the bots
//   decor     things that are only drawn (graffiti); everything you can see
//             that has a shape — battlements, the rock under each piece,
//             pines, barrel stacks, the finish gate — is in solids too
//             (see furnish()), so nobody and no chain passes through it

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // −z, +x, +z, −x; turning right goes round this list
const box = (xa, xb, y0, y1, za, zb, extra) => ({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0, y1, z0: Math.min(za, zb), z1: Math.max(za, zb), ...extra });

// opts.hard: how much harder than the first stretch (user, Oct 15 2026: "15% harder on
// level 2 and 3") — gaps that much longer; in done(), everything that moves that much
// faster, gusts that much stronger and longer, barrels that much more often and quicker.
// (Not the crumbling stones: quicker to give way (2.2 s) or slower to come back (3.45 s)
// and a gang of three couldn't get across them one at a time any more.)
function course(name, key, line, opts = {}) {
  const H = opts.hard || 1;
  const L = { key, name, line, hard: H, crumbleStand: 2.5, crumbleBack: 3, fallY: -30, solids: [], crumbles: [], movers: [], bouncers: [], rollers: [], winds: [], zips: [], checks: [], route: [], decor: [] };
  const c = { x: 0, y: 0, z: 0, h: 0, jump: false, wind: null, barrels: false, thick: 0 };
  const f = () => DIRS[c.h], side = () => [-DIRS[c.h][1], DIRS[c.h][0]]; // (side = to the right)
  const at = (along, across = 0) => { const [fx, fz] = f(), [sx, sz] = side(); return [c.x + fx * along + sx * across, c.z + fz * along + sz * across]; };
  const node = (along, flags = {}, y = c.y) => { const [x, z] = at(along); L.route.push({ p: [x, y, z], ...flags }); };
  // a piece from the cursor `len` forward, `w` wide, its top at the cursor's height
  function slab(len, w, kind, top = c.y, thick = 4.5) {
    const [xa, za] = at(0, -w / 2), [xb, zb] = at(len, w / 2);
    const b = box(xa, xb, top - Math.max(thick, c.thick), top, za, zb, { kind, along: f()[0] ? 'x' : 'z' });
    L.solids.push(b);
    return b;
  }
  function takeWind(len, w) {
    if (!c.wind) return;
    const [xa, za] = at(-0.5, -w / 2 - 1), [xb, zb] = at(len + 0.5, w / 2 + 1), [sx, sz] = side();
    L.winds.push({ ...box(xa, xb, c.y - 1, c.y + 6, za, zb), fx: sx * 40 * c.wind.dir, fz: sz * 40 * c.wind.dir, on: 1.6, off: 2.6, phase: c.wind.phase });
    c.wind = null;
  }
  // barrels roll back down the piece from its far end (`top` high there); a
  // stack of two stands beside where they start, on the right-hand edge
  function takeBarrels(len, top = c.y) {
    if (!c.barrels) return;
    const [x, z] = at(len - 0.6), [fx, fz] = f();
    L.rollers.push({ x, y: top + 0.5, z, dx: -fx, dz: -fz, speed: 4.5, every: 5.5, first: 2.5 });
    const [bx, bz] = at(len - 0.5, 1.05);
    L.solids.push({ ...box(bx - 0.45, bx + 0.45, top, top + 1.9, bz - 0.45, bz + 0.45), kind: 'barrels' });
    c.barrels = false;
  }
  const api = {
    /** A stretch of wall walkway (battlements along both sides). */
    walk(len, w = 3.2) {
      takeWind(len, w); takeBarrels(len);
      slab(len, w, 'wall');
      if (c.jump) node(1.0, { jump: true });
      node(len - 0.6);
      c.jump = false; c.thick = 0;
      const [x, z] = at(len); c.x = x; c.z = z;
      return api;
    },
    /** A narrow plank. */
    plank(len) {
      slab(len, 1.4, 'plank', c.y, 0.35);
      node(-0.6); // line up at its start
      if (c.jump) node(1.0, { jump: true }); else node(0.8);
      node(len - 0.5);
      c.jump = false;
      const [x, z] = at(len); c.x = x; c.z = z;
      return api;
    },
    /** Steps up (each ≤ 0.45 m, so they're walked). */
    stairs(len, rise, n = Math.ceil(rise / 0.4)) {
      takeWind(len, 3.2); takeBarrels(len, c.y + rise);
      const y0 = c.y;
      for (let k = 0; k < n; k++) {
        const [xa, za] = at((len * k) / n, -1.6), [xb, zb] = at((len * (k + 1)) / n, 1.6), top = y0 + (rise * (k + 1)) / n;
        L.solids.push(box(xa, xb, y0 - 4.5 - Math.max(0, c.thick - 4.5), top, za, zb, { kind: 'wall', along: f()[0] ? 'x' : 'z', step: true }));
      }
      if (c.jump) node(1.0, { jump: true }, y0 + rise / n);
      c.y += rise;
      node(len - 0.6);
      c.jump = false; c.thick = 0;
      const [x, z] = at(len); c.x = x; c.z = z;
      return api;
    },
    /** A gap to jump (dy: how much higher the far side is). */
    gap(len, dy = 0) { const [x, z] = at(len * H); c.x = x; c.z = z; c.y += dy; c.jump = true; return api; },
    /** A square floating rock island; turns right (+1), left (−1) or not (0). */
    landing(size, turn = 0, o = {}) {
      takeWind(size, size);
      const [cx, cz] = at(size / 2);
      L.solids.push(box(cx - size / 2, cx + size / 2, c.y - 6, c.y, cz - size / 2, cz + size / 2, { kind: 'rock' }));
      if (o.spawn) L.spawn = { x: cx, y: c.y, z: cz, dir: f() };
      L.route.push({ p: [cx, c.y, cz], near: 1.6, ...(c.jump ? { jump: true } : {}) });
      c.jump = false; c.thick = 0;
      c.h = (c.h + turn + 4) % 4;
      if (o.check) L.checks.push({ x: cx, y: c.y, z: cz, dir: f() });
      if (o.finish) { L.finish = { x: cx, y: c.y, z: cz, dir: f() }; return api; }
      c.x = cx + f()[0] * size / 2; c.z = cz + f()[1] * size / 2;
      return api;
    },
    /** Crumbling stones across a gap, each a little higher. */
    stones(n, rise = 0.5) {
      for (let k = 0; k < n; k++) {
        c.y += rise;
        const [x, z] = at(1.0 + 2.2 * k + 0.8, k % 2 ? 0.45 : -0.45);
        L.crumbles.push(box(x - 0.8, x + 0.8, c.y - 0.7, c.y, z - 0.8, z + 0.8));
        L.route.push({ p: [x, c.y, z], jump: true });
      }
      const [x, z] = at(1.0 + 2.2 * n); c.x = x; c.z = z; c.jump = true;
      return api;
    },
    /** A bridge of lanterns swinging side to side over a gap. */
    lanterns(n) {
      const [sx, sz] = side();
      for (let k = 0; k < n; k++) {
        const [x, z] = at(0.4 + 1.6 + 4 * k);
        const path = { type: 'swing', px: x, py: c.y + 7, pz: z, len: 6, amp: 0.35, ux: sx, uz: sz, period: 4.4, phase: k * 0.15 };
        L.movers.push({ kind: 'lantern', w: Math.abs(f()[0]) ? 3.2 : 3, d: Math.abs(f()[0]) ? 3 : 3.2, h: 0.35, path });
        L.movers.push({ kind: 'part', look: 'lanternBody', w: 1.7, d: 1.7, h: 1.4, oy: -0.35, path }); // the paper lantern under it
        L.route.push({ p: [x, c.y + 1, z], jump: true, near: 2 });
      }
      const [x, z] = at(4 * n + 0.8); c.x = x; c.z = z; c.jump = true;
      return api;
    },
    /** The parade dragon: segments bobbing and swaying over a long gap. */
    dragon(n) {
      const [sx, sz] = side();
      for (let k = 0; k < n; k++) {
        const [x, z] = at(0.4 + 1.2 + 3.3 * k);
        const along = Math.abs(f()[0]) > 0;
        const path = { type: 'sine', x0: x, y0: c.y, z0: z, ax: sx * 0.8, ay: 0.9, az: sz * 0.8, period: 3.6, phase: -0.7 * k, lag: 1.2 };
        const [fx, fz] = f();
        L.movers.push({ kind: k === n - 1 ? 'dragonHead' : k === 0 ? 'dragonTail' : 'dragon', w: along ? 2.4 : 2.6, d: along ? 2.6 : 2.4, h: 0.5, dir: c.h, path });
        // its parts, solid too: the pole it's carried on, and the head (on in front) or the tail (behind) — flush with its back
        L.movers.push({ kind: 'part', look: 'dragonPole', w: 0.16, d: 0.16, h: 14, oy: -0.5, path });
        if (k === n - 1) L.movers.push({ kind: 'part', look: 'dragonHead', w: along ? 1.7 : 1.8, d: along ? 1.8 : 1.7, h: 1.4, ox: fx * 2.05, oz: fz * 2.05, path });
        if (k === 0) L.movers.push({ kind: 'part', look: 'dragonTail', w: 1.1, d: 1.1, h: 0.8, ox: -fx * 1.75, oz: -fz * 1.75, path });
        L.route.push({ p: [x, c.y, z], jump: true, near: 1.8 });
      }
      const [x, z] = at(0.4 + 3.3 * n - 0.9 + 1.1); c.x = x; c.z = z; c.jump = true;
      return api;
    },
    /** The prayer-wheel carousel: four platforms going round a drum. */
    carousel(r = 2.8) {
      const [cx, cz] = at(1.2 + 1.2 + r);
      for (let k = 0; k < 4; k++) L.movers.push({ kind: 'wheel', w: 2.4, d: 2.4, h: 0.35, path: { type: 'circle', cx, cy: c.y, cz, r, period: 11, phase: (k * Math.PI) / 2 } });
      // the prayer-wheel drum in the middle, on its pole
      // (up out of reach of anyone riding round it — the platforms' corners pass close)
      L.solids.push({ ...box(cx - 0.8, cx + 0.8, c.y + 2.6, c.y + 3.8, cz - 0.8, cz + 0.8), kind: 'hub' });
      L.solids.push({ ...box(cx - 0.4, cx + 0.4, c.y - 19, c.y + 2.6, cz - 0.4, cz + 0.4), kind: 'hub', pole: true });
      L.route.push({ p: [cx, c.y, cz], jump: true, near: r + 0.6 });
      const [x, z] = at(1.2 + 1.2 + 2 * r + 1.2 + 0.8); c.x = x; c.z = z; c.jump = true;
      return api;
    },
    /** Rope carts shuttling across a gap. */
    carts(n) {
      const [fx] = f();
      for (let k = 0; k < n; k++) {
        const [ax, az] = at(0.2 + 1.6 + 8.2 * k), [bx, bz] = at(0.2 + 1.6 + 3.6 + 8.2 * k), y = c.y + 0.2 + 0.3 * k;
        const path = { type: 'line', ax, ay: y, az, bx, by: y, bz, period: 4.6, phase: k % 2 ? Math.PI : 0 }, [gx, gz] = side();
        L.movers.push({ kind: 'cart', w: fx ? 3.2 : 3, d: fx ? 3 : 3.2, h: 0.9, path });
        // the two ropes it hangs from, at its sides (not front and back, where you jump on and off)
        for (const e of [-1, 1]) L.movers.push({ kind: 'part', look: 'hanger', w: 0.12, d: 0.12, h: 2.6, oy: 2.8, ox: gx * e * 1.4, oz: gz * e * 1.4, path });
        const [mx, mz] = at(0.2 + 1.6 + 1.8 + 8.2 * k);
        L.route.push({ p: [mx, y, mz], jump: true, near: 2.2 });
      }
      const [x, z] = at(0.2 + 8.2 * n - 1.2 + 0.8); c.x = x; c.z = z; c.y += 0.6; c.jump = true;
      return api;
    },
    /** A firework launch pad in front of a wall face `rise` higher. */
    pad(rise) {
      const [xa, za] = at(0, -1.6), [xb, zb] = at(3, 1.6);
      L.bouncers.push(box(xa, xb, c.y - 0.5, c.y, za, zb, { power: Math.sqrt(52 * (rise + 1.2)) }));
      // stone under it, down to the pieces either side (a fallen traveller used to wedge in the slot under the pad)
      L.solids.push(box(xa, xb, c.y - 4.5, c.y - 0.5, za, zb, { kind: 'wall', along: f()[0] ? 'x' : 'z', step: true }));
      // a row of firework rockets standing along each side of the pad
      for (const e of [-1, 1]) {
        const [ra, rza] = at(0.25, e * 1.6 - e * 0.32), [rb, rzb] = at(2.75, e * 1.6);
        L.solids.push({ ...box(ra, rb, c.y, c.y + 1.25, rza, rzb), kind: 'rockets' });
      }
      node(1.5, { pad: true, near: 1.4 });
      const [x, z] = at(3); c.x = x; c.z = z; c.y += rise; c.thick = rise + 4.5; c.jump = false;
      return api;
    },
    /** A zip line forward and down to a piece `len` away and `drop` lower. */
    zip(len, drop) {
      const [ax, az] = at(-1.2), [bx, bz] = at(len - 2);
      L.zips.push({ a: [ax, c.y + 2.4, az], b: [bx, c.y - drop + 2.3, bz] });
      const [x, z] = at(len - 5); c.x = x; c.z = z; c.y -= drop;
      const [nx, nz] = at(2);
      L.route.push({ p: [nx, c.y, nz], near: 3 });
      c.jump = false;
      return api;
    },
    /** Gusts across the next piece (dir +1 pushes to the right, −1 to the left). */
    wind(dir, phase = 0) { c.wind = { dir, phase }; return api; },
    /** Firecracker barrels rolling back down the next piece. */
    barrels() { c.barrels = true; return api; },
    tag(text, along, across, up = -0.7) {
      const [x, z] = at(along, across), [sx, sz] = side(), sg = Math.sign(across) || 1;
      L.decor.push({ type: 'tag', x, y: c.y + up, z, nx: sx * sg, nz: sz * sg, text });
      return api;
    },
    done() {
      const lowest = Math.min(...L.solids.map((s) => s.y1));
      L.fallY = lowest - 18;
      if (H !== 1) {
        L.movers.forEach((m) => { if (!m.path.hardened) { m.path.period /= H; m.path.hardened = true; } }); // (parts share their parent's path)
        L.winds.forEach((w) => { w.fx *= H; w.fz *= H; w.on *= H; w.off /= H; });
        L.rollers.forEach((r) => { r.every /= H; r.speed *= H; });
      }
      furnish(L);
      return L;
    },
  };
  return api;
}

/**
 * Everything drawn on and under the pieces, as boxes the simulation knows:
 * battlements along both sides of the Wall, the jagged rock hanging under
 * each floating piece (stepped tiers, narrowing downward), pines on the rock
 * islands and the finish gate's posts.
 */
function furnish(L) {
  const add = (b, kind, extra) => L.solids.push({ ...b, kind, ...extra });
  for (const s of L.solids.slice()) {
    if (s.kind === 'wall' && !s.step) {
      const alongX = s.along === 'x', len = alongX ? s.x1 - s.x0 : s.z1 - s.z0;
      for (let k = 0.6; k < len - 0.3; k += 1.6) for (const side of [0, 1]) {
        const a0 = (alongX ? s.x0 : s.z0) + k - 0.275, a1 = a0 + 0.55;
        const c0 = side ? (alongX ? s.z1 : s.x1) - 0.45 : alongX ? s.z0 : s.x0, c1 = c0 + 0.45;
        add(alongX ? box(a0, a1, s.y1, s.y1 + 0.55, c0, c1) : box(c0, c1, s.y1, s.y1 + 0.55, a0, a1), 'merlon');
      }
    }
    if ((s.kind === 'wall' || s.kind === 'rock') && !s.step) {
      const depth = s.kind === 'rock' ? 4 : 2.5, hw = (s.x1 - s.x0) / 2, hd = (s.z1 - s.z0) / 2;
      let y = s.y0;
      // (the top tier is flush with the piece and the others step in by at
      // least 0.75 m, so no crack beside another piece is too narrow to fit
      // a traveller and wedge them in it)
      [[0.42, 0, 0], [0.33, 0.32, 0.75], [0.25, 0.56, 1.4]].forEach(([dh, inset, min], k) => {
        const ix = Math.min(hw - 0.3, Math.max(min, hw * inset)), iz = Math.min(hd - 0.3, Math.max(min, hd * inset));
        add(box(s.x0 + ix, s.x1 - ix, y - depth * dh, y, s.z0 + iz, s.z1 - iz), 'under', { tier: k });
        y -= depth * dh;
      });
    }
  }
  // pines on a rock island's corners (as many and as big as the drawing has)
  L.solids.filter((s) => s.kind === 'rock').forEach((s, n) => {
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, h = (s.x1 - s.x0) / 2 - 0.7, seed = n * 3 + 1;
    [[1, 1], [-1, -1], [1, -1]].slice(0, 1 + (seed % 2) + 1).forEach(([a, b], k) => {
      if ((seed + k) % 3 === 0) return;
      const sc = 0.5 + (((seed * 7 + k) % 3) / 2) * 0.25, r = 0.5 * sc;
      add(box(cx + a * h - r, cx + a * h + r, s.y1, s.y1 + 2.7 * sc, cz + b * h - r, cz + b * h + r), 'tree', { scale: sc });
    });
  });
  // the finish gate's two posts, its beams and (on the last stretch) the gong between them
  const fi = L.finish, [dx, dz] = fi.dir, gx = fi.x + dx * 2, gz = fi.z + dz * 2;
  for (const across of [-1.9, 1.9]) {
    const x = gx - dz * across, z = gz + dx * across;
    add(box(x - 0.225, x + 0.225, fi.y, fi.y + 4.8, z - 0.225, z + 0.225), 'post');
  }
  const wide = (h, d) => (dx ? box(gx - d, gx + d, 0, 0, gz - h, gz + h) : box(gx - h, gx + h, 0, 0, gz - d, gz + d));
  add({ ...wide(2.45, 0.3), y0: fi.y + 4.1, y1: fi.y + 5.15 }, 'post');
  if (L.key === 'storm') add({ ...wide(1.35, 0.15), y0: fi.y + 1.15, y1: fi.y + 3.85 }, 'gong');
  // the zip line's posts, one at each end
  for (const zl of L.zips) {
    const e = [zl.b[0] - zl.a[0], zl.b[1] - zl.a[1], zl.b[2] - zl.a[2]], len = Math.hypot(...e), h = Math.hypot(e[0], e[2]);
    // (beside the line, 1.9 m to one side, whichever way it runs — not in the way on)
    const ox = (e[2] / h) * 1.9, oz = (-e[0] / h) * 1.9;
    for (const [p, sg] of [[zl.a, -1], [zl.b, 1]]) {
      const x = p[0] + (e[0] / len) * 1.2 * sg + ox, y = p[1] + (e[1] / len) * 1.2 * sg, z = p[2] + (e[2] / len) * 1.2 * sg + oz;
      add(box(x - 0.175, x + 0.175, y - 5.7, y + 0.3, z - 0.175, z + 0.175), 'post');
    }
  }
  // a watchtower beside each one you reach: the tower, its roof, the rock it stands on —
  // on whichever side is clear of everything else (and of the way on)
  for (const c of L.checks) {
    const [cx, cz] = c.dir;
    const clear = (x, z) => {
      const x0 = x - 3, x1 = x + 3, z0 = z - 3, z1 = z + 3;
      if (L.solids.some((s) => s.x1 > x0 && s.x0 < x1 && s.z1 > z0 && s.z0 < z1 && s.y1 > c.y - 17 && s.y0 < c.y + 3)) return false;
      if (L.route.some((n) => n.p[0] > x0 - 1 && n.p[0] < x1 + 1 && n.p[2] > z0 - 1 && n.p[2] < z1 + 1)) return false;
      return !L.movers.some((m) => { const p = m.path, mx = p.cx ?? p.x0 ?? p.px ?? p.ax, mz = p.cz ?? p.z0 ?? p.pz ?? p.az; return Math.hypot(mx - x, mz - z) < 7; });
    };
    const sides = [[c.x + cz * 6.6, c.z - cx * 6.6], [c.x - cz * 6.6, c.z + cx * 6.6]];
    const [x, z] = sides.find(([sx, sz]) => clear(sx, sz)) || sides[0];
    c.tower = { x, z };
    add(box(x - 1.8, x + 1.8, c.y - 11, c.y + 1, z - 1.8, z + 1.8), 'tower');
    add(box(x - 1.1, x + 1.1, c.y + 1, c.y + 1.85, z - 1.1, z + 1.1), 'tower', { roof: true });
    add(box(x - 1.3, x + 1.3, c.y - 14, c.y - 11, z - 1.3, z + 1.3), 'under', { tier: 1 });
    add(box(x - 0.7, x + 0.7, c.y - 16.5, c.y - 14, z - 0.7, z + 0.7), 'under', { tier: 2 });
  }
}

export const LEVELS = [
  course('Sunset Ramparts', 'ramparts', 'Floating ramparts: stairs, a plank, crumbling stones and a swinging lantern bridge.')
    .landing(6, 0, { spawn: true })
    .tag('TUG OF WALL', 4, 1.62, -0.6).walk(8)
    .stairs(6, 2.4)
    .gap(1.4, 0.6).walk(6)
    .landing(5, 1, { check: true })
    .plank(6)
    .gap(1.2, 0.3).walk(3)
    .stones(4)
    .landing(5, 1, { check: true })
    .barrels().stairs(7, 2.8)
    .walk(4)
    .lanterns(3)
    .landing(5, 1, { check: true })
    .tag('NEARLY', 3, -1.62, -0.6).stairs(6, 2.4)
    .gap(1.5, 0.8).walk(5)
    .landing(6, 0, { finish: true })
    .done(),
  course('Dragon Festival', 'festival', 'Firework launch pads, the parade dragon and a spinning prayer-wheel carousel, in the sky.', { hard: 1.15 })
    .landing(6, 0, { spawn: true })
    .tag('BOOM', 3, 1.62, -0.6).walk(6)
    .pad(5)
    .barrels().walk(7)
    .landing(5, 1, { check: true })
    .dragon(6)
    .landing(5, 1, { check: true })
    .carousel()
    .landing(5, -1, { check: true })
    .plank(5)
    .gap(1.3, 0.8).stairs(5, 2)
    .walk(3)
    .pad(5.4)
    .tag('HEAVE!', 2.5, 1.62, -0.6).walk(5)
    .landing(6, 0, { finish: true })
    .done(),
  course('Storm Peak', 'storm', 'Gusts on the switchbacks, a crumbling tower, a zip line and rope carts up to the gong.', { hard: 1.15 })
    .landing(6, 0, { spawn: true })
    .tag('WINDY!', 3, 1.62, -0.6).walk(4)
    .wind(1, 0).stairs(7, 2.8)
    .landing(5, 1)
    .wind(-1, 1.3).stairs(7, 2.8)
    .landing(5, 1, { check: true })
    .stones(4, 0.8)
    .landing(6, 0, { check: true })
    .zip(26, 5)
    .wind(-1, 0.6).walk(8)
    .landing(5, 1, { check: true })
    .carts(2)
    .landing(5, 1, { check: true })
    .barrels().stairs(7, 2.8)
    .gap(1.4, 0.6).stairs(6, 2.4)
    .walk(3)
    .gap(1.4, 0.6).stairs(5, 2)
    // (a quarter longer — user, Oct 15 2026: another watchtower, a gusty climb, more crumbling stones)
    .landing(5, -1, { check: true })
    .wind(1, 0.9).stairs(6, 2.4)
    .stones(3, 0.6)
    .landing(5, 1)
    .walk(4)
    .gap(1.3, 0.5).stairs(5, 2)
    .tag('BONG', 2, -1.62, -0.6).walk(4)
    .landing(6, 0, { finish: true })
    .done(),
  // (review, Oct 17 2026: a 4th stretch — at night, a bit of everything from the first three)
  course('Lantern Night', 'night', 'The Wall by lantern light: a bit of everything you have crossed, in the dark, up to the summit.', { hard: 1.15 })
    .landing(6, 0, { spawn: true })
    .tag('LAST ONE', 3, 1.62, -0.6).walk(6)
    .lanterns(3)
    .landing(5, 1, { check: true })
    .barrels().stairs(6, 2.4)
    .gap(1.3, 0.5).walk(4)
    .stones(4, 0.6)
    .landing(5, 1, { check: true })
    .walk(3)
    .pad(5)
    .walk(3)
    .landing(5, 0)
    .carts(2)
    .landing(5, -1, { check: true })
    .dragon(5)
    .landing(6, 0, { check: true })
    .zip(24, 4)
    .wind(-1, 0.5).walk(6)
    .landing(5, 1, { check: true })
    .carousel()
    .landing(5, -1)
    .stairs(6, 2.4)
    .gap(1.4, 0.6).walk(4)
    .tag('SUMMIT', 2, -1.62, -0.6).walk(3)
    .landing(6, 0, { finish: true })
    .done(),
];
