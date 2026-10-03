// Voxel models for Godzilla Rampage: the four travellers (faces and hair from
// the user's photos — no sunglasses, outfits needn't match), Godzilla, and
// every prop. Each character is a small hierarchy of parts with pivots at the
// joints, so render3d.js can animate them (walk, climb, jump, swing, wave).
//
// Units: 1 world unit = 1 logical game pixel. Characters use half-unit voxels
// for detail; Godzilla and the level use whole units.
import * as THREE from 'three';
import { vox, hash3, VoxBuilder } from './voxel.js';

export const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

export function mesh(geo, mat = MAT) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const V = 0.5; // character voxel size

/** A hex colour scaled by k (per channel). */
export function shade(c, k) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

// ---- looks ---------------------------------------------------------------------------
// skin, eyes; hair(u, w, d, inCore) → colour|null for the head grid (see head()).
export const LOOKS = {
  // Chris: shaved head with a shine, blue eyes, light stubble.
  chris: {
    skin: 0xf2c3a0, skinShade: 0xdca684, eye: 0x24507f, brow: 0xa77b5a, mouth: 0x9a3f33, stubble: 0xc79f84,
    shirt: 0x6f93e0, shirtDark: 0x5579c8, pants: 0x7d838c, shoes: 0x23242a,
    hair: (u, w, d, core) => (core && w === 13 && d >= 7 && d <= 10 && u >= 3 && u <= 6 ? 0xffe4cf : null) // scalp shine
  },
  // Shea: dark curly hair swept back from a high forehead, hazel eyes, stubble.
  shea: {
    skin: 0xefc4a2, skinShade: 0xd7a684, eye: 0x4c6a3c, brow: 0x2a221d, mouth: 0xa24a3c, stubble: 0xb8998a,
    shirt: 0x2459c9, shirtDark: 0x1c47a3, pants: 0xc8b597, shoes: 0xf1f3f5,
    hair: (u, w, d, core) => {
      const curl = hash3(u + 40, w, d) < 0.5 ? 0x2a221d : 0x3f342c;
      if (w >= 14) return d <= 9 && u >= 0 && u <= 13 && hash3(u, w, d) < 0.6 ? curl : null; // curls on top
      if (core && w >= 12 && d <= 9) return curl;
      if (core && w >= 8 && (u <= 0 || u >= 13) && d <= 9) return curl;
      if (core && d <= 1 && w >= 5) return curl;
      if (!core && w >= 8 && w <= 13 && (u === -1 || u === 14) && d >= 1 && d <= 8 && hash3(u, w, d) < 0.55) return curl;
      if (!core && d === -1 && w >= 6 && w <= 13 && u >= 1 && u <= 12 && hash3(u, w, d + 9) < 0.6) return curl;
      return null;
    }
  },
  // Emily: big wavy red hair, blue eyes.
  emily: {
    skin: 0xf6d2b8, skinShade: 0xe3b598, eye: 0x2f5f86, brow: 0xa8431f, mouth: 0xc2414f, blush: 0xf0a7a0,
    dress: 0x3d7cae, dressPattern: 0x16202c, trim: 0x16202c, hem: 0xf8f9fa, neck: 0xe4ebf2,
    hair: (u, w, d, core) => {
      const n = hash3(u + 7, w * 3, d);
      const c = n < 0.2 ? 0xe07a45 : n < 0.6 ? 0xc4552b : 0xa8431f;
      const face = d >= 11 && u >= 2 && u <= 11 && w <= 10;
      if (face) return w >= 9 && (u <= 4 || u >= 9) && d === 13 && n < 0.5 ? c : null; // curly fringe edges
      if (core) return w >= 11 || d <= 3 || u <= 1 || u >= 12 ? c : null;
      // volume around the head: a wavy shell, longest at the back and sides
      const cx = u - 6.5, cy = w - 8, cz = d - 5.5;
      const r = Math.sqrt((cx * cx) / 81 + (cy * cy) / 110 + (cz * cz) / 72);
      if (w < -3 || d > 12) return null;
      return r < 1 && n < 0.88 ? c : null;
    }
  },
  // Heather: blonde chin-length bob with a side part, blue-green eyes.
  heather: {
    skin: 0xf4cfb4, skinShade: 0xe0b394, eye: 0x3f6f78, brow: 0xb4975c, mouth: 0xc9495c, blush: 0xf2aab0,
    dress: 0xf7f7f5, dressPattern: 0xe8579a, dressLeaf: 0x5f9e4c, trim: 0xffffff, hem: 0xf7f7f5, neck: 0xfbf6ea,
    hair: (u, w, d, core) => {
      const c = u % 3 === 0 ? 0xf7e6b2 : hash3(u, w, d) < 0.3 ? 0xcfb06a : 0xe9d08e;
      if (core) {
        if (w >= 12) return c;
        if (d === 13 && w >= 10 && u <= 7) return c; // side-swept fringe
        if (d <= 1 && w >= 1) return c;
        return null;
      }
      if (w >= 14) return d >= 1 && d <= 12 && u >= 1 && u <= 12 ? c : null;
      if ((u === -1 || u === 14) && w >= 1 && w <= 13 && d >= 0 && d <= 12) return c;
      if (d === -1 && w >= 1 && w <= 13 && u >= 0 && u <= 13) return c;
      return null;
    }
  }
};

