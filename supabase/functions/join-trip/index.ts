// join-trip: sign-up without a confirmation email.
//
// POST { email, password, display_name, invite_code } → { ok: true }
// Creates the account already confirmed (the service role, built into the
// function, never in the app). The invite code is still the gate: the
// new-user trigger (private.handle_new_user, 0010) checks and counts it and
// raises otherwise, so a bad code creates nothing. Exists because Supabase's
// built-in email sender allows only a few emails an hour, and sign-ups were
// failing with "email rate limit exceeded" (Oct 3 2026). The app signs in
// with the password right after.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let input: Record<string, unknown> = {};
  try {
    input = (await req.json()) ?? {};
  } catch {
    return json({ error: 'bad_request', message: 'Bad request' }, 400);
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const name = typeof input.display_name === 'string' ? input.display_name.trim().replace(/\s+/g, ' ') : '';
  const code = typeof input.invite_code === 'string' ? input.invite_code.trim().toUpperCase() : '';

  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return json({ error: 'bad_email', message: 'Enter your email address.' }, 400);
  if (password.length < 8 || password.length > 200) return json({ error: 'bad_password', message: 'Choose a password of at least 8 characters.' }, 400);
  if (!name || name.length > 60) return json({ error: 'bad_name', message: 'Enter your name.' }, 400);
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json({ error: 'invalid_invite', message: 'Enter the invite code a trip organizer sent you.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, invite_code: code },
  });
  if (error) {
    const msg = error.message ?? '';
    if (/already (been )?registered|already exists|email_exists/i.test(msg) || (error as { code?: string }).code === 'email_exists')
      return json({ error: 'exists', message: 'There’s already an account with that email. Sign in, or use “Forgot password”.' }, 409);
    if (/database error/i.test(msg))
      return json({ error: 'invalid_invite', message: 'That invite code isn’t valid any more. Ask a trip organizer for a current one.' }, 400);
    if (/password/i.test(msg)) return json({ error: 'bad_password', message: msg }, 400);
    return json({ error: 'failed', message: 'Couldn’t create the account. Try again in a minute.' }, 500);
  }
  return json({ ok: true });
});
