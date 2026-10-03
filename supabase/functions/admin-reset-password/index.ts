// admin-reset-password: an organizer gives a traveler a temporary password
// (for when the reset email doesn't arrive — Supabase's built-in sender is
// slow, rate-limited and often lands in spam).
//
// POST { user_id } with an admin's JWT → { password }
// The caller must be signed in and have profiles.is_admin (read as the
// caller, so RLS applies). The new password is made here, set with the
// service role (inside the function only) and shown once to the organizer,
// who passes it on; the traveler then changes it in Profile.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const WORDS = [
  'sakura', 'ramen', 'panda', 'lantern', 'bamboo', 'temple', 'dragon', 'koi', 'pagoda', 'noodle',
  'tofu', 'matcha', 'kimono', 'shogun', 'dumpling', 'harbor', 'ferry', 'tiger', 'crane', 'lotus',
  'mochi', 'sushi', 'castle', 'jade', 'monsoon', 'mango', 'orchid', 'teapot', 'kite', 'origami',
];

/** Easy to read out or type: two words and four digits, e.g. "lotus-ferry-4821". */
function tempPassword(): string {
  const r = crypto.getRandomValues(new Uint32Array(3));
  return `${WORDS[r[0] % WORDS.length]}-${WORDS[r[1] % WORDS.length]}-${String(r[2] % 10000).padStart(4, '0')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: me, error: meErr } = await asCaller.auth.getUser();
  if (meErr || !me.user) return json({ error: 'Not signed in' }, 401);
  const { data: profile } = await asCaller.from('profiles').select('is_admin').eq('id', me.user.id).maybeSingle();
  if (!profile?.is_admin) return json({ error: 'Organizers only' }, 403);

  let userId: unknown;
  try {
    userId = (await req.json())?.user_id;
  } catch {
    // fall through
  }
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/.test(userId)) return json({ error: 'user_id required' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const password = tempPassword();
  // Confirm the email too: someone stuck on an unconfirmed account gets in.
  const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
  if (error) return json({ error: 'Could not reset that password' }, 500);
  return json({ password });
});
