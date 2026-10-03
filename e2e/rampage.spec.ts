import { expect, test, type Frame, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Godzilla Rampage: the arcade game (assets/games/rampage.html) runs in an
// iframe on web; finished runs are saved to game_scores and the board shows
// each player's best. The game exposes window.__rampage (state getters, and
// cheats in development) for these tests.

// One at a time and with a long budget: the game renders 3D in software
// here (slow on CI runners), and parallel copies starve each other of CPU.
test.describe.configure({ mode: 'serial', timeout: 120_000 });

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

/** A point on the joystick pushed toward a direction ('U' | 'D' | 'L' | 'R', or a diagonal like 'UR'), in page coordinates. */
async function stickPoint(page: Page, dir: string) {
  const ui = page.frameLocator('[data-testid="game-frame"]');
  const b = (await ui.getByRole('img', { name: /Joystick/ }).boundingBox())!;
  const r = b.width * 0.36;
  const dx = (dir.includes('R') ? 1 : 0) - (dir.includes('L') ? 1 : 0);
  const dy = (dir.includes('D') ? 1 : 0) - (dir.includes('U') ? 1 : 0);
  const n = Math.hypot(dx, dy) || 1;
  return { x: b.x + b.width / 2 + (dx / n) * r, y: b.y + b.height / 2 + (dy / n) * r };
}

const gameUi = (page: Page) => page.frameLocator('[data-testid="game-frame"]');

const state = (f: Frame) =>
  f.evaluate(() => {
    const r = (window as any).__rampage;
    return { mode: r.mode, score: r.score, lives: r.lives, level: r.level, hero: r.hero, hi: r.hi, player: r.player };
  });

test('the board: each player’s best run, ties share a rank', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games');
  await page.getByTestId('game-godzilla_rampage').click();
  await page.getByTestId('games-play').click();
  await expect(page.getByRole('heading', { name: 'Godzilla Rampage' })).toBeVisible();
  const rows = page.getByTestId('high-score');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAccessibleName('1. Sarah Lee, 8,200, as Shea · level 3');
  await expect(rows.nth(1)).toHaveAccessibleName('1. Tom Park, 8,200, as Chris · level 2');
  await expect(rows.nth(2)).toHaveAccessibleName('3. Test Traveler (you), 1,500, as Chris · level 1');
  await expect(page.getByTestId('my-best')).toHaveText('Your best 1,500');
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

  // It draws in 3D (WebGL), not only the HUD fallback.
  expect(await f.evaluate(() => (window as any).__rampage.gl)).toBe(true);

  // Pick Shea by tapping her card, then start the level.
  const box = (await page.getByTestId('game-frame').boundingBox())!;
  const pt = await f.evaluate(() => (window as any).__rampage.screenPoint(96, 212));
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
  await expect.poll(async () => (await state(f)).hero).toBe('shea');
  await expect.poll(async () => (await state(f)).mode).toBe('intro');
  await ui.getByRole('button', { name: 'Jump' }).click();
  await expect.poll(async () => (await state(f)).mode).toBe('play');
  expect(box.width).toBeGreaterThan(300);

  // The joystick moves her right (a real press pushed right on the stick).
  await f.evaluate(() => (window as any).__rampage.debug.calm());
  const x0 = (await state(f)).player.x;
  const rb = await stickPoint(page, 'R');
  await page.mouse.move(rb.x, rb.y);
  await page.mouse.down();
  await expect.poll(async () => (await state(f)).player.x, { timeout: 15000 }).toBeGreaterThan(x0 + 5);
  await page.mouse.up();

  // Keyboard works too.
  const x1 = (await state(f)).player.x;
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await state(f)).player.x, { timeout: 15000 }).toBeLessThan(x1 - 5);
  await page.keyboard.up('ArrowLeft');

  // The candy cane: SWING lights up while it lasts.
  await f.evaluate(() => (window as any).__rampage.debug.giveTool());
  await expect(ui.locator('#atk')).toHaveClass(/ready/);

  // Game over → the run is saved → TRY AGAIN / CHANGE HERO.
  await f.evaluate(() => (window as any).__rampage.debug.gameOver(4321));
  await expect.poll(async () => (await state(f)).mode, { timeout: 8000 }).toBe('gameover');
  await expect(ui.getByRole('button', { name: 'TRY AGAIN' })).toBeVisible();
  await expect(ui.getByRole('button', { name: 'CHANGE HERO' })).toBeVisible();
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length).toBe(1);
  const saved = backend.inserts.find((i) => i.table === 'game_scores')!.body as unknown as Record<string, unknown>[];
  expect(saved).toEqual([{ game: 'godzilla_rampage', user_id: USER_ID, score: 4321, level: 1, round: 1, hero: 'shea' }]);

  // CHANGE HERO goes back to the select screen.
  await ui.getByRole('button', { name: 'CHANGE HERO' }).click();
  await expect.poll(async () => (await state(f)).mode).toBe('select');

  // Leaving is behind the pause menu (no accidental exits next to the joystick).
  await ui.getByRole('button', { name: 'Pause' }).click();
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByTestId('my-best')).toHaveText('Your best 4,321', { timeout: 15000 });
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
  await page.frameLocator('[data-testid="game-frame"]').getByRole('button', { name: 'Pause' }).click();
  await page.frameLocator('[data-testid="game-frame"]').getByRole('button', { name: 'Leave the game' }).click();
  // (generous: the 3D game renders in software here, which is slow when tests run in parallel)
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length, { timeout: 15000 }).toBe(1);
  expect(backend.inserts.find((i) => i.table === 'game_scores')!.body).toEqual([
    { game: 'godzilla_rampage', user_id: USER_ID, score: 2500, level: 1, round: 1, hero: 'chris' },
  ]);
});

