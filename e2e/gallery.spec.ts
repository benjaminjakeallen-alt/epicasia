import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

const SARAH = '00000000-0000-4000-8000-0000000000aa';
const now = Date.now();
const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();

const PROFILES = [
  { id: SARAH, display_name: 'Sarah Lee' },
  { id: USER_ID, display_name: 'Test Traveler' },
];

const photo = (id: string, user: string, hoursAgo: number, extra: Record<string, unknown> = {}) => ({
  id,
  user_id: user,
  bucket: 'gallery',
  storage_path: `${user}/${id}.jpg`,
  thumb_path: `${user}/${id}.thumb.jpg`,
  width: 4032,
  height: 3024,
  caption: null,
  message_id: null,
  created_at: at(hoursAgo),
  ...extra,
});

// Today: 4 photos (one from chat); yesterday-ish: 2.
const PHOTOS = [
  photo('p1', USER_ID, 0.1, { caption: 'Golden hour at Kinkaku-ji' }),
  photo('p2', SARAH, 0.2, { bucket: 'chat', message_id: 'm9', storage_path: `${SARAH}/m9.jpg`, thumb_path: `${SARAH}/m9.thumb.jpg` }),
  photo('p3', SARAH, 0.3),
  photo('p4', USER_ID, 0.4),
  photo('p5', SARAH, 30),
  photo('p6', USER_ID, 31),
];

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

test('empty gallery explains chat photos land here', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES, gallery_photos: [], photo_favorites: [] });
  await open(page, '/photos');
  await expect(page.getByText('The trip album starts here')).toBeVisible();
  await expect(page.getByText(/any photo shared in the group chat lands here automatically/)).toBeVisible();
});

test('grid groups by day, filters, opens the viewer and favourites', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, {
    profiles: PROFILES,
    gallery_photos: PHOTOS,
    photo_favorites: [{ photo_id: 'p3', user_id: SARAH }],
  });
  await open(page, '/photos');

  await expect(page.getByText('6 photos · 1 from chat')).toBeVisible();
  await expect(page.getByText('Today')).toBeVisible();
  await expect(page.getByText('4 photos', { exact: true })).toBeVisible();
  await expect(page.getByTestId('gallery-cell')).toHaveCount(6);
  await page.waitForTimeout(600); // let thumbnails fade in for the screenshot
  await page.screenshot({ path: 'test-results/gallery-grid.png' });

  // Per-person filter.
  await page.getByRole('button', { name: 'Sarah' }).click();
  await expect(page.getByTestId('gallery-cell')).toHaveCount(3);
  await page.getByRole('button', { name: 'All' }).click();

  // Viewer: Sarah's chat photo.
  await page.getByLabel('Photo by Sarah Lee').first().click();
  const viewer = page.getByRole('dialog');
  await expect(viewer.getByText('From chat')).toBeVisible();
  await expect(viewer.getByText('Sarah Lee')).toBeVisible();
  await viewer.getByLabel('Add to favorites').click();
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'photo_favorites').length).toBe(1);
  expect(backend.inserts.find((i) => i.table === 'photo_favorites')!.body).toEqual({ photo_id: 'p2', user_id: USER_ID });
  await expect(viewer.getByLabel('Remove from favorites')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/gallery-viewer.png' });
  await viewer.getByLabel('Close', { exact: true }).click();

  // Favourites filter now shows just that one.
  await page.getByRole('button', { name: 'Favorites' }).click();
  await expect(page.getByTestId('gallery-cell')).toHaveCount(1);
});

test('home is one page: Photos on the ring, no Lodging or route cards, sign out under the avatar', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES });
  await open(page, '/');
  await expect(page.getByText('Your route')).toHaveCount(0);
  await expect(page.getByLabel('Lodging', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Photos', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Sign out')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/home.png' });
  await page.getByLabel('Account').click();
  await expect(page.getByText('Sign out')).toBeVisible();
});
