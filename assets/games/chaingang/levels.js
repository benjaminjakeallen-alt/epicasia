// Chain Gang Dynasty — the three stretches of the Great Wall. Pure data, read
// by the simulation (sim.js) and drawn by render3d.js. Metres, y up, x along
// the wall. A jump rises ~1.85 m and carries ~4 m on the flat; the chain
// between two travellers is 3.2 m.
//
//   solids    stone: {x0, x1, y0, y1}
//   crumbles  stones that give way 0.65 s after someone stands on them
//   movers    platforms on a path: 'swing' (a lantern), 'line', 'sine' (the dragon)
//   spinners  prayer-wheel platforms going round
//   bouncers  firework launch pads
//   rollers   where firecracker barrels start rolling
//   winds     gusts: force (m/s², negative pushes back), on/off seconds
//   zips      a zip line from (ax, ay) to (bx, by)
//   checks    watchtowers: once the whole gang is past one, falls restart there
//   decor     things that are only drawn

const floor = (x0, x1, y, extra) => ({ x0, x1, y0: y - 14, y1: y, ...extra });
const crumble = (x0, x1, y) => ({ x0, x1, y0: y - 0.6, y1: y });

export const LEVELS = [
  {
    key: 'ramparts',
    name: 'Sunset Ramparts',
    line: 'Crumbling battlements, swinging lanterns and barrels down the steps.',
    start: 0,
    finish: 104,
    fallY: -6,
    solids: [
      floor(-14, 18, 0),
      floor(18, 21, 1), floor(21, 24, 2), floor(24, 27, 3),
      floor(27, 40, 4),
      floor(50.3, 63, 4),
      floor(78, 90, 4),
      floor(90, 93, 5.2),
      floor(93, 118, 6.4),
    ],
    crumbles: [crumble(40.9, 42.4, 4), crumble(43.3, 44.8, 4), crumble(45.7, 47.2, 4), crumble(48.1, 49.6, 4)],
    movers: [0, 1, 2].map((k) => ({
      kind: 'lantern', w: 3.6, h: 0.35,
      path: { type: 'swing', px: 66.6 + 3.8 * k, py: 11, len: 6, amp: 0.3, period: 4.4, phase: k * 0.15 },
    })),
    spinners: [],
    bouncers: [],
    rollers: [
      { x: 33.5, y: 4.6, every: 5, speed: 4.5, dir: -1, first: 2.5 },
      { x: 116, y: 7, every: 6, speed: 4.5, dir: -1, first: 4 },
    ],
    winds: [],
    zips: [],
    checks: [35, 55, 82],
    decor: [
      { type: 'barrels', x: 33.5, y: 4 }, { type: 'tower', x: 35.5, y: 4 }, { type: 'tower', x: 55, y: 4 }, { type: 'tower', x: 82, y: 4 },
      { type: 'gate', x: 104, y: 6.4 },
      { type: 'tag', x: 8, y: 0, text: 'CHAIN GANG' }, { type: 'tag', x: 58, y: 4, text: 'HOLD ON!' }, { type: 'tag', x: 97, y: 6.4, text: 'NEARLY' },
    ],
  },
  {
    key: 'festival',
    name: 'Dragon Festival',
    line: 'Ride the parade dragon, launch off fireworks, hop the prayer wheels.',
    start: 0,
    finish: 102,
    fallY: -6,
    solids: [
      floor(-14, 12, 0),
      floor(16, 30, 4.2),
      floor(58, 66, 4.2),
      floor(80, 86, 4.2),
      floor(89, 116, 9.5),
    ],
    crumbles: [],
    movers: Array.from({ length: 8 }, (_, k) => ({
      kind: k === 0 ? 'dragonHead' : k === 7 ? 'dragonTail' : 'dragon', w: 2.4, h: 0.5,
      path: { type: 'sine', x0: 31.7 + 3.4 * k, y0: 4.2, ax: 0.4, ay: 1.0, period: 3.4, phase: -0.7 * k, lag: 1.2 },
    })),
    spinners: [
      { cx: 70, cy: 4.4, r: 2.4, n: 4, period: 7, w: 1.8 },
      { cx: 76, cy: 4.4, r: 2.4, n: 4, period: -7, w: 1.8 },
    ],
    bouncers: [{ x0: 12, x1: 16, y: 0, power: 17 }, { x0: 86, x1: 89, y: 4.2, power: 18 }],
    rollers: [],
    winds: [],
    zips: [],
    checks: [22, 61, 82],
    decor: [
      { type: 'tower', x: 22, y: 4.2 }, { type: 'tower', x: 61, y: 4.2 }, { type: 'tower', x: 82, y: 4.2 },
      { type: 'gate', x: 102, y: 9.5 },
      { type: 'tag', x: 5, y: 0, text: 'BOOM' }, { type: 'tag', x: 94, y: 9.5, text: 'DYNASTY' },
    ],
  },
  {
    key: 'storm',
    name: 'Storm Peak',
    line: 'Gusts on the switchbacks, a collapsing tower, a zip line and rope carts to the gong.',
    start: 0,
    finish: 126,
    fallY: -6,
    solids: [
      floor(-14, 10, 0),
      ...Array.from({ length: 6 }, (_, k) => floor(10 + 2.4 * k, 12.4 + 2.4 * k, 1.2 * (k + 1))),
      floor(24.4, 34, 7.2),
      floor(44.6, 54, 11),
      floor(80, 100, 5.5),
      floor(116, 140, 6.5),
    ],
    crumbles: [crumble(35, 36.5, 8.1), crumble(37.4, 38.9, 9), crumble(39.8, 41.3, 9.9), crumble(42.2, 43.7, 10.8)],
    movers: [
      { kind: 'cart', w: 3.2, h: 0.4, path: { type: 'line', ax: 102.3, ay: 5.8, bx: 105.3, by: 5.8, period: 4.6, phase: 0 } },
      { kind: 'cart', w: 3.2, h: 0.4, path: { type: 'line', ax: 110.3, ay: 6.2, bx: 113.3, by: 6.2, period: 4.6, phase: Math.PI } },
    ],
    spinners: [],
    bouncers: [],
    rollers: [{ x: 138, y: 7.1, every: 4.5, speed: 5, dir: -1, first: 1 }],
    winds: [
      { x0: 8, x1: 28, force: -45, on: 1.6, off: 2.6, phase: 0 },
      { x0: 84, x1: 94, force: -45, on: 1.4, off: 2.4, phase: 1 },
    ],
    zips: [{ ax: 51, ay: 13.6, bx: 81, by: 8.2 }],
    checks: [26, 48, 84, 118],
    decor: [
      { type: 'tower', x: 26, y: 7.2 }, { type: 'tower', x: 48, y: 11 }, { type: 'tower', x: 84, y: 5.5 }, { type: 'tower', x: 118, y: 6.5 },
      { type: 'gong', x: 128, y: 6.5 },
      { type: 'tag', x: 4, y: 0, text: 'WINDY!' }, { type: 'tag', x: 92, y: 5.5, text: 'ZIP IT' }, { type: 'tag', x: 122, y: 6.5, text: 'BONG' },
    ],
  },
];
