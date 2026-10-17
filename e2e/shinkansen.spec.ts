import { expect, test, type Frame, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Shinkansen Dash: an endless runner on three bullet trains, in an iframe
// like Godzilla Rampage. Runs are saved to game_scores as shinkansen_dash.
// The game exposes window.__dash (state, and cheats in development).

// One at a time with a long budget: the game renders 3D in software here.
test.describe.configure({ mode: 'serial', timeout: 120_000 });

const SARAH = '00000000-0000-4000-8000-0000000000aa';
const TOM = '00000000-0000-4000-8000-0000000000bb';
const run = (id: string, user_id: string, score: number, level: number, round: number, hero: string, game = 'shinkansen_dash') => ({
  id,
  game,
  user_id,
  score,
  level,
  round,
  hero,
  created_at: `2026-10-0${id.length}T10:00:00Z`,
});

const DATA = {
  profiles: [
    { id: USER_ID, display_name: 'Test Traveler', avatar_url: null },
    { id: SARAH, display_name: 'Sarah Lee', avatar_url: null },
    { id: TOM, display_name: 'Tom Park', avatar_url: null },
  ],
  game_scores: [
    run('t1', TOM, 9000, 3, 1, 'emily'),
    run('s1', SARAH, 12400, 5, 2, 'shea'),
    run('m1', USER_ID, 800, 1, 1, 'chris'),
    run('r1', TOM, 50000, 4, 1, 'chris', 'godzilla_rampage'), // another game's score: not on this board
  ],
};

const SECRET = 'A SECRET TRAVELER · KEEP PLAYING TO FIND THEM'; // never a name or a clue

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

async function game(page: Page): Promise<Frame> {
  await expect(page.getByTestId('game-frame')).toBeVisible();
  let frame: Frame | undefined;
  await expect
    .poll(async () => {
      frame = page.frames().find((f) => f.url() === 'about:srcdoc');
      return frame ? frame.evaluate(() => (window as any).__dash?.mode ?? null).catch(() => null) : null;
    })
    .toBe('select');
  return frame!;
}
const st = (f: Frame) =>
  f.evaluate(() => {
    const d = (window as any).__dash;
    return { mode: d.mode, jumps: d.jumps, slides: d.slides, lane: d.lane, y: d.y, air: d.air, sliding: d.sliding, coins: d.coins, score: d.score, hero: d.hero, hi: d.hi, shield: d.shield };
  });
const debug = (f: Frame, fn: string, ...args: unknown[]) =>
  f.evaluate(([n, a]) => (window as any).__dash.debug[n as string](...(a as unknown[])), [fn, args] as const);

/** Turns the character ring (arrow keys, the short way round) until traveler i is at the front. */
async function toFront(page: Page, f: Frame, i: number) {
  const n = 8;
  for (let k = 0; k < n; k++) {
    const sel = await f.evaluate(() => (window as any).__dash.sel);
    if (sel === i) break;
    await page.keyboard.press(((i - sel + n) % n) <= n / 2 ? 'ArrowRight' : 'ArrowLeft');
  }
  await expect.poll(() => f.evaluate(() => (window as any).__dash.sel)).toBe(i);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.ringSettled), { timeout: 10_000 }).toBe(true);
}
/** Brings traveler i to the front of the ring and taps them. */
async function tapFront(page: Page, f: Frame, i: number) {
  await toFront(page, f, i);
  const box = (await page.getByTestId('game-frame').boundingBox())!;
  const pt = await f.evaluate((n) => (window as any).__dash.heroPoint(n), i);
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
}
/** Starts a run as the given traveler (the ring turned to them, a tap) and skips the countdown. */
async function start(page: Page, f: Frame, i: number) {
  await tapFront(page, f, i);
  await expect.poll(async () => (await st(f)).mode).toBe('ready');
  await debug(f, 'go');
  await expect.poll(async () => (await st(f)).mode).toBe('run');
}
async function swipe(page: Page, dx: number, dy: number) {
  const box = (await page.getByTestId('game-frame').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height * 0.6;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

test('the board: each player’s best run, ties share a rank', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games');
  await page.getByRole('tab', { name: 'Shinkansen Dash' }).click();
  await expect(page.getByTestId('games-title')).toHaveText('Shinkansen Dash');
  await page.getByTestId('games-play').click();
  await expect(page.getByRole('heading', { name: 'Shinkansen Dash' })).toBeVisible();
  const rows = page.getByTestId('high-score');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAccessibleName('1. Sarah Lee, 12,400, as Shea · round 2');
  await expect(rows.nth(1)).toHaveAccessibleName('2. Tom Park, 9,000, as Emily · reached Mount Fuji');
  await expect(rows.nth(2)).toHaveAccessibleName('3. Test Traveler (you), 800, as Chris · reached Tokyo');
});

test('the character ring: swipe or tap a side traveler to turn it, tap the one at the front to play', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  const f = await game(page);
  const sel = () => f.evaluate(() => (window as any).__dash.sel);
  expect(await sel()).toBe(0);
  await swipe(page, -120, 0); // drag left: the next one comes round
  await expect.poll(sel).toBe(1);
  await swipe(page, 120, 0);
  await expect.poll(sel).toBe(0);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.ringSettled)).toBe(true);
  // Tapping a traveler at the side turns them to the front — it doesn't start.
  const box = (await page.getByTestId('game-frame').boundingBox())!;
  const side = await f.evaluate(() => (window as any).__dash.heroPoint(1));
  await page.mouse.click(box.x + side.x, box.y + side.y);
  await expect.poll(sel).toBe(1);
  expect((await st(f)).mode).toBe('select');
  // The one at the front plays.
  await tapFront(page, f, 1);
  await expect.poll(async () => (await st(f)).mode).toBe('ready');
  expect((await st(f)).hero).toBe('bennett');
});

