import { expect, test, type Frame, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Chain Gang Dynasty: up to four travellers chained together on the Great
// Wall. Rooms run over Supabase Realtime; the fake backend closes the
// realtime socket, so these tests set window.__CHAINGANG_LOCAL__ and the
// room runs over a BroadcastChannel — two pages in one browser play together
// exactly as two phones would. The game exposes window.__chain.

test.describe.configure({ mode: 'serial', timeout: 150_000 });

const SARAH = '00000000-0000-4000-8000-0000000000aa';
const run = (id: string, user_id: string, score: number, level: number, hero: string, game = 'chain_gang') => ({
  id, game, user_id, score, level, round: 1, hero, created_at: `2026-10-0${id.length}T10:00:00Z`,
});
const DATA = {
  profiles: [
    { id: USER_ID, display_name: 'Test Traveler', avatar_url: null },
    { id: SARAH, display_name: 'Sarah Lee', avatar_url: null },
  ],
  game_scores: [
    run('s1', SARAH, 4200, 3, 'bennett'),
    run('m1', USER_ID, 1300, 1, 'miles'),
    run('d1', SARAH, 90000, 5, 'chris', 'shinkansen_dash'), // another game's: not on this board
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
      return frame ? frame.evaluate(() => (window as any).__chain?.mode ?? null).catch(() => null) : null;
    }, { timeout: 30_000 })
    .not.toBeNull();
  return frame!;
}
const chain = <T,>(f: Frame, fn: (c: any) => T) => f.evaluate(`(${fn.toString()})(window.__chain)`) as Promise<T>;

test('chain gang: the board shows only its own scores', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/chaingang');
  const rows = page.getByTestId('high-score');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('4,200');
  await expect(rows.nth(0)).toContainText('as Bennett · all three stretches');
  await expect(rows.nth(1)).toContainText('as Miles · 1 stretch');
});

test('chain gang: every stretch is winnable by a gang of bots (1–4 of them)', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/chaingang/play');
  await page.getByTestId('chain-practise').click();
  const f = await game(page);
  for (let lv = 0; lv < 3; lv++)
    for (const n of [1, 2, 4]) {
      const r = await f.evaluate(([lv, n]) => (window as any).__chain.simulate(lv, n, 1.3), [lv, n]);
      expect(r, `stretch ${lv + 1} with ${n}`).toMatchObject({ done: true });
    }
});

test('chain gang: practise with bots, clear all three stretches, the run is saved', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/chaingang/play');
  await page.getByTestId('hero-jake').click();
  await page.getByTestId('chain-practise').click();
  const f = await game(page);
  expect(await chain(f, (c) => c.roster)).toEqual([
    { hero: 'jake', name: 'YOU', bot: false },
    { hero: 'chris', name: 'CHRIS', bot: true },
    { hero: 'bennett', name: 'BENNETT', bot: true },
    { hero: 'miles', name: 'MILES', bot: true },
  ]);
  await expect.poll(() => chain(f, (c) => c.mode)).toBe('title');
  await chain(f, (c) => c.debug.skipTitle());
  await expect.poll(() => chain(f, (c) => c.mode)).toBe('play');

  // the stick walks you; you lead, the bots follow on the chain
  const x0 = (await chain(f, (c) => c.players))[0].x;
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await chain(f, (c) => c.players))[0].x - x0, { timeout: 20_000 }).toBeGreaterThan(2);
  await page.keyboard.up('ArrowRight');
  // GRAB digs in
  await page.keyboard.down('Shift');
  await expect.poll(async () => (await chain(f, (c) => c.players))[0].grab).toBe(true);
  await page.keyboard.up('Shift');

  // falling off the wall costs a fall and puts everyone back at the start
  await chain(f, (c) => c.debug.fall());
  await expect.poll(() => chain(f, (c) => c.falls), { timeout: 20_000 }).toBe(1);

  for (let lv = 0; lv < 3; lv++) {
    await expect.poll(() => chain(f, (c) => c.level)).toBe(lv);
    await expect.poll(async () => { await chain(f, (c) => c.debug.skipTitle()); return chain(f, (c) => c.mode); }).toBe('play');
    await chain(f, (c) => c.debug.finishLevel());
    await expect.poll(() => chain(f, (c) => c.mode), { timeout: 20_000 }).toMatch(/clear|finish/);
    await chain(f, (c) => c.debug.skipTitle());
  }
  await expect.poll(() => chain(f, (c) => c.mode), { timeout: 20_000 }).toBe('finish');
  const total = await chain(f, (c) => c.total);
  const scores = await chain(f, (c) => c.scores);
  expect(scores).toHaveLength(3);
  expect(scores[0].falls).toBe(1);
  expect(total).toBe(scores.reduce((a: number, s: { score: number }) => a + s.score, 0));
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length, { timeout: 15_000 }).toBe(1);
  expect(backend.inserts.find((i) => i.table === 'game_scores')!.body).toEqual([
    { game: 'chain_gang', user_id: USER_ID, score: total, level: 3, round: 1, hero: 'jake' },
  ]);
  // leave
  await page.frameLocator('[data-testid="game-frame"]').getByRole('button', { name: 'LEAVE', exact: true }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 30_000 });
});

