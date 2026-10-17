// HUD and title cards for Tug of Wall, on a 2D canvas over the 3D
// scene in CSS pixels. Graffiti-ish type: heavy, outlined in ink with a
// neon fill, like a Sunset Overdrive title.

const FONT = '"Arial Black", "Avenir Next", "Arial Rounded MT Bold", system-ui, sans-serif';
const INK = '#1a0b2e';
const PINK = '#ff2d95', CYAN = '#18e0ff', YELLOW = '#ffe11a';

/** How far along a stretch a point is, 0…1, by the nearest stretch of its route. */
function progress(L, q) {
  const R = L.route;
  let best = 0, bd = Infinity;
  for (let k = 0; k + 1 < R.length; k++) {
    const a = R[k].p, b = R[k + 1].p, ex = b[0] - a[0], ez = b[2] - a[2], l2 = ex * ex + ez * ez || 1;
    const s = Math.max(0, Math.min(1, ((q.x - a[0]) * ex + (q.z - a[2]) * ez) / l2));
    const d = Math.hypot(a[0] + ex * s - q.x, (a[1] + (b[1] - a[1]) * s - q.y) * 0.5, a[2] + ez * s - q.z);
    if (d < bd) { bd = d; best = k + s; }
  }
  return best / (R.length - 1);
}