test('Emily is earned by reaching Mount Fuji; locked travellers stay a secret', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  let f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'nicole', 'jake', 'liam']);
  // Tapping a locked traveler only says it's a secret (no name, no clue) and doesn't start.
  const tap = (i: number) => tapFront(page, f, i);
  await tap(2);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.hint)).toBe(SECRET);
  expect((await st(f)).mode).toBe('select');

  // Run as Chris past 2,000 m (Mount Fuji): Emily is earned; the app keeps it.
  await tap(0);
  await expect.poll(async () => (await st(f)).mode).toBe('ready');
  await debug(f, 'go');
  await expect.poll(async () => (await st(f)).mode).toBe('run');
  await debug(f, 'calm');
  await debug(f, 'setDist', 1990);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.locked), { timeout: 15_000 }).toEqual(['miles', 'nicole', 'jake', 'liam']);
  const ui = page.frameLocator('[data-testid="game-frame"]');
  await ui.getByRole('button', { name: 'Pause' }).click();
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 30_000 });

  // Next time Emily is playable from the line-up; the others are still secrets.
  await page.getByTestId('dash-play').click();
  f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['miles', 'nicole', 'jake', 'liam']);
  await tap(3);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.hint)).toBe(SECRET);
  await tap(2);
  await expect.poll(async () => (await st(f)).mode).toBe('ready');
  expect((await st(f)).hero).toBe('emily');
});

test('Nicole is earned with a boba tea: only in the fast end, and only with a jump', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  let f = await game(page);
  const tap = (i: number) => tapFront(page, f, i);
  await tap(4);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.hint)).toBe(SECRET);
  expect((await st(f)).mode).toBe('select');
  // (fairnessProblems also checks no boba before Tea Hills, and some after)
  expect(await f.evaluate(() => (window as any).__dash.fairnessProblems())).toEqual([]);

  await start(page, f, 0);
  await debug(f, 'calm');
  const bobas = () => f.evaluate(() => (window as any).__dash.bobas);
  // It floats above your head: running under it doesn't collect it…
  await debug(f, 'pause', true);
  const d0: number = await f.evaluate(() => (window as any).__dash.dist);
  await debug(f, 'spawn', 'boba', 1, 4);
  await debug(f, 'pause', false);
  // (until the runner is well past it, in game distance — wall time stretches under load)
  await expect.poll(() => f.evaluate(() => (window as any).__dash.dist), { timeout: 15_000 }).toBeGreaterThan(d0 + 10);
  expect(await bobas()).toBe(0);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'nicole', 'jake', 'liam']);
  // …a jump does, and Nicole is unlocked.
  await debug(f, 'pause', true);
  await debug(f, 'spawn', 'boba', 1, 4);
  await page.keyboard.press('ArrowUp');
  await debug(f, 'pause', false);
  await expect.poll(bobas, { timeout: 10_000 }).toBe(1);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'jake', 'liam']);
  const ui = page.frameLocator('[data-testid="game-frame"]');
  await ui.getByRole('button', { name: 'Pause' }).click();
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 30_000 });

  // The app remembers: next time Nicole is in the line-up, and her runs save as her.
  await page.getByTestId('dash-play').click();
  f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'jake', 'liam']);
  await start(page, f, 4);
  expect((await st(f)).hero).toBe('nicole');
  await debug(f, 'gameOver', 321);
  // (the first run, left from the pause menu, was saved as Chris)
  const scores = () => backend.inserts.filter((i) => i.table === 'game_scores');
  await expect.poll(() => scores().length, { timeout: 15_000 }).toBe(2);
  expect((scores()[0].body as unknown as Record<string, unknown>[])[0]).toMatchObject({ hero: 'chris' });
  const saved = (scores()[1].body as unknown as Record<string, unknown>[])[0];
  expect(saved).toMatchObject({ game: 'shinkansen_dash', user_id: USER_ID, hero: 'nicole', score: 321 });
});

