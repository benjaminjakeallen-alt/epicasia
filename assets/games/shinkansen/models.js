// Voxel art for Shinkansen Dash, in metres (the track runs along -z). The
// travellers themselves are Godzilla Rampage's models (../rampage/models.js).
// Every builder returns a mesh/group with its origin where the game places
// it: train pieces at their rear end on the rails, roof things on the roof,
// scenery at ground level.
import * as THREE from 'three';
import { VoxBuilder, hash3 } from '../rampage/voxel.js';
import { mesh, shade } from '../rampage/models.js';

export const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
const V = 0.2; // train voxel size

const T = {
  body: 0xf4f6f8, skirt: 0xc9ced6, roof: 0xdde2e8, stripe: 0x1f4fb5, stripe2: 0x5b8def,
  window: 0x23303d, frame: 0xe6eaee, door: 0xb9c0c9, gang: 0x3a3f47, light: 0xfff4c2, tail: 0xff3b3b
};

// Cross-section of a car (x across, y up, both in voxels): 15 wide, 14 tall,
// the roof rounded off at the top corners.
function section(x, y, w, h) {
  const cx = Math.abs(x - (w - 1) / 2), hw = (w - 1) / 2;
  if (y >= h - 1) return cx <= hw - 2.5;
  if (y >= h - 2) return cx <= hw - 1;
  if (y === 0) return cx <= hw - 1;
  return true;
}
function skin(x, y, z, h, len, opts) {
  // y rows: 0-1 skirt, 2-3 stripes, 4-5 body, 6-8 windows, 9-11 body, 12-13 roof
  const front = x === 0 || x === 14;
  // Roof: light-grey panels with seams every 2 m, a darker anti-slip
  // walkway down the middle, and rain gutters along the shoulders — so the
  // roofs you run on have depth instead of reading as flat white.
  if (y === h - 1) {
    const cx = Math.abs(x - 7), seam = z % 10 === 0 ? 0.86 : 1;
    if (cx <= 2) return shade(z % 3 === 0 ? 0xa3acb6 : 0xb4bcc5, seam);
    return shade(0xcbd2d9, seam);
  }
  if (y === h - 2) {
    if (x === 1 || x === 13) return 0x8e98a3; // gutters
    return shade(0xd6dce2, z % 10 === 0 ? 0.88 : 1);
  }
  if (y <= 1) return T.skirt;
  if (y === h - 3 && front) return T.stripe2; // a pinstripe under the roofline
  if (!front) return T.body;
  if (y === 2) return T.stripe;
  if (y === 3) return T.stripe2;
  if (opts.windows && y >= 6 && y <= 8) {
    const zz = z % 10;
    if (opts.door && (z % len) > 6 && (z % len) < 12) return y === 8 ? T.door : T.door;
    return zz === 0 ? T.frame : T.window;
  }
  return T.body;
}

/**
 * One car, CAR m long: rear end at z = 0, front at z = -len. `warn` paints
 * yellow-and-black hazard stripes across the front of the roof — the last
 * car before the train ends, so you see it coming.
 */
export function makeCar(len, warn) {
  const n = Math.round(len / V), b = new VoxBuilder();
  b.add(15, 14, n, (x, y, z) => {
    if (!section(x, y, 15, 14)) return null;
    if (warn && y >= 12 && z >= 2 && z < 30) return Math.floor((x + z) / 3) % 2 ? 0xffc824 : 0x22252b;
    if (z < 2) return Math.abs(x - 7) <= 5 && y >= 1 && y <= 11 ? T.gang : null; // the gangway between cars
    if (y >= 12 && z % 25 === 12 && Math.abs(x - 7) <= 4) return 0x9aa3ad; // roof ribs
    return skin(x, y, z, 14, n, { windows: true, door: z < 14 || z > n - 14 });
  }, { size: V, offset: [-1.5, 0.6, -len] });
  return mesh(b.geometry());
}

