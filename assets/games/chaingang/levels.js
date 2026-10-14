// Chain Gang Dynasty — the three stretches of the Great Wall, in 3D. Pure
// data, read by the simulation (sim.js) and drawn by render3d.js. Metres,
// y up; "forward" starts out as −z. A jump rises ~1.8 m and carries ~4 m;
// the chain between two travellers is 5 m; steps up to 0.45 m are walked.
//
//   solids    stone: boxes {x0, x1, y0, y1, z0, z1}
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

const W = 3.4; // the walkway's width
const box = (xa, xb, y0, y1, za, zb, extra) => ({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0, y1, z0: Math.min(za, zb), z1: Math.max(za, zb), ...extra });
// a stretch of wall walkway along z (or x), its top at y; the wall goes down out of sight
const wallZ = (x, za, zb, y, w = W) => box(x - w / 2, x + w / 2, y - 40, y, za, zb, { wall: true });
const wallX = (z, xa, xb, y, w = W) => box(xa, xb, y - 40, y, z - w / 2, z + w / 2, { wall: true });
const stairsZ = (x, za, zb, ya, yb, n) => Array.from({ length: n }, (_, k) => wallZ(x, za + ((zb - za) * k) / n, za + ((zb - za) * (k + 1)) / n, ya + ((yb - ya) * (k + 1)) / n));
const stairsX = (z, xa, xb, ya, yb, n) => Array.from({ length: n }, (_, k) => wallX(z, xa + ((xb - xa) * k) / n, xa + ((xb - xa) * (k + 1)) / n, ya + ((yb - ya) * (k + 1)) / n));
const stone = (x, z, y, s = 1.8) => box(x - s / 2, x + s / 2, y - 0.7, y, z - s / 2, z + s / 2);
const pt = (x, y, z, dir = [0, -1]) => ({ x, y, z, dir });
const n = (x, y, z, f) => ({ p: [x, y, z], ...f });