test('Miles: a spring gives one double jump, and only a double jump reaches the golden guitar', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  let f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.fairnessProblems())).toEqual([]); // springs, guitars placed fairly
  await start(page, f, 0);
  await debug(f, 'calm');
  const dash = () => f.evaluate(() => { const d = (window as any).__dash; return { y: d.y, air: d.air, spring: d.spring, doubles: d.doubles, guitars: d.guitars, locked: d.locked }; });
  const ground = (await dash()).y;
  /** Jump, and once well up in the air (paused there), run `then`. */
  const jumpThen = async (then: () => Promise<void>) => {
    await expect.poll(async () => (await dash()).air, { timeout: 10_000 }).toBe(false);
    await page.keyboard.press('ArrowUp');
    // (high for only ~0.5 s: poll fast — the default backs off to 1 s between tries)
    await expect.poll(async () => (await dash()).y - ground, { timeout: 10_000, intervals: [40] }).toBeGreaterThan(0.8);
    await debug(f, 'pause', true);
    await then();
    await debug(f, 'pause', false);
    await page.waitForTimeout(1600);
  };

  // No spring: a second swipe up in the air does nothing.
  await jumpThen(() => page.keyboard.press('ArrowUp'));
  expect((await dash()).doubles).toBe(0);

  // Grab a spring.
  await debug(f, 'spawn', 'spring', 1, 4);
  await expect.poll(async () => (await dash()).spring, { timeout: 10_000 }).toBe(true);
  // A single jump passes under the guitar (and keeps the spring).
  await expect.poll(async () => (await dash()).air, { timeout: 10_000 }).toBe(false);
  await debug(f, 'pause', true);
  await debug(f, 'spawn', 'guitar', 1, 5);
  await page.keyboard.press('ArrowUp');
  await debug(f, 'pause', false);
  await page.waitForTimeout(1600);
  expect(await dash()).toMatchObject({ guitars: 0, spring: true });
  expect((await dash()).locked).toEqual(['emily', 'miles', 'nicole', 'jake', 'liam']);
  // Swipe up again in mid-air: the spring's double jump reaches it — Miles is unlocked.
  await jumpThen(async () => {
    await debug(f, 'spawn', 'guitar', 1, 5);
    await page.keyboard.press('ArrowUp');
  });
  await expect.poll(async () => (await dash()).guitars, { timeout: 10_000 }).toBe(1);
  expect(await dash()).toMatchObject({ doubles: 1, spring: false, locked: ['emily', 'nicole', 'jake', 'liam'] });
  // The spring is used up: no more double jumps.
  await jumpThen(() => page.keyboard.press('ArrowUp'));
  expect((await dash()).doubles).toBe(1);

  const ui = page.frameLocator('[data-testid="game-frame"]');
  await ui.getByRole('button', { name: 'Pause' }).click();
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 30_000 });
  await page.getByTestId('dash-play').click();
  f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'nicole', 'jake', 'liam']);
  await start(page, f, 3);
  expect((await st(f)).hero).toBe('miles');
  await debug(f, 'gameOver', 654);
  const scores = () => backend.inserts.filter((i) => i.table === 'game_scores');
  await expect.poll(() => scores().length, { timeout: 15_000 }).toBe(2);
  expect((scores()[1].body as unknown as Record<string, unknown>[])[0]).toMatchObject({ hero: 'miles', score: 654 });
});

test('Jake: a manhole in a gap drops you into the sewer; reach the pipe to unlock him, sludge-covered until the run ends', async ({ page }) => {
  test.setTimeout(180_000); // (the route search, then the whole level played)
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  let f = await game(page);
  const dash = () => f.evaluate(() => { const d = (window as any).__dash; return { mode: d.mode, sludge: d.sludge, locked: d.locked, score: d.score, sewer: d.sewer }; });
  // The level can be finished (a search over stick and jump-button inputs finds a route)…
  const plan: [number, number][] = await f.evaluate(() => (window as any).__dash.sewerRoute());
  expect(plan && plan.length).toBeGreaterThan(20);
  expect(await f.evaluate((p) => (window as any).__dash.sewerReplay(p), plan)).toMatchObject({ done: true, dead: false });
  // …but not by holding right and hopping.
  const hop = Array.from({ length: 400 }, (_, i) => [1, i % 8 < 4 ? 1 : 0]);
  expect(await f.evaluate((p) => (window as any).__dash.sewerReplay(p), hop)).toMatchObject({ done: false, dead: true });
  // …and the manholes come twice a round.
  expect(await f.evaluate(() => (window as any).__dash.fairnessProblems())).toEqual([]);

  // Fall into a gap with a manhole: the sewer, not "mind the gap".
  await start(page, f, 0);
  await debug(f, 'calm');
  // (bunny-hopping: short jumps, into the first sludge pit)
  await debug(f, 'sewerPlan', hop);
  await debug(f, 'manhole', 1, 8);
  await expect.poll(async () => (await dash()).mode, { timeout: 20_000 }).toBe('sewer');
  // Splosh: the run is over — no Jake.
  await expect.poll(async () => (await dash()).mode, { timeout: 30_000 }).toBe('gameover');
  expect((await dash()).locked).toContain('jake');
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length, { timeout: 15_000 }).toBe(1);

  // Again, playing the whole route: out of the pipe, back on a train, sludge-covered, Jake unlocked.
  const ui = page.frameLocator('[data-testid="game-frame"]');
  await ui.getByRole('button', { name: 'TRY AGAIN' }).click();
  await expect.poll(async () => (await st(f)).mode).toBe('ready');
  await debug(f, 'go');
  await debug(f, 'calm');
  await debug(f, 'sewerPlan', plan);
  await debug(f, 'manhole', 1, 8);
  await expect.poll(async () => (await dash()).mode, { timeout: 20_000 }).toBe('sewer');
  const before = (await dash()).score;
  await expect.poll(async () => (await dash()).mode, { timeout: 60_000 }).toBe('run');
  const back = await dash();
  expect(back.sludge).toBe(true);
  expect(back.locked).toEqual(['emily', 'miles', 'nicole', 'liam']);
  expect(back.score).toBeGreaterThanOrEqual(before + 500);
  // The sludge stays until the run ends.
  await page.waitForTimeout(1500);
  expect((await dash()).sludge).toBe(true);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.invuln), { timeout: 15_000 }).toBe(false);
  await debug(f, 'gameOver', 1234);
  await expect.poll(async () => (await dash()).mode, { timeout: 15_000 }).toBe('gameover');
  await ui.getByRole('button', { name: 'TRY AGAIN' }).click();
  await expect.poll(async () => (await st(f)).mode).toBe('ready');
  expect((await dash()).sludge).toBe(false);

  // Remembered: next time Jake is in the line-up, and his runs save as him.
  await ui.getByRole('button', { name: 'Pause' }).click();
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 30_000 });
  await page.getByTestId('dash-play').click();
  f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'nicole', 'liam']);
  await start(page, f, 5);
  expect((await st(f)).hero).toBe('jake');
  await debug(f, 'gameOver', 777);
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').some((i) => (i.body as unknown as Record<string, unknown>[])[0].hero === 'jake'), { timeout: 15_000 }).toBe(true);
});