/**
 * A train's nose, NOSE m long: joins the train at z = 0 and slopes down to
 * the tip at z = -len — the long Shinkansen "duck bill". roof(t) gives the
 * top surface height (t 0 → 1), shared with the game so you run down it.
 */
export function makeNose(len, roof) {
  const n = Math.round(len / V), b = new VoxBuilder(), glow = new VoxBuilder();
  b.add(15, 14, n, (x, y, z) => {
    const t = z / (n - 1), top = roof(t), wy = 0.6 + (y + 1) * V;
    const half = 7 * (1 - 0.45 * Math.pow(t, 2.2));
    const cx = Math.abs(x - 7);
    if (cx > half + 0.3) return null;
    if (wy > top + 0.1) return null;
    if (y === 0 && cx > half - 1) return null;
    // round off the top edges as it narrows
    if (wy > top - 0.25 && cx > half - 1.6) return null;
    if (t > 0.42 && t < 0.62 && wy > top - 0.55 && cx < half - 1) return T.window; // the cab windscreen
    if (y === 2 && (cx > half - 1.2)) return T.stripe;
    if (y === 3 && (cx > half - 1.2)) return T.stripe2;
    if (y <= 1) return T.skirt;
    return wy > top - 0.3 ? T.roof : T.body;
  }, { size: V, offset: [-1.5, 0.6, -len] });
  // headlights near the tip
  glow.add(15, 3, 1, (x, y) => (y === 1 && (x === 4 || x === 10) ? T.light : null), { size: V, offset: [-1.5, 0.6 + 2 * V, -len * 0.93] });
  const g = new THREE.Group();
  g.add(mesh(b.geometry()), new THREE.Mesh(glow.geometry(), GLOW));
  return g;
}

