// Sushi Conveyor — the game page: layout, drawing, taps, screens and messages to the app.
// The rules are in sim.js; the pictures in art.js (real-miniature style, user's pick Oct 30 2026);
// the sound in sound.js. Drawn on one 2D canvas: a counter photo, a belt drawn in code along an
// S-curve, and the plates as cut-out miniatures riding it.

import { createSim, stepSim, tapPlate, simulate, wanted, comboMult, TYPES, LEVELS, ROUND, STRIKES } from './sim.js';
import { loadArt } from './art.js';
import { SFX, audio, duck, music, musicState, setLevel, isMuted, isMusicOn, setMuted, setMusic } from './sound.js';

const INIT = window.SUSHI_INIT || {};
const DEBUG = !!INIT.debug;
const HEROES = ['chris', 'emily', 'shea', 'heather', 'bennett', 'miles', 'nicole', 'jake', 'liam', 'mei'];
const NAME = (h) => h[0].toUpperCase() + h.slice(1);
const $ = (id) => document.getElementById(id);
const stage = $('stage'), cv = $('cv'), g = cv.getContext('2d');

const post = (type, data = {}) => { try { parent.postMessage({ source: 'sushi', type, ...data }, '*'); } catch { /* not framed */ } };

const S = {
  mode: 'loading', // loading | seat | tips | ready | play | over
  paused: false,
  hero: HEROES.includes(INIT.hero) ? INIT.hero : 'chris',
  night: !!INIT.night, counter: INIT.night && INIT.counter === 'night' ? 'night' : 'day',
  tips: !!INIT.tips, high: Number(INIT.highScore) || 0,
  sim: null, seed: (Date.now() % 1e9) | 0, readyT: 0, posted: false,
  fly: [], leaving: [], fx: [], texts: [], banner: null, tickets: new Map(), shake: 0, belt: 0, chefBob: 0,
  perf: { avg: 0, worst: 0 },
};
let art = {};
let W = 0, H = 0, DPR = 1, LAY = null, beltCanvas = null;

