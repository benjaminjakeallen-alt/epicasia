// Draws Shinkansen Dash with three.js: three bullet trains side by side
// running away from the camera, a chase camera behind the runner, voxel
// scenery streaming past per stage (Tokyo, rice fields, Mount Fuji, tea
// hills, Kyoto), tunnels, and the roof obstacles. Positions come from the
// game's distances: z = S.dist - d (ahead is -z). hud.js draws text on top.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MAT, makeHero, makeHeroine } from '../rampage/models.js';
import {
  GLOW, makeCar, makeNose, makeHump, makePanto, makeCrow, makeGantry, makeOnigiri, makeNeko, makeBoba, makeSpring, makeGuitar, makeManhole,
  makeTunnelRing, makePortal, makeBuilding, makeTree, makePaddy, makeFarmhouse, makeTeaRow, makePagoda, makeTorii, makeBackdrop
} from './models.js';
import { createHud } from './hud.js';

const FOV = 58;
const AHEAD = 210; // metres drawn ahead
const HERO_SCALE = 0.092;
const MANHOLE_AT = 22; // metres into a gap: its middle, where the nose doesn't hide it from the chase camera
// Per stage: sky top/bottom, ground, light.
const LOOK = {
  tokyo: { sky: [0x5aa7f5, 0xdcefff], ground: 0x9aa1a6, hemi: [0xe8f3ff, 0x8a8f86, 1.65], sun: [0xfff3df, 2.4] },
  country: { sky: [0x4fa3f2, 0xe5f6ff], ground: 0x7fb35a, hemi: [0xe8f6ff, 0x6f9a4f, 1.7], sun: [0xfff3df, 2.4] },
  fuji: { sky: [0x6aaef0, 0xf3eeff], ground: 0x8fbf6a, hemi: [0xeef2ff, 0x7aa05c, 1.7], sun: [0xfff6e8, 2.3] },
  tea: { sky: [0x4fa0ec, 0xe6f8ef], ground: 0x5e9e4c, hemi: [0xe8fff0, 0x5f8f4a, 1.7], sun: [0xfff3df, 2.4] },
  kyoto: { sky: [0xf08a5d, 0xffe0b0], ground: 0x9c8a63, hemi: [0xffe6cc, 0x7a5f45, 1.5], sun: [0xffc98f, 2.3] }
};