// ---- on the roofs --------------------------------------------------------------------
/** A roof fairing (air-con hump): jump it. */
export function makeHump() {
  const b = new VoxBuilder();
  b.add(9, 4, 11, (x, y, z) => {
    const cx = Math.abs(x - 4), cz = Math.abs(z - 5);
    if (y >= 3 && (cx > 2 || cz > 3)) return null;
    if (y === 2 && (cx > 3 || cz > 4)) return null;
    if (y === 1 && z % 2 === 0 && cx === 4) return 0x5c6670; // grille
    return y === 3 ? 0xb8c1cb : 0x8f9aa6;
  }, { size: 0.2, offset: [-0.9, 0, -1.1] });
  return mesh(b.geometry());
}
/** A pantograph: too tall to jump — hop to another train. */
export function makePanto() {
  const b = new VoxBuilder();
  b.add(9, 4, 9, (x, y) => (y < 2 ? 0x50575f : (x === 1 || x === 7) && y >= 2 ? 0xff922b : null), { size: 0.2, offset: [-0.9, 0, -0.9] }); // base + insulators
  // the diamond frame
  b.add(11, 22, 3, (x, y, z) => {
    if (z !== 1) return null;
    const k = y / 21, w = 5 * (1 - Math.abs(k - 0.5) * 2) + 0.2;
    return Math.abs(Math.abs(x - 5) - w) < 0.7 ? 0x3d434a : null;
  }, { size: 0.12, offset: [-0.66, 0.8, -0.18] });
  // the collector head across the top
  b.add(16, 2, 2, (x, y) => (y === 1 || x === 0 || x === 15 ? 0x2b3036 : 0x868e96), { size: 0.15, offset: [-1.2, 2.45, -0.15] });
  return mesh(b.geometry());
}
/** Jake's skateboard: a manhole cover on four yellow wheels (origin under its middle, on the roof). */
export function makeBoard() {
  const b = new VoxBuilder();
  b.add(15, 1, 15, (x, y, z) => {
    const r = Math.hypot(x - 7, z - 7);
    if (r > 7.2) return null;
    if (r > 6.2) return 0x3e4349; // the rim
    return (x + z) % 3 === 0 || (x - z + 15) % 3 === 0 ? 0x5b6168 : 0x4a4f56; // cast cross-hatch
  }, { size: 0.065, offset: [-0.49, 0.1, -0.49] });
  [[-0.28, -0.3], [0.28, -0.3], [-0.28, 0.3], [0.28, 0.3]].forEach(([wx, wz]) => b.add(2, 2, 2, () => 0xffd43b, { size: 0.06, offset: [wx - 0.06, 0, wz - 0.06] }));
  return mesh(b.geometry());
}
/** Liam's ninja star: four steel blades round a hole, lying flat (it spins about y). */
export function makeShuriken() {
  const b = new VoxBuilder();
  b.add(7, 1, 7, (x, y, z) => {
    const cx = x - 3, cz = z - 3, ax = Math.abs(cx), az = Math.abs(cz);
    if (ax === 0 && az === 0) return null; // the hole
    if (ax <= 1 && az <= 1) return 0x495057;
    // a blade along each axis, swept to one side so it reads as spinning
    if ((az === 0 && ax <= 3) || (ax === 0 && az <= 3)) return 0xdee2e6;
    if ((cz === 1 && cx >= 2) || (cz === -1 && cx <= -2) || (cx === -1 && cz >= 2) || (cx === 1 && cz <= -2)) return 0xadb5bd;
    return null;
  }, { size: 0.065, offset: [-0.2275, -0.0325, -0.2275] });
  return mesh(b.geometry());
}
/** A crow flapping at head height: slide under it. userData.wings flap. */
export function makeCrow() {
  const g = new THREE.Group(), b = new VoxBuilder();
  b.add(5, 4, 8, (x, y, z) => {
    const cx = Math.abs(x - 2);
    if (z < 2) return cx < 1 && y >= 1 && y <= 2 ? 0x1b1d22 : null; // tail
    if (z >= 7) return cx === 0 && y === 2 ? 0xe8a33d : null; // beak
    if (z >= 5 && y === 3 && cx === 1) return 0xffffff; // eyes
    if (cx > 1 + (z > 2 && z < 6 ? 0.5 : 0)) return null;
    return hash3(x, y, z) < 0.2 ? 0x2c313a : 0x15171c;
  }, { size: 0.13, offset: [-0.33, -0.26, -0.52] });
  g.add(mesh(b.geometry()));
  const wing = () => {
    const w = new VoxBuilder();
    w.add(6, 1, 4, (x, y, z) => (z > 3 - x * 0.5 ? null : 0x1b1d22), { size: 0.13, offset: [0, 0, -0.26] });
    return mesh(w.geometry());
  };
  const wl = wing(), wr = wing();
  wr.rotation.y = Math.PI; // mirror
  wl.position.set(0.13, 0.1, 0); wr.position.set(-0.13, 0.1, 0);
  const pl = new THREE.Group(), pr = new THREE.Group();
  pl.add(wl); pr.add(wr);
  g.add(pl, pr);
  g.userData.wings = [pl, pr];
  g.rotation.y = 0; // beak toward +z (toward the runner)
  return g;
}
/** A signal gantry over all three trains; the bar is lo..hi above the roofs. */
export function makeGantry(roof, lo, hi, span) {
  const g = new THREE.Group(), b = new VoxBuilder(), glow = new VoxBuilder();
  const steel = (x, y, z) => ((x + y + z) % 3 === 0 ? 0x5f6b78 : 0x77838f);
  [-span, span].forEach((x) => b.add(2, Math.round((roof + hi) / 0.25), 2, steel, { size: 0.25, offset: [x - 0.25, 0, -0.25] }));
  const n = Math.round((span * 2 + 0.5) / 0.25), rows = Math.round((hi - lo) / 0.25);
  b.add(n, rows, 2, (x, y) => (y === 0 || y === rows - 1 || x % 4 === 0 || (x + y) % 4 === 0 ? steel(x, y, 0) : null), { size: 0.25, offset: [-span - 0.25, roof + lo, -0.3] });
  // signal heads
  [-3.4, 0, 3.4].forEach((x) => {
    b.add(3, 4, 2, () => 0x1b1d22, { size: 0.2, offset: [x - 0.3, roof + hi, -0.2] });
    glow.add(1, 2, 1, (xx, y) => (y === 0 ? 0x51ff8a : 0xff4040), { size: 0.18, offset: [x - 0.09, roof + hi + 0.15, 0.2] });
  });
  g.add(mesh(b.geometry()), new THREE.Mesh(glow.geometry(), GLOW));
  return g;
}
/** An onigiri (rice ball) — a coin. */
export function makeOnigiri() {
  const b = new VoxBuilder();
  b.add(9, 9, 4, (x, y) => {
    const half = 4 * (1 - y / 9) + 0.6;
    if (Math.abs(x - 4) > half) return null;
    if (y <= 3 && Math.abs(x - 4) <= 2.5) return y === 3 && x % 2 ? 0x1f3d2b : 0x14281c; // nori
    return hash3(x, y, 1) < 0.2 ? 0xf1ece0 : 0xffffff;
  }, { size: 0.09, offset: [-0.4, 0, -0.18] });
  return mesh(b.geometry());
}
/** A lucky cat (maneki-neko) waving: saves you from one crash. */
export function makeNeko() {
  const b = new VoxBuilder();
  b.add(9, 13, 7, (x, y, z) => {
    const cx = Math.abs(x - 4), cz = Math.abs(z - 3);
    if (y < 6) { // body
      if (cx > 3 || cz > 2.5) return null;
      if (z === 6 && y === 4 && cx < 2) return 0xffd43b; // bell
      return y === 5 && z >= 5 ? 0xe03131 : 0xffffff; // collar
    }
    if (y < 11) { // head
      if (cx > 3.5 || cz > 2.5) return null;
      if (z === 6 && y === 8 && cx === 2) return 0x1b1d22; // eyes
      if (z === 6 && y === 7 && cx === 0) return 0xff8787;
      return x === 7 && y > 8 ? 0xffa94d : 0xffffff;
    }
    if (y < 13 && cx >= 2 && cx <= 3 && cz < 1.5) return cx === 2 ? 0xff8787 : 0xffffff; // ears
    return null;
  }, { size: 0.08, offset: [-0.36, 0, -0.28] });
  b.add(2, 5, 2, (x, y) => (y >= 3 ? 0xffffff : 0xffffff), { size: 0.08, offset: [0.24, 0.52, -0.08] }); // the raised paw
  return mesh(b.geometry());
}

