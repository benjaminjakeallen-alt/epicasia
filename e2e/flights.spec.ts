import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// A US time zone on purpose: flight times are airport-local wall-clock
// times and must not shift with the phone's zone.
test.use({ timezoneId: 'America/Los_Angeles' });

const OTHER_USER = '00000000-0000-4000-8000-000000000002';

const FLIGHTS = [
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
    created_at: '2026-09-30T00:00:00Z',
  },
  {
    id: 'f2',
    airline: 'Air China',
    flight_number: 'CA 928',
    departure_airport: 'KIX',
    arrival_airport: 'PEK',
    departure_time: '2027-06-11T22:50:00Z',
    arrival_time: '2027-06-12T01:20:00Z',
    confirmation_code: null,
    created_by: OTHER_USER,
    created_at: '2026-09-30T00:00:00Z',
  },
];

// Every cold load plays the launch sequence over the screen. Skip it and
// wait until it has unmounted, so assertions and screenshots see the
// screen itself rather than content hidden underneath the intro.
async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

test('arrivals lists boarding passes boarding passes in airport-local time', async ({ page }) => {
  await signInWithFakeBackend(page, { flights: FLIGHTS });
  await open(page, '/arrivals');

  const passes = page.getByTestId('boarding-pass');
  await expect(passes).toHaveCount(2);
  const first = passes.first();
  await expect(first.getByText('ANA · NH 961')).toBeVisible();
  await expect(first.getByText('10:30 AM')).toBeVisible();
  await expect(first.getByText('1:45 PM')).toBeVisible();
  await expect(first.getByText('Tokyo Narita')).toBeVisible();
  await expect(first.getByText('ABC123')).toBeVisible();
  await expect(first.getByText('Fri, Jun 11')).toBeVisible();

  // Overnight arrival is flagged +1.
  await expect(passes.nth(1).getByText('+1')).toBeVisible();

  // Only your own flights can be deleted.
  await expect(page.getByLabel('Delete flight NRT to PEK')).toBeVisible();
  await expect(page.getByLabel('Delete flight KIX to PEK')).toHaveCount(0);

  await page.screenshot({ path: 'test-results/flights-list.png' });
});

test('removing a flight asks first; tapping the confirmation code copies it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const backend = await signInWithFakeBackend(page, { flights: FLIGHTS });
  await open(page, '/arrivals');
  const trash = page.getByLabel('Delete flight NRT to PEK');

  page.once('dialog', (d) => {
    expect(d.message()).toContain('Remove the flight to Beijing Capital?');
    void d.dismiss();
  });
  await trash.click();
  await expect(trash).toBeVisible();
  expect(backend.deletes).toHaveLength(0);

  // The confirmation code is a button that copies it.
  const code = page.getByTestId('copy-confirmation').first();
  await code.click();
  await expect(code).toHaveAccessibleName('Copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(FLIGHTS.map((f) => f.confirmation_code)).toContain(copied);
  await expect(code).toHaveAccessibleName(`Copy confirmation code ${copied}`, { timeout: 5000 });

  page.once('dialog', (d) => void d.accept());
  await trash.click();
  await expect(trash).toHaveCount(0);
  expect(backend.deletes.map((d) => d.table)).toEqual(['flights']);
});

test('add-flight form validates and saves wall-clock times', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { flights: [] });
  await open(page, '/flights/new');

  await page.getByPlaceholder('NRT').fill('NR');
  await page.getByPlaceholder('PEK').fill('pek');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByText('From and To must be 3-letter airport codes', { exact: false })).toBeVisible();

  await page.getByPlaceholder('ANA').fill('ANA');
  await page.getByPlaceholder('NH 961').fill('nh 961');
  await page.getByPlaceholder('NRT').fill('nrt');
  // (date and time come from the phone's own pickers: inputs of type date / time)
  await expect(page.getByTestId('flight-day')).toHaveAttribute('type', 'date');
  await page.getByTestId('flight-day').fill('2027-06-11');
  await page.getByTestId('flight-departs').fill('22:30');
  await page.getByTestId('flight-arrives').fill('01:45'); // earlier clock time -> lands next day
  await page.getByPlaceholder('ABC123').fill('abc123');
  await page.getByText('Save', { exact: true }).click();

  await expect.poll(() => backend.inserts.length).toBe(1);
  expect(backend.inserts[0]).toEqual({
    table: 'flights',
    body: {
      airline: 'ANA',
      flight_number: 'NH 961',
      departure_airport: 'NRT',
      arrival_airport: 'PEK',
      departure_time: '2027-06-11T22:30:00Z',
      arrival_time: '2027-06-12T01:45:00Z',
      confirmation_code: 'ABC123',
      created_by: USER_ID,
    },
  });
});
