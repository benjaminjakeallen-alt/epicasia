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

/** Starts a run as the given traveler (tapping them on the line-up) and skips the countdown. */
async function start(page: Page, f: Frame, i: number) {
  const box = (await page.getByTestId('game-frame').boundingBox())!;
  const pt = await f.evaluate((n) => (window as any).__dash.heroPoint(n), i);
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
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

  await start(page, f, 2); // Emily
  expect((await st(f)).hero).toBe('emily');
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
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length).toBe(1);
  const saved = (backend.inserts.find((i) => i.table === 'game_scores')!.body as unknown as Record<string, unknown>[])[0];
  expect(saved).toMatchObject({ game: 'shinkansen_dash', user_id: USER_ID, level: 1, round: 1, hero: 'emily' });
  expect(saved.score).toBe((await st(f)).score);

  // CHANGE HERO → the line-up; leaving is behind the pause menu.
  await ui.getByRole('button', { name: 'CHANGE HERO' }).click();
  await expect.poll(async () => (await st(f)).mode).toBe('select');
  await ui.getByRole('button', { name: 'Pause' }).click();
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 15000 });
  expect(errors).toEqual([]);
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