// ---- layout ----------------------------------------------------------------------------------
// HUD along the top, then the tickets, then the belt: three rows joined by rounded turns at the
// sides, from the chef (top left) to off the right edge at the bottom. The bottom ~10% is left to
// the counter's teacup.
function layout() {
  const r = stage.getBoundingClientRect();
  W = r.width; H = r.height; DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const hud = 58, tH = Math.min(108, Math.max(84, H * 0.12));
  const top = hud + tH + 22;
  const gap = Math.max(96, (H * 0.88 - top) / 3);
  const diam = Math.min(W * 0.18, gap * 0.5, 118), bw = diam * 1.2, rr = Math.min(diam * 0.9, gap * 0.4);
  const xr = W - 8 - bw / 2, xl = 8 + bw / 2; // the turns' outer lines
  const y0 = top + gap * 0.35;
  const pts = [];
  const line = (x1, y1, x2, y2) => { const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2)); for (let i = 0; i < n; i++) pts.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]); };
  const arc = (cx, cy, a0, a1) => { const n = Math.max(1, Math.ceil((Math.abs(a1 - a0) * rr) / 2)); for (let i = 0; i < n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } };
  const P = Math.PI / 2;
  const startX = Math.min(W * 0.36, xl + diam * 1.6);
  const ys = [y0, y0 + gap, y0 + 2 * gap];
  // row 0 →, down the right, row 1 ←, down the left, row 2 → and off the right edge
  line(startX, ys[0], xr - rr, ys[0]); arc(xr - rr, ys[0] + rr, -P, 0); line(xr, ys[0] + rr, xr, ys[1] - rr); arc(xr - rr, ys[1] - rr, 0, P);
  line(xr - rr, ys[1], xl + rr, ys[1]); arc(xl + rr, ys[1] + rr, -P, -2 * P); line(xl, ys[1] + rr, xl, ys[2] - rr); arc(xl + rr, ys[2] - rr, P * 2, P);
  line(xl + rr, ys[2], W + diam, ys[2]); pts.push([W + diam, ys[2]]);
  LAY = { hud, tH, top, gap, diam, bw, xl, xr, y0, ys, pts, lenPx: pts.length * 2, len: (pts.length * 2) / diam, startX };
  beltCanvas = null;
  if (S.sim) S.sim.len = LAY.len;
}
/** Where a plate `s` diameters along the belt is, in CSS px. */
function beltAt(s) {
  const i = Math.max(0, Math.min(LAY.pts.length - 1, (s * LAY.diam) / 2));
  const a = LAY.pts[Math.floor(i)], b = LAY.pts[Math.min(LAY.pts.length - 1, Math.floor(i) + 1)], f = i - Math.floor(i);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// ---- drawing ---------------------------------------------------------------------------------
function cover(im) {
  if (!im) { g.fillStyle = S.counter === 'night' ? '#3a2416' : '#e6d3b0'; g.fillRect(0, 0, W, H); return; }
  const k = Math.max(W / im.width, H / im.height), w = im.width * k, h = im.height * k;
  g.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
}
function strokePath(ctx, width, style, dy = 0) {
  ctx.beginPath(); LAY.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy)));
  ctx.lineWidth = width; ctx.strokeStyle = style; ctx.stroke();
}
/** The belt: a soft shadow, a sage ceramic rim, a slate surface (cached; the slats move on top). */
function drawBelt() {
  if (!beltCanvas) {
    beltCanvas = document.createElement('canvas'); beltCanvas.width = cv.width; beltCanvas.height = cv.height;
    const b = beltCanvas.getContext('2d'); b.scale(DPR, DPR); b.lineCap = 'butt'; b.lineJoin = 'round';
    const bw = LAY.bw;
    b.save(); b.filter = 'blur(6px)'; strokePath(b, bw + 22, 'rgba(70,45,20,0.32)', 7); b.restore();
    strokePath(b, bw + 18, '#5f7f68');
    strokePath(b, bw + 14, '#a8c3ad');
    strokePath(b, bw + 6, '#d9e6da', -1.5);
    strokePath(b, bw + 4, '#7f9d87');
    strokePath(b, bw, '#2e3437');
    strokePath(b, bw * 0.92, '#383f43', -1);
  }
  g.drawImage(beltCanvas, 0, 0, W, H);
  // the slats, moving with the belt
  const step = LAY.diam * 0.3, half = LAY.bw * 0.46;
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; g.beginPath();
  for (let d = (S.belt % step) + 2; d < LAY.lenPx - 4; d += step) {
    const i = Math.floor(d / 2), [x, y] = LAY.pts[i], [x2, y2] = LAY.pts[Math.min(LAY.pts.length - 1, i + 1)];
    const len = Math.hypot(x2 - x, y2 - y) || 1, nx = -(y2 - y) / len, ny = (x2 - x) / len;
    g.moveTo(x - nx * half, y - ny * half); g.lineTo(x + nx * half, y + ny * half);
  }
  g.stroke();
}
function shadowAt(x, y, r, a = 0.28) {
  const grd = g.createRadialGradient(x + r * 0.12, y + r * 0.22, r * 0.2, x + r * 0.12, y + r * 0.22, r * 1.05);
  grd.addColorStop(0, `rgba(40,25,10,${a})`); grd.addColorStop(1, 'rgba(40,25,10,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(x + r * 0.12, y + r * 0.22, r * 1.05, 0, Math.PI * 2); g.fill();
}
function drawPlate(type, gold, x, y, d, t, alpha = 1) {
  const im = art[type], r = d / 2;
  g.save(); g.globalAlpha = alpha;
  if (gold) {
    const pulse = 0.75 + 0.25 * Math.sin(t * 5);
    const grd = g.createRadialGradient(x, y, r * 0.6, x, y, r * 1.45);
    grd.addColorStop(0, `rgba(255,214,102,${0.75 * pulse})`); grd.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r * 1.45, 0, Math.PI * 2); g.fill();
  }
  if (im) g.drawImage(im, x - r, y - r, d, d);
  else { g.fillStyle = '#f5efe2'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  if (gold) {
    g.lineWidth = Math.max(2.5, d * 0.05);
    const ring = g.createLinearGradient(x - r, y - r, x + r, y + r);
    ring.addColorStop(0, '#fff2b8'); ring.addColorStop(0.45, '#d4a12a'); ring.addColorStop(1, '#9a6b12');
    g.strokeStyle = ring; g.beginPath(); g.arc(x, y, r * 0.95, 0, Math.PI * 2); g.stroke();
    const k = (t * 1.3) % 1; // a twinkle going round
    sparkle(x + Math.cos(k * 6.28) * r * 0.9, y + Math.sin(k * 6.28) * r * 0.9, d * 0.09);
  }
  g.restore();
}
function sparkle(x, y, s) {
  g.save(); g.fillStyle = '#fffbe8'; g.shadowColor = '#ffd25e'; g.shadowBlur = s * 2;
  g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s); g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s); g.fill();
  g.restore();
}
function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const SERIF = 'Georgia, "Times New Roman", serif', SANS = 'system-ui, -apple-system, sans-serif';

