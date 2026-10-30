// Sushi Conveyor — the rules, with no drawing (the game, its bots and the checks all run this).
//
// Plates ride a belt from the chef to the far end; distances along it are in plate diameters
// (`s`), so the rules don't depend on the screen. Order tickets ask for a few pieces each; tap a
// plate one of them wants and it goes to that ticket. A ticket filled = served. A ticket that runs
// out of patience is a strike; three strikes, or the 75 s clock, ends the round. Each 15 s the belt
// steps up a level: faster, bigger orders, rarer fish, wasabi to avoid.

export const TYPES = {
  salmon: { pts: 100, name: 'salmon' },
  tuna: { pts: 100, name: 'tuna' },
  tamago: { pts: 80, name: 'tamago' },
  maki: { pts: 80, name: 'maki' },
  ebi: { pts: 120, name: 'ebi' },
  edamame: { pts: 60, name: 'edamame' },
  ikura: { pts: 150, name: 'ikura' },
  uni: { pts: 200, name: 'uni' },
};
export const ROUND = 75, LEVEL_EVERY = 15, STRIKES = 3;
export const WRONG_COST = 3, WASABI_COST = 5; // seconds off the clock
export const GOLD_X = 3, TRIPLE = 300, LUCKY = 1000;
export const SPACING = 1.3; // closest two plates come on the belt, in diameters
// per level: belt speed (diameters/s), tickets at once, pieces per ticket, patience (s), wasabi and gold odds
export const LEVELS = [
  { speed: 0.9, orders: 2, items: [1, 2], patience: 24, wasabi: 0, gold: 0.06, pool: ['salmon', 'tuna', 'tamago', 'maki'] },
  { speed: 1.1, orders: 2, items: [2, 2], patience: 22, wasabi: 0.07, gold: 0.07, pool: ['salmon', 'tuna', 'tamago', 'maki', 'ebi', 'edamame'] },
  { speed: 1.35, orders: 3, items: [2, 3], patience: 21, wasabi: 0.09, gold: 0.08, pool: ['salmon', 'tuna', 'tamago', 'maki', 'ebi', 'edamame', 'ikura'] },
  { speed: 1.6, orders: 3, items: [2, 3], patience: 19, wasabi: 0.1, gold: 0.08, pool: ['salmon', 'tuna', 'tamago', 'maki', 'ebi', 'edamame', 'ikura', 'uni'] },
  { speed: 1.9, orders: 3, items: [3, 3], patience: 18, wasabi: 0.12, gold: 0.09, pool: ['salmon', 'tuna', 'tamago', 'maki', 'ebi', 'edamame', 'ikura', 'uni'] },
];

/** A small seeded random number generator (mulberry32), so a round can be replayed. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A new round. `len` is the belt's length in plate diameters. */
export function createSim(seed, len) {
  const r = rng(seed);
  return {
    seed, len, rand: r, t: 0, time: ROUND, level: 1, score: 0, combo: 0, bestCombo: 0, strikes: 0, served: 0,
    orders: [], plates: [], nextId: 1, orderCool: 0.6, gap: 0, last: [],
    // the lucky cat rides by in a little over half the rounds, somewhere in the middle
    catT: r() < 0.55 ? 25 + r() * 30 : -1, catDone: false,
    over: null, calm: false, events: [],
  };
}

export const lvl = (sim) => LEVELS[sim.level - 1];
export const comboMult = (combo) => Math.min(3, 1 + 0.5 * Math.floor(combo / 4));

/** What the tickets still want, by type. */
export function wanted(sim) {
  const w = {};
  for (const o of sim.orders) for (const it of o.items) if (!it.filled) w[it.type] = (w[it.type] || 0) + 1;
  return w;
}

function pick(sim, list) { return list[Math.floor(sim.rand() * list.length) % list.length]; }

function spawnPlate(sim) {
  const L = lvl(sim);
  let type;
  if (sim.catT >= 0 && !sim.catDone && sim.t >= sim.catT) { type = 'luckycat'; sim.catDone = true; }
  else {
    // what the tickets want and the belt (still in reach) doesn't already carry
    const w = wanted(sim);
    for (const p of sim.plates) if (!p.taken && p.s < sim.len * 0.8 && w[p.type]) w[p.type]--;
    const short = Object.keys(w).filter((k) => w[k] > 0);
    // (a ticket past half its patience whose piece isn't on the belt gets it next, so a quick player
    // is never let down by the belt — simulate() checks it)
    const urgent = sim.orders.filter((o) => o.patience < o.max * 0.5).sort((a, b) => a.patience - b.patience)
      .map((o) => o.items.find((it) => !it.filled && w[it.type] > 0)).find(Boolean);
    if (urgent) type = urgent.type;
    else if (short.length && sim.rand() < 0.6) type = pick(sim, short);
    else if (!sim.calm && sim.rand() < L.wasabi) type = 'wasabi';
    else type = pick(sim, L.pool);
  }
  const gold = type !== 'wasabi' && type !== 'luckycat' && sim.rand() < lvl(sim).gold;
  sim.plates.push({ id: sim.nextId++, type, gold, s: 0, taken: false });
}