test('the sewer plays like Mario 3: a joystick that walks and runs, a jump button that goes higher when held', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  const f = await game(page);
  const ui = page.frameLocator('[data-testid="game-frame"]');
  const sw = () => f.evaluate(() => (window as any).__dash.sewer);
  await start(page, f, 0);
  await debug(f, 'calm');
  await expect(ui.locator('#pad')).toBeHidden();
  await debug(f, 'sewer');
  await expect.poll(async () => (await st(f)).mode).toBe('sewer');
  await expect(ui.locator('#pad')).toBeVisible();
  await expect(ui.getByRole('button', { name: 'Jump (hold to jump higher)' })).toBeVisible();

  // The stick pushed all the way runs; speed builds up rather than snapping.
  const box = (await ui.locator('.stick').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + box.width, cy, { steps: 3 });
  const fast = { timeout: 5_000, intervals: [50] };
  await expect.poll(async () => (await sw()).vx, fast).toBeGreaterThan(8.5);
  await expect.poll(async () => (await sw()).x, fast).toBeGreaterThan(10); // up to the first pipe
  // Back the other way, part way: you skid, turn round and walk left.
  await page.mouse.move(cx - box.width * 0.2, cy, { steps: 2 });
  await expect.poll(async () => (await sw()).vx, fast).toBeCloseTo(-5.5, 1);
  expect((await sw()).face).toBe(-1);
  // All the way: a run.
  await page.mouse.move(cx - box.width, cy, { steps: 2 });
  await expect.poll(async () => (await sw()).vx, fast).toBeLessThan(-8.5);
  // Let go: you slow to a stop.
  await page.mouse.up();
  await expect.poll(async () => (await sw()).vx, { timeout: 5_000 }).toBe(0);

  // A quick tap of jump is a hop; held, the same jump goes well over a pipe's height.
  const jumpBtn = (await ui.locator('#jumpbtn').boundingBox())!;
  // (pressed and let go at once, in the page, so a slow runner can't hold it down for several steps)
  await f.evaluate(() => {
    const b = document.getElementById('jumpbtn')!;
    b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true, cancelable: true }));
    b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));
  });
  await page.mouse.move(jumpBtn.x + jumpBtn.width / 2, jumpBtn.y + jumpBtn.height / 2);
  await expect.poll(async () => (await sw()).y, { timeout: 5_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await sw()).ground, { timeout: 5_000 }).toBe(true);
  const hop = (await sw()).peak;
  expect(hop).toBeLessThan(1.5);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect.poll(async () => (await sw()).ground, { timeout: 5_000 }).toBe(true);
  expect((await sw()).peak).toBeGreaterThan(2.3);

  // Keys too: → runs, Space jumps.
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await sw()).vx, { timeout: 5_000 }).toBeGreaterThan(8.5);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press(' ');
  // (a hop is over in ~0.3 s, so check what it leaves behind: a new jump resets the peak to the hop's ~1 tile)
  await expect.poll(async () => { const pk = (await sw()).peak; return pk > 0.3 && pk < 2; }, { timeout: 5_000 }).toBe(true);
});

test('the sewer: a head-butt breaks a brick and lets out a feather; the feather gives a tanuki suit that floats you down', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  const f = await game(page);
  const sw = () => f.evaluate(() => (window as any).__dash.sewer);
  await start(page, f, 0);
  await debug(f, 'calm');
  await debug(f, 'sewer');
  await expect.poll(async () => (await st(f)).mode).toBe('sewer');
  await debug(f, 'pause', true); // (stepped by hand from here: exact game time)

  // Under the first brick row (52–58, 1.7 up): jump into it.
  await debug(f, 'sewerPut', 53.2, 0);
  await debug(f, 'step', 5);
  await page.keyboard.down(' ');
  await debug(f, 'step', 14);
  await page.keyboard.up(' ');
  await debug(f, 'step', 10);
  let s = await sw();
  expect(s.bricks).toBe(1);
  expect(s.feathers).toHaveLength(1);
  expect(s.suit).toBe(false);

  // Catch the feather: the suit.
  await debug(f, 'step', 40);
  const fe = (await sw()).feathers[0];
  await debug(f, 'sewerPut', fe.x - 0.37, Math.max(0, fe.y - 0.7));
  await debug(f, 'step', 1);
  s = await sw();
  expect(s.suit).toBe(true);
  expect(s.feathers).toHaveLength(0);

  // Falling from 4 tiles takes ~20 steps; tapping jump on the way down wags the tail and floats you.
  await debug(f, 'sewerPut', 40, 4);
  await debug(f, 'step', 12); // (well off the ground, so the tap can't be a jump)
  let n = 12;
  for (; n < 400 && !(await sw()).ground; n += 6) {
    await page.keyboard.press(' ');
    await debug(f, 'step', 6);
  }
  expect((await sw()).wags).toBeGreaterThan(3);
  expect(n).toBeGreaterThan(60);
  await debug(f, 'pause', false);
});

