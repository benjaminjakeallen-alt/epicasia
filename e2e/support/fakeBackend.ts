import type { Page, Request } from '@playwright/test';

// Signed-in screens without touching the real Supabase project: a fake,
// unexpired session is planted in localStorage (supabase-js restores it
// without a network call) and every *.supabase.co request is answered
// here — table reads from `tables`, inserts recorded in `inserts` — or
// aborted. Nothing reaches the live database and no test account exists.

export const USER_ID = '00000000-0000-4000-8000-000000000001';

export type FakeBackend = {
  inserts: { table: string; body: Record<string, unknown> }[];
  deletes: { table: string; query: string }[];
  updates: { table: string; query: string; body: Record<string, unknown> }[];
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

  const backend: FakeBackend = { inserts: [], deletes: [], updates: [] };
  // Realtime (websocket) is never let through: close it so tests stay offline.
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  await page.route(/supabase\.co/, async (route) => {
    const req: Request = route.request();
    const url = new URL(req.url());
    const match = url.pathname.match(/^\/rest\/v1\/(\w+)/);
    if (!match) return route.abort();
    const table = match[1];
    const method = req.method();
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tables[table] ?? []) });
    }
    if (method === 'POST') {
      const body = req.postDataJSON();
      backend.inserts.push({ table, body });
      // `.insert(...).select()` asks for the row back (Prefer:
      // return=representation); `.single()` wants an object, not an array.
      if ((req.headers()['prefer'] ?? '').includes('return=representation')) {
        const row = { created_at: new Date().toISOString(), deleted_at: null, ...body };
        const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(single ? row : [row]) });
      }
      return route.fulfill({ status: 201, body: '' });
    }
    if (method === 'DELETE') backend.deletes.push({ table, query: url.search });
    if (method === 'PATCH') backend.updates.push({ table, query: url.search, body: req.postDataJSON() });
    return route.fulfill({ status: 204, body: '' });
  });

  return backend;
}
