import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import OfflineNotice from '../../../components/OfflineNotice';
import { DocsSkeleton } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import NotificationsRow from '../../../components/chat/NotificationsRow';
import { useAuth } from '../../../lib/AuthProvider';
import {
  EVERYONE_ROOM,
  fetchLatestMessages,
  fetchMembers,
  fetchMutes,
  fetchRooms,
  watchRoomList,
  type Member,
  type Message,
  type Room,
} from '../../../lib/chat';
import { dayLabel, firstName, timeLabel } from '../../../lib/chatFormat';
import { fetchUnreadCounts } from '../../../lib/chatUnread';
import { colors as c, shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';

type Data = {
  rooms: Room[];
  latest: Record<string, Message>;
  unread: Record<string, number>;
  members: Member[];
  mutedRooms: Set<string>;
};

function preview(m: Message | undefined, members: Member[], myId: string): string {
  if (!m) return 'No messages yet';
  const who = m.user_id === myId ? 'You' : firstName(members.find((p) => p.id === m.user_id)?.name ?? 'Someone');
  const what = m.deleted_at ? 'Message deleted' : m.body || (m.video_path ? '🎬 Video' : m.image_path ? '📷 Photo' : '');
  return `${who}: ${what}`;
}

function when(iso: string): string {
  const day = dayLabel(iso);
  return day === 'Today' ? timeLabel(iso) : day.replace(/^\w+, /, '');
}

// The chat's rooms: Everyone first, then open and private rooms people
// made. Each shows its newest message and your unread count.
export default function ChatRooms() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!myId) return;
    try {
      const [rooms, members, mutes] = await Promise.all([fetchRooms(), fetchMembers(), fetchMutes().catch(() => null)]);
      const [latest, unread] = await Promise.all([
        fetchLatestMessages(rooms.map((r) => r.id)),
        fetchUnreadCounts(myId).catch(() => ({}) as Record<string, number>),
      ]);
      setData({ rooms, latest, unread, members, mutedRooms: mutes?.rooms ?? new Set() });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the chat');
    }
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Live: a new room or message refreshes the list (debounced).
  useEffect(() => {
    if (!myId) return;
    const stop = watchRoomList(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 400);
    });
    return () => {
      stop();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [myId, load]);

  const open = (id: string) => router.push({ pathname: '/(app)/chat/[room]', params: { room: id } });

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop height={260} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.title} accessibilityRole="header">
          Group chat
        </Text>
        <CircleButton icon="add" label="New room" onPress={() => router.push('/(app)/chat/new')} testID="new-room" />
      </View>
      <OfflineNotice />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <NotificationsRow compact />

        {error && !data ? (
          <Text style={[type.body, { color: c.danger }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {!data ? (
          <View style={styles.skeleton}>
            <DocsSkeleton label="Loading chats" />
          </View>
        ) : (
          data.rooms.map((r) => {
            const unread = data.unread[r.id] ?? 0;
            const muted = data.mutedRooms.has(r.id);
            const last = data.latest[r.id];
            const label = `${r.name}${r.is_private ? ', private' : ''}${muted ? ', muted' : ''}${
              unread ? `, ${unread} unread` : ''
            }. ${preview(last, data.members, myId)}`;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => open(r.id)}
                testID={`room-${r.id === EVERYONE_ROOM ? 'everyone' : r.name}`}
                style={({ pressed }) => [styles.room, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
              >
                <View style={styles.emoji}>
                  <Text style={styles.emojiText}>{r.emoji || '💬'}</Text>
                </View>
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.name, unread ? styles.nameUnread : null]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {r.is_private ? <Ionicons name="lock-closed" size={13} color={c.inkTertiary} /> : null}
                    {muted ? <Ionicons name="notifications-off" size={13} color={c.inkTertiary} /> : null}
                    <View style={styles.flex} />
                    {last ? <Text style={styles.time}>{when(last.created_at)}</Text> : null}
                  </View>
                  <View style={styles.nameRow}>
                    <Text style={[type.caption, styles.flex, { color: c.inkSecondary }]} numberOfLines={1}>
                      {preview(last, data.members, myId)}
                    </Text>
                    {unread ? (
                      <View style={[styles.badge, { backgroundColor: muted ? c.inkTertiary : c.danger }]}>
                        <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2, color: c.ink },
  content: { paddingHorizontal: 20, gap: 12 },
  skeleton: { marginHorizontal: -20 },
  room: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 76,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    boxShadow: shadow.card,
  },
  emoji: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 24 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: fontFamily.bodyMedium, fontSize: 16, color: c.ink, flexShrink: 1 },
  nameUnread: { fontFamily: fontFamily.bodySemiBold },
  time: { fontFamily: fontFamily.body, fontSize: 12, color: c.inkTertiary },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fontFamily.bodySemiBold, fontSize: 12, color: c.onDanger },
});
