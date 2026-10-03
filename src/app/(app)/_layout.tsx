import { Redirect, Stack, useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../../lib/AuthProvider';
import { startServiceWorker, syncPush } from '../../lib/push';

export default function AppLayout() {
  const { session, initializing } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  // Web push: the service worker shows chat notifications, and tapping one
  // opens that room. A browser already subscribed is re-saved for whoever
  // is signed in now.
  useEffect(() => {
    if (!userId) return;
    const stop = startServiceWorker((url) => {
      if (url.startsWith('/chat')) router.push(url as Href);
    });
    syncPush().catch(() => {});
    return stop;
  }, [userId, router]);

  if (initializing) return null;
  if (!session) return <Redirect href="/(auth)/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