export function createHud(canvas, game, view, toScreen) {
  const { S, LEVELS, PAR, EMOTES } = game;
  const MEDAL = { gold: ['#ffd23a', '#7a5200'], silver: ['#e3e6ef', '#5a5f70'], bronze: ['#e39a5a', '#6a3412'] };
  const ctx = canvas.getContext('2d');
  let u = 1;

  function text(s, x, y, px, fill, opts = {}) {
    ctx.font = `${opts.weight || 900} ${px * u}px ${FONT}`;
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = 'middle';
    if (opts.depth) { ctx.fillStyle = opts.depthColor || INK; for (let i = opts.depth; i > 0; i -= 0.5) ctx.fillText(s, x + i * u * 0.6, y + i * u); }
    if (opts.stroke !== false) { ctx.lineJoin = 'round'; ctx.lineWidth = (opts.lw || px * 0.28) * u; ctx.strokeStyle = opts.stroke || INK; ctx.strokeText(s, x, y); }
    ctx.fillStyle = fill; ctx.fillText(s, x, y);
  }
  function round(x, y, w, h, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = (lw || 1) * u; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  const clock = (s) => { s = Math.max(0, s); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };

  function topBar(V) {
    const W = view.cw, top = 8 * u, right = W - 62 * u; // leaves the pause button its corner
    const L = LEVELS[V.lv];
    round(8 * u, top, right - 8 * u, 46 * u, 14 * u, 'rgba(26,11,46,0.62)');
    text((V.lv + 1) + ' · ' + L.name.toUpperCase(), 18 * u, top + 14 * u, 10, CYAN, { align: 'left', stroke: false });
    text(clock(V.t), 18 * u, top + 32 * u, 17, '#ffffff', { align: 'left', lw: 3 });
    text('FALLS ' + V.falls, 92 * u, top + 32 * u, 11, V.falls ? PINK : '#ffffff', { align: 'left', lw: 2.4 });
    text(String(S.total).padStart(5, '0'), right - 12 * u, top + 32 * u, 15, YELLOW, { align: 'right', lw: 3 });
    text('SCORE', right - 12 * u, top + 14 * u, 9, '#ffd7f0', { align: 'right', stroke: false });
    // progress along this stretch (along its route): the watchtowers and where everyone is
    const y = top + 58 * u, x0 = 20 * u, x1 = W - 20 * u;
    const X = (q) => x0 + progress(L, q) * (x1 - x0);
    round(x0, y - 3 * u, x1 - x0, 6 * u, 3 * u, 'rgba(26,11,46,0.55)');
    L.checks.forEach((c, k) => {
      ctx.fillStyle = k < V.cp ? YELLOW : 'rgba(255,255,255,0.55)';
      ctx.fillRect(X(c) - 3 * u, y - 8 * u, 6 * u, 10 * u);
      ctx.lineWidth = 1.2 * u; ctx.strokeStyle = INK; ctx.strokeRect(X(c) - 3 * u, y - 8 * u, 6 * u, 10 * u);
    });
    text('🏁', x1, y - 1 * u, 11, '#fff', { stroke: false });
    V.players.forEach((p) => {
      ctx.beginPath(); ctx.arc(X(p), y, (p.me ? 5.5 : 4) * u, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill(); ctx.lineWidth = 1.5 * u; ctx.strokeStyle = INK; ctx.stroke();
    });
  }
  function tags(V) {
    V.players.forEach((p) => {
      const s = toScreen(p.x, p.y + 2.05, p.z);
      if (s.behind) return;
      const label = p.bot ? '🤖 ' + p.name : p.name;
      ctx.font = `900 ${9 * u}px ${FONT}`;
      const w = ctx.measureText(label).width + 12 * u;
      round(s.x - w / 2, s.y - 9 * u, w, 16 * u, 8 * u, 'rgba(26,11,46,0.72)', p.color, 1.6);
      text(label, s.x, s.y - 0.5 * u, 9, p.color, { stroke: false });
      if (p.me) { ctx.beginPath(); ctx.moveTo(s.x - 5 * u, s.y + 8 * u); ctx.lineTo(s.x + 5 * u, s.y + 8 * u); ctx.lineTo(s.x, s.y + 13 * u); ctx.closePath(); ctx.fillStyle = p.color; ctx.fill(); }
      if (p.grab) text('HOLDING!', s.x, s.y - 17 * u, 9, YELLOW, { lw: 2.4 });
      const em = S.emotes[p.i];
      if (em && EMOTES[em.k]) { // a speech bubble, popping in
        const pop = Math.min(1, em.t * 8), fade = Math.min(1, (2.4 - em.t) * 4), by = s.y - (p.grab ? 40 : 30) * u;
        ctx.globalAlpha = fade;
        ctx.font = `900 ${11 * pop * u}px ${FONT}`;
        const bw = ctx.measureText(EMOTES[em.k]).width + 16 * u;
        round(s.x - bw / 2, by - 12 * u * pop, bw, 24 * u * pop, 12 * u * pop, '#ffffff', INK, 2);
        ctx.beginPath(); ctx.moveTo(s.x - 5 * u, by + 11 * u * pop); ctx.lineTo(s.x + 5 * u, by + 11 * u * pop); ctx.lineTo(s.x, by + 18 * u * pop); ctx.closePath();
        ctx.fillStyle = '#ffffff'; ctx.fill();
        text(EMOTES[em.k], s.x, by, 11 * pop, INK, { stroke: false });
        ctx.globalAlpha = 1;
      }
    });
  }
  function messages() {
    S.msgs.forEach((m, k) => {
      const a = Math.min(1, (m.life - m.t) * 3), pop = Math.min(1, m.t * 7);
      ctx.globalAlpha = a;
      text(m.text, view.cw / 2, view.ch * 0.3 + k * 34 * u, 22 * (0.7 + 0.3 * pop), m.color, { depth: 3, lw: 6 });
      ctx.globalAlpha = 1;
    });
  }
  function card(lines, sub) {
    const W = view.cw, H = view.ch;
    ctx.fillStyle = 'rgba(26,11,46,0.35)'; ctx.fillRect(0, 0, W, H);
    lines.forEach(([s, size, col], k) => text(s, W / 2, H * 0.36 + k * size * 1.25 * u, size, col, { depth: 4, lw: size * 0.3 }));
    if (sub) text(sub, W / 2, H * 0.36 + lines.reduce((a, l) => a + l[1] * 1.25, 0) * u + 6 * u, 12, '#ffffff', { lw: 3 });
  }
  /** A medal: a round coin with a ribbon notch, gold, silver or bronze. */
  function medal(kind, x, y, r) {
    const [face, edge] = MEDAL[kind] || MEDAL.bronze;
    ctx.fillStyle = '#ff2d95'; ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 2); ctx.lineTo(x - r * 0.15, y - r * 0.6); ctx.lineTo(x - r * 0.95, y - r * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#18e0ff'; ctx.beginPath(); ctx.moveTo(x + r * 0.7, y - r * 2); ctx.lineTo(x + r * 0.15, y - r * 0.6); ctx.lineTo(x + r * 0.95, y - r * 0.6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = face; ctx.fill(); ctx.lineWidth = 2.2 * u; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.68, 0, Math.PI * 2); ctx.lineWidth = 1.6 * u; ctx.strokeStyle = edge; ctx.stroke();
    text('★', x, y + r * 0.05, r * 0.9 / u, edge, { stroke: false });
  }
  function wrap(s, max) { // the level's one-liner over two lines on a narrow phone
    ctx.font = `900 ${12 * u}px ${FONT}`;
    if (ctx.measureText(s).width < max) return [s];
    const words = s.split(' '), mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }

  /** The first time ever: how to play, under the title, until JUMP. */
  function tips(W, H, t) {
    const y0 = H * 0.36 + 152 * u, lines = [
      ['JOYSTICK', 'WALK · THE CAMERA FOLLOWS'], ['JUMP', 'JUMP · HANGING? TAP TO CLIMB THE ROPE'],
      ['GRAB', 'DIG IN · REEL IN A TEAMMATE BELOW'], ['💬', 'SAY SOMETHING TO THE GANG'],
    ];
    round(16 * u, y0, W - 32 * u, (lines.length * 24 + 34) * u, 16 * u, 'rgba(26,11,46,0.78)', CYAN, 2);
    lines.forEach(([k, v], i) => {
      const y = y0 + (18 + i * 24) * u;
      text(k, 30 * u, y, 11, YELLOW, { align: 'left', lw: 2.6 });
      text(v, 112 * u, y, 9.5, '#ffffff', { align: 'left', stroke: false });
    });
    if (Math.floor(t * 2) % 2) text('PRESS JUMP TO GO', W / 2, y0 + (lines.length * 24 + 20) * u, 12, PINK, { lw: 3 });
  }
  function draw(t) {
    const W = view.cw, H = view.ch;
    u = Math.max(0.85, Math.min(1.6, Math.min(W, H * 0.62) / 360));
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const V = S.view;
    if (S.mode === 'wait' || S.mode === 'lobby') {
      ctx.fillStyle = 'rgba(26,11,46,0.55)'; ctx.fillRect(0, 0, W, H);
      text('TUG OF', W / 2, H * 0.36, 30, PINK, { depth: 4, lw: 9 });
      text('WALL', W / 2, H * 0.36 + 36 * u, 30, YELLOW, { depth: 4, lw: 9 });
      const dots = '.'.repeat(1 + (Math.floor(t * 2) % 3));
      text(S.mode === 'wait' ? 'WAITING FOR THE HOST' + dots : 'WAITING FOR EVERYONE' + dots, W / 2, H * 0.36 + 84 * u, 13, '#ffffff', { lw: 3 });
      return;
    }
    if (S.mode === 'gone') {
      ctx.fillStyle = 'rgba(26,11,46,0.6)'; ctx.fillRect(0, 0, W, H);
      text('THE HOST LEFT', W / 2, H * 0.36, 26, PINK, { depth: 4, lw: 8 });
      text('THE GANG IS BROKEN UP', W / 2, H * 0.36 + 34 * u, 13, '#ffffff', { lw: 3 });
      return;
    }
    if (!V) return;
    tags(V);
    topBar(V);
    messages();
    if (S.stale) text('RECONNECTING…', W / 2, H * 0.22, 14, YELLOW, { lw: 3.5 });
    const L = LEVELS[V.lv];
    if (S.mode === 'title') {
      const k = Math.min(1, S.modeT * 3), out = Math.max(0, S.modeT - 2.3) * 3;
      ctx.globalAlpha = Math.max(0, Math.min(1, k - out));
      card([['STRETCH ' + (V.lv + 1), 16, CYAN], [L.name.toUpperCase(), 28, PINK]]);
      wrap(L.line, W - 40 * u).forEach((s, i) => text(s, W / 2, H * 0.36 + 70 * u + i * 17 * u, 12, '#ffffff', { lw: 3 }));
      text('STAY TOGETHER · HOLD GRAB TO ANCHOR', W / 2, H * 0.36 + 116 * u, 10, YELLOW, { lw: 2.6 });
      if (V.lv === 0) text('PUSH UP TO WALK ON · THE CAMERA FOLLOWS YOU', W / 2, H * 0.36 + 134 * u, 10, CYAN, { lw: 2.6 });
      ctx.globalAlpha = 1;
      if (S.tips && V.lv === 0 && S.net === 'solo') tips(W, H, t);
    } else if (S.mode === 'clear') {
      const s = S.scores[S.scores.length - 1] || { score: 0, time: 0, falls: 0 };
      card([['STRETCH CLEARED!', 24, YELLOW], ['+' + s.score, 30, PINK]],
        clock(s.time) + ' (PAR ' + clock(PAR[V.lv]) + ') · ' + s.falls + (s.falls === 1 ? ' FALL' : ' FALLS'));
      if (s.medal) { // the medal swings in
        const k = Math.min(1, S.modeT * 2.5), r = 22 * u * (0.4 + 0.6 * k), y = H * 0.36 - 58 * u;
        medal(s.medal, W / 2, y, r);
        text(s.medal.toUpperCase(), W / 2, y + r + 12 * u, 11, MEDAL[s.medal][0], { lw: 3 });
      }
    } else if (S.mode === 'finish') {
      const falls = S.scores.reduce((a, q) => a + q.falls, 0);
      card([['THE GANG MADE IT!', 22, YELLOW], [String(S.total), 40, PINK]], 'ALL ' + ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][LEVELS.length - 1] + ' STRETCHES · ' + falls + (falls === 1 ? ' FALL' : ' FALLS'));
      if (S.total >= S.hi && S.total > 0) text('NEW BEST!', W / 2, H * 0.26, 16, CYAN, { depth: 3, lw: 4.5 });
      // a medal for each stretch
      const n = S.scores.length, gap = 46 * u, my = H * 0.36 + 136 * u;
      S.scores.forEach((q, k) => { if (q.medal) medal(q.medal, W / 2 + (k - (n - 1) / 2) * gap, my, 16 * u); });
      // who fell the most (all in good fun)
      const most = Math.max(0, ...S.fallsBy.map((f) => f || 0));
      if (most > 0) {
        const who = S.fallsBy.map((f, i) => (f === most ? (i === S.me ? 'YOU' : S.roster[i] && S.roster[i].name) : null)).filter(Boolean);
        text('BUTTERFINGERS: ' + who.join(' & ') + ' · ' + most + (most === 1 ? ' FALL' : ' FALLS'), W / 2, my + 38 * u, 10.5, '#ffd7f0', { lw: 2.6 });
      } else text('NOBODY FELL! 🎉', W / 2, my + 38 * u, 11, '#3dff8a', { lw: 2.8 });
    }
  }
  return { draw };
}
