// The sewer level (sewer.js) drawn as a lit voxel diorama, side-on — the
// same look as the rest of the game instead of flat 2D (user, Oct 12 2026:
// "The sewer game graphics are worse than the original super Mario. They
// need a 10x improvement"). Gameplay stays 2D in tiles: 1 tile = 1 unit,
// x along the level, y up, the play plane at z = 0, the camera at +z.
//
// What's in it: stone walkways with recessed mortar, mossy tops and a slime
// line where the sludge laps; glossy green pipes (the end pipe hollow, so
// you sink into it); brick ledges; a brick wall with pilasters, arches that
// open onto a second tunnel behind, lanterns (the nearest three light the
// scene), outlet pipes pouring sludge, a vaulted ceiling with street grates
// letting daylight shafts down — and the open manhole you fell through;
// a moving sludge surface with bubbles and a floating rubber duck; spinning
// five-yen coins; rats with wiggling tails and red eyes; the traveller
// themself, running, jumping, skidding; dust, splashes, sparkles and drips.
import * as THREE from 'three';
import { VoxBuilder, hash3 } from '../rampage/voxel.js';
import { MAT, mesh, shade } from '../rampage/models.js';
import { LEVEL, PW, PH, ratAt, RAT_W } from './sewer.js';

const X0 = LEVEL.FLOORS[0][0] - 6, X1 = LEVEL.LENGTH + 10; // how far the tunnel is built
const WALL_Z = -2.75, CEIL = 9.5, SLUDGE_Y = -0.75;
const ARCHES = [], LAMPS = [], OUTLETS = [], GRATES = [];
for (let x = 9; x < X1 - 6; x += 14) ARCHES.push(x); // arch centres
for (let x = 2; x < X1 - 4; x += 14) LAMPS.push(x); // lanterns between them
LEVEL.FLOORS.forEach(([, b], i) => { const nx = LEVEL.FLOORS[i + 1]; if (nx) OUTLETS.push((b + nx[0]) / 2); }); // pouring into each pit
for (let x = 30; x < X1 - 8; x += 34) GRATES.push(x); // street grates in the ceiling (and the manhole at x 1)
const inArch = (wx, wy) => ARCHES.some((c) => {
  const dx = wx - c;
  if (Math.abs(dx) > 2.25) return false;
  return wy > 0.2 && (wy < 3.6 || Math.hypot(dx, wy - 3.6) < 2.25);
});

