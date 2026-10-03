import type { Page, Request } from '@playwright/test';

// Signed-in screens without touching the real Supabase project: a fake,
// unexpired session is planted in localStorage (supabase-js restores it
// without a network call) and every *.supabase.co request is answered
// here — table reads from `tables`, inserts recorded in `inserts` — or
// aborted. Nothing reaches the live database and no test account exists.

export const USER_ID = '00000000-0000-4000-8000-000000000001';
/** A well-formed P-256 public key (65 bytes, base64url) for push subscription tests. */
const FAKE_VAPID_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

export type FakeBackend = {
  inserts: { table: string; body: Record<string, unknown> }[];
  deletes: { table: string; query: string }[];
  updates: { table: string; query: string; body: Record<string, unknown> }[];
  authUpdates: Record<string, unknown>[];
  uploads: { bucket: string; path: string }[];
  /** Storage files removed: `{ bucket, paths }`. */
  removals: { bucket: string; paths: string[] }[];
  functions: { name: string; body: unknown }[];
};

export async function signInWithFakeBackend(
  page: Page,
  tables: Record<string, Record<string, unknown>[]>,
  // Every storage object is served as this file (so photo grids render).
  photoFile = 'assets/images/places/kyoto-kinkakuji.jpg',
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
      if (window.top !== window) return; // init scripts run in iframes too (e.g. the sandboxed game, no storage)
      localStorage.setItem(key, value);
      localStorage.setItem('epicasia.rememberUntil', String(Date.now() + 86_400_000));
    },
    [`sb-${ref}-auth-token`, JSON.stringify(session)] as const,
  );

  const backend: FakeBackend = { inserts: [], deletes: [], updates: [], authUpdates: [], uploads: [], removals: [], functions: [] };
  // Realtime (websocket) is never let through: close it so tests stay offline.
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  // Exchange rates and weather (Toolkit) never come from the real services in tests:
  // offline unless a spec answers them itself (later routes win).
  await page.route(/open\.er-api\.com|api\.frankfurter\.dev|api\.open-meteo\.com/, (route) => route.abort('internetdisconnected'));
  await page.route(/supabase\.co/, async (route) => {
    const req: Request = route.request();
    const url = new URL(req.url());
    // Storage: hand out fake signed URLs and serve them from a local file.
    const sign = url.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/?(.*)$/);
    if (sign && req.method() === 'POST') {
      const body = req.postDataJSON() ?? {};
      const bucket = sign[1];
      const one = (path: string) => ({ path, signedURL: `/object/sign/${bucket}/${path}?token=fake`, error: null });
      const json = Array.isArray(body.paths) ? body.paths.map(one) : { signedURL: one(sign[2]).signedURL };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    }
    if (sign && req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'image/jpeg', path: photoFile });
    }
    // Auth: updating your own user (name) echoes the change back.
    if (url.pathname === '/auth/v1/user' && req.method() === 'PUT') {
      const body = req.postDataJSON() ?? {};
      backend.authUpdates.push(body);
      const updated = { ...user, user_metadata: { ...user.user_metadata, ...(body.data ?? {}) } };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
    }
    // Edge Functions (e.g. notify-chat) are recorded, never run.
    const fn = url.pathname.match(/^\/functions\/v1\/(.+)$/);
    if (fn) {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      const body = req.postDataJSON();
      backend.functions.push({ name: fn[1], body });
      // notify-chat's "key" action hands back a (fixed, fake) VAPID public key.
      const answer =
        fn[1] === 'admin-reset-password'
          ? { password: 'lotus-ferry-4821' }
          : body?.action === 'key'
            ? { publicKey: FAKE_VAPID_KEY }
            : body?.action
              ? { ok: true }
              : { sent: 0 };
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(answer) });
    }
    // Storage uploads succeed and are recorded.
    const upload = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (upload && req.method() === 'POST') {
      backend.uploads.push({ bucket: upload[1], path: decodeURIComponent(upload[2]) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: `${upload[1]}/${upload[2]}` }) });
    }
    // Storage removals (supabase-js `remove()`) succeed and are recorded.
    const removal = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/?$/);
    if (removal && req.method() === 'DELETE') {
      const paths: string[] = req.postDataJSON()?.prefixes ?? [];
      backend.removals.push({ bucket: removal[1], paths });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paths.map((name) => ({ name }))) });
    }
    const match = url.pathname.match(/^\/rest\/v1\/(\w+)/);
    if (!match) return route.abort();
    const table = match[1];
    const method = req.method();
    if (method === 'GET' || method === 'HEAD') {
      const rows = filterRows(tables[table] ?? [], url.searchParams);
      // `select(..., { count: 'exact', head: true })` reads the total from Content-Range.
      if ((req.headers()['prefer'] ?? '').includes('count=exact')) {
        const range = {
          'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
          'access-control-expose-headers': 'content-range',
          'access-control-allow-origin': '*',
        };
        if (method === 'HEAD') return route.fulfill({ status: 200, headers: range, body: '' });
        return route.fulfill({ status: 200, contentType: 'application/json', headers: range, body: JSON.stringify(rows) });
      }
      if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) {
        // .single() / .maybeSingle(): one object, or PostgREST's "no rows" error.
        return rows.length
          ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows[0]) })
          : route.fulfill({
              status: 406,
              contentType: 'application/json',
              body: JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows', hint: null }),
            });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
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
    if (method === 'PATCH') {
      const body = req.postDataJSON();
      backend.updates.push({ table, query: url.search, body });
      // `.update(...).select()` gets the matching fixture rows back, changed.
      if ((req.headers()['prefer'] ?? '').includes('return=representation')) {
        const rows = filterRows(tables[table] ?? [], url.searchParams).map((r) => ({ ...r, ...body }));
        const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? (rows[0] ?? body) : rows) });
      }
    }
    return route.fulfill({ status: 204, body: '' });
  });

  return backend;
}

// The simple PostgREST filters the app uses (`col=eq.x`, `neq.x`, `in.(a,b)`,
// `is.null`, `gt.x` — a string compare, fine for ISO timestamps)
// so a fixture table can serve differently filtered queries; other params
// (select, order, limit, unknown operators) are ignored.
function filterRows(rows: Record<string, unknown>[], params: URLSearchParams) {
  let out = rows;
  for (const [col, raw] of params) {
    const m = raw.match(/^(eq|neq|in|gt|is)\.(.*)$/);
    if (!m || ['select', 'order', 'limit', 'offset'].includes(col)) continue;
    const [, op, val] = m;
    const str = (v: unknown) => (v === null || v === undefined ? 'null' : String(v));
    if (op === 'eq') out = out.filter((r) => str(r[col]) === val);
    if (op === 'neq') out = out.filter((r) => str(r[col]) !== val);
    if (op === 'is') out = out.filter((r) => str(r[col]) === val);
    if (op === 'gt') out = out.filter((r) => r[col] !== null && r[col] !== undefined && String(r[col]) > val);
    if (op === 'in') {
      const set = new Set(val.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, '')));
      out = out.filter((r) => set.has(str(r[col])));
    }
  }
  return out;
}
