import { expect, test, type Frame, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Sushi Conveyor: tap the plates the order tickets ask for as the belt speeds
// up, in an iframe like the other arcade games. Runs are saved to game_scores
// as sushi_conveyor. The game exposes window.__sushi (state, and cheats in
// development).

test.describe.configure({ mode: 'serial', timeout: 150_000 });

const SARAH = '00000000-0000-4000-8000-0000000000aa';
const TOM = '00000000-0000-4000-8000-0000000000bb';
const run = (id: string, user_id: string, score: number, level: number, hero: string, game = 'sushi_conveyor') => ({
  id, game, user_id, score, level, round: 1, hero, created_at: `2026-10-0${id.length}T10:00:00Z`,
});
const DATA = {
  profiles: [
    { id: USER_ID, display_name: 'Test Traveler', avatar_url: null },
    { id: SARAH, display_name: 'Sarah Lee', avatar_url: null },
    { id: TOM, display_name: 'Tom Park', avatar_url: null },
  ],
  game_scores: [
    run('t1', TOM, 18000, 4, 'mei'),
    run('s1', SARAH, 26400, 5, 'emily'),
    run('m1', USER_ID, 900, 1, 'chris'),
    run('r1', TOM, 50000, 4, 'chris', 'godzilla_rampage'), // another game's score: not on this board
  ],
};

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}
async function game(page: Page, mode = 'seat'): Promise<Frame> {
  await expect(page.getByTestId('game-frame')).toBeVisible();
  let frame: Frame | undefined;
  await expect
    .poll(async () => {
      frame = page.frames().find((f) => f.url() === 'about:srcdoc');
      return frame ? frame.evaluate(() => (window as any).__sushi?.mode ?? null).catch(() => null) : null;
    }, { timeout: 15_000 })
    .toBe(mode);
  // The loading screen (the game's icon on a dark stage) has faded away once the game is up.
  await expect(page.getByTestId('game-loading')).toHaveCount(0);
  return frame!;
}
const st = (f: Frame) =>
  f.evaluate(() => {
    const s = (window as any).__sushi;
    return { mode: s.mode, score: s.score, time: s.time, level: s.level, combo: s.combo, strikes: s.strikes, served: s.served, hero: s.hero, night: s.night, counter: s.counter, high: s.high, orders: s.orders };
  });
const debug = (f: Frame, fn: string, ...args: unknown[]) =>
  f.evaluate(([n, a]) => (window as any).__sushi.debug[n as string](...(a as unknown[])), [fn, args] as const);
/** Taps the plate with this id where it is on the belt now. */
async function tap(page: Page, f: Frame, id: number) {
  const box = (await page.getByTestId('game-frame').boundingBox())!;
  const p = await f.evaluate((i) => (window as any).__sushi.plates().find((x: { id: number }) => x.id === i), id);
  expect(p, `plate ${id} on the belt`).toBeTruthy();
  await page.mouse.click(box.x + p.x, box.y + p.y);
}

test('the board: each player’s best run, ties share a rank', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games');
  await page.getByRole('tab', { name: 'Sushi Conveyor' }).click();
  await expect(page.getByTestId('games-title')).toHaveText('Sushi Conveyor');
  await page.getByTestId('games-play').click();
  await expect(page.getByRole('heading', { name: 'Sushi Conveyor' })).toBeVisible();
  const rows = page.getByTestId('high-score');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAccessibleName('1. Sarah Lee, 26,400, as Emily · belt 5');
  await expect(rows.nth(1)).toHaveAccessibleName('2. Tom Park, 18,000, as Mei · belt 4');
  await expect(rows.nth(2)).toHaveAccessibleName('3. Test Traveler (you), 900, as Chris · belt 1');
  await page.screenshot({ path: 'test-results/sushi-board.png' });
});