// ---- heads ---------------------------------------------------------------------------
// Grid 18 x 20 x 18 half-voxels; the 14³ head core sits at x 2..15, y 3..16,
// z 2..15 (front = +z). u/w/d are core coordinates (0..13); hair may grow
// outside the core. Pivot: bottom centre of the core.
function head(look) {
  return vox(18, 20, 18, (x, y, z) => {
    const u = x - 2, w = y - 3, d = z - 2;
    const core = u >= 0 && u <= 13 && w >= 0 && w <= 13 && d >= 0 && d <= 13;
    const edges = (u === 0 || u === 13) + (w === 0 || w === 13) + (d === 0 || d === 13);
    const hair = look.hair(u, w, d, core && edges < 2);
    if (hair) return hair;
    if (!core) {
      if ((u === -1 || u === 14) && w >= 5 && w <= 7 && d >= 6 && d <= 7) return look.skinShade; // ears
      if (d === 14 && w === 5 && (u === 6 || u === 7)) return look.skinShade; // nose
      return null;
    }
    if (edges >= 2) return null; // rounded edges
    if (d === 13) {
      if (w >= 6 && w <= 7 && ((u >= 3 && u <= 4) || (u >= 9 && u <= 10))) return w === 7 && (u === 3 || u === 9) ? 0xffffff : look.eye;
      if (w === 9 && ((u >= 2 && u <= 4) || (u >= 9 && u <= 11))) return look.brow;
      if (w === 3 && u >= 5 && u <= 8) return look.mouth;
      if (w === 4 && (u === 4 || u === 9)) return look.mouth;
      if (look.blush && w === 4 && (u === 2 || u === 11)) return look.blush;
    }
    if (look.stubble && w <= 4 && (d >= 8 || u <= 1 || u >= 12) && hash3(u, w, d) < 0.7) return look.stubble;
    return look.skin;
  }, V, [9, 3, 9]);
}

// ---- bodies --------------------------------------------------------------------------
function heroParts(look) {
  const torso = vox(11, 11, 7, (x, y, z) => {
    if ((x === 0 || x === 10) && (z === 0 || z === 6)) return null;
    if (y === 10 && z >= 5 && x >= 4 && x <= 6) return look.skin; // neckline
    return y === 0 ? look.shirtDark : look.shirt;
  }, V, [5.5, 0, 3.5]);
  const arm = vox(3, 10, 4, (x, y) => (y >= 6 ? look.shirt : y <= 2 ? look.skinShade : look.skin), V, [1.5, 10, 2]);
  const leg = vox(3, 10, 4, (x, y, z) => (y <= 1 ? (z === 3 && y === 0 ? 0xffffff : look.shoes) : look.pants), V, [1.5, 10, 2]);
  return { torso, arm, leg, head: head(look) };
}

