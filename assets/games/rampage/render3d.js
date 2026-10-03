// Draws Godzilla Rampage as a lit voxel diorama (three.js). The game logic
// stays 2D (logical 192 x 288, y down); this maps it into world space
// (x - 96, 144 - y, z toward the camera) and syncs models to the state every
// frame. The camera frames the playfield exactly; scenery fills any extra
// screen around it. hud.js draws text, HUD and buttons-on-canvas over this.
import * as THREE from 'three';
import { mesh, makeHero, makeWife, makeGodzilla, makeHazard, makePickaxe, makeCandyCane, makeCrown, makeHeart, DEBRIS, shade } from './models.js';
import { VoxBuilder, hash3 } from './voxel.js';
import { createHud } from './hud.js';

const FOV = 30, PITCH = 0.17; // radians the camera looks down
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });

// Per level: sky, light, girder and ladder looks, scenery.
const LOOK3D = [
  { sky: [0x5fb8ff, 0xd6f0ff], hemi: [0xe6f4ff, 0x8aa37a, 1.7], sun: [0xfff3df, 2.5], girder: 'steel', ladder: 0x56c8e6, ground: 0x8d949c, scenery: 'city' },
  { sky: [0x140d08, 0x3a2618], hemi: [0xffd1a1, 0x3a2416, 1.5], sun: [0xffbf80, 2.2], girder: 'wood', ladder: 0xd1a865, ground: 0x4a3322, scenery: 'mine' },
  { sky: [0x10284f, 0x7aa7d9], hemi: [0xcfe2ff, 0xdfe9f5, 1.4], sun: [0xe2eeff, 1.9], girder: 'ice', ladder: 0x2f9e44, ground: 0xdfe9f5, scenery: 'xmas' },
  { sky: [0x2b0606, 0xff8a45], hemi: [0xffb592, 0x3b0a0a, 1.25], sun: [0xffcf8f, 2.1], girder: 'lava', ladder: 0xffd23f, ground: 0x2a1410, scenery: 'fire' }
];

