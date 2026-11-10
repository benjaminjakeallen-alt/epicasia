import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

const PROFILES = [{ id: USER_ID, display_name: 'Test Traveler', avatar_url: null, is_admin: false }];

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

/** Opacity and transform of everything above an element, multiplied / listed. */
const settled = (page: Page, testID: string) =>
  page.getByTestId(testID).evaluate((el) => {
    let opacity = 1;
    const transforms: string[] = [];
    for (let n: Element | null = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      opacity *= Number(cs.opacity);
      // (a ScrollView carries a static translateZ(0) class of its own)
      if (cs.transform !== 'none' && !n.className.includes('r-transform-')) transforms.push(cs.transform);
    }
    return { opacity, transforms };
  });

test('screens glide in and come to rest exactly in place, both ways', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES });
  await open(page, '/');
  // The first screen has nothing to arrive from.
  expect(await settled(page, 'home-title')).toEqual({ opacity: 1, transforms: [] });

  await page.getByTestId('home-avatar').click();
  await expect(page.getByTestId('profile-name')).toBeVisible();
  // Once it has arrived nothing is left transformed or faded.
  await expect.poll(() => settled(page, 'profile-name')).toEqual({ opacity: 1, transforms: [] });

  await page.getByLabel('Back').click();
  await expect(page.getByTestId('home-title')).toBeVisible();
  await expect.poll(() => settled(page, 'home-title')).toEqual({ opacity: 1, transforms: [] });
});

test('Yuki’s veil fades in over the screen and out again', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES });
  await open(page, '/');
  await page.getByTestId('home-yuki').click();
  const overlay = page.getByTestId('yuki-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS('opacity', '1');
  await page.getByTestId('yuki-stop').click();
  // While it fades it lets taps through, then it's gone.
  await expect(overlay).toHaveCount(0);
  await expect(page.getByTestId('home-title')).toBeVisible();
});
