import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Arrivals (replaced Flights): country guides, the before-you-go
// checklist, boarding passes, and My documents (private uploads).

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

const FLIGHT = {
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
};

const PASSPORT_DOC = {
  id: 'd1',
  user_id: USER_ID,
  kind: 'passport',
  label: 'Passport',
  storage_path: `${USER_ID}/d1.jpg`,
  thumb_path: `${USER_ID}/d1.thumb.jpg`,
  mime: 'image/jpeg',
  size_bytes: 1_400_000,
  file_name: 'passport.jpg',
  created_at: '2026-10-01T00:00:00Z',
};

test('home menu opens Arrivals with the countries, checklist and flights', async ({ page }) => {
  await signInWithFakeBackend(page, { flights: [FLIGHT] });
  await open(page, '/arrivals');
  await expect(page.getByTestId('country-card')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^Mainland China, Jun 11 – 17/ })).toBeVisible();
  await expect(page.getByTestId('boarding-pass')).toHaveCount(1);
  await expect(page.getByText('ABC123')).toBeVisible();
  await page.screenshot({ path: 'test-results/arrivals.png', fullPage: true });

  // Checklist ticks are remembered on this phone.
  const first = page.getByTestId('checklist-item').first();
  await expect(first).not.toBeChecked();
  await first.click();
  await expect(first).toBeChecked();
  await expect(page.getByText('1 of 8 done')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('checklist-item').first()).toBeChecked();
});

test('a country guide shows visa rules, airport steps and your flights there', async ({ page }) => {
  await signInWithFakeBackend(page, { flights: [FLIGHT] });
  await open(page, '/arrivals');
  await page.getByRole('button', { name: /^Mainland China/ }).click();
  await expect(page.getByRole('heading', { name: 'Mainland China' })).toBeVisible();
  // Opened directly from here on, so the Arrivals screen underneath (still in the DOM on web) doesn't count.
  await open(page, '/arrivals/china');
  await expect(page.getByText(/240-hour visa-free transit/).first()).toBeVisible();
  await expect(page.getByTestId('airport-card')).toHaveCount(2); // PEK + PVG
  await expect(page.getByTestId('airport-card').first().getByText('PEK', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Beijing Capital airport' })).toBeVisible();
  await expect(page.getByTestId('boarding-pass')).toHaveCount(1); // NRT → PEK lands in China
  await page.screenshot({ path: 'test-results/arrivals-china.png', fullPage: true });

  await open(page, '/arrivals/hongKong');
  await expect(page.getByTestId('airport-card')).toHaveCount(1);
  await expect(page.getByTestId('boarding-pass')).toHaveCount(0);
});

test('my documents: empty state, then add a PDF', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { documents: [] });
  await open(page, '/arrivals/documents');
  await expect(page.getByText('Keep your travel papers here')).toBeVisible();

  await page.getByTestId('documents-add-button').click();
  await page.getByRole('radio', { name: 'Travel insurance' }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Travel insurance');

  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('pick-file').click();
  await (await chooser).setFiles('e2e/support/policy.pdf');
  await expect(page.getByTestId('picked-file')).toContainText('policy.pdf');
  await page.getByText('Save', { exact: true }).click();

  await expect.poll(() => backend.inserts.length).toBe(1);
  expect(backend.uploads).toHaveLength(1);
  expect(backend.uploads[0].bucket).toBe('documents');
  expect(backend.uploads[0].path).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]+\\.pdf$`));
  const body = backend.inserts[0].body;
  expect(backend.inserts[0].table).toBe('documents');
  expect(body).toMatchObject({
    user_id: USER_ID,
    kind: 'insurance',
    label: 'Travel insurance',
    storage_path: backend.uploads[0].path,
    thumb_path: null,
    mime: 'application/pdf',
    file_name: 'policy.pdf',
  });
  expect(backend.uploads[0].path).toBe(`${USER_ID}/${body.id}.pdf`);
});

test('my documents: a photo opens full screen and can be deleted', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { documents: [PASSPORT_DOC] });
  await open(page, '/arrivals/documents');
  await expect(page.getByTestId('document-row')).toHaveCount(1);
  await expect(page.getByTestId('document-row').locator('img')).toHaveCount(1); // thumbnail
  await page.getByRole('button', { name: /^Passport\./ }).click();
  await expect(page.getByTestId('document-viewer')).toBeVisible();
  await expect(page.getByTestId('document-viewer').getByRole('img', { name: 'Passport' })).toBeVisible();
  await page.screenshot({ path: 'test-results/document-viewer.png' });

  page.once('dialog', (d) => d.accept());
  await page.getByTestId('document-viewer').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('document-row')).toHaveCount(0);
  expect(backend.deletes).toEqual([{ table: 'documents', query: '?id=eq.d1' }]);
  await expect.poll(() => backend.removals).toEqual([
    { bucket: 'documents', paths: [`${USER_ID}/d1.jpg`, `${USER_ID}/d1.thumb.jpg`] },
  ]);
});
