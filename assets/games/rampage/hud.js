// HUD and screens for Godzilla Rampage, drawn on a 2D canvas over the 3D
// scene in logical coordinates (192 x 288), at full device resolution.
// Chunky rounded type with a dark outline — a modern arcade look.

const FONT = '"Avenir Next", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';

export function createHud(canvas, game, view, project) {
  const { S, W, H, HUD } = game;
  const ctx = canvas.getContext('2d');

  function font(px, weight = 900) { ctx.font = `${weight} ${px}px ${FONT}`; }
  function text(s, x, y, px, fill, opts = {}) {
    font(px, opts.weight);
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = 'middle';
    if (opts.depth) { // extruded 3D lettering
      ctx.fillStyle = opts.depthColor || '#000';
      for (let i = opts.depth; i > 0; i -= 0.5) ctx.fillText(s, x, y + i);
    }
    if (opts.stroke !== false) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = opts.lineWidth || px * 0.28;
      ctx.strokeStyle = opts.stroke || 'rgba(20,12,40,0.92)';
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
  }
  function round(x, y, w, h, r, fill, stroke, lw = 1) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function heart(cx, cy, s, fill) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 1.4, cy - s * 0.1, cx - s * 0.7, cy - s * 1.1, cx, cy - s * 0.35);
    ctx.bezierCurveTo(cx + s * 0.7, cy - s * 1.1, cx + s * 1.4, cy - s * 0.1, cx, cy + s * 0.9);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(20,12,40,0.9)'; ctx.stroke();
  }
  function bubble(x, y, s, col = '#d6336c') {
    font(6.5);
    const w = ctx.measureText(s).width + 8;
    const bx = Math.max(2, Math.min(W - w - 2, x - w / 2));
    round(bx, y - 6, w, 11, 4, '#ffffff', 'rgba(20,12,40,0.85)', 0.8);
    ctx.beginPath(); ctx.moveTo(x - 2, y + 5); ctx.lineTo(x + 2, y + 5); ctx.lineTo(x - 3, y + 9); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
    text(s, bx + w / 2, y - 0.5, 6.5, col, { stroke: false });
  }
  const pad6 = (n) => String(n).padStart(6, '0');

  function hudBar() {
    // leaves the top-right corner for the pause button (44 px)
    const RX = W - 4 - 48 / view.s;
    round(2, 2, RX - 2, HUD - 4, 6, 'rgba(20,12,40,0.55)');
    text(game.HEROES[S.hero].girl ? 'SCORE +15%' : 'SCORE', 8, 7, 5, '#ffb3c6', { align: 'left', stroke: false });
    text(pad6(S.score), 8, 14.5, 8.5, '#ffffff', { align: 'left', lineWidth: 2 });
    text('HIGH SCORE', (2 + RX) / 2 + 4, 7, 5, '#ffb3c6', { stroke: false });
    text(pad6(S.hi), (2 + RX) / 2 + 4, 14.5, 8.5, '#ffe066', { lineWidth: 2 });
    text('LEVEL ' + (S.level + 1), RX - 4, 7, 5, '#a5d8ff', { align: 'right', stroke: false });
    for (let i = 0; i < Math.min(S.lives, 5); i++) heart(RX - 7 - i * 8, 14.5, 3, '#ff4d6d');
    const p = S.player;
    if (p && p.tool > 0 && (S.mode === 'play' || S.mode === 'dying')) {
      const w = (W - 16) * p.tool / game.TOOL_TIME;
      round(8, HUD - 1, W - 16, 4, 2, 'rgba(20,12,40,0.6)');
      round(8, HUD - 1, Math.max(4, w), 4, 2, p.tool < 2 && Math.floor(S.t * 10) % 2 ? '#ff6b6b' : '#ffa94d');
      text(game.HEROES[S.hero].power + '!', W / 2, HUD + 6.5, 5, '#ffd8a8');
    }
    if (S.mode === 'play' || S.mode === 'intro' || S.mode === 'dying') {
      text('BONUS ' + S.bonus, W - 6, HUD + (p && p.tool > 0 ? 13 : 7), 6, '#ffe066', { align: 'right', lineWidth: 1.8 });
    }
  }

  function messages() {
    let y = S.finale && S.landed ? 160 : 128; // below the couple when the camera is in close
    S.msgs.slice(-2).forEach((m) => {
      const age = (m.d || 1.4) - m.t;
      if (m.t < 0.3 && Math.floor(m.t * 20) % 2) return;
      const pop = age < 0.18 ? 0.6 + (age / 0.18) * 0.55 : age < 0.3 ? 1.15 - ((age - 0.18) / 0.12) * 0.15 : 1;
      font(14);
      const full = ctx.measureText(m.txt).width;
      const px = Math.min(14, (14 * (W - 14)) / full);
      ctx.save();
      ctx.translate(W / 2, y);
      ctx.scale(pop, pop);
      text(m.txt, 0, 0, px, m.col, { depth: 1.6, depthColor: 'rgba(20,12,40,0.9)', lineWidth: px * 0.3 });
      ctx.restore();
      y += px + 10;
    });
  }

  function pops() {
    S.pops.forEach((pp) => {
      const q = project(pp.x, pp.y, 4);
      text(pp.txt, q.x, q.y, 6.5, pp.col, { lineWidth: 1.8, globalAlpha: 1 });
    });
  }

  function bubbles() {
    const gz = S.gz;
    const label = gz.state === 'fall' ? (S.fallT < game.FALL_EDGE ? 'WHOA!' : null) : gz.state === 'roar' ? 'ROAR!' : gz.state === 'laugh' || S.mode === 'gameover' ? 'HA! HA! HA!' : gz.state === 'shocked' ? '!?' : gz.state === 'tantrum' ? 'GRRR!!' : null;
    if (label) {
      const q = project(66, game.surf(5, 30) - 42, 0);
      bubble(Math.max(q.x, 40), Math.max(q.y, HUD + 14), label, '#2b8a3e');
    }
    if (S.mode === 'play' || S.mode === 'intro') {
      if (Math.floor(S.t * 1.2) % 3 === 0) {
        const q = project(128, game.surf(6, 100) - 12, 0);
        bubble(q.x, Math.max(q.y, HUD + 14), 'HELP!');
      }
    }
    // drop warnings
    S.hz.forEach((h) => {
      if (h.kind === 'drop' && h.warn > 0 && Math.floor(h.warn * 10) % 2) text('!', h.x, HUD + 10, 12, '#ff6b6b', { lineWidth: 3 });
    });
  }

  function band(y, h) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(20,12,40,0)'); g.addColorStop(0.2, 'rgba(20,12,40,0.7)'); g.addColorStop(0.8, 'rgba(20,12,40,0.7)'); g.addColorStop(1, 'rgba(20,12,40,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y, W, h);
  }

  function intro() {
    band(66, 58);
    if (game.lvl().final) text('FINAL LEVEL', W / 2, 62, 8, '#ff8cc6', { lineWidth: 2.4 });
    text('LEVEL ' + (S.level + 1), W / 2, 82, 18, '#ffffff', { depth: 2, depthColor: '#c2255c', lineWidth: 5 });
    text(game.theme().name, W / 2, 101, 8, '#ffe066', { lineWidth: 2.4 });
    if (Math.floor(S.t * 3) % 2) text('TAP OR JUMP TO GO', W / 2, 113, 5.5, '#e9ecef', { lineWidth: 1.6 });
  }
  function tally() { band(194, 34); text('BONUS ' + S.bonus, W / 2, 211, 13, '#ffe066', { depth: 1.5, lineWidth: 3.4 }); }
  function win() {
    band(186, 54);
    text('ALL ' + game.LEVELS.length + ' LEVELS CLEARED!', W / 2, 200, 8, '#8ce99a', { lineWidth: 2.4 });
    text('NEXT: ROUND ' + (S.round + 2), W / 2, 213, 7, '#ffffff', { lineWidth: 2 });
    if (S.modeT > 1.5 && Math.floor(S.t * 3) % 2) text('TAP TO KEEP GOING', W / 2, 226, 5.5, '#e9ecef', { lineWidth: 1.6 });
  }
  function gameOver() {
    ctx.fillStyle = 'rgba(14,8,30,0.62)'; ctx.fillRect(-view.fx / view.s, HUD, W + (2 * view.fx) / view.s, H - HUD);
    const bob = Math.sin(S.t * 3) * 1.5;
    text('GAME OVER', W / 2, 72 + bob, 26, '#ff6b6b', { depth: 2.5, depthColor: '#5c0f1f', lineWidth: 6 });
    text(game.HEROES[S.hero].name + ' AND ' + game.partnerName(S.hero), W / 2, 106, 9, '#ffb3d1', { lineWidth: 2.6 });
    text('NEED YOU!', W / 2, 121, 15, '#ff8cc6', { depth: 1.5, lineWidth: 4 });
    text('SCORE ' + S.score, W / 2, 146, 8, '#ffffff', { lineWidth: 2.2 });
    if (S.score >= S.hi && S.score > 0) text('NEW HIGH SCORE!', W / 2, 160, 8, '#ffe066', { lineWidth: 2.2 });
  }

  function select() {
    const g = ctx.createLinearGradient(0, 0, 0, 90);
    g.addColorStop(0, 'rgba(20,12,40,0.45)'); g.addColorStop(1, 'rgba(20,12,40,0)');
    ctx.fillStyle = g; ctx.fillRect(-view.fx / view.s, -view.fy / view.s, W + (2 * view.fx) / view.s, 90 + view.fy / view.s);
    const wob = Math.sin(S.t * 2.4) * 1.2;
    text('GODZILLA', W / 2, 26 + wob, 27, '#69db7c', { depth: 3, depthColor: '#145a24', lineWidth: 6 });
    text('RAMPAGE', W / 2, 54 - wob, 27, '#ff6b6b', { depth: 3, depthColor: '#5c0f1f', lineWidth: 6 });
    if (S.girlPower) {
      text(Math.floor(S.t * 1.25) % 2 ? 'GIRL POWER!' : 'CHOOSE YOUR HERO', W / 2, 78, 8, Math.floor(S.t * 1.25) % 2 ? '#ff8cc6' : '#ffe066', { lineWidth: 2.4 });
      game.roster().forEach((k, i) => cell(k, i % 2 ? W / 2 + 2 : 8, i < 2 ? 88 : 168, S.sel === i));
    } else {
      if (Math.floor(S.t * 2.5) % 2) text('CHOOSE YOUR HERO', W / 2, 80, 8, '#ffe066', { lineWidth: 2.4 });
      panel('chris', 96, S.sel === 0);
      panel('shea', 176, S.sel === 1);
    }
    round(36, 253, W - 72, 13, 6, 'rgba(20,12,40,0.6)');
    text('HIGH SCORE ' + pad6(S.hi), W / 2, 259.5, 6.5, '#ffffff', { stroke: false });
    text('TAP A HERO TO START', W / 2, 275, 6, '#ffffff', { lineWidth: 2 });
  }
  // Girl Power: four cards in a 2 x 2 grid; the 3D hero stands in the top
  // half of each (render3d places them), name and mission below.
  function cell(key, x, y, on) {
    const hero = game.HEROES[key], w = W / 2 - 10;
    const fill = ctx.createLinearGradient(0, y, 0, y + 76);
    fill.addColorStop(0, 'rgba(20,12,40,0)');
    fill.addColorStop(0.5, on ? 'rgba(60,40,150,0.5)' : 'rgba(20,12,40,0.4)');
    fill.addColorStop(1, on ? 'rgba(60,40,150,0.75)' : 'rgba(20,12,40,0.62)');
    round(x, y, w, 76, 12, fill, on ? (Math.floor(S.t * 4) % 2 ? '#ffe066' : '#ffffff') : 'rgba(255,255,255,0.35)', on ? 2 : 1);
    text(hero.name, x + w / 2, y + 55, 10, '#ffffff', { depth: 1.2, lineWidth: 3 });
    text('RESCUE ' + game.partnerName(key), x + w / 2, y + 68, 5.5, '#ffb3d1', { lineWidth: 1.6 });
    if (hero.girl) {
      round(x + w - 31, y + 5, 27, 10, 5, '#d6336c');
      text('+15%', x + w - 17.5, y + 10.3, 5.5, '#ffffff', { stroke: false });
    }
  }
  function panel(key, y, on) {
    const hero = game.HEROES[key], wife = { name: game.partnerName(key) };
    // clear on the left where the 3D hero stands, darker behind the text
    const fill = ctx.createLinearGradient(8, 0, W - 8, 0);
    fill.addColorStop(0, 'rgba(20,12,40,0)');
    fill.addColorStop(0.24, 'rgba(20,12,40,0)');
    fill.addColorStop(0.36, on ? 'rgba(60,40,150,0.62)' : 'rgba(20,12,40,0.55)');
    fill.addColorStop(1, on ? 'rgba(60,40,150,0.62)' : 'rgba(20,12,40,0.55)');
    round(8, y, W - 16, 72, 12, fill, on ? (Math.floor(S.t * 4) % 2 ? '#ffe066' : '#ffffff') : 'rgba(255,255,255,0.35)', on ? 2 : 1);
    text(hero.name, 64, y + 15, 16, '#ffffff', { align: 'left', depth: 1.5, lineWidth: 4 });
    text('POWER: ' + hero.power, 64, y + 34, 6.5, '#ffc078', { align: 'left', lineWidth: 1.8 });
    text('MISSION:', 64, y + 47, 6, '#a5d8ff', { align: 'left', lineWidth: 1.8 });
    text('RESCUE ' + wife.name, 64, y + 58, 7.5, '#ffb3d1', { align: 'left', lineWidth: 2 });
  }

  return {
    draw(noGL) {
      const k = view.s * view.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, view.fx * view.dpr, view.fy * view.dpr);
      if (noGL) {
        ctx.fillStyle = '#1b1240';
        ctx.fillRect(-view.fx / view.s, -view.fy / view.s, W + (2 * view.fx) / view.s, H + (2 * view.fy) / view.s);
      }
      if (S.mode === 'select') { select(); return; }
      bubbles();
      pops();
      hudBar();
      messages();
      if (S.mode === 'intro') intro();
      if (S.mode === 'tally') tally();
      if (S.mode === 'win') win();
      if (S.mode === 'gameover') gameOver();
    }
  };
}