/** A boba tea: milk tea in a clear cup, black pearls, a dome lid and a fat straw. Unlocks Nicole. */
export function makeBoba() {
  const b = new VoxBuilder();
  b.add(9, 12, 9, (x, y, z) => {
    const r = Math.hypot(x - 4, z - 4), rim = 3.4 + y * 0.07;
    if (y <= 9) { // the cup
      if (r > rim) return null;
      if (r > rim - 1) { // its clear wall: tea showing through, a printed band
        if (y >= 5 && y <= 6) return 0xff8cc6;
        return y <= 2 ? 0x3a2418 : y === 9 ? 0xf4ead8 : 0xd9b48a;
      }
      return y <= 2 ? (hash3(x, y, z) < 0.6 ? 0x24150d : 0x3a2418) : 0xc89b6d; // pearls, then milk tea
    }
    if (r <= rim - (y - 9) * 1.3) return 0xf4f7fb; // dome lid
    return null;
  }, { size: 0.065, offset: [-0.29, 0, -0.29] });
  b.add(2, 7, 2, (x, y) => (y === 6 ? 0x2b8a6e : 0x3cc6a0), { size: 0.065, offset: [0.0, 0.7, -0.03] }); // the straw
  return mesh(b.geometry());
}

/** A spring on a little base plate: one double jump. */
export function makeSpring() {
  const b = new VoxBuilder();
  b.add(9, 1, 9, (x, y, z) => (Math.hypot(x - 4, z - 4) <= 4.2 ? 0x2b8a3e : null), { size: 0.08, offset: [-0.36, 0, -0.36] }); // base
  b.add(9, 9, 9, (x, y, z) => { // the coil: a ring every other layer
    const r = Math.hypot(x - 4, z - 4);
    if (y % 2 === 0) return r <= 3.9 && r >= 2.6 ? (y % 4 ? 0xdee2e6 : 0xadb5bd) : null;
    const a = Math.atan2(z - 4, x - 4); // a riser joining each ring to the next
    return r <= 3.9 && r >= 2.6 && Math.abs(a - (y % 4 === 1 ? 0.6 : -2.5)) < 0.45 ? 0xced4da : null;
  }, { size: 0.08, offset: [-0.36, 0.08, -0.36] });
  b.add(9, 1, 9, (x, y, z) => (Math.hypot(x - 4, z - 4) <= 4.2 ? (Math.hypot(x - 4, z - 4) < 1.5 ? 0xffffff : 0x51cf66) : null), { size: 0.08, offset: [-0.36, 0.8, -0.36] }); // the pad
  return mesh(b.geometry());
}
/** A golden electric guitar, standing up and glowing a little: unlocks Miles. */
export function makeGuitar() {
  const b = new VoxBuilder(), glow = new VoxBuilder();
  const GOLD = 0xf2c230, DARK = 0xc8961a;
  b.add(9, 11, 3, (x, y, z) => { // the body: two rounded bouts and a waist
    const cx = x - 4, wide = y < 5 ? 4.4 - Math.abs(y - 2) * 0.35 : y < 7 ? 3.1 : 3.6 - Math.abs(y - 8.5) * 0.45;
    if (Math.abs(cx) > wide) return null;
    if (z === 2 && y >= 2 && y <= 3 && Math.abs(cx) <= 2) return 0x2b2b2b; // bridge pickup
    if (z === 2 && y === 6 && Math.abs(cx) <= 1.5) return 0x2b2b2b; // neck pickup
    if (z === 2 && x === 6 && y === 1) return 0xfff3bf; // a knob
    return z === 0 || Math.abs(cx) > wide - 1 ? DARK : GOLD;
  }, { size: 0.07, offset: [-0.315, 0, -0.105] });
  b.add(2, 12, 2, (x, y) => (y % 3 === 0 ? 0xfff3bf : 0x8a5a1a), { size: 0.07, offset: [-0.07, 0.77, -0.07] }); // neck with frets
  b.add(3, 4, 2, (x, y) => (x !== 1 && y % 2 === 0 ? 0xfff3bf : GOLD), { size: 0.07, offset: [-0.105, 1.61, -0.07] }); // head + tuners
  glow.add(1, 1, 1, () => 0xfff3bf, { size: 0.9, offset: [-0.45, 0.3, -0.6] }); // a soft glow plate behind it
  const g = new THREE.Group();
  const glowMesh = new THREE.Mesh(glow.geometry(), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.35, fog: false }));
  g.add(mesh(b.geometry()), glowMesh);
  return g;
}

