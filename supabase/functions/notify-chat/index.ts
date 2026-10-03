// notify-chat: web push for the group chat (the app is a PWA).
//
// Actions (POST JSON, the caller's own JWT in Authorization):
//   { action: 'key' }                                → { publicKey }   VAPID key, made once on first use
//   { action: 'subscribe', endpoint, p256dh, auth }  → saves this browser's subscription for the caller
//   { action: 'unsubscribe', endpoint }              → removes it
//   { message_id }                                   → pushes a new message to everyone who can see its room
//
// The message is read *as the caller* (RLS), so only its author can trigger a
// push for it, and only within 10 minutes. The service role (built into the
// function, never in the app) reads the room's members, mutes and
// subscriptions and prunes dead ones. Encryption is RFC 8291 (aes128gcm) and
// VAPID is RFC 8292, done with WebCrypto — no dependencies.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUBJECT = 'https://epicasia.vercel.app';
const EVERYONE = '00000000-0000-4000-8000-000000000001';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// ---------- bytes ----------
const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// ---------- VAPID ----------
type Vapid = { publicKey: string; signer: CryptoKey };

async function loadVapid(admin: ReturnType<typeof createClient>): Promise<Vapid> {
  const { data } = await admin.rpc('push_server_config');
  let row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    // Two first calls at once: the insert keeps whichever came first.
    const saved = await admin.rpc('push_config_save', { p_public: pub, p_private: jwk });
    row = Array.isArray(saved.data) ? saved.data[0] : saved.data;
    if (!row) throw new Error('Could not save VAPID keys');
  }
  const signer = await crypto.subtle.importKey('jwk', row.private_jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
  return { publicKey: row.public_key, signer };
}

async function vapidHeader(vapid: Vapid, endpoint: string): Promise<string> {
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }),
    ),
  );
  const unsigned = `${head}.${claims}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.signer, enc.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${b64url(sig)}, k=${vapid.publicKey}`;
}

// ---------- RFC 8291 ----------
async function encrypt(payload: Uint8Array, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const uaPublic = unb64url(p256dh);
  const auth = unb64url(authSecret);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const body = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))),
  );
  const rs = new Uint8Array([0, 0, 0x10, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, body);
}

type Sub = { endpoint: string; p256dh: string; auth: string };

async function sendPush(vapid: Vapid, sub: Sub, payload: unknown): Promise<number> {
  const body = await encrypt(enc.encode(JSON.stringify(payload)), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(vapid, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body,
  });
  await res.body?.cancel();
  return res.status;
}

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'Not signed in' }, 401);
  const me = userData.user.id;

  let input: Record<string, unknown> = {};
  try {
    input = (await req.json()) ?? {};
  } catch {
    // empty body
  }

  if (input.action === 'key') {
    const vapid = await loadVapid(admin);
    return json({ publicKey: vapid.publicKey });
  }

  if (input.action === 'subscribe') {
    const { endpoint, p256dh, auth } = input as Record<string, string>;
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2000)
      return json({ error: 'Bad endpoint' }, 400);
    if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100)
      return json({ error: 'Bad keys' }, 400);
    // The same browser can change hands (sign out, sign in as someone else):
    // its endpoint is a secret only that browser knows, so the caller takes it over.
    const { error } = await admin
      .from('web_push_subscriptions')
      .upsert({ endpoint, user_id: me, p256dh, auth, updated_at: new Date().toISOString() });
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  if (input.action === 'unsubscribe') {
    if (typeof input.endpoint !== 'string') return json({ error: 'Bad endpoint' }, 400);
    await admin.from('web_push_subscriptions').delete().eq('endpoint', input.endpoint).eq('user_id', me);
    return json({ ok: true });
  }

  const messageId = input.message_id;
  if (typeof messageId !== 'string') return json({ error: 'message_id required' }, 400);

  // Read as the caller: RLS hides anything they can't see.
  const { data: msg, error: msgErr } = await asCaller
    .from('messages')
    .select('id, user_id, room_id, body, image_path, video_path, deleted_at, created_at')
    .eq('id', messageId)
    .maybeSingle();
  if (msgErr || !msg) return json({ error: 'Message not found' }, 404);
  if (msg.user_id !== me) return json({ error: 'Only the sender can notify' }, 403);
  if (msg.deleted_at) return json({ sent: 0 });
  if (Date.now() - new Date(msg.created_at).getTime() > 10 * 60 * 1000) return json({ sent: 0 });

  const [{ data: room }, { data: sender }, { data: mutes }] = await Promise.all([
    admin.from('chat_rooms').select('id, name, is_private, created_by').eq('id', msg.room_id).maybeSingle(),
    admin.from('profiles').select('display_name').eq('id', me).maybeSingle(),
    admin.from('chat_mutes').select('user_id').or(`muted_user_id.eq.${me},muted_room_id.eq.${msg.room_id}`),
  ]);
  if (!room) return json({ sent: 0 });

  // Who can see the room.
  let audience: string[] | null = null; // null = everyone
  if (room.is_private) {
    const { data: members } = await admin.from('chat_room_members').select('user_id').eq('room_id', room.id);
    audience = [...(members ?? []).map((m) => m.user_id), room.created_by].filter(Boolean);
  }
  const muted = new Set((mutes ?? []).map((m) => m.user_id));

  let query = admin.from('web_push_subscriptions').select('endpoint, user_id, p256dh, auth').neq('user_id', me);
  if (audience) query = query.in('user_id', audience.length ? audience : [me]);
  const { data: subs } = await query;
  const targets = (subs ?? []).filter((s) => !muted.has(s.user_id));
  if (!targets.length) return json({ sent: 0 });

  const name = (sender?.display_name ?? 'Someone').trim().split(/\s+/)[0];
  const text = msg.body?.trim()
    ? msg.body.trim().slice(0, 180)
    : msg.video_path
      ? '🎬 Video'
      : msg.image_path
        ? '📷 Photo'
        : 'New message';
  const payload = {
    title: room.id === EVERYONE ? name : `${name} · ${room.name}`,
    body: text,
    url: `/chat/${room.id}`,
    tag: `chat-${room.id}`,
    room_id: room.id,
    message_id: msg.id,
  };

  const vapid = await loadVapid(admin);
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    targets.map(async (s) => {
      try {
        const status = await sendPush(vapid, s, payload);
        if (status === 404 || status === 410) dead.push(s.endpoint);
        else if (status < 300) sent++;
      } catch {
        // one bad endpoint never blocks the rest
      }
    }),
  );
  if (dead.length) await admin.from('web_push_subscriptions').delete().in('endpoint', dead);
  return json({ sent, pruned: dead.length });
});