test('Liam the ninja: score 30,000 in a run', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  let f = await game(page);
  await start(page, f, 0);
  await debug(f, 'calm');
  await debug(f, 'score', 29_000);
  await page.waitForTimeout(1500);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toContain('liam'); // not yet
  await debug(f, 'score', 29_995);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.locked), { timeout: 15_000 }).not.toContain('liam');
  const ui = page.frameLocator('[data-testid="game-frame"]');
  await ui.getByRole('button', { name: 'Pause' }).click();
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 30_000 });
  await page.getByTestId('dash-play').click();
  f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'nicole', 'jake']);
  await start(page, f, 6);
  expect((await st(f)).hero).toBe('liam');

  // His skill: a crow ahead on his train gets a ninja star before it reaches him (+50)…
  await debug(f, 'calm');
  const ninja = () => f.evaluate(() => { const d = (window as any).__dash; return { mode: d.mode, throws: d.throws, kills: d.kills, score: d.score }; });
  const before = await ninja();
  await debug(f, 'spawn', 'crow', 1, 45);
  await expect.poll(async () => (await ninja()).kills, { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(2500);
  const after = await ninja();
  expect(after).toMatchObject({ mode: 'run', throws: 1, kills: 1 });
  expect(after.score).toBeGreaterThanOrEqual(before.score + 50);
  // …but a crow on another train is left alone.
  await debug(f, 'spawn', 'crow', 0, 45);
  await page.waitForTimeout(4000);
  expect(await ninja()).toMatchObject({ mode: 'run', throws: 1, kills: 1 });
  await debug(f, 'gameOver', 31_000);
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').some((i) => (i.body as unknown as Record<string, unknown>[])[0].hero === 'liam'), { timeout: 15_000 }).toBe(true);
});

test('play: pick a traveler, swipe between trains, jump, slide, onigiri, crash and save', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  const f = await game(page);
  expect((await st(f)).hi).toBe(12400); // the group's best to beat
  expect(await f.evaluate(() => (window as any).__dash.gl)).toBe(true);
  // Every row of obstacles the generator makes leaves a way through…
  expect(await f.evaluate(() => (window as any).__dash.fairnessProblems())).toEqual([]);
  // …and so do whole runs: a perfect-reaction bot, playing through the real
  // update loop, gets past Kyoto into round 2 on (nearly) every seed. It
  // found crows drifting onto fairings and pantograph rows next to ending
  // trains; the bot's own few misses are late jumps, not unwinnable rows.
  const runs = await f.evaluate(() => [1, 2, 3, 4, 5, 6, 7, 8].map((s) => (window as any).__dash.debug.simulate(s, 6000)));
  expect(runs.filter((r: { dist: number }) => r.dist >= 6000).length, JSON.stringify(runs)).toBeGreaterThanOrEqual(7);
  // (the bot passing Fuji and Kyoto doesn't earn anyone)
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'nicole', 'jake', 'liam']);

  await start(page, f, 1); // Bennett (Shea's old place in the line-up)
  expect((await st(f)).hero).toBe('bennett');
  await debug(f, 'calm');
  expect((await st(f)).lane).toBe(1);

  // Swipes hop trains; arrow keys too.
  await swipe(page, 120, 0);
  await expect.poll(async () => (await st(f)).lane).toBe(2);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await st(f)).lane).toBe(1);
  // Swipe up jumps, swipe down slides.
  await swipe(page, 0, -120);
  await expect.poll(async () => (await st(f)).jumps).toBe(1);
  await expect.poll(async () => (await st(f)).air, { timeout: 10_000 }).toBe(false);
  await swipe(page, 0, 120);
  await expect.poll(async () => (await st(f)).slides).toBe(1);

  // Onigiri in your lane are picked up (+25 each).
  const before = (await st(f)).score;
  await debug(f, 'spawn', 'onigiri', 1, 4);
  await expect.poll(async () => (await st(f)).coins, { timeout: 10_000 }).toBe(1);
  expect((await st(f)).score).toBeGreaterThanOrEqual(before + 25);

  // A lucky cat saves you from one crash.
  await debug(f, 'shield');
  await debug(f, 'spawn', 'panto', 1, 4);
  await expect.poll(async () => (await st(f)).shield, { timeout: 10_000 }).toBe(false);
  expect((await st(f)).mode).toBe('run');

  // Run into a pantograph without one: game over, and the run is saved.
  // (after the lucky cat's moment of invulnerability)
  await expect.poll(() => f.evaluate(() => (window as any).__dash.invuln), { timeout: 15_000 }).toBe(false);
  await debug(f, 'spawn', 'panto', 1, 4);
  await expect.poll(async () => (await st(f)).mode, { timeout: 15_000 }).toBe('gameover');
  const ui = page.frameLocator('[data-testid="game-frame"]');
  await expect(ui.getByRole('button', { name: 'TRY AGAIN' })).toBeVisible();
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length, { timeout: 15_000 }).toBe(1);
  const saved = (backend.inserts.find((i) => i.table === 'game_scores')!.body as unknown as Record<string, unknown>[])[0];
  expect(saved).toMatchObject({ game: 'shinkansen_dash', user_id: USER_ID, level: 1, round: 1, hero: 'bennett' });
  expect(saved.score).toBe((await st(f)).score);

  // CHANGE HERO → the line-up; leaving is behind the pause menu.
  await ui.getByRole('button', { name: 'CHANGE HERO' }).click();
  await expect.poll(async () => (await st(f)).mode).toBe('select');
  await ui.getByRole('button', { name: 'Pause' }).click();
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 15000 });
  expect(errors).toEqual([]);
});