/** The tickets' boxes (and each piece's slot), left to right in the order they came. */
function ticketBoxes() {
  const n = Math.max(S.sim ? LEVELS[S.sim.level - 1].orders : 2, S.sim ? S.sim.orders.length : 0);
  const pad = 10, gapX = 8, w = Math.min(150, (W - pad * 2 - gapX * (n - 1)) / n), h = LAY.tH;
  const x0 = (W - (w * n + gapX * (n - 1))) / 2;
  return { w, h, at: (i) => [x0 + i * (w + gapX), LAY.hud + 4] };
}
function slotXY(i, slot, count) {
  const tb = ticketBoxes(), [x, y] = tb.at(i), icon = Math.min((tb.w - 14) / Math.max(2, count), tb.h * 0.56);
  const total = icon * count, sx = x + (tb.w - total) / 2;
  return [sx + icon * slot + icon / 2, y + tb.h * 0.47, icon];
}
function drawTickets(t, dt) {
  const sim = S.sim; if (!sim) return;
  sim.orders.forEach((o, i) => {
    const st = S.tickets.get(o.id) || { born: t };
    S.tickets.set(o.id, st);
    const enter = Math.min(1, (t - st.born) / 0.35);
    drawTicket(o, i, 1 - Math.pow(1 - enter, 3), t);
  });
  // served tickets lift away where they were
  for (const l of S.leaving) { l.t += dt; drawTicket(l.o, l.i, Math.max(0, 1 - l.t / 0.5), t, -l.t * 60); }
  S.leaving = S.leaving.filter((l) => l.t < 0.5);
}
function drawTicket(o, i, ease, t, lift = 0) {
  const tb = ticketBoxes();
  {
    let [x, y] = tb.at(i); y -= (1 - ease) * 30 - lift;
    const frac = Math.max(0, o.patience / o.max);
    const wob = frac < 0.25 ? Math.sin(t * 30) * 1.5 : 0;
    g.save(); g.globalAlpha = ease; g.translate(x + tb.w / 2 + wob, y + tb.h / 2); g.rotate(((i % 2 ? 1 : -1) * 0.012));
    g.shadowColor = 'rgba(60,40,20,0.3)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
    g.fillStyle = '#fbf6ea'; rr(-tb.w / 2, -tb.h / 2, tb.w, tb.h, 10); g.fill();
    g.shadowColor = 'transparent';
    g.fillStyle = '#c8452f'; g.beginPath(); g.arc(0, -tb.h / 2 + 7, 3.2, 0, Math.PI * 2); g.fill(); // a pin
    g.fillStyle = '#7a6a58'; g.font = `600 11px ${SANS}`; g.textAlign = 'center'; g.fillText(`No. ${o.id % 100}`, 0, -tb.h / 2 + 22);
    // patience: sage, then amber, then red
    const bx = -tb.w / 2 + 10, bw = tb.w - 20, by = tb.h / 2 - 13;
    g.fillStyle = 'rgba(120,100,80,0.18)'; rr(bx, by, bw, 6, 3); g.fill();
    g.fillStyle = frac > 0.5 ? '#4f7a5c' : frac > 0.25 ? '#d49a2a' : '#c8452f'; rr(bx, by, Math.max(6, bw * frac), 6, 3); g.fill();
    g.restore();
    o.items.forEach((it, k) => {
      const [sx, sy, icon] = slotXY(i, k, o.items.length);
      const flying = S.fly.some((f) => f.order === o.id && f.slot === k && !f.landed);
      const yy = sy - (1 - ease) * 30 + lift;
      drawPlate(it.type, false, sx + wob, yy, icon * 0.98, t, (it.filled && !flying ? 0.45 : 1) * ease);
      if (it.filled && !flying) {
        g.globalAlpha = ease;
        g.fillStyle = '#4f7a5c'; g.beginPath(); g.arc(sx + icon * 0.28, yy + icon * 0.24, icon * 0.2, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, icon * 0.05); g.beginPath();
        g.moveTo(sx + icon * 0.19, yy + icon * 0.24); g.lineTo(sx + icon * 0.26, yy + icon * 0.31); g.lineTo(sx + icon * 0.38, yy + icon * 0.16); g.stroke();
        g.globalAlpha = 1;
      }
    });
  }
}
function pill(x, y, text, { size = 15, font = SANS, weight = 700, color = '#2b231b', bg = 'rgba(251,246,234,0.92)', align = 'left' } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  const w = g.measureText(text).width + size * 1.1, h = size * 1.75;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  g.save(); g.shadowColor = 'rgba(60,40,20,0.22)'; g.shadowBlur = 6; g.shadowOffsetY = 2; g.fillStyle = bg; rr(x0, y, w, h, h / 2); g.fill(); g.restore();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x0 + w / 2, y + h / 2 + 1); g.textBaseline = 'alphabetic';
  return w;
}
const fmt = (n) => Math.round(n).toLocaleString('en-US');
function drawHud(t) {
  const sim = S.sim;
  pill(10, 10, sim ? fmt(sim.score) : '0', { size: 19, font: SERIF, weight: 500 });
  const tm = sim ? Math.ceil(sim.time) : ROUND;
  pill(W / 2, 10, `${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}`, { size: 17, align: 'center', color: tm <= 10 && sim && !sim.over ? '#c8452f' : '#2b231b' });
  // strikes (late orders), left of the pause button
  for (let i = 0; i < STRIKES; i++) {
    const x = W - 66 - i * 20, y = 30, hit = sim && i < sim.strikes;
    g.fillStyle = hit ? '#c8452f' : 'rgba(251,246,234,0.92)'; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = hit ? '#fff' : 'rgba(79,122,92,0.6)'; g.lineWidth = 1.5; g.stroke();
  }
  if (sim && sim.combo >= 4) {
    const m = comboMult(sim.combo);
    pill(W / 2, H - 50, `Combo ${sim.combo} · ×${m % 1 ? m.toFixed(1) : m}`, { size: 14, align: 'center', color: '#fff', bg: 'rgba(79,122,92,0.92)' });
  }
  if (sim && sim.level > 1 && S.mode === 'play') pill(W / 2, H - 50 + (sim.combo >= 4 ? -34 : 0), `Belt ${sim.level}`, { size: 12, align: 'center', color: '#5b4c3c' });
}
function drawChef(t) {
  const im = art.chef; if (!im) return;
  const h = LAY.diam * 2, w = (im.width / im.height) * h;
  const x = Math.max(-w * 0.1, LAY.startX - LAY.diam * 0.55 - w), y = LAY.y0 - h * 0.62 + Math.sin(t * 2) * 1.5;
  g.drawImage(im, x, y, w, h);
}
/** The kitchen hatch at the start of the belt: a wooden lintel and a sage noren curtain the plates come out from under. */
function drawHatch(t) {
  const x = LAY.startX, y = LAY.ys[0], h = LAY.bw + 16, w = LAY.diam * 0.42;
  g.save();
  g.fillStyle = 'rgba(40,25,10,0.25)'; rr(x - w * 0.2 + 4, y - h / 2 + 6, w * 1.2, h, 6); g.fill();
  const panels = 3, ph = (h - 6) / panels;
  for (let i = 0; i < panels; i++) {
    const sway = Math.sin(t * 1.6 + i) * 1.2, py = y - h / 2 + 3 + i * ph;
    const grd = g.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, '#6f957a'); grd.addColorStop(0.5, '#86a98f'); grd.addColorStop(1, '#5c8268');
    g.fillStyle = grd; rr(x + sway, py + 1, w, ph - 2, 4); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + sway + w * 0.45, py + ph * 0.3, w * 0.3, ph * 0.12); // a little crest
  }
  const lg = g.createLinearGradient(x - 6, 0, x + 2, 0);
  lg.addColorStop(0, '#c9a678'); lg.addColorStop(1, '#a8845a');
  g.fillStyle = lg; rr(x - 7, y - h / 2 - 4, 9, h + 8, 3); g.fill();
  g.restore();
}
function drawFx(t, dt) {
  for (const p of S.fx) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt;
    const a = Math.max(0, 1 - p.t / p.life);
    if (p.kind === 'star') { g.globalAlpha = a; sparkle(p.x, p.y, p.s); g.globalAlpha = 1; }
    else { g.fillStyle = p.c; g.globalAlpha = a; g.beginPath(); g.arc(p.x, p.y, p.s, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
  }
  S.fx = S.fx.filter((p) => p.t < p.life);
  for (const tx of S.texts) {
    tx.t += dt; const a = Math.min(1, 2 * (1 - tx.t / 1.1));
    g.globalAlpha = Math.max(0, a); g.font = `600 ${tx.size}px ${SERIF}`; g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = 'rgba(251,246,234,0.95)'; g.strokeText(tx.text, tx.x, tx.y - tx.t * 40);
    g.fillStyle = tx.color; g.fillText(tx.text, tx.x, tx.y - tx.t * 40); g.globalAlpha = 1;
  }
  S.texts = S.texts.filter((x) => x.t < 1.1);
  if (S.banner) {
    S.banner.t += dt; const b = S.banner, k = b.t / b.life;
    if (k >= 1) S.banner = null;
    else {
      const s = k < 0.15 ? 0.7 + 0.3 * (k / 0.15) : 1, a = k > 0.75 ? (1 - k) / 0.25 : 1;
      g.save(); g.globalAlpha = a; g.translate(W / 2, H * 0.52); g.scale(s, s);
      g.font = `italic 500 ${Math.min(44, W * 0.11)}px ${SERIF}`; g.textAlign = 'center';
      g.lineWidth = 7; g.strokeStyle = 'rgba(251,246,234,0.96)'; g.strokeText(b.text, 0, 0);
      g.fillStyle = b.color; g.fillText(b.text, 0, 0);
      if (b.sub) { g.font = `600 15px ${SANS}`; g.lineWidth = 5; g.strokeText(b.sub, 0, 30); g.fillStyle = '#5b4c3c'; g.fillText(b.sub, 0, 30); }
      g.restore();
    }
  }
}
function burst(x, y, n, colors, kind = 'dot') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
    S.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, t: 0, life: 0.6 + Math.random() * 0.4, s: kind === 'star' ? 4 + Math.random() * 4 : 2 + Math.random() * 2.5, c: colors[i % colors.length], kind });
  }
}
const say = (text, x, y, color = '#2b231b', size = 20) => S.texts.push({ text, x, y, color, size, t: 0 });
const banner = (text, color = '#2b231b', sub = '', life = 1.3) => { S.banner = { text, color, sub, life, t: 0 }; };

