import type { Page, Request } from '@playwright/test';

// Signed-in screens without touching the real Supabase project: a fake,
// unexpired session is planted in localStorage (supabase-js restores it
// without a network call) and every *.supabase.co request is answered
// here — table reads from `tables`, inserts recorded in `inserts` — or
// aborted. Nothing reaches the live database and no test account exists.

export const USER_ID = '00000000-0000-4000-8000-000000000001';

export type FakeBackend = {
  inserts: { table: string; body: Record<string, unknown> }[];
};

export async function signInWithFakeBackend(
  page: Page,
  tables: Record<string, Record<string, unknown>[]>,
): Promise<FakeBackend> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('EXPO_PUBLIC_SUPABASE_URL must be set for the web build');
  const ref = new URL(url).hostname.split('.')[0];

  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'preview@example.com',
    user_metadata: { display_name: 'Test Traveler' },
    app_metadata: {},
  };
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, exp, role: 'authenticated' })}.sig`,
    refresh_token: 'fake-refresh-token',
    token_type: 'bearer',
    expires_in: 3600 * 24,
    expires_at: exp,
    user,
  };

  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
      localStorage.setItem('epicasia.rememberUntil', String(Date.now() + 86_400_000));
    },
    [`sb-${ref}-auth-token`, JSON.stringify(session)] as const,
  );

  const backend: FakeBackend = { inserts: [] };
  await page.route(/supabase\.co/, async (route) => {
    const req: Request = route.request();
    const match = new URL(req.url()).pathname.match(/^\/rest\/v1\/(\w+)/);
    if (!match) return route.abort();
    const table = match[1];
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tables[table] ?? []) });
    }
    if (req.method() === 'POST') {
      backend.inserts.push({ table, body: req.postDataJSON() });
      return route.fulfill({ status: 201, body: '' });
    }
    return route.fulfill({ status: 204, body: '' });
  });

  return backend;
}