function wifeParts(look) {
  // Bodice + flared skirt in one piece; pivot at the hem centre.
  const body = vox(22, 22, 16, (x, y, z) => {
    const cx = x - 10.5, cz = z - 7.5;
    let hw, hd;
    if (y < 13) { hw = 10.5 - y * 0.42; hd = 7.5 - y * 0.3; } else { hw = 5.5; hd = 3.5; }
    if (Math.abs(cx) > hw || Math.abs(cz) > hd) return null;
    if ((cx * cx) / (hw * hw) + (cz * cz) / (hd * hd) > 1.15) return null;
    if (y <= 1 && look.hem !== look.dress) return look.hem;
    if (y === 21 && Math.abs(cx) <= 2 && cz > 0) return look.neck;
    if (y >= 20 && cz > 2) return look.trim;
    const n = hash3(x >> 1, y >> 1, z >> 1);
    if (n < 0.16) return look.dressPattern;
    if (look.dressLeaf && n < 0.24) return look.dressLeaf;
    return look.dress;
  }, V, [10.5, 0, 7.5]);
  const arm = vox(4, 10, 4, (x, y) => (y >= 6 ? look.dress : look.skin), V, [2, 10, 2]);
  return { body, arm, head: head(look) };
}

/** A traveller: root at the feet, parts named for animation. */
export function makeHero(key) {
  const look = LOOKS[key], p = heroParts(look);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 5;
  root.add(body);
  const torso = mesh(p.torso);
  body.add(torso);
  const headM = mesh(p.head);
  headM.position.y = 5.5;
  body.add(headM);
  const armL = mesh(p.arm), armR = mesh(p.arm);
  armL.position.set(-3.5, 5.2, 0);
  armR.position.set(3.5, 5.2, 0);
  body.add(armL, armR);
  const hand = new THREE.Group(); // tool socket in the right hand
  hand.position.set(0, -4.4, 0.6);
  armR.add(hand);
  const legL = mesh(p.leg), legR = mesh(p.leg);
  legL.position.set(-1.2, 5, 0);
  legR.position.set(1.2, 5, 0);
  root.add(legL, legR);
  root.userData = { body, head: headM, armL, armR, legL, legR, hand };
  return root;
}

export function makeWife(key) {
  const look = LOOKS[key], p = wifeParts(look);
  const root = new THREE.Group();
  const body = mesh(p.body);
  root.add(body);
  const headM = mesh(p.head);
  headM.position.y = 10.6;
  root.add(headM);
  const armL = mesh(p.arm), armR = mesh(p.arm);
  armL.position.set(-3.6, 10.2, 0);
  armR.position.set(3.6, 10.2, 0);
  root.add(armL, armR);
  root.userData = { head: headM, armL, armR };
  return root;
}

// ---- tools ---------------------------------------------------------------------------
/** Coal miner's pickaxe; pivot at the grip. */
export function makePickaxe() {
  const g = new VoxBuilder();
  g.add(2, 22, 2, (x, y) => (y % 5 === 0 ? 0x7a4f22 : 0xa86f36), { size: V, offset: [-0.5, -2, -0.5] });
  g.add(20, 4, 2, (x, y) => {
    const t = Math.abs(x - 9.5);
    if (y === 3 && t > 6) return null;
    if (y === 0 && t > 8) return null;
    if (y >= 2 && t < 2) return 0x495057;
    return t > 7 ? 0xdee2e6 : 0x868e96;
  }, { size: V, offset: [-5, 8.5, -0.5] });
  return mesh(g.geometry());
}

/** Giant candy cane; pivot at the grip. */
export function makeCandyCane() {
  const g = new VoxBuilder();
  const stripe = (a) => (Math.floor(a) % 4 < 2 ? 0xe03131 : 0xffffff);
  g.add(3, 24, 3, (x, y) => stripe(y + x), { size: V, offset: [-0.75, -2, -0.75] });
  g.add(12, 10, 3, (x, y) => {
    const cx = x - 6, cy = y - 3, r = Math.sqrt(cx * cx + cy * cy);
    if (r < 3 || r > 6.2 || cy < 0 || (x < 3 && cy < 1)) return null;
    return stripe(Math.atan2(cy, cx) * 5);
  }, { size: V, offset: [-5.25, 9.7, -0.75] });
  return mesh(g.geometry());
}

