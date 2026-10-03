import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

const PROFILES = [{ id: USER_ID, display_name: 'Test Traveler', avatar_url: null, is_admin: false }];

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

test('rename yourself: the profile row and the auth user both change', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES });
  await open(page, '/profile');

  const field = page.getByTestId('profile-name');
  await expect(field).toHaveValue('Test Traveler');
  await expect(page.getByText('preview@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save name' })).toHaveCount(0);

  await field.fill('  Jake   Allen ');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Name saved')).toBeVisible();

  const patch = backend.updates.find((u) => u.table === 'profiles')!;
  expect(patch.body).toEqual({ display_name: 'Jake Allen' });
  expect(patch.query).toContain(`id=eq.${USER_ID}`);
  expect(backend.authUpdates[0]).toMatchObject({ data: { display_name: 'Jake Allen' } });
});

test('add a profile photo: cropped upload to your avatars folder, then the row points at it', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES });
  await open(page, '/profile');

  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('avatar-library').click();
  await (await chooser).setFiles('assets/images/places/kyoto-kinkakuji.jpg');

  await expect(page.getByText('Photo updated')).toBeVisible({ timeout: 15_000 });
  expect(backend.uploads).toHaveLength(1);
  expect(backend.uploads[0].bucket).toBe('avatars');
  expect(backend.uploads[0].path).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]+\\.jpg$`));
  const patch = backend.updates.find((u) => u.table === 'profiles')!;
  expect(patch.body).toEqual({ avatar_url: backend.uploads[0].path });
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/profile.png' });
});

test('sign out lives on the profile screen and asks first', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES });
  await open(page, '/');
  await page.getByLabel('Your profile').click();
  page.once('dialog', (d) => d.dismiss());
  await page.getByTestId('sign-out').click();
  // Dismissed: still signed in, still on the profile.
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
});

test('change your password', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, {
    profiles: [{ id: USER_ID, display_name: 'Test Traveler', avatar_url: null, is_admin: false }],
  });
  await open(page, '/profile');
  await expect(page.getByTestId('open-travelers')).toHaveCount(0); // organizers only
  await page.getByTestId('new-password').fill('short');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Choose a password of at least 8 characters.')).toBeVisible();
  await page.getByTestId('new-password').fill('a much longer one');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();
  expect(backend.authUpdates).toHaveLength(1);
  expect(backend.authUpdates[0]).toMatchObject({ password: 'a much longer one' });
});

test('an organizer gives a traveler a temporary password', async ({ page }) => {
  const EMILY = '00000000-0000-4000-8000-0000000000ee';
  const backend = await signInWithFakeBackend(page, {
    profiles: [
      { id: USER_ID, display_name: 'Test Traveler', avatar_url: null, is_admin: true },
      { id: EMILY, display_name: 'Emily Cox', avatar_url: null, is_admin: false },
    ],
  });
  await open(page, '/profile');
  await page.getByTestId('open-travelers').click();
  await expect(page.getByTestId('traveler-row')).toHaveCount(2);
  await expect(page.getByLabel('Reset Test Traveler’s password')).toHaveCount(0); // not yourself
  page.once('dialog', (d) => d.accept());
  await page.getByLabel('Reset Emily Cox’s password').click();
  await expect(page.getByTestId('temp-password')).toContainText('lotus-ferry-4821');
  expect(backend.functions).toEqual([{ name: 'admin-reset-password', body: { user_id: EMILY } }]);
});