/** An open manhole on the track bed: an iron rim round a dark hole with a faint green glow down inside, and its cover tipped up beside it. */
export function makeManhole() {
  const b = new VoxBuilder(), glow = new VoxBuilder();
  const R = 7.5;
  b.add(17, 2, 17, (x, y, z) => {
    const r = Math.hypot(x - 8, z - 8);
    if (r > R + 0.6) return null;
    if (r > R - 1.6) return y === 1 ? (hash3(x, y, z) < 0.3 ? 0x6c737b : 0x4f565e) : 0x3a3f45; // the rim
    return y === 0 ? 0x050608 : null; // the hole
  }, { size: 0.15, offset: [-1.275, 0.02, -1.275] });
  glow.add(17, 1, 17, (x, y, z) => { const r = Math.hypot(x - 8, z - 8); return r > R - 2.6 && r <= R - 1.6 && (x + z) % 2 ? 0x2f9e44 : null; }, { size: 0.15, offset: [-1.275, 0.08, -1.275] });
  const lid = new VoxBuilder(); // the cover, leaning on its edge
  lid.add(15, 15, 1, (x, y) => { const r = Math.hypot(x - 7, y - 7); return r > 7.2 ? null : (x % 3 === 0 || y % 3 === 0) && r < 6 ? 0x5f666e : 0x464c53; }, { size: 0.15, offset: [-1.125, 0, 0] });
  const g = new THREE.Group();
  g.add(mesh(b.geometry()), new THREE.Mesh(glow.geometry(), GLOW));
  const lidMesh = mesh(lid.geometry());
  lidMesh.position.set(1.55, 0, 0.6); lidMesh.rotation.set(-0.25, 1.2, 0.35);
  g.add(lidMesh);
  // a faint green steam rising out of it, so you can spot it over a train's nose
  const steam = new VoxBuilder();
  for (let i = 0; i < 22; i++) { // up past the train roofs (3.4 m), spreading as it rises
    const h = 0.3 + i * 0.21, a = i * 2.4, r = 0.2 + (i % 4) * 0.1 + i * 0.03;
    steam.add(1, 1, 1, () => (i % 3 ? 0x8ce99a : 0xd3f9d8), { size: 0.24 + (i % 3) * 0.08, offset: [Math.cos(a) * r, h, Math.sin(a) * r] });
  }
  const steamMesh = new THREE.Mesh(steam.geometry(), GLOW);
  g.add(steamMesh);
  g.userData.steam = steamMesh;
  return g;
}