test('smooth: every frame moves the world by exactly the time that passed', async ({ page }) => {
  // The game used to advance in fixed 1/60 s steps with no blending, so a
  // frame moved the world 0, 1 or 2 steps — a stutter at 15–36 m/s, worst on
  // 120 Hz screens. Now each frame moves it by speed × the frame's own time.
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  const f = await game(page);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await st(f)).mode).toBe('ready');
  await debug(f, 'go');
  await expect.poll(async () => (await st(f)).mode).toBe('run');
  await debug(f, 'calm');
  const ratios = await f.evaluate(
    () =>
      new Promise<number[]>((done) => {
        const d = (window as any).__dash, out: number[] = [];
        let lastT = 0, lastD = 0, startT = 0;
        const tick = (t: number) => {
          // (rAF callbacks run in order, so the game's own frame for t has already run)
          // Frames over the game's 0.25 s cap are skipped. A busy CI runner draws
          // slowly in software GL, so stop after 6 s rather than wait for 30.
          if (lastT && t - lastT < 240) out.push((d.dist - lastD) / (d.speed * ((t - lastT) / 1000)));
          lastT = t; lastD = d.dist; startT = startT || t;
          if (out.length < 30 && t - startT < 6000) requestAnimationFrame(tick); else done(out);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(ratios.length).toBeGreaterThanOrEqual(10);
  // within 2% every frame (speed changes very slightly during a frame)
  expect(ratios.filter((r) => Math.abs(r - 1) > 0.02), JSON.stringify(ratios.map((r) => r.toFixed(3)))).toEqual([]);

  // No shader is compiled mid-run (each one stalled its frame): the select
  // screen's warm-up covered everything — speed lines, a new stage, the
  // particles of an unlock burst.
  const before = await f.evaluate(() => (window as any).__dash.programs().length);
  await debug(f, 'setDist', 1990);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.locked), { timeout: 20_000 }).toEqual(['miles', 'nicole', 'jake', 'liam']);
  await page.waitForTimeout(1500);
  expect(await f.evaluate(() => (window as any).__dash.programs().length)).toBe(before);
});

test('obstacles: jump a fairing, slide under a gantry, hop off before the train ends', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  const f = await game(page);
  await page.keyboard.press('Enter'); // the host focuses the game: Enter starts as the highlighted traveler (Chris)
  await expect.poll(async () => (await st(f)).mode).toBe('ready');
  await debug(f, 'go');
  await expect.poll(async () => (await st(f)).mode).toBe('run');
  await debug(f, 'calm');

  // Each check pauses the game, lines the hazard up just ahead, presses the
  // key, then lets it run — so a slow test machine can't miss the timing.
  const meet = async (type: string, ahead: number, key: string | null) => {
    await debug(f, 'pause', true);
    await debug(f, 'spawn', type, type === 'gantry' ? -1 : 1, ahead);
    if (key) await page.keyboard.press(key);
    await debug(f, 'pause', false);
    await page.waitForTimeout(1500);
  };
  await meet('hump', 4, 'ArrowUp');
  expect((await st(f)).mode).toBe('run');
  await meet('gantry', 3, 'ArrowDown');
  expect((await st(f)).mode).toBe('run');
  await meet('crow', 3, 'ArrowDown');
  expect((await st(f)).mode).toBe('run');

  // A train ending: hop to another before its nose runs out…
  await debug(f, 'pause', true);
  await debug(f, 'gap', 1, 20);
  await page.keyboard.press('ArrowRight');
  await debug(f, 'pause', false);
  await page.waitForTimeout(4000);
  expect((await st(f)).mode).toBe('run');
  // …or stay on it and fall.
  await debug(f, 'lane', 2);
  await debug(f, 'gap', 2, 15);
  await expect.poll(async () => (await st(f)).mode, { timeout: 20_000 }).not.toBe('run');
});

// ---- every traveller's special skill (user, Oct 12 2026) --------------------------------------
const ALL = ['emily', 'miles', 'nicole', 'jake', 'liam'];
async function everyoneUnlocked(page: Page) {
  await page.addInitScript((u) => { if (window.top === window) localStorage.setItem('epicasia.shinkansen.unlocked', JSON.stringify(u)); }, ALL);
}
const skills = (f: Frame) => f.evaluate(() => { const d = (window as any).__dash; return { mode: d.mode, coins: d.coins, sliding: d.sliding, air: d.air, spring: d.spring, ...d.skills }; });
/** Ends the run and goes back to the ring. */
async function changeHero(page: Page, f: Frame) {
  await debug(f, 'gameOver', 100);
  await expect.poll(async () => (await st(f)).mode, { timeout: 15_000 }).toBe('gameover');
  await page.frameLocator('[data-testid="game-frame"]').getByRole('button', { name: 'CHANGE HERO' }).click();
  await expect.poll(async () => (await st(f)).mode).toBe('select');
}

