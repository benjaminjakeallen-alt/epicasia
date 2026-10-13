// Draws the sewer level (sewer.js) on the HUD canvas: a 2D underground
// side-scroller in the game's chunky style — brick walls and lamps, stone
// floors over sludge pits, brick ledges, green pipes, coins, rats, and a
// little 2D version of whoever you're playing.
import { LEVEL, PW, PH, ratAt, RAT_W, RAT_H, featherAt } from './sewer.js';

// Each traveller in 2D: skin, hair (null = bald), top, trousers, glasses.
const LOOK2D = {
  chris: { skin: '#f2c3a0', hair: null, top: '#6f93e0', legs: '#7d838c' },
  bennett: { skin: '#f3cbb0', hair: '#8a5a33', top: '#6b4226', band: '#c4502a', legs: '#8fb0d3' },
  emily: { skin: '#f6d2b8', hair: '#c2531f', big: true, top: '#3d7cae', legs: '#3d7cae' },
  miles: { skin: '#f4cfb6', hair: '#936a43', top: '#1f5a3c', legs: '#2f3a4f', glasses: '#3a2618', tall: true },
  nicole: { skin: '#f4cfb6', hair: '#c8682f', big: true, top: '#b4532a', legs: '#9cb9dc', glasses: '#8fd0cc' },
  jake: { skin: '#f2c1a3', hair: null, top: '#8f959c', legs: '#2a2d33', glasses: '#17181b' },
  liam: { skin: '#f4cdb4', hair: '#9a6c40', top: '#1d2027', legs: '#1d2027', headband: '#d62c2c' },
};