// ---- along the line --------------------------------------------------------------------
/** A ring of tunnel lining (concrete arch over all three tracks). */
export function makeTunnelRing(len, roof) {
  const b = new VoxBuilder(), glow = new VoxBuilder();
  const W = 7.8, Hh = roof + 4.6;
  b.add(Math.round((W * 2) / 0.5) + 2, Math.round(Hh / 0.5) + 2, Math.round(len / 0.5), (x, y, z) => {
    const wx = -W - 0.5 + x * 0.5, wy = y * 0.5;
    const r = Math.hypot(wx / W, Math.max(0, wy - 2) / (Hh - 2));
    if (r < 1 || r > 1.12) return null;
    return z === 0 ? 0x4a4f57 : (hash3(x, y, z) < 0.3 ? 0x5c626b : 0x666c75);
  }, { size: 0.5, offset: [-W - 0.5, 0, -len] });
  glow.add(1, 1, Math.round(len / 0.5), (x, y, z) => (z % 6 < 3 ? 0xffe8a3 : null), { size: 0.5, offset: [-W + 0.6, Hh - 1.8, -len] });
  glow.add(1, 1, Math.round(len / 0.5), (x, y, z) => (z % 6 < 3 ? 0xffe8a3 : null), { size: 0.5, offset: [W - 1.1, Hh - 1.8, -len] });
  const g = new THREE.Group();
  g.add(mesh(b.geometry()), new THREE.Mesh(glow.geometry(), GLOW));
  return g;
}
/** A tunnel mouth (portal facade with grass on top). */
export function makePortal(roof) {
  const b = new VoxBuilder();
  const W = 7.8, Hh = roof + 4.6;
  b.add(48, 26, 3, (x, y, z) => {
    const wx = -12 + x * 0.5, wy = y * 0.5;
    if (Math.hypot(wx / W, Math.max(0, wy - 2) / (Hh - 2)) < 1) return null;
    if (y >= 23) return z === 2 || hash3(x, y, z) < 0.6 ? 0x5fa35a : 0x4b8a47;
    return (x + y) % 5 === 0 ? 0x7d838c : 0x9aa0a8;
  }, { size: 0.5, offset: [-12, 0, -1.5] });
  return mesh(b.geometry());
}

