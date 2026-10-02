import { expect, test, type Page, type Route } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Closed sign-up: registering needs an invite code; admins create and share
// codes. Nothing here reaches Supabase — signed-out pages get their own
// route handler, signed-in ones use the fake backend.

async function skipIntro(page: Page) {
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

/** Signed out: answer Supabase auth calls in-test and record sign-up bodies. */
async function fakeAuth(page: Page, signup: (route: Route) => Promise<void>) {
  const bodies: Record<string, unknown>[] = [];
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  await page.route(/supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/v1/signup') {
      bodies.push(route.request().postDataJSON());
      return signup(route);
    }
    return route.abort();
  });
  return bodies;
}

async function fillRegister(page: Page) {
  await page.getByLabel('Name').fill('Sarah Lee');
  await page.getByLabel('Email').fill('sarah@example.com');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByLabel('Confirm Password').fill('correct horse battery');
}

test('an invite link fills the code; a valid code signs up with it', async ({ page }) => {
  const bodies = await fakeAuth(page, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'new-user', aud: 'authenticated', email: 'sarah@example.com', user_metadata: {} }),
    }),
  );
  await page.goto('/register?invite=k7qm2xpa');
  await skipIntro(page);

  await expect(page.getByTestId('invite-code')).toHaveValue('K7QM-2XPA');
  await fillRegister(page);
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page.getByText('Check your email')).toBeVisible();
  expect(bodies[0]).toMatchObject({
    email: 'sarah@example.com',
    data: { display_name: 'Sarah Lee', invite_code: 'K7QM-2XPA' },
  });
});

test('no code: refused before anything is sent', async ({ page }) => {
  const bodies = await fakeAuth(page, (route) => route.abort());
  await page.goto('/register');
  await skipIntro(page);
  await fillRegister(page);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText(/Enter the invite code a trip organizer sent you/)).toBeVisible();
  expect(bodies).toHaveLength(0);
});

test('a code the server rejects gets a plain explanation', async ({ page }) => {
  // What Supabase returns when the new-user trigger raises.
  await fakeAuth(page, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 500, error_code: 'unexpected_failure', msg: 'Database error saving new user' }),
    }),
  );
  await page.goto('/register');
  await skipIntro(page);
  await page.getByTestId('invite-code').fill('ZZZZ-ZZZZ');
  await fillRegister(page);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText(/That invite code isn’t valid any more/)).toBeVisible();
});

const ADMIN = [{ id: USER_ID, display_name: 'Test Traveler', avatar_url: null, is_admin: true }];

test('an admin creates a code and gets a QR, share, email and copy', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, {
    profiles: ADMIN,
    trip_invites: [
      { code: 'OLDC-ODE2', label: null, created_at: '2026-09-01T00:00:00Z', expires_at: null, max_uses: 1, uses: 1, revoked_at: null },
    ],
  });
  // The database generates the code; answer the insert like it would.
  await page.route(/\/rest\/v1\/trip_invites/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    backend.inserts.push({ table: 'trip_invites', body: route.request().postDataJSON() });
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'K7QM-2XPA',
        label: 'The Allen family',
        created_at: new Date().toISOString(),
        expires_at: null,
        max_uses: 5,
        uses: 0,
        revoked_at: null,
      }),
    });
  });

  await page.goto('/profile');
  await skipIntro(page);
  await page.getByTestId('open-invites').click();
  await expect(page.getByRole('heading', { name: 'Invites' })).toBeVisible();
  // The used-up code is listed as no longer active.
  await expect(page.getByText(/OLDC-ODE2 · used 1 · used up/)).toBeVisible();

  await page.getByLabel("Who it's for (optional)").fill('The Allen family');
  await page.getByRole('radio', { name: '5 people', exact: true }).click();
  await page.getByTestId('create-invite').click();

  await expect(page.getByText('New code K7QM-2XPA is ready to share')).toBeVisible();
  expect(backend.inserts.find((i) => i.table === 'trip_invites')!.body).toEqual({
    created_by: USER_ID,
    label: 'The Allen family',
    max_uses: 5,
    expires_at: null,
  });
  const card = page.getByTestId('invite-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByText('Used 0 of 5')).toBeVisible();
  await expect(card.getByRole('img', { name: /QR code that opens registration with K7QM-2XPA/ })).toBeVisible();
  for (const name of ['Share K7QM-2XPA', 'Email K7QM-2XPA', 'Copy K7QM-2XPA', 'Turn off K7QM-2XPA']) {
    await expect(card.getByRole('button', { name })).toBeVisible();
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/invites.png', fullPage: true });
});

test('travelers who are not admins never see invites', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: [{ ...ADMIN[0], is_admin: false }] });
  await page.goto('/profile');
  await skipIntro(page);
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(page.getByTestId('open-invites')).toHaveCount(0);
});