function newOrder(sim) {
  const L = lvl(sim);
  const n = L.items[0] + Math.floor(sim.rand() * (L.items[1] - L.items[0] + 1));
  const items = [];
  for (let i = 0; i < n; i++) items.push({ type: pick(sim, L.pool), filled: false });
  sim.orders.push({ id: sim.nextId++, items, patience: L.patience, max: L.patience, born: sim.t });
  sim.events.push({ e: 'order' });
}

/** One step of `dt` seconds. */
export function stepSim(sim, dt) {
  if (sim.over) return;
  sim.t += dt;
  if (!sim.calm) sim.time -= dt;
  const level = Math.min(LEVELS.length, 1 + Math.floor(sim.t / LEVEL_EVERY));
  if (level !== sim.level) { sim.level = level; sim.events.push({ e: 'level', level }); }
  const L = lvl(sim);
  // the belt
  for (const p of sim.plates) p.s += L.speed * dt;
  sim.plates = sim.plates.filter((p) => !p.taken && p.s < sim.len + 1);
  const nearest = sim.plates.reduce((m, p) => Math.min(m, p.s), Infinity);
  if (nearest >= SPACING + sim.gap) {
    spawnPlate(sim);
    sim.gap = sim.rand() < 0.25 ? sim.rand() * 0.9 : 0; // now and then a space on the belt
  }
  // the tickets
  for (const o of sim.orders) if (!sim.calm) o.patience -= dt;
  for (const o of sim.orders.filter((x) => x.patience <= 0)) {
    sim.orders.splice(sim.orders.indexOf(o), 1);
    sim.strikes++; sim.combo = 0;
    sim.events.push({ e: 'late', id: o.id });
  }
  sim.orderCool -= dt;
  if (sim.orders.length < L.orders && sim.orderCool <= 0) { newOrder(sim); sim.orderCool = 1.2; }
  if (sim.strikes >= STRIKES) end(sim, 'strikes');
  else if (sim.time <= 0) { sim.time = 0; end(sim, 'time'); }
}

function end(sim, why) { sim.over = why; sim.events.push({ e: 'over', why }); }

/** Tap a plate. Returns what happened (also pushed to sim.events). */
export function tapPlate(sim, id) {
  if (sim.over) return null;
  const p = sim.plates.find((x) => x.id === id && !x.taken);
  if (!p) return null;
  let ev;
  if (p.type === 'wasabi') {
    p.taken = true; sim.combo = 0; sim.time = Math.max(0, sim.time - WASABI_COST);
    ev = { e: 'wasabi', id };
  } else if (p.type === 'luckycat') {
    p.taken = true; sim.score += LUCKY;
    ev = { e: 'lucky', id, pts: LUCKY };
  } else {
    // the ticket that wants it and has the least patience left
    const o = sim.orders.filter((x) => x.items.some((it) => !it.filled && it.type === p.type)).sort((a, b) => a.patience - b.patience)[0];
    if (!o) {
      sim.combo = 0; sim.time = Math.max(0, sim.time - WRONG_COST);
      ev = { e: 'wrong', id };
    } else {
      p.taken = true;
      const slot = o.items.findIndex((it) => !it.filled && it.type === p.type);
      o.items[slot].filled = true;
      sim.combo++; sim.bestCombo = Math.max(sim.bestCombo, sim.combo);
      const mult = comboMult(sim.combo);
      let pts = Math.round(TYPES[p.type].pts * (p.gold ? GOLD_X : 1) * mult);
      sim.last = [...sim.last, p.type].slice(-3);
      let triple = false;
      if (sim.last.length === 3 && sim.last.every((k) => k === p.type)) { pts += TRIPLE; triple = true; sim.last = []; }
      sim.score += pts;
      ev = { e: 'catch', id, order: o.id, slot, pts, gold: p.gold, triple, combo: sim.combo };
      if (o.items.every((it) => it.filled)) {
        const bonus = Math.round((200 + 300 * Math.max(0, o.patience / o.max)) * mult);
        sim.score += bonus; sim.served++;
        sim.orders.splice(sim.orders.indexOf(o), 1);
        sim.orderCool = Math.min(sim.orderCool, 0.8);
        sim.events.push(ev);
        ev = { e: 'served', id: o.id, pts: bonus };
      }
    }
  }
  sim.events.push(ev);
  if (sim.time <= 0 && !sim.over) end(sim, 'time');
  return ev;
}

/** A perfect bot: taps every plate a ticket wants as soon as it's out of the kitchen, never wasabi
 *  or one nobody ordered. Fairness check: a good player should never be let down by the belt
 *  (no ticket runs out because the plate it needs never came). */
export function simulate(seed, len = 22, { reaction = 0.4 } = {}) {
  const sim = createSim(seed, len);
  const seen = new Map();
  const dt = 1 / 60;
  while (!sim.over) {
    stepSim(sim, dt);
    const w = wanted(sim);
    for (const p of sim.plates) {
      if (p.taken || p.s < 0.6) continue;
      if (!seen.has(p.id)) seen.set(p.id, sim.t);
      if (sim.t - seen.get(p.id) < reaction) continue;
      if (p.type === 'luckycat' || (w[p.type] || 0) > 0) { tapPlate(sim, p.id); if (w[p.type]) w[p.type]--; }
    }
    sim.events.length = 0;
  }
  return { score: sim.score, strikes: sim.strikes, served: sim.served, level: sim.level, over: sim.over, bestCombo: sim.bestCombo };
}