test('skills: Chris’s pickaxe smashes a fairing (then needs a moment), Bennett glides, Miles double-jumps every jump', async ({ page }) => {
  await everyoneUnlocked(page);
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  const f = await game(page);
  const fast = { timeout: 10_000, intervals: [50] };

  // Chris: the first fairing in his way is smashed; one straight after, while the pickaxe recovers, isn't.
  await start(page, f, 0);
  await debug(f, 'calm');
  await debug(f, 'spawn', 'hump', 1, 40);
  await expect.poll(async () => (await skills(f)).smashes, fast).toBe(1);
  expect((await skills(f)).mode).toBe('run');
  await debug(f, 'spawn', 'hump', 1, 30);
  await expect.poll(async () => (await skills(f)).mode, fast).toBe('crash');
  expect((await skills(f)).smashes).toBe(1);
  await changeHero(page, f);

  // Bennett: hold the jump and the poncho glides — far longer in the air than a plain jump (~0.74 s).
  await start(page, f, 1);
  await debug(f, 'calm');
  // (paused, stepping exact game time, so a slow runner can't miss it: a plain jump's whole fall takes ~0.37 s)
  await debug(f, 'pause', true);
  await page.keyboard.down('ArrowUp');
  await debug(f, 'step', 40); // past the top of the jump
  expect((await skills(f)).gliding).toBe(true);
  await debug(f, 'step', 300);
  expect((await skills(f)).air).toBe(false);
  await page.keyboard.up('ArrowUp');
  await debug(f, 'pause', false);
  expect((await skills(f)).glides).toBeGreaterThan(0.6);
  await changeHero(page, f);

  // Miles: a double jump on every jump, no spring needed. (Paused, stepping exact game time, so a slow runner can't miss the moment.)
  await start(page, f, 3);
  await debug(f, 'calm');
  await debug(f, 'pause', true);
  for (const n of [1, 2]) {
    await page.keyboard.press('ArrowUp');
    await debug(f, 'step', 15); // a quarter of a second: up in the air
    expect((await st(f)).y).toBeGreaterThan(0.5);
    await page.keyboard.press('ArrowUp');
    await debug(f, 'step', 1);
    expect((await skills(f)).doubles).toBe(n);
    await debug(f, 'step', 180); // down again
    expect((await skills(f)).air).toBe(false);
  }
  await debug(f, 'pause', false);
  expect((await skills(f)).spring).toBe(false);
});

test('skills: Emily’s endless slide, Nicole’s boba magnet and crow ducking, Jake’s manhole skateboard', async ({ page }) => {
  await everyoneUnlocked(page);
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  const f = await game(page);
  const fast = { timeout: 10_000, intervals: [50] };

  // Emily: hold the slide and she keeps sliding; let go and she gets up.
  await start(page, f, 2);
  await debug(f, 'calm');
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await skills(f)).sliding, fast).toBe(true);
  await page.waitForTimeout(2500); // (a plain slide lasts 0.72 s)
  expect((await skills(f)).sliding).toBe(true);
  await page.keyboard.up('ArrowDown');
  await expect.poll(async () => (await skills(f)).sliding, fast).toBe(false);
  await changeHero(page, f);

  // Nicole: an onigiri on the next train over comes to her, and she ducks a crow by herself.
  await start(page, f, 4);
  await debug(f, 'calm');
  await debug(f, 'spawn', 'onigiri', 0, 30);
  await expect.poll(async () => (await skills(f)).coins, fast).toBe(1);
  expect((await skills(f)).magnets).toBe(1);
  await debug(f, 'spawn', 'crow', 1, 40);
  await expect.poll(async () => (await skills(f)).autoSlides, fast).toBe(1);
  await page.waitForTimeout(3000);
  expect((await skills(f)).mode).toBe('run');
  await changeHero(page, f);

  // Jake: the 40th onigiri brings the skateboard — he ploughs through a pantograph and rolls over a gap.
  await start(page, f, 5);
  await debug(f, 'calm');
  await debug(f, 'boardCount', 39);
  await debug(f, 'spawn', 'onigiri', 1, 30);
  await expect.poll(async () => (await skills(f)).boards, fast).toBe(1);
  expect((await skills(f)).boardCount).toBe(0);
  await debug(f, 'spawn', 'panto', 1, 40);
  await debug(f, 'gap', 1, 80);
  await page.waitForTimeout(7000);
  const s = await skills(f);
  expect(s.mode).toBe('run');
  expect(s.boardT).toBeGreaterThan(0);
});

test('skills: Mei’s kawaii charm — a tap pops what’s in her way into hearts, then needs a moment', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  const f = await game(page);
  const fast = { timeout: 10_000, intervals: [50] };
  const charm = () => f.evaluate(() => (window as any).__dash.charm);
  await start(page, f, 7); // Mei plays from the start
  await debug(f, 'calm');
  expect((await charm()).ready).toBe(true);
  // a tap (not a swipe) charms: a fairing and a gantry in her lane pop instead of stopping her
  const box = (await page.getByTestId('game-frame').boundingBox())!;
  await debug(f, 'pause', true);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.5);
  await debug(f, 'spawn', 'hump', 1, 12);
  await debug(f, 'spawn', 'gantry', 1, 30);
  await debug(f, 'step', 180); // 3 s: both reached inside the charm's 2.5 s, and it's over
  await debug(f, 'pause', false);
  expect(await charm()).toMatchObject({ on: false, charms: 1, charmed: 2, ready: false });
  expect((await st(f)).mode).toBe('run');
  // straight after, it's recharging: a tap doesn't charm, and the next fairing stops her
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.5);
  expect((await charm()).charms).toBe(1);
  await debug(f, 'spawn', 'hump', 1, 30);
  await expect.poll(async () => (await st(f)).mode, fast).toBe('crash');
});

