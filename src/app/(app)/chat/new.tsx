import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { EmojiPicker, PeoplePicker, ROOM_EMOJI, SwitchRow, sectionLabel } from '../../../components/chat/RoomFields';
import FormButton from '../../../components/form/FormButton';
import FormField from '../../../components/form/FormField';
import { useAuth } from '../../../lib/AuthProvider';
import { createRoom, fetchMembers, type Member } from '../../../lib/chat';
import { colors as c } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';

// A new chat room: open to everyone on the trip, or private to the people
// picked (only they — and you — can see it).
export default function NewRoom() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(ROOM_EMOJI[0]);
  const [isPrivate, setPrivate] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMembers()
      .then(setMembers)
      .catch(() => {});
  }, []);

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const canSave = trimmed.length > 0 && (!isPrivate || picked.size > 0);

  async function save() {
    if (!canSave) {
      setError(trimmed ? 'Pick at least one person for a private room.' : 'Give the room a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const room = await createRoom({ name: trimmed, emoji, isPrivate, memberIds: [...picked] }, myId);
      router.replace({ pathname: '/(app)/chat/[room]', params: { room: room.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make the room');
      setSaving(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop height={240} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="close" label="Cancel" onPress={() => router.back()} />
        <Text style={styles.title} accessibilityRole="header">
          New room
        </Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <FormField label="Room name" value={name} onChangeText={setName} maxLength={40} testID="room-name" />
        <Text style={sectionLabel}>Picture</Text>
        <EmojiPicker value={emoji} onChange={setEmoji} />
        <SwitchRow label="Private room" icon="lock-closed-outline" value={isPrivate} onChange={setPrivate} testID="room-private" />
        {isPrivate ? (
          <>
            <Text style={sectionLabel}>Who&apos;s in it</Text>
            <PeoplePicker
              members={members}
              locked={myId}
              selected={picked}
              onToggle={(id) =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            />
          </>
        ) : (
          <Text style={[type.caption, { color: c.inkSecondary }]}>Everyone on the trip can see and join an open room.</Text>
        )}
        {error ? (
          <Text style={[type.body, { color: c.danger }]} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
        <FormButton label="Make room" onPress={save} loading={saving} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2, color: c.ink },
  spacer: { width: 44 },
  content: { paddingHorizontal: 20, gap: 14 },
});
