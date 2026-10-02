import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Chromium's fake microphone (a test tone) stands in for a real one in the
// voice-note test; it has no effect on the others.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

const SARAH = '00000000-0000-4000-8000-0000000000aa';

const PROFILES = [
  { id: SARAH, display_name: 'Sarah Lee' },
  { id: USER_ID, display_name: 'Test Traveler' },
];

const media = (id: string, entry: string, user: string, kind: 'photo' | 'audio', position: number, extra = {}) => ({
  id,
  entry_id: entry,
  user_id: user,
  kind,
  storage_path: `${user}/${entry}/${id}.${kind === 'photo' ? 'jpg' : 'm4a'}`,
  thumb_path: kind === 'photo' ? `${user}/${entry}/${id}.thumb.jpg` : null,
  width: kind === 'photo' ? 4032 : null,
  height: kind === 'photo' ? 3024 : null,
  duration_ms: kind === 'audio' ? 84_000 : null,
  caption: null,
  position,
  created_at: '2027-06-10T09:00:00Z',
  ...extra,
});

const ENTRIES = [
  {
    id: 'e1',
    user_id: USER_ID,
    title: 'Golden hour at Kinkaku-ji',
    body: 'The pavilion glowed over the pond.\n\nWe got there just before closing.',
    day: '2027-06-10',
    city: 'Kyoto',
    shared_to_group: true,
    created_at: '2027-06-10T09:00:00Z',
    updated_at: '2027-06-10T09:00:00Z',
    journal_media: [
      media('m1', 'e1', USER_ID, 'photo', 0),
      media('m2', 'e1', USER_ID, 'photo', 1),
      media('m3', 'e1', USER_ID, 'audio', 2, { caption: 'Temple bells' }),
    ],
  },
  {
    id: 'e2',
    user_id: USER_ID,
    title: 'First night in Tokyo',
    body: 'Ramen in Shinjuku.',
    day: '2027-06-06',
    city: null,
    shared_to_group: false,
    created_at: '2027-06-06T12:00:00Z',
    updated_at: '2027-06-06T12:00:00Z',
    journal_media: [],
  },
  {
    id: 'e3',
    user_id: SARAH,
    title: 'Deer in Nara',
    body: 'They bow if you bow first.',
    day: '2027-06-10',
    city: 'Nara',
    shared_to_group: true,
    created_at: '2027-06-10T15:00:00Z',
    updated_at: '2027-06-10T15:00:00Z',
    journal_media: [media('m9', 'e3', SARAH, 'photo', 0)],
  },
];

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

test('empty journal invites the first entry', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES, journal_entries: [] });
  await open(page, '/journal');
  await expect(page.getByText('Your trip journal starts here')).toBeVisible();
  await page.getByRole('button', { name: 'Write the first entry' }).click();
  await expect(page.getByText('New entry')).toBeVisible();
});

test('lists my entries by day and the group’s shared ones', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES, journal_entries: ENTRIES });
  await open(page, '/journal');

  const cards = page.getByTestId('journal-entry');
  await expect(cards).toHaveCount(2);
  await expect(page.getByText('Golden hour at Kinkaku-ji')).toBeVisible();
  await expect(page.getByText('Thu, Jun 10')).toBeVisible();
  await expect(page.getByText('Sun, Jun 6')).toBeVisible();
  await expect(page.getByText('Shared', { exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/journal-list.png' });

  await page.getByRole('tab', { name: 'From the group' }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.getByText('Deer in Nara')).toBeVisible();
  await expect(page.getByText('Sarah', { exact: true })).toBeVisible();

  // Someone else's entry opens read-only.
  await cards.first().click();
  await expect(page.getByRole('heading', { name: 'Deer in Nara' })).toBeVisible();
  await expect(page.getByText('Sarah Lee')).toBeVisible();
  await expect(page.getByTestId('journal-save')).toHaveCount(0);
});

test('writing an entry saves the exact row', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES, journal_entries: [] });
  await open(page, '/journal/new');

  // Saving an empty entry is refused.
  await page.getByTestId('journal-save').click();
  await expect(page.getByText(/Write something, or add a photo/)).toBeVisible();

  await page.getByRole('button', { name: /Jun 11/ }).click();
  await page.getByTestId('journal-title').fill('Great Wall at Mutianyu');
  await page.getByTestId('journal-body').fill('Took the toboggan down.');
  await page.getByTestId('journal-share').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/journal-editor.png' });
  await page.getByTestId('journal-save').click();

  await expect.poll(() => backend.inserts.filter((i) => i.table === 'journal_entries').length).toBe(1);
  const row = backend.inserts.find((i) => i.table === 'journal_entries')!.body;
  expect(row).toMatchObject({
    user_id: USER_ID,
    title: 'Great Wall at Mutianyu',
    body: 'Took the toboggan down.',
    day: '2027-06-11',
    city: 'Beijing', // follows the picked day's leg
    shared_to_group: true,
  });
  expect(backend.inserts.filter((i) => i.table === 'journal_media')).toHaveLength(0);
});

