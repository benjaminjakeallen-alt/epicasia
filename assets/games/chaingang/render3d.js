// Draws Chain Gang Dynasty with three.js, third person like Chained
// Together, in a Sunset Overdrive mood: a neon sunset dome (purple →
// magenta → orange) with a striped retro sun, rings of mountain ridges with
// the Wall snaking over them, a sea of sunset cloud far below, toon-shaded
// stone with thick ink outlines, graffiti tags, a chunky gold chain between
// the travellers, and confetti/sparks on everything. The camera sits behind
// your traveller; S.cam.yaw (turned by dragging, game.js) is where it looks.
// hud.js draws the text on top.
import * as THREE from 'three';
import { MAT, makeHero } from '../rampage/models.js';
import { moverBox, windOn, CHAIN } from './sim.js';
import { createHud } from './hud.js';

const HERO_SCALE = 0.084;
const INK = 0x1a0b2e; // outline colour

// Per level: sky stops (top → horizon), sun colours, ridge colours, light.
const SKIES = [
  { sky: ['#2a0a5c', '#5b1a8c', '#a8238f', '#ff2d95', '#ff8a3d', '#ffd35a'], sun: ['#fff36b', '#ff4f8b'], ridges: [0x6b2f8f, 0x8a3a8f], mist: 0xff9ac1,
    hemi: [0xffd7f0, 0x5a2a7a, 1.5], key: [0xffc28a, 2.6], rim: [0xff2d95, 1.3] },
  { sky: ['#0d0626', '#2d0f5e', '#6b1f9c', '#c42a9a', '#ff3d9a', '#ffb05a'], sun: ['#ffe66b', '#ff3d7f'], ridges: [0x3a1868, 0x55248a], mist: 0xd76bd6,
    hemi: [0xe3c8ff, 0x3a1a5a, 1.45], key: [0xffb27a, 2.4], rim: [0x18e0ff, 1.4] },
  { sky: ['#14103a', '#2c2470', '#5a3a9e', '#a8479c', '#ff5f7a', '#ffc070'], sun: ['#fff1a0', '#ff6f6f'], ridges: [0x2f2868, 0x4a3a8a], mist: 0xb59cff,
    hemi: [0xdcd4ff, 0x30285a, 1.45], key: [0xffd0a0, 2.3], rim: [0x7b2cff, 1.5] },
];
const NEON = [0xff2d95, 0x18e0ff, 0xffe11a, 0x7b2cff, 0x3dff8a];

