import { expect, test, type Frame, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Tug of Wall: up to four travellers chained together on the Great
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
    run('s1', SARAH, 4200, 4, 'bennett'),
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
    }, { timeout: 60_000 }) // (two games booting at once in software 3D on a CI runner can take a while)
    .not.toBeNull();
  return frame!;
}
const chain = <T,>(f: Frame, fn: (c: any) => T) => f.evaluate(`(${fn.toString()})(window.__chain)`) as Promise<T>;

test('tug of wall: the board shows only its own scores', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/chaingang');
  const rows = page.getByTestId('high-score');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('4,200');
  await expect(rows.nth(0)).toContainText('as Bennett · all four stretches');
  await expect(rows.nth(1)).toContainText('as Miles · 1 stretch');
});

test('tug of wall: every stretch is winnable by a gang of bots (1–4 of them)', async ({ page }) => {
  test.setTimeout(240_000); // (four stretches, three gangs each, headless)
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/chaingang/play');
  await page.getByTestId('chain-practise').click();
  const f = await game(page);
  for (let lv = 0; lv < 4; lv++)
    for (const n of [1, 2, 4]) {
      const r = await f.evaluate(([lv, n]) => (window as any).__chain.simulate(lv, n, 1.3), [lv, n]);
      expect(r, `stretch ${lv + 1} with ${n}`).toMatchObject({ done: true });
    }
  // GRAB on solid ground reels in the teammate hanging below you; without it they stay hanging
  expect(await chain(f, (c) => c.reelTest(true))).toMatchObject({ onTop: true });
  expect(await chain(f, (c) => c.reelTest(false))).toMatchObject({ onTop: false });
});