test('every time you pass Kyoto the trains go faster, and so does the song (a key higher); the pause menu switches the music', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  const f = await game(page);
  const at = () => f.evaluate(() => { const d = (window as any).__dash; return { speed: d.speed, round: d.round, music: d.music }; });
  await start(page, f, 0);
  await debug(f, 'calm');
  await expect.poll(async () => (await at()).music.on).toBe(true); // (the song started with the first tap)
  const lap1 = await at();
  expect(lap1.music.bpm).toBeGreaterThanOrEqual(124);
  expect(lap1.music.bpm).toBeLessThanOrEqual(132);
  let last = lap1;
  for (const round of [2, 3]) {
    await debug(f, 'setDist', (round - 1) * 5000 + 600); // past Kyoto, and past the 400 m the new gear eases in over
    await debug(f, 'calm');
    await expect.poll(async () => (await at()).round).toBe(round);
    const now = await at();
    expect(now.speed).toBeGreaterThan(last.speed + 3);
    expect(now.music.bpm).toBeGreaterThan(last.music.bpm);
    expect(now.music.lap).toBe(round - 1);
    last = now;
  }
  const fr = page.frameLocator('[data-testid="game-frame"]');
  await fr.getByRole('button', { name: 'Pause' }).click();
  await expect(fr.locator('#pmusic')).toHaveText('MUSIC: ON');
  await fr.locator('#pmusic').click();
  await expect(fr.locator('#pmusic')).toHaveText('MUSIC: OFF');
  expect((await at()).music.on).toBe(false);
  await fr.locator('#pmusic').click();
  expect((await at()).music.on).toBe(true);
});

test('missions, the multiplier, a lucky cat resetting it, your best gate, and herons and lantern arches on the way', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await signInWithFakeBackend(page, DATA);
  await page.addInitScript(() => { if (window.top === window) localStorage.setItem('epicasia.shinkansen.bestDist', '400'); });
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  const f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.best)).toBe(400); // this phone's furthest, from the app
  await start(page, f, 1); // (Bennett: Chris's pickaxe would smash the fairing below)
  // three different missions every run
  const ids = (await f.evaluate(() => (window as any).__dash.missions)).map((m: { id: string }) => m.id);
  expect(new Set(ids).size).toBe(3);
  await debug(f, 'calm');
  await debug(f, 'missions', ['mult', 'neko', 'jumps']);

  // ×2: an onigiri is worth 50
  await debug(f, 'mult', 2);
  let before = (await st(f)).score;
  await debug(f, 'spawn', 'onigiri', 1, 8);
  await expect.poll(async () => (await st(f)).coins).toBe(1);
  expect((await st(f)).score - before).toBeGreaterThanOrEqual(50);
  // 750 m without a knock: up a step — and past your best, the gold gate
  expect(await f.evaluate(() => (window as any).__dash.bestPassed)).toBe(false);
  await debug(f, 'setDist', 760);
  await debug(f, 'calm');
  await expect.poll(() => f.evaluate(() => (window as any).__dash.mult)).toBe(3);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.bestPassed)).toBe(true);
  // a mission done: +500
  before = (await st(f)).score;
  await debug(f, 'mult', 4);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.missions.find((m: { id: string }) => m.id === 'mult').done)).toBe(true);
  expect((await st(f)).score - before).toBeGreaterThanOrEqual(500);
  // a lucky cat (and its mission), then a fairing: the cat saves you and the multiplier starts again
  await debug(f, 'spawn', 'neko', 1, 8);
  await expect.poll(async () => (await st(f)).shield).toBe(true);
  expect((await f.evaluate(() => (window as any).__dash.missions)).filter((m: { done: boolean }) => m.done).map((m: { id: string }) => m.id).sort()).toEqual(['mult', 'neko']);
  await debug(f, 'spawn', 'hump', 1, 10);
  await expect.poll(async () => (await st(f)).shield).toBe(false);
  expect(await f.evaluate(() => (window as any).__dash.mult)).toBe(1);
  expect((await st(f)).mode).toBe('run');

  // in the rice fields the crows are herons; in Kyoto the gantries are lantern arches
  await debug(f, 'setDist', 1300);
  await debug(f, 'calm');
  await debug(f, 'spawn', 'crow', 0, 40);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.shown('heron').length)).toBeGreaterThan(0);
  expect(await f.evaluate(() => (window as any).__dash.shown('crow').length)).toBe(0);
  await debug(f, 'setDist', 4300);
  await debug(f, 'calm');
  await debug(f, 'spawn', 'gantry', 0, 40);
  await expect.poll(() => f.evaluate(() => (window as any).__dash.shown('lantern').length)).toBeGreaterThan(0);

  // the run's distance goes back to the app as this phone's best
  await debug(f, 'gameOver', 5000);
  await expect.poll(() => page.evaluate(() => Number(localStorage.getItem('epicasia.shinkansen.bestDist')))).toBeGreaterThanOrEqual(4300);
  expect(errors).toEqual([]);
});

test('the first time: the countdown waits on a how-to-play card until you move', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await page.addInitScript(() => { if (window.top === window) localStorage.removeItem('epicasia.shinkansen.tips'); });
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  const f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.tips)).toBe(true);
  await tapFront(page, f, 0);
  await expect.poll(async () => (await st(f)).mode).toBe('ready');
  await page.waitForTimeout(3500); // (a countdown is 2.4 s)
  expect((await st(f)).mode).toBe('ready');
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await st(f)).mode).toBe('run');
  expect(await f.evaluate(() => (window as any).__dash.tips)).toBe(false);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('epicasia.shinkansen.tips'))).toBe('1');
});