/** world = false: the 3D sewer (sewer3d.js) draws the level; only the HUD is drawn here. */
export function drawSewer(ctx, view, u, sw, S, text, round, world = true) {
  const s = sw.s, W = view.cw, H = view.ch;
  if (!world) { hudOnly(ctx, view, u, s, text, round); return; }
  const T = Math.min(W / 9, H / 11); // one tile in px
  const floorY = H * 0.62; // (the pad sits under the floor)
  // The camera follows like Mario 3's: you stay in a band left of centre,
  // and it scrolls back when you run back.
  const span = W / T;
  sw.cam = Math.max(LEVEL.FLOORS[0][0], Math.min(LEVEL.LENGTH - span, Math.max(s.x - span * 0.32, Math.min(sw.cam, s.x - span * 0.22))));
  const camX = sw.cam;
  const X = (x) => (x - camX) * T, Y = (y) => floorY - y * T;
  const t = s.t;

  // the far wall: dark bricks with a little parallax, warm lamps
  ctx.fillStyle = '#121824'; ctx.fillRect(0, 0, W, H);
  const bw = 2 * T, bh = T * 0.8, off = -(camX * T * 0.5) % bw;
  for (let row = 0; row * bh < H; row++) {
    for (let x = off - bw + (row % 2) * bw * 0.5; x < W + bw; x += bw) {
      ctx.fillStyle = (row * 7 + Math.floor((x - off) / bw)) % 5 === 0 ? '#1f2939' : '#1a2331';
      ctx.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
    }
  }
  for (let lx = Math.floor(camX / 12) * 12 + 6; lx < camX + W / T + 12; lx += 12) {
    const px = (lx - camX) * T * 0.5 + W * 0.25, py = Y(LEVEL.CEILING - 0.6);
    const g = ctx.createRadialGradient(px, py, 2, px, py, T * 2.6);
    g.addColorStop(0, 'rgba(255,214,120,0.38)'); g.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = g; ctx.fillRect(px - T * 3, py - T * 3, T * 6, T * 6);
    ctx.fillStyle = '#ffd77a'; ctx.beginPath(); ctx.arc(px, py, T * 0.16, 0, Math.PI * 2); ctx.fill();
  }
  // ceiling, with drips
  ctx.fillStyle = '#2a3446'; ctx.fillRect(0, 0, W, Y(LEVEL.CEILING));
  ctx.fillStyle = '#36435a';
  for (let x = Math.floor(camX) - 1; x < camX + W / T + 1; x++) ctx.fillRect(X(x) + 1, Y(LEVEL.CEILING) - T * 0.35, T - 2, T * 0.35);
  for (let i = 0; i < 6; i++) {
    const dx = Math.floor(camX) + ((i * 37) % 11) + 0.5, k = (t * 0.7 + i * 0.37) % 1;
    ctx.fillStyle = 'rgba(140,200,160,0.6)';
    ctx.fillRect(X(dx), Y(LEVEL.CEILING) + k * (floorY - Y(LEVEL.CEILING)), T * 0.07, T * 0.18);
  }
  // sludge in the pits
  const sl = Y(-0.7);
  ctx.fillStyle = '#5b3a1e'; ctx.fillRect(0, sl, W, H - sl);
  ctx.fillStyle = '#7a5230';
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 6) ctx.lineTo(x, sl + Math.sin(x / 18 + t * 3) * T * 0.06);
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(160,112,60,0.7)';
  for (let i = 0; i < 8; i++) { const bx = ((i * 97 + t * 25) % (W + 40)) - 20; ctx.beginPath(); ctx.arc(bx, sl + T * 0.4 + (i % 3) * T * 0.3, T * 0.07, 0, Math.PI * 2); ctx.fill(); }

  // floors: stone tiles
  LEVEL.FLOORS.forEach(([a, b]) => {
    if (X(b) < 0 || X(a) > W) return;
    ctx.fillStyle = '#3a4757'; ctx.fillRect(X(a), Y(0), (b - a) * T, H - Y(0));
    for (let x = Math.floor(a); x < b; x++) { // one stone per tile, cut off at the floor's ends
      const x0 = Math.max(a, x), w = Math.min(b, x + 1) - x0;
      ctx.fillStyle = (x % 2) ? '#5d7287' : '#566b7d';
      ctx.fillRect(X(x0) + 1, Y(0), w * T - 2, T * 0.9);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(X(x0) + 1, Y(0), w * T - 2, T * 0.12);
    }
    ctx.fillStyle = '#2a3442';
    for (let r = 1; Y(-r) < H; r++) for (let x = Math.floor(a) + (r % 2) * 0.5; x < b; x++) ctx.fillRect(X(Math.max(a, x)), Y(-r) + T * 0.04, 2, T * 0.9);
  });
  // brick ledges
  LEVEL.BRICKS.forEach(([x, , bot, top], i) => {
    if (s.broken[i]) return;
    {
      const bx = X(x), by = Y(top), bh2 = (top - bot) * T;
      ctx.fillStyle = '#b5562b'; ctx.fillRect(bx, by, T, bh2);
      ctx.fillStyle = '#7a3416'; ctx.fillRect(bx, by + bh2 / 2 - 1, T, 2); ctx.fillRect(bx + T / 2 - 1, by, 2, bh2 / 2); ctx.fillRect(bx, by, 2, bh2);
      ctx.fillStyle = 'rgba(255,220,180,0.25)'; ctx.fillRect(bx, by, T, 3);
    }
  });
  // feathers
  s.feathers.forEach((f) => {
    if (f.got) return;
    const p = featherAt(f, t);
    ctx.save(); ctx.translate(X(p.x), Y(p.y)); ctx.rotate(p.tilt);
    ctx.fillStyle = '#f7dca0'; ctx.beginPath(); ctx.ellipse(0, 0, T * 0.16, T * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f08c2a'; ctx.beginPath(); ctx.ellipse(0, -T * 0.3, T * 0.1, T * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
  // pipes (the end pipe is drawn after the player, so you sink into it)
  const pipe = (x, w, h, big) => {
    const px = X(x), py = Y(h), ph = h * T;
    ctx.fillStyle = '#2b8a3e'; ctx.fillRect(px + T * 0.1, py + T * 0.4, w * T - T * 0.2, ph - T * 0.4);
    ctx.fillStyle = '#69db7c'; ctx.fillRect(px + T * 0.3, py + T * 0.4, T * 0.18, ph - T * 0.4);
    ctx.fillStyle = '#1e5f2b'; ctx.fillRect(px + w * T - T * 0.32, py + T * 0.4, T * 0.22, ph - T * 0.4);
    round(px - T * 0.08, py, w * T + T * 0.16, T * 0.45, T * 0.08, '#37b24d', '#1e5f2b', 1.5);
    ctx.fillStyle = '#8ce99a'; ctx.fillRect(px + T * 0.2, py + T * 0.08, T * 0.18, T * 0.28);
    if (big) { ctx.fillStyle = '#0b1a10'; ctx.fillRect(px + T * 0.15, py - 1, w * T - T * 0.3, T * 0.12); }
  };
  LEVEL.PIPES.forEach(([x, w, h]) => { if (X(x + w) > 0 && X(x) < W) pipe(x, w, h, false); });

  // coins
  LEVEL.COINS.forEach(([cx, cy], i) => {
    if (s.coins[i] || X(cx) < -T || X(cx) > W + T) return;
    const k = Math.abs(Math.cos(t * 4 + i));
    ctx.fillStyle = '#f59f00'; ctx.beginPath(); ctx.ellipse(X(cx), Y(cy), T * 0.26 * Math.max(0.15, k), T * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.ellipse(X(cx), Y(cy), T * 0.18 * Math.max(0.1, k), T * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  });
  // rats
  LEVEL.RATS.forEach((_, i) => {
    if (!s.rats[i]) return;
    const r = ratAt(i, t), rx = X(r.x), ry = Y(0);
    if (rx < -T * 2 || rx > W + T) return;
    const f = r.dir, cx = rx + RAT_W * T / 2, step = Math.sin(t * 16 + i) * T * 0.06;
    ctx.strokeStyle = '#e599a7'; ctx.lineWidth = T * 0.06; ctx.beginPath();
    ctx.moveTo(cx - f * RAT_W * T * 0.45, ry - T * 0.25); ctx.quadraticCurveTo(cx - f * RAT_W * T * 0.95, ry - T * 0.6, cx - f * RAT_W * T * 1.05, ry - T * 0.2); ctx.stroke();
    ctx.fillStyle = '#7d8590'; ctx.beginPath(); ctx.ellipse(cx, ry - RAT_H * T * 0.5, RAT_W * T * 0.5, RAT_H * T * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5c636d'; ctx.beginPath(); ctx.arc(cx + f * T * 0.12, ry - RAT_H * T * 0.95, T * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e599a7'; ctx.beginPath(); ctx.arc(cx + f * RAT_W * T * 0.52, ry - RAT_H * T * 0.45, T * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff3b3b'; ctx.fillRect(cx + f * RAT_W * T * 0.28 - T * 0.03, ry - RAT_H * T * 0.68, T * 0.07, T * 0.07);
    ctx.fillStyle = '#4a5059'; ctx.fillRect(cx - T * 0.25 + step, ry - T * 0.08, T * 0.1, T * 0.08); ctx.fillRect(cx + T * 0.15 - step, ry - T * 0.08, T * 0.1, T * 0.08);
  });

  // you
  const L = LOOK2D[S.hero] || LOOK2D.chris;
  let py = s.y, rot = 0;
  if (s.dead !== null) { const k = s.t - s.dead; py = s.y + 2.5 * k - 9 * k * k; rot = Math.min(Math.PI, k * 6); }
  if (s.done !== null) py = s.y - Math.min(PH + 0.2, (s.t - s.done) * 1.6); // down the pipe
  const pw = PW * T, ph = PH * T * (L.tall ? 1.08 : 1), x0 = X(s.x), y0 = Y(py);
  ctx.save(); ctx.translate(x0 + pw / 2, y0 - ph / 2); ctx.rotate(rot); ctx.scale(s.face, 1);
  if (s.skid) ctx.rotate(-0.18); // leaning back into a skid
  ctx.translate(-pw / 2, ph / 2);
  const run = s.ground && s.dead === null && Math.abs(s.vx) > 0.3 ? Math.sin(s.stride * 2.6) : 0, air = !s.ground;
  ctx.fillStyle = L.legs;
  ctx.fillRect(pw * 0.14 + (air ? -pw * 0.08 : run * pw * 0.12), -ph * 0.4, pw * 0.3, ph * 0.4);
  ctx.fillRect(pw * 0.56 + (air ? pw * 0.1 : -run * pw * 0.12), -ph * 0.4 - (air ? ph * 0.06 : 0), pw * 0.3, ph * 0.4);
  if (s.suit) { // the tanuki suit's striped tail
    ctx.save(); ctx.translate(0, -ph * 0.5); ctx.rotate(s.wagT > 0 ? Math.sin(t * 40) * 0.8 : 0.4);
    ctx.fillStyle = '#b07440'; ctx.fillRect(-pw * 0.7, -ph * 0.06, pw * 0.75, ph * 0.13);
    ctx.fillStyle = '#4a2f1a'; ctx.fillRect(-pw * 0.5, -ph * 0.06, pw * 0.1, ph * 0.13); ctx.fillRect(-pw * 0.25, -ph * 0.06, pw * 0.1, ph * 0.13);
    ctx.restore();
  }
  ctx.fillStyle = s.suit ? '#b07440' : L.top; ctx.fillRect(pw * 0.06, -ph * 0.74, pw * 0.88, ph * 0.38);
  if (L.band) { ctx.fillStyle = L.band; ctx.fillRect(pw * 0.06, -ph * 0.48, pw * 0.88, ph * 0.05); }
  ctx.fillStyle = L.skin; ctx.fillRect(pw * 0.78, -ph * 0.66 - (air ? ph * 0.18 : 0), pw * 0.2, ph * 0.22); // a hand (up when jumping)
  ctx.fillStyle = L.skin; ctx.fillRect(pw * 0.08, -ph, pw * 0.84, ph * 0.3); // head
  if (L.hair) { ctx.fillStyle = L.hair; ctx.fillRect(pw * (L.big ? -0.04 : 0.06), -ph * 1.04, pw * (L.big ? 1.08 : 0.88), ph * 0.11); ctx.fillRect(pw * (L.big ? -0.04 : 0.06), -ph, pw * 0.2, ph * (L.big ? 0.3 : 0.14)); }
  else { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(pw * 0.3, -ph * 0.98, pw * 0.25, ph * 0.04); } // a shiny scalp
  if (L.headband) { // a ninja's headband, its tail flying out behind
    ctx.fillStyle = L.headband; ctx.fillRect(pw * 0.04, -ph * 0.95, pw * 0.92, ph * 0.06);
    ctx.fillRect(-pw * 0.3, -ph * 0.94 + Math.sin(s.t * 14) * ph * 0.02, pw * 0.36, ph * 0.035);
  }
  ctx.fillStyle = '#1b1d22'; ctx.fillRect(pw * 0.66, -ph * 0.88, pw * 0.1, ph * 0.06); // eye (facing right)
  if (L.glasses) { ctx.strokeStyle = L.glasses; ctx.lineWidth = Math.max(1.5, T * 0.04); ctx.strokeRect(pw * 0.56, -ph * 0.92, pw * 0.3, ph * 0.12); }
  ctx.fillStyle = '#b44a4f'; ctx.fillRect(pw * 0.62, -ph * 0.78, pw * 0.2, ph * 0.03);
  ctx.restore();

  pipe(LEVEL.EXIT.x, LEVEL.EXIT.w, LEVEL.EXIT.h, true);
  if (s.done === null) { // a glint on the way out
    const gx = X(LEVEL.EXIT.x + LEVEL.EXIT.w / 2), gy = Y(LEVEL.EXIT.h) - T * 0.5 - Math.abs(Math.sin(t * 3)) * T * 0.3;
    ctx.fillStyle = 'rgba(255,240,170,0.9)'; ctx.beginPath(); ctx.moveTo(gx, gy - T * 0.25); ctx.lineTo(gx + T * 0.08, gy); ctx.lineTo(gx, gy + T * 0.25); ctx.lineTo(gx - T * 0.08, gy); ctx.closePath(); ctx.fill();
  }

  if (s.skid && s.ground) { // dust from a skid
    ctx.fillStyle = 'rgba(220,220,220,0.6)';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x0 + pw / 2 - s.face * (pw * 0.5 + i * T * 0.15), Y(0) - T * (0.08 + ((t * 9 + i) % 1) * 0.2), T * 0.08, 0, Math.PI * 2); ctx.fill(); }
  }
  hudOnly(ctx, view, u, s, text, round);
}

// the HUD: where you are, coins, and how to jump
function hudOnly(ctx, view, u, s, text, round) {
  const W = view.cw, H = view.ch, t = s.t;
  const top = 16 * u + (view.safeTop || 0);
  round(14 * u, top, W - 92 * u, 46 * u, 23 * u, 'rgba(12,20,44,0.78)', 'rgba(255,255,255,0.25)', 1);
  text('UNDERGROUND', 32 * u, top + 16 * u, 10, '#8ce99a', { align: 'left', stroke: false });
  text('● ' + s.got, 32 * u, top + 32 * u, 13, '#ffd43b', { align: 'left', stroke: false });
  const bx = 92 * u, bw2 = W - 92 * u - 120 * u, prog = Math.max(0, Math.min(1, s.x / LEVEL.EXIT.x));
  round(bx, top + 25 * u, bw2, 8 * u, 4 * u, 'rgba(255,255,255,0.2)');
  round(bx, top + 25 * u, Math.max(8 * u, bw2 * prog), 8 * u, 4 * u, '#69db7c');
  ctx.fillStyle = '#37b24d'; ctx.fillRect(bx + bw2 - 6 * u, top + 17 * u, 10 * u, 22 * u);
  if (t < 4 && s.dead === null) text('HOLD JUMP TO JUMP HIGHER', W / 2, H * 0.3, 15, '#ffffff', { lw: 3.5 });
  if (s.dead !== null) text(s.y < -1 ? 'SPLOSH!' : 'THE RATS GOT YOU!', W / 2, H * 0.3, 26, '#ff8787', { lw: 6 });
  if (s.done !== null) text('DOWN THE PIPE!', W / 2, H * 0.3, 24, '#8ce99a', { lw: 6 });
}
