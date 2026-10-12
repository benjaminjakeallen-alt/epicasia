import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend } from './support/fakeBackend';

// The Home Screen app picks up new builds (src/lib/appUpdate.ts): the page
// fetched fresh names a different entry script → reload. A phone kept
// running an old build for days without this.

const NEW_BUILD = '<!doctype html><html><body><script src="/_expo/static/js/web/entry-0123456789abcdef.js" defer></script></body></html>';

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}
/** The site serves the same build (the dev page itself) or a newer one. */
async function serve(page: Page, which: 'same' | 'new') {
  await page.unroute('**/?__v=*');
  await page.route('**/?__v=*', (route) =>
    which === 'same' ? route.continue() : route.fulfill({ status: 200, contentType: 'text/html', body: NEW_BUILD }),
  );
}

test('same build: no bar', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await serve(page, 'same');
  const checked = page.waitForRequest('**/?__v=*');
  await open(page, '/games');
  await checked;
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
});

test('a newer build: the bar offers it, and Update reloads into it', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await serve(page, 'new');
  await open(page, '/games');
  await expect(page.getByTestId('update-banner')).toBeVisible();
  await expect(page.getByTestId('update-banner')).toContainText('A new version of Epic Asia is ready');
  await page.evaluate(() => ((window as any).__beforeUpdate = true));
  await serve(page, 'same');
  await Promise.all([page.waitForEvent('load'), page.getByTestId('update-now').click()]);
  expect(await page.evaluate(() => (window as any).__beforeUpdate)).toBeUndefined();
});

test('coming back to the app on home switches to a newer build by itself', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await serve(page, 'same');
  const checked = page.waitForRequest('**/?__v=*');
  await open(page, '/');
  await checked;
  await page.evaluate(() => ((window as any).__beforeUpdate = true));
  await serve(page, 'new');
  const reloaded = page.waitForEvent('load');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // (the page is visible: "came back")
  await reloaded;
  expect(await page.evaluate(() => (window as any).__beforeUpdate)).toBeUndefined();
});
