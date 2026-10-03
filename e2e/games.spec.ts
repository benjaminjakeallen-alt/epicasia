import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Games → Lost in Translation: post photos of wonky English, upvote other
// people's, points = upvotes received, each day's top photo is crowned.
// Photos go to the private `games` bucket, never the shared gallery.

const SARAH = '00000000-0000-4000-8000-0000000000aa';
const TOM = '00000000-0000-4000-8000-0000000000bb';
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const entry = (id: string, by: string, created_at: string, caption: string | null, city: string | null = 'tokyo') => ({
  id,
  game: 'lost_in_translation',
  created_by: by,
  storage_path: `${by}/${id}.jpg`,
  thumb_path: `${by}/${id}.thumb.jpg`,
  width: 1200,
  height: 900,
  caption,
  city,
  created_at,
});

const DATA = {
  profiles: [
    { id: USER_ID, display_name: 'Test Traveler', avatar_url: null },
    { id: SARAH, display_name: 'Sarah Lee', avatar_url: null },
    { id: TOM, display_name: 'Tom Park', avatar_url: null },
  ],
  game_entries: [
    entry('e-mine', USER_ID, minsAgo(5), 'Please do not to touch the fish'),
    entry('e-sarah-today', SARAH, minsAgo(30), 'Slip carefully'),
    entry('e-tom-old', TOM, '2026-06-07T03:00:00Z', 'Fried rice with no rice', 'shanghai'),
    entry('e-sarah-old', SARAH, '2026-06-07T04:00:00Z', null, 'shanghai'),
  ],
  game_votes: [
    { entry_id: 'e-sarah-today', user_id: USER_ID },
    { entry_id: 'e-sarah-today', user_id: TOM },
    { entry_id: 'e-mine', user_id: TOM },
    { entry_id: 'e-tom-old', user_id: SARAH },
    { entry_id: 'e-tom-old', user_id: USER_ID },
    { entry_id: 'e-tom-old', user_id: 'x' },
    { entry_id: 'e-sarah-old', user_id: TOM },
  ],
};

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

test('Games hub: a stage shows the picked game; tiles switch it, Play opens it', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games');
  await expect(page.getByTestId('games-title')).toHaveText('Lost in Translation');
  await expect(page.getByRole('tab', { name: 'Lost in Translation' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: 'test-results/games-hub.png' });
  await page.getByRole('tab', { name: 'Godzilla Rampage' }).click();
  await expect(page.getByTestId('games-title')).toHaveText('Godzilla Rampage');
  await expect(page.getByRole('tab', { name: 'Godzilla Rampage' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: 'test-results/games-hub-rampage.png' });
  await page.getByRole('tab', { name: 'Lost in Translation' }).click();
  await page.getByTestId('games-play').click();
  await expect(page.getByRole('heading', { name: 'Lost in Translation' }).last()).toBeVisible();
  await expect(page.getByTestId('lit-add')).toBeVisible();
});

test('the wall: top first, daily winners crowned, vote on others, not your own', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/lost-in-translation');
  const finds = page.getByTestId('find');
  await expect(finds).toHaveCount(4);

  // Top: 3 upvotes, 2, 1, 1 (ties newest first).
  await expect(finds.nth(0)).toContainText('Fried rice with no rice');
  await expect(finds.nth(1)).toContainText('Slip carefully');
  await expect(finds.nth(2)).toContainText('Please do not to touch the fish');

  // Winners: Tom's on Jun 7 (beats Sarah's 1 that day); Sarah's leads today.
  await expect(finds.nth(0).getByTestId('winner-badge')).toContainText('Winner · Jun 7');
  await expect(finds.nth(1).getByTestId('winner-badge')).toContainText('Leading today');
  await expect(page.getByTestId('winner-badge')).toHaveCount(2);

  // Your own find shows its count and a delete button, but can't be upvoted.
  const mine = finds.nth(2);
  await expect(mine.getByLabel('Your find, 1 upvote')).toBeVisible();
  await expect(mine.getByTestId('upvote')).toHaveCount(0);
  await expect(mine.getByRole('button', { name: 'Delete your find' })).toBeVisible();
  await page.screenshot({ path: 'test-results/lit-wall.png' });

  // Upvote Sarah's older photo, then take it back.
  // (Found by its photo: votes re-sort the Top list as they land.)
  const sarahOld = finds.filter({ has: page.getByAltText('Photo by Sarah Lee') });
  await sarahOld.getByRole('button', { name: 'Upvote, 1 upvote' }).click();
  await expect(sarahOld.getByRole('button', { name: 'Remove your upvote, 2 upvotes' })).toBeVisible();
  expect(backend.inserts.at(-1)).toEqual({ table: 'game_votes', body: { entry_id: 'e-sarah-old', user_id: USER_ID } });
  await sarahOld.getByRole('button', { name: 'Remove your upvote, 2 upvotes' }).click();
  await expect(sarahOld.getByRole('button', { name: 'Upvote, 1 upvote' })).toBeVisible();
  expect(backend.deletes.at(-1)).toEqual({ table: 'game_votes', query: `?entry_id=eq.e-sarah-old&user_id=eq.${USER_ID}` });

  // New: newest first.
  await page.getByRole('tab', { name: 'New' }).click();
  await expect(finds.nth(0)).toContainText('Please do not to touch the fish');
});

