import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

test.use({ timezoneId: 'UTC' });

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

const item = (id: string, day: string, city: string, title: string, mine = false) => ({
  id,
  day,
  city,
  title,
  description: 'Something to do.',
  start_time: null,
  end_time: null,
  created_by: mine ? USER_ID : null,
  created_at: '2026-09-01T00:00:00Z',
});

// Two things on every day of the trip, so the list is long enough to scroll.
const TRIP = Array.from({ length: 15 }, (_, i) => {
  const day = `2027-06-${String(6 + i).padStart(2, '0')}`;
  const city = i < 5 ? 'Tokyo' : i < 6 ? 'Kyoto' : i < 9 ? 'Beijing' : i < 12 ? 'Shanghai' : 'Hong Kong';
  return [item(`a${i}`, day, city, `Morning of day ${i + 1}`), item(`b${i}`, day, city, `Evening of day ${i + 1}`, i === 0)];
}).flat();

test('add to the itinerary: the day and time come from pickers, the city follows the day', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { itinerary_items: [] });
  await open(page, '/itinerary/new');

  // Before the trip it starts on the first day, in Tokyo.
  const day = page.getByTestId('itinerary-day');
  await expect(day).toHaveAttribute('type', 'date');
  await expect(day).toHaveValue('2027-06-06');
  await expect(page.getByLabel('City')).toHaveValue('Tokyo');

  // Nothing is sent without a title.
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByText('Give it a title.')).toBeVisible();
  expect(backend.inserts).toHaveLength(0);

  // The city follows the day's leg…
  await day.fill('2027-06-13');
  await expect(page.getByLabel('City')).toHaveValue('Beijing');
  // …until you type your own.
  await page.getByLabel('City').fill('Mutianyu');
  await day.fill('2027-06-14');
  await expect(page.getByLabel('City')).toHaveValue('Mutianyu');

  await page.getByLabel('Title').fill('Great Wall');
  await expect(page.getByTestId('itinerary-time')).toHaveAttribute('type', 'time');
  await page.getByTestId('itinerary-time').fill('09:30');
  await page.getByText('Save', { exact: true }).click();

  await expect.poll(() => backend.inserts.length).toBe(1);
  expect(backend.inserts[0]).toEqual({
    table: 'itinerary_items',
    body: {
      day: '2027-06-14',
      title: 'Great Wall',
      city: 'Mutianyu',
      description: null,
      start_time: '2027-06-14T09:30:00.000Z',
      created_by: USER_ID,
    },
  });
});

test('removing your own item asks first', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { itinerary_items: TRIP });
  await open(page, '/itinerary');
  const trash = page.getByLabel('Delete Evening of day 1');
  await expect(trash).toBeVisible();
  // The plan's own rows have no trash can.
  await expect(page.getByLabel('Delete Morning of day 1')).toHaveCount(0);

  page.once('dialog', (d) => {
    expect(d.message()).toContain('Remove “Evening of day 1”?');
    void d.dismiss();
  });
  await trash.click();
  await expect(page.getByText('Evening of day 1', { exact: true })).toBeVisible();
  expect(backend.deletes).toHaveLength(0);

  page.once('dialog', (d) => void d.accept());
  await trash.click();
  await expect(page.getByText('Evening of day 1', { exact: true })).toHaveCount(0);
  expect(backend.deletes).toEqual([{ table: 'itinerary_items', query: '?id=eq.b0' }]);
});

test('during the trip the itinerary opens on today', async ({ page }) => {
  // The same plan moved so that its tenth day is today (a pretend 2027 clock would expire the test's sign-in).
  const dayAt = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const moved = TRIP.map((it, i) => ({ ...it, day: dayAt(Math.floor(i / 2) - 9) }));
  await signInWithFakeBackend(page, { itinerary_items: moved });
  await open(page, '/itinerary');
  const today = page.getByTestId('itinerary-today');
  await expect(today.getByText('Today', { exact: true })).toBeVisible();
  await expect(today.getByText('Morning of day 10')).toBeInViewport();
  // Day one has scrolled away above.
  await expect(page.getByText('Morning of day 1', { exact: true })).not.toBeInViewport();
});

test('before the trip it opens at the top, with no “Today”', async ({ page }) => {
  await signInWithFakeBackend(page, { itinerary_items: TRIP });
  await open(page, '/itinerary');
  await expect(page.getByText('Morning of day 1', { exact: true })).toBeInViewport();
  await expect(page.getByTestId('itinerary-today')).toHaveCount(0);
});
