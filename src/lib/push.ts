import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Push notifications for the group chat (iPhone/Android builds only — not
// web, not Expo Go). The phone's Expo push token is stored in
// `push_tokens`; the sender's app asks the `notify-chat` Edge Function to
// push each new message to everyone else. Needs an EAS project id in
// app.json (`extra.eas.projectId`, written by `eas init`) — until then
// registration quietly does nothing. See CLAUDE.md → Push notifications.

let chatOpen = false;
/** The chat screen sets this so its own messages don't also pop a banner. */
export function setChatOpen(open: boolean) {
  chatOpen = open;
}

let currentToken: string | null = null;

function projectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

/** Foreground behavior: show chat banners unless you're already looking at the chat. */
export async function configureNotifications() {
  if (Platform.OS === 'web') return;
  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const isChat = (n.request.content.data as { url?: string } | undefined)?.url === '/chat';
      const show = !(isChat && chatOpen);
      return { shouldShowBanner: show, shouldShowList: true, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
}

/** Asks permission (once) and saves this phone's push token for the signed-in user. */
export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const id = projectId();
  if (!id) return; // no EAS project yet
  const [Notifications, Device] = await Promise.all([import('expo-notifications'), import('expo-device')]);
  if (!Device.isDevice) return; // simulators can't receive pushes
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Group chat',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  currentToken = token;
  await supabase.from('push_tokens').upsert(
    { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,token' },
  );
}

/** Stops pushes to this phone for this account (call before signing out). */
export async function unregisterPush(userId: string): Promise<void> {
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('user_id', userId).eq('token', currentToken);
  currentToken = null;
}

/** Fire-and-forget: ask the server to push a just-sent message to everyone else. */
export function notifyChat(messageId: string) {
  supabase.functions.invoke('notify-chat', { body: { message_id: messageId } }).catch(() => {});
}