test('tug of wall: practise with bots, clear all four stretches, the run is saved', async ({ page }) => {
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

  // ↑ walks you forward, the way the camera looks (along the Wall, −z); you lead, the bots follow on the chain
  const z0 = (await chain(f, (c) => c.players))[0].z;
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => z0 - (await chain(f, (c) => c.players))[0].z, { timeout: 20_000 }).toBeGreaterThan(2);
  await page.keyboard.up('ArrowUp');
  // the camera looks along the Wall by itself: dragging the screen only looks round, and it swings back
  const yaw0 = await chain(f, (c) => c.camYaw);
  const box = (await page.getByTestId('game-frame').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 170, box.y + box.height * 0.35, { steps: 8 }); // drag left
  expect((await chain(f, (c) => c.camYaw)) - yaw0).toBeGreaterThan(1.2); // looking round
  await page.mouse.up();
  const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  await expect.poll(async () => turn(await chain(f, (c) => c.camYaw), yaw0), { timeout: 20_000 }).toBeLessThan(0.2);
  // and round a bend in the Wall it turns with you, so ↑ walks on the new way
  const route: { p: number[]; jump: boolean }[] = await chain(f, (c) => c.route);
  const dirOf = (k: number) => Math.atan2(route[k + 1].p[0] - route[k].p[0], route[k + 1].p[2] - route[k].p[2]);
  const bend = route.findIndex((n, k) => k > 0 && k + 2 < route.length && !n.jump && !route[k + 1].jump && Math.abs(route[k + 1].p[1] - n.p[1]) < 0.1 &&
    Math.hypot(route[k + 1].p[0] - n.p[0], route[k + 1].p[2] - n.p[2]) > 4 && turn(dirOf(k), yaw0) > 1.2);
  expect(bend).toBeGreaterThan(0);
  const [bx, by, bz] = route[bend].p, want = dirOf(bend);
  await f.evaluate(`window.__chain.debug.warp(${bx + Math.sin(want) * 2}, ${by + 0.05}, ${bz + Math.cos(want) * 2})`);
  await expect.poll(async () => turn(await chain(f, (c) => c.camYaw), want), { timeout: 20_000 }).toBeLessThan(0.3);

  // music plays (from the first key press); the pause menu turns it off and on
  await expect.poll(() => chain(f, (c) => c.music.on)).toBe(true);
  await f.locator('#pausebtn').click();
  await expect(f.locator('#pmusic')).toHaveText('MUSIC: ON');
  await f.locator('#pmusic').click();
  await expect(f.locator('#pmusic')).toHaveText('MUSIC: OFF');
  expect(await chain(f, (c) => c.music.on)).toBe(false);
  await f.locator('#pmusic').click();
  expect(await chain(f, (c) => c.music.on)).toBe(true);
  await f.locator('#resume').click();

  // GRAB digs in (back in the middle of the island first: on a slow runner that walk can run on off its edge)
  await chain(f, (c) => c.debug.warp(0, 0.05, -4.2));
  await expect.poll(async () => (await chain(f, (c) => c.players))[0].ground).toBeTruthy();
  await page.keyboard.down('Shift');
  await expect.poll(async () => (await chain(f, (c) => c.players))[0].grab).toBe(true);
  await page.keyboard.up('Shift');

  // hanging off a ledge on the rope: the camera swings round to look at you and the ledge, and a
  // teammate on the island reels you up smoothly — no bouncing on the end of the rope
  // …and once you're back on your feet, it returns behind you, looking the way on again
  // (behind you on the first island = looking along it, down the route from its first node to the next)
  const behind = await chain(f, (c) => Math.atan2(c.route[1].p[0] - c.route[0].p[0], c.route[1].p[2] - c.route[0].p[2]));
  const turned = async () => { const d = (await chain(f, (c) => c.camYaw)) - behind; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); };
  await chain(f, (c) => c.debug.hang());
  await expect.poll(() => chain(f, (c) => c.camHang), { timeout: 10_000, intervals: [50] }).toBeGreaterThan(0.6);
  await expect.poll(turned, { timeout: 5_000, intervals: [50] }).toBeGreaterThan(0.8); // looking at you from out over the drop
  await expect.poll(async () => (await chain(f, (c) => c.players))[0].ground, { timeout: 20_000 }).toBe(true);
  await expect.poll(() => chain(f, (c) => c.camHang), { timeout: 20_000 }).toBeLessThan(0.2);
  await expect.poll(turned, { timeout: 3_000 }).toBeLessThan(0.35); // (quickly, not a slow drift round)

  // say something: 💬 then a choice (or a number key) puts a bubble over your traveller
  await f.locator('#emotebtn').click();
  await f.getByRole('button', { name: '👋 HI!' }).click();
  await expect.poll(() => chain(f, (c) => c.emotes[0])).toBe('👋 HI!');
  await expect(f.getByRole('button', { name: '👋 HI!' })).toBeHidden(); // (the choices close)
  await page.keyboard.press('4');
  await expect.poll(() => chain(f, (c) => c.emotes[0])).toBe('🙌 NICE!');

  // falling off the wall costs a fall and puts everyone back at the start
  await chain(f, (c) => c.debug.fall());
  await expect.poll(() => chain(f, (c) => c.falls), { timeout: 20_000 }).toBe(1);

  // the pause menu starts the stretch again from its beginning (the fall still counts)
  await chain(f, (c) => c.debug.skipTitle());
  await expect.poll(() => chain(f, (c) => c.mode)).toBe('play');
  const far = (await chain(f, (c) => c.route))[6].p;
  await chain(f, (c) => c.debug.warp(0, 0, 0)); // (somewhere else first…)
  await f.evaluate(([x, y, z]) => (window as any).__chain.debug.warp(x, y + 0.05, z), far);
  await f.locator('#pausebtn').click();
  await f.getByRole('button', { name: 'Restart this stretch from the beginning' }).click();
  await expect.poll(() => chain(f, (c) => c.mode)).toBe('title');
  const fromStart = async () => { const q = (await chain(f, (c) => c.players))[0]; return Math.hypot(q.x - 0, q.z + 3); };
  await expect.poll(fromStart, { timeout: 10_000 }).toBeLessThan(2.5); // (…and back at the start: 0, −3)
  expect(await chain(f, (c) => [c.level, c.cp, c.falls])).toEqual([0, 0, 1]);

  for (let lv = 0; lv < 4; lv++) {
    await expect.poll(() => chain(f, (c) => c.level), { timeout: 20_000 }).toBe(lv);
    await expect.poll(async () => { await chain(f, (c) => c.debug.skipTitle()); return chain(f, (c) => c.mode); }, { timeout: 20_000 }).toBe('play');
    await chain(f, (c) => c.debug.finishLevel());
    await expect.poll(() => chain(f, (c) => c.mode), { timeout: 20_000 }).toMatch(/clear|finish/);
    await chain(f, (c) => c.debug.skipTitle());
  }
  await expect.poll(() => chain(f, (c) => c.mode), { timeout: 20_000 }).toBe('finish');
  const total = await chain(f, (c) => c.total);
  const scores = await chain(f, (c) => c.scores);
  expect(scores).toHaveLength(4);
  expect(scores[0].falls).toBe(1);
  // a medal for each stretch, and whose fall it was (for the finish card's "butterfingers")
  for (const q of scores) expect(['gold', 'silver', 'bronze']).toContain(q.medal);
  expect((await chain(f, (c) => c.fallsBy)).reduce((a: number, b: number) => a + b, 0)).toBe(1);
  expect(total).toBe(scores.reduce((a: number, s: { score: number }) => a + s.score, 0));
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_scores').length, { timeout: 15_000 }).toBe(1);
  expect(backend.inserts.find((i) => i.table === 'game_scores')!.body).toEqual([
    { game: 'chain_gang', user_id: USER_ID, score: total, level: 4, round: 1, hero: 'jake' },
  ]);
  // leave
  await page.frameLocator('[data-testid="game-frame"]').getByRole('button', { name: 'LEAVE', exact: true }).click();
  await expect(page.getByTestId('game-frame')).toHaveCount(0, { timeout: 30_000 });
});