function render(t, dt) {
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sh = S.shake > 0 ? S.shake : 0; S.shake = Math.max(0, S.shake - dt * 30);
  g.save(); if (sh) g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
  cover(S.counter === 'night' ? art.bgNight : art.bgDay);
  if (S.counter === 'night') { g.fillStyle = 'rgba(255,140,60,0.06)'; g.fillRect(0, 0, W, H); }
  drawBelt();
  drawChef(t);
  if (S.sim) {
    const list = S.sim.plates.filter((p) => !p.taken).map((p) => ({ p, xy: beltAt(p.s) }));
    for (const { xy } of list) shadowAt(xy[0], xy[1], LAY.diam / 2);
    for (const { p, xy } of list) {
      const intro = Math.min(1, p.s / 0.5); // coming out of the kitchen
      const wob = p.wob ? Math.sin((t - p.wob) * 40) * 4 * Math.max(0, 1 - (t - p.wob) / 0.4) : 0;
      drawPlate(p.type, p.gold, xy[0] + wob, xy[1], LAY.diam * (0.6 + 0.4 * intro), t, intro);
    }
  }
  drawHatch(t);
  drawTickets(t, dt);
  // plates flying up to their tickets
  for (const f of S.fly) {
    f.t += dt; const k = Math.min(1, f.t / 0.34), e = k * k * (3 - 2 * k);
    const [tx, ty, icon] = f.to();
    const x = f.x + (tx - f.x) * e, y = f.y + (ty - f.y) * e - Math.sin(k * Math.PI) * 60;
    drawPlate(f.type, f.gold, x, y, LAY.diam + (icon - LAY.diam) * e, t);
    if (k >= 1 && !f.landed) { f.landed = true; SFX.land(); burst(tx, ty, 6, ['#fff6d6', '#ffd25e'], 'star'); }
  }
  S.fly = S.fly.filter((f) => f.t < 0.36);
  drawFx(t, dt);
  g.restore();
  drawHud(t);
  if (S.mode === 'ready') {
    const left = 3 - S.readyT, n = Math.ceil(left);
    g.font = `italic 500 ${Math.min(64, W * 0.17)}px ${SERIF}`; g.textAlign = 'center';
    const text = n >= 1 ? String(n) : 'Irasshaimase!';
    g.lineWidth = 8; g.strokeStyle = 'rgba(251,246,234,0.96)'; g.strokeText(text, W / 2, H * 0.52); g.fillStyle = '#2b231b'; g.fillText(text, W / 2, H * 0.52);
  }
}