export function makeCrown() {
  return mesh(vox(10, 6, 10, (x, y, z) => {
    const edge = x === 0 || x === 9 || z === 0 || z === 9;
    if (!edge) return null;
    if (y >= 3 && (x + z) % 3 !== 0) return null;
    if (y === 1 && (x + z) % 4 === 0) return 0x74c0fc;
    return y === 5 ? 0xffe066 : 0xf2c94c;
  }, V, [5, 0, 5]));
}

export function makeHeart() {
  const rows = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  return mesh(vox(7, 6, 2, (x, y) => (rows[5 - y][x] === 'X' ? (y === 4 && x === 1 ? 0xffc9de : 0xff4d8d) : null), 0.7, [3.5, 3, 1]));
}

// ---- Godzilla ------------------------------------------------------------------------
// An original chunky take on the classic kaiju silhouette: upright, charcoal
// green, a short broad head under a heavy brow, a thick neck, three rows of
// big jagged bone-white back plates (they glow atomic blue when he roars or
// is angry — render3d sets `plateMat.emissive`), a long heavy tail. Front =
// +z. Root at the feet.
const GZ = {
  body: 0x5a7560, speck: 0x4f6955, dark: 0x34473a, belly: 0x86a08a, ridge: 0x728c77,
  plate: 0xf1ead8, plateBase: 0xb9b19c, claw: 0xf8f9fa, mouth: 0x5c1420, tongue: 0xc2255c
};

/** A jagged maple-leaf plate: thin in x, base on the spine, sticking out along -z. */
function plate(b, x, y, z, h, d, tilt = 0) {
  b.add(2, h + 2, d + 1, (xx, yy, zz) => {
    const k = d - zz; // distance out from the spine
    const half = (h / 2) * Math.pow(Math.max(0, 1 - k / (d + 0.5)), 0.65) + (k % 3 === 1 ? 0.9 : 0);
    const cy = yy - (h + 1) / 2 - k * tilt;
    if (Math.abs(cy) > half) return null;
    return k < 2 ? GZ.plateBase : GZ.plate;
  }, { offset: [x - 1, y - (h + 1) / 2, z - d] });
}

/** A plate standing straight up (for the tail): thin in x, base at yBase, centred on z. */
function plateUp(b, x, yBase, z, len, height) {
  b.add(2, height + 1, len + 2, (xx, k, zz) => {
    const half = (len / 2) * Math.pow(Math.max(0, 1 - k / (height + 0.5)), 0.65) + (k % 3 === 1 ? 0.8 : 0);
    if (Math.abs(zz - (len + 1) / 2) > half) return null;
    return k < 1 ? GZ.plateBase : GZ.plate;
  }, { offset: [x - 1, yBase, z - (len + 2) / 2] });
}