test('every level can be climbed: a safe ladder up from each girder, none into Godzilla', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/rampage');
  await page.getByTestId('rampage-play').click();
  const f = await game(page);
  expect(await f.evaluate(() => (window as any).__rampage.routeProblems())).toEqual([]);

  // Level 3 played through from the top girder: up past Godzilla, to the ledge, rescue.
  await page.keyboard.press('Enter');
  await f.evaluate(() => (window as any).__rampage.debug.setLevel(3));
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(f)).mode).toBe('play');
  await f.evaluate(() => { const d = (window as any).__rampage.debug; d.calm(); d.place(96, 4); });
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await state(f)).player.g, { timeout: 15000 }).toBe(5);
  await page.keyboard.up('ArrowUp');
  expect((await state(f)).mode).toBe('play'); // not stomped
  // Walk right toward the ledge ladder (x 118). On a slow runner the hero can
  // overshoot it before the key is released, so step back if needed.
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(f)).player.x, { timeout: 15000 }).toBeGreaterThan(111);
  await page.keyboard.up('ArrowRight');
  if ((await state(f)).player.x > 125) {
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => (await state(f)).player.x, { timeout: 15000 }).toBeLessThan(124);
    await page.keyboard.up('ArrowLeft');
  }
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await state(f)).mode, { timeout: 15000 }).toBe('rescue');
  await page.keyboard.up('ArrowUp');
});

test('controls: forgiving ladders, sweep the joystick, pause menu', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/rampage');
  await page.getByTestId('rampage-play').click();
  const f = await game(page);
  const ui = page.frameLocator('[data-testid="game-frame"]');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(f)).mode).toBe('play');
  await f.evaluate(() => { const d = (window as any).__rampage.debug; d.calm(); d.place(143, 0); });

  // Up from 7 units beside the ladder (at x 150) grabs it, snaps on and climbs to the next girder.
  const up = await stickPoint(page, 'U');
  const left = await stickPoint(page, 'L');
  await page.mouse.move(up.x, up.y);
  await page.mouse.down();
  await expect.poll(async () => (await state(f)).player.st).toBe('climb');
  expect((await state(f)).player.x).toBe(150);
  await expect.poll(async () => (await state(f)).player.g, { timeout: 15000 }).toBe(1);
  // Sweep the same thumb round to the left without lifting: she walks left.
  const x1 = (await state(f)).player.x;
  await page.mouse.move(left.x, left.y, { steps: 4 });
  await expect.poll(async () => (await state(f)).player.x, { timeout: 15000 }).toBeLessThan(x1 - 4);
  await page.mouse.up();

  // Pause freezes the game; Resume carries on.
  await ui.getByRole('button', { name: 'Pause' }).click();
  await expect(ui.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  expect(await f.evaluate(() => (window as any).__rampage.menu)).toBe(true);
  await ui.getByRole('button', { name: 'RESUME' }).click();
  await expect(ui.getByRole('dialog', { name: 'Paused' })).toBeHidden();
  expect((await state(f)).mode).toBe('play');
});

