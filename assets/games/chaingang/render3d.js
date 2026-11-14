// Draws Tug of Wall with three.js, third person like Chained Together, in a
// bright, cheerful cartoon look (user, Nov 14 2026, from a reel of a casual
// co-op rope game): a clear blue sky with puffy clouds, a turquoise sea far
// below, lush grass on the islands, warm light stone, round trees, wooden
// posts, soft shading and soft shadows with no ink outlines, a red-and-white
// rope between the travellers, and confetti on everything. The camera sits behind
// your traveller; S.cam.yaw (it follows the way on by itself, game.js) is where it looks.
// hud.js draws the text on top.
import * as THREE from 'three';
import { adaptiveQuality } from '../shared/adaptive.js';
import { MAT, makeHero, LOOKS as HERO_LOOKS } from '../rampage/models.js';
import { moverBox, windOn, CHAIN } from './sim.js';
import { ROPE_R, insideAny, ropeBoxes, ropePath, stepRope } from './rope.js';
import { createHud } from './hud.js';

const HERO_SCALE = 0.084;
// Per level: sky stops (top → horizon), the sun (or moon), the clouds' tint, the sea, the haze, light.
const SKIES = [
  // Sunset Ramparts: a bright late afternoon, a warm glow low on the horizon
  { sky: ['#2f8fe6', '#4aa6f0', '#7cc2f7', '#b5dcfb', '#e3f2fc', '#fff1d6'], sun: '#fff6d8', cloud: 0xffffff, sea: ['#1fb5c9', '#4fd6dd'], mist: 0xd6ecf8,
    hemi: [0xe2f2ff, 0xc9b98f, 1.7], key: [0xfff0d8, 2.6], fill: [0xbfe0ff, 0.55] },
  // Dragon Festival: a clear midday
  { sky: ['#1f7fe0', '#3a98ee', '#66b7f5', '#a3d6fb', '#d8eefc', '#f2f9ff'], sun: '#ffffff', cloud: 0xffffff, sea: ['#14a9c4', '#3fcfd8'], mist: 0xd3ebfa,
    hemi: [0xe6f4ff, 0xc6b88e, 1.75], key: [0xfffaf0, 2.7], fill: [0xc8e6ff, 0.5] },
  // Storm Peak: blustery, a greyer sky, darker sea, heavier clouds
  { sky: ['#4f6f98', '#6886ab', '#87a1bf', '#a8bccf', '#c6d3de', '#d9e2ea'], sun: '#eef3f8', cloud: 0xe4eaf1, sea: ['#1b7f96', '#3a9fae'], mist: 0xc3d0dc,
    hemi: [0xdde7f2, 0xa8a48a, 1.6], key: [0xf0f4fa, 2.0], fill: [0xb8c8dc, 0.6] },
  // Lantern Night: a deep blue night with stars, a big round moon, sky lanterns rising
  { sky: ['#071233', '#0c1c48', '#15295c', '#203a72', '#2c4a84', '#3f5e96'], sun: '#fff8dc', cloud: 0x3a4f7c, sea: ['#0b3354', '#16507a'], mist: 0x223a66,
    hemi: [0x9fb8ff, 0x2a3346, 1.1], key: [0xcfe0ff, 1.4], fill: [0xffb070, 0.9], night: true },
];
// bright, friendly accents (trims, rockets, confetti): coral, sky blue, sunshine, mint, lilac
const BRIGHT = [0xff6b5a, 0x3fb3ff, 0xffd23f, 0x4fd68a, 0xb48cff];