test('editing my entry shows its photos and voice notes; removing one deletes it', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES, journal_entries: ENTRIES });
  await open(page, '/journal/e1');

  await expect(page.getByText('Edit entry')).toBeVisible();
  await expect(page.getByTestId('journal-title')).toHaveValue('Golden hour at Kinkaku-ji');
  await expect(page.getByTestId('journal-photo')).toHaveCount(2);
  await expect(page.getByTestId('voice-note')).toHaveCount(1);
  await expect(page.getByLabel('Caption for voice note 1')).toHaveValue('Temple bells');

  await page.getByRole('button', { name: 'Remove photo 2' }).click();
  await expect(page.getByTestId('journal-photo')).toHaveCount(1);
  await page.getByTestId('journal-save').click();

  await expect.poll(() => backend.deletes.filter((d) => d.table === 'journal_media').length).toBe(1);
  expect(backend.deletes.find((d) => d.table === 'journal_media')!.query).toContain('m2');
  expect(backend.updates.find((u) => u.table === 'journal_entries')!.body).toMatchObject({ title: 'Golden hour at Kinkaku-ji' });
});

test('photo book screen counts what goes in the book', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES, journal_entries: ENTRIES });
  await open(page, '/journal/book');
  await expect(page.getByLabel('2 entries, 2 photos, 1 voice note')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open the book to print' })).toBeEnabled();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/journal-book.png' });
});

test('the photo book lays out a cover, a page per city, entries and voice-note QR codes', async ({ page, context }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES, journal_entries: ENTRIES });
  await open(page, '/journal/book');
  const popup = context.waitForEvent('page');
  await page.getByTestId('make-book').click();
  const book = await popup;
  // Cover, Tokyo, (Jun 6 entry), Kyoto & Nara, (Jun 10 entry), closing page.
  await expect(book.locator('section')).toHaveCount(6, { timeout: 20_000 });
  await expect(book.locator('.leg-city')).toHaveText(['Tokyo', 'Kyoto & Nara']);
  await expect(book.locator('h2')).toHaveText(['First night in Tokyo', 'Golden hour at Kinkaku-ji']);
  await expect(book.locator('.photos img')).toHaveCount(2);
  await expect(book.locator('.voice .qr svg')).toHaveCount(1);
  await expect(book.locator('.voice-caption')).toHaveText('Temple bells');
  // Only my own entries go in the book (Sarah's shared one doesn't).
  await expect(book.getByText('Deer in Nara')).toHaveCount(0);
});

test.describe('voice notes', () => {
  test.use({ permissions: ['microphone'] });

  test('records a voice note, plays it back and uploads it with the entry', async ({ page }) => {
    const backend = await signInWithFakeBackend(page, { profiles: PROFILES, journal_entries: [] });
    await open(page, '/journal/new');
    await page.getByTestId('journal-title').fill('Night market sounds');

    await page.getByTestId('journal-record').click();
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
    await page.waitForTimeout(1600);
    await page.getByRole('button', { name: 'Stop recording' }).click();

    const note = page.getByTestId('voice-note');
    await expect(note).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Play Voice note 1, 0:0[12]/ })).toBeVisible();
    await page.getByLabel('Caption for voice note 1').fill('Sizzling skewers');

    const uploads: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/storage/v1/object/journal/')) uploads.push(r.url());
    });
    await page.route(/\/storage\/v1\/object\/journal\//, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'ok' }) }),
    );
    await page.getByTestId('journal-save').click();

    await expect.poll(() => backend.inserts.filter((i) => i.table === 'journal_media').length).toBe(1);
    const rows = backend.inserts.find((i) => i.table === 'journal_media')!.body as unknown as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ user_id: USER_ID, kind: 'audio', caption: 'Sizzling skewers', position: 0 });
    expect(rows[0].duration_ms as number).toBeGreaterThan(1000);
    expect(uploads[0]).toMatch(new RegExp(`/journal/${USER_ID}/[0-9a-f-]+/[0-9a-f-]+\\.webm$`));
  });
});
