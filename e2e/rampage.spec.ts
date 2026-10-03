import { expect, test, type Frame, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Godzilla Rampage: the arcade game (assets/games/rampage.html) runs in an
// iframe on web; finished runs are saved to game_scores and the board shows
// each player's best. The game exposes window.__rampage (state getters, and
// cheats in development) for these tests.

const SARAH = '00000000-0000-4000-8000-0000000000aa';
const TOM = '00000000-0000-4000-8000-0000000000bb';

const run = (id: string, user_id: string, score: number, level: number, hero: string, created_at: string) => ({
  id,
  game: 'godzilla_rampage',
  user_id,
  score,
  level,
  round: 1,
  hero,
  created_at,
});

const DATA = {
  profiles: [
    { id: USER_ID, display_name: 'Test Traveler', avatar_url: null },
    { id: SARAH, display_name: 'Sarah Lee', avatar_url: null },
    { id: TOM, display_name: 'Tom Park', avatar_url: null },
  ],
  game_scores: [
    run('s1', SARAH, 8200, 3, 'shea', '2026-10-01T10:00:00Z'),
    run('s2', SARAH, 3100, 1, 'shea', '2026-10-01T11:00:00Z'),
    run('t1', TOM, 8200, 2, 'chris', '2026-10-02T10:00:00Z'),
    run('m1', USER_ID, 1500, 1, 'chris', '2026-10-02T12:00:00Z'),
  ],
};

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

/** The game's iframe, once its script has started. */
async function game(page: Page): Promise<Frame> {
  await expect(page.getByTestId('game-frame')).toBeVisible();
  let frame: Frame | undefined;
  await expect
    .poll(async () => {
      frame = page.frames().find((f) => f.url() === 'about:srcdoc');
      return frame ? frame.evaluate(() => (window as any).__rampage?.mode ?? null).catch(() => null) : null;
    })
    .toBe('select');
  return frame!;
}

const state = (f: Frame) =>
  f.evaluate(() => {
    const r = (window as any).__rampage;
    return { mode: r.mode, score: r.score, lives: r.lives, level: r.level, hero: r.hero, hi: r.hi, player: r.player };
  });

test('the board: each player’s best run, ties share a rank', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games');
  await page.getByTestId('game-godzilla_rampage').click();
  await expect(page.getByRole('heading', { name: 'Godzilla Rampage' })).toBeVisible();
  const rows = page.getByTestId('high-score');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAccessibleName('1. Sarah Lee, 8,200, as Shea · level 3');
  await expect(rows.nth(1)).toHaveAccessibleName('1. Tom Park, 8,200, as Chris · level 2');
  await expect(rows.nth(2)).toHaveAccessibleName('3. Test Traveler (you), 1,500, as Chris · level 1');
  await expect(page.getByTestId('my-best')).toHaveText('Your best 1,500');
  await page.screenshot({ path: 'test-results/rampage-board.png' });
});

test('play: choose a hero, move, power up, lose, save the run, leave', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/rampage');
  await page.getByTestId('rampage-play').click();
  const f = await game(page);
  const ui = page.frameLocator('[data-testid="game-frame"]');

  // HIGH SCORE to beat = the group's best saved run.
  expect((await state(f)).hi).toBe(8200);
  await page.screenshot({ path: 'test-results/rampage-select.png' });

  // Pick Shea by tapping her card, then start the level.
  const box = (await page.getByTestId('game-frame').boundingBox())!;
  const canvas = (await ui.locator('canvas').boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height * (212 / 288));
  await expect.poll(async () => (await state(f)).hero).toBe('shea');
  await expect.poll(async () => (await state(f)).mode).toBe('intro');
  await ui.getByRole('button', { name: 'Jump' }).click();
  await expect.poll(async () => (await state(f)).mode).toBe('play');
  expect(box.width).toBeGreaterThan(300);

  // The on-screen pad moves her right.
  const x0 = (await state(f)).player.x;
  const right = ui.getByRole('button', { name: 'Move right' });
  await right.dispatchEvent('pointerdown');
  await page.waitForTimeout(500);
  await right.dispatchEvent('pointerup');
  expect((await state(f)).player.x).toBeGreaterThan(x0 + 5);

  // Keyboard works too.
  const x1 = (await state(f)).player.x;
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowLeft');
  expect((await state(f)).player.x).toBeLessThan(x1 - 5);

  // The candy cane: SWING lights up while it lasts.
  await f.evaluate(() => (window as any).__rampage.debug.giveTool());
  await expect(ui.locator('#atk')).toHaveClass(/ready/);
  await page.screenshot({ path: 'test-results/rampage-play.png' });

  // Game over → the run is saved → TRY AGAIN / CHANGE HERO.
  await f.evaluate(() => (window as any).__rampage.debug.gameOver(4321));
  await expect.poll(async () => (await state(f)).mode, { timeout: 8000 }).toBe('gameover');
  await expect(ui.getByRole('button', { name: 'TRY AGAIN' })).toBeVisible();
  await expect(ui.getByRole('button', { name: 'CHANGE HERO' })).toBeVisible();
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length).toBe(1);
  const saved = backend.inserts.find((i) => i.table === 'game_scores')!.body as unknown as Record<string, unknown>[];
  expect(saved).toEqual([{ game: 'godzilla_rampage', user_id: USER_ID, score: 4321, level: 1, round: 1, hero: 'shea' }]);
  await page.screenshot({ path: 'test-results/rampage-over.png' });

  // CHANGE HERO goes back to the select screen.
  await ui.getByRole('button', { name: 'CHANGE HERO' }).click();
  await expect.poll(async () => (await state(f)).mode).toBe('select');

  // ✕ leaves the game; this phone's best is now 4,321.
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0);
  await expect(page.getByTestId('my-best')).toHaveText('Your best 4,321');
  expect(errors).toEqual([]);
});

test('a run finished offline is saved on the next visit', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, DATA);
  let offline = true;
  await page.route('**/rest/v1/game_scores*', (route) =>
    offline && route.request().method() === 'POST' ? route.abort() : route.fallback(),
  );
  await open(page, '/games/rampage');
  await page.getByTestId('rampage-play').click();
  const f = await game(page);
  await page.keyboard.press('Enter'); // the host focuses the game: Enter picks the highlighted hero (Chris)
  await expect.poll(async () => (await state(f)).mode).toBe('intro');
  await page.keyboard.press('Enter'); // …and Enter again starts the level
  await expect.poll(async () => (await state(f)).mode).toBe('play');
  await f.evaluate(() => (window as any).__rampage.debug.gameOver(2500));
  await expect.poll(async () => (await state(f)).mode, { timeout: 8000 }).toBe('gameover');
  await page.waitForTimeout(500);
  expect(backend.inserts.filter((i) => i.table === 'game_scores')).toHaveLength(0);

  offline = false;
  await page.frameLocator('[data-testid="game-frame"]').getByRole('button', { name: 'Leave the game' }).click();
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length).toBe(1);
  expect(backend.inserts.find((i) => i.table === 'game_scores')!.body).toEqual([
    { game: 'godzilla_rampage', user_id: USER_ID, score: 2500, level: 1, round: 1, hero: 'chris' },
  ]);
});
