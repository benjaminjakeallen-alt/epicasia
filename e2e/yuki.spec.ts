import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Yuki, the AI trip assistant: the screen talks to the `yuki` Edge Function
// (answered by the fake backend — no AI is called in tests).

const PROFILES = [{ id: USER_ID, display_name: 'Test Traveler', avatar_url: null, is_admin: false }];

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

const asks = (backend: Awaited<ReturnType<typeof signInWithFakeBackend>>) =>
  backend.functions.filter((f) => f.name === 'yuki').map((f) => f.body as Record<string, unknown>);

test('home opens Yuki; a suggestion asks, the answer shows, follow-ups carry the conversation', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES });
  await open(page, '/');
  await page.getByTestId('home-yuki').click();
  await expect(page.getByText('Hi Test, I’m Yuki')).toBeVisible();

  await page.getByText('What’s the plan today?').click();
  await expect(page.getByTestId('yuki-reply')).toHaveText('Today is Tokyo DisneySea! Gates open at 9:00.');
  const first = asks(backend)[0];
  expect(first).toMatchObject({ action: 'ask', name: 'Test', messages: [{ role: 'user', text: 'What’s the plan today?' }] });
  expect(String(first.today)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(typeof first.tz).toBe('string');

  await page.getByTestId('yuki-input').fill('And tomorrow?');
  await page.getByTestId('yuki-send').click();
  await expect.poll(() => asks(backend).length).toBe(2);
  expect(asks(backend)[1].messages).toEqual([
    { role: 'user', text: 'What’s the plan today?' },
    { role: 'assistant', text: 'Today is Tokyo DisneySea! Gates open at 9:00.' },
    { role: 'user', text: 'And tomorrow?' },
  ]);
  await expect(page.getByTestId('yuki-reply')).toHaveCount(2);
});

test('the conversation stays on this phone until you start a new chat', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES });
  await open(page, '/yuki');
  await page.getByTestId('yuki-input').fill('Where do we stay in Kyoto?');
  await page.getByTestId('yuki-send').click();
  await expect(page.getByTestId('yuki-reply')).toHaveCount(1);

  await page.reload();
  await page.getByLabel('Skip intro').click();
  await expect(page.getByText('Where do we stay in Kyoto?')).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await page.getByTestId('yuki-new').click();
  await expect(page.getByText('Where do we stay in Kyoto?')).toHaveCount(0);
  await expect(page.getByText('Hi Test, I’m Yuki')).toBeVisible();
});

test('before the AI key is added, Yuki says so (and that reply is not sent back as conversation)', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES });
  let configured = false;
  await page.route(/functions\/v1\/yuki/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    if (configured) return route.fallback();
    backend.functions.push({ name: 'yuki', body: route.request().postDataJSON() });
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ error: 'not_configured', message: 'Yuki isn’t switched on yet — an organizer needs to add the AI key.' }),
    });
  });
  await open(page, '/yuki');
  await page.getByTestId('yuki-input').fill('Hello?');
  await page.getByTestId('yuki-send').click();
  await expect(page.getByTestId('yuki-reply')).toHaveText(/isn’t switched on yet/);

  configured = true;
  await page.getByTestId('yuki-input').fill('Hello again');
  await page.getByTestId('yuki-send').click();
  await expect.poll(() => asks(backend).length).toBe(2);
  expect(asks(backend)[1].messages).toEqual([
    { role: 'user', text: 'Hello?' },
    { role: 'user', text: 'Hello again' },
  ]);
});
