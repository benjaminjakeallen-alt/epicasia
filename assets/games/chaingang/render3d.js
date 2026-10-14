// Draws Chain Gang Dynasty with three.js in a Sunset Overdrive mood: a
// neon sunset (purple → magenta → orange) with a striped retro sun, mountain
// ridges with the wall snaking over them, toon-shaded stone with thick dark
// outlines, graffiti tags, a chunky gold chain between the travellers, and
// confetti/sparks on everything. The camera looks at the wall side-on and
// follows you and the gang. hud.js draws the text on top.
import * as THREE from 'three';
import { MAT, makeHero } from '../rampage/models.js';
import { moverBox, spinnerBoxes, windOn, CHAIN } from './sim.js';
import { createHud } from './hud.js';

const HERO_SCALE = 0.084;
const Z_FRONT = 1.1, Z_BACK = -1.7; // the wall's walkway runs from the front face to the back battlements
const INK = 0x1a0b2e; // outline colour

// Per level: sky stops (top → horizon), sun colours, ridge colours, light.
const SKIES = [
  { sky: ['#2a0a5c', '#7a1a8c', '#ff2d95', '#ff8a3d', '#ffd35a'], sun: ['#fff36b', '#ff4f8b'], ridges: [0x5b2a86, 0x7b2f8f, 0xa23a8a], mist: 0xff9ac1,
    hemi: [0xffd7f0, 0x5a2a7a, 1.5], key: [0xffc28a, 2.6], rim: [0xff2d95, 1.4] },
  { sky: ['#0d0626', '#2d0f5e', '#6b1f9c', '#ff3d9a', '#ffb05a'], sun: ['#ffe66b', '#ff3d7f'], ridges: [0x2c1458, 0x45207a, 0x6a2b8e], mist: 0xd76bd6,
    hemi: [0xe3c8ff, 0x3a1a5a, 1.45], key: [0xffb27a, 2.4], rim: [0x18e0ff, 1.5] },
  { sky: ['#14103a', '#3a2c8a', '#7b3fb8', '#ff5f7a', '#ffc070'], sun: ['#fff1a0', '#ff6f6f'], ridges: [0x262058, 0x3b2f7a, 0x55408f], mist: 0xb59cff,
    hemi: [0xdcd4ff, 0x30285a, 1.45], key: [0xffd0a0, 2.3], rim: [0x7b2cff, 1.6] },
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
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
  const key = new THREE.DirectionalLight(0xffffff, 2.5); // the low sun, front-left
  key.castShadow = true;
  key.shadow.mapSize.set(lowPower ? 512 : 2048, lowPower ? 512 : 2048);
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 22, bottom: -22, near: 1, far: 120 });
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03;
  const rim = new THREE.DirectionalLight(0xff2d95, 1.4); // a neon rim from behind
  scene.add(hemi, key, key.target, rim, rim.target);
  scene.fog = new THREE.Fog(0xff9ac1, 60, 190);

  // ---- materials: toon shading in three steps, plus outlines --------------------------------
  const ramp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const toon = (opts) => new THREE.MeshToonMaterial(Object.assign({ gradientMap: ramp }, opts));
  // Outlines: the back faces pushed out along their normals, in ink.
  const outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  outlineMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + normal * 0.045;');
  };
  const heroOutline = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  heroOutline.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + normal * 0.32;');
  };
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

  /** A box's UVs scaled so its texture is ~2 m a tile on every face. */
  function boxGeo(w, h, d, tile = 2) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px nx py ny pz nz
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * sizes[f][0] / tile, uv.getY(i) * sizes[f][1] / tile);
    }
    return g;
  }

  // ---- the sky ---------------------------------------------------------------------------
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 512;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  function paintSky(stops) {
    const c = skyCanvas.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 512);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    c.fillStyle = g; c.fillRect(0, 0, 4, 512);
    skyTex.needsUpdate = true;
  }
  // a striped retro sun
  function sunTexture(cols) {
    return canvasTex(512, 512, (c) => {
      const g = c.createLinearGradient(0, 40, 0, 470);
      g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
      c.save(); c.beginPath(); c.arc(256, 256, 216, 0, Math.PI * 2); c.clip();
      c.fillStyle = g; c.fillRect(0, 0, 512, 512);
      c.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 7; k++) { const y = 290 + k * 26, hh = 4 + k * 2.4; c.fillRect(0, y, 512, hh); }
      c.restore();
      const glow = c.createRadialGradient(256, 256, 200, 256, 256, 256);
      glow.addColorStop(0, 'rgba(255,220,160,0.5)'); glow.addColorStop(1, 'rgba(255,120,180,0)');
      c.globalCompositeOperation = 'destination-over'; c.fillStyle = glow; c.fillRect(0, 0, 512, 512);
    });
  }
  const sunMat = new THREE.MeshBasicMaterial({ transparent: true, fog: false, depthWrite: false, toneMapped: false });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), sunMat);
  scene.add(sun);
  // mountain ridges (far to near), the wall snaking along the nearest ones
  function ridgeTexture(col, wall) {
    return canvasTex(1024, 256, (c, w, h) => {
      c.fillStyle = '#' + new THREE.Color(col).getHexString();
      c.beginPath(); c.moveTo(0, h);
      const pts = [];
      for (let x = 0; x <= w; x += 16) {
        const y = h * 0.42 + Math.sin(x * 0.011 + col) * h * 0.14 + Math.sin(x * 0.031 + col * 3) * h * 0.08 + (rnd() - 0.5) * 8;
        pts.push([x, y]); c.lineTo(x, y);
      }
      c.lineTo(w, h); c.closePath(); c.fill();
      if (wall) { // a thin wall line with towers along the crest
        c.strokeStyle = 'rgba(255,190,150,0.55)'; c.lineWidth = 5; c.beginPath();
        pts.forEach(([x, y], i) => (i ? c.lineTo(x, y + 3) : c.moveTo(x, y + 3))); c.stroke();
        c.fillStyle = 'rgba(255,190,150,0.6)';
        for (let i = 4; i < pts.length; i += 9) c.fillRect(pts[i][0] - 5, pts[i][1] - 12, 10, 14);
      }
    }, 1, 1);
  }
  const ridges = [];
  function buildBackdrop(lv) {
    ridges.forEach((r) => { scene.remove(r.m); r.m.material.map.dispose(); r.m.material.dispose(); });
    ridges.length = 0;
    const look = SKIES[lv % SKIES.length];
    look.ridges.forEach((col, k) => {
      const tex = ridgeTexture(col, k > 0);
      tex.wrapS = THREE.RepeatWrapping;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(420, 90), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
      const z = -150 + k * 32;
      m.position.set(0, -12 + k * -2, z);
      m.userData = { z, par: 0.86 - k * 0.2 };
      m.renderOrder = -10 + k;
      scene.add(m); ridges.push({ m, tex });
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
  // a sea of sunset cloud below the wall: falling means falling into it
  const cloudTex = canvasTex(512, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0.95)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(rnd() * w, h * 0.35 + rnd() * 20, 18 + rnd() * 30, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill(); }
  }, 6, 1);
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, color: 0xff9ac1 });
  const cloudSea = new THREE.Mesh(new THREE.PlaneGeometry(600, 26), cloudMat);
  cloudSea.position.set(0, -14, 6);
  scene.add(cloudSea);

  // ---- the level ---------------------------------------------------------------------------
  const levelGroup = new THREE.Group();
  scene.add(levelGroup);
  let built = -1;
  const movers = [], spinners = [], crumbles = [], towers = [], bouncers = [], zipLines = [];
  function clearLevel() {
    levelGroup.traverse((o) => { if (o.isMesh && o.geometry && !o.userData.shared) o.geometry.dispose(); });
    levelGroup.clear();
    [movers, spinners, crumbles, towers, bouncers, zipLines].forEach((a) => { a.length = 0; });
  }
  const merlonGeo = boxGeo(0.7, 0.75, 0.5, 1.4);
  function wallBox(s) {
    const w = s.x1 - s.x0, h = s.y1 - s.y0, d = Z_FRONT - Z_BACK;
    const g = boxGeo(w, h, d);
    const mats = [STONE, STONE, PAVE, DARK, STONE, STONE];
    const grp = new THREE.Group();
    const m = new THREE.Mesh(g, mats), o = new THREE.Mesh(g, outlineMat);
    m.castShadow = m.receiveShadow = true;
    grp.add(o, m);
    grp.position.set((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (Z_FRONT + Z_BACK) / 2);
    levelGroup.add(grp);
    // battlements along the back edge
    for (let x = s.x0 + 0.5; x < s.x1 - 0.3; x += 1.25) {
      const b = outlined(merlonGeo, STONE);
      b.position.set(x, s.y1 + 0.37, Z_BACK + 0.25);
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
      c.fillStyle = col; // paint drips
      for (let i = 0; i < 6; i++) { const x = -200 + rnd() * 400; c.fillRect(x, 26, 6, 18 + rnd() * 30); }
      c.restore();
    });
  }
  function build(lv) {
    clearLevel();
    built = lv;
    const L = LEVELS[lv];
    seed = 11 + lv * 97;
    buildBackdrop(lv);
    L.solids.forEach(wallBox);
    // crumbling stones: cracked blocks that shake before they go
    L.crumbles.forEach((c) => {
      const g = outlined(boxGeo(c.x1 - c.x0, c.y1 - c.y0, Z_FRONT - Z_BACK, 1.2), CRACK);
      g.position.set((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, (Z_FRONT + Z_BACK) / 2);
      levelGroup.add(g); crumbles.push({ g, home: g.position.clone(), fall: 0 });
    });
    // things that move
    L.movers.forEach((m) => {
      const g = new THREE.Group();
      if (m.kind === 'lantern') {
        const plank = outlined(boxGeo(m.w, m.h, 1.8, 1), WOOD); g.add(plank);
        const lan = outlined(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 10), RED); lan.position.y = -0.95; g.add(lan);
        [-0.7, 0.7].forEach((y) => { const cap = outlined(new THREE.CylinderGeometry(0.5, 0.5, 0.18, 10), GOLD); cap.position.y = -0.95 + y * 0.95; g.add(cap); });
        const glow = new THREE.PointLight(0xff6a3a, lowPower ? 0 : 6, 7, 2); glow.position.y = -0.95; g.add(glow);
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 5), ROPE); levelGroup.add(rope);
        g.userData.rope = rope;
      } else if (m.kind === 'cart') {
        const box = outlined(boxGeo(m.w, 0.9, 1.6, 1), WOOD); box.position.y = -0.25; g.add(box);
        const trim = outlined(boxGeo(m.w + 0.1, 0.12, 1.7, 1), GOLD); trim.position.y = 0.2; g.add(trim);
        const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), ROPE); hook.position.y = 1.5; g.add(hook);
        const wheel = outlined(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), DARK); wheel.rotation.x = Math.PI / 2; wheel.position.y = 2.8; g.add(wheel);
      } else { // the parade dragon: red and gold, carried on poles
        const body = outlined(boxGeo(m.w, m.h + 0.3, 1.5, 1), RED); body.position.y = -0.15; g.add(body);
        for (let k = 0; k < 3; k++) { const sp = outlined(new THREE.ConeGeometry(0.22, 0.6, 4), GOLD); sp.position.set(-m.w / 3 + (k * m.w) / 3, 0.25, -0.5); g.add(sp); }
        const belly = outlined(boxGeo(m.w, 0.18, 1.52, 1), GOLD); belly.position.y = -0.5; g.add(belly);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 12, 5), WOOD); pole.position.y = -6.5; g.add(pole);
        if (m.kind === 'dragonHead') {
          const head = outlined(boxGeo(1.5, 1.2, 1.3, 1), RED); head.position.set(m.w / 2 + 0.55, 0.35, 0); g.add(head);
          const jaw = outlined(boxGeo(1.2, 0.3, 1.1, 1), GOLD); jaw.position.set(m.w / 2 + 0.75, -0.3, 0); g.add(jaw);
          [-0.35, 0.35].forEach((z) => {
            const horn = outlined(new THREE.ConeGeometry(0.14, 0.9, 5), GOLD); horn.position.set(m.w / 2 + 0.2, 1.25, z); horn.rotation.z = 0.5; g.add(horn);
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), NEONM[2]); eye.position.set(m.w / 2 + 0.95, 0.6, z * 1.6); g.add(eye);
          });
        }
        if (m.kind === 'dragonTail') { const tuft = outlined(new THREE.ConeGeometry(0.5, 1.4, 6), toon({ color: 0xff8a3d })); tuft.position.set(-m.w / 2 - 0.5, 0.2, 0); tuft.rotation.z = Math.PI / 2; g.add(tuft); }
      }
      levelGroup.add(g);
      movers.push({ m, g });
    });
    L.spinners.forEach((s) => {
      const hub = outlined(new THREE.CylinderGeometry(0.85, 0.85, 1.2, 14), GOLD);
      hub.rotation.x = Math.PI / 2; hub.position.set(s.cx, s.cy, -0.4);
      const band = outlined(new THREE.CylinderGeometry(0.9, 0.9, 0.4, 14), RED); band.rotation.x = Math.PI / 2; band.position.set(s.cx, s.cy, -0.4);
      levelGroup.add(hub, band);
      const arms = [], plats = [];
      for (let k = 0; k < s.n; k++) {
        const arm = new THREE.Mesh(boxGeo(s.r, 0.16, 0.16, 1), WOOD); arm.castShadow = true; levelGroup.add(arm); arms.push(arm);
        const p = outlined(boxGeo(s.w, 0.35, 1.8, 1), WOOD); levelGroup.add(p); plats.push(p);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshBasicMaterial({ color: NEON[k % NEON.length], side: THREE.DoubleSide, toneMapped: false }));
        flag.position.set(0, 0.5, -0.8); p.add(flag);
      }
      spinners.push({ s, arms, plats });
    });
    L.bouncers.forEach((b) => {
      const g = new THREE.Group();
      const base = outlined(boxGeo(b.x1 - b.x0, 0.5, Z_FRONT - Z_BACK, 1), toon({ color: 0x2b1a4a })); base.position.y = -0.25; g.add(base);
      const top = outlined(boxGeo(b.x1 - b.x0 - 0.2, 0.12, Z_FRONT - Z_BACK - 0.3, 1), NEONM[0]); top.position.y = 0.04; g.add(top);
      for (let k = 0; k < 5; k++) { // firework rockets ready to go
        const r = outlined(new THREE.CylinderGeometry(0.13, 0.13, 1.1, 6), k % 2 ? RED : GOLD);
        r.position.set(-((b.x1 - b.x0) / 2) + 0.4 + k * ((b.x1 - b.x0 - 0.8) / 4), 0.55, Z_BACK + 0.4);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 6), NEONM[k % 4]); tip.position.y = 0.7; r.add(tip);
        g.add(r);
      }
      g.position.set((b.x0 + b.x1) / 2, b.y, (Z_FRONT + Z_BACK) / 2);
      levelGroup.add(g); bouncers.push({ b, g, kick: 0 });
    });
    L.zips.forEach((z) => {
      const len = Math.hypot(z.bx - z.ax, z.by - z.ay);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len + 2, 5), toon({ color: 0x2b2b3a }));
      cable.position.set((z.ax + z.bx) / 2, (z.ay + z.by) / 2, 0.2);
      cable.rotation.z = Math.atan2(z.by - z.ay, z.bx - z.ax) - Math.PI / 2;
      levelGroup.add(cable);
      [[z.ax - 0.8, z.ay], [z.bx + 0.8, z.by]].forEach(([x, y]) => {
        const post = outlined(boxGeo(0.35, 4, 0.35, 1), WOOD); post.position.set(x, y - 2 + 0.3, 0.2); levelGroup.add(post);
      });
      zipLines.push(z);
    });
    // the rope line the carts hang from
    L.movers.filter((m) => m.kind === 'cart').forEach((m) => {
      const p = m.path, y = p.ay + 2.8, x0 = p.ax - 3, x1 = p.bx + 3;
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, x1 - x0, 5), ROPE);
      line.rotation.z = Math.PI / 2; line.position.set((x0 + x1) / 2, y, 0); levelGroup.add(line);
    });
    // watchtowers (checkpoints) behind the wall, a gate or gong at the end, tags
    L.decor.forEach((d) => {
      if (d.type === 'tower') {
        const g = new THREE.Group();
        const t = outlined(boxGeo(3.4, 5.5, 3, 2), STONE); t.position.y = 2.75; g.add(t);
        const roof = outlined(new THREE.ConeGeometry(2.8, 1.6, 4), toon({ color: 0x3a2a6a })); roof.rotation.y = Math.PI / 4; roof.position.y = 6.3; g.add(roof);
        const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), new THREE.MeshBasicMaterial({ color: 0x1a0b2e })); door.position.set(0, 0.9, 1.51); g.add(door);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), toon({ color: 0x2b2b3a })); pole.position.set(0, 8.2, 0); g.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9, 6, 1), new THREE.MeshBasicMaterial({ color: 0x8a8296, side: THREE.DoubleSide, toneMapped: false }));
        flag.position.set(0.78, 9, 0); g.add(flag);
        g.position.set(d.x, d.y, Z_BACK - 1.8);
        levelGroup.add(g); towers.push({ x: d.x, flag, g });
      } else if (d.type === 'gate' || d.type === 'gong') {
        const g = new THREE.Group();
        [-1.6, 1.6].forEach((x) => { const p = outlined(boxGeo(0.45, 4.6, 0.45, 1), RED); p.position.set(x, 2.3, 0); g.add(p); });
        const beam = outlined(boxGeo(4.6, 0.45, 0.6, 1), toon({ color: 0x2b1a4a })); beam.position.y = 4.7; g.add(beam);
        const beam2 = outlined(boxGeo(4, 0.3, 0.5, 1), GOLD); beam2.position.y = 4.1; g.add(beam2);
        if (d.type === 'gong') {
          const gong = outlined(new THREE.CylinderGeometry(1.25, 1.25, 0.18, 24), GOLD); gong.rotation.x = Math.PI / 2; gong.position.y = 2.4; g.add(gong);
          const boss = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), toon({ color: 0xffe9a0 })); boss.position.set(0, 2.4, 0.15); g.add(boss);
          g.userData.gong = gong;
        }
        g.position.set(d.x, d.y, Z_BACK + 0.4);
        levelGroup.add(g); towers.push({ x: d.x, end: true, g });
      } else if (d.type === 'barrels') {
        for (let k = 0; k < 3; k++) { const b = barrelModel(); b.position.set(d.x + (k - 1) * 0.9, d.y + 0.42 + (k === 1 ? 0.7 : 0), Z_BACK + 0.6); b.rotation.x = Math.PI / 2; levelGroup.add(b); }
      } else if (d.type === 'tag') {
        const col = ['#ff2d95', '#18e0ff', '#ffe11a', '#b57bff'][Math.floor(rnd() * 4)];
        const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), new THREE.MeshBasicMaterial({ map: tagTexture(d.text, col), transparent: true, toneMapped: false }));
        m.position.set(d.x, d.y - 1.4, Z_FRONT + 0.02);
        levelGroup.add(m);
      }
    });
    // neon bunting strung between the battlements, and some lanterns
    for (let x = L.start - 10; x < L.finish + 10; x += 9) {
      const s = L.solids.find((q) => x >= q.x0 && x <= q.x1);
      if (!s) continue;
      for (let k = 0; k < 8; k++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 3), NEONM[k % 5]);
        f.position.set(x + k * 0.9, s.y1 + 2.3 - Math.sin((k / 7) * Math.PI) * 0.6, Z_BACK + 0.25); f.rotation.z = Math.PI;
        levelGroup.add(f);
      }
    }
  }
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.9, 12);
  const bandGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.12, 12);
  function barrelModel() {
    const g = outlined(barrelGeo, RED);
    [-0.3, 0.3].forEach((y) => { const b = new THREE.Mesh(bandGeo, GOLD); b.position.y = y; g.add(b); });
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 4), toon({ color: 0x2b2b3a })); fuse.position.y = 0.6; g.add(fuse);
    return g;
  }
  const barrelPool = [];
  function barrelAt(i) {
    if (!barrelPool[i]) {
      const b = barrelModel(); b.rotation.x = Math.PI / 2;
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), NEONM[2]); spark.position.y = 0.8; b.add(spark);
      scene.add(b); barrelPool[i] = b;
    }
    return barrelPool[i];
  }

  // ---- the travellers -------------------------------------------------------------------------
  const heroModels = [];
  function heroFor(i, key) {
    const have = heroModels[i];
    if (have && have.userData.key === key) return have;
    if (have) scene.remove(have);
    const h = makeHero(key);
    h.scale.setScalar(HERO_SCALE);
    // an ink outline round every part
    h.traverse((o) => {
      if (o.isMesh && o.material === MAT) {
        o.castShadow = true;
        const ol = new THREE.Mesh(o.geometry, heroOutline);
        o.add(ol);
      }
    });
    h.userData.key = key;
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
      m.visible = true;
      m.position.set(p.x, p.y, 0);
      const a = anim[i] || (anim[i] = { ph: 0, face: 1, yaw: 1.1 });
      a.face = p.face || a.face;
      const yawT = p.zip ? 0.25 : p.grab ? 0.5 * a.face : a.face * 1.15;
      a.yaw += (yawT - a.yaw) * (1 - Math.exp(-dt * 12));
      m.rotation.y = a.yaw;
      const speed = Math.abs(p.vx);
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
  const LINKS_PER = Math.ceil(CHAIN / LINK) + 4;
  const links = new THREE.InstancedMesh(linkGeo, linkMat, LINKS_PER * 3);
  links.castShadow = true; links.frustumCulled = false;
  scene.add(links);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), SC = new THREE.Vector3(1, 1, 1), C = new THREE.Color();
  function drawChain(V) {
    let n = 0;
    for (let i = 0; i + 1 < V.players.length; i++) {
      const a = V.players[i], b = V.players[i + 1];
      const ax = a.x, ay = a.y + 0.9, bx = b.x, by = b.y + 0.9;
      const d = Math.hypot(bx - ax, by - ay), sag = d < CHAIN ? Math.sqrt(CHAIN * CHAIN - d * d) * 0.42 : 0;
      const floorY = a.ground && b.ground ? Math.min(a.y, b.y) + 0.07 : -Infinity;
      const count = Math.max(2, Math.round(Math.max(d, 0.4) / LINK));
      for (let k = 0; k <= count && n < links.count; k++) {
        // hangs in a curve; the slack piles on the walkway when both are standing
        const u = k / count, x = ax + (bx - ax) * u, y = Math.max(floorY, ay + (by - ay) * u - sag * 4 * u * (1 - u));
        const u2 = Math.min(1, u + 0.02), x2 = ax + (bx - ax) * u2, y2 = Math.max(floorY, ay + (by - ay) * u2 - sag * 4 * u2 * (1 - u2));
        E.set(k % 2 ? Math.PI / 2 : 0, 0, Math.atan2(y2 - y, x2 - x));
        Q.setFromEuler(E); P.set(x, y, 0.35);
        M4.compose(P, Q, SC); links.setMatrixAt(n++, M4);
      }
    }
    for (let k = n; k < links.count; k++) { M4.makeScale(0, 0, 0); links.setMatrixAt(k, M4); }
    links.instanceMatrix.needsUpdate = true;
  }

  // ---- particles (instanced cubes: confetti, sparks, debris, wind) ------------------------------
  const PN = 260;
  const parts = [];
  const partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), PN);
  partMesh.frustumCulled = false;
  partMesh.setColorAt(0, new THREE.Color(0xffffff));
  scene.add(partMesh);
  function burst(x, y, n, cols, speed = 6, size = 0.14, life = 1, grav = 9) {
    for (let k = 0; k < n && parts.length < PN; k++) {
      const a = rnd() * Math.PI * 2, v = speed * (0.4 + rnd() * 0.8);
      parts.push({ x, y, z: 0.3 + (rnd() - 0.5) * 1.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v + speed * 0.4, vz: (rnd() - 0.5) * 2, t: 0, life: life * (0.6 + rnd() * 0.6), size, col: cols[k % cols.length], grav, spin: rnd() * 6 });
    }
  }
  function drawParts(dt) {
    let n = 0;
    for (let k = parts.length - 1; k >= 0; k--) {
      const p = parts[k];
      p.t += dt; p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.t > p.life) { parts.splice(k, 1); continue; }
    }
    for (const p of parts) {
      const s = p.size * (1 - p.t / p.life * 0.6);
      E.set(p.t * p.spin, p.t * p.spin * 0.7, 0); Q.setFromEuler(E);
      P.set(p.x, p.y, p.z); SC.set(s, s, s);
      M4.compose(P, Q, SC); partMesh.setMatrixAt(n, M4); partMesh.setColorAt(n, C.set(p.col)); n++;
    }
    SC.set(1, 1, 1);
    for (let k = n; k < PN; k++) { M4.makeScale(0, 0, 0); partMesh.setMatrixAt(k, M4); }
    partMesh.instanceMatrix.needsUpdate = true;
    if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
  }

  // ---- layout & camera ---------------------------------------------------------------------------
  const view = { cw: 1, ch: 1, dpr: 1 };
  function layout() {
    const cw = stage.clientWidth, ch = stage.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 3);
    Object.assign(view, { cw, ch, dpr });
    for (const c of [glCanvas, hudCanvas]) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
    hudCanvas.width = Math.round(cw * dpr); hudCanvas.height = Math.round(ch * dpr);
    if (renderer) { renderer.setPixelRatio(lowPower ? 0.75 : Math.min(dpr, 2)); renderer.setSize(cw, ch, false); }
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', layout);
  layout();
  const cam = { x: 0, y: 3, d: 30, ready: false };
  function updateCamera(V, dt) {
    const me = V.players[S.me] || V.players[0];
    const xs = V.players.map((p) => p.x), ys = V.players.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = me ? me.x * 0.55 + ((minX + maxX) / 2) * 0.45 + 1.5 : 0;
    const cy = me ? Math.max(me.y * 0.6 + ((minY + maxY) / 2) * 0.4, LEVELS[V.lv].fallY + 6) + 1.6 : 3;
    // far enough back to see the whole gang (and a little ahead), wider screens closer
    const half = Math.tan((camera.fov / 2) * Math.PI / 180);
    const needW = Math.min(26, Math.max(9, maxX - minX + 7)), needH = Math.min(18, Math.max(8, maxY - minY + 6));
    const d = Math.max(needW / (2 * half * camera.aspect), needH / (2 * half), 14);
    const k = cam.ready ? 1 - Math.exp(-dt * 3) : 1;
    cam.x += (cx - cam.x) * k; cam.y += (cy - cam.y) * k; cam.d += (Math.min(70, d) - cam.d) * k;
    cam.ready = true;
    camera.position.set(cam.x, cam.y + cam.d * 0.24, cam.d);
    camera.lookAt(cam.x, cam.y, 0);
    key.position.set(cam.x - 30, cam.y + 30, 40); key.target.position.set(cam.x, cam.y, 0);
    rim.position.set(cam.x + 20, cam.y + 10, -40); rim.target.position.set(cam.x, cam.y, 0);
    sun.position.set(cam.x * 0.9 - 18, cam.y * 0.5 + 6, -170);
    ridges.forEach((r) => { r.m.position.x = cam.x * r.m.userData.par; r.tex.offset.x = 0; });
    cloudSea.position.x = cam.x;
  }
  const PV = new THREE.Vector3();
  function toScreen(x, y, z = 0) {
    PV.set(x, y, z).project(camera);
    return { x: ((PV.x + 1) / 2) * view.cw, y: ((1 - PV.y) / 2) * view.ch, behind: PV.z > 1 };
  }
  const hud = createHud(hudCanvas, game, view, toScreen);

  // ---- events from the game: bursts of colour ------------------------------------------------------
  function event(ev) {
    const V = S.view, p = V && ev.i >= 0 ? V.players[ev.i] : null;
    if (ev.e === 'boing' && p) { burst(p.x, p.y + 0.2, 40, ['#ff2d95', '#ffe11a', '#18e0ff', '#ffffff'], 9, 0.16, 1.2); const b = bouncers.find((q) => p.x >= q.b.x0 - 0.5 && p.x <= q.b.x1 + 0.5); if (b) b.kick = 1; }
    else if (ev.e === 'knock' && p) burst(p.x, p.y + 0.8, 26, ['#ffe11a', '#ff8a3d', '#ffffff'], 7, 0.1, 0.6);
    else if (ev.e === 'crumble' && V) { const c = LEVELS[V.lv].crumbles[ev.k]; if (c) burst((c.x0 + c.x1) / 2, c.y1, 30, ['#c9a08a', '#8a5a5a', '#5b3b4a'], 4, 0.22, 1.2, 14); }
    else if (ev.e === 'checkpoint') { const tw = towers.filter((q) => !q.end)[ev.k - 1]; if (tw) burst(tw.x, (V ? LEVELS[V.lv].decor.find((d) => d.x === tw.x).y : 0) + 9, 50, ['#ff2d95', '#18e0ff', '#ffe11a', '#b57bff'], 7, 0.14, 1.6); }
    else if (ev.e === 'jump' && p && ev.i === S.me) burst(p.x, p.y, 6, ['#ffffff', '#ffd7f0'], 2, 0.08, 0.35, 4);
    else if (ev.e === 'land' && p) burst(p.x, p.y, 5, ['#e8c8b8'], 1.5, 0.09, 0.3, 4);
    else if (ev.e === 'done' && V) { const end = towers.find((q) => q.end); if (end) { burst(end.x, LEVELS[V.lv].decor.find((d) => d.x === end.x).y + 3, 90, ['#ff2d95', '#18e0ff', '#ffe11a', '#b57bff', '#ffffff'], 11, 0.16, 2); end.ring = 1; } }
    else if (ev.e === 'zip' && p) burst(p.x, p.y + 1.9, 14, ['#ffe11a', '#ffffff'], 4, 0.07, 0.4, 2);
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
        g.position.set((b.x0 + b.x1) / 2, b.y1 - m.h / 2, 0);
        if (m.kind === 'lantern') {
          const r = g.userData.rope, px = m.path.px, py = m.path.py, hx = g.position.x, hy = g.position.y + m.h / 2;
          const len = Math.hypot(hx - px, hy - py);
          r.scale.y = len; r.position.set((px + hx) / 2, (py + hy) / 2, 0);
          r.rotation.z = Math.atan2(hy - py, hx - px) - Math.PI / 2;
          g.rotation.z = (hx - px) * -0.04;
        }
        if (m.kind !== 'cart' && m.kind !== 'lantern') g.rotation.z = b.vy * 0.06;
      });
      spinners.forEach(({ s, arms, plats }) => {
        spinnerBoxes(s, V.t).forEach((b, k) => {
          const x = (b.x0 + b.x1) / 2, y = b.y1 - 0.175;
          plats[k].position.set(x, y, 0);
          arms[k].position.set((s.cx + x) / 2, (s.cy + y) / 2, -0.6);
          arms[k].rotation.z = Math.atan2(y - s.cy, x - s.cx);
        });
      });
      crumbles.forEach((c, k) => {
        const st = V.crumble[k] || { gone: false, stood: 0 };
        if (st.gone) { c.fall = Math.min(1, c.fall + dt * 1.5); }
        else c.fall = Math.max(0, c.fall - dt * 3);
        const shake = !st.gone && st.stood > 0.6 ? Math.sin(t * 60) * 0.05 * Math.min(1, st.stood) : 0;
        c.g.visible = c.fall < 0.98;
        c.g.position.set(c.home.x + shake, c.home.y - c.fall * c.fall * 9, c.home.z);
        c.g.rotation.z = c.fall * 0.8;
      });
      bouncers.forEach((b) => { b.kick = Math.max(0, b.kick - dt * 3); b.g.scale.y = 1 - b.kick * 0.35 + Math.sin(b.kick * 10) * b.kick * 0.15; });
      towers.forEach((tw, k) => {
        if (tw.end) {
          if (tw.ring) { tw.ring = Math.max(0, tw.ring - dt * 0.4); if (tw.g.userData.gong) tw.g.userData.gong.rotation.z = Math.sin(t * 30) * 0.08 * tw.ring; }
          return;
        }
        const reached = k < V.cp;
        tw.flag.material.color.set(reached ? NEON[k % 4] : 0x8a8296);
        const pos = tw.flag.geometry.attributes.position; // a flapping flag
        for (let v = 0; v < pos.count; v++) { const x = pos.getX(v); pos.setZ(v, Math.sin(t * 6 + x * 3 + k) * 0.12 * (x + 0.75)); }
        pos.needsUpdate = true;
      });
      V.barrels.forEach((b, k) => {
        const m = barrelAt(k);
        m.visible = true; m.position.set(b.x, b.y, 0.2); m.rotation.set(Math.PI / 2, 0, 0); m.rotateY(b.spin);
      });
      for (let k = V.barrels.length; k < barrelPool.length; k++) barrelPool[k].visible = false;
      // gusts: white streaks blowing back along the wall
      windT += dt;
      L.winds.forEach((z) => {
        if (windOn(z, V.t) && windT > 0.03) {
          const y = (V.players[0] ? V.players[0].y : 0) + rnd() * 5 - 1;
          parts.length < PN - 4 && parts.push({ x: z.x1 + rnd() * 4, y, z: 0.4 + rnd() * 1.5, vx: z.force * 0.5, vy: 0, vz: 0, t: 0, life: 0.9, size: 0.06, col: '#ffffff', grav: 0, spin: 0 });
        }
      });
      if (windT > 0.03) windT = 0;
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
    screenPoint: (x, y) => toScreen(x, y),
    programs: () => (renderer ? renderer.info.programs.length : 0),
  };
}