test('the joystick never sticks: a lost release is overridden by the next touch', async ({ page }) => {
  // User, Oct 3 2026: on level 4 "my character was stuck walking against side".
  // A thumb sliding off the screen edge can lose its pointerup; the pad then
  // ignored every new touch and kept walking left into the wall.
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/rampage');
  await page.getByTestId('rampage-play').click();
  const f = await game(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(f)).mode).toBe('play');
  await f.evaluate(() => { const d = (window as any).__rampage.debug; d.setLevel(4); d.calm(); d.place(30, 0); });

  const press = (dir: 'L' | 'R', id: number) =>
    f.evaluate(([d, pid]) => {
      const stick = document.querySelector('.stick')!;
      const b = stick.getBoundingClientRect();
      const x = b.x + b.width / 2 + (d === 'L' ? -1 : 1) * b.width * 0.36;
      stick.dispatchEvent(new PointerEvent('pointerdown', { pointerId: pid as number, clientX: x, clientY: b.y + b.height / 2, bubbles: true, cancelable: true }));
    }, [dir, id] as const);

  await press('L', 7); // ...and its release never arrives
  await expect.poll(async () => (await state(f)).player.x, { timeout: 15000 }).toBe(4);
  // Against the wall she stands rather than walking on the spot.
  await expect.poll(async () => (await state(f)).player.vx).toBe(0);
  // A new touch takes over at once.
  await press('R', 8);
  await expect.poll(async () => (await state(f)).player.x, { timeout: 15000 }).toBeGreaterThan(12);
  // Lifting every finger lets go of everything.
  await f.evaluate(() => document.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true })));
  const x = (await state(f)).player.x;
  await page.waitForTimeout(600);
  expect(Math.abs((await state(f)).player.x - x)).toBeLessThan(3);
});

test('secret: smash the barrel at the start with a power-up → Girl Power; Emily plays for +15%', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/rampage');
  await page.getByTestId('rampage-play').click();
  let f = await game(page);
  expect(await f.evaluate(() => (window as any).__rampage.girlPower)).toBe(false);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(f)).mode).toBe('play');

  // The barrel stands where you start. Swinging at it without a power-up does nothing.
  expect(await f.evaluate(() => (window as any).__rampage.secret)).toEqual({ x: 30, broken: false });
  await f.evaluate(() => { const d = (window as any).__rampage.debug; d.calm(); d.place(34, 0); });
  await page.keyboard.press('x');
  expect(await f.evaluate(() => (window as any).__rampage.girlPower)).toBe(false);
  // With one (carried back down to the floor), it breaks open.
  await f.evaluate(() => (window as any).__rampage.debug.giveTool());
  await page.keyboard.press('x');
  await expect.poll(() => f.evaluate(() => (window as any).__rampage.girlPower)).toBe(true);
  expect(await f.evaluate(() => (window as any).__rampage.secret.broken)).toBe(true);
  expect((await state(f)).score).toBe(1000);

  // The app remembers it (the game's own storage is off in its sandbox).
  await gameUi(page).getByRole('button', { name: 'Pause' }).click();
  await gameUi(page).getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 15000 });
  await page.getByTestId('rampage-play').click();
  f = await game(page);
  expect(await f.evaluate(() => (window as any).__rampage.girlPower)).toBe(true);

  // Four heroes now: tap Emily (bottom-left card).
  const box = (await page.getByTestId('game-frame').boundingBox())!;
  const pt = await f.evaluate(() => (window as any).__rampage.screenPoint(48, 200));
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
  await expect.poll(async () => (await state(f)).hero).toBe('emily');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(f)).mode).toBe('play');
  // She rescues Chris, and earns 15% more: the 2,000 rescue is worth 2,300.
  await f.evaluate(() => (window as any).__rampage.debug.rescue());
  expect((await state(f)).score).toBe(2300);
  // (after the rescue, the bonus tally and on to level 2)
  await expect.poll(async () => (await state(f)).level, { timeout: 30000 }).toBe(2);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(f)).mode).toBe('play');

  await f.evaluate(() => (window as any).__rampage.debug.gameOver(3000));
  await expect.poll(async () => (await state(f)).mode, { timeout: 8000 }).toBe('gameover');
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length).toBeGreaterThan(0);
  const rows = backend.inserts.filter((i) => i.table === 'game_scores').flatMap((i) => i.body as unknown as Record<string, unknown>[]);
  expect(rows.at(-1)).toMatchObject({ hero: 'emily', score: 3000 });
  expect(errors).toEqual([]);
});

test('level 5 finale: Godzilla falls off the tower, fireworks, then the dance', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/rampage');
  await page.getByTestId('rampage-play').click();
  const f = await game(page);
  await page.keyboard.press('Enter');
  await f.evaluate(() => (window as any).__rampage.debug.setLevel(5));
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(f)).mode).toBe('play');
  expect((await state(f)).level).toBe(5);
  await f.evaluate(() => { const d = (window as any).__rampage.debug; d.calm(); d.rescue(); });
  expect(await f.evaluate(() => (window as any).__rampage.finale)).toBe(true);
  // He hits the ground…
  await expect.poll(() => f.evaluate(() => (window as any).__rampage.landed), { timeout: 20000 }).toBe(true);
  // …fireworks go up, and after the rescue and bonus it's the win screen.
  await expect.poll(async () => (await state(f)).mode, { timeout: 60000 }).toBe('win');
  expect(errors).toEqual([]);
});
