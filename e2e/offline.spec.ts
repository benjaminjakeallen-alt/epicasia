import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Trip data stays readable without a connection: load once online, then
// cut the network (every database and signing request fails) and reload.

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

/** From now on, database reads and photo signing fail like they do with no signal. */
async function goOffline(page: Page) {
  await page.route(/supabase\.co\/(rest\/v1|storage\/v1\/object\/sign)\//, (route) => {
    if (route.request().method() === 'GET' && route.request().url().includes('/object/sign/')) return route.fallback();
    return route.abort('internetdisconnected');
  });
}

const DATA = {
  profiles: [{ id: USER_ID, display_name: 'Test Traveler', avatar_url: null, is_admin: false }],
  itinerary_items: [
    {
      id: 'i1',
      day: '2027-06-06',
      city: 'Tokyo',
      title: 'Tokyo DisneySea',
      description: 'Rope drop at Mysterious Island.',
      start_time: '2027-06-06T09:00:00Z',
      end_time: null,
      created_by: null,
      created_at: '2026-09-01T00:00:00Z',
    },
  ],
  flights: [
    {
      id: 'f1',
      airline: 'ANA',
      flight_number: 'NH 961',
      departure_airport: 'NRT',
      arrival_airport: 'PEK',
      departure_time: '2027-06-11T10:30:00Z',
      arrival_time: '2027-06-11T13:45:00Z',
      confirmation_code: 'ABC123',
      created_by: USER_ID,
      created_at: '2026-09-01T00:00:00Z',
    },
  ],
  gallery_photos: [
    {
      id: 'p1',
      user_id: USER_ID,
      bucket: 'gallery',
      storage_path: `${USER_ID}/p1.jpg`,
      thumb_path: `${USER_ID}/p1.thumb.jpg`,
      width: 4032,
      height: 3024,
      caption: null,
      message_id: null,
      created_at: '2026-09-01T00:00:00Z',
    },
  ],
  photo_favorites: [],
};

test('itinerary and flights open offline from the saved copy, with a note', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/itinerary');
  await expect(page.getByText('Tokyo DisneySea')).toBeVisible();
  await expect(page.getByTestId('offline-notice')).toHaveCount(0);
  await open(page, '/flights');
  await expect(page.getByText('ABC123')).toBeVisible();

  await goOffline(page);
  await open(page, '/itinerary');
  await expect(page.getByText('Tokyo DisneySea')).toBeVisible();
  await expect(page.getByTestId('offline-notice')).toContainText('Offline · showing what was saved today');
  await page.screenshot({ path: 'test-results/offline-itinerary.png' });

  await open(page, '/flights');
  await expect(page.getByText('ABC123')).toBeVisible(); // confirmation code available with no signal
  await expect(page.getByTestId('offline-notice')).toBeVisible();
});

test('the photo grid still shows saved photos offline', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/photos');
  await expect(page.getByTestId('gallery-cell')).toHaveCount(1);

  await goOffline(page);
  await open(page, '/photos');
  await expect(page.getByTestId('gallery-cell')).toHaveCount(1);
  await expect(page.getByTestId('offline-notice')).toBeVisible();
  await expect(page.getByTestId('gallery-cell').locator('img')).toHaveCount(1);
});

test('with nothing saved, offline shows the usual error instead of empty data', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await goOffline(page);
  await open(page, '/itinerary');
  await expect(page.getByText('Tokyo DisneySea')).toHaveCount(0);
  await expect(page.getByTestId('offline-notice')).toHaveCount(0);
});

test('signing out deletes the saved copies', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/itinerary');
  await expect(page.getByText('Tokyo DisneySea')).toBeVisible();
  const saved = () =>
    page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('epicasia.cache.')).length);
  await expect.poll(saved).toBeGreaterThan(0);

  await page.goto('/profile');
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('sign-out').click();
  await expect.poll(saved).toBe(0);
});

test('the offline note passes the accessibility audit', async ({ page }) => {
  const { AxeBuilder } = await import('@axe-core/playwright');
  await signInWithFakeBackend(page, DATA);
  await open(page, '/itinerary');
  await expect(page.getByText('Tokyo DisneySea')).toBeVisible();
  await goOffline(page);
  await open(page, '/itinerary');
  await expect(page.getByTestId('offline-notice')).toBeVisible();
  const result = await new AxeBuilder({ page }).include('[data-testid="offline-notice"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations).toEqual([]);
});
