import { Redirect, Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../../lib/AuthProvider';
import { configureNotifications, registerForPush } from '../../lib/push';

export default function AppLayout() {
  const { session, initializing } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  // Push notifications (native builds only): register this phone, and
  // tapping a chat notification opens the chat — also from a cold start.
  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    (async () => {
      await configureNotifications();
      registerForPush(userId).catch(() => {});
      const Notifications = await import('expo-notifications');
      const go = (data: unknown) => {
        const url = (data as { url?: string } | undefined)?.url;
        if (url === '/chat') router.push('/(app)/chat');
      };
      const last = await Notifications.getLastNotificationResponseAsync();
      if (!cancelled && last) go(last.notification.request.content.data);
      sub = Notifications.addNotificationResponseReceivedListener((r) => go(r.notification.request.content.data));
    })().catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [userId, router]);

  if (initializing) return null;
  if (!session) return <Redirect href="/(auth)/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
