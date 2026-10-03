import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Games → Konbini Review: film your reaction to a mystery convenience-store
// snack, rate it 1–5; the group upvotes reactions (points = upvotes
// received), and "Snacks" ranks everything tried from best to worst.
// Videos go to the private `games` bucket, never the shared gallery.

const SARAH = '00000000-0000-4000-8000-0000000000aa';
const TOM = '00000000-0000-4000-8000-0000000000bb';
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const review = (id: string, by: string, created_at: string, title: string, rating: number, caption: string | null = null) => ({
  id,
  game: 'konbini_review',
  created_by: by,
  storage_path: `${by}/${id}.jpg`,
  thumb_path: `${by}/${id}.thumb.jpg`,
  video_path: `${by}/${id}.webm`,
  video_duration_ms: 12_000,
  width: 720,
  height: 960,
  title,
  rating,
  caption,
  city: 'tokyo',
  created_at,
});

const DATA = {
  profiles: [
    { id: USER_ID, display_name: 'Test Traveler', avatar_url: null },
    { id: SARAH, display_name: 'Sarah Lee', avatar_url: null },
    { id: TOM, display_name: 'Tom Park', avatar_url: null },
  ],
  game_entries: [
    review('k-mine', USER_ID, minsAgo(5), 'Melon soda', 4, 'Fizzy green joy'),
    review('k-sarah', SARAH, minsAgo(20), 'Wasabi Kit Kat', 5),
    review('k-tom', TOM, minsAgo(40), 'Natto rice ball', 1, 'Why is it stringy'),
  ],
  game_votes: [
    { entry_id: 'k-tom', user_id: USER_ID },
    { entry_id: 'k-tom', user_id: SARAH },
    { entry_id: 'k-sarah', user_id: TOM },
  ],
};

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

test('Games hub lists Konbini Review and opens it', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games');
  await page.getByRole('tab', { name: 'Konbini Review' }).click();
  await expect(page.getByTestId('games-title')).toHaveText('Konbini Review');
  await page.getByTestId('games-play').click();
  await expect(page.getByRole('heading', { name: 'Konbini Review' }).last()).toBeVisible();
  await expect(page.getByTestId('review')).toHaveCount(3);
});

test('reviews: top first, stars, play the reaction, vote on others', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/konbini');
  const cards = page.getByTestId('review');
  // Top: Tom 2 upvotes, Sarah 1, me 0.
  await expect(cards.nth(0)).toContainText('Natto rice ball');
  await expect(cards.nth(0).getByLabel('Rated 1 of 5')).toBeVisible();
  await expect(cards.nth(1)).toContainText('Wasabi Kit Kat');
  await expect(cards.nth(2)).toContainText('Melon soda');
  // Today's most upvoted reaction leads the day.
  await expect(cards.nth(0).getByTestId('winner-badge')).toContainText('Leading today');
  // Your own review shows its count and a delete button, not a vote.
  await expect(cards.nth(2).getByTestId('upvote')).toHaveCount(0);

  await cards.nth(1).getByTestId('upvote').click();
  await expect.poll(() => backend.inserts.find((i) => i.table === 'game_votes')?.body).toEqual({
    entry_id: 'k-sarah',
    user_id: USER_ID,
  });

  // The vote ties Sarah with Tom; newer goes first, so she now leads.
  await expect(cards.nth(0)).toContainText('Wasabi Kit Kat');
  await cards.filter({ hasText: 'Natto rice ball' }).getByTestId('play-reaction').click();
  await expect(page.getByTestId('chat-video')).toBeVisible();
  await expect(page.getByText('Natto rice ball · 1/5')).toBeVisible();
  await page.screenshot({ path: 'test-results/konbini-play.png' });
});

test('snacks: best to worst, with the best and worst of the trip marked', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/konbini');
  await page.getByRole('tab', { name: 'Snacks' }).click();
  const snacks = page.getByTestId('snack');
  await expect(snacks).toHaveCount(3);
  await expect(snacks.nth(0)).toContainText('Wasabi Kit Kat');
  await expect(snacks.nth(1)).toContainText('Melon soda');
  await expect(snacks.nth(2)).toContainText('Natto rice ball');
  await expect(snacks.nth(0).getByTestId('best-snack')).toHaveText('Best');
  await expect(snacks.nth(2).getByTestId('worst-snack')).toHaveText('Worst');

  await page.getByRole('tab', { name: 'Points' }).click();
  await expect(page.getByTestId('standing').first()).toContainText('Tom Park');
  await page.screenshot({ path: 'test-results/konbini-snacks.png' });
});

test('posting a review uploads the video, its poster and thumbnail to games — nothing in Photos', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { ...DATA, game_entries: [], game_votes: [] });
  await open(page, '/games/konbini');
  await expect(page.getByTestId('konbini-empty')).toBeVisible();
  await page.getByTestId('konbini-add').click();

  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('pick-video').click();
  await (await chooser).setFiles('e2e/fixtures/clip.webm');
  await expect(page.getByTestId('review-preview')).toBeVisible();

  await page.getByText('Post it', { exact: true }).click();
  await expect(page.getByText('What was it?', { exact: false }).first()).toBeVisible();
  await page.getByTestId('snack-name').fill('  Wasabi   Kit Kat ');
  await page.getByText('Post it', { exact: true }).click();
  await expect(page.getByText('Give it a rating from 1 to 5.')).toBeVisible();
  await page.getByTestId('rate-4').click();
  await expect(page.getByText('Pretty good')).toBeVisible();
  await page.getByLabel('Your verdict (optional)').fill('Spicy, then sweet');
  await page.getByRole('radio', { name: 'Beijing' }).click();
  await page.getByText('Post it', { exact: true }).click();

  await expect.poll(() => backend.inserts.filter((i) => i.table === 'game_entries').length, { timeout: 15_000 }).toBe(1);
  const row = backend.inserts.find((i) => i.table === 'game_entries')!.body;
  const base = `${USER_ID}/${row.id}`;
  expect(row).toMatchObject({
    game: 'konbini_review',
    created_by: USER_ID,
    title: 'Wasabi Kit Kat',
    rating: 4,
    caption: 'Spicy, then sweet',
    city: 'beijing',
    storage_path: `${base}.jpg`,
    thumb_path: `${base}.thumb.jpg`,
    video_path: `${base}.webm`,
    width: 320,
    height: 240,
  });
  expect(backend.uploads.every((u) => u.bucket === 'games')).toBe(true);
  expect(backend.uploads.map((u) => u.path).sort()).toEqual([`${base}.jpg`, `${base}.thumb.jpg`, `${base}.webm`].sort());
  expect(backend.inserts.some((i) => i.table === 'gallery_photos')).toBe(false);
});

test('deleting your review removes it, its votes and all three files', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, DATA);
  await open(page, '/games/konbini');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete your review' }).click();
  await expect(page.getByTestId('review')).toHaveCount(2);
  expect(backend.deletes).toEqual([{ table: 'game_entries', query: '?id=eq.k-mine' }]);
  await expect.poll(() => backend.removals).toEqual([
    { bucket: 'games', paths: [`${USER_ID}/k-mine.jpg`, `${USER_ID}/k-mine.thumb.jpg`, `${USER_ID}/k-mine.webm`] },
  ]);
});