export function makeGodzilla() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 12;
  root.add(body);
  const plateMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
  // torso: tall pear with a thick neck and a lighter, ridged chest
  const hwAt = (y) => { const t = y / 29; return 9.5 + 1.6 * Math.sin(Math.PI * Math.min(1, t * 1.3)) - (t > 0.68 ? (t - 0.68) * 15 : 0); };
  const hdAt = (y) => { const t = y / 29; return 8 - (t > 0.7 ? (t - 0.7) * 9 : 0); };
  const torso = mesh(vox(24, 30, 18, (x, y, z) => {
    const cx = x - 11.5, cz = z - 8.5, hw = hwAt(y), hd = hdAt(y);
    if ((cx * cx) / (hw * hw) + (cz * cz) / (hd * hd) > 1) return null;
    if (cz > hd - 3 && Math.abs(cx) < hw * 0.55 && y > 2 && y < 26) return y % 3 === 0 ? GZ.ridge : GZ.belly;
    return hash3(x, y, z) < 0.07 ? GZ.speck : GZ.body;
  }, 1, [11.5, 0, 8.5]));
  body.add(torso);
  // back plates: a big central row, smaller rows either side
  const pb = new VoxBuilder();
  [[5, 8, 7], [9, 11, 9], [13, 13, 10], [17, 15, 11], [21, 14, 10], [25, 11, 9], [28, 8, 6]].forEach(([y, h, d]) => {
    const back = -hdAt(y) + 1.5;
    plate(pb, 0, y, back, h, d, 0.15);
    if (y < 27) { plate(pb, -3.2, y + 2, back + 0.8, h * 0.6, d * 0.65, 0.15); plate(pb, 3.2, y + 2, back + 0.8, h * 0.6, d * 0.65, 0.15); }
  });
  const plates = new THREE.Mesh(pb.geometry(), plateMat);
  plates.castShadow = true;
  body.add(plates);
  // head (pivot at the neck): broad cranium, short blunt snout, heavy brow
  const head = new THREE.Group();
  head.position.set(0, 27, 2.5);
  body.add(head);
  const skull = mesh(vox(16, 13, 17, (x, y, z) => {
    const cx = x - 7.5;
    const cranium = (cx * cx) / 56 + ((y - 6.5) * (y - 6.5)) / 42 + ((z - 6) * (z - 6)) / 36 <= 1;
    const snoutW = 5.6 - Math.max(0, z - 11) * 0.35, snoutTop = 8.2 - (z - 9) * 0.3;
    const snout = z >= 8 && z <= 16 && Math.abs(cx) <= snoutW && y >= 2 && y <= snoutTop && !(z === 16 && Math.abs(cx) > snoutW - 1.2);
    const brow = y >= 9 && y <= 10.5 && z >= 7 && z <= 11 && Math.abs(cx) >= 2 && Math.abs(cx) <= 7;
    if (!cranium && !snout && !brow) return null;
    if (brow) return GZ.dark;
    if (snout && y === 2 && z >= 10 && (Math.abs(cx) >= snoutW - 1.2 || z === 16) && (x + z) % 2 === 0) return GZ.claw; // teeth
    if (snout && z === 16 && y === 7 && Math.abs(Math.abs(cx) - 2) < 0.6) return GZ.dark; // nostrils
    return hash3(x, y, z) < 0.07 ? GZ.speck : GZ.body;
  }, 1, [7.5, 2, 4]));
  head.add(skull);
  // eyes: small, set under the brow, pupils track the player
  const eyeWhite = new THREE.MeshLambertMaterial({ color: 0xfff4d6 });
  const pupilMat = new THREE.MeshLambertMaterial({ color: 0x111111, emissive: 0x000000 });
  const eyes = [];
  [-1, 1].forEach((side) => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 1.4), eyeWhite);
    e.position.set(side * 4.6, 6.6, 6.4);
    e.rotation.y = side * 0.45;
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.5), pupilMat);
    pupil.position.set(0, -0.1, 0.6);
    e.add(pupil);
    head.add(e);
    eyes.push({ white: e, pupil, side });
  });
  // lower jaw (pivot at the hinge)
  const jaw = mesh(vox(12, 4, 12, (x, y, z) => {
    const cx = x - 5.5, w = 5.6 - Math.max(0, z - 7) * 0.35;
    if (Math.abs(cx) > w) return null;
    if (y === 3 && (Math.abs(cx) >= w - 1.2 || z === 11) && (x + z) % 2 === 0) return GZ.claw;
    if (y === 3 && z < 11 && Math.abs(cx) < w - 1.2) return z > 2 ? GZ.tongue : GZ.mouth;
    if (y === 3) return null;
    return y === 0 ? GZ.belly : GZ.body;
  }, 1, [6, 4, 0]));
  jaw.position.set(0, 0, 4.5);
  head.add(jaw);
  // small arms at the chest (pivot at the shoulder)
  const armGeo = vox(5, 12, 5, (x, y, z) => (y <= 1 && z >= 3 && x % 2 === 0 ? GZ.claw : y < 3 ? GZ.dark : GZ.body), 1, [2.5, 12, 2.5]);
  const armL = mesh(armGeo), armR = mesh(armGeo);
  armL.position.set(-9.5, 21, 5);
  armR.position.set(9.5, 21, 5);
  body.add(armL, armR);
  // thick legs (pivot at the hip)
  const legGeo = vox(10, 14, 12, (x, y, z) => {
    const cx = x - 4.5, cz = z - 5.5, r = 5 - Math.max(0, y - 10) * -0.3;
    if (y <= 1) { if (z >= 10 && x % 3 === 1) return GZ.claw; if (z >= 10) return null; return GZ.dark; }
    if ((cx * cx) / (r * r) + (cz * cz) / 36 > 1) return null;
    return hash3(x, y, z) < 0.07 ? GZ.speck : GZ.body;
  }, 1, [4.5, 14, 5.5]);
  const legL = mesh(legGeo), legR = mesh(legGeo);
  legL.position.set(-6.5, 13, 0);
  legR.position.set(6.5, 13, 0);
  root.add(legL, legR);
  // long heavy tail: four tapering segments, each hinged at its front end, with plates
  const tail = [];
  let parent = body, at = new THREE.Vector3(0, 5, -6);
  [[14, 12, 14], [11, 9, 13], [8, 7, 12], [5, 5, 11]].forEach(([w, h, d], i) => {
    const seg = new THREE.Group();
    seg.position.copy(at);
    parent.add(seg);
    seg.add(mesh(vox(w, h, d, (x, y, z) => {
      const cx = x - (w - 1) / 2, cy = y - (h - 1) / 2, k = 1 - (z / d) * 0.3;
      if ((cx * cx) / ((w / 2) * k) ** 2 + (cy * cy) / ((h / 2) * k) ** 2 > 1) return null;
      if (cy < -h / 2 + 2 && Math.abs(cx) < w / 4) return GZ.belly;
      return hash3(x, y, z + i * 30) < 0.07 ? GZ.speck : GZ.body;
    }, 1, [(w - 1) / 2, (h - 1) / 2, d])));
    const tb = new VoxBuilder();
    [0.3, 0.7].forEach((f) => plateUp(tb, 0, h / 2 - 1.5, -d * f, Math.max(3, 6 - i), Math.max(3, 6 - i * 1.2)));
    const tp = new THREE.Mesh(tb.geometry(), plateMat);
    tp.castShadow = true;
    seg.add(tp);
    tail.push(seg);
    parent = seg;
    at = new THREE.Vector3(0, -0.5, -d + 1.5);
  });
  tail[0].rotation.x = 0.55;
  tail[1].rotation.x = 0.25;
  root.userData = { body, torso, head, jaw, armL, armR, legL, legR, tail, eyes, pupilMat, plateMat };
  return root;
}