// ---- scenery (per stage) ---------------------------------------------------------------------
function rng(seed) { let a = seed * 9301 + 49297; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; }

export function makeBuilding(seed) {
  const r = rng(seed), w = 3 + Math.floor(r() * 4), d = 3 + Math.floor(r() * 4), h = 6 + Math.floor(r() * 22);
  const pal = [0xc9d6e3, 0xe6d5c3, 0xb7c4cf, 0xf1e6d8, 0x9fb3c8, 0xd8c8e8, 0xcfd8dc];
  const col = pal[Math.floor(r() * pal.length)], glass = r() < 0.4;
  const b = new VoxBuilder(), glow = new VoxBuilder();
  b.add(w, h, d, (x, y, z) => {
    if (y === h - 1) return x === 0 || z === 0 || x === w - 1 || z === d - 1 ? shade(col, 0.8) : 0x9aa3ad;
    if (glass) return (x + y) % 2 ? 0x7fa6c9 : 0x9cc0dd;
    return y % 2 && (x === 0 || x === w - 1 || z === 0 || z === d - 1) && (x + z) % 2 ? 0x8fb1cf : col;
  }, { size: 1.6, offset: [-(w * 1.6) / 2, 0, -(d * 1.6) / 2] });
  if (r() < 0.35) { // a neon sign on the side facing the line
    const neon = [0xff4fd8, 0x4dd8ff, 0xffe066, 0xff6b6b][Math.floor(r() * 4)];
    glow.add(1, 3, 2, () => neon, { size: 0.8, offset: [0, h * 1.6 * 0.6, -0.8] });
  }
  const g = new THREE.Group();
  g.add(mesh(b.geometry()));
  if (glow.pos.length) g.add(new THREE.Mesh(glow.geometry(), GLOW));
  g.userData.side = (w * 1.6) / 2;
  return g;
}
export function makeTree(seed, leaf, trunk = 0x7a5232) {
  const r = rng(seed), s = 0.55 + r() * 0.3, b = new VoxBuilder();
  b.add(7, 11, 7, (x, y, z) => {
    const cx = x - 3, cz = z - 3;
    if (y < 4) return Math.abs(cx) <= 0 && Math.abs(cz) <= 0 ? trunk : null;
    const rr = 3.2 - Math.abs(y - 7) * 0.5;
    if (cx * cx + cz * cz > rr * rr + (hash3(x, y, z + seed) - 0.5) * 2) return null;
    return hash3(x, y, z) < 0.25 ? shade(leaf, 0.85) : hash3(z, x, y) < 0.15 ? shade(leaf, 1.15) : leaf;
  }, { size: s, offset: [-3.5 * s, 0, -3.5 * s] });
  return mesh(b.geometry());
}
export function makePaddy(seed) {
  const r = rng(seed), b = new VoxBuilder();
  const water = r() < 0.4;
  b.add(10, 2, 10, (x, y, z) => {
    if (x === 0 || z === 0) return y === 0 ? 0x8a7a55 : null; // the bund
    if (y === 1) return water ? null : (x + z) % 2 ? 0x7cc35a : 0x6db34d;
    return water ? 0x9fc9d9 : 0x5c8f3d;
  }, { size: 1.2, offset: [-6, -1.1, -6] });
  return mesh(b.geometry());
}
export function makeFarmhouse(seed) {
  const r = rng(seed), b = new VoxBuilder();
  b.add(9, 8, 7, (x, y, z) => {
    if (y < 3) return x % 4 === 0 ? 0x5a3e2b : 0xe8dcc4;
    const half = 4.5 - (y - 3) * 0.95;
    if (Math.abs(x - 4) > half + 0.5) return null;
    return hash3(x, y, z) < 0.3 ? 0x8a6d3b : 0xa98a52; // thatch
  }, { size: 0.9, offset: [-4, 0, -3] });
  if (r() < 0.5) b.add(1, 3, 1, () => 0x6c757d, { size: 0.9, offset: [5, 0, 1] });
  return mesh(b.geometry());
}
export function makeTeaRow(len) {
  const b = new VoxBuilder();
  b.add(3, 2, Math.round(len / 0.7), (x, y, z) => {
    if (y === 1 && (x === 0 || x === 2)) return null;
    return hash3(x, y, z) < 0.3 ? 0x3f8f3a : 0x4da846;
  }, { size: 0.7, offset: [-1, 0, -len] });
  return mesh(b.geometry());
}
export function makePagoda() {
  const b = new VoxBuilder();
  for (let i = 0; i < 5; i++) {
    const w = 9 - i * 1.2, y0 = i * 3.2;
    b.add(Math.round(w), 2, Math.round(w), (x, y) => (y === 0 ? 0xb03a2e : 0x2f3640), { size: 1, offset: [-w / 2, y0 + 1.6, -w / 2] }); // roof
    b.add(Math.round(w - 3), 2, Math.round(w - 3), () => 0x7a3b2e, { size: 1, offset: [-(w - 3) / 2, y0, -(w - 3) / 2] }); // walls
  }
  b.add(1, 5, 1, () => 0xd4a72c, { size: 0.6, offset: [-0.3, 16.6, -0.3] }); // the spire
  return mesh(b.geometry());
}
export function makeTorii() {
  const b = new VoxBuilder();
  const red = 0xe03b2a;
  b.add(1, 9, 1, () => red, { size: 0.6, offset: [-2.4, 0, -0.3] });
  b.add(1, 9, 1, () => red, { size: 0.6, offset: [1.8, 0, -0.3] });
  b.add(12, 1, 1, () => 0x1b1d22, { size: 0.6, offset: [-3.6, 5.4, -0.3] });
  b.add(10, 1, 1, () => red, { size: 0.6, offset: [-3, 4.2, -0.3] });
  return mesh(b.geometry());
}
/** Far-away backdrop per stage: a ring of hills (and Mount Fuji). */
export function makeBackdrop(kind) {
  const b = new VoxBuilder();
  const col = { tokyo: 0x9fb2c6, country: 0x7fae7a, fuji: 0x8aa6c4, tea: 0x6fa46a, kyoto: 0x8b7aa8 }[kind];
  b.add(140, 14, 2, (x, y) => {
    const h = 3 + Math.sin(x * 0.21) * 1.2 + Math.sin(x * 0.07 + 1) * 1.5 + (kind === 'tokyo' ? (hash3(x >> 2, 0, 1) * 5) : 0);
    if (y > h) return null;
    return kind === 'tokyo' ? (x % 4 === 0 ? shade(col, 0.9) : col) : y > h - 1 ? shade(col, 1.1) : col;
  }, { size: 6, offset: [-420, -6, 0] });
  if (kind === 'fuji') {
    // Fuji: a broad cone with a snow cap, about 13° tall from the line
    b.add(80, 24, 2, (x, y) => {
      const half = 40 - y * 1.55;
      if (Math.abs(x - 40) > half) return null;
      if (y > 15 - Math.sin(x * 0.9) * 1.2) return hash3(x, y, 3) < 0.15 ? 0xe9eef5 : 0xffffff;
      return y > 13 ? 0xc6d4e6 : hash3(x, y, 4) < 0.2 ? 0x66809f : 0x7690b0;
    }, { size: 4, offset: [-160, -4, -8] });
  }
  return new THREE.Mesh(b.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
}