export function createRenderer({ glCanvas, hudCanvas, stage, game }) {
  const { S, LANES, ROOF, NOSE, CAR, LANE_OFF, STAGES, STAGE_LEN, OBS } = game;

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } catch {
    renderer = null; // no WebGL: the game still runs, with only the HUD
  }
  let lowPower = false;
  if (renderer) {
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      lowPower = /swiftshader|llvmpipe|software/i.test(name);
      if ((window.SHINKANSEN_INIT || {}).quality === 'high') lowPower = false;
    } catch { /* unknown GPU */ }
    if (lowPower) renderer.shadowMap.enabled = false;
    // Checking every shader for errors forces a wait the first time each is
    // used; keep that for development only (three.js's advice for production).
    renderer.debug.checkShaderErrors = !!(window.SHINKANSEN_INIT || {}).shaderChecks;
    // filmic colour: richer light and shade, no blown-out whites
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
  }

  const scene = new THREE.Scene();
  // A soft studio environment for reflections on the glossy trains.
  if (renderer && !lowPower) {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.4;
    pm.dispose();
  }
  // White Shinkansen paint: a little gloss and sheen (the voxel AO stays in the vertex colours).
  const TRAIN = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.12 });
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.3, 900);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 512 : 2048, lowPower ? 512 : 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 26, bottom: -20, near: 1, far: 90 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  scene.add(hemi, sun, sun.target);
  // Fully fogged before the draw distance, so nothing pops into view.
  scene.fog = new THREE.Fog(0xdcefff, 60, AHEAD - 20);

  // ---- ground and track (textures scroll with the distance run) --------------------------
  function canvasTex(w, h, draw, rx, ry) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    return t;
  }
  let seedTex = 7;
  const trnd = () => { seedTex = (seedTex * 16807) % 2147483647; return seedTex / 2147483647; };
  // ground: speckled light/dark (tinted per stage by the material colour)
  const GROUND_TILE = 12;
  const groundTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#e6e6e6'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = 190 + Math.floor(trnd() * 65);
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(Math.floor(trnd() * w), Math.floor(trnd() * h), 2 + Math.floor(trnd() * 4), 2 + Math.floor(trnd() * 4));
    }
  }, 900 / GROUND_TILE, 900 / GROUND_TILE);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: 0x8fbf6a, map: groundTex }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -300); ground.receiveShadow = true;
  // track bed: ballast, sleepers and rails under each of the three trains
  const BED_W = 14, BED_TILE = 2.4;
  const bedTex = canvasTex(448, 77, (c, w, h) => {
    const mx = (x) => ((x + BED_W / 2) / BED_W) * w; // metres → px
    c.fillStyle = '#8d857a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2400; i++) {
      const v = 95 + Math.floor(trnd() * 80);
      c.fillStyle = `rgb(${v + 8},${v + 2},${v - 6})`;
      c.fillRect(trnd() * w, trnd() * h, 1.5 + trnd() * 2, 1.5 + trnd() * 2);
    }
    LANES.forEach((lx) => {
      for (let k = 0; k < 4; k++) { // sleepers every 0.6 m
        const y = (k / 4) * h + 2;
        c.fillStyle = '#5d4a3a'; c.fillRect(mx(lx - 1.75), y, mx(lx + 1.75) - mx(lx - 1.75), h / 4 * 0.42);
        c.fillStyle = '#6d5847'; c.fillRect(mx(lx - 1.75), y, mx(lx + 1.75) - mx(lx - 1.75), 2);
      }
      [-0.72, 0.72].forEach((r) => { // rails
        c.fillStyle = '#4a4e55'; c.fillRect(mx(lx + r) - 2.5, 0, 5, h);
        c.fillStyle = '#c9ced6'; c.fillRect(mx(lx + r) - 1, 0, 2, h);
      });
    });
  }, 1, 900 / BED_TILE);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(BED_W, 900), new THREE.MeshLambertMaterial({ map: bedTex }));
  bed.rotation.x = -Math.PI / 2; bed.position.set(0, 0.01, -300); bed.receiveShadow = true;
  scene.add(ground, bed);

  // ---- sun & clouds ---------------------------------------------------------------------
  function spriteTex(draw) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    draw(cv.getContext('2d'));
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const sunTex = spriteTex((c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,245,1)'); g.addColorStop(0.12, 'rgba(255,250,220,0.95)');
    g.addColorStop(0.3, 'rgba(255,236,190,0.35)'); g.addColorStop(1, 'rgba(255,230,180,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false }));
  sunGlow.scale.set(150, 150, 1);
  sunGlow.position.set(-150, 95, -560);
  scene.add(sunGlow);
  const cloudTex = spriteTex((c) => {
    for (let i = 0; i < 14; i++) {
      const x = 40 + trnd() * 176, y = 110 + (trnd() - 0.5) * 50, r = 26 + trnd() * 34;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.6, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
  });
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true, opacity: 0.85 }));
    const sz = 90 + trnd() * 90;
    m.scale.set(sz * 1.8, sz, 1);
    m.position.set(-420 + i * 105 + trnd() * 40, 70 + trnd() * 90, -480 - trnd() * 80);
    m.userData.drift = 1.5 + trnd() * 2;
    clouds.push(m); scene.add(m);
  }

  // ---- speed lines (only when it's really moving) --------------------------------------------
  const SPEED_N = 46;
  const speedMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const speedMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.025, 1), speedMat, SPEED_N);
  speedMesh.frustumCulled = false;
  const streaks = [];
  for (let i = 0; i < SPEED_N; i++) {
    const a = trnd() * Math.PI * 2, r = 3 + trnd() * 6;
    streaks.push({ x: Math.cos(a) * r * 1.3, y: ROOF + 2.6 + Math.sin(a) * r * 0.8, z: -60 + trnd() * 66, len: 2 + trnd() * 3 });
  }
  scene.add(speedMesh);

  // ---- pools ------------------------------------------------------------------------
  const pools = {};
  const used = new Set();
  // Each kind of model is built once (its voxel geometry is the expensive
  // part); more of the same are cheap copies sharing that geometry. Building
  // a fresh one whenever scenery streamed in made the game hitch.
  const protos = {};
  function copyTree(o) {
    const c = o.isMesh ? new THREE.Mesh(o.geometry, o.material) : new THREE.Group();
    c.position.copy(o.position); c.rotation.copy(o.rotation); c.scale.copy(o.scale);
    o.children.forEach((ch) => c.add(copyTree(ch)));
    return c;
  }
  function instance(kind, make) {
    if (kind === 'crow' || kind === 'manhole') return make(); // (a bird's wings and a manhole's steam are animated one by one)
    return copyTree(protos[kind] || (protos[kind] = make()));
  }
  function take(kind, make) {
    const pool = pools[kind] || (pools[kind] = []);
    let m = pool.find((q) => !q.userData.busy && !q.userData.keep);
    if (!m) { m = instance(kind, make); m.userData.kind = kind; pool.push(m); scene.add(m); m.traverse((o) => { if (o.isMesh && o.material !== GLOW) { o.castShadow = true; o.receiveShadow = true; } }); }
    m.userData.busy = true; m.visible = true; used.add(m);
    return m;
  }
  function frameStart() { used.forEach((m) => { m.userData.busy = false; }); used.clear(); }
  function frameEnd() { Object.values(pools).forEach((pool) => pool.forEach((m) => { if (!m.userData.busy && !m.userData.keep) m.visible = false; })); }

  const carGeo = makeCar(CAR - 0.02), carEndGeo = makeCar(CAR - 0.02, true);
  const glossy = (g) => { g.traverse((o) => { if (o.isMesh && o.material === MAT) o.material = TRAIN; }); return g; };
  const noseHeight = game.noseHeight;

  // ---- travellers ---------------------------------------------------------------------
  const heroes = {
    chris: makeHero('chris'), bennett: makeHero('bennett'), emily: makeHeroine('emily'), miles: makeHero('miles'),
    nicole: makeHero('nicole'), jake: makeHero('jake')
  };
  Object.values(heroes).forEach((h) => {
    h.scale.setScalar(HERO_SCALE);
    h.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.mat = o.material; } });
    scene.add(h);
  });
  // a traveller you haven't earned yet stands in the line-up as a silhouette
  const SIL = new THREE.MeshBasicMaterial({ color: 0x1c2333 });
  function silhouette(h, on) { heroes[h].traverse((o) => { if (o.isMesh) o.material = on ? SIL : o.userData.mat; }); }
  // Back from the sewer: covered in brown sludge for the rest of the run (the
  // same vertex-coloured Lambert shader, just tinted, so nothing new to compile).
  const SLUDGE = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x8a5a2e });
  function sludge(h, on) { heroes[h].traverse((o) => { if (o.isMesh) o.material = on ? SLUDGE : o.userData.mat; }); }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffd43b, fog: false }));
  halo.rotation.x = Math.PI / 2;
  scene.add(halo);

  // particles
  const partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), 200);
  partMesh.frustumCulled = false;
  partMesh.setColorAt(0, new THREE.Color(0xffffff)); // (per-particle colour from the start, so warm-up compiles the right shader)
  scene.add(partMesh);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), SC = new THREE.Vector3(), C = new THREE.Color();

  // ---- sky -----------------------------------------------------------------------------
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 256;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  const cur = { top: new THREE.Color(0x5aa7f5), bot: new THREE.Color(0xdcefff), ground: new THREE.Color(0x9aa1a6), dark: 0 };
  let skyKey = '';
  function paintSky() {
    const key = cur.top.getHexString() + cur.bot.getHexString();
    if (key === skyKey) return;
    skyKey = key;
    const c2 = skyCanvas.getContext('2d'), gr = c2.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#' + cur.top.getHexString()); gr.addColorStop(1, '#' + cur.bot.getHexString());
    c2.fillStyle = gr; c2.fillRect(0, 0, 4, 256);
    skyTex.needsUpdate = true;
  }
  const backdrops = {};
  function backdrop(kind) {
    if (!backdrops[kind]) { backdrops[kind] = makeBackdrop(kind); backdrops[kind].position.set(0, 0, -360); scene.add(backdrops[kind]); }
    return backdrops[kind];
  }

  // ---- scenery streaming -------------------------------------------------------------------
  let scen = [], nextScen = [0, 0], lastDist = 0;
  const sr = (() => { let a = 99; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  const stageAt = (d) => STAGES[Math.floor(Math.max(0, d) / STAGE_LEN) % 5].key;
  function spawnScenery() {
    if (S.dist < lastDist - 1) { scen.forEach((s) => (s.m.userData.keep = false)); scen = []; nextScen = [S.dist - 20, S.dist - 20]; }
    lastDist = S.dist;
    // after a jump ahead (or a long stall), start from here rather than
    // building every object for the stretch that was skipped
    for (let side = 0; side < 2; side++) if (nextScen[side] < S.dist - 30) nextScen[side] = S.dist - 20;
    for (let side = 0; side < 2; side++) {
      const sx = side ? 1 : -1;
      while (nextScen[side] < S.dist + AHEAD) {
        const d = nextScen[side], kind = stageAt(d);
        if (!game.inTunnel(d)) placeScenery(kind, d, sx);
        nextScen[side] += { tokyo: 7, country: 11, fuji: 8, tea: 30, kyoto: 9 }[kind] * (0.7 + sr() * 0.6);
      }
    }
    scen = scen.filter((s) => {
      if (s.d < S.dist - 25) { s.m.userData.keep = false; return false; }
      return true;
    });
  }
  function put(kind, make, d, x, rotY) {
    const m = take(kind, make);
    m.userData.keep = true;
    m.rotation.set(0, rotY || 0, 0);
    scen.push({ d: d, x: x, m: m });
  }
  function placeScenery(kind, d, sx) {
    const v = Math.floor(sr() * 6);
    if (kind === 'tokyo') {
      put('bld' + v, () => makeBuilding(v + 1), d, sx * (11 + sr() * 8));
      if (sr() < 0.6) put('bld' + ((v + 3) % 6), () => makeBuilding(((v + 3) % 6) + 1), d + 4, sx * (25 + sr() * 14));
    } else if (kind === 'country') {
      put('paddy' + (v % 3), () => makePaddy(v % 3), d, sx * (13 + sr() * 4));
      if (sr() < 0.25) put('farm' + (v % 2), () => makeFarmhouse(v % 2), d + 3, sx * (24 + sr() * 10), sr() * 3);
      else if (sr() < 0.4) put('tree' + (v % 3), () => makeTree(v % 3, 0x4f9a3a), d + 2, sx * (9 + sr() * 3));
    } else if (kind === 'fuji') {
      put('sakura' + (v % 3), () => makeTree(v % 3 + 10, 0xf7b6c8, 0x6b4a3a), d, sx * (9 + sr() * 6));
      if (sr() < 0.5) put('paddy' + (v % 3), () => makePaddy(v % 3), d + 4, sx * (20 + sr() * 6));
    } else if (kind === 'tea') {
      for (let i = 0; i < 5; i++) put('tea', () => makeTeaRow(26), d, sx * (9 + i * 2.4));
      if (sr() < 0.5) put('tree' + (v % 3), () => makeTree(v % 3, 0x3f8a37), d + 10, sx * (24 + sr() * 8));
    } else {
      put('maple' + (v % 3), () => makeTree(v % 3 + 20, [0xe8542f, 0xf08c2a, 0xd23a2a][v % 3], 0x5a3a2a), d, sx * (9 + sr() * 5));
      if (sr() < 0.12) put('pagoda', makePagoda, d + 6, sx * (22 + sr() * 10));
      else if (sr() < 0.12) put('torii', makeTorii, d + 2, sx * 8.6, Math.PI / 2);
      else if (sr() < 0.3) put('farm' + (v % 2), () => makeFarmhouse(v % 2 + 5), d + 3, sx * (18 + sr() * 8), sr() * 3);
    }
  }

  // ---- layout & camera -----------------------------------------------------------------------
  const view = { cw: 1, ch: 1, dpr: 1 };
  let baseFov = FOV;
  function layout() {
    const cw = stage.clientWidth, ch = stage.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 3);
    Object.assign(view, { cw, ch, dpr });
    for (const c of [glCanvas, hudCanvas]) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
    hudCanvas.width = Math.round(cw * dpr); hudCanvas.height = Math.round(ch * dpr);
    if (renderer) { renderer.setPixelRatio(lowPower ? 0.75 : Math.min(dpr, 2)); renderer.setSize(cw, ch, false); }
    camera.aspect = cw / ch;
    baseFov = cw / ch > 0.9 ? 50 : FOV;
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }
  const LINEUP = [-1.8, -1.08, -0.36, 0.36, 1.08, 1.8];
  const cam = { pos: new THREE.Vector3(0, ROOF + 1.3, 7), look: new THREE.Vector3(0, ROOF + 0.85, 0) };
  function camTarget() {
    if (S.mode === 'select') {
      const half = Math.tan((camera.fov / 2) * Math.PI / 180);
      const dist = Math.max(4.5, 2.95 / (half * Math.min(1, camera.aspect)));
      return { pos: new THREE.Vector3(0, ROOF + 1.25, dist), look: new THREE.Vector3(0, ROOF + 0.75, 0) };
    }
    const px = S.p ? S.p.x : 0, py = S.p ? Math.max(-1.5, S.p.y - ROOF) : 0;
    return { pos: new THREE.Vector3(px * 0.55, ROOF + 4.3 + py * 0.35, 8.6), look: new THREE.Vector3(px * 0.75, ROOF + 0.3 + py * 0.5, -18) };
  }
  const PV = new THREE.Vector3();
  function toScreen(x, y, z) {
    PV.set(x, y, z).project(camera);
    return { x: ((PV.x + 1) / 2) * view.cw, y: ((1 - PV.y) / 2) * view.ch, behind: PV.z > 1 };
  }

  // ---- poses ---------------------------------------------------------------------------------
  function pose(m, o) {
    const u = m.userData;
    u.body.position.y = (u.hip || 5) + (o.bob || 0); // (Miles stands taller)
    u.body.rotation.set(o.lean || 0, 0, 0);
    u.legL.rotation.set(o.legL || 0, 0, 0);
    u.legR.rotation.set(o.legR || 0, 0, 0);
    u.armL.rotation.set(o.armL || 0, 0, o.armLz || 0);
    u.armR.rotation.set(o.armR || 0, 0, o.armRz || 0);
    u.head.rotation.set(o.nod || 0, o.look || 0, 0);
  }
  // The runner's pose eases toward a target every frame (run, jump, slide,
  // crash), so changes of state blend instead of snapping.
  const POSE_KEYS = ['bob', 'lean', 'legL', 'legR', 'armL', 'armR', 'armLz', 'armRz', 'nod', 'look', 'rootX', 'rootZ'];
  const live = {};
  POSE_KEYS.forEach((k) => { live[k] = 0; });
  let lastX = 0, tilt = 0;
  function drawRunner(t, dt) {
    const p = S.p, m = heroes[S.hero];
    m.visible = !(S.invuln > 0 && Math.floor(t * 12) % 2 === 0);
    m.position.set(p.x, p.y, 0);
    // lean into a hop, from how fast you're moving sideways
    const vx = dt > 0 ? (p.x - lastX) / dt : 0;
    lastX = p.x;
    tilt += (Math.max(-0.4, Math.min(0.4, -vx * 0.018)) - tilt) * (1 - Math.exp(-dt * 14));
    let target, rate = 18;
    if (S.mode === 'crash' || S.mode === 'gameover') {
      const k = Math.min(1, S.modeT / 0.6);
      target = { rootX: -k * 1.4, rootZ: k * 0.6, armL: -2.8, armR: -2.6, legL: -0.6, legR: 0.4 };
      rate = 10;
    } else if (p.slideT > 0) {
      target = { rootX: 1.15, legL: -1.3, legR: -1.1, armL: -2.9, armR: -2.9, nod: -0.6 };
      rate = 24;
    } else if (p.air) {
      const up = p.vy > 0;
      target = { legL: up ? -1.3 : -0.7, legR: up ? 0.6 : 0.2, armL: -2.6, armR: -2.4, armLz: -0.3, armRz: 0.3, lean: up ? 0.15 : -0.1 };
    } else {
      const ph = p.anim, sAmp = S.mode === 'ready' ? Math.min(1, S.modeT) : 1;
      target = {
        bob: Math.abs(Math.cos(ph)) * 0.8 * sAmp, lean: -0.15 * sAmp,
        legL: Math.sin(ph) * 0.9 * sAmp, legR: -Math.sin(ph) * 0.9 * sAmp, armL: -Math.sin(ph) * 0.8 * sAmp, armR: Math.sin(ph) * 0.8 * sAmp
      };
      rate = 30;
    }
    const kb = 1 - Math.exp(-dt * rate);
    POSE_KEYS.forEach((k) => { live[k] += ((target[k] || 0) - live[k]) * kb; });
    m.rotation.set(live.rootX, Math.PI, live.rootZ + tilt);
    pose(m, live);
    // squash on landing, stretch on take-off
    let sy = 1;
    const sinceLand = t - (p.landT ?? -9), sinceJump = t - (p.jumpT ?? -9);
    if (sinceLand < 0.2) sy = 1 - 0.16 * Math.sin((sinceLand / 0.2) * Math.PI);
    else if (sinceJump < 0.18) sy = 1 + 0.1 * Math.sin((sinceJump / 0.18) * Math.PI);
    m.scale.set(HERO_SCALE / Math.sqrt(sy), HERO_SCALE * sy, HERO_SCALE / Math.sqrt(sy));
  }
  function drawLineup(t) {
    game.ROSTER.forEach((k, i) => {
      const m = heroes[k], on = S.sel === i && !game.locked(k);
      m.visible = true;
      silhouette(k, game.locked(k));
      m.position.set(LINEUP[i], ROOF + (on ? Math.abs(Math.sin(t * 5)) * 0.12 : 0), 0);
      m.rotation.set(0, on ? Math.sin(t * 1.4) * 0.35 : 0.15 * (i - 2.5), 0);
      const ph = t * 9;
      pose(m, on
        ? { armR: -2.7 + Math.sin(ph) * 0.35, armRz: 0.3, armL: -0.2, legL: Math.sin(ph) * 0.2, legR: -Math.sin(ph) * 0.2, look: Math.sin(t * 2) * 0.25 }
        : { armL: -0.1, armR: -0.1, look: Math.sin(t * 0.7 + i) * 0.2 });
    });
  }

  // ---- per-frame sync ---------------------------------------------------------------------------
  function sync(dt) {
    const t = S.t, z = (d) => S.dist - d;
    frameStart();
    Object.values(heroes).forEach((h) => { h.visible = false; h.scale.setScalar(HERO_SCALE); });
    halo.visible = false;

    // look of the current stage (eased), darker in tunnels
    const kind = stageAt(S.dist + 40), L = LOOK[kind];
    const k = 1 - Math.exp(-dt * 1.5);
    cur.top.lerp(C.setHex(L.sky[0]), k); cur.bot.lerp(C.setHex(L.sky[1]), k); cur.ground.lerp(C.setHex(L.ground), k);
    cur.dark += ((S.mode !== 'select' && game.inTunnel(S.dist - 3) ? 1 : 0) - cur.dark) * Math.min(1, dt * 4);
    paintSky();
    ground.material.color.copy(cur.ground);
    hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]);
    hemi.intensity = L.hemi[2] * (1 - 0.72 * cur.dark);
    sun.color.setHex(L.sun[0]); sun.intensity = L.sun[1] * (1 - 0.9 * cur.dark);
    scene.fog.color.copy(cur.bot).lerp(C.setHex(0x1b1d22), cur.dark);
    Object.keys(backdrops).forEach((b) => { backdrops[b].visible = false; });
    backdrop(kind).visible = cur.dark < 0.9;

    // trains: cars, and noses either side of each gap
    const from = S.dist - 30, to = S.dist + AHEAD;
    for (let l = 0; l < 3; l++) {
      const off = LANE_OFF[l];
      for (let c0 = Math.floor((from - off) / CAR) * CAR + off; c0 < to; c0 += CAR) {
        if (S.gaps.some((g) => g.lane === l && c0 >= g.g0 && c0 < g.g1)) continue;
        const last = S.gaps.some((g) => g.lane === l && c0 + CAR === g.g0);
        const m = last
          ? take('carEnd', () => new THREE.Mesh(carEndGeo.geometry, TRAIN))
          : take('car', () => new THREE.Mesh(carGeo.geometry, TRAIN));
        m.position.set(LANES[l], 0, z(c0));
      }
    }
    S.gaps.forEach((g) => {
      if (g.g0 < to && g.g0 > from) { const n = take('nose', () => glossy(makeNose(NOSE, noseHeight))); n.position.set(LANES[g.lane], 0, z(g.g0)); n.rotation.y = 0; }
      if (g.g1 < to + NOSE && g.g1 > from) { const n = take('nose', () => glossy(makeNose(NOSE, noseHeight))); n.position.set(LANES[g.lane], 0, z(g.g1)); n.rotation.y = Math.PI; }
      // an open manhole down on the track bed, where you'd land if you dropped off the end
      if (g.manhole && g.g0 + MANHOLE_AT < to && g.g0 + MANHOLE_AT > from) { const mh = take('manhole', makeManhole); mh.position.set(LANES[g.lane], 0, z(g.g0 + MANHOLE_AT)); mh.userData.steam.rotation.y = t * 0.8; mh.userData.steam.position.y = (t * 0.6) % 0.5; }
    });

    // (no catenary poles along the line: the user found them lamp-like and asked for them gone)
    // tunnels
    S.tunnels.forEach((tn) => {
      for (let d = tn.d0; d < tn.d1; d += 10) {
        if (d > to || d + 10 < from) continue;
        take('ring', () => makeTunnelRing(10, ROOF)).position.set(0, 0, z(d));
      }
      if (tn.d0 > from && tn.d0 < to) { const p = take('portal', () => makePortal(ROOF)); p.position.set(0, 0, z(tn.d0)); p.rotation.y = 0; }
      if (tn.d1 > from && tn.d1 < to) { const p = take('portal', () => makePortal(ROOF)); p.position.set(0, 0, z(tn.d1)); p.rotation.y = Math.PI; }
    });

    // scenery
    if (S.mode !== 'select' || !scen.length) spawnScenery();
    scen.forEach((s) => { s.m.visible = true; s.m.position.set(s.x, 0, z(s.d)); });

    // obstacles and pickups
    S.obs.forEach((o) => {
      const flying = o.gone && o.gotT !== undefined && t - o.gotT < 0.35; // a pickup you just grabbed
      if ((o.gone && !flying) || o.d > to || o.d < from) return;
      const def = OBS[o.type], base = def.all ? ROOF : game.roofAt(o.lane, o.d) || ROOF;
      const x = def.all ? 0 : LANES[o.lane];
      let m;
      switch (o.type) {
        case 'hump': m = take('hump', makeHump); m.position.set(x, base, z(o.d)); break;
        case 'panto': m = take('panto', makePanto); m.position.set(x, base, z(o.d)); break;
        case 'gantry': m = take('gantry', () => makeGantry(ROOF, def.lo, def.hi, 5.6)); m.position.set(0, 0, z(o.d)); break;
        case 'crow':
          m = take('crow', makeCrow); m.position.set(x, base + 1.35 + Math.sin(t * 6 + o.d) * 0.08, z(o.d));
          m.userData.wings[0].rotation.z = Math.sin(t * 18 + o.d) * 0.7;
          m.userData.wings[1].rotation.z = -Math.sin(t * 18 + o.d) * 0.7;
          break;
        case 'onigiri': m = take('onigiri', makeOnigiri); m.position.set(x, base + 0.45 + (o.h || 0) + Math.sin(t * 4 + o.d) * 0.08, z(o.d)); m.rotation.y = t * 3 + o.d; break;
        case 'boba': // floats over head height, bobbing and turning, so you jump for it
          m = take('boba', makeBoba); m.position.set(x, base + 2.05 + Math.sin(t * 3 + o.d) * 0.1, z(o.d)); m.rotation.y = t * 1.6 + o.d; break;
        case 'spring': m = take('spring', makeSpring); m.position.set(x, base, z(o.d)); m.rotation.y = t * 1.2; break;
        case 'guitar': // high up, a double jump's height; turns slowly, catching the light
          m = take('guitar', makeGuitar); m.position.set(x, base + 3.35 + Math.sin(t * 2.4 + o.d) * 0.12, z(o.d)); m.rotation.y = Math.sin(t * 1.3) * 0.6; break;
        case 'neko': m = take('neko', makeNeko); m.position.set(x, base + 0.3, z(o.d)); m.rotation.y = Math.sin(t * 2) * 0.5; break;
      }
      if (!m) return;
      if (flying) { // up and toward you, spinning and shrinking
        const k = (t - o.gotT) / 0.35;
        m.position.y += k * 1.6; m.position.z = Math.max(m.position.z, 0) + k * 2.5;
        m.rotation.y += k * 12;
        m.scale.setScalar(Math.max(0.05, 1.25 - k * 1.2));
      } else m.scale.setScalar(1);
    });

    // the runner (or the line-up on the select screen)
    if (S.mode === 'select') drawLineup(t);
    else if (S.p) {
      sludge(S.hero, S.sludge);
      drawRunner(t, dt);
      if (S.shield && S.mode === 'run') { halo.visible = true; halo.position.set(S.p.x, S.p.y + 0.08, 0); halo.rotation.z = t * 3; }
    }

    // particles
    let n = 0;
    S.parts.forEach((q) => {
      if (n >= 200) return;
      const s = q.s * Math.min(1, q.t * 3);
      Q.identity(); P.set(q.x, q.y, q.z); SC.set(s, s, s);
      M4.compose(P, Q, SC);
      partMesh.setMatrixAt(n, M4); partMesh.setColorAt(n, C.set(q.col)); n++;
    });
    partMesh.count = n;
    partMesh.instanceMatrix.needsUpdate = true;
    if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
    frameEnd();

    // the ground and track run past; clouds drift; speed lines at speed
    // (uv' = uv·repeat + offset, so a growing offset slides the pattern toward the camera)
    groundTex.offset.y = (S.dist / GROUND_TILE) % 1;
    bedTex.offset.y = (S.dist / BED_TILE) % 1;
    clouds.forEach((c) => {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 520) c.position.x -= 1000;
      c.material.opacity = 0.85 * (1 - cur.dark);
      c.material.color.copy(cur.bot).lerp(C.setHex(0xffffff), 0.6);
    });
    sunGlow.visible = cur.dark < 0.5;
    const fast = S.mode === 'run' && !lowPower ? Math.max(0, Math.min(1, (S.speed - 19) / 14)) : 0;
    speedMat.opacity += (fast * 0.42 - speedMat.opacity) * Math.min(1, dt * 3);
    speedMesh.visible = speedMat.opacity > 0.01;
    if (speedMesh.visible) {
      streaks.forEach((q, i) => {
        q.z += S.speed * 2.1 * dt;
        if (q.z > 8) q.z -= 70;
        Q.identity(); P.set(q.x + (S.p ? S.p.x * 0.5 : 0), q.y, q.z); SC.set(1, 1, q.len * (0.6 + fast));
        M4.compose(P, Q, SC);
        speedMesh.setMatrixAt(i, M4);
      });
      speedMesh.instanceMatrix.needsUpdate = true;
    }
    if (scene.environment) scene.environmentIntensity = 0.4 * (1 - 0.7 * cur.dark);

    // sun & shadows follow the runner
    const px = S.p && S.mode !== 'select' ? S.p.x : 0;
    sun.position.set(px - 10, 32, 14); sun.target.position.set(px, 0, -8);
  }

  // ---- warm-up ------------------------------------------------------------------------------------
  // On the select screen, before anyone plays: build every model, backdrop and
  // stage's scenery once and compile their shaders, so the first time a stage,
  // obstacle or tunnel appears mid-run nothing has to be built.
  function prewarm() {
    STAGES.forEach((st) => { backdrop(st.key).visible = true; for (let i = 0; i < 30; i++) placeScenery(st.key, -1000, i % 2 ? 1 : -1); });
    take('hump', makeHump); take('panto', makePanto); take('crow', makeCrow); take('onigiri', makeOnigiri); take('neko', makeNeko); take('boba', makeBoba); take('spring', makeSpring); take('guitar', makeGuitar);
    take('gantry', () => makeGantry(ROOF, OBS.gantry.lo, OBS.gantry.hi, 5.6));
    take('nose', () => glossy(makeNose(NOSE, noseHeight))); take('manhole', makeManhole);
    take('carEnd', () => new THREE.Mesh(carEndGeo.geometry, TRAIN));
    take('ring', () => makeTunnelRing(10, ROOF)); take('portal', () => makePortal(ROOF));
    // Draw everything once, now, with culling off: that compiles and links
    // every shader and fetches its uniforms. A shader first used mid-run
    // stalls the frame it appears in (profiled: seconds in software GL, a
    // visible hitch on a phone). (compileAsync alone didn't help where the
    // browser links lazily on first use.)
    if (renderer) {
      const culled = [];
      scene.traverse((o) => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
      renderer.render(scene, camera);
      culled.forEach((o) => { o.frustumCulled = true; });
    }
    STAGES.forEach((st) => { backdrops[st.key].visible = false; });
    scen.forEach((q) => { q.m.userData.keep = false; q.m.visible = false; });
    scen = [];
  }
  prewarm();

  // ---- HUD & frame --------------------------------------------------------------------------------
  const hud = createHud(hudCanvas, game, view, toScreen, LINEUP);
  let glAge = 1;
  function render(dt) {
    glAge += dt;
    const drawGL = renderer && S.mode !== 'sewer' && (!lowPower || glAge >= 1 / 12); // (the sewer is all 2D)
    const elapsed = Math.min(0.25, glAge);
    if (drawGL) glAge = 0;
    if (drawGL || !renderer) {
      sync(elapsed);
      const ct = camTarget(), k = 1 - Math.exp(-elapsed * 6);
      cam.pos.lerp(ct.pos, k); cam.look.lerp(ct.look, k);
      const sh = S.shakeT > 0 ? 0.12 : 0;
      camera.position.set(cam.pos.x + (Math.random() - 0.5) * sh, cam.pos.y + (Math.random() - 0.5) * sh, cam.pos.z);
      // a gentle roll with the runner's lean, and a wider view as the train speeds up
      const roll = S.mode === 'select' ? 0 : tilt * 0.12;
      camera.up.set(Math.sin(roll), Math.cos(roll), 0);
      camera.lookAt(cam.look);
      const fovTarget = baseFov + (S.mode === 'select' ? 0 : Math.max(0, Math.min(1, (S.speed - 15) / 21)) * 8);
      if (Math.abs(camera.fov - fovTarget) > 0.01) { camera.fov += (fovTarget - camera.fov) * (1 - Math.exp(-elapsed * 2)); camera.updateProjectionMatrix(); }
    }
    if (drawGL) renderer.render(scene, camera);
    hud.draw(!renderer);
  }

  function heroPoint(i) {
    const r = hudCanvas.getBoundingClientRect(), q = toScreen(LINEUP[i], ROOF + 0.9, 0);
    return { x: r.left + q.x, y: r.top + q.y };
  }
  function heroAt(clientX) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < LINEUP.length; i++) { const d = Math.abs(heroPoint(i).x - clientX); if (d < bd) { bd = d; best = i; } }
    return bd < view.cw * 0.1 ? best : -1;
  }

  const shown = (kind) => (pools[kind] || []).filter((m) => m.visible).map((m) => [+m.position.x.toFixed(1), +m.position.y.toFixed(2), +m.position.z.toFixed(1)]); // (tests)
  return { hasGL: !!renderer, layout, render, heroAt, heroPoint, shown, programs: () => (renderer ? renderer.info.programs.map((q) => q.name + '#' + q.cacheKey.length) : []) };
}