export const LEVELS = [
  {
    key: 'ramparts',
    name: 'Sunset Ramparts',
    line: 'Barrels down the steps, crumbling stones and a swinging lantern bridge.',
    fallY: -6,
    spawn: pt(0, 0, 1.5),
    solids: [
      wallZ(0, 7, -20, 0),
      ...stairsZ(0, -20, -30, 0, 4, 10),
      wallZ(0, -30, -40, 4),
      wallZ(0, -49.4, -61.7, 4),
      wallX(-60, 1.7, 13, 4),
      wallX(-60, 25.6, 40, 4),
      ...stairsX(-60, 40, 46, 4, 6.4, 6),
      wallX(-60, 46, 62, 6.4),
    ],
    crumbles: [stone(-0.5, -41.2, 4, 1.6), stone(0.5, -43.4, 4, 1.6), stone(-0.5, -45.6, 4, 1.6), stone(0.5, -47.8, 4, 1.6)],
    movers: [0, 1, 2].map((k) => ({
      kind: 'lantern', w: 3.2, d: 3, h: 0.35,
      path: { type: 'swing', px: 15.2 + 4 * k, py: 11, pz: -60, len: 6, amp: 0.35, ux: 0, uz: 1, period: 4.4, phase: k * 0.15 },
    })),
    bouncers: [],
    rollers: [
      { x: 0, y: 4.5, z: -30.6, dx: 0, dz: 1, speed: 4.5, every: 5, first: 2.5 },
      { x: 61.5, y: 6.9, z: -60, dx: -1, dz: 0, speed: 4.5, every: 6, first: 4 },
    ],
    winds: [],
    zips: [],
    checks: [pt(0, 4, -36), pt(0, 4, -55), pt(30, 4, -60, [1, 0])],
    finish: pt(56, 6.4, -60, [1, 0]),
    route: [
      n(0, 0, -2), n(0, 0, -19), n(0, 4, -31), n(0, 4, -39.4),
      n(-0.5, 4, -41.2, { jump: true }), n(0.5, 4, -43.4, { jump: true }), n(-0.5, 4, -45.6, { jump: true }), n(0.5, 4, -47.8, { jump: true }),
      n(0, 4, -50.6, { jump: true }), n(0, 4, -60), n(12.2, 4, -60),
      n(15.2, 5, -60, { jump: true, near: 2 }), n(19.2, 5, -60, { jump: true, near: 2 }), n(23.2, 5, -60, { jump: true, near: 2 }),
      n(27, 4, -60, { jump: true }), n(39.5, 4, -60), n(46.5, 6.4, -60), n(56, 6.4, -60),
    ],
    decor: [
      { type: 'barrels', x: 0, y: 4, z: -31.5 }, { type: 'barrels', x: 61.5, y: 6.4, z: -61.3 },
      { type: 'tag', x: 1.72, y: -1.4, z: -6, nx: 1, nz: 0, text: 'CHAIN GANG' },
      { type: 'tag', x: -1.72, y: 2.6, z: -56, nx: -1, nz: 0, text: 'HOLD ON!' },
      { type: 'tag', x: 52, y: 5, z: -58.28, nx: 0, nz: 1, text: 'NEARLY' },
    ],
  },
  {
    key: 'festival',
    name: 'Dragon Festival',
    line: 'Firework launch pads, the parade dragon and a spinning prayer-wheel carousel.',
    fallY: -6,
    spawn: pt(0, 0, 1.5),
    solids: [
      wallZ(0, 7, -14, 0),
      wallZ(0, -17, -30, 4.4),
      wallZ(0, -57, -66, 4.4),
      wallZ(0, -76, -86, 4.4),
      wallZ(0, -89, -104, 9.8),
    ],
    crumbles: [],
    movers: [
      ...Array.from({ length: 8 }, (_, k) => ({
        kind: k === 7 ? 'dragonHead' : k === 0 ? 'dragonTail' : 'dragon', w: 2.6, d: 2.4, h: 0.5,
        path: { type: 'sine', x0: 0, y0: 4.4, z0: -31.6 - 3.3 * k, ax: 0.8, ay: 0.9, az: 0, period: 3.6, phase: -0.7 * k, lag: 1.2 },
      })),
      ...Array.from({ length: 4 }, (_, k) => ({
        kind: 'wheel', w: 2.4, d: 2.4, h: 0.35,
        path: { type: 'circle', cx: 0, cy: 4.4, cz: -71.2, r: 2.8, period: 11, phase: (k * Math.PI) / 2 },
      })),
    ],
    bouncers: [box(-1.7, 1.7, -0.5, 0, -14, -17, { power: 17 }), box(-1.7, 1.7, 3.9, 4.4, -86, -89, { power: 18 })],
    rollers: [{ x: 0, y: 4.9, z: -29.4, dx: 0, dz: 1, speed: 4, every: 5.5, first: 3 }],
    winds: [],
    zips: [],
    checks: [pt(0, 4.4, -24), pt(0, 4.4, -61), pt(0, 4.4, -81)],
    finish: pt(0, 9.8, -98),
    route: [
      n(0, 0, -2), n(0, 0, -15.5, { pad: true, near: 1.4 }), n(0, 4.4, -20), n(0, 4.4, -29.2),
      ...Array.from({ length: 8 }, (_, k) => n(0, 4.4, -31.6 - 3.3 * k, { jump: true, near: 1.8 })),
      n(0, 4.4, -58.5, { jump: true }), n(0, 4.4, -65.4),
      n(0, 4.4, -71.2, { jump: true, near: 3.4 }), n(0, 4.4, -77.4, { jump: true }),
      n(0, 4.4, -85), n(0, 4.4, -87.5, { pad: true, near: 1.4 }), n(0, 9.8, -92), n(0, 9.8, -98),
    ],
    decor: [
      { type: 'barrels', x: 0, y: 4.4, z: -30.2 },
      { type: 'tag', x: 1.72, y: -1.6, z: -5, nx: 1, nz: 0, text: 'BOOM' },
      { type: 'tag', x: 0, y: 1.4, z: -16.98, nx: 0, nz: 1, text: 'UP!' },
      { type: 'tag', x: -1.72, y: 7.5, z: -97, nx: -1, nz: 0, text: 'DYNASTY' },
    ],
  },
  {
    key: 'storm',
    name: 'Storm Peak',
    line: 'Gusts on the switchbacks, a collapsing tower, a zip line and rope carts to the gong.',
    fallY: -6,
    spawn: pt(0, 0, 1.5),
    solids: [
      wallZ(0, 7, -10, 0),
      ...stairsZ(0, -10, -17, 0, 3, 7),
      box(-1.7, 5.1, -37, 3, -17, -20.4, { wall: true }),
      ...stairsX(-18.7, 5.1, 12, 3, 6, 7),
      box(12, 15.4, -34, 6, -17, -22.1, { wall: true }),
      ...stairsZ(13.7, -22.1, -29.1, 6, 9, 7),
      wallZ(13.7, -29.1, -34.4, 9),
      wallZ(13.7, -43.6, -54, 13),
      wallZ(13.7, -80, -100, 7.6),
      wallZ(13.7, -116, -135, 8.6),
    ],
    crumbles: [stone(13.2, -35.4, 9.8, 1.6), stone(14.2, -37.6, 10.6, 1.6), stone(13.2, -39.8, 11.4, 1.6), stone(14.2, -42, 12.2, 1.6)],
    movers: [
      { kind: 'cart', w: 3, d: 3.2, h: 0.5, path: { type: 'line', ax: 13.7, ay: 7.8, az: -101.8, bx: 13.7, by: 7.8, bz: -105.4, period: 4.6, phase: 0 } },
      { kind: 'cart', w: 3, d: 3.2, h: 0.5, path: { type: 'line', ax: 13.7, ay: 8.2, az: -110, bx: 13.7, by: 8.2, bz: -113.6, period: 4.6, phase: Math.PI } },
    ],
    bouncers: [],
    rollers: [{ x: 13.7, y: 9.1, z: -134.4, dx: 0, dz: 1, speed: 5, every: 4.5, first: 1 }],
    winds: [
      { x0: 5, x1: 12, y0: 2, y1: 9, z0: -20.4, z1: -17, fx: 0, fz: 40, on: 1.6, off: 2.6, phase: 0 },
      { x0: 12, x1: 15.4, y0: 5, y1: 12, z0: -29.1, z1: -22.1, fx: 40, fz: 0, on: 1.6, off: 2.6, phase: 1.3 },
      { x0: 12, x1: 15.4, y0: 6, y1: 11, z0: -99, z1: -92, fx: -40, fz: 0, on: 1.4, off: 2.4, phase: 0.6 },
    ],
    zips: [{ a: [13.7, 15.8, -52.5], b: [13.7, 9.9, -84] }],
    checks: [pt(13.7, 9, -31.5), pt(13.7, 13, -49), pt(13.7, 7.6, -88), pt(13.7, 8.6, -120)],
    finish: pt(13.7, 8.6, -129),
    route: [
      n(0, 0, -2), n(0, 0, -9.5), n(0, 3, -17.6), n(1.5, 3, -18.7), n(5.2, 3, -18.7), n(12, 6, -18.7), n(13.7, 6, -19.6), n(13.7, 6, -22),
      n(13.7, 9, -29.4), n(13.7, 9, -33.9),
      n(13.2, 9.8, -35.4, { jump: true }), n(14.2, 10.6, -37.6, { jump: true }), n(13.2, 11.4, -39.8, { jump: true }), n(14.2, 12.2, -42, { jump: true }),
      n(13.7, 13, -45, { jump: true }), n(13.7, 13, -52.4),
      n(13.7, 7.6, -86, { near: 3 }), n(13.7, 7.6, -99.4),
      n(13.7, 7.8, -103.6, { jump: true, near: 2.2 }), n(13.7, 8.2, -111.8, { jump: true, near: 2.2 }), n(13.7, 8.6, -117, { jump: true }),
      n(13.7, 8.6, -129),
    ],
    decor: [
      { type: 'barrels', x: 13.7, y: 8.6, z: -135 },
      { type: 'tag', x: 1.72, y: -1.4, z: -4, nx: 1, nz: 0, text: 'WINDY!' },
      { type: 'tag', x: 15.42, y: 6, z: -89, nx: 1, nz: 0, text: 'ZIP IT' },
      { type: 'tag', x: 12, y: 7, z: -125, nx: -1, nz: 0, text: 'BONG' },
    ],
  },
];
