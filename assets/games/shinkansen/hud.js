// HUD and screens for Shinkansen Dash, drawn on a 2D canvas over the 3D
// scene in CSS pixels (scaled for the device). Chunky rounded type with a
// dark outline, like Godzilla Rampage's.

const FONT = '"Avenir Next", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const INK = 'rgba(12,20,44,0.92)';
const SHORT = ['TOKYO', 'FIELDS', 'FUJI', 'TEA', 'KYOTO'];

export function createHud(canvas, game, view, toScreen, LINEUP) {
  const { S, ROOF, STAGES, STAGE_LEN } = game;
  const ctx = canvas.getContext('2d');
  let u = 1; // one design unit (a 360-wide phone = 1)

  function text(s, x, y, px, fill, opts = {}) {
    ctx.font = `${opts.weight || 900} ${px * u}px ${FONT}`;
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = 'middle';
    if (opts.depth) { ctx.fillStyle = opts.depthColor || INK; for (let i = opts.depth; i > 0; i -= 0.5) ctx.fillText(s, x, y + i * u); }
    if (opts.stroke !== false) { ctx.lineJoin = 'round'; ctx.lineWidth = (opts.lw || px * 0.26) * u; ctx.strokeStyle = opts.stroke || INK; ctx.strokeText(s, x, y); }
    ctx.fillStyle = fill; ctx.fillText(s, x, y);
  }
  function round(x, y, w, h, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = (lw || 1) * u; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  const pad6 = (n) => String(Math.max(0, n | 0)).padStart(6, '0');
  function onigiri(x, y, s) { // a little rice-ball icon
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x + s * 1.1, y + s * 0.9, x, y + s * 0.8); ctx.quadraticCurveTo(x - s * 1.1, y + s * 0.9, x, y - s);
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.2 * u; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#1f3d2b'; ctx.fillRect(x - s * 0.45, y + s * 0.15, s * 0.9, s * 0.62);
  }

  function topBar() {
    const W = view.cw, top = 8 * u, right = W - 62 * u; // leaves the pause button its corner
    round(8 * u, top, right - 8 * u, 50 * u, 16 * u, 'rgba(12,20,44,0.5)');
    text('SCORE', 20 * u, top + 13 * u, 9, '#a5d8ff', { align: 'left', stroke: false });
    text(pad6(S.score), 20 * u, top + 32 * u, 20, '#ffffff', { align: 'left', lw: 3 });
    onigiri(right - 70 * u, top + 22 * u, 8 * u);
    text(String(S.coins), right - 58 * u, top + 23 * u, 16, '#ffffff', { align: 'left', lw: 3 });
    text(Math.floor(S.dist) + ' m', right - 14 * u, top + 40 * u, 9, '#ffe066', { align: 'right', lw: 2 });
    // the route: Tokyo → Kyoto, with this round's progress
    const y = top + 66 * u, x0 = 22 * u, x1 = W - 22 * u;
    const prog = ((S.dist / STAGE_LEN) % 5) / 5;
    round(x0, y - 3 * u, x1 - x0, 6 * u, 3 * u, 'rgba(12,20,44,0.45)');
    round(x0, y - 3 * u, Math.max(6 * u, (x1 - x0) * prog), 6 * u, 3 * u, '#4dabf7');
    for (let i = 0; i < 5; i++) {
      const x = x0 + ((x1 - x0) * i) / 4, past = i <= S.stage;
      ctx.beginPath(); ctx.arc(x, y, 5 * u, 0, Math.PI * 2);
      ctx.fillStyle = past ? '#ffffff' : 'rgba(255,255,255,0.45)'; ctx.fill();
      ctx.lineWidth = 1.5 * u; ctx.strokeStyle = INK; ctx.stroke();
      text(SHORT[i], x, y + 13 * u, 7.5, past ? '#ffffff' : 'rgba(255,255,255,0.7)', { lw: 2 });
    }
    const mx = x0 + (x1 - x0) * prog;
    round(mx - 9 * u, y - 7 * u, 18 * u, 14 * u, 7 * u, '#ffffff', INK, 1.5);
    ctx.fillStyle = '#1f4fb5'; ctx.fillRect(mx - 6 * u, y + 1 * u, 12 * u, 2 * u);
    if (S.lap > 0) text('ROUND ' + (S.lap + 1), W / 2, top + 13 * u, 8, '#ffe066', { stroke: false });
    if (S.shield) {
      round(W / 2 - 46 * u, top + 96 * u, 92 * u, 22 * u, 11 * u, 'rgba(255,212,59,0.92)', INK, 1.5);
      text('LUCKY CAT', W / 2, top + 107.5 * u, 10, '#3b2a00', { stroke: false });
    }
  }

  function messages() {
    let y = view.ch * 0.36;
    S.msgs.slice(-2).forEach((m) => {
      const age = m.d - m.t;
      if (m.t < 0.3 && Math.floor(m.t * 20) % 2) return;
      const pop = age < 0.18 ? 0.6 + (age / 0.18) * 0.5 : 1;
      const px = m.big ? 34 : 18;
      ctx.save(); ctx.translate(view.cw / 2, y); ctx.scale(pop, pop);
      ctx.font = `900 ${px * u}px ${FONT}`;
      const fit = Math.min(1, (view.cw - 30 * u) / ctx.measureText(m.txt).width);
      text(m.txt, 0, 0, px * fit, m.col, { depth: m.big ? 2.5 : 1.5 });
      ctx.restore();
      y += (px + 14) * u;
    });
    S.pops.forEach((p) => {
      const q = toScreen(game.LANES[p.x], p.y, S.dist - p.d);
      if (!q.behind) text(p.txt, q.x, q.y, 13, '#ffffff', { lw: 3 });
    });
  }

  function select() {
    const W = view.cw, H = view.ch;
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.3);
    g.addColorStop(0, 'rgba(12,20,44,0.45)'); g.addColorStop(1, 'rgba(12,20,44,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.3);
    const wob = Math.sin(S.t * 2.4) * 1.5 * u;
    text('SHINKANSEN', W / 2, 56 * u + wob, 40, '#ffffff', { depth: 3.5, depthColor: '#1f4fb5', lw: 8 });
    text('DASH', W / 2, 100 * u - wob, 46, '#ffd43b', { depth: 3.5, depthColor: '#b5431f', lw: 9 });
    if (Math.floor(S.t * 2.5) % 2) text('CHOOSE YOUR TRAVELER', W / 2, 140 * u, 14, '#ffffff', { lw: 3.5 });
    // names under the line-up
    game.ROSTER.forEach((k, i) => {
      const q = toScreen(LINEUP[i], ROOF - 0.2, 0), on = S.sel === i;
      const name = game.HEROES[k].name, w = (name.length * 9 + 18) * u;
      round(q.x - w / 2, q.y, w, 24 * u, 12 * u, on ? '#ffd43b' : 'rgba(12,20,44,0.72)', on ? INK : 'rgba(255,255,255,0.5)', on ? 2 : 1);
      text(name, q.x, q.y + 12.5 * u, 11, on ? '#2b1d00' : '#ffffff', { stroke: false });
    });
    const by = H - 92 * u;
    round(W / 2 - 110 * u, by, 220 * u, 30 * u, 15 * u, 'rgba(12,20,44,0.6)');
    text('HIGH SCORE ' + pad6(S.hi), W / 2, by + 15.5 * u, 13, '#ffffff', { stroke: false });
    text('TAP A TRAVELER TO START', W / 2, by + 52 * u, 13, '#ffffff', { lw: 3.5 });
  }

  function ready() {
    const k = S.modeT, n = 3 - Math.floor(k / 0.8);
    if (n >= 1 && n <= 3) {
      const f = (k % 0.8) / 0.8, s = 1.4 - f * 0.4;
      ctx.save(); ctx.translate(view.cw / 2, view.ch * 0.36); ctx.scale(s, s);
      text(String(n), 0, 0, 80, '#ffffff', { depth: 4, depthColor: '#1f4fb5', lw: 12 });
      ctx.restore();
    }
    const y = view.ch - 150 * u, W = view.cw;
    round(24 * u, y, W - 48 * u, 98 * u, 20 * u, 'rgba(12,20,44,0.62)');
    text('SWIPE  ◀ ▶  HOP TRAINS', W / 2, y + 22 * u, 14, '#ffffff', { stroke: false });
    text('SWIPE  ▲  JUMP', W / 2, y + 48 * u, 14, '#ffe066', { stroke: false });
    text('SWIPE  ▼  SLIDE', W / 2, y + 74 * u, 14, '#a5d8ff', { stroke: false });
  }

  function gameOver() {
    const W = view.cw, H = view.ch;
    ctx.fillStyle = 'rgba(10,16,36,0.55)'; ctx.fillRect(0, 0, W, H);
    const bob = Math.sin(S.t * 3) * 2 * u;
    text('GAME OVER', W / 2, H * 0.22 + bob, 44, '#ff6b6b', { depth: 3, depthColor: '#5c0f1f', lw: 9 });
    const reached = STAGES[S.lap > 0 ? 4 : S.maxStage].name;
    text('REACHED ' + reached + (S.lap > 0 ? ' · ROUND ' + (S.lap + 1) : ''), W / 2, H * 0.22 + 44 * u, 13, '#ffffff', { lw: 3 });
    round(W / 2 - 120 * u, H * 0.34, 240 * u, 128 * u, 22 * u, 'rgba(12,20,44,0.7)', 'rgba(255,255,255,0.25)', 1);
    text('SCORE', W / 2, H * 0.34 + 22 * u, 11, '#a5d8ff', { stroke: false });
    text(String(S.score), W / 2, H * 0.34 + 50 * u, 34, '#ffffff', { lw: 5 });
    text(Math.floor(S.dist) + ' m  ·  ' + S.coins + ' ONIGIRI', W / 2, H * 0.34 + 84 * u, 12, '#ffe066', { stroke: false });
    if (S.score >= S.hi && S.score > 0) text('NEW HIGH SCORE!', W / 2, H * 0.34 + 108 * u, 13, '#69db7c', { stroke: false });
    else text('BEST ' + S.hi, W / 2, H * 0.34 + 108 * u, 12, '#ffffff', { stroke: false });
  }

  return {
    draw(noGL) {
      u = Math.min(view.cw / 360, view.ch / 620);
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.clearRect(0, 0, view.cw, view.ch);
      if (noGL) { ctx.fillStyle = '#5aa7f5'; ctx.fillRect(0, 0, view.cw, view.ch); }
      if (S.mode === 'select') { select(); return; }
      if (S.mode === 'gameover') { gameOver(); return; }
      topBar();
      if (S.mode === 'ready') ready();
      messages();
    }
  };
}
