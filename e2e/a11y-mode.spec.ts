import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend } from './support/fakeBackend';

// The "large & spoken" accessibility mode. Speech goes through the browser's
// speechSynthesis on web (expo-speech), stubbed here to record what's said.

async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: string[] };
    w.__spoken = [];
    const synth = window.speechSynthesis;
    if (synth) {
      synth.speak = (u: SpeechSynthesisUtterance) => {
        w.__spoken.push(u.text);
      };
      synth.cancel = () => {};
    }
  });
}

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

async function skipIntro(page: Page) {
  const skip = page.getByLabel('Skip intro');
  if (await skip.count()) {
    await skip.click();
    await expect(skip).toHaveCount(0);
  }
}

test('turning the mode on in settings makes the menu large and skips the intro next time', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await page.goto('/accessibility');
  await skipIntro(page);

  await expect(page.getByTestId('a11y-speak')).toHaveCount(0);
  await page.getByTestId('a11y-mode').click();
  await expect(page.getByTestId('a11y-mode')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('a11y-speak')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('epicasia.a11yMode') ?? '{}'));
  expect(stored).toMatchObject({ enabled: true, speak: true, rate: 1 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('epicasia.introSkip'))).toBe('1');

  // Next launch: straight to home, no intro, the large menu with only the
  // front hub tappable.
  await page.goto('/');
  await expect(page.getByLabel('Skip intro')).toHaveCount(0);
  await expect(page.getByTestId('home-title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Itinerary', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arrivals', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Itinerary' })).toBeInViewport();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/a11y-mode-home.png' });
});

test('turning the ring reads the new item aloud', async ({ page }) => {
  await recordSpeech(page);
  await signInWithFakeBackend(page, {});
  await page.addInitScript(() =>
    localStorage.setItem('epicasia.a11yMode', JSON.stringify({ enabled: true, speak: true, rate: 1, offered: true })),
  );
  await page.goto('/');
  await skipIntro(page);

  await page.getByLabel('Next').click();
  await expect.poll(() => spoken(page)).toContainEqual(expect.stringMatching(/^Arrivals, 2 of 7\. Visas, airports/));
  await page.getByLabel('Next').click();
  await expect.poll(() => spoken(page)).toContainEqual(expect.stringMatching(/^Photos, 3 of 7\./));
});

test('with speech off, nothing is spoken', async ({ page }) => {
  await recordSpeech(page);
  await signInWithFakeBackend(page, {});
  await page.addInitScript(() =>
    localStorage.setItem('epicasia.a11yMode', JSON.stringify({ enabled: true, speak: false, rate: 1, offered: true })),
  );
  await page.goto('/');
  await skipIntro(page);
  await page.getByLabel('Next').click();
  await page.waitForTimeout(800);
  expect(await spoken(page)).toEqual([]);
});

test('the menu is one adjustable control for screen readers', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await page.goto('/');
  await skipIntro(page);
  // RN-web exposes accessibilityRole="adjustable" as a slider.
  const ring = page.getByRole('slider', { name: 'Itinerary, 1 of 7' });
  await expect(ring).toBeVisible();
  await page.getByLabel('Next').click();
  await expect(page.getByRole('slider', { name: 'Arrivals, 2 of 7' })).toBeVisible();
});