// ---- the round -------------------------------------------------------------------------------
function newRound() {
  S.sim = createSim(S.seed, LAY.len);
  S.seed = (S.seed * 1103515245 + 12345) & 0x7fffffff;
  S.fly = []; S.leaving = []; S.fx = []; S.texts = []; S.banner = null; S.tickets.clear(); S.posted = false;
  setLevel(1);
}
function startCountdown() {
  newRound(); S.mode = 'ready'; S.readyT = 0; S.lastCount = 4;
  audio(); music(true, 'round-' + S.seed);
}
function handleEvents(t) {
  const sim = S.sim;
  for (const e of sim.events) {
    if (e.e === 'level') { setLevel(e.level); banner('Faster!', '#4a7256', `Belt ${e.level}`); SFX.combo(); }
    else if (e.e === 'late') { SFX.late(); banner('Too slow!', '#c8452f', `${STRIKES - sim.strikes} more and the round ends`); S.shake = 6; post('haptic'); }
    else if (e.e === 'over') finish(e.why);
  }
  sim.events.length = 0;
  void t;
}
function finish(why) {
  const sim = S.sim;
  S.mode = 'over'; music(false);
  if (why === 'time') SFX.gong();
  const score = Math.round(sim.score);
  const best = score > S.high;
  if (score > 0 && !S.posted) { S.posted = true; post('score', { score, level: sim.level, round: 1, hero: S.hero, outcome: why }); }
  if (best) S.high = score;
  $('overtitle').textContent = why === 'strikes' ? 'Kitchen closed!' : 'Gochisōsama!';
  $('ovscore').textContent = fmt(score);
  $('ovbest').hidden = !best || score === 0;
  $('ovstats').textContent = `${sim.served} order${sim.served === 1 ? '' : 's'} served · best combo ${sim.bestCombo} · reached belt ${sim.level}`;
  setTimeout(() => { if (S.mode === 'over') { show('over'); $('again').focus(); } }, why === 'quit' ? 0 : 900);
}