test('play: pick a seat, serve orders, gold triples, wasabi and unordered plates cost time, a late order is a strike, the run is saved', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/sushi');
  await page.getByTestId('sushi-play').click();
  const f = await game(page);
  const ui = page.frameLocator('[data-testid="game-frame"]');
  expect((await st(f)).high).toBe(26400); // the group's best to beat
  await page.screenshot({ path: 'test-results/sushi-seat.png' });
  // A perfect player is never let down by the belt: in 20 headless rounds no ticket runs out.
  const sims = await f.evaluate(() => Array.from({ length: 20 }, (_, i) => (window as any).__sushi.simulate(i + 1)));
  expect(sims.filter((r: { strikes: number }) => r.strikes > 0), JSON.stringify(sims.slice(0, 3))).toEqual([]);
  expect(Math.min(...sims.map((r: { level: number }) => r.level))).toBe(5); // and every round reaches the fastest belt

  await ui.getByRole('button', { name: 'Mei' }).click();
  await expect(ui.getByRole('button', { name: 'Mei' })).toHaveAttribute('aria-pressed', 'true');
  await expect(ui.getByRole('button', { name: /^Counter/ })).toBeHidden(); // (the late-night counter is a secret)
  await ui.getByRole('button', { name: 'Start' }).click();
  await expect.poll(async () => (await st(f)).mode).toBe('ready');
  await debug(f, 'skip');
  await expect.poll(async () => (await st(f)).mode).toBe('play');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/sushi-play.png' });
  expect((await st(f)).hero).toBe('mei');

  // A ticket for salmon and tuna; a gold salmon, a tuna, some wasabi and an edamame nobody ordered.
  await debug(f, 'calm');
  await debug(f, 'clear');
  await debug(f, 'order', ['salmon', 'tuna']);
  const salmon = await debug(f, 'spawn', 'salmon', { gold: true, at: 2 });
  const tuna = await debug(f, 'spawn', 'tuna', { at: 4 });
  const wasabi = await debug(f, 'spawn', 'wasabi', { at: 6 });
  const edamame = await debug(f, 'spawn', 'edamame', { at: 8 });

  const s0 = await st(f);
  await tap(page, f, salmon as number);
  await expect.poll(async () => (await st(f)).combo).toBe(1);
  expect((await st(f)).score).toBe(s0.score + 300); // 100 × 3 for gold
  expect((await st(f)).orders[0].items).toEqual([{ type: 'salmon', filled: true }, { type: 'tuna', filled: false }]);
  await tap(page, f, tuna as number);
  await expect.poll(async () => (await st(f)).served).toBe(s0.served + 1);
  expect((await st(f)).orders).toEqual([]);
  expect((await st(f)).score).toBeGreaterThanOrEqual(s0.score + 300 + 100 + 200); // + the order's bonus

  const t1 = (await st(f)).time;
  await tap(page, f, edamame as number); // nobody ordered it: −3 s, and the combo's gone
  await expect.poll(async () => (await st(f)).combo).toBe(0);
  expect((await st(f)).time).toBeCloseTo(t1 - 3, 1);
  expect(await f.evaluate((i) => (window as any).__sushi.plates().some((p: { id: number }) => p.id === i), edamame)).toBe(true); // (it stays on the belt)
  await tap(page, f, wasabi as number); // too hot: −5 s
  await expect.poll(async () => (await st(f)).time).toBeCloseTo(t1 - 8, 1);

  // An order that runs out of patience is a strike.
  await debug(f, 'order', ['uni']);
  await debug(f, 'expire');
  await debug(f, 'calm', false);
  await expect.poll(async () => (await st(f)).strikes).toBe(1);

  // Time's up: the round ends and is saved as Mei.
  await debug(f, 'setTime', 0.3);
  await expect.poll(async () => (await st(f)).mode).toBe('over');
  await expect(ui.getByRole('button', { name: 'Play again' })).toBeVisible();
  await page.screenshot({ path: 'test-results/sushi-over.png' });
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length, { timeout: 15_000 }).toBe(1);
  const saved = (backend.inserts.find((i) => i.table === 'game_scores')!.body as unknown as Record<string, unknown>[])[0];
  expect(saved).toMatchObject({ game: 'sushi_conveyor', user_id: USER_ID, round: 1, hero: 'mei' });
  expect(saved.score).toBe(Math.round((await st(f)).score));

  // Play again starts a fresh round; Change seat goes back to the counter; leaving goes to the board.
  await ui.getByRole('button', { name: 'Play again' }).click();
  await expect.poll(async () => (await st(f)).mode).toBe('ready');
  expect((await st(f)).score).toBe(0);
  await debug(f, 'skip');
  await expect.poll(async () => (await st(f)).mode).toBe('play');
  await ui.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => f.evaluate(() => (window as any).__sushi.paused)).toBe(true);
  const frozen = (await st(f)).time;
  await page.waitForTimeout(600);
  expect((await st(f)).time).toBe(frozen);
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Sushi Conveyor' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the belt speeds up every 15 s: bigger orders, rarer fish', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/sushi/play');
  const f = await game(page);
  await page.frameLocator('[data-testid="game-frame"]').getByRole('button', { name: 'Start' }).click();
  await debug(f, 'skip');
  await expect.poll(async () => (await st(f)).mode).toBe('play');
  expect((await st(f)).level).toBe(1);
  await debug(f, 'setT', 30);
  await expect.poll(async () => (await st(f)).level).toBe(3);
  await debug(f, 'setT', 61);
  await expect.poll(async () => (await st(f)).level).toBe(5);
});