export function createSewer3D({ renderer, heroes, pose, heroScale, env, lowPower }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1116);
  scene.fog = new THREE.Fog(0x0b1317, 30, 70);
  if (env) { scene.environment = env; scene.environmentIntensity = 0.35; }
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200);

  // ---- light: a cool fill, a soft key from the front, and warm lanterns ------------------------
  scene.add(new THREE.HemisphereLight(0xa9c6d6, 0x3a2c1e, 1.35));
  const key = new THREE.DirectionalLight(0xdbe8ff, 1.6);
  key.castShadow = !lowPower;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 12, bottom: -6, near: 1, far: 60 });
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03;
  scene.add(key, key.target);
  const lamps = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffb45a, 26, 15, 1.4); scene.add(l); return l; });
  const exitGlow = new THREE.PointLight(0x8cff9a, 18, 9, 1.6);
  exitGlow.position.set(LEVEL.EXIT.x + LEVEL.EXIT.w / 2, LEVEL.EXIT.h + 1.5, 1.2);
  scene.add(exitGlow);

  // ---- materials -------------------------------------------------------------------------------
  const GLOSS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05 }); // wet pipes
  const WETSTONE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
  const GLOWM = new THREE.MeshBasicMaterial({ vertexColors: true });
  const GOLD = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.55, emissive: 0x7a5200 });

  function canvasTex(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const glowTex = canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.25, 'rgba(255,200,120,0.55)'); g.addColorStop(1, 'rgba(255,170,80,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  const shaftTex = canvasTex(64, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,248,215,0.6)'); g.addColorStop(0.6, 'rgba(255,248,215,0.18)'); g.addColorStop(1, 'rgba(255,248,215,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const s = c.createLinearGradient(0, 0, w, 0); // soft edges
    s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(0.3, 'rgba(0,0,0,0)'); s.addColorStop(0.7, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(0,0,0,1)');
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = s; c.fillRect(0, 0, w, h);
  });
  const fallTex = canvasTex(64, 128, (c, w, h) => { // a stream of sludge
    c.fillStyle = 'rgba(110,72,34,0.92)'; c.fillRect(8, 0, w - 16, h);
    for (let i = 0; i < 60; i++) {
      c.fillStyle = rnd() < 0.5 ? 'rgba(160,112,58,0.9)' : 'rgba(70,46,22,0.9)';
      c.fillRect(8 + rnd() * (w - 20), rnd() * h, 2 + rnd() * 4, 8 + rnd() * 20);
    }
  });
  fallTex.wrapT = THREE.RepeatWrapping;
  const sludgeTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#5b3c1d'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w, y = rnd() * h, r = 4 + rnd() * 18;
      c.fillStyle = ['rgba(122,82,42,0.5)', 'rgba(72,48,22,0.5)', 'rgba(96,110,40,0.35)', 'rgba(150,108,60,0.4)'][i % 4];
      c.beginPath(); c.ellipse(x, y, r * 1.8, r * 0.6, rnd() * 3, 0, Math.PI * 2); c.fill();
    }
  });
  sludgeTex.wrapS = sludgeTex.wrapT = THREE.RepeatWrapping;

  // ---- the walkways ------------------------------------------------------------------------------
  const VS = 0.25;
  function floorMesh(a, b, endL = true, endR = true) {
    const nx = Math.round((b - a) / VS), ny = 18, nz = 12; // y -4.5…0, z -1.5…1.5
    const bld = new VoxBuilder();
    bld.add(nx, ny, nz, (x, y, z) => {
      const wx = a + (x + 0.5) * VS, wy = -4.5 + (y + 0.5) * VS, top = y === ny - 1, front = z === nz - 1;
      const tile = Math.floor(wx), n = hash3(x, y, z);
      if (top) {
        if (x % 4 === 0 || z === 0) return null; // seams between the paving slabs (recessed)
        if (z >= nz - 2 && hash3(x, 9, z) < 0.3) return n < 0.5 ? 0x5f7d3a : 0x4d6a2f; // moss along the front edge
        return shade(0x8a96a2, 0.86 + hash3(tile, 3, 7) * 0.22 + (n - 0.5) * 0.06);
      }
      if (y === ny - 2 && (x % 4 === 0 || z === 0)) return 0x3c4651; // (the seams' floor)
      const row = Math.floor((ny - 1 - y) / 3), off = (row % 2) * 2;
      const mortar = (x + off) % 6 === 0 || (ny - 1 - y) % 3 === 0;
      if (front || (endL && x === 0) || (endR && x === nx - 1)) {
        if (mortar && y < ny - 1 && (front || true)) return null; // recessed mortar on the faces
        const wet = wy < SLUDGE_Y + 0.25, slime = wy < SLUDGE_Y + 0.5 && hash3(x, 4, 1) < 0.55;
        const streak = hash3(x >> 1, 7, 3) < 0.22 && wy > SLUDGE_Y; // grime running down
        let c = shade(0x6f7c89, 0.85 + hash3(Math.floor((x + off) / 6), row, 2) * 0.25);
        if (streak) c = shade(c, 0.78);
        if (slime) c = n < 0.5 ? 0x4f6a2a : 0x3f5a22;
        if (wet) c = shade(c, 0.6);
        return c;
      }
      return mortar ? 0x2e3640 : 0x56626e;
    }, { size: VS, offset: [a, -4.5, -1.5] });
    return mesh(bld.geometry(), WETSTONE);
  }

  // ---- pipes (glossy, round; the end pipe is hollow) ----------------------------------------------
  function pipeMesh(w, h, big) {
    const S = 0.1, lip = 0.45, nx = Math.round((w + 0.3) / S), ny = Math.round(h / S), nz = nx;
    const cx = nx / 2, r = w / 2 / S, rl = r + 1.5;
    const bld = new VoxBuilder();
    bld.add(nx, ny, nz, (x, y, z) => {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cx, d = Math.hypot(dx, dz), inLip = y >= ny - lip / S;
      if (d > (inLip ? rl : r)) return null;
      if (big && inLip && d < r - 2.5 && y >= ny - 6) return y === ny - 6 ? 0x081208 : null; // the hollow mouth
      if (inLip && y === ny - 1 && d < rl - 1.2) return big && d < r - 1.5 ? 0x0e2412 : 0x37b24d;
      const a = Math.atan2(dz, dx); // light from the upper left, a bright stripe, dark round the back
      const lit = Math.cos(a - 2.0);
      let c = lit > 0.82 ? 0x9ef0a8 : lit > 0.35 ? 0x3cbf55 : lit > -0.3 ? 0x2b9a42 : 0x1d6e2f;
      if (inLip && y === Math.round(ny - lip / S)) c = shade(c, 0.7); // the lip's underside
      if (!inLip && hash3(x, y >> 2, z) < 0.04) c = 0x6b5530; // a little grime
      return c;
    }, { size: S, offset: [-nx * S / 2, 0, -nx * S / 2] });
    return mesh(bld.geometry(), GLOSS);
  }

  // ---- brick ledges ---------------------------------------------------------------------------
  function ledgeMesh(w, bot, top) {
    const S = 0.125, nx = Math.round(w / S), ny = Math.round((top - bot) / S), nz = 10;
    const bld = new VoxBuilder();
    bld.add(nx, ny, nz, (x, y, z) => {
      const bx = x % 8, mortarX = bx === 0, mortarY = y === 0;
      const face = z === nz - 1 || y === ny - 1;
      if (face && (mortarX || (y === Math.floor(ny / 2) && z === nz - 1)) && y > 0) return null; // block seams, recessed
      if (y === ny - 1) return bx === 1 || z === 1 ? 0xe9925a : 0xd2743f; // a lit top edge
      if (mortarY) return 0x6e2f12;
      const row = y < ny / 2 ? 0 : 1, half = ((x + row * 4) % 8) < 4;
      return shade(half ? 0xbd5a2c : 0xa94d24, 0.92 + hash3(x >> 2, y >> 1, 5) * 0.16);
    }, { size: S, offset: [0, bot, -nz * S / 2] });
    return mesh(bld.geometry(), MAT);
  }

  // ---- the wall, its arches, and the tunnel behind ------------------------------------------------
  function wallChunk(c0, c1) {
    const S = 0.25, nx = Math.round((c1 - c0) / S), y0 = -1.5, ny = Math.round((CEIL + 0.75 - y0) / S), nz = 4;
    const bld = new VoxBuilder();
    bld.add(nx, ny, nz, (x, y, z) => {
      const wx = c0 + (x + 0.5) * S, wy = y0 + (y + 0.5) * S;
      if (inArch(wx, wy)) return null;
      // trims, standing out: pilasters, arch rings, a cornice under the vault
      const pil = LAMPS.some((l) => Math.abs(wx - (l + 7)) < 0.45) && !inArch(wx, wy);
      const ring = ARCHES.some((c) => { const dx = wx - c; return wy > 0.2 && Math.abs(dx) < 2.85 && (wy < 3.6 ? Math.abs(dx) > 2.25 : Math.hypot(dx, wy - 3.6) < 2.85 && Math.hypot(dx, wy - 3.6) >= 2.25); });
      const cornice = wy > CEIL - 0.75;
      if (z === 3) {
        if (ring) { const c = ARCHES.find((q) => Math.abs(wx - q) < 2.85); const k = Math.floor((Math.atan2(wy - 3.6, wx - c) + 9) * 4); return wy < 3.6 ? (y % 3 ? 0x6f685c : 0x7d7567) : k % 2 ? 0x6f685c : 0x857c6d; }
        if (pil) return wy < 0 ? 0x4b4f4f : (y % 4 === 0 ? 0x6a6e6c : 0x7c807d);
        if (cornice) return y % 2 ? 0x5e5a52 : 0x6b665d;
        if ((Math.abs(wy - 7.4) < 0.4 || Math.abs(wy - 6.7) < 0.3) && Math.abs(((wx % 7) + 7) % 7 - 3.5) < 0.15) return 0x2b2b2e; // pipe brackets
        if (OUTLETS.some((o) => Math.abs(wx - o - 2.2) < 0.6 && wy > 2.4 && wy < 3)) return (Math.floor((wx + wy) * 4) % 2) ? 0xffd43b : 0x1d1d1f; // a hazard plate by each outlet
        return null;
      }
      // bricks: 1 × 0.5 tiles, mortar recessed one voxel
      const row = Math.floor(y / 2), bx = (x + (row % 2) * 2) % 4, mortar = bx === 0 || y % 2 === 0;
      if (z === 2) {
        if (mortar) return null;
        const id = Math.floor((x + (row % 2) * 2) / 4) * 131 + row;
        let c = shade([0x6d4a3a, 0x7a5040, 0x5f4034, 0x84584a][Math.floor(hash3(id, 1, 2) * 4)], 0.85 + hash3(id, 3, 4) * 0.25);
        if (wy < 0.3 && hash3(x, y, 9) < 0.6) c = hash3(x, 2, y) < 0.5 ? 0x4c6230 : 0x3d5426; // slime along the bottom
        else if (wy < 1.2 && hash3(x >> 1, 8, 2) < 0.3) c = shade(c, 0.7); // damp
        if (OUTLETS.some((o) => Math.abs(wx - o) < 0.5) && wy < 2 && wy > 0.2) c = shade(0x5a4a2a, 0.9); // sludge stains under the outlets
        return c;
      }
      return 0x2a2422; // mortar, and the back of the wall
    }, { size: S, offset: [c0, y0, WALL_Z] });
    return mesh(bld.geometry(), MAT);
  }
  function ceilingChunk(c0, c1) {
    const S = 0.25, nx = Math.round((c1 - c0) / S), nz = Math.round((4.5 - WALL_Z) / S);
    const bld = new VoxBuilder();
    bld.add(nx, 4, nz, (x, y, z) => {
      const wx = c0 + (x + 0.5) * S, wz = WALL_Z + (z + 0.5) * S;
      const grate = GRATES.some((g) => Math.abs(wx - g) < 0.9) || Math.abs(wx - 1) < 0.95;
      if (grate && wz > -0.8 && wz < 0.8) return (x + z) % 2 && !(Math.abs(wx - 1) < 0.95) ? 0x23262a : null; // bars (the manhole is open)
      const rib = LAMPS.some((l) => Math.abs(wx - (l + 7)) < 0.4);
      if (y === 0 && !rib) return null;
      const row = Math.floor(z / 2), bx = (x + (row % 2) * 2) % 4;
      return rib ? 0x6b665d : bx === 0 || z % 2 === 0 ? 0x2a2422 : shade(0x5c4136, 0.85 + hash3(x >> 2, row, 3) * 0.25);
    }, { size: S, offset: [c0, CEIL - 0.25, WALL_Z] });
    return mesh(bld.geometry(), MAT);
  }
  // the second tunnel, seen through the arches: coarser, lit by its own lamps
  function farTunnel(c0, c1) {
    const S = 0.5, nx = Math.round((c1 - c0) / S), ny = Math.round((CEIL + 1.5) / S);
    const bld = new VoxBuilder();
    bld.add(nx, ny, 1, (x, y) => {
      const wx = c0 + x * S, bx = (x + (y % 2)) % 2;
      if (LAMPS.some((l) => Math.abs(wx - (l + 7)) < 0.3 && y >= 9 && y <= 10)) return 0xffd27a;
      return bx === 0 && y % 2 === 0 ? shade(0x3a2e26, 0.9) : shade(0x4a3a30, 0.8 + hash3(x >> 1, y, 2) * 0.3);
    }, { size: S, offset: [c0, -1, -10.5] });
    bld.add(nx, 1, 6, (x, y, z) => shade(0x4c555e, 0.85 + hash3(x, z, 3) * 0.2), { size: S, offset: [c0, -0.5, -10] }); // its walkway
    return mesh(bld.geometry(), MAT);
  }

  // ---- above: the earth over the vault, cut away at the front -------------------
  const STREET = CEIL + 3.25;
  function groundChunk(c0, c1) { // the earth over the vault, cut away at the front: soil, clay, stones, roots, a water main
    const S = 0.25, nx = Math.round((c1 - c0) / S), ny = Math.round((STREET - CEIL - 0.25) / S), nz = Math.round((4.5 - WALL_Z) / S);
    const bld = new VoxBuilder();
    bld.add(nx, ny, nz, (x, y, z) => {
      const wx = c0 + (x + 0.5) * S, wz = WALL_Z + (z + 0.5) * S, wy = CEIL + 0.25 + (y + 0.5) * S;
      if (Math.abs(wx - 1) < 0.9 && Math.abs(wz) < 0.9) return null; // the shaft up to the open manhole
      if (z < nz - 2 && y < ny - 1) return null; // (only the cut face and the top are ever seen)
      const n = hash3(x, y, z), band = wy + Math.sin(wx * 0.35) * 0.25;
      if (Math.hypot(((wx % 26) + 26) % 26 - 13, wy - (CEIL + 1.4)) < 0.45) return ((x + y) % 3 ? 0x5b6f80 : 0x6c8294); // a water main
      if (n < 0.05) return 0x8d8a82; // stones
      if (hash3(x >> 1, y, 3) < 0.03) return 0x8a6a45; // roots
      return band < CEIL + 1.0 ? shade(0x4a3626, 0.85 + n * 0.2) : band < CEIL + 2 ? shade(0x6b4f35, 0.85 + n * 0.2) : shade(0x7e6a52, 0.85 + n * 0.2);
    }, { size: S, offset: [c0, CEIL + 0.25, WALL_Z] });
    return mesh(bld.geometry(), MAT);
  }

  // ---- props --------------------------------------------------------------------------------------
  function lampMesh() {
    const g = new THREE.Group(), S = 0.06, b = new VoxBuilder();
    b.add(9, 14, 9, (x, y, z) => {
      const cx = Math.abs(x - 4), cz = Math.abs(z - 4);
      if (y >= 12) return cx <= 2 && cz <= 2 ? 0x2b2b2e : null; // cap
      if (y <= 1) return cx <= 3 && cz <= 3 ? 0x2b2b2e : null; // base
      if (cx === 3 && cz === 3) return 0x2b2b2e; // frame
      return null;
    }, { size: S, offset: [-4.5 * S, -7 * S, -4.5 * S] });
    b.add(2, 2, 10, () => 0x2b2b2e, { size: S, offset: [-0.06, 0.38, -0.6] }); // bracket to the wall
    g.add(mesh(b.geometry(), MAT));
    const glass = new VoxBuilder();
    glass.add(5, 10, 5, (x, y) => (y > 7 ? 0xfff2c8 : 0xffc56a), { size: S, offset: [-2.5 * S, -5 * S, -2.5 * S] });
    g.add(mesh(glass.geometry(), GLOWM));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    halo.scale.set(3.4, 3.4, 1);
    g.add(halo);
    g.userData.halo = halo;
    return g;
  }
  function outletMesh() {
    const b = new VoxBuilder(), S = 0.1;
    b.add(10, 10, 6, (x, y, z) => {
      const d = Math.hypot(x - 4.5, y - 4.5);
      if (d > 5) return null;
      if (d < 3.2) return z < 5 ? 0x140e0a : null;
      return d > 4.3 ? 0x5d4a3a : 0x8a6a4a; // rusty rim
    }, { size: S, offset: [-0.5, -0.5, 0] });
    return mesh(b.geometry(), MAT);
  }
  function coinMesh() {
    const b = new VoxBuilder(), S = 0.065, n = 12;
    b.add(n, n, 2, (x, y) => {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2);
      if (d > n / 2 || d < 1.5) return null; // a five-yen coin, with its hole
      return d > n / 2 - 1.2 || d < 2.4 ? 0xd9961c : 0xf6c945;
    }, { size: S, offset: [-n * S / 2, -n * S / 2, -S] });
    return mesh(b.geometry(), GOLD);
  }
  function ratModel() {
    const g = new THREE.Group(), S = 0.075;
    const FUR = 0x7c818b, FUR2 = 0x666b74, BELLY = 0xb3b8bf, PINK = 0xf0a6b4;
    const body = new VoxBuilder();
    body.add(13, 8, 8, (x, y, z) => { // x along the body, nose at +x
      const ex = (x - 6) / 6.5, ey = (y - 3.5) / 4, ez = (z - 3.5) / 4;
      if (ex * ex + ey * ey + ez * ez > 1) return null;
      if (y <= 2 && Math.abs(z - 3.5) < 2.5) return BELLY;
      return hash3(x, y, z) < 0.3 ? FUR2 : FUR;
    }, { size: S, offset: [-6.5 * S, 0.12, -4 * S] });
    body.add(6, 5, 5, (x, y, z) => { // head and snout
      if (x >= 4 && (y < 1 || y > 3 || z < 1 || z > 3)) return null;
      if (x === 5) return y === 2 && z === 2 ? PINK : null;
      return FUR;
    }, { size: S, offset: [5 * S, 0.12 + 2 * S, -2.5 * S] });
    body.add(2, 3, 7, (x, y, z) => (z === 0 || z === 6 ? (y === 1 ? PINK : FUR2) : null), { size: S, offset: [5 * S, 0.12 + 6 * S, -3.5 * S] }); // ears
    g.add(mesh(body.geometry(), MAT));
    const eyes = new VoxBuilder();
    eyes.add(1, 1, 5, (x, y, z) => (z === 0 || z === 4 ? 0xff2a2a : null), { size: S, offset: [8.05 * S, 0.12 + 4 * S, -2.5 * S] });
    g.add(mesh(eyes.geometry(), GLOWM));
    const legs = [];
    [[-3, -2.5], [-3, 1.5], [3, -2.5], [3, 1.5]].forEach(([lx, lz]) => {
      const leg = mesh(new VoxBuilder().add(2, 3, 2, () => FUR2, { size: S, offset: [-S, -3 * S, -S] }).geometry(), MAT);
      leg.position.set(lx * S, 0.16, lz * S); g.add(leg); legs.push(leg);
    });
    const tail = [];
    let parent = g;
    for (let i = 0; i < 7; i++) { // a pink tail in segments, each turning a little more
      const seg = mesh(new VoxBuilder().add(3, 1, 1, () => (i < 2 ? 0xd98a98 : PINK), { size: S, offset: [-3 * S, -S / 2, -S / 2] }).geometry(), MAT);
      seg.position.set(i === 0 ? -6.5 * S : -3 * S, i === 0 ? 0.3 : 0, 0);
      parent.add(seg); tail.push(seg); parent = seg;
    }
    g.userData = { legs, tail };
    return g;
  }
  function duckModel() {
    const b = new VoxBuilder(), S = 0.07;
    b.add(9, 9, 7, (x, y, z) => {
      const body = ((x - 4) / 4.5) ** 2 + ((y - 1.5) / 2.5) ** 2 + ((z - 3) / 3.5) ** 2 <= 1 && y <= 3;
      const head = Math.hypot(x - 6, y - 5.5, z - 3) <= 2.2;
      if (x === 8 && y === 5 && z >= 2 && z <= 4) return 0xf08c1e; // beak
      if (head && y === 6 && (z === 1 || z === 5) && x === 7) return 0x111111;
      return body || head ? 0xffd43b : null;
    }, { size: S, offset: [-4.5 * S, -0.08, -3.5 * S] });
    return mesh(b.geometry(), MAT);
  }
  function grateGlow() { // daylight in a grate (or the open manhole)
    const b = new VoxBuilder();
    b.box(-0.8, 0, -0.8, 1.6, 0.1, 1.6, 0xeaf4ff, 0.1);
    return mesh(b.geometry(), GLOWM);
  }

  // ---- build the level ---------------------------------------------------------------------------
  const world = new THREE.Group();
  scene.add(world);
  // Static pieces are placed once (no per-frame matrix updates) and get shadows.
  function place(o) {
    o.traverse((q) => {
      if (q.isMesh && q.material !== GLOWM && !q.material.blending) { q.receiveShadow = true; q.castShadow = q.material === GLOSS; }
      q.updateMatrix(); q.matrixAutoUpdate = false;
    });
    world.add(o);
    return o;
  }
  // The big pieces (walls, vault, the ground above, the far tunnel, most
  // walkways) are built a few milliseconds at a time while you're on the
  // trains (pump()), so neither the start nor a frame of play waits for
  // them; the first walkway is built now so its shader is warmed up.
  const jobs = [];
  LEVEL.FLOORS.forEach(([a, b], i) => {
    for (let c = a; c < b; c += 8) {
      const c1 = Math.min(b, c + 8), make = () => place(floorMesh(c, c1, c === a, c1 === b));
      if (i === 0 && c === a) make(); else jobs.push(make);
    }
  });
  for (let c = X0; c < X1; c += 16) {
    const c1 = Math.min(X1, c + 16);
    jobs.push(() => place(wallChunk(c, c1)), () => place(ceilingChunk(c, c1)), () => place(groundChunk(c, c1)), () => place(farTunnel(c, c1)));
  }
  function pump(ms) {
    const t0 = performance.now();
    while (jobs.length) { jobs.shift()(); if (performance.now() - t0 >= ms) break; } // (at least one each call)
  }
  const ready = () => jobs.length === 0;
  LEVEL.PIPES.forEach(([x, w, h], i) => {
    const make = () => { const m = pipeMesh(w, h, false); m.position.set(x + w / 2, 0, 0); place(m); };
    if (i === 0) make(); else jobs.push(make);
  });
  jobs.push(() => { const m = pipeMesh(LEVEL.EXIT.w, LEVEL.EXIT.h, true); m.position.set(LEVEL.EXIT.x + LEVEL.EXIT.w / 2, 0, 0); place(m); });
  LEVEL.LEDGES.forEach(([x, w, b, t], i) => {
    const make = () => { const m = ledgeMesh(w, b, t); m.position.x = x; place(m); };
    if (i === 0) make(); else jobs.push(make);
  });
  // round pipes along the wall: copper and steel, glossy
  [[7.4, 0.24, 0xc8743a, 0.55], [6.7, 0.13, 0x9aa3ad, 0.6]].forEach(([y, r, col, metal]) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, X1 - X0, 12, 1), new THREE.MeshStandardMaterial({ color: col, roughness: 0.32, metalness: metal }));
    m.rotation.z = Math.PI / 2; m.position.set((X0 + X1) / 2, y, WALL_Z + 1 + r); place(m);
  });
  const lampProto = lampMesh(); // (one lantern built; the rest share its geometry)
  const lampObjs = LAMPS.map((x) => {
    const l = new THREE.Group(); l.add(new THREE.Mesh(lampProto.children[0].geometry, MAT), new THREE.Mesh(lampProto.children[1].geometry, GLOWM));
    const halo = new THREE.Sprite(lampProto.userData.halo.material.clone()); halo.scale.set(3.4, 3.4, 1); l.add(halo); l.userData.halo = halo;
    l.position.set(x, 5.4, WALL_Z + 1.35); return place(l);
  });
  OUTLETS.forEach((x) => { const o = outletMesh(); o.position.set(x, 1.6, WALL_Z + 1); place(o); });
  const falls = OUTLETS.map((x) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 2.45), new THREE.MeshLambertMaterial({ map: fallTex, transparent: true, depthWrite: false }));
    m.position.set(x, 1.6 - 1.2, WALL_Z + 1.35); return place(m);
  });
  [1, ...GRATES].forEach((x) => { const g = grateGlow(); g.position.set(x, CEIL + 0.8, 0); place(g); });
  const shafts = [1, ...GRATES].map((x) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x === 1 ? 2.2 : 1.8, CEIL + 1), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: x === 1 ? 0.55 : 0.35, fog: false }));
    m.position.set(x + 0.6, CEIL / 2 - 0.3, 0.2); m.rotation.z = -0.12; return place(m);
  });
  // a big glowing arrow over the way out
  const arrow = new THREE.Group();
  const ab = new VoxBuilder();
  ab.add(7, 7, 1, (x, y) => ((y >= 3 && Math.abs(x - 3) <= 1) || (y < 3 && Math.abs(x - 3) <= y) ? 0x8cff9a : null), { size: 0.14, offset: [-0.49, 0, -0.07] });
  arrow.add(mesh(ab.geometry(), GLOWM));
  const arrowHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8cff9a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  arrowHalo.scale.set(2.4, 2.4, 1); arrowHalo.position.y = 0.5; arrow.add(arrowHalo);
  world.add(arrow);

  // sludge: a moving window of rippling surface that follows the camera
  const SW = 48, SD = 16;
  const sludgeGeo = new THREE.PlaneGeometry(SW, SD, lowPower ? 48 : 96, lowPower ? 12 : 24);
  sludgeGeo.rotateX(-Math.PI / 2);
  const sludgeBase = Float32Array.from(sludgeGeo.attributes.position.array);
  sludgeTex.repeat.set(SW / 6, SD / 6);
  const sludge = new THREE.Mesh(sludgeGeo, new THREE.MeshStandardMaterial({ map: sludgeTex, color: 0xb08a60, roughness: 0.22, metalness: 0.15 }));
  sludge.receiveShadow = true;
  scene.add(sludge);
  const deepTex = canvasTex(256, 256, (c, w, h) => { // looking into the channel through its cut-away front
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#6b4724'); gr.addColorStop(0.35, '#3e2912'); gr.addColorStop(1, '#140d06');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(${150 + rnd() * 60},${110 + rnd() * 40},${60 + rnd() * 30},${0.25 + rnd() * 0.35})`; c.beginPath(); c.arc(rnd() * w, rnd() * h * 0.8, 1 + rnd() * 3, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = 'rgba(200,170,120,0.5)'; c.fillRect(0, 0, w, 3); // the surface line
  });
  deepTex.wrapS = THREE.RepeatWrapping;
  deepTex.repeat.set(SW / 8, 1);
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(SW, 10), new THREE.MeshBasicMaterial({ map: deepTex, transparent: true, opacity: 0.84, depthWrite: false }));
  deep.renderOrder = 2;
  scene.add(deep);
  // under the surface, murky through the channel's cut-away front: its brick bed and some junk
  jobs.push(() => {
    const b = new VoxBuilder();
    b.add(Math.round((X1 - X0) / 0.5), 2, 12, (x, y, z) => shade(z % 2 ? 0x4a3a30 : 0x3e3029, 0.85 + hash3(x, y, z) * 0.2), { size: 0.5, offset: [X0, -6, -2] });
    for (let x = X0 + 7; x < X1; x += 19) { // a bicycle wheel, a boot, a fish skeleton…
      const k = Math.floor(x) % 3, ox = x, oy = -5 + hash3(Math.floor(x), 1, 1) * 1.5;
      if (k === 0) b.add(14, 14, 1, (a, c) => { const d = Math.hypot(a - 6.5, c - 6.5); return (d > 5.5 && d < 7) || (d < 6 && (a === 6 || c === 6 || a === c || a + c === 13)) ? 0x6b7078 : null; }, { size: 0.1, offset: [ox, oy, 2.4] });
      else if (k === 1) b.add(6, 6, 3, (a, c) => (c < 2 || a < 2 ? 0x3a2a1e : null), { size: 0.12, offset: [ox, oy, 2.4] });
      else b.add(16, 7, 1, (a, c) => ((c === 3 && a < 13) || (a % 3 === 0 && a < 12 && Math.abs(c - 3) < 3) || (a >= 12 && Math.abs(c - 3) <= 15 - a) ? 0xd8d2c0 : null), { size: 0.08, offset: [ox, oy, 2.4] });
    }
    place(mesh(b.geometry(), MAT));
  });
  const ducks = [[19.6, 0], [85.4, 1], [111, 2]].map(([x, i]) => { const d = duckModel(); d.userData.x = x; d.userData.i = i; scene.add(d); return d; });

  // coins and rats
  const coins = LEVEL.COINS.map(([x, y]) => { const c = coinMesh(); c.position.set(x, y, 0); scene.add(c); return c; });
  const rats = LEVEL.RATS.map(() => { const r = ratModel(); scene.add(r); return r; });
  const ratDead = LEVEL.RATS.map(() => null);

  rats.forEach((r) => r.traverse((o) => { if (o.isMesh) o.castShadow = true; }));
  world.updateMatrix(); world.matrixAutoUpdate = false;

  // particles: dust, splashes, sparkles, drips
  const PN = 220;
  const parts = [];
  const partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: true }), PN);
  partMesh.frustumCulled = false;
  partMesh.setColorAt(0, new THREE.Color(0xffffff));
  scene.add(partMesh);
  function puff(x, y, z, cols, n, spd, up, size, life, grav) {
    for (let i = 0; i < n && parts.length < PN; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random() * 0.8);
      parts.push({ x, y, z, vx: Math.cos(a) * v, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * v * 0.6, t: life * (0.6 + Math.random() * 0.6), col: new THREE.Color(cols[i % cols.length]), s: size * (0.6 + Math.random() * 0.7), g: grav ?? 14 });
    }
  }

  // ---- the traveller -------------------------------------------------------------------------------
  const KEYS = ['bob', 'lean', 'legL', 'legR', 'armL', 'armR', 'armLz', 'armRz', 'nod', 'look'];
  const live = {};
  KEYS.forEach((k) => { live[k] = 0; });
  const HERO_K = heroScale * 0.86; // 1.7 m tall on the trains → ~1.6 tiles here
  let camX = 0, span = 10, dist = 30, last = null, shownT = -1;

  function layout(cw, ch) {
    camera.aspect = cw / ch;
    // Fit about 8½ tiles across on a phone (or 12 tall on a wide screen) at the play plane.
    const tan = Math.tan((camera.fov / 2) * Math.PI / 180);
    dist = Math.max(4.25 / (tan * Math.min(1.6, camera.aspect)), 6 / tan);
    span = 2 * dist * tan * camera.aspect;
    scene.fog.near = dist + 1; scene.fog.far = dist + 34;
    camera.updateProjectionMatrix();
  }

  function draw(S, dt) {
    pump(1e9); // (anything not built yet, now)
    const sw = S.sewer, s = sw.s, t = s.t;
    const hero = heroes[S.hero];
    if (hero.parent !== scene) scene.add(hero);
    Object.values(heroes).forEach((h) => { if (h !== hero) h.visible = false; });
    if (sw !== last) { // a fresh trip down: reset the camera and the bookkeeping
      last = sw; camX = s.x - span * 0.3; shownT = -1;
      ratDead.fill(null); parts.length = 0;
      coins.forEach((c) => { c.visible = true; c.scale.setScalar(1); });
      sw.seen = { coins: s.coins.slice(), rats: s.rats.slice(), ground: true, skid: false, dead: false, done: false };
    }
    // the camera keeps you in a band left of centre, and scrolls back with you
    camX = Math.max(X0 + span / 2, Math.min(X1 - span / 2, Math.max(s.x - span * 0.08, Math.min(camX, s.x + span * 0.05))));
    sw.cam = camX - span / 2;
    // a diorama's tilt: looking a little down onto the walkway, the floor about 60% down the screen
    const vh = dist * Math.tan((camera.fov / 2) * Math.PI / 180), cy = 0.2 * vh;
    camera.position.set(camX, cy + dist * 0.16, dist);
    camera.lookAt(camX, cy, 0);
    key.position.set(camX - 8, 16, 18); key.target.position.set(camX, 0, 0); key.target.updateMatrixWorld();

    // the three lanterns nearest the camera light the scene
    const near = LAMPS.map((x, i) => [Math.abs(x - camX), i]).sort((a, b) => a[0] - b[0]).slice(0, 3);
    near.forEach(([, i], k) => {
      lamps[k].position.set(LAMPS[i], 5.2, WALL_Z + 1.8);
      lamps[k].intensity = 26 * (0.92 + Math.sin(t * 9 + i * 3) * 0.04 + (hash3(Math.floor(t * 12), i, 1) < 0.03 ? -0.3 : 0)); // a flicker
    });
    lampObjs.forEach((l, i) => { l.userData.halo.material.opacity = 0.75 + Math.sin(t * 9 + i * 3) * 0.08; });
    exitGlow.intensity = 14 + Math.sin(t * 3) * 4;
    arrow.position.set(LEVEL.EXIT.x + LEVEL.EXIT.w / 2, LEVEL.EXIT.h + 1.3 + Math.abs(Math.sin(t * 3)) * 0.35, 0.3);
    falls.forEach((f) => { f.material.map.offset.y = -t * 1.2; });
    shafts.forEach((m, i) => { m.material.opacity = (i === 0 ? 0.55 : 0.33) + Math.sin(t * 0.8 + i) * 0.05; });

    // the sludge ripples (only the stretch under the camera exists)
    const ox = Math.round(camX), pos = sludgeGeo.attributes.position.array;
    sludge.position.set(ox, SLUDGE_Y, -4);
    for (let i = 0; i < pos.length; i += 3) {
      const wx = sludgeBase[i] + ox, wz = sludgeBase[i + 2];
      pos[i + 1] = Math.sin(wx * 0.9 + t * 1.6) * 0.05 + Math.sin(wz * 1.3 - t * 1.1 + wx * 0.3) * 0.04;
    }
    sludgeGeo.attributes.position.needsUpdate = true;
    sludgeGeo.computeVertexNormals();
    sludgeTex.offset.set(ox / 6 + t * 0.02, -t * 0.015);
    deep.position.set(ox, SLUDGE_Y - 5, 4); deepTex.offset.x = ox / 8;
    ducks.forEach((d) => {
      d.position.set(d.userData.x + Math.sin(t * 0.5 + d.userData.i) * 0.6, SLUDGE_Y + Math.sin(t * 1.6 + d.userData.x * 0.9) * 0.05, -0.2 - d.userData.i * 0.4);
      d.rotation.set(Math.sin(t * 1.3 + d.userData.i) * 0.12, 0.6 + Math.sin(t * 0.4) * 0.5, Math.sin(t * 1.6) * 0.1);
    });
    if (Math.random() < dt * 5) { // bubbles popping in the pits
      const bx = camX + (Math.random() - 0.5) * span;
      if (!LEVEL.FLOORS.some(([a, b]) => bx > a && bx < b)) puff(bx, SLUDGE_Y + 0.05, (Math.random() - 0.5) * 2, ['#8a6a3c', '#a8854e'], 4, 0.6, 1.6, 0.07, 0.5);
    }
    if (Math.random() < dt * 3) puff(camX + (Math.random() - 0.5) * span, CEIL - 0.3, (Math.random() - 0.5) * 2, ['#9ec7b0'], 1, 0, -1, 0.05, 1.4, 6); // a drip

    // coins: spin, and burst into sparkles when taken
    coins.forEach((c, i) => {
      if (s.coins[i]) {
        if (!sw.seen.coins[i]) { sw.seen.coins[i] = true; puff(c.position.x, c.position.y, 0, ['#ffe066', '#fff3bf', '#ffffff'], 12, 2.4, 2.5, 0.07, 0.5); c.userData.gotT = t; }
        const k = (t - (c.userData.gotT ?? -9)) / 0.3;
        c.visible = k < 1;
        if (c.visible) { c.position.y = LEVEL.COINS[i][1] + k * 0.9; c.scale.setScalar(1 - k * 0.8); c.rotation.y = t * 30; }
        return;
      }
      c.rotation.y = t * 3 + i * 0.5;
      c.position.y = LEVEL.COINS[i][1] + Math.sin(t * 3 + i) * 0.05;
    });
    // rats: scurry, tails wiggling; flattened and gone when stomped
    rats.forEach((r, i) => {
      if (!s.rats[i] && ratDead[i] === null) { ratDead[i] = t; const rx = ratAt(i, t).x + RAT_W / 2; puff(rx, 0.3, 0, ['#d6d9de', '#ffffff', '#ffe066'], 12, 3, 2, 0.08, 0.45); }
      const dead = ratDead[i];
      if (dead !== null && t - dead > 0.5) { r.visible = false; return; }
      const p = dead !== null ? ratAt(i, dead) : ratAt(i, t);
      r.visible = Math.abs(p.x - camX) < span;
      if (!r.visible) return;
      r.position.set(p.x + RAT_W / 2, 0, 0.1);
      r.rotation.y = p.dir > 0 ? 0 : Math.PI;
      const u = r.userData;
      if (dead !== null) { r.scale.set(1.25, 0.25, 1.25); return; }
      r.scale.set(1, 1 + Math.sin(t * 16 + i) * 0.04, 1);
      u.legs.forEach((l, k) => { l.rotation.z = Math.sin(t * 18 + (k % 2) * Math.PI + (k > 1 ? Math.PI / 2 : 0)) * 0.7; });
      u.tail.forEach((sg, k) => { sg.rotation.y = Math.sin(t * 7 - k * 0.7) * 0.35; sg.rotation.z = k === 0 ? 0.3 : -0.05; });
    });

    // the traveller
    hero.visible = true;
    hero.scale.setScalar(HERO_K);
    let hy = s.y, spin = 0;
    if (t < 0.45) hy += Math.pow(1 - t / 0.45, 2) * 9; // dropping in from the manhole
    if (s.dead !== null) {
      const k = t - s.dead;
      if (s.y < -1) hy = s.y - k * 0.8; // into the sludge
      else { hy = s.y + 3 * k - 11 * k * k; spin = Math.min(Math.PI, k * 5); } // caught by a rat: the hop off the screen
    }
    if (s.done !== null) hy = s.y - Math.min(PH + 0.6, (t - s.done) * 1.8); // down the pipe
    hero.position.set(s.x + PW / 2, hy, 0);
    hero.rotation.set(0, (s.face > 0 ? Math.PI / 2 : -Math.PI / 2) - s.face * 0.35, spin);
    let target;
    if (s.dead !== null && s.y >= -1) target = { armL: -2.9, armR: -2.9, legL: -0.4, legR: 0.4, nod: 0.3 };
    else if (s.skid && s.ground) target = { lean: -0.35, armL: -1.4, armR: -1.2, legL: -0.7, legR: 0.5, nod: -0.2 };
    else if (!s.ground || t < 0.45) { const up = s.vy > 0; target = { legL: up ? -1.4 : -0.8, legR: up ? 0.7 : 0.3, armL: up ? -2.9 : -2.2, armR: up ? 0.4 : -0.6, lean: up ? 0.12 : -0.05 }; }
    else {
      const sp = Math.min(1, Math.abs(s.vx) / 9), ph = s.stride * 2.4;
      target = sp < 0.05
        ? { bob: Math.sin(t * 2.5) * 0.1, armL: -0.08, armR: -0.08, look: Math.sin(t * 0.8) * 0.3 } // idle, looking about
        : { bob: Math.abs(Math.cos(ph)) * 0.8 * sp, lean: 0.05 + sp * 0.1, legL: Math.sin(ph) * (0.6 + 0.5 * sp), legR: -Math.sin(ph) * (0.6 + 0.5 * sp), armL: -Math.sin(ph) * (0.5 + 0.6 * sp), armR: Math.sin(ph) * (0.5 + 0.6 * sp) };
    }
    const kb = 1 - Math.exp(-dt * 24);
    KEYS.forEach((k) => { live[k] += ((target[k] || 0) - live[k]) * kb; });
    pose(hero, live);

    // dust and splashes on what just happened
    const seen = sw.seen;
    if (s.ground && !seen.ground && t > 0.1) puff(s.x + PW / 2, s.y + 0.05, 0, ['#9aa3ad', '#c3cad1'], 8, 1.6, 0.8, 0.07, 0.4);
    if (t > 0.42 && shownT < 0.42) puff(s.x + PW / 2, 0.05, 0, ['#9aa3ad', '#c3cad1', '#ffffff'], 14, 2.2, 1, 0.08, 0.5); // landing from the manhole
    if (s.skid && s.ground && Math.random() < dt * 30) puff(s.x + PW / 2 + s.face * 0.3, 0.05, 0, ['#b8bfc6'], 1, 0.8, 0.8, 0.06, 0.35);
    if (s.dead !== null && !seen.dead) { seen.dead = true; if (s.y < -1) puff(s.x + PW / 2, SLUDGE_Y, 0, ['#6b4423', '#8a5a2e', '#4a2f16'], 30, 3, 5, 0.12, 0.9); }
    if (s.done !== null && !seen.done) { seen.done = true; puff(LEVEL.EXIT.x + LEVEL.EXIT.w / 2, LEVEL.EXIT.h + 0.3, 0, ['#8cff9a', '#ffffff', '#ffe066'], 26, 2.5, 3, 0.08, 0.8); }
    seen.ground = s.ground;
    shownT = t;

    // particles
    let n = 0;
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), SC = new THREE.Vector3();
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.t -= dt; q.vy -= q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.t <= 0 || q.y < SLUDGE_Y - 0.3) { parts.splice(i, 1); continue; }
      const sz = q.s * Math.min(1, q.t * 4);
      P.set(q.x, q.y, q.z); SC.set(sz, sz, sz); M4.compose(P, Q, SC);
      partMesh.setMatrixAt(n, M4); partMesh.setColorAt(n, q.col); n++;
    }
    partMesh.count = n;
    partMesh.instanceMatrix.needsUpdate = true;
    if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;

    renderer.render(scene, camera);
  }

  /** Builds nothing new later: draws the whole sewer once now, with culling off, so every shader is ready. */
  function prewarm(heroKey) {
    const hero = heroes[heroKey], home = hero.parent;
    scene.add(hero);
    const culled = [];
    scene.traverse((o) => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    camera.position.set(20, 4, 30); camera.lookAt(20, 2, 0);
    renderer.render(scene, camera);
    culled.forEach((o) => { o.frustumCulled = true; });
    if (home) home.add(hero);
  }

  return { layout, draw, prewarm, pump, ready, scene, get span() { return span; } };
}
