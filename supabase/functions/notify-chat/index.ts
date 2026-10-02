// notify-chat: push a new group-chat message to everyone else's phones.
//
// Called by the sender's app right after a message is saved:
//   supabase.functions.invoke('notify-chat', { body: { message_id } })
// The caller's own JWT is used to read the message (so RLS applies and only
// its author can trigger a push for it); the service role is used only to
// read other travelers' push tokens and prune dead ones. Sends through
// Expo's push service (https://docs.expo.dev/push-notifications/sending-notifications/).

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
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

  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') ?? '';
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'Not signed in' }, 401);
  const me = userData.user.id;

  let messageId: string | undefined;
  try {
    messageId = (await req.json())?.message_id;
  } catch {
    // fall through
  }
  if (!messageId) return json({ error: 'message_id required' }, 400);

  // Read as the caller: RLS hides anything they can't see.
  const { data: msg, error: msgErr } = await asCaller
    .from('messages')
    .select('id, user_id, body, image_path, deleted_at, created_at')
    .eq('id', messageId)
    .maybeSingle();
  if (msgErr || !msg) return json({ error: 'Message not found' }, 404);
  if (msg.user_id !== me) return json({ error: 'Only the sender can notify' }, 403);
  if (msg.deleted_at) return json({ sent: 0 });
  // Don't re-notify old messages (e.g. a retried call much later).
  if (Date.now() - new Date(msg.created_at).getTime() > 10 * 60 * 1000) return json({ sent: 0 });

  const [{ data: sender }, { data: tokens }] = await Promise.all([
    admin.from('profiles').select('display_name').eq('id', me).maybeSingle(),
    admin.from('push_tokens').select('user_id, token').neq('user_id', me),
  ]);
  if (!tokens?.length) return json({ sent: 0 });

  const name = (sender?.display_name ?? 'Someone').trim().split(/\s+/)[0];
  const text = msg.body?.trim() ? msg.body.trim().slice(0, 180) : msg.image_path ? '📷 Photo' : 'New message';
  const messages = tokens.map((t) => ({
    to: t.token,
    title: name,
    body: text,
    sound: 'default',
    threadId: 'group-chat',
    data: { url: '/chat', message_id: msg.id },
  }));

  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) continue;
    const out = await res.json();
    (out.data ?? []).forEach((ticket: { status: string; details?: { error?: string } }, k: number) => {
      if (ticket.status === 'ok') sent++;
      else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(chunk[k].to);
    });
  }
  if (dead.length) await admin.from('push_tokens').delete().in('token', dead);

  return json({ sent, pruned: dead.length });
});