test('leaderboard: points are upvotes received, with finds and daily wins', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/lost-in-translation');
  await page.getByRole('tab', { name: 'Leaderboard' }).click();
  const rows = page.getByTestId('standing');
  await expect(rows).toHaveCount(3);
  // Tom and Sarah tie on 3 points (shared rank 1); daily wins, then finds, order them.
  await expect(rows.nth(0)).toHaveAccessibleName('1. Sarah Lee, 3 points, 2 finds, 1 daily win');
  await expect(rows.nth(1)).toHaveAccessibleName('1. Tom Park, 3 points, 1 find, 1 daily win');
  await expect(rows.nth(2)).toHaveAccessibleName('3. Test Traveler (you), 1 point, 1 find');
  await page.screenshot({ path: 'test-results/lit-leaderboard.png' });
});

test('posting a find uploads to the games bucket only — nothing in Photos', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { ...DATA, game_entries: [], game_votes: [] });
  await open(page, '/games/lost-in-translation');
  await expect(page.getByText('Spot the wonkiest English')).toBeVisible();
  await page.getByTestId('lit-add').click();

  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('pick-photo').click();
  await (await chooser).setFiles('assets/images/places/kyoto-kinkakuji.jpg');
  await expect(page.getByTestId('find-preview')).toBeVisible();
  await page.getByLabel('What does it say? (optional)').fill('  Be careful   of the slippery  ');
  await page.getByRole('radio', { name: 'Kyoto & Nara' }).click();
  await page.getByText('Post it', { exact: true }).click();

  await expect.poll(() => backend.inserts.length).toBe(1);
  const ins = backend.inserts[0];
  expect(ins.table).toBe('game_entries');
  expect(ins.body).toMatchObject({
    game: 'lost_in_translation',
    created_by: USER_ID,
    caption: 'Be careful of the slippery',
    city: 'kyoto',
    storage_path: `${USER_ID}/${ins.body.id}.jpg`,
  });
  expect(backend.uploads.map((u) => u.bucket)).toEqual(['games', 'games']); // original + thumbnail
  expect(backend.uploads[0].path).toBe(`${USER_ID}/${ins.body.id}.jpg`);
  expect(backend.inserts.some((i) => i.table === 'gallery_photos')).toBe(false);
});

test('deleting your find removes it, its votes and its files', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/lost-in-translation');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete your find' }).click();
  await expect(page.getByTestId('find')).toHaveCount(3);
  expect(backend.deletes).toEqual([{ table: 'game_entries', query: '?id=eq.e-mine' }]);
  await expect.poll(() => backend.removals).toEqual([
    { bucket: 'games', paths: [`${USER_ID}/e-mine.jpg`, `${USER_ID}/e-mine.thumb.jpg`] },
  ]);
});


test('trip leaderboard: placings in every game become trip points', async ({ page }) => {
  // Lost in Translation: Sarah 3 and Tom 3 upvotes (tied 1st), me 1 (3rd).
  // Godzilla Rampage: me 50,000 (1st), Tom 20,000 (2nd).
  // Trip points: Tom 10 + 8 = 18, me 6 + 10 = 16, Sarah 10.
  const run = (id: string, user_id: string, score: number) => ({
    id,
    user_id,
    score,
    level: 2,
    round: 1,
    hero: 'chris',
    game: 'godzilla_rampage',
    created_at: minsAgo(60),
  });
  await signInWithFakeBackend(page, { ...DATA, game_scores: [run('r1', USER_ID, 50000), run('r2', TOM, 20000)] });
  await open(page, '/games');
  await page.getByTestId('games-leaderboard').click();
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();

  const rows = page.getByTestId('trip-standing');
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId('trip-points')).toHaveText(['18', '16', '10']);
  await expect(rows.nth(0)).toContainText('Tom Park');
  await expect(rows.nth(1)).toContainText('Test Traveler (you)');
  await expect(page.getByTestId('trip-placings').nth(1)).toHaveText('Godzilla Rampage 1st · Lost in Translation 3rd');
  await expect(page.getByTestId('podium')).toBeVisible();
  await page.screenshot({ path: 'test-results/trip-leaderboard.png' });
});

test('trip leaderboard is empty until someone plays', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: DATA.profiles, game_entries: [], game_votes: [], game_scores: [] });
  await open(page, '/games/leaderboard');
  await expect(page.getByTestId('trip-board-empty')).toBeVisible();
});
