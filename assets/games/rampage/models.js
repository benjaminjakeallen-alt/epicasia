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
/**
 * A bob haircut for the head grid (see head()): `colors` three shades,
 * `part` 'left'|'right' (the fringe sweeps away from it, down to `sweep`
 * rows), `len` the lowest row at the sides (0 = chin), `aline` how much
 * longer it is at the front, `volume` 0..1 how full the crown is, `tuck`
 * 'left'|'right' tucks that side behind the ear, `flick` turns the ends out.
 */
export function bobHair(o) {
  const pal = o.colors, partU = o.part === 'right' ? 9 : 4;
  const away = (u) => (o.part === 'right' ? partU - u : u - partU);
  const low = (d) => o.len - (d >= 7 ? o.aline || 0 : 0);
  const tucked = (u, w, d) => ((o.tuck === 'right' && u >= 13) || (o.tuck === 'left' && u <= 0)) && w < 9 && d >= 4;
  return (u, w, d, core) => {
    const n = hash3(u + 3, w * 2, d + 5);
    const c = n < 0.25 ? pal[0] : n < 0.7 ? pal[1] : pal[2];
    if (core) {
      if (w >= 12) return c;
      if (d === 13) return away(u) > 0 && w >= 12 - Math.min(o.sweep || 0, away(u) * 0.6) ? c : null; // the swept fringe
      if ((u <= 0 || u >= 13) && w >= low(d)) return tucked(u, w, d) ? null : c;
      if (d <= 1 && w >= low(0)) return c;
      return null;
    }
    if (w === 14) return u >= 0 && u <= 13 && d >= 0 && d <= 13 && (u >= 1 && u <= 12 && d >= 1 ? hash3(u, w, d) < 0.35 + (o.volume || 0) * 0.65 : (o.volume || 0) > 0.5) ? c : null;
    if (w === 15) return (o.volume || 0) > 0.6 && u >= 3 && u <= 10 && d >= 3 && d <= 10 && hash3(u, w, d) < 0.5 ? c : null;
    if ((u === -1 || u === 14) && d >= 0 && d <= 13 && w >= low(d) && w <= 14) return tucked(u === -1 ? 0 : 13, w, d) ? null : c;
    if (o.flick && (u === -2 || u === 15) && w === low(d) && d >= 1 && d <= 12 && !tucked(u === -2 ? 0 : 13, w, d)) return c;
    if (d === -1 && u >= -1 && u <= 14 && w >= low(0) && w <= 14) return c;
    if (d === 14 && w >= 12 && w <= 13 && away(u) > 1) return c; // the fringe stands off the forehead a little
    return null;
  };
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
  // Nicole (Shinkansen Dash, unlocked with a boba tea; user Oct 12 2026: "look
  // cooler… glasses you can see eyes through… cool"): a glossy copper bob
  // tucked behind one ear with a gold earring, clear teal browline glasses
  // (only along the brows, so her eyes show), lashes and a little winged
  // liner, berry lips, freckles; a cropped rust suede moto jacket over a white
  // top and a gold necklace, high-waisted light jeans, white sneakers; a
  // slimmer, longer-legged build.
  nicole: {
    skin: 0xf4cfb6, skinShade: 0xe0b098, eye: 0x2f6b72, brow: 0x9a4a28, mouth: 0xc8546a, blush: 0xf0a3a0,
    freckles: 0xd99a78, glasses: 0x8fd0cc, browlineGlasses: true, lashes: 0x2b1a14,
    shirt: 0xb4532a, shirtDark: 0x8f3f1e, cuff: 0x8f3f1e, pants: 0x9cb9dc, shoes: 0xf4f4f4, longSleeves: true,
    build: { legs: 1.1, torso: 1, slim: 0.88, arms: 1.06 },
    print: (x, y, z) => {
      if (y <= 1) return 0x9cb9dc; // high-waisted jeans
      if (y === 2) return z === 6 && x === 5 ? 0xf2c14e : 0x5a3a22; // belt and buckle
      if (z === 6 && x >= 4 && x <= 6) return y === 9 && x === 5 ? 0xf2c14e : 0xf7f3ea; // white top, a gold pendant
      if (z === 6 && (x === 3 || x === 7) && y >= 5) return 0x8f3f1e; // lapels
      if (y === 3 && z === 6) return 0xc9c3b8; // the jacket's zip end
      return null;
    },
    hair: (() => {
      const bob = bobHair({ colors: [0xe08a4e, 0xc8682f, 0xa9532a], part: 'right', len: 1, aline: 2, volume: 0.45, sweep: 4, tuck: 'left' });
      return (u, w, d, core) => (u === -1 && w === 4 && d === 7 ? 0xf2c14e : bob(u, w, d, core)); // a gold earring on the tucked side
    })()
  },
  // Mei (user, Oct 14 2026, from her photos): long straight dark-brown hair,
  // centre parted, with face-framing bangs; brown eyes, freckles, a big smile;
  // the churro Mickey ears with a silver bow from the Disney trip, a pastel
  // checkered knit top (pink, orange, aqua, white), jeans, white sneakers.
  // A kid: shorter legs and body than the grown-ups.
  mei: {
    skin: 0xe9c19c, skinShade: 0xd5a580, eye: 0x3b2417, brow: 0x2a1a12, mouth: 0xc4646e, blush: 0xf0a28e, freckles: 0xc68d68,
    shirt: 0xf6f1ea, shirtDark: 0xe9e2d8, pants: 0x6f9ac9, shoes: 0xf4f4f4, sleeveless: true,
    build: { legs: 0.8, torso: 0.86, slim: 0.86, arms: 0.88 },
    longHair: [0x3a2418, 0x4a3020, 0x2c1b12], tallHead: true,
    print: (x, y, z) => {
      if (y === 10 || y === 0) return 0xf6f1ea; // ribbed neck and hem
      if (y === 1 && (z === 0 || z === 6 || x === 0 || x === 10)) return 0x6f9ac9; // jeans at the waist
      const CHECKS = [0xf2b6dc, 0xf08a4a, 0xa9e1e2, 0xf6f1ea];
      return CHECKS[Math.floor(hash3(x >> 1, (y - 2) >> 1, z > 3 ? 1 : 0) * 4)]; // the pastel checks
    },
    hair: (u, w, d, core) => {
      // straight hair falls in vertical strands: the shade follows u and d, not w
      const n = hash3(u + 5, 3, d + 9), c = n < 0.35 ? 0x4a3020 : n < 0.8 ? 0x3a2418 : 0x2c1b12;
      // the churro ears: two round discs of ridged, sugared churro on the headband
      for (const eu of [0.5, 12.5]) {
        const r = Math.hypot(u - eu, w - 16.4);
        if (d >= 5 && d <= 6 && r <= 2.5) return r > 1.9 ? 0xb8742e : Math.floor(r * 2 + u) % 2 ? 0xe0954a : hash3(u, w, d) < 0.3 ? 0xf6e2b0 : 0xd2853c;
      }
      if (w >= 13 && w <= 15 && u >= 5 && u <= 8 && d >= 8 && d <= 10) return u === 6 || u === 7 ? 0xc9ccd4 : 0xeef0f4; // the silver bow
      if (w === 14 && d >= 5 && d <= 6 && u >= 0 && u <= 13) return 0xe9e2d8; // the headband between the ears
      if (core) {
        if (w >= 12) return c;
        // curtain bangs, parted in the middle: down to the brows at the sides, the forehead showing in the middle
        if (d === 13) return (w >= 10 && (u <= 2 || u >= 11)) || (w === 11 && (u === 3 || u === 10)) ? c : null;
        if (d <= 1) return c;
        return null;
      }
      if (w === 14) {
        if (u < 0 || u > 13 || d < 0 || d > 13) return null;
        return (u === 6 || u === 7) && d >= 7 ? 0x5c3b28 : c; // the parting
      }
      if ((u === -1 || u === 14) && d >= 1 && d <= 13 && w >= 1 && w <= 13) return d === 13 && w < 5 ? null : c; // straight down the sides, past the chin
      if (d === -1 && u >= -1 && u <= 14 && w >= 0 && w <= 13) return c; // down the back
      return null;
    }
  },
  // Miles (Shinkansen Dash, unlocked with a golden guitar): shaggy dark-brown
  // hair with a heavy fringe over the brows and over the ears, round
  // tortoiseshell glasses, a few freckles; a forest-green tee, dark jeans.
  miles: {
    skin: 0xf4cfb6, skinShade: 0xe0b196, eye: 0x5b7590, brow: 0x4a3221, mouth: 0xb9616a, freckles: 0xdcae92,
    glasses: 0x3a2618, roundGlasses: true,
    shirt: 0x1f5a3c, shirtDark: 0x184a31, pants: 0x2f3a4f, shoes: 0xf1f3f5,
    build: { legs: 1.32, torso: 1.12, slim: 0.8, arms: 1.18 }, // tall, skinny and lanky (user)
    hair: (u, w, d, core) => {
      const n = hash3(u + 7, w * 3, d + 11);
      const c = n < 0.3 ? 0xa47a50 : n < 0.75 ? 0x936a43 : 0x825c39; // a lighter brown, straight (low contrast)
      const tip = hash3(u, 0, d + 21) < 0.5; // a ragged edge
      if (core) {
        if (w >= 12) return c;
        if (d === 13 && (w >= 9 || (w === 8 && tip && (u <= 1 || u >= 12)))) return c; // a heavy fringe down to the brows
        if ((u <= 0 || u >= 13) && w >= 5) return c; // over the ears
        if (d <= 2 && w >= 2) return c;
        return null;
      }
      if (w === 14) return d >= 0 && d <= 13 && u >= 0 && u <= 13 ? c : null; // shaggy volume on top
      if (w === 15) return d >= 2 && d <= 12 && u >= 1 && u <= 12 && hash3(u, w, d) < 0.45 ? c : null; // a little messy on top
      if ((u === -1 || u === 14) && d >= 1 && d <= 13 && (w >= 5 || (w === 4 && tip)) && w <= 15) return c;
      if (d === 14 && w >= 9 && w <= 14 && u >= 0 && u <= 13 && (w >= 10 || tip)) return c; // the fringe sticks out a little
      if (d === -1 && w >= (tip ? 2 : 3) && w <= 14 && u >= 0 && u <= 13) return c;
      return null;
    }
  },
  // Bennett (Shinkansen Dash, a default traveller in Shea's place): short
  // tousled light-brown hair, blue-grey eyes, a big smile; an Ecuadorian
  // (Otavalo-style) wool poncho — see poncho() — over blue jeans.
  bennett: {
    skin: 0xf3cbb0, skinShade: 0xdfad91, eye: 0x5e7f99, brow: 0x7a5536, mouth: 0xb5505a,
    shirt: 0x6b4226, shirtDark: 0x5a3720, pants: 0x8fb0d3, shoes: 0xf1f3f5, poncho: true,
    build: { legs: 1.08, torso: 1.04, slim: 0.84, arms: 1.05 }, // slim (user, Oct 12 2026: "looks fat, make thinner")
    hair: (u, w, d, core) => {
      const n = hash3(u + 5, w * 2, d + 3);
      const c = n < 0.3 ? 0xa8754a : n < 0.75 ? 0x8a5a33 : 0x734726;
      if (core) {
        if (w >= 12) return c;
        if (d === 13 && w === 11 && hash3(u, 4, 9) < 0.5) return c; // a few short strands at the hairline
        if ((u <= 0 || u >= 13) && w >= 10) return c; // short at the sides
        if (d <= 1 && w >= 2) return c; // down to the nape
        return null;
      }
      if (w === 14) return d >= 3 && d <= 12 && u >= 1 && u <= 12 && hash3(u, w, d) < 0.5 ? c : null; // tousled on top
      return null;
    }
  },
  // Jake (Shinkansen Dash, the sewer secret): shaved head with a shine, chunky
  // black square glasses, a big smile; a heather-grey hoodie with drawstrings
  // and a kangaroo pocket, black joggers, white sneakers (user picked
  // option C, Oct 13 2026 — not the suit, not the gold jacket).
  jake: {
    skin: 0xf2c1a3, skinShade: 0xdca48a, eye: 0x6c8aa0, brow: 0x8a6a55, mouth: 0xb44a4f, blush: 0xeaa592,
    glasses: 0x17181b, squareGlasses: true,
    shirt: 0x8f959c, shirtDark: 0x70767e, cuff: 0x70767e, pants: 0x2a2d33, shoes: 0xf1f3f5, longSleeves: true,
    print: (x, y, z) => {
      if (y === 0) return 0x70767e; // ribbed hem
      if (z === 6 && y >= 1 && y <= 4 && x >= 2 && x <= 8) return y === 4 || x === 2 || x === 8 ? 0x7c828a : null; // kangaroo pocket
      if (z === 6 && (x === 4 || x === 6) && y >= 6 && y <= 9) return 0xf3f3f3; // drawstrings
      if (z === 6 && x >= 4 && x <= 6 && y === 10) return 0x70767e; // the hood's neckline
      if (hash3(x, y, z + 9) < 0.12) return 0x9aa0a7; // heather
      return null;
    },
    hair: (u, w, d, core) => (core && w === 13 && d >= 7 && d <= 10 && u >= 3 && u <= 6 ? 0xffe2d0 : null) // scalp shine
  },
  // Liam (Shinkansen Dash, a secret at 30,000 points): light-brown swept hair
  // with curtain bangs, blue-grey eyes, rosy cheeks, freckles — dressed as a
  // ninja with his face showing: a red headband (tails at the back), a black
  // crossed-collar top and belt, wrist and shin wraps, split-toe shoes.
  liam: {
    skin: 0xf4cdb4, skinShade: 0xe0ae94, eye: 0x6f8fa6, brow: 0x7a5232, mouth: 0xb8505a, blush: 0xeba08f, freckles: 0xdcae92,
    shirt: 0x1d2027, shirtDark: 0x15171c, cuff: 0x4a505c, pants: 0x1d2027, shoes: 0x101216, legWrap: 0x4a505c, longSleeves: true,
    print: (x, y, z) => {
      if (y >= 1 && y <= 2) return y === 2 && z === 6 && (x === 5 || x === 6) ? 0x2c3038 : 0x30343d; // the belt, knotted at the front
      if (z === 6 && y >= 5 && Math.abs(x - 5) === Math.round((10 - y) * 0.8)) return 0x3a3f4a; // the crossed collar
      return null;
    },
    hair: (u, w, d, core) => {
      const RED = 0xd62c2c, RED2 = 0xb01e1e;
      const band = w >= 10 && w <= 11; // the headband, right round the head
      if (band && (core ? (d === 13 || d === 0 || u === 0 || u === 13) : (u >= -1 && u <= 14 && d >= -1 && d <= 14))) {
        if (!core && (u === -1 || u === 14 || d === -1 || d === 14)) return w === 10 ? RED2 : RED;
        if (core) return null; // (inside: the outer ring shows)
      }
      if (d === -2 && w >= 5 && w <= 10 && (u === 6 || u === 7 || (u === 8 && w <= 8) || (u === 5 && w >= 8))) return w % 2 ? RED : RED2; // its tails
      const n = hash3(u + 9, w * 2, d + 4);
      const c = n < 0.3 ? 0xb58556 : n < 0.72 ? 0x9a6c40 : 0x80572f;
      if (core) {
        if (w >= 12) return c;
        if (d === 13 && w === 9 && (u <= 2 || u >= 11)) return c; // curtain bangs below the band
        if ((u <= 0 || u >= 13) && w >= 5 && w <= 9) return c;
        if (d <= 1 && w >= 3 && w <= 9) return c;
        return null;
      }
      if (w === 14) return u >= 0 && u <= 13 && d >= 0 && d <= 13 ? c : null; // fluffy above the band
      if (w === 15) return u >= 1 && u <= 12 && d >= 2 && d <= 12 && hash3(u, w, d) < 0.5 ? c : null;
      if ((u === -1 || u === 14) && w >= 12 && w <= 13 && d >= 0 && d <= 13) return c;
      if ((u === -1 || u === 14) && w >= 4 && w <= 9 && d >= 1 && d <= 12) return c; // over the ears
      if ((u === -2 || u === 15) && w === 4 && d >= 2 && d <= 11) return c; // flicked out at the ends
      if (d === -1 && w >= 3 && w <= 9 && u >= 0 && u <= 13) return c;
      if (d === -1 && w >= 12 && w <= 13 && u >= 0 && u <= 13) return c;
      return null;
    }
  },
  // Emily: big wavy red hair, blue eyes.
  emily: {
    skin: 0xf6d2b8, skinShade: 0xe3b598, eye: 0x2f5f86, brow: 0xa8431f, mouth: 0xc2414f, blush: 0xf0a7a0, shoes: 0x16202c,
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
    skin: 0xf4cfb4, skinShade: 0xe0b394, eye: 0x3f6f78, brow: 0xb4975c, mouth: 0xc9495c, blush: 0xf2aab0, shoes: 0xe8579a,
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
  return vox(18, look.tallHead ? 23 : 20, 18, (x, y, z) => { // tallHead: room for things on top (Mei's ears)
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
    if (look.browlineGlasses && d === 13) { // clear browline frames: along the brows only, the eyes show through
      if (w === 9 && ((u >= 2 && u <= 5) || (u >= 8 && u <= 11))) return look.glasses;
      if (w === 8 && (u === 6 || u === 7)) return look.glasses; // the bridge
      if (w === 10 && (u === 1 || u === 12)) return look.glasses; // a little lift at the corners
      if ((u === 2 || u === 11) && w === 8) return look.glasses;
    }
    if (look.lashes && d === 13 && w === 8 && ((u >= 3 && u <= 4) || (u >= 9 && u <= 10))) return look.lashes; // lashes
    if (look.lashes && d === 13 && w === 7 && (u === 2 || u === 11)) return look.lashes; // a little winged liner, out at the corners
    if (look.glasses && !look.browlineGlasses && d === 13) { // frames round each eye, a bridge, cat-eye corners (or round)
      const lens = (u >= 2 && u <= 5) || (u >= 8 && u <= 11);
      const corner = look.roundGlasses && (w === 5 || w === 8) && (u === 2 || u === 5 || u === 8 || u === 11); // rounded frames
      if (lens && !corner && w >= 5 && w <= 8 && (u === 2 || u === 5 || u === 8 || u === 11 || w === 5 || w === 8)) return look.glasses;
      if (w === 7 && (u === 6 || u === 7)) return look.glasses;
      if (w === 8 && (u === 1 || u === 12) && !look.roundGlasses && !look.squareGlasses) return look.glasses;
      if (look.squareGlasses && w === 8 && u >= 1 && u <= 12) return look.glasses; // a heavy top bar across
    }
    if (look.freckles && d === 13 && w >= 4 && w <= 5 && (u <= 2 || u >= 11 || u === 6 || u === 7) && hash3(u, w, 77) < 0.45) return look.freckles;
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
    if (look.strap && (z === 6 || z === 0) && Math.abs(x - (1.2 + y * 0.82)) < 0.75) return look.strap; // crossbody strap
    const printed = look.print && look.print(x, y, z); // a pattern or a logo on the shirt
    if (printed) return printed;
    return y === 0 ? look.shirtDark : look.shirt;
  }, V, [5.5, 0, 3.5]);
  const sleeve = look.sleeveless ? 9 : look.longSleeves ? 2 : 6; // (sleeveless: bare arms; long: down to the wrist)
  const arm = vox(3, 10, 4, (x, y, z) => {
    if (y >= sleeve) {
      if (look.longSleeves && y === 2) return look.cuff || look.shirtDark; // ribbed cuff
      const printed = look.sheen && hash3(x, y + 50, z) < 0.18 ? look.sheen : null; // (a metallic sheen)
      return printed || look.shirt;
    }
    return y <= 2 ? look.skinShade : look.skin;
  }, V, [1.5, 10, 2]);
  const leg = vox(3, 10, 4, (x, y, z) => {
    if (y <= 1) return z === 3 && y === 0 ? (look.legWrap ? look.shoes : 0xffffff) : look.shoes;
    if (look.legWrap && y <= 4) return (y + z) % 2 ? look.legWrap : shade(look.legWrap, 0.85); // wrapped shins
    return look.pants;
  }, V, [1.5, 10, 2]);
  // a belt bag at the hip: rust with cream piping, a zip, a little black patch
  const bag = look.bag ? vox(6, 4, 3, (x, y, z) => {
    if (y === 3 && z === 2 && x >= 1 && x <= 4) return 0x8a8f96;
    if (z === 2 && y === 1 && x === 4) return 0x16181c;
    return x === 0 || x === 5 ? look.strap : look.bag;
  }, V, [3, 0, 0]) : null;
  const longHair = look.longHair ? {
    // (straight: each column one shade, the ends a little ragged and the outer columns shorter)
    back: vox(10, 7, 2, (x, y, z) => {
      const edge = x === 0 || x === 9;
      if ((edge && y < 2) || (y === 0 && hash3(x, 0, 1) < 0.5)) return null;
      return look.longHair[Math.floor(hash3(x + 1, 7, z) * 3)];
    }, V, [5, 0, 1]),
    strand: vox(2, 5, 1, (x, y) => (y === 0 && x === 1 ? null : look.longHair[(x * 2 + 1) % 3]), V, [1, 0, 0.5]),
  } : null;
  return { torso, arm, leg, bag, longHair, poncho: look.poncho ? poncho() : null, head: head(look) };
}

/**
 * An Ecuadorian (Otavalo-style) wool poncho: brown, with rust and cream
 * bands, teal diamonds, a cream chakana-like cross on the front and a
 * fringed hem; it hangs from the shoulders over the upper arms to the hips.
 * Pivot: centre of the hem, like the torso.
 */
function poncho() {
  const BROWN = 0x6b4226, DARK = 0x4f2f1a, RUST = 0xc4502a, CREAM = 0xf2e6cf, TEAL = 0x2fa3a0, GOLD = 0xe0a23a;
  return vox(17, 10, 10, (x, y, z) => {
    const cx = x - 8, cz = z - 4.5;
    const hw = y >= 9 ? 5.2 : y === 8 ? 6.2 : 7.2; // sloping shoulders, hanging close to the body (user: Bennett looked fat)
    if (Math.abs(cx) > hw || Math.abs(cz) > 4.4) return null;
    if (Math.abs(cx) < hw - 1.1 && Math.abs(cz) < 3.4 && y < 9) return null; // hollow (the body is inside)
    if (y === 9 && Math.abs(cx) <= 2 && Math.abs(cz) <= 2.5) return null; // neck opening
    if (y === 0) return (x + z) % 2 ? CREAM : null; // fringe
    if (y === 1 || y === 4) return RUST;
    if (y === 2 || y === 3) { // a band of teal diamonds on cream
      const k = (Math.abs(cx) + Math.abs(cz) + (y === 3 ? 1 : 0)) % 4;
      return k === 0 || k === 1 ? TEAL : CREAM;
    }
    if (y === 5) return (x + z) % 3 === 0 ? GOLD : DARK;
    // the chakana cross on the chest (front) and back
    if ((cz >= 3.5 || cz <= -3.5) && y >= 6 && y <= 8 && ((Math.abs(cx) <= 0.5 && y >= 6) || (y === 7 && Math.abs(cx) <= 1.5))) return CREAM;
    return y === 9 ? DARK : BROWN;
  }, V, [8.5, 0, 5]);
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
  // Optional proportions: longer legs/arms, a taller and slimmer torso.
  const b = Object.assign({ legs: 1, torso: 1, slim: 1, arms: 1 }, look.build), hip = 5 * b.legs;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = hip;
  root.add(body);
  const torso = mesh(p.torso);
  torso.scale.set(b.slim, b.torso, b.slim < 1 ? 0.92 : 1);
  body.add(torso);
  const headM = mesh(p.head);
  headM.position.y = 5.5 * b.torso;
  body.add(headM);
  const armL = mesh(p.arm), armR = mesh(p.arm);
  armL.position.set(-3.5 * b.slim, 5.2 * b.torso, 0);
  armR.position.set(3.5 * b.slim, 5.2 * b.torso, 0);
  if (look.build) [armL, armR].forEach((a) => a.scale.set(0.85, b.arms, 0.9));
  body.add(armL, armR);
  const hand = new THREE.Group(); // tool socket in the right hand
  hand.position.set(0, -4.4, 0.6);
  armR.add(hand);
  const legL = mesh(p.leg), legR = mesh(p.leg);
  legL.position.set(-1.2 * b.slim, hip, 0);
  legR.position.set(1.2 * b.slim, hip, 0);
  if (look.build) [legL, legR].forEach((l) => l.scale.set(0.85, b.legs, 0.9));
  root.add(legL, legR);
  if (p.bag) { const bag = mesh(p.bag); bag.position.set(-1.6, 0.3, 1.75); body.add(bag); }
  if (p.poncho) { const po = mesh(p.poncho); po.position.y = 0.6; po.scale.set(b.slim, 1, b.slim < 1 ? 0.92 : 1); body.add(po); } // top just over the shoulders
  if (p.longHair) { // long hair falling down the back, and a strand over each shoulder in front
    const back = mesh(p.longHair.back); back.position.set(0, 5.5 * b.torso - 3.5, -2.7); body.add(back);
    [-1, 1].forEach((sd) => { const st = mesh(p.longHair.strand); st.position.set(sd * 2.6 * b.slim, 5.5 * b.torso - 2.5, 1.95); body.add(st); });
  }
  root.userData = { body, head: headM, armL, armR, legL, legR, hand, hip };
  return root;
}

/**
 * Emily or Heather as a playable hero ("Girl Power" mode): the same jointed
 * rig as makeHero (walk, climb, jump, swing), with the gown's bodice and a
 * knee-length flared skirt so the legs can stride and climb.
 */
export function makeHeroine(key) {
  const look = LOOKS[key];
  const pattern = (x, y, z) => {
    const n = hash3(x >> 1, y >> 1, z >> 1);
    if (n < 0.16) return look.dressPattern;
    if (look.dressLeaf && n < 0.24) return look.dressLeaf;
    return look.dress;
  };
  const torso = vox(11, 11, 7, (x, y, z) => {
    if ((x === 0 || x === 10) && (z === 0 || z === 6)) return null;
    if (y === 10 && z >= 5 && x >= 4 && x <= 6) return look.neck;
    if (y >= 9 && z === 6) return look.trim;
    return pattern(x, y, z);
  }, V, [5.5, 0, 3.5]);
  // skirt: waist (top, y 6) to hem (y 0), flaring out; pivot at the waist
  const skirt = vox(17, 7, 12, (x, y, z) => {
    const f = (6 - y) / 6, hw = 5.6 + f * 2.6, hd = 3.6 + f * 1.8;
    const cx = x - 8, cz = z - 5.5;
    if ((cx * cx) / (hw * hw) + (cz * cz) / (hd * hd) > 1) return null;
    if (y === 0 && look.hem !== look.dress) return look.hem;
    return pattern(x + 3, y, z);
  }, V, [8, 7, 5.5]);
  const arm = vox(3, 10, 4, (x, y) => (y >= 7 ? look.dress : y <= 1 ? look.skinShade : look.skin), V, [1.5, 10, 2]);
  const leg = vox(3, 10, 4, (x, y, z) => (y <= 1 ? (z === 3 && y === 1 ? shade(look.shoes, 1.4) : look.shoes) : look.skin), V, [1.5, 10, 2]);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 5;
  root.add(body);
  body.add(mesh(torso));
  const skirtM = mesh(skirt);
  skirtM.position.y = 0.4;
  body.add(skirtM);
  const headM = mesh(head(look));
  headM.position.y = 5.5;
  body.add(headM);
  const armL = mesh(arm), armR = mesh(arm);
  armL.position.set(-3.5, 5.2, 0);
  armR.position.set(3.5, 5.2, 0);
  body.add(armL, armR);
  const hand = new THREE.Group();
  hand.position.set(0, -4.4, 0.6);
  armR.add(hand);
  const legL = mesh(leg), legR = mesh(leg);
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

/** Emily's big hardback book (she swings it); pivot at the grip on the spine. */
export function makeBook() {
  const g = new VoxBuilder();
  g.add(12, 16, 5, (x, y, z) => {
    const cover = z === 0 || z === 4 || x === 0;
    if (!cover) return x === 11 || y === 0 || y === 15 ? (y % 2 ? 0xfff4d6 : 0xf1e3bf) : 0xfff4d6; // pages
    if (x === 0 && (y === 3 || y === 12)) return 0xf2c94c; // spine bands
    if (z === 4 && y >= 9 && y <= 11 && x >= 3 && x <= 9) return 0xf2c94c; // gold title
    if (z === 4 && y === 6 && x >= 4 && x <= 8) return 0xf2c94c;
    return hash3(x, y, z) < 0.12 ? 0x8f1d1d : 0xb02525;
  }, { size: V, offset: [-0.5, -1, -1.25] });
  return mesh(g.geometry());
}

/** Heather's hairbrush (her power-up: she whips her perfect hair); pivot at the grip. */
export function makeBrush() {
  const g = new VoxBuilder();
  g.add(2, 12, 2, (x, y) => (y % 4 === 0 ? 0xf06595 : 0xf783ac), { size: V, offset: [-0.5, -2, -0.5] });
  g.add(8, 10, 2, (x, y, z) => {
    const cx = x - 3.5, cy = y - 4.5;
    if ((cx * cx) / 16 + (cy * cy) / 25 > 1) return null;
    if (z === 1 && (x + y) % 2 === 0 && (cx * cx) / 9 + (cy * cy) / 16 <= 1) return 0xffffff; // bristles
    return 0xf783ac;
  }, { size: V, offset: [-2, 4, -0.5] });
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
    case 'neonbarrel': return mesh(barrelGeo(0x5f3dc4, 0xff4fd8, 0x1b1046));
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