test('chain gang: two phones in one room play together', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { (window as any).__CHAINGANG_LOCAL__ = true; });
  const a = await ctx.newPage(), b = await ctx.newPage();
  await signInWithFakeBackend(a, DATA);
  await signInWithFakeBackend(b, DATA);
  await open(a, '/games/chaingang/play');
  await open(b, '/games/chaingang/play');

  // A starts a room as Chris; B joins with the code, also wanting Chris
  await a.getByRole('button', { name: 'Start a room' }).click();
  const code = (await a.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  await b.getByTestId('join-code').fill(code.toLowerCase());
  await b.getByTestId('join-room').click();
  await expect(a.getByTestId('gang-member')).toHaveCount(2, { timeout: 10_000 });
  await expect(b.getByTestId('gang-member')).toHaveCount(2);
  // Chris was taken first: B is moved to a free traveller and can't pick Chris
  await expect(b.getByTestId('hero-chris')).toBeDisabled();
  await expect(b.getByTestId('waiting-host')).toContainText('Waiting for Test to start');
  await b.getByTestId('hero-miles').click();
  await expect(a.getByTestId('gang-member').nth(1)).toContainText('Miles');

  // A starts: both phones open the game; bots fill the other two places
  await a.getByRole('button', { name: 'Start the game' }).click();
  const fa = await game(a), fb = await game(b);
  expect(await chain(fa, (c) => [c.net, c.me])).toEqual(['host', 0]);
  expect(await chain(fb, (c) => [c.net, c.me])).toEqual(['client', 1]);
  expect((await chain(fa, (c) => c.roster)).map((r: any) => [r.hero, r.bot])).toEqual([['chris', false], ['miles', false], ['jake', true], ['bennett', true]]);
  // the client draws the host's game
  await expect.poll(() => chain(fb, (c) => c.mode), { timeout: 30_000 }).toMatch(/title|play/);
  await chain(fa, (c) => c.debug.skipTitle());
  await expect.poll(() => chain(fb, (c) => c.mode), { timeout: 20_000 }).toBe('play');

  // B walks back (left): the host's simulation moves B's traveller
  const before = (await chain(fa, (c) => c.players))[1].x;
  await b.bringToFront();
  // (two pages in one browser: make sure B's game has the keyboard)
  await b.frameLocator('[data-testid="game-frame"]').locator('#hud').click({ position: { x: 195, y: 300 } });
  await b.keyboard.down('ArrowLeft');
  await expect.poll(async () => before - (await chain(fa, (c) => c.players))[1].x, { timeout: 30_000 }).toBeGreaterThan(1);
  await b.keyboard.up('ArrowLeft');
  // …and B sees itself where the host has it
  const hostX = (await chain(fa, (c) => c.players))[1].x;
  await expect.poll(async () => Math.abs((await chain(fb, (c) => c.players))[1].x - hostX), { timeout: 10_000 }).toBeLessThan(1.5);

  // B leaves: a bot carries on in B's place on the host
  await b.close();
  await expect.poll(async () => (await chain(fa, (c) => c.roster))[1].bot, { timeout: 15_000 }).toBe(true);
  await ctx.close();
});

test('chain gang: a code nobody is hosting says so', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { (window as any).__CHAINGANG_LOCAL__ = true; });
  const p = await ctx.newPage();
  await signInWithFakeBackend(p, DATA);
  await open(p, '/games/chaingang/play');
  await p.getByTestId('join-code').fill('ZZZZ');
  await p.getByTestId('join-room').click();
  await expect(p.getByTestId('no-host')).toContainText('Nobody is hosting room ZZZZ', { timeout: 10_000 });
  await ctx.close();
});
