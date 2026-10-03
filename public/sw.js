// Epic Asia service worker: web push for the group chat. Nothing is cached
// here (offline data lives in the app's own saved copies — src/lib/offline.ts).
// Pushes come from the notify-chat Edge Function: { title, body, url, tag }.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const url = data.url || '/chat';
  event.waitUntil(
    (async () => {
      // Every push must show a notification (Safari drops subscriptions that
      // don't), so when that room is already open and in front it arrives silently.
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const looking = open.some((c) => c.focused && c.visibilityState === 'visible' && new URL(c.url).pathname === url);
      await self.registration.showNotification(data.title || 'Epic Asia', {
        body: data.body || 'New message',
        tag: data.tag || 'chat',
        renotify: !looking,
        silent: looking,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/chat';
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of open) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        client.postMessage({ type: 'open', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
