import { expect, test } from '@playwright/test';
import appJson from '../app.json';
import { signInWithFakeBackend } from './support/fakeBackend';

const VERSION = appJson.expo.version;

test('first launch plays the full intro and remembers it', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await page.goto('/');
  const skip = page.getByLabel('Skip intro');
  await expect(skip).toBeVisible();
  // Still playing well past the short version's length.
  await page.waitForTimeout(2600);
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(skip).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('epicasia.introSeenVersion'))).toBe(VERSION);
});

test('later launches get the short intro', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await page.addInitScript((v) => localStorage.setItem('epicasia.introSeenVersion', v), VERSION);
  await page.goto('/');
  const skip = page.getByLabel('Skip intro');
  await expect(skip).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/intro-short.png' });
  // Gone on its own (1.5s + fade), no tap needed.
  await expect(skip).toHaveCount(0, { timeout: 3500 });
  await expect(page.getByTestId('home-title')).toBeVisible();
});

test('a new app version plays the full intro again', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await page.addInitScript(() => localStorage.setItem('epicasia.introSeenVersion', '0.0.0-old'));
  await page.goto('/');
  await page.waitForTimeout(2600);
  await expect(page.getByLabel('Skip intro')).toBeVisible();
});

test('the intro can be switched off (accessibility mode)', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await page.addInitScript(() => localStorage.setItem('epicasia.introSkip', '1'));
  await page.goto('/');
  await expect(page.getByTestId('home-title')).toBeVisible();
  await expect(page.getByLabel('Skip intro')).toHaveCount(0);
});
