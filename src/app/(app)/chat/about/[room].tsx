import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../../../components/Avatar';
import CircleButton from '../../../../components/CircleButton';
import { DocsSkeleton } from '../../../../components/Skeleton';
import SkyBackdrop from '../../../../components/SkyBackdrop';
import NotificationsRow from '../../../../components/chat/NotificationsRow';
import { EmojiPicker, PeoplePicker, SwitchRow, sectionLabel } from '../../../../components/chat/RoomFields';
import FormButton from '../../../../components/form/FormButton';
import FormField from '../../../../components/form/FormField';
import { useAuth } from '../../../../lib/AuthProvider';
import {
  EVERYONE_ROOM,
  addRoomMember,
  deleteRoom,
  fetchMembers,
  fetchMutes,
  fetchRoomMembers,
  fetchRooms,
  removeRoomMember,
  renameRoom,
  setMuted,
  type Member,
  type Room,
} from '../../../../lib/chat';
import { personColor } from '../../../../lib/chatFormat';
import { confirm } from '../../../../lib/confirm';
import { colors as c, shadow } from '../../../../theme/colors';
import { fontFamily, type } from '../../../../theme/typography';

// A room's settings: its name and picture (for whoever made it), muting the
// room or individual people, who's in a private room, leaving or deleting.
export default function RoomInfo() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { room: roomParam } = useLocalSearchParams<{ room: string }>();
  const roomId = typeof roomParam === 'string' ? roomParam : EVERYONE_ROOM;
  const { session } = useAuth();
  const myId = session?.user.id ?? '';

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inRoom, setInRoom] = useState<Set<string>>(new Set());
  const [mutedRoom, setMutedRoom] = useState(false);
  const [mutedPeople, setMutedPeople] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('💬');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rooms, people, mutes] = await Promise.all([fetchRooms(), fetchMembers(), fetchMutes()]);
      const r = rooms.find((x) => x.id === roomId) ?? null;
      setRoom(r);
      setMembers(people);
      setMutedRoom(mutes.rooms.has(roomId));
      setMutedPeople(mutes.people);
      if (r) {
        setName(r.name);
        setEmoji(r.emoji ?? '💬');
        if (r.is_private) setInRoom(new Set([...(await fetchRoomMembers(roomId)), ...(r.created_by ? [r.created_by] : [])]));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this room');
    }
  }, [roomId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const mine = !!room && room.created_by === myId;
  const everyone = roomId === EVERYONE_ROOM;

  async function run(work: () => Promise<void>, done?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      if (done) setNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      load();
    } finally {
      setBusy(false);
    }
  }

  const toggleRoomMute = (v: boolean) => {
    setMutedRoom(v);
    run(() => setMuted('room', roomId, v, myId));
  };

  const togglePerson = (id: string, v: boolean) => {
    setMutedPeople((prev) => {
      const next = new Set(prev);
      if (v) next.add(id);
      else next.delete(id);
      return next;
    });
    run(() => setMuted('person', id, v, myId));
  };

  async function leave() {
    if (!(await confirm('Leave this room?', 'You won’t see its messages unless someone adds you back.', 'Leave', true))) return;
    await run(async () => {
      await removeRoomMember(roomId, myId);
      router.dismissTo('/(app)/chat');
    });
  }

  async function remove() {
    if (!(await confirm('Delete this room?', 'Its messages are deleted for everyone.', 'Delete', true))) return;
    await run(async () => {
      await deleteRoom(roomId);
      router.dismissTo('/(app)/chat');
    });
  }

  const others = members.filter((m) => m.id !== myId);
  const roomPeople = members.filter((m) => inRoom.has(m.id));
  const notIn = members.filter((m) => !inRoom.has(m.id));

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop height={240} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.title} accessibilityRole="header">
          Room info
        </Text>
        <View style={styles.spacer} />
      </View>

      {!room ? (
        error ? (
          <Text style={[type.body, styles.pad, { color: c.danger }]}>{error}</Text>
        ) : (
          <DocsSkeleton label="Loading room" />
        )
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <View style={styles.bigEmoji}>
              <Text style={styles.bigEmojiText}>{room.emoji || '💬'}</Text>
            </View>
            <Text style={styles.roomName} testID="room-info-name">
              {room.name}
            </Text>
            <Text style={[type.caption, { color: c.inkSecondary }]}>
              {everyone ? 'Everyone on the trip' : room.is_private ? `Private · ${roomPeople.length} people` : 'Open to everyone on the trip'}
            </Text>
          </View>

          {notice ? (
            <Text style={[type.bodyStrong, { color: c.success }]} accessibilityLiveRegion="polite">
              {notice}
            </Text>
          ) : null}
          {error ? (
            <Text style={[type.body, { color: c.danger }]} accessibilityLiveRegion="assertive">
              {error}
            </Text>
          ) : null}

          <Text style={sectionLabel}>Notifications</Text>
          <NotificationsRow />
          <SwitchRow label="Mute this room" icon="notifications-off-outline" value={mutedRoom} onChange={toggleRoomMute} testID="mute-room" />

          {mine && !everyone ? (
            <>
              <Text style={sectionLabel}>Name and picture</Text>
              <FormField label="Room name" value={name} onChangeText={setName} maxLength={40} testID="room-rename" />
              <EmojiPicker value={emoji} onChange={setEmoji} />
              {name.trim() !== room.name || emoji !== room.emoji ? (
                <FormButton
                  label="Save"
                  loading={busy}
                  onPress={() =>
                    run(async () => {
                      const n = name.trim().replace(/\s+/g, ' ');
                      if (!n) throw new Error('Give the room a name.');
                      await renameRoom(roomId, n, emoji);
                      setRoom({ ...room, name: n, emoji });
                    }, 'Saved')
                  }
                />
              ) : null}
            </>
          ) : null}

          {room.is_private ? (
            <>
              <Text style={sectionLabel}>People</Text>
              {roomPeople.map((m) => (
                <View key={m.id} style={styles.person}>
                  <Avatar name={m.name} path={m.avatar} color={personColor(members.indexOf(m))} size={34} />
                  <Text style={[type.body, styles.flex, { color: c.ink }]} numberOfLines={1}>
                    {m.name}
                    {m.id === myId ? ' (you)' : ''}
                    {m.id === room.created_by ? ' · made the room' : ''}
                  </Text>
                  {mine && m.id !== myId ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${m.name}`}
                      style={styles.iconHit}
                      onPress={() =>
                        run(async () => {
                          await removeRoomMember(roomId, m.id);
                          setInRoom((prev) => new Set([...prev].filter((x) => x !== m.id)));
                        })
                      }
                    >
                      <Ionicons name="remove-circle-outline" size={22} color={c.inkSecondary} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {mine && notIn.length ? (
                adding ? (
                  <PeoplePicker
                    members={notIn}
                    selected={new Set()}
                    onToggle={(id) =>
                      run(async () => {
                        await addRoomMember(roomId, id);
                        setInRoom((prev) => new Set([...prev, id]));
                      })
                    }
                  />
                ) : (
                  <FormButton label="Add people" variant="text" onPress={() => setAdding(true)} />
                )
              ) : null}
            </>
          ) : null}

          {others.length ? (
            <>
              <Text style={sectionLabel}>Mute people (every room)</Text>
              {others.map((m) => (
                <SwitchRow
                  key={m.id}
                  label={`Mute ${m.name}`}
                  icon="person-outline"
                  value={mutedPeople.has(m.id)}
                  onChange={(v) => togglePerson(m.id, v)}
                />
              ))}
            </>
          ) : null}

          {room.is_private && !mine ? (
            <Pressable accessibilityRole="button" onPress={leave} style={styles.danger} testID="leave-room">
              <Text style={[type.bodyStrong, { color: c.danger }]}>Leave room</Text>
            </Pressable>
          ) : null}
          {mine && !everyone ? (
            <Pressable accessibilityRole="button" onPress={remove} style={styles.danger} testID="delete-room">
              <Text style={[type.bodyStrong, { color: c.danger }]}>Delete room</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2, color: c.ink },
  spacer: { width: 44 },
  content: { paddingHorizontal: 20, gap: 12 },
  hero: { alignItems: 'center', gap: 6, marginBottom: 6 },
  bigEmoji: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.float,
  },
  bigEmojiText: { fontSize: 42 },
  roomName: { fontFamily: fontFamily.display, fontSize: 24, color: c.ink, textAlign: 'center' },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: c.card,
    boxShadow: shadow.card,
  },
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  danger: {
    minHeight: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.card,
    marginTop: 10,
    boxShadow: shadow.card,
  },
});
