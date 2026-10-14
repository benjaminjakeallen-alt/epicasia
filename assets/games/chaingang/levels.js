// Chain Gang Dynasty — the three stretches, in 3D: a climb up into the sky,
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
//   decor     things that are only drawn

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // −z, +x, +z, −x; turning right goes round this list
const box = (xa, xb, y0, y1, za, zb, extra) => ({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0, y1, z0: Math.min(za, zb), z1: Math.max(za, zb), ...extra });

function course(name, key, line, opts = {}) {
  const L = { key, name, line, fallY: -30, solids: [], crumbles: [], movers: [], bouncers: [], rollers: [], winds: [], zips: [], checks: [], route: [], decor: [] };
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
  function takeBarrels(len) {
    if (!c.barrels) return;
    const [x, z] = at(len - 0.6), [fx, fz] = f();
    L.rollers.push({ x, y: c.y + 0.5, z, dx: -fx, dz: -fz, speed: 4.5, every: 5.5, first: 2.5 });
    L.decor.push({ type: 'barrels', x: x + fx * 0.9, y: c.y, z: z + fz * 0.9, rot: c.h });
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
      takeWind(len, 3.2); takeBarrels(len);
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
    gap(len, dy = 0) { const [x, z] = at(len); c.x = x; c.z = z; c.y += dy; c.jump = true; return api; },
    /** A square floating rock island; turns right (+1), left (−1) or not (0). */
    landing(size, turn = 0, o = {}) {
      takeWind(size, size);
      const [cx, cz] = at(size / 2);
      L.solids.push(box(cx - size / 2, cx + size / 2, c.y - 6, c.y, cz - size / 2, cz + size / 2, { kind: 'rock' }));
      if (o.spawn) L.spawn = { x: cx, y: c.y, z: cz, dir: f() };
      L.route.push({ p: [cx, c.y, cz], near: 1.6, ...(c.jump ? { jump: true } : {}) });
      L.decor.push({ type: 'trees', x: cx, y: c.y, z: cz, size, seed: L.solids.length });
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
        L.movers.push({ kind: 'lantern', w: Math.abs(f()[0]) ? 3.2 : 3, d: Math.abs(f()[0]) ? 3 : 3.2, h: 0.35,
          path: { type: 'swing', px: x, py: c.y + 7, pz: z, len: 6, amp: 0.35, ux: sx, uz: sz, period: 4.4, phase: k * 0.15 } });
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
        L.movers.push({ kind: k === n - 1 ? 'dragonHead' : k === 0 ? 'dragonTail' : 'dragon', w: along ? 2.4 : 2.6, d: along ? 2.6 : 2.4, h: 0.5, dir: c.h,
          path: { type: 'sine', x0: x, y0: c.y, z0: z, ax: sx * 0.8, ay: 0.9, az: sz * 0.8, period: 3.6, phase: -0.7 * k, lag: 1.2 } });
        L.route.push({ p: [x, c.y, z], jump: true, near: 1.8 });
      }
      const [x, z] = at(0.4 + 3.3 * n - 0.9 + 1.1); c.x = x; c.z = z; c.jump = true;
      return api;
    },
    /** The prayer-wheel carousel: four platforms going round a drum. */
    carousel(r = 2.8) {
      const [cx, cz] = at(1.2 + 1.2 + r);
      for (let k = 0; k < 4; k++) L.movers.push({ kind: 'wheel', w: 2.4, d: 2.4, h: 0.35, path: { type: 'circle', cx, cy: c.y, cz, r, period: 11, phase: (k * Math.PI) / 2 } });
      L.route.push({ p: [cx, c.y, cz], jump: true, near: r + 0.6 });
      const [x, z] = at(1.2 + 1.2 + 2 * r + 1.2 + 0.8); c.x = x; c.z = z; c.jump = true;
      return api;
    },
    /** Rope carts shuttling across a gap. */
    carts(n) {
      const [fx] = f();
      for (let k = 0; k < n; k++) {
        const [ax, az] = at(0.2 + 1.6 + 8.2 * k), [bx, bz] = at(0.2 + 1.6 + 3.6 + 8.2 * k), y = c.y + 0.2 + 0.3 * k;
        L.movers.push({ kind: 'cart', w: fx ? 3.2 : 3, d: fx ? 3 : 3.2, h: 0.5, path: { type: 'line', ax, ay: y, az, bx, by: y, bz, period: 4.6, phase: k % 2 ? Math.PI : 0 } });
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
      return L;
    },
  };
  return api;
}

export const LEVELS = [
  course('Sunset Ramparts', 'ramparts', 'Floating ramparts: stairs, a plank, crumbling stones and a swinging lantern bridge.')
    .landing(6, 0, { spawn: true })
    .tag('CHAIN GANG', 4, 1.62, -0.6).walk(8)
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
  course('Dragon Festival', 'festival', 'Firework launch pads, the parade dragon and a spinning prayer-wheel carousel, in the sky.')
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
    .tag('DYNASTY', 2.5, 1.62, -0.6).walk(5)
    .landing(6, 0, { finish: true })
    .done(),
  course('Storm Peak', 'storm', 'Gusts on the switchbacks, a crumbling tower, a zip line and rope carts up to the gong.')
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
    .tag('BONG', 2, -1.62, -0.6).walk(4)
    .landing(6, 0, { finish: true })
    .done(),
];
