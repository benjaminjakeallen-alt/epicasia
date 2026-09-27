import { expect, test } from '@playwright/test';

test('home screen renders the trip sections', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Epic Asia');
  await expect(page.getByText('Epic Asia')).toBeVisible();
  for (const section of ['Itinerary', 'Flights', 'Lodging', 'Packing List', 'Journal']) {
    await expect(page.getByText(section)).toBeVisible();
  }
});