test('the lucky cat: a secret late-night counter, remembered with your seat', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/sushi/play');
  let f = await game(page);
  let ui = page.frameLocator('[data-testid="game-frame"]');
  await ui.getByRole('button', { name: 'Liam' }).click();
  await ui.getByRole('button', { name: 'Start' }).click();
  await debug(f, 'skip');
  await expect.poll(async () => (await st(f)).mode).toBe('play');
  await debug(f, 'calm');
  const cat = await debug(f, 'spawn', 'luckycat', { at: 3 });
  const before = (await st(f)).score;
  await tap(page, f, cat as number);
  await expect.poll(async () => (await st(f)).night).toBe(true);
  expect((await st(f)).score).toBe(before + 1000);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('epicasia.sushi.seat') ?? '{}').night)).toBe(true);

  // Next time: the seat is remembered and the late-night counter can be picked.
  await page.reload();
  await page.getByLabel('Skip intro').click();
  f = await game(page);
  ui = page.frameLocator('[data-testid="game-frame"]');
  await expect(ui.getByRole('button', { name: 'Liam' })).toHaveAttribute('aria-pressed', 'true');
  await ui.getByRole('button', { name: 'Counter: by day' }).click();
  await expect(ui.getByRole('button', { name: 'Counter: late night' })).toBeVisible();
  await ui.getByRole('button', { name: 'Start' }).click();
  await expect.poll(async () => (await st(f)).counter).toBe('night');
  await debug(f, 'skip');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/sushi-night.png' });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('epicasia.sushi.seat') ?? '{}').counter)).toBe('night');
});

test('the first time: how to play, before the countdown', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await page.addInitScript(() => { if (window.top === window) localStorage.removeItem('epicasia.sushi.tips'); });
  await open(page, '/games/sushi/play');
  const f = await game(page);
  const ui = page.frameLocator('[data-testid="game-frame"]');
  await ui.getByRole('button', { name: 'Start' }).click();
  await expect(ui.getByRole('dialog', { name: 'How to play' })).toBeVisible();
  expect((await st(f)).mode).toBe('tips');
  await ui.getByRole('button', { name: 'Got it' }).click();
  await expect.poll(async () => (await st(f)).mode).toBe('ready');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('epicasia.sushi.tips'))).toBe('1');
});