function tapAt(x, y, t) {
  if (S.mode !== 'play' || S.paused || !S.sim) return;
  audio();
  const sim = S.sim, r = LAY.diam * 0.58;
  let best = null, bd = Infinity;
  for (const p of sim.plates) {
    if (p.taken || p.s < 0.25) continue;
    const [px, py] = beltAt(p.s), d = Math.hypot(px - x, py - y);
    if (d < r && d < bd) { bd = d; best = p; }
  }
  if (!best) return;
  const [px, py] = beltAt(best.s);
  // where every ticket is before the tap (a served one leaves the list at once)
  const before = sim.orders.map((o) => ({ id: o.id, o: { ...o, items: o.items.map((it) => ({ ...it })) } }));
  const ev = tapPlate(sim, best.id);
  if (!ev) return;
  // tapPlate may push a catch and then a served; handle them here (level/late/over in handleEvents)
  const evs = sim.events.filter((e) => ['catch', 'served', 'wrong', 'wasabi', 'lucky'].includes(e.e));
  sim.events = sim.events.filter((e) => !evs.includes(e));
  for (const e of evs) {
    if (e.e === 'catch') {
      SFX.tok(); post('haptic');
      const was = before.findIndex((b) => b.id === e.order), count = was >= 0 ? before[was].o.items.length : 3;
      S.fly.push({ type: best.type, gold: best.gold, x: px, y: py, t: 0, order: e.order, slot: e.slot,
        to: () => {
          const i = sim.orders.findIndex((o) => o.id === e.order);
          const [x, y, icon] = slotXY(i >= 0 ? i : Math.max(0, was), e.slot, count);
          const l = S.leaving.find((q) => q.o.id === e.order);
          return [x, y - (l ? l.t * 60 : 0), icon];
        } });
      say(`+${e.pts}`, px, py - LAY.diam * 0.4, e.gold ? '#9a6b12' : '#2b231b', e.gold ? 24 : 19);
      if (e.gold) burst(px, py, 14, ['#ffd25e', '#fff2b8'], 'star');
      if (e.triple) { banner('Triple!', '#9a6b12', '+300'); SFX.combo(); }
      else if (e.combo > 0 && e.combo % 4 === 0) { SFX.combo(); }
    } else if (e.e === 'served') {
      SFX.served(); post('haptic');
      const was = before.findIndex((b) => b.id === e.id);
      if (was >= 0) { const o = before[was].o; o.items.forEach((it) => { it.filled = true; }); S.leaving.push({ o, i: was, t: 0 }); }
      say(`Order up! +${e.pts}`, W / 2, LAY.hud + LAY.tH + 26, '#4a7256', 18);
      S.tickets.delete(e.id);
    } else if (e.e === 'wrong') {
      SFX.wrong(); best.wob = t; say('Not ordered · −3s', px, py - LAY.diam * 0.4, '#c8452f', 16);
    } else if (e.e === 'wasabi') {
      SFX.wasabi(); post('haptic'); S.shake = 10; banner('Too hot!', '#3f7d2a', '−5 seconds');
      burst(px, py, 18, ['#8fcf5a', '#5fa83a', '#c8ef9a']);
    } else if (e.e === 'lucky') {
      SFX.lucky(); post('haptic'); burst(px, py, 24, ['#ffd25e', '#fff2b8', '#ff8a8a'], 'star');
      say(`+${e.pts}`, px, py - LAY.diam * 0.4, '#9a6b12', 26);
      if (!S.night) { S.night = true; post('unlock', { key: 'night' }); banner('Lucky cat!', '#9a6b12', 'Late-night counter unlocked', 2.2); }
      else banner('Lucky cat!', '#9a6b12', '+1,000');
    }
  }
  if (sim.over && S.mode === 'play') handleEvents(t);
}

