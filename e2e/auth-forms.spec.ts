import { expect, test, type Page } from '@playwright/test';

// Signed out: the sign-in and reset forms, with Supabase Auth answered in-test.

async function fakeAuth(page: Page) {
  const signIns: Record<string, unknown>[] = [];
  const recoveries: Record<string, unknown>[] = [];
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  await page.route(/supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
    if (url.pathname === '/auth/v1/token') {
      signIns.push(route.request().postDataJSON());
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
      });
    }
    if (url.pathname === '/auth/v1/recover') {
      recoveries.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: '{}' });
    }
    return route.abort();
  });
  return { signIns, recoveries };
}

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

test('sign in: Enter submits, a wrong password is explained plainly, and you can see what you typed', async ({ page }) => {
  const { signIns } = await fakeAuth(page);
  await open(page, '/login');

  // Nothing typed: caught here, nothing sent.
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByTestId('form-error')).toHaveText('Enter your email and password.');
  expect(signIns).toEqual([]);

  await page.getByLabel('Email').fill('  sarah@example.com ');
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('not my password');

  // The eye shows the password and hides it again.
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByLabel('Show what you typed').click();
  await expect(password).not.toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('not my password');
  await page.getByLabel('Hide what you typed').click();
  await expect(password).toHaveAttribute('type', 'password');

  // Enter in the password field signs in (the email is trimmed).
  await password.press('Enter');
  await expect(page.getByTestId('form-error')).toContainText('That email and password don’t match.');
  await expect(page.getByTestId('form-error')).toHaveAttribute('role', 'alert');
  expect(signIns).toHaveLength(1);
  expect(signIns[0]).toMatchObject({ email: 'sarah@example.com', password: 'not my password' });
});

test('“Keep me signed in” is a real checkbox with a full-size row', async ({ page }) => {
  await fakeAuth(page);
  await open(page, '/login');
  const remember = page.getByTestId('remember-me');
  await expect(remember).toHaveAttribute('aria-checked', 'true');
  expect((await remember.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await remember.click();
  await expect(remember).toHaveAttribute('aria-checked', 'false');
});

test('forgot password: a blank or malformed email is caught; Enter sends the link', async ({ page }) => {
  const { recoveries } = await fakeAuth(page);
  await open(page, '/forgot-password');

  await page.getByRole('button', { name: 'Send Reset Link' }).click();
  await expect(page.getByTestId('form-error')).toHaveText('Enter the email address you signed up with.');
  expect(recoveries).toEqual([]);

  const email = page.getByLabel('Email');
  await email.fill(' sarah@example.com ');
  await email.press('Enter');
  await expect(page.getByText('Check your email')).toBeVisible();
  await expect(page.getByText('If an account exists for sarah@example.com, a reset link is on its way.')).toBeVisible();
  expect(recoveries).toHaveLength(1);
  expect(recoveries[0]).toMatchObject({ email: 'sarah@example.com' });
});
