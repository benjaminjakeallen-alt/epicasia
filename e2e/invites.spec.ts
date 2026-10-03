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
// Sign-up goes through the join-trip Edge Function, then a password sign-in.
async function fakeAuth(page: Page, join: (route: Route) => Promise<void>) {
  const bodies: Record<string, unknown>[] = [];
  const signIns: Record<string, unknown>[] = [];
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  await page.route(/supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/functions/v1/join-trip') {
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      bodies.push(route.request().postDataJSON());
      return join(route);
    }
    if (url.pathname === '/auth/v1/token') {
      signIns.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession()) });
    }
    if (url.pathname === '/auth/v1/signup') throw new Error('sign-up must not use Supabase Auth directly (its emails are rate-limited)');
    return route.abort();
  });
  return { bodies, signIns };
}

function fakeSession() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, exp, role: 'authenticated' })}.sig`,
    refresh_token: 'r',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'sarah@example.com', user_metadata: { display_name: 'Sarah Lee' }, app_metadata: {} },
  };
}

const answer = (status: number, body: object) => (route: Route) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

async function fillRegister(page: Page) {
  await page.getByLabel('Name').fill('Sarah Lee');
  await page.getByLabel('Email').fill('sarah@example.com');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByLabel('Confirm Password').fill('correct horse battery');
}

test('an invite link fills the code; signing up makes the account and goes straight in (no email)', async ({ page }) => {
  const { bodies, signIns } = await fakeAuth(page, answer(200, { ok: true }));
  await page.goto('/register?invite=k7qm2xpa');
  await skipIntro(page);

  await expect(page.getByTestId('invite-code')).toHaveValue('K7QM-2XPA');
  await fillRegister(page);
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page).not.toHaveURL(/register/);
  expect(bodies).toEqual([
    { email: 'sarah@example.com', password: 'correct horse battery', display_name: 'Sarah Lee', invite_code: 'K7QM-2XPA' },
  ]);
  expect(signIns).toEqual([{ email: 'sarah@example.com', password: 'correct horse battery', gotrue_meta_security: {} }]);
});

test('arriving from a confirmation email says the email is confirmed', async ({ page }) => {
  await fakeAuth(page, (route) => route.abort());
  await page.goto('/login?confirmed=1');
  await skipIntro(page);
  await expect(page.getByTestId('email-confirmed')).toContainText('Your email is confirmed');
});

test('no code: refused before anything is sent', async ({ page }) => {
  const { bodies } = await fakeAuth(page, (route) => route.abort());
  await page.goto('/register');
  await skipIntro(page);
  await fillRegister(page);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText(/Enter the invite code a trip organizer sent you/)).toBeVisible();
  expect(bodies).toHaveLength(0);
});

test('the server’s reason is shown: a dead code, an existing account', async ({ page }) => {
  let reply = answer(400, { error: 'invalid_invite', message: 'That invite code isn’t valid any more. Ask a trip organizer for a current one.' });
  const { signIns } = await fakeAuth(page, (route) => reply(route));
  await page.goto('/register');
  await skipIntro(page);
  await page.getByTestId('invite-code').fill('ZZZZ-ZZZZ');
  await fillRegister(page);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText(/That invite code isn’t valid any more/)).toBeVisible();

  reply = answer(409, { error: 'exists', message: 'There’s already an account with that email. Sign in, or use “Forgot password”.' });
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText(/already an account with that email/)).toBeVisible();
  expect(signIns).toHaveLength(0);
});

test('a blank email or short password is caught before anything is sent', async ({ page }) => {
  const { bodies } = await fakeAuth(page, (route) => route.abort());
  await page.goto('/register?invite=YRJA-DM4F');
  await skipIntro(page);
  await page.getByLabel('Name').fill('Sarah Lee');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText('Enter your email address.')).toBeVisible();
  await page.getByLabel('Email').fill('sarah@example.com');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm Password').fill('short');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText('Choose a password of at least 8 characters.')).toBeVisible();
  expect(bodies).toHaveLength(0);
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
  await page.getByTestId('open-admin').click();
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
  // Shared links point at the public site, never the address the organizer
  // happens to be browsing (Vercel's deployment URLs ask visitors to log in).
  await page.evaluate(() => {
    (window as unknown as { opened: string[] }).opened = [];
    window.open = ((url: string) => {
      (window as unknown as { opened: string[] }).opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
  await card.getByRole('button', { name: 'Email K7QM-2XPA' }).click();
  const opened = await page.evaluate(() => (window as unknown as { opened: string[] }).opened);
  expect(decodeURIComponent(opened[0])).toContain('https://epicasia.vercel.app/register?invite=K7QM-2XPA');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/invites.png', fullPage: true });
});

test('travelers who are not admins never see invites', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: [{ ...ADMIN[0], is_admin: false }] });
  await page.goto('/profile');
  await skipIntro(page);
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(page.getByTestId('open-admin')).toHaveCount(0);
});