// ---- screens ---------------------------------------------------------------------------------
const VEILS = ['seat', 'tips', 'pause', 'over'];
function show(id) { for (const v of VEILS) $(v).classList.toggle('show', v === id); }
function buildSeats() {
  const box = $('seats'); box.innerHTML = '';
  for (const h of HEROES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'alt'; b.textContent = NAME(h);
    b.dataset.hero = h; b.setAttribute('aria-pressed', String(h === S.hero));
    b.addEventListener('click', () => { S.hero = h; for (const x of box.children) x.setAttribute('aria-pressed', String(x.dataset.hero === h)); audio(); SFX.tok(); });
    box.appendChild(b);
  }
  const c = $('counter'); c.hidden = !S.night; c.textContent = `Counter: ${S.counter === 'night' ? 'late night' : 'by day'}`;
}
function toSeat() { S.mode = 'seat'; S.paused = false; music(false); buildSeats(); show('seat'); $('start').focus(); }
function begin() {
  post('seat', { hero: S.hero, counter: S.counter });
  if (S.tips) { S.mode = 'tips'; show('tips'); $('gotit').focus(); return; }
  show(null); startCountdown();
}
function pause(on) {
  if (S.mode !== 'play' && S.mode !== 'ready') return;
  S.paused = on; duck(on); show(on ? 'pause' : null);
  if (on) { syncSwitches(); $('resume').focus(); }
}
function syncSwitches() { $('psound').textContent = `Sound: ${isMuted() ? 'off' : 'on'}`; $('pmusic').textContent = `Music: ${isMusicOn() ? 'on' : 'off'}`; }
function leave() {
  if ((S.mode === 'play' || S.mode === 'ready') && S.sim && S.sim.score > 0 && !S.posted) {
    S.posted = true; post('score', { score: Math.round(S.sim.score), level: S.sim.level, round: 1, hero: S.hero, outcome: 'quit' });
  }
  music(false); post('exit');
}