export function createRenderer({ glCanvas, hudCanvas, stage, game }) {
  const { S, LEVELS } = game;
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
      if ((window.CHAINGANG_INIT || {}).quality === 'high') lowPower = false;
    } catch { /* unknown GPU */ }
    if (lowPower) renderer.shadowMap.enabled = false;
    renderer.debug.checkShaderErrors = !!(window.CHAINGANG_INIT || {}).shaderChecks;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 900);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
  const key = new THREE.DirectionalLight(0xffffff, 2.5); // the low sun
  key.castShadow = true;
  key.shadow.mapSize.set(lowPower ? 512 : 2048, lowPower ? 512 : 2048);
  Object.assign(key.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03;
  const rim = new THREE.DirectionalLight(0xff2d95, 1.3); // a neon rim from behind
  scene.add(hemi, key, key.target, rim, rim.target);
  scene.fog = new THREE.Fog(0xff9ac1, 70, 260);
  const SUN_DIR = new THREE.Vector3(-0.35, 0.12, -1).normalize(); // the sunset, low over the far end of the Wall

  // ---- materials: toon shading in three steps, plus outlines --------------------------------
  const ramp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const toon = (opts) => new THREE.MeshToonMaterial(Object.assign({ gradientMap: ramp }, opts));
  // Outlines: the back faces pushed out along their normals, in ink.
  function outlineMaterial(w) {
    const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3(position) + normal * ${w.toFixed(3)};`); };
    return m;
  }
  const outlineMat = outlineMaterial(0.045), heroOutline = outlineMaterial(0.32);
  function outlined(geo, mat, out = outlineMat) {
    const g = new THREE.Group(), m = new THREE.Mesh(geo, mat), o = new THREE.Mesh(geo, out);
    m.castShadow = true; m.receiveShadow = true;
    g.add(o, m);
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
  // Wall bricks: warm sandstone, chunky, a few mossy and sun-bleached ones.
  const brickTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#5b3b4a'; c.fillRect(0, 0, w, h);
    const rows = 8, bh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 32 : 0;
      for (let x = -64; x < w; x += 64) {
        const v = rnd(), base = v < 0.12 ? [196, 160, 150] : v < 0.2 ? [150, 170, 140] : [214 + rnd() * 20, 168 + rnd() * 18, 140 + rnd() * 16];
        c.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
        c.fillRect(x + off + 3, r * bh + 3, 58, bh - 6);
        c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x + off + 3, r * bh + 3, 58, 4);
        c.fillStyle = 'rgba(60,20,50,0.18)'; c.fillRect(x + off + 3, r * bh + bh - 9, 58, 6);
      }
    }
  });
  const paveTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#6a4656'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) {
      const v = 200 + rnd() * 30;
      c.fillStyle = `rgb(${v | 0},${(v * 0.8) | 0},${(v * 0.72) | 0})`;
      c.fillRect(x + 3, y + 3, 58, 58);
    }
  });
  const crackTex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#c9a08a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#3a1a2e'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(10, 20); c.lineTo(50, 60); c.lineTo(40, 100); c.moveTo(50, 60); c.lineTo(100, 50); c.lineTo(118, 90); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(0, 0, w, 10);
  });
  const STONE = toon({ map: brickTex }), PAVE = toon({ map: paveTex }), DARK = toon({ color: 0x4a2a44 });
  const CRACK = toon({ map: crackTex });
  const WOOD = toon({ color: 0xb4683c }), RED = toon({ color: 0xe0233c }), GOLD = toon({ color: 0xffc23a }), ROPE = toon({ color: 0xd9b47a });
  const NEONM = NEON.map((c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));

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

  // ---- the sky: a gradient dome, a striped sun, ridges all round, a cloud sea -----------------
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 512;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -20;
  scene.add(dome);
  function paintSky(stops) {
    const c = skyCanvas.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 512);
    // top of the sphere to the horizon (the middle), then a warm haze below
    stops.forEach((s, i) => g.addColorStop((i / (stops.length - 1)) * 0.5, s));
    g.addColorStop(1, stops[stops.length - 1]);
    c.fillStyle = g; c.fillRect(0, 0, 4, 512);
    skyTex.needsUpdate = true;
  }
  function sunTexture(cols) {
    return canvasTex(512, 512, (c) => {
      const g = c.createLinearGradient(0, 40, 0, 470);
      g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
      c.save(); c.beginPath(); c.arc(256, 256, 200, 0, Math.PI * 2); c.clip();
      c.fillStyle = g; c.fillRect(0, 0, 512, 512);
      c.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 7; k++) { const y = 286 + k * 25, hh = 4 + k * 2.4; c.fillRect(0, y, 512, hh); }
      c.restore();
      const glow = c.createRadialGradient(256, 256, 190, 256, 256, 256);
      glow.addColorStop(0, 'rgba(255,220,160,0.55)'); glow.addColorStop(1, 'rgba(255,120,180,0)');
      c.globalCompositeOperation = 'destination-over'; c.fillStyle = glow; c.fillRect(0, 0, 512, 512);
    }, 1, 1);
  }
  const sunMat = new THREE.MeshBasicMaterial({ transparent: true, fog: false, depthWrite: false, toneMapped: false });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), sunMat);
  sun.renderOrder = -19;
  scene.add(sun);
  function ridgeTexture(col, k) {
    return canvasTex(2048, 256, (c, w, h) => {
      c.fillStyle = '#' + new THREE.Color(col).getHexString();
      c.beginPath(); c.moveTo(0, h);
      const pts = [];
      for (let x = 0; x <= w; x += 16) {
        const y = h * 0.4 + Math.sin(x * 0.006 + k * 2) * h * 0.16 + Math.sin(x * 0.021 + k * 5) * h * 0.08 + (rnd() - 0.5) * 6;
        pts.push([x, y]); c.lineTo(x, y);
      }
      c.lineTo(w, h); c.closePath(); c.fill();
      // the Wall along the crests, towers here and there
      c.strokeStyle = 'rgba(255,190,150,0.6)'; c.lineWidth = 4; c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y + 3) : c.moveTo(x, y + 3))); c.stroke();
      c.fillStyle = 'rgba(255,190,150,0.65)';
      for (let i = 5; i < pts.length; i += 11) c.fillRect(pts[i][0] - 4, pts[i][1] - 10, 8, 12);
    }, 1, 1);
  }
  const ridges = [];
  function buildBackdrop(lv) {
    ridges.forEach((r) => { scene.remove(r); r.material.map.dispose(); r.material.dispose(); });
    ridges.length = 0;
    const look = SKIES[lv % SKIES.length];
    look.ridges.forEach((col, k) => {
      const r = 420 - k * 110;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 120, 48, 1, true),
        new THREE.MeshBasicMaterial({ map: ridgeTexture(col, k + lv * 3), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
      m.renderOrder = -18 + k;
      scene.add(m); ridges.push(m);
    });
    paintSky(look.sky);
    if (sunMat.map) sunMat.map.dispose();
    sunMat.map = sunTexture(look.sun); sunMat.needsUpdate = true;
    hemi.color.set(look.hemi[0]); hemi.groundColor.set(look.hemi[1]); hemi.intensity = look.hemi[2];
    key.color.set(look.key[0]); key.intensity = look.key[1];
    rim.color.set(look.rim[0]); rim.intensity = look.rim[1];
    scene.fog.color.set(look.mist);
    cloudMat.color.set(look.mist);
  }
  // a sea of sunset cloud far below: falling means falling into it
  const cloudTex = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 60;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, 10, 10);
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.92, depthWrite: false, color: 0xff9ac1 });
  const cloudSea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), cloudMat);
  cloudSea.rotation.x = -Math.PI / 2;
  scene.add(cloudSea);

  // ---- the level ---------------------------------------------------------------------------
  const levelGroup = new THREE.Group();
  scene.add(levelGroup);
  let built = -1;
  const movers = [], crumbles = [], towers = [], bouncers = [];
  function clearLevel() {
    levelGroup.traverse((o) => { if (o.isMesh && o.geometry && !o.userData.shared) o.geometry.dispose(); });
    levelGroup.clear();
    [movers, crumbles, towers, bouncers].forEach((a) => { a.length = 0; });
  }
  const merlonGeo = boxGeo(0.55, 0.55, 0.45, 1.1);
  merlonGeo.userData = {};
  function wallBox(s) {
    const w = s.x1 - s.x0, h = s.y1 - s.y0, d = s.z1 - s.z0;
    const g = boxGeo(w, h, d);
    const mats = [STONE, STONE, PAVE, DARK, STONE, STONE];
    const grp = new THREE.Group();
    const m = new THREE.Mesh(g, mats), o = new THREE.Mesh(g, outlineMat);
    m.castShadow = m.receiveShadow = true;
    grp.add(o, m);
    grp.position.set((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2);
    levelGroup.add(grp);
    // battlements along both long edges (low, so a traveller's legs don't vanish in them)
    const alongX = w > d, len = alongX ? w : d;
    for (let k = 0.6; k < len - 0.3; k += 1.6) for (const side of [0, 1]) {
      const b = outlined(merlonGeo, STONE);
      b.position.set(alongX ? s.x0 + k : side ? s.x1 - 0.22 : s.x0 + 0.22, s.y1 + 0.27, alongX ? (side ? s.z1 - 0.22 : s.z0 + 0.22) : s.z0 + k);
      levelGroup.add(b);
    }
  }
  function tagTexture(text, col) {
    return canvasTex(512, 160, (c, w, h) => {
      let px = 92;
      c.font = `900 ${px}px "Arial Black", "Avenir Next", system-ui, sans-serif`;
      while (c.measureText(text).width > w - 60 && px > 30) { px -= 4; c.font = `900 ${px}px "Arial Black", "Avenir Next", system-ui, sans-serif`; }
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.save(); c.translate(w / 2, h / 2); c.rotate(-0.06);
      c.lineJoin = 'round'; c.lineWidth = 22; c.strokeStyle = '#1a0b2e'; c.strokeText(text, 0, 0);
      c.lineWidth = 10; c.strokeStyle = '#ffffff'; c.strokeText(text, 0, 0);
      c.fillStyle = col; c.fillText(text, 0, 0);
      for (let i = 0; i < 6; i++) { const x = -200 + rnd() * 400; c.fillRect(x, 26, 6, 18 + rnd() * 30); } // paint drips
      c.restore();
    }, 1, 1);
  }
  function tower(c) {
    // a square watchtower beside the walkway, a flag that lights up when reached
    const [dx, dz] = c.dir, px = -dz, pz = dx; // to the right of the way
    const g = new THREE.Group();
    const t = outlined(boxGeo(3.6, 22, 3.6, 2), STONE); t.position.y = -11 + 6; g.add(t);
    const roof = outlined(new THREE.ConeGeometry(3.2, 2, 4), toon({ color: 0x3a2a6a })); roof.rotation.y = Math.PI / 4; roof.position.y = 6.9 + 1; g.add(roof);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), toon({ color: 0x2b2b3a })); pole.position.set(0, 9.6, 0); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1, 6, 1), new THREE.MeshBasicMaterial({ color: 0x8a8296, side: THREE.DoubleSide, toneMapped: false }));
    flag.position.set(0.82, 10.4, 0); g.add(flag);
    g.position.set(c.x + px * 6.4, c.y - 6, c.z + pz * 6.4);
    levelGroup.add(g);
    return { g, flag };
  }
  function build(lv) {
    clearLevel();
    built = lv;
    const L = LEVELS[lv];
    seed = 11 + lv * 97;
    buildBackdrop(lv);
    cloudSea.position.y = L.fallY - 5;
    L.solids.forEach(wallBox);
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
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 5), ROPE); levelGroup.add(rope);
        g.userData.rope = rope;
        // the frame it hangs from: two posts and a beam over the gap
        const p = m.path, a = new THREE.Vector3(p.px - 0.4, p.py, p.pz - 4), b = new THREE.Vector3(p.px - 0.4, p.py, p.pz + 4);
        levelGroup.add(rod(a, b, 0.12, WOOD));
      } else if (m.kind === 'cart') {
        const box = outlined(boxGeo(m.w, 0.9, m.d, 1), WOOD); box.position.y = -0.25; g.add(box);
        const trim = outlined(boxGeo(m.w + 0.1, 0.12, m.d + 0.1, 1), GOLD); trim.position.y = 0.2; g.add(trim);
        const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), ROPE); hook.position.y = 1.5; g.add(hook);
        const wheel = outlined(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), DARK); wheel.rotation.z = Math.PI / 2; wheel.position.y = 2.8; g.add(wheel);
        const p = m.path, z0 = Math.max(p.az, p.bz) + 3, z1 = Math.min(p.az, p.bz) - 3;
        levelGroup.add(rod(new THREE.Vector3(p.ax, p.ay + 2.8, z0), new THREE.Vector3(p.ax, p.ay + 2.8, z1), 0.04, ROPE));
      } else if (m.kind === 'wheel') {
        g.add(outlined(boxGeo(m.w, m.h, m.d, 1), WOOD));
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshBasicMaterial({ color: NEON[movers.length % NEON.length], side: THREE.DoubleSide, toneMapped: false }));
        flag.position.set(0, 0.7, 0); g.add(flag);
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 5), WOOD); levelGroup.add(spoke);
        g.userData.spoke = spoke;
      } else { // the parade dragon: red and gold, carried on poles
        const body = outlined(boxGeo(m.w, m.h + 0.3, m.d, 1), RED); body.position.y = -0.15; g.add(body);
        for (let k = 0; k < 3; k++) { const sp = outlined(new THREE.ConeGeometry(0.22, 0.6, 4), GOLD); sp.position.set(0, 0.25, -m.d / 3 + (k * m.d) / 3); g.add(sp); }
        [-1, 1].forEach((sd) => { const fr = outlined(boxGeo(0.12, 0.45, m.d * 0.9, 1), GOLD); fr.position.set(sd * (m.w / 2 + 0.05), -0.1, 0); g.add(fr); });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 14, 5), WOOD); pole.position.y = -7.5; g.add(pole);
        if (m.kind === 'dragonHead') { // at the far end, looking on along the Wall
          const head = outlined(boxGeo(1.8, 1.4, 1.7, 1), RED); head.position.set(0, 0.4, -m.d / 2 - 0.7); g.add(head);
          const jaw = outlined(boxGeo(1.4, 0.35, 1.4, 1), GOLD); jaw.position.set(0, -0.35, -m.d / 2 - 0.9); g.add(jaw);
          [-0.45, 0.45].forEach((x) => {
            const horn = outlined(new THREE.ConeGeometry(0.16, 1, 5), GOLD); horn.position.set(x, 1.4, -m.d / 2 - 0.3); horn.rotation.x = 0.5; g.add(horn);
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), NEONM[2]); eye.position.set(x * 1.5, 0.7, -m.d / 2 - 1.2); g.add(eye);
          });
        }
        if (m.kind === 'dragonTail') { const tuft = outlined(new THREE.ConeGeometry(0.6, 1.6, 6), toon({ color: 0xff8a3d })); tuft.position.set(0, 0.2, m.d / 2 + 0.7); tuft.rotation.x = Math.PI / 2; g.add(tuft); }
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
      const pole = outlined(new THREE.CylinderGeometry(0.5, 0.6, 20, 10), toon({ color: 0x5a2a44 })); pole.position.set(p.cx, p.cy - 9, p.cz); levelGroup.add(pole);
      const drum = outlined(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 14), GOLD); drum.position.set(p.cx, p.cy + 1.4, p.cz); levelGroup.add(drum);
      const band = outlined(new THREE.CylinderGeometry(1.15, 1.15, 0.45, 14), RED); band.position.set(p.cx, p.cy + 1.4, p.cz); levelGroup.add(band);
      levelGroup.userData.drum = drum;
    });
    L.bouncers.forEach((b) => {
      const g = new THREE.Group(), w = b.x1 - b.x0, d = b.z1 - b.z0;
      const base = outlined(boxGeo(w, 0.5, d, 1), toon({ color: 0x2b1a4a })); base.position.y = -0.25; g.add(base);
      const top = outlined(boxGeo(w - 0.2, 0.12, d - 0.2, 1), NEONM[0]); top.position.y = 0.04; g.add(top);
      for (let k = 0; k < 6; k++) { // firework rockets ready to go, along both sides
        const r = outlined(new THREE.CylinderGeometry(0.13, 0.13, 1.1, 6), k % 2 ? RED : GOLD);
        r.position.set((k < 3 ? -1 : 1) * (w / 2 - 0.15), 0.55, -d / 2 + 0.4 + (k % 3) * ((d - 0.8) / 2));
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 6), NEONM[k % 4]); tip.position.y = 0.7; r.add(tip);
        g.add(r);
      }
      g.position.set((b.x0 + b.x1) / 2, b.y1, (b.z0 + b.z1) / 2);
      levelGroup.add(g); bouncers.push({ b, g, kick: 0 });
    });
    L.zips.forEach((z) => {
      const a = new THREE.Vector3(...z.a), b = new THREE.Vector3(...z.b);
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      levelGroup.add(rod(a.clone().addScaledVector(dir, -1.2), b.clone().addScaledVector(dir, 1.2), 0.05, toon({ color: 0x2b2b3a })));
      [a.clone().addScaledVector(dir, -1.2), b.clone().addScaledVector(dir, 1.2)].forEach((p) => {
        const post = outlined(boxGeo(0.35, 6, 0.35, 1), WOOD); post.position.set(p.x + 1.9, p.y - 3 + 0.3, p.z); levelGroup.add(post);
        levelGroup.add(rod(new THREE.Vector3(p.x + 1.9, p.y + 0.3, p.z), p, 0.04, toon({ color: 0x2b2b3a })));
      });
    });
    // watchtowers by the checkpoints, a gate or gong at the end
    L.checks.forEach((c) => towers.push(tower(c)));
    {
      const f = L.finish, [dx, dz] = f.dir, g = new THREE.Group();
      [-1.9, 1.9].forEach((x) => { const p = outlined(boxGeo(0.45, 4.8, 0.45, 1), RED); p.position.set(x, 2.4, 0); g.add(p); });
      const beam = outlined(boxGeo(4.9, 0.45, 0.6, 1), toon({ color: 0x2b1a4a })); beam.position.y = 4.9; g.add(beam);
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
    L.decor.forEach((d) => {
      if (d.type === 'barrels') {
        for (let k = 0; k < 3; k++) { const b = barrelModel(); b.position.set(d.x + (k - 1) * 0.95, d.y + 0.45 + (k === 1 ? 0.75 : 0), d.z); b.rotation.x = Math.PI / 2; levelGroup.add(b); }
      } else if (d.type === 'tag') {
        const col = ['#ff2d95', '#18e0ff', '#ffe11a', '#b57bff'][Math.floor(rnd() * 4)];
        const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), new THREE.MeshBasicMaterial({ map: tagTexture(d.text, col), transparent: true, toneMapped: false }));
        m.position.set(d.x + d.nx * 0.02, d.y, d.z + d.nz * 0.02);
        m.rotation.y = Math.atan2(d.nx, d.nz);
        levelGroup.add(m);
      }
    });
  }
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.95, 12);
  const bandGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.12, 12);
  function barrelModel() {
    const g = outlined(barrelGeo, RED);
    [-0.3, 0.3].forEach((y) => { const b = new THREE.Mesh(bandGeo, GOLD); b.position.y = y; g.add(b); });
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 4), toon({ color: 0x2b2b3a })); fuse.position.y = 0.62; g.add(fuse);
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
    h.traverse((o) => { if (o.isMesh && o.material === MAT) { o.castShadow = true; o.add(new THREE.Mesh(o.geometry, heroOutline)); } }); // an ink outline round every part
    h.userData.key = keyName;
    h.userData.pose = {};
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
      a.yaw += d * (1 - Math.exp(-dt * 14));
      m.rotation.y = a.yaw;
      const speed = Math.hypot(p.vx, p.vz);
      let target;
      if (p.zip) target = { armL: -3.0, armR: -3.0, legL: -0.4, legR: 0.3, lean: 0.1 };
      else if (p.grab) target = { bob: -1.4, lean: 0.55, legL: -1.1, legR: 0.6, armL: -1.2, armR: -1.2, armLz: -0.3, armRz: 0.3, nod: -0.2 }; // dug in, hands on the chain
      else if (p.knock) target = { lean: -0.6, armL: -2.6, armR: -2.2, armLz: -0.8, armRz: 0.8, legL: -0.8, legR: 0.6 };
      else if (!p.ground && p.taut && p.vy < 1) target = { armL: -3.0, armR: -2.8, legL: Math.sin(t * 9 + i) * 0.6, legR: -Math.sin(t * 9 + i) * 0.6, nod: 0.3 }; // dangling
      else if (!p.ground) target = { legL: p.vy > 0 ? -1.2 : -0.5, legR: p.vy > 0 ? 0.5 : 0.2, armL: -2.5, armR: -2.3, armLz: -0.4, armRz: 0.4, lean: 0.12 };
      else if (speed > 0.6) {
        a.ph += dt * speed * 2.2;
        target = { bob: Math.abs(Math.cos(a.ph)) * 0.7, lean: 0.18, legL: Math.sin(a.ph) * 0.95, legR: -Math.sin(a.ph) * 0.95, armL: -Math.sin(a.ph) * 0.8, armR: Math.sin(a.ph) * 0.8 };
      } else target = { bob: Math.sin(t * 2 + i) * 0.15, armL: Math.sin(t * 2 + i) * 0.05, armR: -Math.sin(t * 2 + i) * 0.05 };
      setPose(m, target, dt);
    });
    for (let i = V.players.length; i < heroModels.length; i++) if (heroModels[i]) heroModels[i].visible = false;
  }

  // ---- the chain: chunky gold links, sagging when slack -----------------------------------------
  const LINK = 0.2;
  const linkGeo = new THREE.TorusGeometry(0.12, 0.05, 6, 12);
  const linkMat = toon({ color: 0xffc23a, emissive: 0x5a3a00 });
  const links = new THREE.InstancedMesh(linkGeo, linkMat, (Math.ceil(CHAIN / LINK) + 4) * 3);
  links.castShadow = true; links.frustumCulled = false;
  scene.add(links);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), SC = new THREE.Vector3(1, 1, 1), C = new THREE.Color();
  const A = new THREE.Vector3(), B = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function drawChain(V) {
    let n = 0;
    for (let i = 0; i + 1 < V.players.length; i++) {
      const a = V.players[i], b = V.players[i + 1];
      A.set(a.x, a.y + 0.9, a.z); B.set(b.x, b.y + 0.9, b.z);
      const d = A.distanceTo(B), sag = d < CHAIN ? Math.sqrt(CHAIN * CHAIN - d * d) * 0.42 : 0;
      const floorY = a.ground && b.ground ? Math.min(a.y, b.y) + 0.07 : -Infinity;
      const count = Math.max(2, Math.round(Math.max(d, 0.4) / LINK));
      const at = (u, out) => { out.lerpVectors(A, B, u); out.y = Math.max(floorY, out.y - sag * 4 * u * (1 - u)); return out; };
      for (let k = 0; k <= count && n < links.count; k++) {
        const u = k / count;
        at(u, X); at(Math.min(1, u + 0.02), Y);
        Y.sub(X).normalize();
        Q.setFromUnitVectors(UP, Y); // the link's ring along the chain…
        E.set(0, k % 2 ? Math.PI / 2 : 0, 0); // …every other one turned a quarter
        Q.multiply(new THREE.Quaternion().setFromEuler(E));
        Q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
        M4.compose(X, Q, SC); links.setMatrixAt(n++, M4);
      }
    }
    for (let k = n; k < links.count; k++) { M4.makeScale(0, 0, 0); links.setMatrixAt(k, M4); }
    links.instanceMatrix.needsUpdate = true;
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
    if (renderer) { renderer.setPixelRatio(lowPower ? 0.75 : Math.min(dpr, 2)); renderer.setSize(cw, ch, false); }
    camera.aspect = cw / ch;
    camera.fov = cw / ch < 0.8 ? 68 : 56; // a phone held upright needs a taller view to see sideways
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', layout);
  layout();
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false };
  const TMP = new THREE.Vector3(), LOOK = new THREE.Vector3();
  function updateCamera(V, dt) {
    const me = V.players[S.me] || V.players[0];
    if (!me) return;
    // further back when the gang is spread out
    const spread = Math.max(...V.players.map((p) => Math.hypot(p.x - me.x, p.z - me.z)));
    const dist = 6.8 + Math.min(4, spread * 0.25), pitch = S.cam.pitch;
    const fx = Math.sin(S.cam.yaw), fz = Math.cos(S.cam.yaw);
    LOOK.set(me.x + fx * 1.5, me.y + 1.5, me.z + fz * 1.5);
    TMP.set(me.x - fx * dist * Math.cos(pitch), me.y + 1.5 + dist * Math.sin(pitch), me.z - fz * dist * Math.cos(pitch));
    const k = cam.ready ? 1 - Math.exp(-dt * 8) : 1;
    cam.pos.lerp(TMP, k); cam.look.lerp(LOOK, k);
    cam.ready = true;
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    // the sky, sun, ridges and cloud sea stay "at infinity" round the camera
    dome.position.copy(camera.position);
    ridges.forEach((r) => { r.position.set(camera.position.x, LEVELS[V.lv].fallY + 26, camera.position.z); });
    sun.position.copy(camera.position).addScaledVector(SUN_DIR, 500); sun.lookAt(camera.position);
    cloudSea.position.x = camera.position.x; cloudSea.position.z = camera.position.z;
    cloudTex.offset.set(camera.position.x / 120, -camera.position.z / 120);
    key.position.set(me.x - SUN_DIR.x * 40 + 10, me.y + 30, me.z - SUN_DIR.z * 40); key.target.position.set(me.x, me.y, me.z);
    rim.position.set(me.x + SUN_DIR.x * 40, me.y + 10, me.z + SUN_DIR.z * 40); rim.target.position.set(me.x, me.y, me.z);
  }
  const PV = new THREE.Vector3();
  function toScreen(x, y, z) {
    PV.set(x, y, z).project(camera);
    return { x: ((PV.x + 1) / 2) * view.cw, y: ((1 - PV.y) / 2) * view.ch, behind: PV.z > 1 };
  }
  const hud = createHud(hudCanvas, game, view, toScreen);

  // ---- events from the game: bursts of colour ------------------------------------------------------
  function event(ev) {
    const V = S.view, p = V && ev.i >= 0 ? V.players[ev.i] : null;
    const L = V ? LEVELS[V.lv] : null;
    if (ev.e === 'boing' && p) { burst(p.x, p.y + 0.2, p.z, 44, ['#ff2d95', '#ffe11a', '#18e0ff', '#ffffff'], 9, 0.16, 1.2); bouncers.forEach((b) => { if (Math.hypot(p.x - (b.b.x0 + b.b.x1) / 2, p.z - (b.b.z0 + b.b.z1) / 2) < 3) b.kick = 1; }); }
    else if (ev.e === 'knock' && p) burst(p.x, p.y + 0.8, p.z, 26, ['#ffe11a', '#ff8a3d', '#ffffff'], 7, 0.1, 0.6);
    else if (ev.e === 'crumble' && L) { const c = L.crumbles[ev.k]; if (c) burst((c.x0 + c.x1) / 2, c.y1, (c.z0 + c.z1) / 2, 30, ['#c9a08a', '#8a5a5a', '#5b3b4a'], 4, 0.22, 1.2, 14); }
    else if (ev.e === 'checkpoint' && L) { const c = L.checks[ev.k - 1], tw = towers[ev.k - 1]; if (c && tw) burst(tw.g.position.x, tw.g.position.y + 11, tw.g.position.z, 60, ['#ff2d95', '#18e0ff', '#ffe11a', '#b57bff'], 7, 0.16, 1.6); }
    else if (ev.e === 'jump' && p && ev.i === S.me) burst(p.x, p.y, p.z, 6, ['#ffffff', '#ffd7f0'], 2, 0.08, 0.35, 4);
    else if (ev.e === 'land' && p) burst(p.x, p.y, p.z, 5, ['#e8c8b8'], 1.5, 0.09, 0.3, 4);
    else if (ev.e === 'done' && L) { const end = towers.find((q) => q.end); if (end) { burst(end.g.position.x, end.g.position.y + 3, end.g.position.z, 110, ['#ff2d95', '#18e0ff', '#ffe11a', '#b57bff', '#ffffff'], 11, 0.16, 2); end.ring = 1; } }
    else if (ev.e === 'zip' && p) burst(p.x, p.y + 1.9, p.z, 14, ['#ffe11a', '#ffffff'], 4, 0.07, 0.4, 2);
  }

  // ---- draw ----------------------------------------------------------------------------------------
  let windT = 0, lastDraw = -1;
  function draw(t, dt) {
    const V = S.view;
    if (V && V.lv !== built) build(V.lv);
    if (V) {
      const L = LEVELS[V.lv];
      updateCamera(V, dt);
      movers.forEach(({ m, g }) => {
        const b = moverBox(m, V.t);
        g.position.set((b.x0 + b.x1) / 2, b.y1 - m.h / 2, (b.z0 + b.z1) / 2);
        if (m.kind === 'lantern') {
          const r = g.userData.rope, p = m.path, top = new THREE.Vector3(p.px, p.py, p.pz), hang = new THREE.Vector3(g.position.x, g.position.y + m.h / 2, g.position.z);
          const v = new THREE.Vector3().subVectors(hang, top), len = v.length();
          r.scale.y = len; r.position.copy(top).addScaledVector(v, 0.5);
          r.quaternion.setFromUnitVectors(UP, v.normalize());
          g.rotation.x = (g.position.z - p.pz) * 0.03;
        } else if (m.kind === 'wheel') {
          const s = g.userData.spoke, p = m.path, hub = new THREE.Vector3(p.cx, p.cy - 0.1, p.cz), v = new THREE.Vector3().subVectors(g.position, hub), len = v.length();
          s.scale.y = len; s.position.copy(hub).addScaledVector(v, 0.5); s.quaternion.setFromUnitVectors(UP, v.normalize());
          g.rotation.y = -Math.atan2(g.position.z - p.cz, g.position.x - p.cx);
        } else if (m.kind !== 'cart') g.rotation.x = -b.vy * 0.06;
      });
      if (levelGroup.userData.drum) levelGroup.userData.drum.rotation.y = V.t * 0.8;
      crumbles.forEach((c, k) => {
        const st = V.crumble[k] || { gone: false, stood: 0 };
        c.fall = st.gone ? Math.min(1, c.fall + dt * 1.5) : Math.max(0, c.fall - dt * 3);
        const shake = !st.gone && st.stood > 0.6 ? Math.sin(t * 60) * 0.05 * Math.min(1, st.stood) : 0;
        c.g.visible = c.fall < 0.98;
        c.g.position.set(c.home.x + shake, c.home.y - c.fall * c.fall * 9, c.home.z);
        c.g.rotation.z = c.fall * 0.8;
      });
      bouncers.forEach((b) => { b.kick = Math.max(0, b.kick - dt * 3); b.g.scale.y = 1 - b.kick * 0.35 + Math.sin(b.kick * 10) * b.kick * 0.15; });
      towers.forEach((tw, k) => {
        if (tw.end) {
          if (tw.ring && tw.g.userData.gong) { tw.ring = Math.max(0, tw.ring - dt * 0.4); tw.g.userData.gong.rotation.z = Math.sin(t * 30) * 0.08 * tw.ring; }
          return;
        }
        tw.flag.material.color.set(k < V.cp ? NEON[k % 4] : 0x8a8296);
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
      drawChain(V);
    }
    drawParts(dt);
    if (renderer && V) {
      // software GL (CI, some emulators): redraw the 3D at most ~12 times a second
      if (!lowPower || t - lastDraw > 0.08) { renderer.render(scene, camera); lastDraw = t; }
    }
    hud.draw(t, dt);
  }

  return {
    draw, event,
    get gl() { return !!renderer; },
    screenPoint: (x, y, z) => toScreen(x, y, z),
    programs: () => (renderer ? renderer.info.programs.length : 0),
  };
}
