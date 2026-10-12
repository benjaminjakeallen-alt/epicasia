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

test('Emily is earned by reaching Mount Fuji; locked travellers stay a secret', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  let f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'nicole', 'jake']);
  // Tapping a locked traveler only says it's a secret (no name, no clue) and doesn't start.
  const tap = async (i: number) => {
    const box = (await page.getByTestId('game-frame').boundingBox())!;
    const pt = await f.evaluate((n) => (window as any).__dash.heroPoint(n), i);
    await page.mouse.click(box.x + pt.x, box.y + pt.y);
  };
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
  await expect.poll(() => f.evaluate(() => (window as any).__dash.locked), { timeout: 15_000 }).toEqual(['miles', 'nicole', 'jake']);
  const ui = page.frameLocator('[data-testid="game-frame"]');
  await ui.getByRole('button', { name: 'Pause' }).click();
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 15_000 });

  // Next time Emily is playable from the line-up; the others are still secrets.
  await page.getByTestId('dash-play').click();
  f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['miles', 'nicole', 'jake']);
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
  const box = (await page.getByTestId('game-frame').boundingBox())!;
  const tap = async (i: number) => {
    const pt = await f.evaluate((n) => (window as any).__dash.heroPoint(n), i);
    await page.mouse.click(box.x + pt.x, box.y + pt.y);
  };
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
  await debug(f, 'spawn', 'boba', 1, 4);
  await debug(f, 'pause', false);
  await page.waitForTimeout(1500);
  expect(await bobas()).toBe(0);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'nicole', 'jake']);
  // …a jump does, and Nicole is unlocked.
  await debug(f, 'pause', true);
  await debug(f, 'spawn', 'boba', 1, 4);
  await page.keyboard.press('ArrowUp');
  await debug(f, 'pause', false);
  await expect.poll(bobas, { timeout: 10_000 }).toBe(1);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'jake']);
  const ui = page.frameLocator('[data-testid="game-frame"]');
  await ui.getByRole('button', { name: 'Pause' }).click();
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 15_000 });

  // The app remembers: next time Nicole is in the line-up, and her runs save as her.
  await page.getByTestId('dash-play').click();
  f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'jake']);
  await start(page, f, 4);
  expect((await st(f)).hero).toBe('nicole');
  await debug(f, 'gameOver', 321);
  // (the first run, left from the pause menu, was saved as Chris)
  const scores = () => backend.inserts.filter((i) => i.table === 'game_scores');
  await expect.poll(() => scores().length).toBe(2);
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
  expect((await dash()).locked).toEqual(['emily', 'miles', 'nicole', 'jake']);
  // Swipe up again in mid-air: the spring's double jump reaches it — Miles is unlocked.
  await jumpThen(async () => {
    await debug(f, 'spawn', 'guitar', 1, 5);
    await page.keyboard.press('ArrowUp');
  });
  await expect.poll(async () => (await dash()).guitars, { timeout: 10_000 }).toBe(1);
  expect(await dash()).toMatchObject({ doubles: 1, spring: false, locked: ['emily', 'nicole', 'jake'] });
  // The spring is used up: no more double jumps.
  await jumpThen(() => page.keyboard.press('ArrowUp'));
  expect((await dash()).doubles).toBe(1);

  const ui = page.frameLocator('[data-testid="game-frame"]');
  await ui.getByRole('button', { name: 'Pause' }).click();
  await ui.getByRole('button', { name: 'Leave the game' }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 15_000 });
  await page.getByTestId('dash-play').click();
  f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'nicole', 'jake']);
  await start(page, f, 3);
  expect((await st(f)).hero).toBe('miles');
  await debug(f, 'gameOver', 654);
  const scores = () => backend.inserts.filter((i) => i.table === 'game_scores');
  await expect.poll(() => scores().length).toBe(2);
  expect((scores()[1].body as unknown as Record<string, unknown>[])[0]).toMatchObject({ hero: 'miles', score: 654 });
});

test('Jake: a manhole in a gap drops you into the sewer; reach the pipe to unlock him, sludge-covered until the run ends', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/shinkansen');
  await page.getByTestId('dash-play').click();
  let f = await game(page);
  const dash = () => f.evaluate(() => { const d = (window as any).__dash; return { mode: d.mode, sludge: d.sludge, locked: d.locked, score: d.score, sewer: d.sewer }; });
  // The level can be finished (a search over every jump timing finds a route)…
  const plan: number[] = await f.evaluate(() => (window as any).__dash.sewerRoute());
  expect(plan && plan.length).toBeGreaterThan(5);
  // …and the manholes come twice a round.
  expect(await f.evaluate(() => (window as any).__dash.fairnessProblems())).toEqual([]);

  // Fall into a gap with a manhole: the sewer, not "mind the gap".
  await start(page, f, 0);
  await debug(f, 'calm');
  // (playing the route but missing the second jump, over the first sludge pit)
  await debug(f, 'sewerPlan', plan.filter((_, i) => i !== 1));
  await debug(f, 'manhole', 1, 8);
  await expect.poll(async () => (await dash()).mode, { timeout: 20_000 }).toBe('sewer');
  // Splosh: the run is over — no Jake.
  await expect.poll(async () => (await dash()).mode, { timeout: 30_000 }).toBe('gameover');
  expect((await dash()).locked).toContain('jake');
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length).toBe(1);

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
  expect(back.locked).toEqual(['emily', 'miles', 'nicole']);
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
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 15_000 });
  await page.getByTestId('dash-play').click();
  f = await game(page);
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'nicole']);
  await start(page, f, 5);
  expect((await st(f)).hero).toBe('jake');
  await debug(f, 'gameOver', 777);
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').some((i) => (i.body as unknown as Record<string, unknown>[])[0].hero === 'jake')).toBe(true);
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
  expect(await f.evaluate(() => (window as any).__dash.locked)).toEqual(['emily', 'miles', 'nicole', 'jake']);

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
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length).toBe(1);
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
  await expect.poll(() => f.evaluate(() => (window as any).__dash.locked), { timeout: 20_000 }).toEqual(['miles', 'nicole', 'jake']);
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