// ---- hazards -------------------------------------------------------------------------
// Each rolls about z; pivot at the centre. r ≈ 5 (logical radius of a hazard).
function barrelGeo(wood, band, ring = 0x2b1a0a) {
  return vox(20, 20, 16, (x, y, z) => {
    const cx = x - 9.5, cy = y - 9.5, r = Math.sqrt(cx * cx + cy * cy);
    if (r > 9.8) return null;
    const bulge = 1 - Math.abs(z - 7.5) / 22;
    if (r > 9.8 * bulge + 0.4) return null;
    if (z === 0 || z === 15) return r > 7.5 ? ring : r < 1.5 ? band : wood;
    if (z === 3 || z === 12) return band;
    const plank = Math.floor((Math.atan2(cy, cx) + Math.PI) * 3);
    return plank % 2 ? wood : shade(wood, 0.82);
  }, V, [10, 10, 8]);
}

export function makeHazard(look) {
  switch (look) {
    case 'firebarrel': return mesh(barrelGeo(0xd9480f, 0x4a1d07));
    case 'present': return mesh(vox(18, 18, 18, (x, y, z) => {
      if (x === 0 && y === 0) return null;
      if (Math.abs(x - 8.5) < 2 || Math.abs(z - 8.5) < 2) return 0xffd43b;
      return hash3(x, y, z) < 0.08 ? 0xff8787 : 0xe03131;
    }, V, [9, 9, 9]));
    case 'snowball': return mesh(vox(20, 20, 20, (x, y, z) => {
      const d = Math.hypot(x - 9.5, y - 9.5, z - 9.5);
      if (d > 9.8 + (hash3(x, y, z) - 0.5) * 1.2) return null;
      return hash3(x, y, z) < 0.15 ? 0xd0ebff : 0xffffff;
    }, V, [10, 10, 10], 0.02));
    case 'boulder': return mesh(vox(22, 22, 20, (x, y, z) => {
      const d = Math.hypot(x - 10.5, y - 10.5, (z - 9.5) * 1.1);
      if (d > 10.5 + (hash3(x >> 1, y >> 1, z >> 1) - 0.5) * 3) return null;
      const n = hash3(x, y, z);
      return n < 0.1 ? 0xffa94d : n < 0.18 ? 0xff6b00 : n < 0.6 ? 0x5c1a0b : 0x3d1206;
    }, V, [11, 11, 10]));
    case 'cart': {
      const g = new VoxBuilder();
      g.add(28, 12, 16, (x, y, z) => {
        const edge = x === 0 || x === 27 || z === 0 || z === 15 || y === 0;
        if (y >= 9 && !edge) return hash3(x, y, z) < 0.3 ? 0x495057 : 0x212529; // coal
        if (!edge && y > 0) return null;
        return y === 11 ? 0xadb5bd : x % 9 === 0 ? 0x343a40 : 0x6c757d;
      }, { size: V, offset: [-7, -2, -4] });
      return mesh(g.geometry());
    }
    case 'coal': return mesh(vox(14, 14, 12, (x, y, z) => {
      if (Math.hypot(x - 6.5, y - 6.5, z - 5.5) > 6.8 + (hash3(x, y, z) - 0.5) * 2.5) return null;
      return hash3(x, y, z) < 0.1 ? 0x868e96 : 0x1e2125;
    }, V, [7, 7, 6]));
    case 'ornament': return mesh(vox(16, 19, 16, (x, y, z) => {
      if (y >= 15) return Math.abs(x - 7.5) < 2.5 && Math.abs(z - 7.5) < 2.5 ? 0xffd43b : null;
      if (Math.hypot(x - 7.5, y - 7.5, z - 7.5) > 7.8) return null;
      return y === 7 || y === 8 ? 0xffd43b : x < 6 && y > 9 && z > 9 ? 0xffc9c9 : 0xe03131;
    }, V, [8, 8, 8]));
    case 'rock': return mesh(vox(16, 16, 14, (x, y, z) => {
      if (Math.hypot(x - 7.5, y - 7.5, z - 6.5) > 7.6 + (hash3(x, y, z) - 0.5) * 2.5) return null;
      const n = hash3(x, y, z);
      return n < 0.2 ? 0xffa94d : n < 0.35 ? 0xff6b00 : 0x5c1a0b;
    }, V, [8, 8, 7]));
    case 'fire': return mesh(vox(14, 18, 12, (x, y, z) => {
      const cx = x - 6.5, cz = z - 5.5, hw = 6.5 * (1 - y / 22) + (y > 10 ? (hash3(x, y, z) - 0.5) * 3 : 0);
      if (Math.abs(cx) > hw || Math.abs(cz) > hw * 0.8 || cx * cx + cz * cz > hw * hw * 1.1) return null;
      if (z === 11 || cz > hw * 0.8 - 1) {
        if (y >= 7 && y <= 9 && (Math.abs(cx - 2) < 1 || Math.abs(cx + 2) < 1)) return y === 9 ? 0xffffff : 0x0b1d3a; // eyes
      }
      return y > 11 ? 0xe7f5ff : y > 5 ? 0x74c0fc : 0x1971c2;
    }, V, [7, 0, 6], 0.06));
    default: return mesh(barrelGeo(0xb5651d, 0x6b3a10));
  }
}

/** Little cube for debris, snow and embers (instanced by the renderer). */
export const DEBRIS = new THREE.BoxGeometry(1, 1, 1);