export function createRenderer({ glCanvas, hudCanvas, stage, game }) {
  const { S, LEVELS } = game;
  let renderer = null;
  // (a phone that can't keep up draws at a lower resolution — see shared/adaptive.js)
  const quality = adaptiveQuality(() => layout());
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
      if ((window.CHAINGANG_INIT || {}).quality === 'high') lowPower = false;
    } catch { /* unknown GPU */ }
    if (lowPower) renderer.shadowMap.enabled = false;
    renderer.debug.checkShaderErrors = !!(window.CHAINGANG_INIT || {}).shaderChecks;
    renderer.toneMapping = THREE.NeutralToneMapping; // (keeps the cartoon colours saturated; ACES greyed them)
    renderer.toneMappingExposure = 1.0;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 900);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
  const key = new THREE.DirectionalLight(0xffffff, 2.5); // the sun
  key.castShadow = true;
  key.shadow.mapSize.set(lowPower ? 512 : 2048, lowPower ? 512 : 2048);
  Object.assign(key.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03; key.shadow.radius = 3;
  const rim = new THREE.DirectionalLight(0xbfe0ff, 0.5); // a soft fill from the other side, so shadows are never black
  scene.add(hemi, key, key.target, rim, rim.target);
  scene.fog = new THREE.Fog(0xd6ecf8, 80, 300);
  const SUN_DIR = new THREE.Vector3(-0.45, 0.55, -1).normalize(); // the sun, high over the far end of the Wall

  // ---- materials: soft, smooth shading (no ink outlines — the look is clean and bright) -------------
  const toon = (opts) => new THREE.MeshLambertMaterial(opts);
  /** A mesh that casts and takes shadows, in a group (so things can be added to it). */
  function outlined(geo, mat) {
    const g = new THREE.Group(), m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    return g;
  }
  function canvasTex(w, h, draw, rx = 1, ry = 1) {
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
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // Wall bricks: warm, light sandstone, big soft blocks, the odd mossy one.
  const brickTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#cdb894'; c.fillRect(0, 0, w, h);
    const rows = 6, bh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 40 : 0;
      for (let x = -80; x < w; x += 80) {
        const base = [236 + rnd() * 14, 222 + rnd() * 14, 190 + rnd() * 16];
        c.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
        c.fillRect(x + off + 3, r * bh + 3, 74, bh - 6);
        c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x + off + 3, r * bh + 3, 74, 5);
        c.fillStyle = 'rgba(120,90,50,0.1)'; c.fillRect(x + off + 3, r * bh + bh - 10, 74, 7);
      }
    }
  });
  const paveTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#d5c4a4'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) {
      const v = 238 + rnd() * 14;
      c.fillStyle = `rgb(${v | 0},${(v * 0.95) | 0},${(v * 0.84) | 0})`;
      c.fillRect(x + 2, y + 2, 60, 60);
    }
  });
  const crackTex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#e8d2ad'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8a6a44'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(10, 20); c.lineTo(50, 60); c.lineTo(40, 100); c.moveTo(50, 60); c.lineTo(100, 50); c.lineTo(118, 90); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 0, w, 10);
  });
  const STONE = toon({ map: brickTex }), PAVE = toon({ map: paveTex }), DARK = toon({ color: 0x6b5a48 });
  const CRACK = toon({ map: crackTex });
  const WOOD = toon({ color: 0xc98a52 }), RED = toon({ color: 0xff5a4a }), GOLD = toon({ color: 0xffcf3f }), ROPE = toon({ color: 0xe9d3a6 });
  const NEONM = BRIGHT.map((c) => toon({ color: c, emissive: c, emissiveIntensity: 0.15 }));

  /** A box with its texture ~2 m a tile on every face. */
  function boxGeo(w, h, d, tile = 2) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px nx py ny pz nz
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * sizes[f][0] / tile, uv.getY(i) * sizes[f][1] / tile);
    }
    return g;
  }
  /** A thin cylinder from a to b (ropes, cables, spokes). */
  function rod(a, b, r, mat) {
    const v = new THREE.Vector3().subVectors(b, a), len = v.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6), mat);
    m.scale.y = len; m.position.copy(a).addScaledVector(v, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    return m;
  }

  // ---- the sky: a gradient dome, a soft sun (or moon), puffy clouds all round, a turquoise sea below --
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 512;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -20;
  scene.add(dome);
  function paintSky(stops) {
    const c = skyCanvas.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 512);
    // top of the sphere to the horizon (the middle), then the same pale haze below
    stops.forEach((s, i) => g.addColorStop((i / (stops.length - 1)) * 0.5, s));
    g.addColorStop(1, stops[stops.length - 1]);
    c.fillStyle = g; c.fillRect(0, 0, 4, 512);
    skyTex.needsUpdate = true;
  }
  /** The sun: a soft white disc in a wide glow. At night, the moon: a pale disc with a few soft craters. */
  function sunTexture(col, night) {
    return canvasTex(512, 512, (c) => {
      const glow = c.createRadialGradient(256, 256, 40, 256, 256, 256);
      glow.addColorStop(0, night ? 'rgba(255,248,220,0.5)' : 'rgba(255,255,240,0.9)');
      glow.addColorStop(0.35, night ? 'rgba(200,215,255,0.16)' : 'rgba(255,250,225,0.35)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = glow; c.fillRect(0, 0, 512, 512);
      c.beginPath(); c.arc(256, 256, night ? 70 : 54, 0, Math.PI * 2); c.fillStyle = col; c.fill();
      if (night) {
        c.fillStyle = 'rgba(190,190,170,0.35)';
        [[230, 236, 16], [285, 270, 11], [250, 292, 8], [292, 228, 7]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); });
      }
    }, 1, 1);
  }
  const sunMat = new THREE.MeshBasicMaterial({ transparent: true, fog: false, depthWrite: false, toneMapped: false });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), sunMat);
  sun.renderOrder = -19;
  scene.add(sun);
  // puffy cartoon clouds: round white lumps, a little shade along the bottom
  function cloudTexture(k) {
    return canvasTex(512, 256, (c, w, h) => {
      const blobs = [];
      const n = 6 + (k % 3);
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), r = 46 + Math.sin(u * Math.PI) * 50 + rnd() * 18;
        blobs.push([70 + u * (w - 140) + (rnd() - 0.5) * 24, h - 62 - Math.sin(u * Math.PI) * 40 + (rnd() - 0.5) * 16, r]);
      }
      c.fillStyle = '#ffffff';
      blobs.forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); });
      c.fillRect(70, h - 80, w - 140, 52);
      // a soft blue-grey shade on the underside
      c.globalCompositeOperation = 'source-atop';
      const g = c.createLinearGradient(0, h * 0.45, 0, h);
      g.addColorStop(0, 'rgba(160,190,220,0)'); g.addColorStop(1, 'rgba(150,180,215,0.55)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }, 1, 1);
  }
  const cloudTexs = [0, 1, 2].map(cloudTexture);
  const cloudMats = cloudTexs.map((t) => new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false, transparent: true }));
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    const sp = new THREE.Sprite(cloudMats[i % 3]);
    const a = (i / 26) * Math.PI * 2 + rnd() * 0.2, r = 260 + rnd() * 160, sc = 50 + rnd() * 60;
    sp.scale.set(sc * 2, sc, 1);
    sp.renderOrder = -18;
    sp.userData = { a, r, y: 8 + rnd() * 70, drift: 0.002 + rnd() * 0.004 };
    scene.add(sp); clouds.push(sp);
  }
  function buildBackdrop(lv) {
    const look = SKIES[lv % SKIES.length];
    paintSky(look.sky);
    if (sunMat.map) sunMat.map.dispose();
    sunMat.map = sunTexture(look.sun, look.night); sunMat.needsUpdate = true;
    cloudMats.forEach((m) => m.color.set(look.cloud));
    hemi.color.set(look.hemi[0]); hemi.groundColor.set(look.hemi[1]); hemi.intensity = look.hemi[2];
    key.color.set(look.key[0]); key.intensity = look.key[1];
    rim.color.set(look.fill[0]); rim.intensity = look.fill[1];
    scene.fog.color.set(look.mist);
    paintSea(look.sea);
    stars.visible = skyLanterns.visible = !!look.night;
  }
  // a turquoise sea far below, with ripples and foam: falling means falling into it
  const seaCanvas = document.createElement('canvas');
  seaCanvas.width = seaCanvas.height = 512;
  const seaTex = new THREE.CanvasTexture(seaCanvas);
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping; seaTex.repeat.set(14, 14); seaTex.colorSpace = THREE.SRGBColorSpace;
  function paintSea([deep, light]) {
    const c = seaCanvas.getContext('2d'), w = 512, h = 512;
    let sd = 7; const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    c.fillStyle = deep; c.fillRect(0, 0, w, h);
    // soft lighter patches
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, rr = 30 + r() * 70, g = c.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, light); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 0.5; c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      // (wrap round the edges, so the tiles join)
      [[w, 0], [-w, 0], [0, h], [0, -h]].forEach(([ox, oy]) => { c.save(); c.translate(ox, oy); c.fillRect(x - rr, y - rr, rr * 2, rr * 2); c.restore(); });
    }
    c.globalAlpha = 1;
    // little white foam ripples
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, len = 8 + r() * 22;
      c.lineWidth = 2 + r() * 2.5;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + len / 2, y - 4, x + len, y); c.stroke();
    }
    seaTex.needsUpdate = true;
  }
  const cloudMat = new THREE.MeshBasicMaterial({ map: seaTex }); // (the sea; was a sea of cloud)
  const cloudSea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), cloudMat);
  cloudSea.rotation.x = -Math.PI / 2;
  scene.add(cloudSea);
  const cloudTex = seaTex;
  // night: stars on the dome, and paper sky lanterns rising all round
  const starGeo = new THREE.BufferGeometry(), starPos = [];
  for (let i = 0; i < 700; i++) {
    const a = rnd() * Math.PI * 2, e = 0.08 + Math.pow(rnd(), 0.7) * 1.4, r = 560;
    starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, depthWrite: false, transparent: true, opacity: 0.85 }));
  stars.renderOrder = -19; stars.visible = false;
  scene.add(stars);
  const SKYL = 46, skyLanterns = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1.4, 1.1), new THREE.MeshBasicMaterial({ color: 0xffa64d, toneMapped: false, fog: false }), SKYL);
  skyLanterns.frustumCulled = false; skyLanterns.visible = false;
  scene.add(skyLanterns);
  const skyl = [];
  for (let i = 0; i < SKYL; i++) skyl.push({ a: rnd() * Math.PI * 2, r: 14 + rnd() * 60, y: rnd() * 60 - 30, sp: 0.6 + rnd() * 0.9, ph: rnd() * 6 });

  // ---- the level ---------------------------------------------------------------------------
  const levelGroup = new THREE.Group();
  scene.add(levelGroup);
  let built = -1;
  const movers = [], crumbles = [], towers = [], bouncers = [];
  function clearLevel() {
    levelGroup.traverse((o) => {
      if (o.isMesh && o.geometry && !o.userData.shared) o.geometry.dispose();
      // (the graffiti tags' own painted textures: each stretch made new ones, and they were never freed)
      if (o.userData.ownMaterial) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    levelGroup.clear();
    [movers, crumbles, towers, bouncers].forEach((a) => { a.length = 0; });
  }
  // the rock hanging under every floating piece: warm, layered cliff rock
  const ROCK = toon({ map: rockTex() }), GRASS = toon({ map: grassTex() }), TRUNK = toon({ color: 0x8a5a36 });
  const LEAF = [toon({ color: 0x5cc943 }), toon({ color: 0x48b23a }), toon({ color: 0x79d957 })];
  function rockTex() {
    return canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#b48a5c'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) { c.fillStyle = y % 32 ? 'rgba(255,235,200,0.16)' : 'rgba(90,60,30,0.12)'; c.fillRect(0, y, w, 9); } // strata
      for (let i = 0; i < 40; i++) { const v = rnd(); c.fillStyle = v < 0.5 ? 'rgba(255,240,210,0.18)' : 'rgba(90,60,30,0.14)'; c.fillRect(rnd() * w, rnd() * h, 8 + rnd() * 20, 3 + rnd() * 5); }
    }, 1, 1);
  }
  function grassTex() {
    return canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#6ccf45'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(150,230,90,0.35)' : 'rgba(40,140,40,0.18)'; const x = rnd() * w, y = rnd() * h; c.fillRect(x, y, 2, 4 + rnd() * 4); }
    }, 1, 1);
  }
  // an island's side: a lip of grass along the top, cliff rock below it (mapped from the top down, metres)
  const islandSideTex = canvasTex(64, 256, (c, w, h) => {
    const m = h / 4; // 4 m of side
    c.fillStyle = '#b48a5c'; c.fillRect(0, 0, w, h);
    for (let y = m * 0.5; y < h; y += 12) { c.fillStyle = (y / 12) % 2 < 1 ? 'rgba(255,235,200,0.16)' : 'rgba(90,60,30,0.12)'; c.fillRect(0, y, w, 7); }
    c.fillStyle = '#6ccf45'; c.fillRect(0, 0, w, m * 0.32);
    // a scalloped edge where the grass hangs over the rock
    for (let x = -6; x < w + 6; x += 12) { c.beginPath(); c.arc(x + 6, m * 0.32, 6.5, 0, Math.PI); c.fill(); }
    c.fillStyle = 'rgba(40,120,40,0.25)'; c.fillRect(0, m * 0.32 - 3, w, 3);
  }, 1, 1);
  islandSideTex.wrapT = THREE.ClampToEdgeWrapping;
  const ISLAND_SIDE = toon({ map: islandSideTex });
  /** A rock island: grass on top, a grass lip down the sides, cliff below (its sides mapped from the top down). */
  function islandGeo(w, h, d) {
    const g = boxGeo(w, h, d), uv = g.attributes.uv;
    const sides = [[d, h], [d, h], null, null, [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      if (!sides[f]) continue;
      for (let k = 0; k < 4; k++) { const i = f * 4 + k, v = uv.getY(i) > 0 ? 1 : 0; uv.setXY(i, uv.getX(i), 1 - (v ? 0 : h / 4)); }
    }
    return g;
  }
  // a round cartoon tree: a short trunk and three puffy balls of leaves (inside the tree's box, as the pines were)
  const leafGeo = new THREE.IcosahedronGeometry(1, 1);
  leafGeo.userData = {};
  function pine(x, y, z, k) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.1, 6), TRUNK); trunk.position.y = 0.55; trunk.castShadow = true; g.add(trunk);
    [[0, 1.55, 0, 0.62], [0.22, 1.25, 0.12, 0.42], [-0.2, 1.95, -0.08, 0.4]].forEach(([dx, dy, dz, r], i) => {
      const b = new THREE.Mesh(leafGeo, LEAF[(i + Math.round(k)) % 3]); b.userData.shared = true;
      b.position.set(dx, dy, dz); b.scale.setScalar(r); b.castShadow = true; b.receiveShadow = true; g.add(b);
    });
    g.position.set(x, y, z); g.scale.setScalar(0.5 + k * 0.25);
    levelGroup.add(g);
  }
  // everything solid is drawn exactly as the simulation has it, so nobody
  // (and no chain) is ever seen passing through anything
  function wallBox(s) {
    const w = s.x1 - s.x0, h = s.y1 - s.y0, d = s.z1 - s.z0;
    const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, cz = (s.z0 + s.z1) / 2;
    if (s.kind === 'merlon') { const b = outlined(boxGeo(w, h, d, 1.1), STONE); b.position.set(cx, cy, cz); levelGroup.add(b); return; }
    if (s.kind === 'under') { const b = outlined(boxGeo(w, h, d, 3), ROCK); b.position.set(cx, cy, cz); levelGroup.add(b); return; } // the rock hanging under a piece, in steps
    if (s.kind === 'tree') { pine(cx, s.y0, cz, (s.scale - 0.5) / 0.25); return; }
    if (s.kind === 'barrels') { // a stack of two, upright
      for (let k = 0; k < 2; k++) { const b = barrelModel(); b.position.set(cx, s.y0 + 0.475 + k * 0.95, cz); levelGroup.add(b); }
      return;
    }
    if (s.kind === 'post' || s.kind === 'tower' || s.kind === 'hub' || s.kind === 'gong') return; // drawn with the gate, the zip line, the watchtower, the carousel
    if (s.kind === 'rockets') { // a row of three firework rockets along the side of a launch pad
      const alongX = w > d, len = alongX ? w : d;
      for (let k = 0; k < 3; k++) {
        const r = outlined(new THREE.CylinderGeometry(0.13, 0.13, 1.0, 6), k % 2 ? RED : GOLD);
        const u = -len / 2 + 0.3 + (k * (len - 0.6)) / 2;
        r.position.set(cx + (alongX ? u : 0), s.y0 + 0.5, cz + (alongX ? 0 : u));
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.25, 6), NEONM[k % 4]); tip.position.y = 0.62; r.add(tip);
        levelGroup.add(r);
      }
      return;
    }
    const g = s.kind === 'rock' ? islandGeo(w, h, d) : boxGeo(w, h, d);
    const mats = s.kind === 'plank' ? WOOD : s.kind === 'rock' ? [ISLAND_SIDE, ISLAND_SIDE, GRASS, ROCK, ISLAND_SIDE, ISLAND_SIDE] : [STONE, STONE, PAVE, DARK, STONE, STONE];
    const grp = new THREE.Group();
    const m = new THREE.Mesh(g, mats);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    grp.position.set((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2);
    levelGroup.add(grp);
  }
  // rocks drifting in the sky round the climb (only drawn)
  const drifters = [];
  function scatterRocks(L) {
    const xs = L.solids.map((q) => (q.x0 + q.x1) / 2), zs = L.solids.map((q) => (q.z0 + q.z1) / 2), ys = L.solids.map((q) => q.y1);
    const minX = Math.min(...xs) - 25, maxX = Math.max(...xs) + 25, minZ = Math.min(...zs) - 25, maxZ = Math.max(...zs) + 25, minY = Math.min(...ys) - 12, maxY = Math.max(...ys) + 18;
    drifters.length = 0;
    for (let i = 0; i < 46; i++) {
      const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ), y = minY + rnd() * (maxY - minY);
      const sz = 0.5 + rnd() * 1.6;
      if (i % 2 || L.solids.some((q) => x > q.x0 - 10 && x < q.x1 + 10 && z > q.z0 - 10 && z < q.z1 + 10)) continue; // fewer, and well clear of the way (and the camera)
      const r = outlined(new THREE.DodecahedronGeometry(sz, 0), ROCK);
      r.position.set(x, y, z); r.rotation.set(0, rnd() * 3, 0); // (upright, so the grass stays on top)
      const top = outlined(new THREE.CylinderGeometry(sz * 0.8, sz * 0.8, 0.22, 9), GRASS); top.position.y = sz * 0.75; r.add(top); // little grassy islets
      levelGroup.add(r); drifters.push({ r, y, ph: rnd() * 6, sp: 0.2 + rnd() * 0.4 });
    }
  }
  function tower(c) {
    // a square watchtower beside the walkway, a flag that lights up when reached
    const [dx, dz] = c.dir, px = -dz, pz = dx; // (to the right of the way on)
    const g = new THREE.Group();
    const t = outlined(boxGeo(3.6, 12, 3.6, 2), STONE); t.position.y = 6 - 5; g.add(t);
    const roof = outlined(new THREE.ConeGeometry(3.2, 2, 4), toon({ color: 0xe0563f })); roof.rotation.y = Math.PI / 4; roof.position.y = 6.9 + 1; g.add(roof);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), toon({ color: 0x8a5a36 })); pole.position.set(0, 9.6, 0); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1, 6, 1), new THREE.MeshBasicMaterial({ color: 0xf4efe4, side: THREE.DoubleSide, toneMapped: false }));
    flag.position.set(0.82, 10.4, 0); g.add(flag);
    g.position.set(c.tower ? c.tower.x : c.x - px * 6.6, c.y - 6, c.tower ? c.tower.z : c.z - pz * 6.6); // beside the way, on the side that's clear (levels.js)
    levelGroup.add(g);
    return { g, flag };
  }
  function build(lv) {
    clearLevel();
    built = lv;
    const L = LEVELS[lv];
    seed = 11 + lv * 97;
    buildBackdrop(lv);
    cloudSea.position.y = L.fallY - 4;
    L.solids.forEach(wallBox);
    scatterRocks(L);
    L.crumbles.forEach((c) => {
      const g = outlined(boxGeo(c.x1 - c.x0, c.y1 - c.y0, c.z1 - c.z0, 1.2), CRACK);
      g.position.set((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2);
      levelGroup.add(g); crumbles.push({ g, home: g.position.clone(), fall: 0 });
    });
    L.movers.forEach((m) => {
      const g = new THREE.Group();
      if (m.kind === 'lantern') {
        g.add(outlined(boxGeo(m.w, m.h, m.d, 1), WOOD));
        const lan = outlined(new THREE.CylinderGeometry(0.85, 0.85, 1.4, 10), RED); lan.position.y = -1.05; g.add(lan);
        [-0.75, 0.75].forEach((y) => { const cap = outlined(new THREE.CylinderGeometry(0.55, 0.55, 0.18, 10), GOLD); cap.position.y = -1.05 + y * 0.95; g.add(cap); });
        if (!lowPower) { const glow = new THREE.PointLight(0xff6a3a, 6, 8, 2); glow.position.y = -1.05; g.add(glow); }
        // (a sky lantern: it floats and sways on its own — no rope through where people stand)
      } else if (m.kind === 'cart') {
        // its box is exactly its solid one: the top is the floor you stand on. The trim sits on the body,
        // not inside it (sharing the top face, the two flickered in and out — "weird non-solid pixels")
        const body = outlined(boxGeo(m.w, m.h - 0.12, m.d, 1), WOOD); body.position.y = -0.06; g.add(body);
        const trim = outlined(boxGeo(m.w, 0.12, m.d, 1), GOLD); trim.position.y = m.h / 2 - 0.06; g.add(trim);
        // the two overhead cables its hangers run on, either side, from end to end of its run (well out of reach)
        const p = m.path, ex = p.bx - p.ax, ez = p.bz - p.az, el = Math.hypot(ex, ez) || 1, ux = ex / el, uz = ez / el;
        for (const e of [-1.4, 1.4]) levelGroup.add(rod(new THREE.Vector3(p.ax - ux * 3 - uz * e, p.ay + 2.8, p.az - uz * 3 + ux * e), new THREE.Vector3(p.bx + ux * 3 - uz * e, p.ay + 2.8, p.bz + uz * 3 + ux * e), 0.04, ROPE));
      } else if (m.kind === 'wheel') {
        const body = outlined(boxGeo(m.w, m.h - 0.08, m.d, 1), WOOD); body.position.y = -0.04; g.add(body); // (the trim on top of it, not inside it)
        const trim = outlined(boxGeo(m.w, 0.08, m.d, 1), NEONM[movers.length % NEONM.length]); trim.position.y = m.h / 2 - 0.04; g.add(trim);
      } else if (m.kind === 'part') { // a solid part riding with something: drawn to its box
        if (m.look === 'dragonHead') {
          g.add(outlined(boxGeo(m.w, m.h, m.d, 1), RED));
          const [fx, fz] = [Math.sign(m.ox || 0), Math.sign(m.oz || 0)];
          [-0.45, 0.45].forEach((u) => { // eyes on its front face, looking on along the Wall
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), NEONM[2]);
            eye.position.set(fx * (m.w / 2) + (fx ? 0 : u), 0.25, fz * (m.d / 2) + (fz ? 0 : u)); g.add(eye);
          });
          const jaw = outlined(boxGeo(m.w * 0.8, 0.3, m.d * 0.8, 1), GOLD); jaw.position.y = -m.h / 2 + 0.15; g.add(jaw);
        } else if (m.look === 'dragonTail') g.add(outlined(boxGeo(m.w, m.h, m.d, 1), toon({ color: 0xff8a3d })));
        else if (m.look === 'dragonPole') g.add(new THREE.Mesh(new THREE.BoxGeometry(m.w, m.h, m.d), WOOD));
        else if (m.look === 'hanger') {
          g.add(new THREE.Mesh(new THREE.BoxGeometry(m.w, m.h, m.d), ROPE));
          const wheel = outlined(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 10), DARK); wheel.rotation.z = Math.PI / 2; wheel.position.y = m.h / 2; g.add(wheel);
        } // (lanternBody: the lantern under the platform, already drawn with it)
      } else { // the parade dragon: red and gold, carried on poles (its box is exactly its solid one)
        g.add(outlined(boxGeo(m.w, m.h, m.d, 1), RED));
        [-1, 1].forEach((sd) => { const fr = outlined(boxGeo(0.12, m.h * 0.7, m.d * 0.9, 1), GOLD); fr.position.set(sd * (m.w / 2 - 0.04), 0, 0); g.add(fr); }); // (2 cm proud of its sides: flush, they flickered)
      }
      levelGroup.add(g);
      movers.push({ m, g });
    });
    // the carousel's hub: a prayer-wheel drum on a pole
    const hubs = new Set();
    L.movers.filter((m) => m.path.type === 'circle').forEach((m) => {
      const k = `${m.path.cx},${m.path.cz}`;
      if (hubs.has(k)) return;
      hubs.add(k);
      const p = m.path;
      // (to the boxes in levels.js: the drum high, out of the riders' way, on a slim pole)
      const pole = outlined(new THREE.CylinderGeometry(0.4, 0.4, 21.6, 10), WOOD); pole.position.set(p.cx, p.cy - 8.2, p.cz); levelGroup.add(pole);
      const drum = outlined(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 14), GOLD); drum.position.set(p.cx, p.cy + 3.2, p.cz); levelGroup.add(drum);
      const band = outlined(new THREE.CylinderGeometry(0.8, 0.8, 0.36, 14), RED); band.position.set(p.cx, p.cy + 3.2, p.cz); band.scale.set(1.03, 1, 1.03); levelGroup.add(band);
      levelGroup.userData.drum = drum;
    });
    L.bouncers.forEach((b) => {
      const g = new THREE.Group(), w = b.x1 - b.x0, d = b.z1 - b.z0;
      const base = outlined(boxGeo(w, 0.5, d, 1), WOOD); base.position.y = -0.25; g.add(base);
      const top = outlined(boxGeo(w - 0.2, 0.12, d - 0.2, 1), NEONM[0]); top.position.y = 0.04; g.add(top);
      g.position.set((b.x0 + b.x1) / 2, b.y1, (b.z0 + b.z1) / 2);
      levelGroup.add(g); bouncers.push({ b, g, kick: 0 });
    });
    L.zips.forEach((z) => {
      const a = new THREE.Vector3(...z.a), b = new THREE.Vector3(...z.b);
      const dir = new THREE.Vector3().subVectors(b, a).normalize(), hz = Math.hypot(dir.x, dir.z);
      const ox = (dir.z / hz) * 1.9, oz = (-dir.x / hz) * 1.9; // (beside the line: the same boxes as levels.js)
      levelGroup.add(rod(a.clone().addScaledVector(dir, -1.2), b.clone().addScaledVector(dir, 1.2), 0.05, toon({ color: 0x5a6470 })));
      [a.clone().addScaledVector(dir, -1.2), b.clone().addScaledVector(dir, 1.2)].forEach((p) => {
        const post = outlined(boxGeo(0.35, 6, 0.35, 1), WOOD); post.position.set(p.x + ox, p.y - 3 + 0.3, p.z + oz); levelGroup.add(post);
        levelGroup.add(rod(new THREE.Vector3(p.x + ox, p.y + 0.3, p.z + oz), p, 0.04, toon({ color: 0x5a6470 })));
      });
    });
    // watchtowers by the checkpoints, a gate or gong at the end
    L.checks.forEach((c) => towers.push(tower(c)));
    {
      const f = L.finish, [dx, dz] = f.dir, g = new THREE.Group();
      [-1.9, 1.9].forEach((x) => { const p = outlined(boxGeo(0.45, 4.8, 0.45, 1), RED); p.position.set(x, 2.4, 0); g.add(p); });
      const beam = outlined(boxGeo(4.9, 0.45, 0.6, 1), WOOD); beam.position.y = 4.9; g.add(beam);
      const beam2 = outlined(boxGeo(4.2, 0.3, 0.5, 1), GOLD); beam2.position.y = 4.25; g.add(beam2);
      if (lv === LEVELS.length - 1) {
        const gong = outlined(new THREE.CylinderGeometry(1.35, 1.35, 0.18, 24), GOLD); gong.rotation.x = Math.PI / 2; gong.position.y = 2.5; g.add(gong);
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), toon({ color: 0xffe9a0 })); boss.position.set(0, 2.5, 0.15); g.add(boss);
        g.userData.gong = gong;
      }
      g.position.set(f.x + dx * 2, f.y, f.z + dz * 2);
      g.rotation.y = Math.atan2(dx, dz);
      levelGroup.add(g); towers.push({ end: true, g });
    }
    // (L.decor's graffiti tags belonged to the old neon look: the bright one draws none)
  }
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.95, 12);
  const bandGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.12, 12);
  function barrelModel() {
    const g = outlined(barrelGeo, RED);
    [-0.3, 0.3].forEach((y) => { const b = new THREE.Mesh(bandGeo, GOLD); b.position.y = y; g.add(b); });
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 4), toon({ color: 0x5a4a3a })); fuse.position.y = 0.62; g.add(fuse);
    return g;
  }
  const barrelPool = [];
  function barrelAt(i) {
    if (!barrelPool[i]) {
      const b = barrelModel();
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), NEONM[2]); spark.position.y = 0.82; b.add(spark);
      scene.add(b); barrelPool[i] = b;
    }
    return barrelPool[i];
  }

  // ---- the travellers -------------------------------------------------------------------------
  const heroModels = [];
  function heroFor(i, keyName) {
    const have = heroModels[i];
    if (have && have.userData.key === keyName) return have;
    if (have) scene.remove(have);
    const h = makeHero(keyName);
    h.scale.setScalar(HERO_SCALE);
    h.traverse((o) => { if (o.isMesh && o.material === MAT) { o.castShadow = true; o.receiveShadow = true; } });
    h.userData.key = keyName;
    h.userData.pose = {};
    beltFor(h);
    scene.add(h);
    heroModels[i] = h;
    return h;
  }
  function setPose(m, target, dt) {
    const u = m.userData, cur = u.pose, rate = 1 - Math.exp(-dt * 16);
    for (const k of ['bob', 'lean', 'legL', 'legR', 'armL', 'armR', 'armLz', 'armRz', 'nod']) cur[k] = (cur[k] || 0) + ((target[k] || 0) - (cur[k] || 0)) * rate;
    u.body.position.y = (u.hip || 5) + cur.bob;
    u.body.rotation.set(cur.lean, 0, 0);
    u.legL.rotation.set(cur.legL, 0, 0); u.legR.rotation.set(cur.legR, 0, 0);
    u.armL.rotation.set(cur.armL, 0, cur.armLz); u.armR.rotation.set(cur.armR, 0, cur.armRz);
    u.head.rotation.set(cur.nod, 0, 0);
  }
  const anim = [];
  function drawPlayers(V, t, dt) {
    V.players.forEach((p, i) => {
      const m = heroFor(i, p.hero);
      // a teammate right in front of the lens would hide everything: don't draw them
      m.visible = p.me || camera.position.distanceTo(TMP.set(p.x, p.y + 1, p.z)) > 2.6;
      m.position.set(p.x, p.y, p.z);
      const a = anim[i] || (anim[i] = { ph: 0, yaw: p.face || 0 });
      let d = (p.face || 0) - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      a.yaw += d * (1 - Math.exp(-dt * 24)); // (turns quickly, so the model faces where you steer)
      m.rotation.y = a.yaw;
      const speed = Math.hypot(p.vx, p.vz);
      let target;
      if (p.zip) target = { armL: -3.0, armR: -3.0, legL: -0.4, legR: 0.3, lean: 0.1 };
      else if (p.grab && p.taut) { // hauling: leaning back, hand over hand on the rope
        const h = Math.sin(t * 9 + i);
        target = { bob: -1.2, lean: -0.35, legL: -1.3, legR: 0.9, armL: -1.5 + h * 0.55, armR: -1.5 - h * 0.55, armLz: -0.15, armRz: 0.15, nod: 0.25 };
      } else if (p.grab) target = { bob: -1.4, lean: 0.55, legL: -1.1, legR: 0.6, armL: -1.2, armR: -1.2, armLz: -0.3, armRz: 0.3, nod: -0.2 }; // dug in, hands on the rope
      else if (p.knock) target = { lean: -0.6, armL: -2.6, armR: -2.2, armLz: -0.8, armRz: 0.8, legL: -0.8, legR: 0.6 };
      else if (!p.ground && (p.hung || (p.taut && p.vy < 1))) target = { armL: -3.0, armR: -2.8, legL: Math.sin(t * 9 + i) * 0.6, legR: -Math.sin(t * 9 + i) * 0.6, nod: 0.3 }; // dangling
      else if (!p.ground) target = { legL: p.vy > 0 ? -1.2 : -0.5, legR: p.vy > 0 ? 0.5 : 0.2, armL: -2.5, armR: -2.3, armLz: -0.4, armRz: 0.4, lean: 0.12 };
      else if (speed > 0.6) {
        a.ph += dt * speed * 2.2;
        target = { bob: Math.abs(Math.cos(a.ph)) * 0.7, lean: 0.18, legL: Math.sin(a.ph) * 0.95, legR: -Math.sin(a.ph) * 0.95, armL: -Math.sin(a.ph) * 0.8, armR: Math.sin(a.ph) * 0.8 };
      } else target = { bob: Math.sin(t * 2 + i) * 0.15, armL: Math.sin(t * 2 + i) * 0.05, armR: -Math.sin(t * 2 + i) * 0.05 };
      setPose(m, target, dt);
      m.updateMatrixWorld(true); // (the rope ties on to its belt, just after)
    });
    for (let i = V.players.length; i < heroModels.length; i++) if (heroModels[i]) heroModels[i].visible = false;
  }

  // ---- the rope (how it hangs is rope.js: it never goes into anything) ----------------------------
  // A thin three-strand braid (user, Oct 15 2026: "smaller and have a braid and wrap around
  // the characters' waist"): three hemp strands twisting round the line rope.js gives, an ink
  // outline round the whole, tied to a braided belt round each traveller's waist (heroFor) on
  // the side facing the one it goes to, with a knot there.
  const BRAID_R = ROPE_R * 0.5, BRAID_OFF = ROPE_R * 0.48, TWIST = (Math.PI * 2) / 0.2, SIDES = 6, STRANDS = 3;
  // red and white, like a climbing rope (user's reference, Nov 14 2026)
  const STRAND_COLS = [new THREE.Color(0xf0453a), new THREE.Color(0xfff8f0), new THREE.Color(0xe03a30)];
  const braidMat = toon({ vertexColors: true });
  const braidInk = new THREE.MeshBasicMaterial({ visible: false }); // (no outline in this look)
  /** A braid that can be redrawn along any line of up to maxPts samples. `scale` divides every size
   *  (a belt is built inside a hero model, which is scaled down). */
  function makeBraid(maxPts, scale = 1, mat = braidMat) {
    const nv = maxPts * STRANDS * SIDES, pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    for (let j = 0; j < maxPts; j++) for (let k = 0; k < STRANDS; k++) for (let f = 0; f < SIDES; f++) {
      const v = ((j * STRANDS + k) * SIDES + f) * 3, c = STRAND_COLS[k].clone().multiplyScalar(0.9 + 0.1 * Math.cos((f / SIDES) * Math.PI * 2));
      col[v] = c.r; col[v + 1] = c.g; col[v + 2] = c.b;
    }
    const idx = [];
    for (let j = 0; j + 1 < maxPts; j++) for (let k = 0; k < STRANDS; k++) for (let f = 0; f < SIDES; f++) {
      const a = (j * STRANDS + k) * SIDES, b = ((j + 1) * STRANDS + k) * SIDES, f1 = (f + 1) % SIDES;
      idx.push(a + f, a + f1, b + f, a + f1, b + f1, b + f);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    const ipos = new Float32Array(maxPts * SIDES * 3), inor = new Float32Array(maxPts * SIDES * 3), iidx = [];
    for (let j = 0; j + 1 < maxPts; j++) for (let f = 0; f < SIDES; f++) { const a = j * SIDES, b = a + SIDES, f1 = (f + 1) % SIDES; iidx.push(a + f, a + f1, b + f, a + f1, b + f1, b + f); }
    const igeo = new THREE.BufferGeometry();
    igeo.setAttribute('position', new THREE.BufferAttribute(ipos, 3).setUsage(THREE.DynamicDrawUsage));
    igeo.setAttribute('normal', new THREE.BufferAttribute(inor, 3).setUsage(THREE.DynamicDrawUsage));
    igeo.setIndex(iidx);
    const mesh = new THREE.Mesh(geo, mat), ink = new THREE.Mesh(igeo, braidInk);
    mesh.castShadow = true; mesh.frustumCulled = ink.frustumCulled = false;
    const S_ = [], T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3(), Q0 = new THREE.Vector3(), Q1 = new THREE.Vector3(), R = new THREE.Vector3(), C0 = new THREE.Vector3();
    const step = 0.025 / scale, br = BRAID_R / scale, off = BRAID_OFF / scale, inkR = (BRAID_OFF + BRAID_R + 0.012) / scale, tw = TWIST * scale;
    /** Lay the braid along a line of points ({x, y, z}). */
    function update(line) {
      // even samples along the line
      let total = 0; for (let k = 1; k < line.length; k++) total += Math.hypot(line[k].x - line[k - 1].x, line[k].y - line[k - 1].y, line[k].z - line[k - 1].z);
      const n = Math.max(2, Math.min(maxPts, Math.ceil(total / step) + 1)), ds = total / (n - 1);
      S_.length = 0;
      let seg = 0, segS = 0, segL = 0;
      const segLen = (k) => Math.hypot(line[k + 1].x - line[k].x, line[k + 1].y - line[k].y, line[k + 1].z - line[k].z);
      if (line.length > 1) segL = segLen(0);
      for (let j = 0; j < n; j++) {
        const want = j * ds;
        while (seg + 2 < line.length && segS + segL < want) { segS += segL; seg++; segL = segLen(seg); }
        const u = segL > 1e-6 ? Math.max(0, Math.min(1, (want - segS) / segL)) : 0, a = line[seg], b = line[Math.min(seg + 1, line.length - 1)];
        S_.push(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
      }
      const pa = geo.attributes.position.array, na = geo.attributes.normal.array, ia = igeo.attributes.position.array, ina = igeo.attributes.normal.array;
      N.set(0, 1, 0);
      for (let j = 0; j < n; j++) {
        Q0.fromArray(S_, Math.max(0, j - 1) * 3); Q1.fromArray(S_, Math.min(n - 1, j + 1) * 3);
        T.copy(Q1).sub(Q0); if (T.lengthSq() < 1e-12) T.set(1, 0, 0); T.normalize();
        // carry the frame along (parallel transport), so the strands never flip round
        N.addScaledVector(T, -N.dot(T)); if (N.lengthSq() < 1e-6) N.set(T.y, -T.x, 0).addScaledVector(T, 0); if (N.lengthSq() < 1e-6) N.set(0, T.z, -T.y); N.normalize();
        Bn.crossVectors(T, N);
        C0.fromArray(S_, j * 3);
        for (let f = 0; f < SIDES; f++) {
          const ph = (f / SIDES) * Math.PI * 2, v = (j * SIDES + f) * 3;
          R.copy(N).multiplyScalar(Math.cos(ph)).addScaledVector(Bn, Math.sin(ph));
          ia[v] = C0.x + R.x * inkR; ia[v + 1] = C0.y + R.y * inkR; ia[v + 2] = C0.z + R.z * inkR;
          ina[v] = R.x; ina[v + 1] = R.y; ina[v + 2] = R.z;
        }
        for (let k = 0; k < STRANDS; k++) {
          const th = j * ds * tw + (k * Math.PI * 2) / STRANDS, cx = C0.x + (N.x * Math.cos(th) + Bn.x * Math.sin(th)) * off,
            cy = C0.y + (N.y * Math.cos(th) + Bn.y * Math.sin(th)) * off, cz = C0.z + (N.z * Math.cos(th) + Bn.z * Math.sin(th)) * off;
          for (let f = 0; f < SIDES; f++) {
            const ph = (f / SIDES) * Math.PI * 2, v = ((j * STRANDS + k) * SIDES + f) * 3;
            R.copy(N).multiplyScalar(Math.cos(ph)).addScaledVector(Bn, Math.sin(ph));
            pa[v] = cx + R.x * br; pa[v + 1] = cy + R.y * br; pa[v + 2] = cz + R.z * br;
            na[v] = R.x; na[v + 1] = R.y; na[v + 2] = R.z;
          }
        }
      }
      geo.setDrawRange(0, (n - 1) * STRANDS * SIDES * 6); igeo.setDrawRange(0, (n - 1) * SIDES * 6);
      geo.attributes.position.needsUpdate = geo.attributes.normal.needsUpdate = true;
      igeo.attributes.position.needsUpdate = igeo.attributes.normal.needsUpdate = true;
    }
    return { mesh, ink, update };
  }
  /** A braided belt round a hero's waist (in the model's own units), and where its rope ties on. */
  function beltFor(h) {
    const u = h.userData, look = HERO_LOOKS[h.userData.key] || {}, b = Object.assign({ slim: 1, torso: 1 }, look.build);
    const zs = b.slim < 1 ? 0.92 : 1, wide = look.poncho; // (Bennett's poncho hangs over his waist: the belt goes round it)
    // (model units: voxels are 0.5; the torso is 11 × 7 voxels, the poncho up to 14.4 × 8.8)
    const rx = (wide ? 3.6 : 2.75) * b.slim + 0.12, rz = (wide ? 2.2 : 1.75) * zs + 0.12, y = wide ? 1.4 : 0.75;
    const pts = [];
    for (let k = 0; k <= 48; k++) { const a = (k / 48) * Math.PI * 2; pts.push({ x: Math.sin(a) * rx, y, z: Math.cos(a) * rz }); }
    const belt = makeBraid(64, HERO_SCALE);
    belt.update(pts);
    belt.mesh.castShadow = false;
    u.body.add(belt.mesh, belt.ink);
    u.belt = { rx, rz, y };
  }
  const ropes = [], braids = [];
  // each rope has its own material, so it can glow warm when it's pulled tight (review, Oct 17 2026)
  for (let i = 0; i < 3; i++) { const br = makeBraid(260, 1, toon({ vertexColors: true })); br.tension = 0; scene.add(br.mesh, br.ink); braids.push(br); }
  const KNOTS = 6, knots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(ROPE_R * 1.25, 1), toon({ color: 0xe03a30 }), KNOTS);
  knots.frustumCulled = false; scene.add(knots);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), C = new THREE.Color(), SC = new THREE.Vector3(1, 1, 1);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), X = new THREE.Vector3();
  /** Where on traveller i's belt the rope to `to` (a world point) ties on. */
  function tieOn(i, to, out) {
    const m = heroModels[i], bt = m && m.userData.belt;
    if (!bt) return out.set(to.x, to.y, to.z);
    const body = m.userData.body;
    X.copy(to); body.worldToLocal(X);
    const lx = X.x, lz = X.z, t = 1 / (Math.sqrt((lx / bt.rx) ** 2 + (lz / bt.rz) ** 2) || 1);
    out.set(lx * t, bt.y, lz * t);
    return body.localToWorld(out);
  }
  function drawChain(V, dt) {
    let nk = 0;
    const L = LEVELS[V.lv] || LEVELS[built];
    if (ropes.lv !== built) { ropes.length = 0; ropes.lv = built; }
    for (let i = 0; i < 3; i++) {
      const a = V.players[i], b = V.players[i + 1];
      if (!a || !b) { braids[i].mesh.visible = braids[i].ink.visible = false; continue; }
      braids[i].mesh.visible = braids[i].ink.visible = true;
      // tie on at the waist, on the side facing the other one
      tieOn(i, B.set(b.x, b.y + 0.5, b.z), A); tieOn(i + 1, X.set(a.x, a.y + 0.5, a.z).clone(), B);
      const boxes = ropeBoxes(L, V.t, (k) => !!(V.crumble[k] && V.crumble[k].gone), A, B, CHAIN);
      // pressed against something (a tree, a wall), the belt's side can be in it: tie on at the middle instead
      if (insideAny(A, boxes)) A.set(a.x, a.y + 0.5, a.z);
      if (insideAny(B, boxes)) B.set(b.x, b.y + 0.5, b.z);
      braids[i].update(ropePath(stepRope(ropes[i] || (ropes[i] = {}), A, B, boxes, dt || 1 / 60, CHAIN), boxes));
      // tight: it glows warm and throbs
      const want = Math.max(0, Math.min(1, (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / CHAIN - 0.86) / 0.12));
      braids[i].tension += (want - braids[i].tension) * Math.min(1, (dt || 0.016) * 10);
      const k = braids[i].tension * (0.75 + 0.25 * Math.sin(V.t * 14 + i));
      braids[i].mesh.material.emissive.setRGB(0.85 * k, 0.28 * k, 0.05 * k);
      for (const e of [A, B]) { M4.compose(e, Q.identity(), SC); knots.setMatrixAt(nk++, M4); }
    }
    for (let k = nk; k < KNOTS; k++) { M4.makeScale(0, 0, 0); knots.setMatrixAt(k, M4); }
    knots.instanceMatrix.needsUpdate = true;
  }

  // ---- particles (instanced cubes: confetti, sparks, debris, wind) ------------------------------
  const PN = 300;
  const parts = [];
  const partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), PN);
  partMesh.frustumCulled = false;
  partMesh.setColorAt(0, new THREE.Color(0xffffff));
  scene.add(partMesh);
  function burst(x, y, z, n, cols, speed = 6, size = 0.14, life = 1, grav = 9) {
    for (let k = 0; k < n && parts.length < PN; k++) {
      const a = rnd() * Math.PI * 2, e = rnd() * 0.9 + 0.2, v = speed * (0.4 + rnd() * 0.8);
      parts.push({ x, y, z, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(e) * v + speed * 0.3, vz: Math.sin(a) * Math.cos(e) * v, t: 0, life: life * (0.6 + rnd() * 0.6), size, col: cols[k % cols.length], grav, spin: rnd() * 6 });
    }
  }
  function drawParts(dt) {
    for (let k = parts.length - 1; k >= 0; k--) {
      const p = parts[k];
      p.t += dt; p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.t > p.life) parts.splice(k, 1);
    }
    let n = 0;
    for (const p of parts) {
      const s = p.size * (1 - (p.t / p.life) * 0.6);
      E.set(p.t * p.spin, p.t * p.spin * 0.7, 0); Q.setFromEuler(E);
      P.set(p.x, p.y, p.z); SC.set(s, s, s);
      M4.compose(P, Q, SC); partMesh.setMatrixAt(n, M4); partMesh.setColorAt(n, C.set(p.col)); n++;
    }
    SC.set(1, 1, 1);
    for (let k = n; k < PN; k++) { M4.makeScale(0, 0, 0); partMesh.setMatrixAt(k, M4); }
    partMesh.instanceMatrix.needsUpdate = true;
    if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
  }

  // ---- layout & the third-person camera --------------------------------------------------------
  const view = { cw: 1, ch: 1, dpr: 1 };
  function layout() {
    const cw = stage.clientWidth, ch = stage.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 3);
    Object.assign(view, { cw, ch, dpr });
    for (const c of [glCanvas, hudCanvas]) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
    hudCanvas.width = Math.round(cw * dpr); hudCanvas.height = Math.round(ch * dpr);
    if (renderer) { renderer.setPixelRatio(lowPower ? 0.75 : Math.min(dpr, quality.cap)); renderer.setSize(cw, ch, false); }
    camera.aspect = cw / ch;
    camera.fov = cw / ch < 0.8 ? 68 : 56; // a phone held upright needs a taller view to see sideways
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', layout);
  layout();
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false };
  let seaClock = 0;
  const TMP = new THREE.Vector3(), LOOK = new THREE.Vector3();
  function updateCamera(V, dt) {
    const me = V.players[S.me] || V.players[0];
    if (!me) return;
    // further back when the gang is spread out
    const spread = Math.max(...V.players.map((p) => Math.hypot(p.x - me.x, p.z - me.z)));
    const dist = 7.4 + Math.min(3, spread * 0.22), pitch = S.cam.pitch;
    const fx = Math.sin(S.cam.yaw), fz = Math.cos(S.cam.yaw);
    const lift = S.cam.lift * S.cam.hang; // (hanging off a ledge: look up toward it)
    LOOK.set(me.x + fx * 1.5, me.y + 1.2 + lift, me.z + fz * 1.5);
    TMP.set(me.x - fx * dist * Math.cos(pitch), me.y + 1.2 + dist * Math.sin(pitch) + lift * 0.4, me.z - fz * dist * Math.cos(pitch));
    // never inside the stone: from where it looks, pull the camera in before the first piece in the way
    const L = LEVELS[V.lv];
    if (L) {
      const ok = (x, y, z) => !L.solids.some((q) => x > q.x0 - 0.25 && x < q.x1 + 0.25 && y > q.y0 - 0.25 && y < q.y1 + 0.25 && z > q.z0 - 0.25 && z < q.z1 + 0.25);
      for (let k = 1; k <= 12; k++) {
        const u = k / 12, x = LOOK.x + (TMP.x - LOOK.x) * u, y = LOOK.y + (TMP.y - LOOK.y) * u, z = LOOK.z + (TMP.z - LOOK.z) * u;
        if (!ok(x, y, z)) { const b = Math.max(0.25, (k - 1) / 12); TMP.set(LOOK.x + (TMP.x - LOOK.x) * b, LOOK.y + (TMP.y - LOOK.y) * b, LOOK.z + (TMP.z - LOOK.z) * b); break; }
      }
    }
    const k = cam.ready ? 1 - Math.exp(-dt * 8) : 1;
    cam.pos.lerp(TMP, k); cam.look.lerp(LOOK, k);
    cam.ready = true;
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    // the sky, sun and clouds stay "at infinity" round the camera; the sea stays put under it (its ripples drift)
    dome.position.copy(camera.position); stars.position.copy(camera.position);
    const base = LEVELS[V.lv].fallY;
    clouds.forEach((c) => { const u = c.userData; u.a += u.drift * dt; c.position.set(camera.position.x + Math.cos(u.a) * u.r, base + u.y, camera.position.z + Math.sin(u.a) * u.r); });
    sun.position.copy(camera.position).addScaledVector(SUN_DIR, 500); sun.lookAt(camera.position);
    cloudSea.position.x = camera.position.x; cloudSea.position.z = camera.position.z;
    seaClock += dt;
    cloudTex.offset.set(camera.position.x / 100 + seaClock * 0.006, -camera.position.z / 100 + seaClock * 0.004);
    key.position.set(me.x - SUN_DIR.x * 40 + 10, me.y + 30, me.z - SUN_DIR.z * 40); key.target.position.set(me.x, me.y, me.z);
    rim.position.set(me.x + SUN_DIR.x * 40, me.y + 10, me.z + SUN_DIR.z * 40); rim.target.position.set(me.x, me.y, me.z);
  }
  const PV = new THREE.Vector3();
  function toScreen(x, y, z) {
    PV.set(x, y, z).project(camera);
    return { x: ((PV.x + 1) / 2) * view.cw, y: ((1 - PV.y) / 2) * view.ch, behind: PV.z > 1 };
  }
  const hud = createHud(hudCanvas, game, view, toScreen);

  // ---- fireworks: rockets that rise with a spark trail and burst (watchtowers, the finish) ---------
  const rockets = [];
  const FW = [['#ff6b5a', '#ffe0d8'], ['#3fb3ff', '#ffffff'], ['#ffd23f', '#fff7c8'], ['#b48cff', '#efe4ff'], ['#4fd68a', '#ffffff']];
  function fireworks(x, y, z, n) {
    for (let k = 0; k < n; k++) rockets.push({ x: x + (rnd() - 0.5) * 3, y, z: z + (rnd() - 0.5) * 3, vx: (rnd() - 0.5) * 3, vz: (rnd() - 0.5) * 3, vy: 13 + rnd() * 5, wait: k * 0.22 + rnd() * 0.1, cols: FW[k % FW.length], trail: 0 });
  }
  function drawRockets(dt) {
    for (let k = rockets.length - 1; k >= 0; k--) {
      const r = rockets[k];
      if ((r.wait -= dt) > 0) continue;
      r.vy -= 14 * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      if ((r.trail -= dt) <= 0 && parts.length < PN - 2) { r.trail = 0.03; parts.push({ x: r.x, y: r.y, z: r.z, vx: 0, vy: -1, vz: 0, t: 0, life: 0.35, size: 0.1, col: '#ffe9b0', grav: 2, spin: 0 }); }
      if (r.vy < 2.5) { burst(r.x, r.y, r.z, 44, r.cols, 8, 0.15, 1.3, 3); rockets.splice(k, 1); if (game.boom) game.boom(); }
    }
  }

  // ---- events from the game: bursts of colour ------------------------------------------------------
  function event(ev) {
    const V = S.view, p = V && ev.i >= 0 ? V.players[ev.i] : null;
    const L = V ? LEVELS[V.lv] : null;
    if (ev.e === 'boing' && p) { burst(p.x, p.y + 0.2, p.z, 44, ['#ff6b5a', '#ffd23f', '#3fb3ff', '#ffffff'], 9, 0.16, 1.2); bouncers.forEach((b) => { if (Math.hypot(p.x - (b.b.x0 + b.b.x1) / 2, p.z - (b.b.z0 + b.b.z1) / 2) < 3) b.kick = 1; }); }
    else if (ev.e === 'knock' && p) burst(p.x, p.y + 0.8, p.z, 26, ['#ffd23f', '#ff9a4a', '#ffffff'], 7, 0.1, 0.6);
    else if (ev.e === 'crumble' && L) { const c = L.crumbles[ev.k]; if (c) burst((c.x0 + c.x1) / 2, c.y1, (c.z0 + c.z1) / 2, 30, ['#e8d2ad', '#c9a878', '#a8845a'], 4, 0.22, 1.2, 14); }
    else if (ev.e === 'checkpoint' && L) {
      const c = L.checks[ev.k - 1], tw = towers[ev.k - 1];
      if (c && tw) { burst(tw.g.position.x, tw.g.position.y + 11, tw.g.position.z, 60, ['#ff6b5a', '#3fb3ff', '#ffd23f', '#4fd68a'], 7, 0.16, 1.6); tw.pop = 1; fireworks(tw.g.position.x, tw.g.position.y + 11, tw.g.position.z, 5); }
    }
    else if (ev.e === 'jump' && p && ev.i === S.me) burst(p.x, p.y, p.z, 6, ['#ffffff', '#e8f6ff'], 2, 0.08, 0.35, 4);
    else if (ev.e === 'land' && p) burst(p.x, p.y, p.z, 5, ['#f4ead8'], 1.5, 0.09, 0.3, 4);
    else if (ev.e === 'done' && L) { const end = towers.find((q) => q.end); if (end) { burst(end.g.position.x, end.g.position.y + 3, end.g.position.z, 110, ['#ff6b5a', '#3fb3ff', '#ffd23f', '#4fd68a', '#ffffff'], 11, 0.16, 2); end.ring = 1; fireworks(end.g.position.x, end.g.position.y + 3, end.g.position.z, 9); } }
    else if (ev.e === 'zip' && p) burst(p.x, p.y + 1.9, p.z, 14, ['#ffd23f', '#ffffff'], 4, 0.07, 0.4, 2);
  }

  // ---- draw ----------------------------------------------------------------------------------------
  let windT = 0, lastDraw = -1;
  function draw(t, dt) {
    if (renderer && !lowPower) quality.tick(dt);
    const V = S.view;
    if (V && V.lv !== built) build(V.lv);
    if (V) {
      const L = LEVELS[V.lv];
      updateCamera(V, dt);
      movers.forEach(({ m, g }) => {
        const b = moverBox(m, V.t);
        g.position.set((b.x0 + b.x1) / 2, b.y1 - m.h / 2, (b.z0 + b.z1) / 2);
        // (nothing tilts or turns: what you see is exactly the box you bump into)
      });
      if (levelGroup.userData.drum) levelGroup.userData.drum.rotation.y = V.t * 0.8;
      drifters.forEach((d) => { d.r.position.y = d.y + Math.sin(t * d.sp + d.ph) * 0.6; d.r.rotation.y += dt * d.sp * 0.3; });
      crumbles.forEach((c, k) => {
        const st = V.crumble[k] || { gone: false, stood: 0 };
        c.fall = st.gone ? Math.min(1, c.fall + dt * 1.5) : Math.max(0, c.fall - dt * 3);
        // giving way: it wobbles more and more, and grit trickles off it
        const w = !st.gone ? Math.min(1, Math.max(0, st.stood - 0.15) / 2) : 0, wob = Math.sin(t * (22 + w * 30) + k);
        c.g.visible = c.fall < 0.98;
        c.g.position.set(c.home.x + wob * 0.06 * w, c.home.y - c.fall * c.fall * 9 - w * 0.06, c.home.z + Math.cos(t * 27 + k) * 0.04 * w);
        c.g.rotation.set(wob * 0.05 * w, 0, c.fall * 0.8 + Math.cos(t * 19 + k) * 0.04 * w);
        c.dust = (c.dust || 0) - dt;
        if (w > 0.25 && c.dust <= 0 && parts.length < PN - 2) { c.dust = 0.32 - w * 0.2; parts.push({ x: c.home.x + (rnd() - 0.5) * 1.2, y: c.home.y - 0.3, z: c.home.z + (rnd() - 0.5) * 1.2, vx: 0, vy: -0.5, vz: 0, t: 0, life: 0.8, size: 0.1, col: '#d9bf94', grav: 6, spin: 4 }); }
      });
      bouncers.forEach((b) => { b.kick = Math.max(0, b.kick - dt * 3); b.g.scale.y = 1 - b.kick * 0.35 + Math.sin(b.kick * 10) * b.kick * 0.15; });
      towers.forEach((tw, k) => {
        if (tw.end) {
          if (tw.ring && tw.g.userData.gong) { tw.ring = Math.max(0, tw.ring - dt * 0.4); tw.g.userData.gong.rotation.z = Math.sin(t * 30) * 0.08 * tw.ring; }
          return;
        }
        tw.flag.material.color.set(k < V.cp ? BRIGHT[k % 4] : 0xf4efe4);
        tw.pop = Math.max(0, (tw.pop || 0) - dt * 1.6); // reached: the flag springs up big
        tw.flag.scale.setScalar(1 + Math.sin(tw.pop * Math.PI) * 0.7);
        const pos = tw.flag.geometry.attributes.position; // a flapping flag
        for (let v = 0; v < pos.count; v++) { const x = pos.getX(v); pos.setZ(v, Math.sin(t * 6 + x * 3 + k) * 0.12 * (x + 0.8)); }
        pos.needsUpdate = true;
      });
      V.barrels.forEach((b, k) => {
        const m = barrelAt(k);
        m.visible = true; m.position.set(b.x, b.y, b.z);
        // rolling: its axis across the way it's going
        m.rotation.set(0, Math.atan2(b.dx || 0, b.dz || 1), 0); m.rotateZ(Math.PI / 2); m.rotateY(-b.spin);
      });
      for (let k = V.barrels.length; k < barrelPool.length; k++) barrelPool[k].visible = false;
      // gusts: white streaks blowing across the Wall
      windT += dt;
      if (windT > 0.03) {
        windT = 0;
        L.winds.forEach((w) => {
          if (!windOn(w, V.t) || parts.length > PN - 4) return;
          const s = Math.hypot(w.fx, w.fz);
          parts.push({ x: w.x0 + rnd() * (w.x1 - w.x0) - (w.fx / s) * 3, y: w.y0 + rnd() * (w.y1 - w.y0), z: w.z0 + rnd() * (w.z1 - w.z0) - (w.fz / s) * 3, vx: w.fx * 0.4, vy: 0, vz: w.fz * 0.4, t: 0, life: 0.8, size: 0.06, col: '#ffffff', grav: 0, spin: 0 });
        });
      }
      drawPlayers(V, t, dt);
      drawChain(V, dt);
      if (skyLanterns.visible) { // night: lanterns drifting up round the gang
        const me = V.players[S.me] || V.players[0];
        skyl.forEach((q, n) => {
          q.y += q.sp * dt; if (q.y > 45) q.y = -35;
          P.set(me.x + Math.cos(q.a + t * 0.01) * q.r, me.y + q.y, me.z + Math.sin(q.a + t * 0.01) * q.r);
          E.set(0, t * 0.2 + q.ph, Math.sin(t + q.ph) * 0.12); Q.setFromEuler(E); SC.setScalar(1);
          M4.compose(P, Q, SC); skyLanterns.setMatrixAt(n, M4);
        });
        skyLanterns.instanceMatrix.needsUpdate = true;
      }
    }
    drawRockets(dt);
    drawParts(dt);
    if (renderer && V) {
      // software GL (CI, some emulators): redraw the 3D at most ~12 times a second
      if (!lowPower || t - lastDraw > 0.08) { renderer.render(scene, camera); lastDraw = t; }
    }
    hud.draw(t, dt);
  }

  // (tests: what the last frame drew and what's alive on the GPU — the counts must not keep growing)
  const perfInfo = () => (renderer ? { ratio: renderer.getPixelRatio(), quality: quality.step, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, prog: renderer.info.programs.length } : null);
  // (tests: feed it frame times as a slow phone would)
  const qualityTest = (dts) => { dts.forEach((d) => quality.tick(d)); return quality.cap; };
  return {
    perfInfo, qualityTest,
    draw, event,
    get gl() { return !!renderer; },
    screenPoint: (x, y, z) => toScreen(x, y, z),
    programs: () => (renderer ? renderer.info.programs.length : 0),
  };
}
