import { expect, test } from '@playwright/test';

test('unauthenticated visit redirects to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Epic Asia');
  // Skip the launch sequence (tap anywhere) to reach the redirect immediately
  // instead of waiting out its ~3.5s animation.
  await page.mouse.click(195, 700);

  // Text unique to the login screen (unlike "Epic Asia", which also appears
  // in the launch-sequence wordmark and could still be mid-fade-out here).
  await expect(page.getByText('Sign in to your trip')).toBeVisible();
  await expect(page.getByText('EMAIL', { exact: true })).toBeVisible();
  await expect(page.getByText('PASSWORD', { exact: true })).toBeVisible();
  await expect(page.getByText('Sign In', { exact: true })).toBeVisible();
});
