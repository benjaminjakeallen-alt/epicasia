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

  await expect(page.getByText('Today')).toBeVisible();
  await expect(page.getByTestId('gallery-cell')).toHaveCount(6);
  await page.waitForTimeout(600); // let thumbnails fade in for the screenshot
  await page.screenshot({ path: 'test-results/gallery-grid.png' });

  // Per-person filter.
  await page.getByRole('button', { name: 'Sarah', exact: true }).click();
  await expect(page.getByTestId('gallery-cell')).toHaveCount(3);
  await page.getByRole('button', { name: 'All', exact: true }).click();

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

test('home is one page: Photos on the ring, no Lodging or route cards, the avatar opens your profile', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES });
  await open(page, '/');
  await expect(page.getByText('Your route')).toHaveCount(0);
  await expect(page.getByLabel('Lodging', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Photos', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Sign out')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/home.png' });
  await page.getByLabel('Your profile').click();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(page.getByText('Sign out')).toBeVisible();
});

// Press and hold like a finger (RN-web long press needs the pointer held).
async function longPress(page: Page, target: ReturnType<Page['getByLabel']>) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
}

test('photos sort by when they were taken, with an album per trip city', async ({ page }) => {
  await signInWithFakeBackend(page, {
    profiles: PROFILES,
    gallery_photos: [
      // Added just now, but taken on the trip's second Tokyo day.
      photo('t1', SARAH, 0.1, { taken_at: '2027-06-07T03:00:00.000Z', caption: 'Shibuya' }),
      photo('t2', USER_ID, 0.2, { taken_at: '2027-06-11T02:00:00.000Z', caption: 'Fushimi Inari' }),
      photo('t3', USER_ID, 0.3, { taken_at: at(0.3) }),
    ],
    photo_favorites: [],
  });
  await open(page, '/photos');
  await expect(page.getByTestId('gallery-cell')).toHaveCount(3);
  // Newest *taken* first (the trip is in 2027): Kyoto (Jun 11), Tokyo (Jun 7),
  // then the one taken today, though Shibuya was added most recently.
  const labels = await page.getByTestId('gallery-cell').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(labels[0]).toContain('Fushimi Inari');
  expect(labels[1]).toContain('Shibuya');
  await expect(page.getByText('Mon, Jun 7, 2027')).toBeVisible();

  await page.getByTestId('chip-city:tokyo').click();
  await expect(page.getByTestId('gallery-cell')).toHaveCount(1);
  await expect(page.getByLabel(/Shibuya/)).toBeVisible();
  await page.getByTestId('chip-city:kyoto').click();
  await expect(page.getByLabel(/Fushimi Inari/)).toBeVisible();
  await expect(page.getByTestId('chip-city:beijing')).toHaveCount(0);
});

test.describe('in Tokyo time', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });
  test('an uploaded photo keeps its EXIF "date taken"', async ({ page }) => {
    const backend = await signInWithFakeBackend(page, { profiles: PROFILES, gallery_photos: [], photo_favorites: [] });
    await open(page, '/photos');
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('gallery-add').click();
    await (await chooser).setFiles('e2e/fixtures/exif.jpg');
    await expect.poll(() => backend.inserts.filter((i) => i.table === 'gallery_photos').length).toBe(1);
    // DateTimeOriginal 2027:06:07 14:03:22, read as the phone's local (Tokyo) time.
    expect(backend.inserts.find((i) => i.table === 'gallery_photos')!.body).toMatchObject({
      user_id: USER_ID,
      bucket: 'gallery',
      taken_at: '2027-06-07T05:03:22.000Z',
      video_path: null,
    });
  });
});

test('upload a video: the clip, its poster and thumbnail, then the row', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES, gallery_photos: [], photo_favorites: [] });
  await open(page, '/photos');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('gallery-add').click();
  await (await chooser).setFiles('e2e/fixtures/clip.webm');
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'gallery_photos').length, { timeout: 15_000 }).toBe(1);
  const row = backend.inserts.find((i) => i.table === 'gallery_photos')!.body;
  const base = `${USER_ID}/${row.id}`;
  expect(row).toMatchObject({
    storage_path: `${base}.jpg`,
    thumb_path: `${base}.thumb.jpg`,
    video_path: `${base}.webm`,
    width: 320,
    height: 240,
  });
  expect(backend.uploads.map((u) => u.path).sort()).toEqual([`${base}.jpg`, `${base}.thumb.jpg`, `${base}.webm`].sort());
  await page.getByLabel(/^Video, /).click();
  await expect(page.getByTestId('gallery-video')).toBeVisible();
});

test('select photos: make an album, then remove one from it', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, {
    profiles: PROFILES,
    gallery_photos: PHOTOS,
    photo_favorites: [],
    photo_albums: [],
    album_photos: [],
  });
  await open(page, '/photos');
  await longPress(page, page.getByLabel('Photo by you: Golden hour at Kinkaku-ji'));
  await page.getByTestId('gallery-cell').nth(2).click();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByTestId('select-album').click();
  await page.getByTestId('album-name').fill('  Best   of Kyoto ');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect.poll(() => backend.inserts.filter((i) => i.table === 'album_photos').length).toBe(1);
  const album = backend.inserts.find((i) => i.table === 'photo_albums')!.body;
  expect(album).toMatchObject({ name: 'Best of Kyoto', created_by: USER_ID });
  const links = backend.inserts.find((i) => i.table === 'album_photos')!.body as unknown as Record<string, string>[];
  expect(links).toEqual([
    { album_id: album.id, photo_id: 'p1', added_by: USER_ID },
    { album_id: album.id, photo_id: 'p3', added_by: USER_ID },
  ]);
  // The new album is now the filter.
  await expect(page.getByTestId(`chip-album:${album.id}`)).toContainText('Best of Kyoto');
  await expect(page.getByTestId('gallery-cell')).toHaveCount(2);

  await longPress(page, page.getByLabel('Photo by you: Golden hour at Kinkaku-ji'));
  await page.getByLabel('Remove from album').click();
  await expect(page.getByTestId('gallery-cell')).toHaveCount(1);
  await expect.poll(() => backend.deletes.filter((d) => d.table === 'album_photos').length).toBe(1);
  const del = backend.deletes.find((d) => d.table === 'album_photos')!.query;
  expect(decodeURIComponent(del)).toContain(`album_id=eq.${album.id}`);
  expect(decodeURIComponent(del)).toContain('photo_id=in.(p1)');
});

test('share several photos at once as files', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: string[][] };
    w.__shared = [];
    Object.defineProperty(navigator, 'canShare', { value: (d: ShareData) => !!d.files?.length, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async (d: ShareData) => {
        w.__shared.push((d.files ?? []).map((f) => `${f.name}|${f.type}`));
      },
      configurable: true,
    });
  });
  await signInWithFakeBackend(page, { profiles: PROFILES, gallery_photos: PHOTOS, photo_favorites: [] });
  await open(page, '/photos');
  await longPress(page, page.getByLabel('Photo by you: Golden hour at Kinkaku-ji'));
  await page.getByTestId('gallery-cell').nth(3).click();
  await page.getByTestId('select-share').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: string[][] }).__shared)).toEqual([
    ['p1.jpg|image/jpeg', 'p4.jpg|image/jpeg'],
  ]);
  await expect(page.getByText(/selected/)).toHaveCount(0);
});