$('start').addEventListener('click', () => { audio(); begin(); });
$('counter').addEventListener('click', () => { S.counter = S.counter === 'night' ? 'day' : 'night'; buildSeats(); $('counter').focus(); });
$('seatleave').addEventListener('click', leave);
$('gotit').addEventListener('click', () => { S.tips = false; post('tips-seen'); show(null); startCountdown(); });
$('pausebtn').addEventListener('click', () => pause(!S.paused));
$('resume').addEventListener('click', () => pause(false));
$('psound').addEventListener('click', () => { setMuted(!isMuted()); syncSwitches(); });
$('pmusic').addEventListener('click', () => { setMusic(!isMusicOn()); syncSwitches(); });
$('restart').addEventListener('click', () => { S.paused = false; duck(false); show(null); startCountdown(); });
$('exit').addEventListener('click', leave);
$('again').addEventListener('click', () => { show(null); startCountdown(); });
$('change').addEventListener('click', toSeat);
$('overleave').addEventListener('click', leave);
stage.addEventListener('pointerdown', (e) => {
  if (e.target !== cv) return;
  const r = cv.getBoundingClientRect(); tapAt(e.clientX - r.left, e.clientY - r.top, performance.now() / 1000);
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') pause(!S.paused); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
window.addEventListener('resize', layout);

// ---- the loop --------------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000, w0 = performance.now();
  if (LAY) {
    if (S.mode === 'ready' && !S.paused) {
      S.readyT += dt;
      const n = Math.ceil(3 - S.readyT);
      if (n !== S.lastCount) { S.lastCount = n; if (n >= 1) SFX.count(false); else SFX.count(true); }
      if (S.readyT >= 3.6) S.mode = 'play';
    }
    if (S.mode === 'play' && !S.paused && S.sim) {
      let left = dt;
      while (left > 1e-6) { const h = Math.min(1 / 60, left); stepSim(S.sim, h); left -= h; }
      S.belt += LEVELS[S.sim.level - 1].speed * LAY.diam * dt;
      handleEvents(t);
    } else if (S.mode === 'seat' || S.mode === 'tips' || S.mode === 'loading') S.belt += 0.6 * LAY.diam * dt;
    render(t, S.paused ? 0 : dt);
  }
  const ms = performance.now() - w0;
  S.perf.avg = S.perf.avg * 0.95 + ms * 0.05; S.perf.worst = Math.max(S.perf.worst, ms);
  requestAnimationFrame(frame);
}

// ---- for the tests ---------------------------------------------------------------------------
const hook = {
  get mode() { return S.mode; }, get paused() { return S.paused; }, get hero() { return S.hero; }, get counter() { return S.counter; }, get night() { return S.night; },
  get score() { return S.sim ? S.sim.score : 0; }, get time() { return S.sim ? S.sim.time : ROUND; }, get level() { return S.sim ? S.sim.level : 1; },
  get combo() { return S.sim ? S.sim.combo : 0; }, get strikes() { return S.sim ? S.sim.strikes : 0; }, get served() { return S.sim ? S.sim.served : 0; },
  get orders() { return S.sim ? S.sim.orders.map((o) => ({ id: o.id, patience: o.patience, items: o.items.map((it) => ({ ...it })) })) : []; },
  get wanted() { return S.sim ? wanted(S.sim) : {}; },
  get music() { return musicState(); }, get high() { return S.high; },
  /** Plates on the belt, with where they are on the screen (CSS px in this page). */
  plates() { return S.sim ? S.sim.plates.filter((p) => !p.taken && p.s >= 0.25).map((p) => { const [x, y] = beltAt(p.s); return { id: p.id, type: p.type, gold: p.gold, x, y, r: LAY.diam / 2 }; }) : []; },
  /** Headless rounds with a perfect bot (fairness: no ticket ever runs out on a quick player). */
  simulate: (seed, reaction) => simulate(seed, LAY ? LAY.len : 22, { reaction: reaction ?? 0.4 }),
  perf: () => ({ ...S.perf }),
  types: Object.keys(TYPES),
};
if (DEBUG) hook.debug = {
  calm: (on = true) => { if (S.sim) S.sim.calm = on; },
  skip: () => { if (S.mode === 'ready') S.readyT = 3.6; },
  /** A plate `ahead` diameters along the belt. */
  spawn: (type, { gold = false, at = 2 } = {}) => { if (!S.sim) return null; const p = { id: S.sim.nextId++, type, gold, s: at, taken: false }; S.sim.plates.push(p); return p.id; },
  clear: () => { if (S.sim) { S.sim.plates = []; } },
  order: (types) => { if (!S.sim) return; const L = LEVELS[S.sim.level - 1]; S.sim.orders = [{ id: S.sim.nextId++, items: types.map((type) => ({ type, filled: false })), patience: L.patience, max: L.patience, born: S.sim.t }]; S.sim.orderCool = 999; },
  setTime: (s) => { if (S.sim) S.sim.time = s; },
  setT: (s) => { if (S.sim) S.sim.t = s; },
  expire: () => { if (S.sim && S.sim.orders[0]) S.sim.orders[0].patience = 0; },
  pause: (on) => pause(on),
};
window.__sushi = hook;

// ---- start -----------------------------------------------------------------------------------
layout();
requestAnimationFrame(frame);
loadArt().then((imgs) => { art = imgs; buildSeats(); toSeat(); post('ready'); });