test('tug of wall: two phones in one room play together', async ({ browser }) => {
  test.setTimeout(240_000); // (two pages of software 3D at once)
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

  // B walks forward: the host's simulation moves B's traveller
  const before = (await chain(fa, (c) => c.players))[1].z;
  await b.bringToFront();
  // (two pages in one browser: make sure B's game has the keyboard)
  await b.frameLocator('[data-testid="game-frame"]').locator('#hud').click({ position: { x: 195, y: 300 } });
  const mineBefore = (await chain(fb, (c) => c.players))[1].z;
  await b.keyboard.down('ArrowUp');
  // B's own phone moves B at once (it doesn't wait on the host — that was the lag)…
  await expect.poll(async () => mineBefore - (await chain(fb, (c) => c.players))[1].z, { timeout: 10_000, intervals: [50] }).toBeGreaterThan(0.5); // (generous: two pages of software 3D on a busy runner)
  // …and tells the host, whose simulation has B's traveller there too
  await expect.poll(async () => before - (await chain(fa, (c) => c.players))[1].z, { timeout: 30_000 }).toBeGreaterThan(1);
  await b.keyboard.up('ArrowUp');
  const host = async () => (await chain(fa, (c) => c.players))[1];
  const gap = async () => { const q = (await chain(fb, (c) => c.players))[1], h = await host(); return Math.hypot(q.x - h.x, q.z - h.z); };
  await expect.poll(gap, { timeout: 10_000 }).toBeLessThan(1.5);
  // B says something: the host's phone shows the bubble over B's traveller
  await b.keyboard.press('1');
  await expect.poll(() => chain(fa, (c) => c.emotes[1]), { timeout: 30_000, intervals: [100] }).toBe('👋 HI!');
  // a fall: the host puts everyone back at the start, and B's phone goes along with it
  await chain(fb, (c) => c.debug.fall()); // (B's phone moves B — the host can't drop a traveller another phone is holding up)
  await chain(fa, (c) => c.debug.fall());
  // (30 s: the host's page is in the background here, where it only ticks about once a second)
  await expect.poll(async () => (await chain(fb, (c) => c.falls)), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(gap, { timeout: 30_000 }).toBeLessThan(0.5);
  // B restarts the stretch from the pause menu: B's phone asks, the host starts it again for everyone
  await expect.poll(() => chain(fa, (c) => c.mode), { timeout: 30_000 }).toBe('play');
  await fb.locator('#pausebtn').click();
  await fb.getByRole('button', { name: 'Restart this stretch from the beginning' }).click();
  await expect.poll(() => chain(fa, (c) => c.mode), { timeout: 30_000 }).toBe('title');
  await expect.poll(() => chain(fb, (c) => c.mode), { timeout: 30_000 }).toBe('title');

  // B leaves: a bot carries on in B's place on the host
  await b.close();
  await expect.poll(async () => (await chain(fa, (c) => c.roster))[1].bot, { timeout: 40_000 }).toBe(true); // (presence drop + a 5 s grace)
  await ctx.close();
});

test('tug of wall: three people online all falling at once go back to the watchtower, onto it', async ({ page }) => {
  // (user, Oct 17 2026: "when we all fell we all whipped in a circle and we never reset on the platform"):
  // a host and two phones, headless, with the network lag of a phone on mobile data (~0.15–0.6 s)
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/chaingang/play');
  await page.getByTestId('chain-practise').click();
  const f = await game(page);
  for (const lv of [0, 1, 2, 3]) for (const [snapD, repD] of [[9, 6], [36, 30]]) {
    expect(await f.evaluate(([l, a, b]) => (window as any).__chain.netFallTest(l, a, b), [lv, snapD, repD])).toEqual({ whoops: 1, standing: true });
  }
});

test('tug of wall: a code nobody is hosting says so', async ({ browser }) => {
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

test('tug of wall: the first time, a how-to-play card holds the first stretch until you press JUMP', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await page.addInitScript(() => { if (window.top === window) localStorage.removeItem('epicasia.chaingang.tips'); });
  await open(page, '/games/chaingang/play');
  await page.getByTestId('chain-practise').click();
  const f = await game(page);
  expect(await chain(f, (c) => c.tips)).toBe(true);
  await expect.poll(() => chain(f, (c) => c.mode)).toBe('title');
  await page.waitForTimeout(4000); // (a title card is 2.8 s)
  expect(await chain(f, (c) => c.mode)).toBe('title');
  await page.keyboard.press(' ');
  await expect.poll(() => chain(f, (c) => c.mode), { timeout: 20_000 }).toBe('play');
  expect(await chain(f, (c) => c.tips)).toBe(false);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('epicasia.chaingang.tips'))).toBe('1');
});