export function createRenderer({ glCanvas, hudCanvas, stage, game }) {
  const { S, G, W, H } = game;
  const wx = (x) => x - W / 2;
  const wy = (y) => H / 2 - y;

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } catch {
    renderer = null; // no WebGL: the game still runs, with only the HUD
  }
  // Software WebGL (no GPU): fewer pixels, no shadows, so it stays playable.
  let lowPower = false;
  if (renderer) {
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      lowPower = /swiftshader|llvmpipe|software/i.test(name);
      if ((window.RAMPAGE_INIT || {}).quality === 'high') lowPower = false; // screenshots
    } catch { /* unknown GPU */ }
    if (lowPower) renderer.shadowMap.enabled = false;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 20, 4000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 1.5);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-120, 230, 170);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 190, bottom: -190, near: 40, far: 800 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.35;
  scene.add(hemi, sun, sun.target);
  const lamps = [];

  // ---- cast & props ---------------------------------------------------------------------
  const heroes = { chris: makeHero('chris'), shea: makeHero('shea') };
  const wives = { emily: makeWife('emily'), heather: makeWife('heather') };
  const toolFor = { chris: makePickaxe, shea: makeCandyCane };
  const held = { chris: makePickaxe(), shea: makeCandyCane() };
  Object.keys(heroes).forEach((k) => {
    heroes[k].scale.setScalar(0.92);
    held[k].rotation.x = 1.25;
    heroes[k].userData.hand.add(held[k]);
    scene.add(heroes[k]);
  });
  Object.values(wives).forEach((w) => { w.scale.setScalar(0.92); scene.add(w); });
  const crown = makeCrown();
  heroes.chris.userData.head.add(crown);
  crown.position.y = 7;
  const gz = makeGodzilla();
  scene.add(gz);
  const gzBarrel = new THREE.Group();
  gz.userData.body.add(gzBarrel);
  gzBarrel.position.set(0, 43, 7);
  const hearts = [0, 1, 2].map(() => { const h = makeHeart(); scene.add(h); return h; });
  const pedestals = [0, 1].map(() => {
    const p = mesh(new VoxBuilder().add(26, 4, 16, (x, y, z) => {
      const cx = x - 12.5, cz = z - 7.5;
      if ((cx * cx) / 169 + (cz * cz) / 64 > 1) return null;
      return y === 3 ? (hash3(x, y, z) < 0.5 ? 0xffd43b : 0xfcc419) : 0x7048e8;
    }, { offset: [-13, -4, -8] }).geometry());
    scene.add(p);
    return p;
  });

  // hazards: pooled meshes per look
  const pools = {};
  function take(look) {
    const pool = pools[look] || (pools[look] = []);
    const m = pool.find((q) => !q.userData.used) || (() => { const n = makeHazard(look); pool.push(n); scene.add(n); return n; })();
    m.userData.used = true;
    m.visible = true;
    return m;
  }
  const warnMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.25, depthWrite: false });
  const warns = [];
  const pickups = [];

  // debris / weather: instanced cubes
  const partMesh = new THREE.InstancedMesh(DEBRIS, new THREE.MeshLambertMaterial(), 320);
  partMesh.castShadow = true;
  partMesh.frustumCulled = false;
  const weatherMesh = new THREE.InstancedMesh(DEBRIS, new THREE.MeshBasicMaterial(), 80);
  weatherMesh.frustumCulled = false;
  scene.add(partMesh, weatherMesh);
  const steam = [];
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), SC = new THREE.Vector3(), C = new THREE.Color();

  // ---- level & scenery ------------------------------------------------------------------
  let levelGroup = null, sceneryGroup = null, builtTheme = -1;

  function girderVox(style, segX, topY, gi) {
    // returns voxel fn for an 8 x 12 x 14 grid whose y=3 row… top surface at grid y 9
    return (x, y, z) => {
      const yy = y - 3; // 0..6 is the beam; above = snow, below = icicles
      const front = z === 13, rnd = hash3(segX + x, y + gi * 31, z);
      if (style === 'steel') {
        if (yy < 0 || yy > 6) return null;
        if (yy >= 5 || yy <= 1) return front && yy === 6 && (x === 1 || x === 6) ? 0xffd6dc : yy === 6 ? 0xe8473f : 0xc9353a;
        return z >= 5 && z <= 8 ? 0x8f2330 : null;
      }
      if (style === 'wood') {
        if (yy < 0 || yy > 6) return null;
        if (yy >= 4) return x === 7 ? 0x6b4423 : rnd < 0.2 ? 0x9a6534 : 0xb57a43;
        if ((z >= 2 && z <= 4) || (z >= 9 && z <= 11)) return 0x5a3a1e;
        if (front && x === 0) return 0x868e96;
        return null;
      }
      if (style === 'ice') {
        if (yy === 7) return 0xffffff;
        if (yy === 8) return rnd < 0.35 ? 0xffffff : null;
        if (yy < 0) return front && x % 3 === 1 && yy >= -1 - Math.floor(hash3(segX + x, gi, 3) * 3) ? 0xd0ebff : null;
        if (yy >= 5 || yy <= 1) {
          if (front && yy === 1 && x % 4 === 2) return [0xff6b6b, 0xffd43b, 0x69db7c, 0x74c0fc][(segX / 8 + gi + x) % 4];
          return Math.floor((segX + x + yy) / 2) % 2 ? 0xffffff : 0xe03131; // candy-cane stripes
        }
        return z >= 5 && z <= 8 ? 0x9c1f2a : null;
      }
      // lava
      if (yy < 0 || yy > 6) return null;
      if (yy >= 5 || yy <= 1) return rnd < 0.18 ? 0x5a1a00 : yy === 6 ? 0xff9a2e : 0xe8590c;
      return z >= 5 && z <= 8 ? 0x3a1200 : null;
    };
  }

  function buildLevel() {
    if (levelGroup) { scene.remove(levelGroup); levelGroup.traverse((o) => o.geometry && o.geometry.dispose()); }
    levelGroup = new THREE.Group();
    const L = LOOK3D[S.level];
    const b = new VoxBuilder(), glow = new VoxBuilder();
    for (let gi = 0; gi < G.length; gi++) {
      const g = G[gi];
      for (let x = g.x1; x < g.x2; x += 8) {
        const mid = x + 4;
        if (!game.solidAt(gi, mid)) continue;
        const top = game.surf(gi, mid), w = Math.min(8, g.x2 - x);
        b.add(w, 12, 14, girderVox(L.girder, x, top, gi), { offset: [wx(x), wy(top) - 10, -7] });
        if (L.girder === 'lava') glow.add(w, 1, 1, (xx) => (hash3(x + xx, gi, 7) < 0.3 ? 0xffd43b : null), { offset: [wx(x), wy(top) - 4, 7] });
      }
    }
    // ladders, in front of the girders
    S.ladders.forEach((l) => {
      const top = wy(l.top), bot = wy(l.bottom), len = top - bot;
      const gapA = top - len * 0.32, gapB = top - len * 0.58;
      const col = L.ladder, rung = shade(col, 0.85);
      for (let y = bot; y < top + 1; y += 1) {
        if (l.broken && y < gapA && y > gapB) continue;
        b.box(wx(l.x) - 4.5, y, 7.5, 1, 1, 1, col, 0.5);
        b.box(wx(l.x) + 3.5, y, 7.5, 1, 1, 1, col, 0.5);
      }
      for (let y = bot + 2; y < top; y += 4) {
        if (l.broken && y < gapA && y > gapB) continue;
        b.box(wx(l.x) - 4, y, 7.5, 8, 1, 1, rung, 0.5);
      }
    });
    // oil drum at the bottom left
    const dt = wy(game.surf(0, 4));
    b.add(12, 14, 12, (x, y, z) => (Math.hypot(x - 5.5, z - 5.5) > 5.8 ? null : y % 5 === 0 ? 0x343a40 : 0x5c7cfa), { offset: [wx(-1), dt, -3] });
    const m = mesh(b.geometry());
    levelGroup.add(m);
    if (glow.pos.length) levelGroup.add(new THREE.Mesh(glow.geometry(), GLOW));
    scene.add(levelGroup);
    // power-ups lying on the girders
    pickups.forEach((p) => scene.remove(p));
    pickups.length = 0;
    S.tools.forEach(() => { const t = toolFor[S.hero](); t.scale.setScalar(0.9); scene.add(t); pickups.push(t); });
    setTheme(S.level);
  }

  function setTheme(i) {
    const L = LOOK3D[i];
    hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); hemi.intensity = L.hemi[2];
    sun.color.setHex(L.sun[0]); sun.intensity = L.sun[1];
    if (builtTheme === i) return;
    builtTheme = i;
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 256;
    const c2 = cv.getContext('2d'), gr = c2.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#' + L.sky[0].toString(16).padStart(6, '0'));
    gr.addColorStop(1, '#' + L.sky[1].toString(16).padStart(6, '0'));
    c2.fillStyle = gr; c2.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (scene.background && scene.background.dispose) scene.background.dispose();
    scene.background = tex;
    scene.fog = new THREE.Fog(L.sky[1], 600, 1400);
    fitFog();
    if (sceneryGroup) { scene.remove(sceneryGroup); sceneryGroup.traverse((o) => o.geometry && o.geometry.dispose()); }
    lamps.forEach((l) => scene.remove(l));
    lamps.length = 0;
    sceneryGroup = buildScenery(L);
    scene.add(sceneryGroup);
  }

  function buildScenery(L) {
    const grp = new THREE.Group();
    const b = new VoxBuilder(), glow = new VoxBuilder();
    const rnd = (() => { let a = 1234 + builtTheme * 77; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
    const floor = wy(H) - 8;
    // ground slab
    b.add(90, 2, 60, (x, y, z) => (hash3(x, y, z) < 0.25 ? shade(L.ground, 0.92) : L.ground), { size: 10, offset: [-450, floor - 20, -500] });
    if (L.scenery === 'city') {
      const pal = [0xf4d58d, 0xa5d8ff, 0xffc9c9, 0xb2f2bb, 0xe5dbff, 0xffd8a8, 0x99e9f2];
      for (let i = 0; i < 16; i++) {
        const w = 10 + Math.floor(rnd() * 8), h = 22 + Math.floor(rnd() * 40), d = 9 + Math.floor(rnd() * 5);
        const x0 = -420 + i * 54 + rnd() * 14, z0 = -260 - rnd() * 170, col = pal[i % pal.length];
        b.add(w, h, d, (x, y, z) => {
          if (y === h - 1) return x === 0 || x === w - 1 || z === 0 || z === d - 1 ? shade(col, 0.75) : (x + z) % 5 === 0 ? 0xadb5bd : null;
          const win = x % 3 !== 0 && y % 3 !== 0 && y > 2;
          if (win && (z === d - 1 || x === 0 || x === w - 1)) return 0xdff4ff;
          return y <= 2 ? shade(col, 0.8) : col;
        }, { size: 5.5, offset: [x0, floor - 2, z0] });
      }
      // a red-and-white lattice tower
      b.add(16, 60, 16, (x, y, z) => {
        const half = 7.5 * (1 - y / 70) + 0.5;
        const cx = Math.abs(x - 7.5), cz = Math.abs(z - 7.5);
        if (cx > half || cz > half) return null;
        const edge = cx > half - 1.2 || cz > half - 1.2;
        if (!edge && y % 12 !== 0) return null;
        return Math.floor(y / 8) % 2 ? 0xffffff : 0xe8590c;
      }, { size: 4.5, offset: [170, floor - 2, -420] });
      for (let i = 0; i < 9; i++) cloud(glow, -420 + i * 105 + rnd() * 30, 150 + rnd() * 150, -380 - rnd() * 80, rnd);
      for (let i = 0; i < 16; i++) tree(b, -330 + i * 44 + rnd() * 12, floor - 2, -150 - rnd() * 50, 0x40c057, rnd);
    } else if (L.scenery === 'mine') {
      b.add(110, 100, 6, (x, y, z) => {
        const depth = Math.floor((hash3(x >> 2, y >> 2, 1) * 3 + hash3(x, y, 2)) * 1.6);
        if (z > depth) return null;
        const n = hash3(x, y, z);
        if (hash3(x >> 3, y >> 1, 9) < 0.08) return 0x0e0b09; // coal seams
        return n < 0.03 ? 0xc9a227 : n < 0.55 ? 0x2e2016 : n < 0.85 ? 0x271b13 : 0x36261a;
      }, { size: 7, offset: [-385, floor - 60, -260] });
      for (let i = -3; i <= 3; i++) {
        const x = i * 75;
        b.box(x - 4, floor, -160, 8, 260, 8, 0x4a2f18, 2);
        b.box(x - 40, floor + 250, -160, 80, 8, 8, 0x3d2712, 2);
        glow.add(3, 4, 3, () => 0xffd43b, { size: 2, offset: [x + 6, floor + 170, -154] });
        const lamp = new THREE.PointLight(0xffb84d, 0.7, 320, 1.2);
        lamp.position.set(x + 9, floor + 170, -120);
        lamps.push(lamp);
        scene.add(lamp);
      }
    } else if (L.scenery === 'xmas') {
      for (let i = 0; i < 12; i++) {
        const x0 = -420 + i * 72 + rnd() * 20, z0 = -300 - rnd() * 160, s = 1.6 + rnd() * 1.2;
        pine(b, glow, x0, floor - 2, z0, s, rnd);
      }
      for (let i = 0; i < 4; i++) cottage(b, glow, -330 + i * 200 + rnd() * 30, floor - 2, -380 - rnd() * 60, rnd);
      snowman(b, -200, floor - 2, -170);
      for (let i = 0; i < 8; i++) cloud(glow, -420 + i * 120 + rnd() * 30, 170 + rnd() * 140, -420, rnd, 0xdbe7f5);
    } else {
      for (let i = 0; i < 15; i++) {
        const w = 9 + Math.floor(rnd() * 8), h = 18 + Math.floor(rnd() * 36), d = 9 + Math.floor(rnd() * 4);
        const x0 = -420 + i * 56 + rnd() * 10, z0 = -260 - rnd() * 170;
        const jag = (x) => h - Math.floor(hash3(x, i, 4) * 8);
        b.add(w, h, d, (x, y) => {
          if (y > jag(x)) return null;
          return y % 3 && x % 3 ? 0x2b2d31 : 0x1d1e21;
        }, { size: 5.5, offset: [x0, floor - 2, z0] });
        glow.add(w, h, 1, (x, y) => (y < jag(x) - 1 && y % 3 && x % 3 && hash3(x, y, i) < 0.14 ? (hash3(y, x, i) < 0.5 ? 0xd9480f : 0xf08c00) : null), { size: 5.5, offset: [x0, floor - 2, z0 + d * 5.5 + 0.2] });
      }
      for (let i = 0; i < 8; i++) cloud(glow, -420 + i * 110, 90 + rnd() * 170, -430, rnd, 0x6b3a32);
    }
    grp.add(mesh(b.geometry()));
    if (glow.pos.length) grp.add(new THREE.Mesh(glow.geometry(), GLOW));
    grp.traverse((o) => { o.castShadow = false; });
    return grp;
  }
  function cloud(b, x0, y0, z0, rnd, col = 0xffffff) {
    const w = 8 + Math.floor(rnd() * 6);
    b.add(w, 4, 5, (x, y, z) => (Math.hypot((x - w / 2) / (w / 2), (y - 1) / 3, (z - 2) / 2.5) > 1 + (hash3(x, y, z) - 0.5) * 0.3 ? null : y === 0 ? shade(col, 0.9) : col), { size: 6, offset: [x0, y0, z0] });
  }
  function tree(b, x0, y0, z0, col, rnd) {
    const h = 3 + Math.floor(rnd() * 2);
    b.add(4, h + 4, 4, (x, y, z) => (y < 2 ? (x === 1 || x === 2) && (z === 1 || z === 2) ? 0x8a5a2b : null : y >= 2 && (y < h + 3 || ((x === 1 || x === 2) && (z === 1 || z === 2))) ? (hash3(x, y, z) < 0.3 ? shade(col, 0.85) : col) : null), { size: 3, offset: [x0, y0, z0] });
  }
  function pine(b, glow, x0, y0, z0, s, rnd) {
    const sz = 2 * s;
    b.add(11, 16, 11, (x, y, z) => {
      const cx = Math.abs(x - 5), cz = Math.abs(z - 5);
      if (y < 2) return cx <= 1 && cz <= 1 ? 0x6b4423 : null;
      const r = 5.5 * (1 - (y - 2) / 14) + ((y % 3) === 0 ? 0.8 : 0);
      if (cx > r || cz > r || cx + cz > r * 1.4) return null;
      return (y % 3 === 0 && (cx > r - 1.2 || cz > r - 1.2)) ? 0xffffff : hash3(x, y, z) < 0.3 ? 0x1b6e3a : 0x22844a;
    }, { size: sz, offset: [x0, y0, z0] });
    glow.add(11, 16, 11, (x, y, z) => {
      const cx = Math.abs(x - 5), cz = Math.abs(z - 5);
      if (y === 15 && cx === 0 && cz === 0) return 0xffe066;
      const r = 5.5 * (1 - (y - 2) / 14);
      if (y < 3 || y % 3 !== 1 || Math.abs(cx + cz - r * 1.3) > 0.6 || hash3(x, y, z) > 0.4) return null;
      return [0xff6b6b, 0xffd43b, 0x69db7c, 0x74c0fc][Math.floor(rnd() * 4)];
    }, { size: sz, offset: [x0, y0 + 0.4, z0] });
  }
  function cottage(b, glow, x0, y0, z0) {
    b.add(14, 13, 10, (x, y, z) => {
      if (y < 8) return 0xb5651d;
      const roof = Math.abs(x - 6.5) < 14 - y;
      if (!roof) return null;
      return y === 8 || hash3(x, y, z) < 0.6 ? 0xffffff : 0xe7f5ff;
    }, { size: 4, offset: [x0, y0, z0] });
    glow.add(14, 6, 1, (x, y) => ((x === 3 || x === 4 || x === 9 || x === 10) && (y === 3 || y === 4) ? 0xffe8a3 : null), { size: 4, offset: [x0, y0, z0 + 40.2] });
  }
  function snowman(b, x0, y0, z0) {
    b.add(10, 22, 10, (x, y, z) => {
      const cx = x - 4.5, cz = z - 4.5;
      const ball = (cy, r) => cx * cx + (y - cy) * (y - cy) + cz * cz <= r * r;
      if (ball(19, 3.2) && z === 8 && y === 19 && (x === 3 || x === 6)) return 0x212529;
      if (y === 18 && z >= 8 && x === 4) return 0xff922b;
      if (ball(4, 4.8) || ball(11, 3.8) || ball(18, 3.2)) return y === 14 || y === 15 ? 0xe03131 : 0xffffff;
      return null;
    }, { size: 3, offset: [x0, y0, z0] });
  }

  // ---- layout & camera ------------------------------------------------------------------
  const view = { cw: 1, ch: 1, s: 1, fx: 0, fy: 0, dpr: 1 };
  function layout() {
    const cw = stage.clientWidth, ch = stage.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 3);
    const s = Math.min(cw / W, ch / H);
    Object.assign(view, { cw, ch, s, fx: (cw - W * s) / 2, fy: (ch - H * s) / 2, dpr });
    for (const c of [glCanvas, hudCanvas]) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; c.style.left = '0px'; c.style.top = '0px'; }
    hudCanvas.width = Math.round(cw * dpr);
    hudCanvas.height = Math.round(ch * dpr);
    if (renderer) {
      renderer.setPixelRatio(lowPower ? 0.75 : Math.min(dpr, 2));
      renderer.setSize(cw, ch, false);
    }
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    placeCamera(0, 0);
    fitFog();
  }
  function camDist() { return (view.ch / 2) / view.s / Math.tan((FOV / 2) * Math.PI / 180); }
  function fitFog() { if (scene.fog) { const D = camDist(); scene.fog.near = D + 90; scene.fog.far = D + 820; } }
  function placeCamera(dx, dy) {
    // distance at which one world unit on the z=0 plane spans `s` CSS pixels
    const D = camDist();
    camera.position.set(dx, Math.sin(PITCH) * D + dy - 6, Math.cos(PITCH) * D);
    camera.lookAt(dx, dy - 6, 0);
  }
  const PV = new THREE.Vector3();
  function project(x, y, z = 0) {
    PV.set(wx(x), wy(y), z).project(camera);
    const px = ((PV.x + 1) / 2) * view.cw, py = ((1 - PV.y) / 2) * view.ch;
    return { x: (px - view.fx) / view.s, y: (py - view.fy) / view.s };
  }
  function fromLogical(x, y) {
    const r = hudCanvas.getBoundingClientRect();
    return { x: r.left + view.fx + x * view.s, y: r.top + view.fy + y * view.s };
  }
  function toLogical(cx, cy) {
    const r = hudCanvas.getBoundingClientRect();
    return { x: (cx - r.left - view.fx) / view.s, y: (cy - r.top - view.fy) / view.s };
  }

  // ---- animation helpers -----------------------------------------------------------------
  const YAW_R = 0.95; // facing right, turned a little toward the camera
  function pose(m, o) {
    const u = m.userData;
    u.body.position.y = 5 + (o.bob || 0);
    u.body.rotation.set(o.lean || 0, 0, 0);
    u.legL.rotation.set(o.legL || 0, 0, 0);
    u.legR.rotation.set(o.legR || 0, 0, 0);
    u.armL.rotation.set(o.armL || 0, 0, o.armLz || 0);
    u.armR.rotation.set(o.armR || 0, 0, o.armRz || 0);
    u.head.rotation.set(o.nod || 0, o.look || 0, 0);
  }
  function placeHero(key, x, y, z, yaw, o) {
    const m = heroes[key];
    m.visible = true;
    m.position.set(wx(x), wy(y), z);
    m.rotation.set(o.tipX || 0, yaw, o.tipZ || 0);
    pose(m, o);
    held[key].visible = !!o.tool;
  }
  function wifeIdle(key, x, y, t, waving, hop) {
    const m = wives[key], u = m.userData;
    m.visible = true;
    m.position.set(wx(x), wy(y) + hop, 0);
    m.rotation.set(0, 0.35, 0);
    u.armR.rotation.set(0, 0, waving ? 2.5 + Math.sin(t * 9) * 0.35 : 0.15);
    u.armL.rotation.set(0, 0, hop ? -2.4 - Math.sin(t * 9) * 0.3 : -0.15);
    u.head.rotation.set(0, Math.sin(t * 1.3) * 0.15, waving ? Math.sin(t * 4) * 0.08 : 0);
  }

  // ---- per-frame sync --------------------------------------------------------------------
  let lastMode = '';
  function sync(dt) {
    const t = S.t, mode = S.mode;
    Object.values(heroes).forEach((h) => { h.visible = false; });
    Object.values(wives).forEach((w) => { w.visible = false; });
    pedestals.forEach((p) => { p.visible = false; });
    hearts.forEach((h) => { h.visible = false; });
    crown.visible = false;

    if (mode === 'select') {
      if (builtTheme !== 0) setTheme(0);
      if (levelGroup) levelGroup.visible = false;
      gz.visible = true;
      gz.position.set(wx(150), wy(96) - 18, -70);
      gz.rotation.set(0, -0.5, 0);
      animGodzilla(t, 'idle', 0, 0.2);
      ['chris', 'shea'].forEach((k, i) => {
        const on = S.sel === i, base = i === 0 ? 162 : 242;
        pedestals[i].visible = true;
        pedestals[i].position.set(wx(34), wy(base), 2);
        pedestals[i].scale.setScalar(1.3);
        pedestals[i].rotation.y = t * 0.6;
        const ph = t * 9;
        placeHero(k, 34, base - 4 - (on ? Math.abs(Math.sin(t * 5)) * 2 : 0), 2, on ? 0.5 + Math.sin(t) * 0.3 : 0.4, on
          ? { legL: Math.sin(ph) * 0.5, legR: -Math.sin(ph) * 0.5, armL: -Math.sin(ph) * 0.4, armR: -0.6, tool: true, look: Math.sin(t * 2) * 0.3 }
          : { armR: -0.4, tool: true, look: -0.2 });
        heroes[k].scale.setScalar(2.5);
      });
      hideDynamic();
      return;
    }
    heroes.chris.scale.setScalar(0.92);
    heroes.shea.scale.setScalar(0.92);
    if (levelGroup) levelGroup.visible = true;
    if (mode !== lastMode) lastMode = mode;

    // Godzilla stands on the top-left girder
    gz.visible = true;
    gz.position.set(wx(30), wy(game.surf(5, 30)) - 0.5, -3);
    gz.rotation.set(0, 1.05, 0);
    const gzs = S.gz;
    const angry = gzs.mood > 0.6 || gzs.state === 'tantrum';
    animGodzilla(t, mode === 'gameover' ? 'laugh' : gzs.state, gzs.t, gzs.mood, angry);

    // the wife on the ledge (and the hero with her after the rescue)
    const p = S.player, wifeKey = game.HEROES[S.hero].wife, ly = game.surf(6, 100);
    const after = mode === 'rescue' || mode === 'tally' || mode === 'win';
    const hop = after ? Math.abs(Math.sin(S.modeT * 6)) * 3 : 0;
    wifeIdle(wifeKey, 99, ly, t, !after && Math.floor(t * 0.8) % 2 === 0, hop);
    if (after) {
      placeHero(S.hero, 113, game.surf(6, 112) - hop, 0, -1.0, { armL: -2.6 + Math.sin(t * 10) * 0.3, armR: -2.6 - Math.sin(t * 10) * 0.3, legL: -0.3, legR: 0.2 });
      if (game.HEROES[S.hero].crown) crown.visible = true;
      hearts.forEach((h, i) => {
        const k = (S.modeT * 0.6 + i / 3) % 1;
        h.visible = true;
        h.position.set(wx(106 + Math.sin(k * 9 + i) * 6), wy(ly - 22 - k * 30), 3);
        h.scale.setScalar(0.6 + k * 0.6);
        h.rotation.y = t * 2 + i;
      });
    } else if (p) {
      drawPlayer(p, t);
    }

    // power-ups
    S.tools.forEach((tool, i) => {
      const m = pickups[i];
      if (!m) return;
      m.visible = !tool.taken;
      m.position.set(wx(tool.x), wy(tool.y - 8 + Math.sin(t * 4) * 1.5), 2);
      m.rotation.set(0.3, t * 2.4, 0.5);
    });

    // hazards
    Object.values(pools).forEach((pool) => pool.forEach((m) => { m.userData.used = false; }));
    let wi = 0;
    S.hz.forEach((h) => {
      if (h.kind === 'drop' && h.warn > 0) {
        const w = warns[wi] || (warns[wi] = (() => { const m = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 2), warnMat); scene.add(m); return m; })());
        wi++;
        w.visible = true;
        const top = game.HUD + 6, len = H - top;
        w.scale.set(1, len, 1);
        w.position.set(wx(h.x), wy(top + len / 2), 4);
        warnMat.opacity = 0.15 + 0.15 * (Math.floor(h.warn * 10) % 2);
        return;
      }
      const look = h.kind === 'drop' ? game.theme().drop : h.kind === 'fire' ? 'fire' : h.look || 'barrel';
      const m = take(look);
      const z = h.st === 'ladder' ? 9 : 1.5;
      if (h.kind === 'drop') { m.position.set(wx(h.x), wy(h.y), 2); m.rotation.set(t * 3, t * 2, 0); }
      else if (h.kind === 'fire') { m.position.set(wx(h.x), wy(h.y), 2); m.scale.set(1, 1 + Math.sin(t * 14 + h.x) * 0.08, 1); m.rotation.y = h.dir > 0 ? 0.6 : -0.6; }
      else if (look === 'cart') { m.position.set(wx(h.x), wy(h.y) + Math.abs(Math.sin(t * 20)) * 0.6, z); m.rotation.set(0, 0, 0); }
      else {
        m.position.set(wx(h.x), wy(h.y) + 5, z);
        m.rotation.set(0, 0, -h.spin);
      }
    });
    for (let i = wi; i < warns.length; i++) warns[i].visible = false;
    Object.values(pools).forEach((pool) => pool.forEach((m) => { if (!m.userData.used) m.visible = false; }));

    // Godzilla's barrel overhead while winding up
    const wind = gzs.state === 'windup' && (mode === 'play' || mode === 'intro');
    if (wind && !gzBarrel.children.length) gzBarrel.add(makeHazard(game.theme().barrel));
    if (gzBarrel.children[0]) {
      gzBarrel.children[0].visible = wind;
      gzBarrel.children[0].rotation.set(0, 0, 0);
    }
    if (!wind && gzBarrel.children.length && gzBarrel.userData.look !== game.theme().barrel) { gzBarrel.clear(); }
    gzBarrel.userData.look = game.theme().barrel;

    syncParticles(dt, angry);
  }

  function drawPlayer(p, t) {
    const key = S.hero, ph = p.anim * Math.PI;
    const hasTool = p.tool > 0 && !(p.tool < 2 && Math.floor(t * 10) % 2);
    if (S.mode === 'dying') {
      const k = 1.3 - p.dead;
      placeHero(key, p.x, p.y - Math.sin(Math.min(1, k * 2) * Math.PI) * 10, 4, YAW_R * p.face, { tipZ: -p.face * Math.min(1.6, k * 3), armL: -2.8, armR: -2.8, legL: -0.4, legR: 0.4 });
      return;
    }
    if (p.st === 'climb') {
      const c = Math.sin(ph);
      placeHero(key, p.x, p.y, 10, Math.PI, { armL: -2.7 + c * 0.35, armR: -2.7 - c * 0.35, legL: -0.4 - c * 0.35, legR: -0.4 + c * 0.35 });
      return;
    }
    const yaw = YAW_R * p.face;
    if (p.st === 'air') {
      placeHero(key, p.x, p.y, 2, yaw, { legL: -0.9, legR: 0.35, armL: -2.4, armR: hasTool ? -1.2 : -2.4, armLz: -0.3, armRz: 0.3, tool: hasTool });
      return;
    }
    if (p.swing > 0) {
      const k = 1 - p.swing / 0.28;
      placeHero(key, p.x, p.y, 2, yaw, { armR: -3.0 + k * 3.6, armL: -0.4, lean: 0.25 * k, legL: -0.3, legR: 0.3, tool: hasTool });
      return;
    }
    const moving = Math.abs(p.vx) > 4;
    const sw = moving ? Math.sin(ph) : 0;
    placeHero(key, p.x, p.y, 2, yaw, {
      bob: moving ? Math.abs(Math.cos(ph)) * 0.6 : Math.sin(t * 3) * 0.15,
      legL: sw * 0.75, legR: -sw * 0.75, armL: -sw * 0.6, armR: hasTool ? -0.6 : sw * 0.6, tool: hasTool,
      look: moving ? 0 : Math.sin(t * 0.9) * 0.25
    });
  }

  function animGodzilla(t, st, st_t, mood, angry) {
    const u = gz.userData;
    let jaw = 0.08, armL = -0.3, armR = -0.3, headX = 0, headY = 0, bodyY = 12, lean = 0, legL = 0, legR = 0, eyeS = 1;
    const breathe = Math.sin(t * 2.2);
    u.torso.scale.set(1, 1 + breathe * 0.012, 1);
    const p = S.player;
    const look = p ? Math.max(-0.35, Math.min(0.5, (p.x - 60) / 180)) : 0;
    headY = -look * 0.6;
    switch (st) {
      case 'windup': armL = armR = -2.9; lean = -0.12; headX = -0.15; jaw = 0.25; break;
      case 'throw': armL = armR = -1.2; lean = 0.18; jaw = 0.45; break;
      case 'stomp': { const up = Math.floor(st_t * 6) % 2; legL = up ? -0.7 : 0; bodyY = up ? 13.5 : 11.5; armL = armR = -0.8; jaw = 0.3; break; }
      case 'roar': headX = -0.45; jaw = 0.85 + Math.sin(t * 40) * 0.05; armL = armR = -1.6; lean = -0.1; break;
      case 'laugh': jaw = 0.25 + Math.abs(Math.sin(t * 16)) * 0.5; headX = -0.25 + Math.sin(t * 16) * 0.06; bodyY = 12 + Math.abs(Math.sin(t * 16)) * 1.2; armL = armR = -0.9; break;
      case 'shocked': eyeS = 1.6; jaw = 0.55; bodyY = 14 + Math.sin(t * 30) * 0.3; armL = armR = -2.2; headX = 0.15; break;
      case 'tantrum': { const f = Math.sin(t * 14); bodyY = 12 + Math.abs(f) * 4; armL = -1.5 + f * 1.3; armR = -1.5 - f * 1.3; headY = f * 0.35; jaw = 0.6; legL = f > 0 ? -0.5 : 0; legR = f > 0 ? 0 : -0.5; break; }
      default: armL = -0.35 + breathe * 0.08; armR = -0.35 - breathe * 0.08;
    }
    u.body.position.y = bodyY;
    u.body.rotation.x = lean;
    u.head.rotation.set(headX, headY, 0);
    u.jaw.rotation.x = jaw;
    u.armL.rotation.x = armL;
    u.armR.rotation.x = armR;
    u.legL.rotation.x = legL;
    u.legR.rotation.x = legR;
    u.tail.forEach((seg, i) => { seg.rotation.y = Math.sin(t * 1.6 - i * 0.7) * (st === 'tantrum' ? 0.5 : 0.22); });
    u.eyes.forEach((e) => {
      e.white.scale.set(1, eyeS, eyeS);
      e.pupil.position.z = 0.5 + look * 1.6;
      e.pupil.position.y = p && p.y > 150 ? -0.5 : 0.2;
    });
    u.pupilMat.color.setHex(angry ? 0xff2a00 : 0x111111);
    u.pupilMat.emissive.setHex(angry ? 0xaa1100 : 0x000000);
    void mood;
  }

  function hideDynamic() {
    Object.values(pools).forEach((pool) => pool.forEach((m) => { m.visible = false; }));
    warns.forEach((w) => { w.visible = false; });
    pickups.forEach((m) => { m.visible = false; });
    if (gzBarrel.children[0]) gzBarrel.children[0].visible = false;
    partMesh.count = 0;
    weatherMesh.count = 0;
  }

  function syncParticles(dt, angry) {
    // steam puffs from an angry Godzilla's head
    if (angry && Math.random() < dt * 9) steam.push({ x: wx(30) + (Math.random() * 12 - 2), y: wy(game.surf(5, 30)) + 52, z: 2, t: 1 });
    let n = 0;
    S.parts.forEach((q) => {
      if (n >= 300) return;
      const s = q.s * Math.min(1, q.t * 3);
      E.set(q.spin, q.spin * 0.7, 0); Q.setFromEuler(E);
      P.set(wx(q.x), wy(q.y), 3 + q.z); SC.set(s, s, s);
      M4.compose(P, Q, SC);
      partMesh.setMatrixAt(n, M4);
      partMesh.setColorAt(n, C.set(q.col));
      n++;
    });
    for (let i = steam.length - 1; i >= 0; i--) {
      const q = steam[i];
      q.t -= dt; q.y += dt * 14; q.x += dt * 3;
      if (q.t <= 0) { steam.splice(i, 1); continue; }
      if (n >= 318) continue;
      const s = 2 + (1 - q.t) * 3;
      Q.identity(); P.set(q.x, q.y, q.z); SC.set(s, s, s);
      M4.compose(P, Q, SC);
      partMesh.setMatrixAt(n, M4);
      partMesh.setColorAt(n, C.setHex(0xf1f3f5));
      n++;
    }
    partMesh.count = n;
    partMesh.instanceMatrix.needsUpdate = true;
    if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
    const xmas = game.theme().deco === 'xmas';
    let m = 0;
    S.snow.forEach((f, i) => {
      if (m >= 80) return;
      const s = xmas ? 1.1 : 0.9;
      E.set(f.w, f.w, 0); Q.setFromEuler(E);
      P.set(wx(f.x), wy(f.y), -20 + ((i * 37) % 50)); SC.set(s, s, s);
      M4.compose(P, Q, SC);
      weatherMesh.setMatrixAt(m, M4);
      weatherMesh.setColorAt(m, C.setHex(xmas ? 0xffffff : Math.floor(f.w * 4) % 2 ? 0xffd43b : 0xff6b00));
      m++;
    });
    weatherMesh.count = m;
    weatherMesh.instanceMatrix.needsUpdate = true;
    if (weatherMesh.instanceColor) weatherMesh.instanceColor.needsUpdate = true;
  }

  // ---- HUD & frame -----------------------------------------------------------------------
  const hud = createHud(hudCanvas, game, view, project);
  setTheme(0);

  function render(dt) {
    sync(dt);
    if (renderer) {
      const sh = S.shakeT > 0 ? 1.6 : 0;
      placeCamera((Math.random() * 2 - 1) * sh, (Math.random() * 2 - 1) * sh * 0.7);
      renderer.render(scene, camera);
    }
    hud.draw(!renderer);
  }

  return {
    hasGL: !!renderer,
    layout,
    render,
    buildLevel,
    modeChanged() {},
    toLogical,
    fromLogical,
    project
  };
}
