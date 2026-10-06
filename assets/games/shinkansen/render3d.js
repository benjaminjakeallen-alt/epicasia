// Draws Shinkansen Dash with three.js: three bullet trains side by side
// running away from the camera, a chase camera behind the runner, voxel
// scenery streaming past per stage (Tokyo, rice fields, Mount Fuji, tea
// hills, Kyoto), tunnels, and the roof obstacles. Positions come from the
// game's distances: z = S.dist - d (ahead is -z). hud.js draws text on top.
import * as THREE from 'three';
import { makeHero, makeHeroine } from '../rampage/models.js';
import {
  GLOW, makeCar, makeNose, makeHump, makePanto, makeCrow, makeGantry, makeOnigiri, makeNeko, makePole,
  makeTunnelRing, makePortal, makeBuilding, makeTree, makePaddy, makeFarmhouse, makeTeaRow, makePagoda, makeTorii, makeBackdrop
} from './models.js';
import { createHud } from './hud.js';

const FOV = 58;
const AHEAD = 210; // metres drawn ahead
const HERO_SCALE = 0.092;
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
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.3, 900);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 26, bottom: -20, near: 1, far: 90 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  scene.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog(0xdcefff, 90, AHEAD + 30);

  // ground and track bed (they don't need to move: everything on them does)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: 0x8fbf6a }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -300); ground.receiveShadow = true;
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(13, 900), new THREE.MeshLambertMaterial({ color: 0x8c8378 }));
  bed.rotation.x = -Math.PI / 2; bed.position.set(0, 0, -300); bed.receiveShadow = true;
  scene.add(ground, bed);

  // ---- pools ------------------------------------------------------------------------
  const pools = {};
  const used = new Set();
  function take(kind, make) {
    const pool = pools[kind] || (pools[kind] = []);
    let m = pool.find((q) => !q.userData.busy && !q.userData.keep);
    if (!m) { m = make(); m.userData.kind = kind; pool.push(m); scene.add(m); m.traverse((o) => { if (o.isMesh && o.material !== GLOW) { o.castShadow = true; o.receiveShadow = true; } }); }
    m.userData.busy = true; m.visible = true; used.add(m);
    return m;
  }
  function frameStart() { used.forEach((m) => { m.userData.busy = false; }); used.clear(); }
  function frameEnd() { Object.values(pools).forEach((pool) => pool.forEach((m) => { if (!m.userData.busy && !m.userData.keep) m.visible = false; })); }

  const carGeo = makeCar(CAR - 0.02), carEndGeo = makeCar(CAR - 0.02, true);
  const noseHeight = game.noseHeight;

  // ---- travellers ---------------------------------------------------------------------
  const heroes = {
    chris: makeHero('chris'), shea: makeHero('shea'), emily: makeHeroine('emily'), heather: makeHeroine('heather')
  };
  Object.values(heroes).forEach((h) => {
    h.scale.setScalar(HERO_SCALE);
    h.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(h);
  });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffd43b, fog: false }));
  halo.rotation.x = Math.PI / 2;
  scene.add(halo);

  // particles
  const partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), 200);
  partMesh.frustumCulled = false;
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
  function layout() {
    const cw = stage.clientWidth, ch = stage.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 3);
    Object.assign(view, { cw, ch, dpr });
    for (const c of [glCanvas, hudCanvas]) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
    hudCanvas.width = Math.round(cw * dpr); hudCanvas.height = Math.round(ch * dpr);
    if (renderer) { renderer.setPixelRatio(lowPower ? 0.75 : Math.min(dpr, 2)); renderer.setSize(cw, ch, false); }
    camera.aspect = cw / ch;
    camera.fov = cw / ch > 0.9 ? 50 : FOV;
    camera.updateProjectionMatrix();
  }
  const LINEUP = [-1.42, -0.47, 0.47, 1.42];
  const cam = { pos: new THREE.Vector3(0, ROOF + 1.3, 7), look: new THREE.Vector3(0, ROOF + 0.85, 0) };
  function camTarget() {
    if (S.mode === 'select') {
      const half = Math.tan((camera.fov / 2) * Math.PI / 180);
      const dist = Math.max(4.5, 2.45 / (half * Math.min(1, camera.aspect)));
      return { pos: new THREE.Vector3(0, ROOF + 1.25, dist), look: new THREE.Vector3(0, ROOF + 0.75, 0) };
    }
    const px = S.p ? S.p.x : 0;
    return { pos: new THREE.Vector3(px * 0.55, ROOF + 4.3, 8.6), look: new THREE.Vector3(px * 0.75, ROOF + 0.3, -18) };
  }
  const PV = new THREE.Vector3();
  function toScreen(x, y, z) {
    PV.set(x, y, z).project(camera);
    return { x: ((PV.x + 1) / 2) * view.cw, y: ((1 - PV.y) / 2) * view.ch, behind: PV.z > 1 };
  }

  // ---- poses ---------------------------------------------------------------------------------
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
  function drawRunner(t) {
    const p = S.p, m = heroes[S.hero];
    m.visible = !(S.invuln > 0 && Math.floor(t * 12) % 2 === 0);
    m.position.set(p.x, p.y, 0);
    const lean = p.laneT < 1 ? (game.LANES[p.lane] > p.from ? -0.25 : 0.25) : 0;
    if (S.mode === 'crash' || S.mode === 'gameover') {
      const k = Math.min(1, S.modeT / 0.6);
      m.rotation.set(-k * 1.4, Math.PI, k * 0.6);
      pose(m, { armL: -2.8, armR: -2.6, legL: -0.6, legR: 0.4 });
      return;
    }
    if (p.slideT > 0) {
      m.rotation.set(1.15, Math.PI, lean);
      pose(m, { legL: -1.3, legR: -1.1, armL: -2.9, armR: -2.9, nod: -0.6 });
      return;
    }
    m.rotation.set(0, Math.PI, lean);
    if (p.air) { pose(m, { legL: -1.2, legR: 0.5, armL: -2.6, armR: -2.4, armLz: -0.3, armRz: 0.3 }); return; }
    const ph = p.anim, s = S.mode === 'ready' ? Math.min(1, S.modeT) : 1;
    pose(m, {
      bob: Math.abs(Math.cos(ph)) * 0.8 * s, lean: -0.15 * s,
      legL: Math.sin(ph) * 0.9 * s, legR: -Math.sin(ph) * 0.9 * s, armL: -Math.sin(ph) * 0.8 * s, armR: Math.sin(ph) * 0.8 * s
    });
  }
  function drawLineup(t) {
    game.ROSTER.forEach((k, i) => {
      const m = heroes[k], on = S.sel === i;
      m.visible = true;
      m.position.set(LINEUP[i], ROOF + (on ? Math.abs(Math.sin(t * 5)) * 0.12 : 0), 0);
      m.rotation.set(0, on ? Math.sin(t * 1.4) * 0.35 : 0.15 * (i - 1.5), 0);
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
    Object.values(heroes).forEach((h) => { h.visible = false; });
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
          ? take('carEnd', () => new THREE.Mesh(carEndGeo.geometry, carEndGeo.material))
          : take('car', () => new THREE.Mesh(carGeo.geometry, carGeo.material));
        m.position.set(LANES[l], 0, z(c0));
      }
    }
    S.gaps.forEach((g) => {
      if (g.g0 < to && g.g0 > from) { const n = take('nose', () => makeNose(NOSE, noseHeight)); n.position.set(LANES[g.lane], 0, z(g.g0)); n.rotation.y = 0; }
      if (g.g1 < to + NOSE && g.g1 > from) { const n = take('nose', () => makeNose(NOSE, noseHeight)); n.position.set(LANES[g.lane], 0, z(g.g1)); n.rotation.y = Math.PI; }
    });

    // catenary poles every 30 m
    for (let d = Math.floor(from / 30) * 30; d < to; d += 30) {
      if (game.inTunnel(d)) continue;
      take('poleL', () => makePole(-1, ROOF + 3.9)).position.set(0, 0, z(d));
      take('poleR', () => makePole(1, ROOF + 3.9)).position.set(0, 0, z(d));
    }
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
      if (o.gone || o.d > to || o.d < from) return;
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
        case 'neko': m = take('neko', makeNeko); m.position.set(x, base + 0.3, z(o.d)); m.rotation.y = Math.sin(t * 2) * 0.5; break;
      }
    });

    // the runner (or the line-up on the select screen)
    if (S.mode === 'select') drawLineup(t);
    else if (S.p) {
      drawRunner(t);
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

    // sun & shadows follow the runner
    const px = S.p && S.mode !== 'select' ? S.p.x : 0;
    sun.position.set(px - 10, 32, 14); sun.target.position.set(px, 0, -8);
  }

  // ---- HUD & frame --------------------------------------------------------------------------------
  const hud = createHud(hudCanvas, game, view, toScreen, LINEUP);
  let glAge = 1;
  function render(dt) {
    glAge += dt;
    const drawGL = renderer && (!lowPower || glAge >= 1 / 12);
    const elapsed = Math.min(0.25, glAge);
    if (drawGL) glAge = 0;
    if (drawGL || !renderer) {
      sync(elapsed);
      const ct = camTarget(), k = S.mode === 'select' ? 1 - Math.exp(-elapsed * 6) : 1 - Math.exp(-elapsed * 5);
      cam.pos.lerp(ct.pos, k); cam.look.lerp(ct.look, k);
      const sh = S.shakeT > 0 ? 0.12 : 0;
      camera.position.set(cam.pos.x + (Math.random() - 0.5) * sh, cam.pos.y + (Math.random() - 0.5) * sh, cam.pos.z);
      camera.lookAt(cam.look);
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
    for (let i = 0; i < 4; i++) { const d = Math.abs(heroPoint(i).x - clientX); if (d < bd) { bd = d; best = i; } }
    return bd < view.cw * 0.16 ? best : -1;
  }

  return { hasGL: !!renderer, layout, render, heroAt, heroPoint };
}
