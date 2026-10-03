import { supabase } from './supabase';

// Web push for the group chat (the app is a PWA). `public/sw.js` shows the
// notifications; the notify-chat Edge Function keeps the VAPID keys, saves
// each browser's subscription and sends a push for every new message to
// everyone who can see its room (minus mutes). On iPhone, web push only works
// once Epic Asia is added to the Home Screen (iOS 16.4+). See CLAUDE.md →
// Group chat → Notifications.

export type PushState = 'unsupported' | 'install' | 'denied' | 'off' | 'on';

function hasWindow() {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supported() {
  return hasWindow() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registers the service worker once; `onOpen` gets the url of a tapped notification. */
export function startServiceWorker(onOpen: (url: string) => void): () => void {
  if (!hasWindow() || !('serviceWorker' in navigator)) return () => {};
  registration ??= navigator.serviceWorker.register('/sw.js').catch(() => null);
  const listener = (e: MessageEvent) => {
    if (e.data?.type === 'open' && typeof e.data.url === 'string') onOpen(e.data.url);
  };
  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supported()) return null;
  const reg = await (registration ?? navigator.serviceWorker.getRegistration());
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return hasWindow() && isIos() && !isStandalone() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function save(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await supabase.functions.invoke('notify-chat', {
    body: { action: 'subscribe', endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth },
  });
  if (error) throw error;
}

/** Asks permission (call from a tap) and subscribes this browser. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return pushState();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = (await registration) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { data, error } = await supabase.functions.invoke('notify-chat', { body: { action: 'key' } });
    if (error || !data?.publicKey) throw error ?? new Error('No push key');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) });
  }
  await save(sub);
  return 'on';
}

/** Turns notifications off for this browser. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.functions.invoke('notify-chat', { body: { action: 'unsubscribe', endpoint: sub.endpoint } });
  await sub.unsubscribe();
}

/** After sign-in: a browser that already has a subscription is re-saved for whoever is signed in now. */
export async function syncPush(): Promise<void> {
  const sub = await currentSubscription();
  if (sub && Notification.permission === 'granted') await save(sub);
}

/** Before signing out: this browser stops getting the account's pushes. */
export async function unregisterPush(): Promise<void> {
  await disablePush();
}

/** Fire-and-forget: ask the server to push a just-sent message to everyone else. */
export function notifyChat(messageId: string) {
  supabase.functions.invoke('notify-chat', { body: { message_id: messageId } }).catch(() => {});
}
