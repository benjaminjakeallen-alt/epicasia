import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { newId } from '../../lib/chat';
import { confirm } from '../../lib/confirm';
import { addDays, formatMonthDay, formatWeekday, todayDay } from '../../lib/dates';
import { deleteEntry, hasContent, saveDraft, type Draft, type DraftMedia, type JournalEntry } from '../../lib/journal';
import { signedUrls } from '../../lib/photos';
import { stopForDay } from '../../lib/places';
import { colors as c, legTextColors, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';
import CircleButton from '../CircleButton';
import SkyBackdrop from '../SkyBackdrop';
import VoiceNote from './VoiceNote';
import VoiceRecorder from './VoiceRecorder';

// Write or edit one journal entry: the day (trip-day chips), where, a
// title, the story, photos, voice notes, and whether the group sees it.

const TRIP_DAYS = Array.from({ length: 15 }, (_, i) => addDays('2027-06-05', i));
const PHOTO = 92;

function legText(day: string): string | null {
  const stop = stopForDay(day);
  return stop ? legTextColors[stop.key as keyof typeof legTextColors] : null;
}

export default function JournalEditor({
  initial,
  previous,
  userId,
}: {
  initial: Draft;
  previous: JournalEntry | null;
  userId: string;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [cityEdited, setCityEdited] = useState(!initial.isNew);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const saved = useRef(JSON.stringify(initial));

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setMedia = (id: string, patch: Partial<DraftMedia>) =>
    setDraft((d) => ({ ...d, media: d.media.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

  // Signed URLs for media already saved.
  useEffect(() => {
    const paths = initial.media.flatMap((m) => [m.thumb_path ?? m.storage_path, m.storage_path]).filter(Boolean);
    if (paths.length) signedUrls('journal', paths as string[]).then(setUrls).catch(() => {});
  }, [initial]);

  const days = useMemo(() => {
    const list = [...TRIP_DAYS];
    for (const d of [todayDay(), draft.day]) if (!list.includes(d)) list.unshift(d);
    return list;
  }, [draft.day]);

  function pickDay(day: string) {
    const stop = stopForDay(day);
    set(cityEdited || !stop ? { day } : { day, city: stop.city });
  }

  const photos = draft.media.filter((m) => m.kind === 'photo');
  const notes = draft.media.filter((m) => m.kind === 'audio');
  const dirty = JSON.stringify(draft) !== saved.current;

  async function addPhotos(fromCamera: boolean) {
    setError(null);
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError('Camera access is off. Turn it on for Epic Asia in Settings to take photos here.');
        return;
      }
    }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.92 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: true,
          selectionLimit: 20,
          orderedSelection: true,
          quality: 0.92,
        });
    if (res.canceled) return;
    const added: DraftMedia[] = res.assets.map((a) => ({
      id: newId(),
      kind: 'photo',
      localUri: a.uri,
      mimeType: a.mimeType,
      width: a.width,
      height: a.height,
      caption: '',
    }));
    setDraft((d) => ({ ...d, media: [...d.media, ...added] }));
  }

  function removeMedia(id: string) {
    setDraft((d) => ({ ...d, media: d.media.filter((m) => m.id !== id) }));
  }

  async function save() {
    if (!hasContent(draft)) {
      setError('Write something, or add a photo or voice note, before saving.');
      return;
    }
    setError(null);
    setSaving('Saving…');
    try {
      await saveDraft(draft, userId, previous, (done, total) => {
        if (total) setSaving(`Uploading ${Math.min(done + 1, total)} of ${total}…`);
      });
      saved.current = JSON.stringify(draft);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Check your connection and try again.');
    } finally {
      setSaving(null);
    }
  }

  async function close() {
    if (dirty && hasContent(draft)) {
      const leave = await confirm('Discard changes?', 'This entry has changes that are not saved.', 'Discard', true);
      if (!leave) return;
    }
    router.back();
  }

  async function remove() {
    if (!previous) return;
    const ok = await confirm('Delete this entry?', 'Its photos and voice notes are deleted too.', 'Delete', true);
    if (!ok) return;
    try {
      await deleteEntry(previous);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    }
  }

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: c.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="close" label="Close" onPress={close} />
        <Text style={styles.headerTitle} accessibilityRole="header">
          {draft.isNew ? 'New entry' : 'Edit entry'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save entry"
          accessibilityState={{ disabled: !!saving, busy: !!saving }}
          disabled={!!saving}
          onPress={save}
          testID="journal-save"
          style={({ pressed }) => [styles.save, { backgroundColor: pressed ? c.accentPressed : c.accent }]}
        >
          <Text style={[type.button, { color: c.onAccent }]}>Save</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {saving ? (
          <Text style={[type.bodyStrong, styles.status, { color: c.highlight }]} accessibilityLiveRegion="polite">
            {saving}
          </Text>
        ) : null}
        {error ? (
          <Text style={[type.body, styles.status, { color: c.danger }]} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
          {days.map((d) => {
            const on = d === draft.day;
            const tint = legText(d) ?? c.inkSecondary;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${formatWeekday(d)} ${formatMonthDay(d)}${d === todayDay() ? ', today' : ''}`}
                onPress={() => pickDay(d)}
                style={[styles.day, { backgroundColor: on ? c.accent : c.card }]}
              >
                <Text style={[styles.dayWeek, { color: on ? c.onAccent : tint }]}>{formatWeekday(d)}</Text>
                <Text style={[styles.dayNum, { color: on ? c.onAccent : c.ink }]}>{Number(d.slice(8))}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.card, { backgroundColor: c.card }]}>
          <View style={styles.whereRow}>
            <Ionicons name="location-outline" size={18} color={legText(draft.day) ?? c.inkSecondary} />
            <TextInput
              value={draft.city}
              onChangeText={(city) => {
                setCityEdited(true);
                set({ city });
              }}
              placeholder={stopForDay(draft.day)?.city ?? 'Where were you?'}
              placeholderTextColor={c.inkTertiary}
              accessibilityLabel="Where"
              style={[type.bodyStrong, styles.where, { color: c.ink }]}
              maxLength={80}
            />
          </View>
          <TextInput
            value={draft.title}
            onChangeText={(title) => set({ title })}
            placeholder="Give this day a title"
            placeholderTextColor={c.inkTertiary}
            accessibilityLabel="Title"
            style={[styles.title, { color: c.ink }]}
            maxLength={200}
            testID="journal-title"
          />
          <TextInput
            value={draft.body}
            onChangeText={(body) => set({ body })}
            placeholder="What happened? What do you want to remember?"
            placeholderTextColor={c.inkTertiary}
            accessibilityLabel="Story"
            multiline
            textAlignVertical="top"
            style={[styles.body, { color: c.ink }]}
            maxLength={20000}
            testID="journal-body"
          />
        </View>

        <Text style={styles.section} accessibilityRole="header">
          Photos
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {photos.map((m, i) => {
            const src = m.localUri ?? (m.storage_path ? urls[m.thumb_path ?? m.storage_path] : undefined);
            return (
              <View key={m.id} style={styles.photoWrap} testID="journal-photo">
                {src ? (
                  <Image
                    source={{ uri: src, cacheKey: m.storage_path ? `journal:${m.thumb_path ?? m.storage_path}` : undefined }}
                    style={styles.photo}
                    contentFit="cover"
                    accessibilityLabel={`Photo ${i + 1}`}
                  />
                ) : (
                  <View style={[styles.photo, { backgroundColor: c.skeleton }]} />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  onPress={() => removeMedia(m.id)}
                  style={styles.photoRemoveHit}
                >
                  <View style={[styles.photoRemove, { backgroundColor: c.mediaBadge }]}>
                    <Ionicons name="close" size={14} color={c.onMedia} />
                  </View>
                </Pressable>
              </View>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add photos from your library"
            onPress={() => addPhotos(false)}
            style={[styles.addTile, { backgroundColor: c.card }]}
          >
            <Ionicons name="images-outline" size={24} color={c.highlight} />
            <Text style={[type.caption, { color: c.highlight }]}>Library</Text>
          </Pressable>
          {Platform.OS !== 'web' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take a photo"
              onPress={() => addPhotos(true)}
              style={[styles.addTile, { backgroundColor: c.card }]}
            >
              <Ionicons name="camera-outline" size={24} color={c.highlight} />
              <Text style={[type.caption, { color: c.highlight }]}>Camera</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <Text style={styles.section} accessibilityRole="header">
          Voice notes
        </Text>
        <View style={styles.notes}>
          {notes.map((m, i) => (
            <VoiceNote
              key={m.id}
              index={i}
              uri={m.localUri ?? (m.storage_path ? (urls[m.storage_path] ?? null) : null)}
              durationMs={m.duration_ms}
              caption={m.caption}
              onChangeCaption={(caption) => setMedia(m.id, { caption })}
              onRemove={() => removeMedia(m.id)}
            />
          ))}
          {recording ? (
            <VoiceRecorder
              onCancel={() => setRecording(false)}
              onDone={(n) => {
                setRecording(false);
                setDraft((d) => ({
                  ...d,
                  media: [
                    ...d.media,
                    { id: newId(), kind: 'audio', localUri: n.uri, mimeType: n.mimeType, duration_ms: n.durationMs, caption: '' },
                  ],
                }));
              }}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setRecording(true)}
              testID="journal-record"
              style={({ pressed }) => [styles.recordRow, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
            >
              <View style={[styles.recordDot, { backgroundColor: c.accentSoft }]}>
                <Ionicons name="mic-outline" size={22} color={c.highlight} />
              </View>
              <Text style={[type.bodyStrong, { color: c.ink }]}>Record a voice note</Text>
            </Pressable>
          )}
        </View>

        {/* The whole row is the switch (a big target); the toggle inside is only a picture of it. */}
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Share with the group"
          accessibilityState={{ checked: draft.shared }}
          aria-checked={draft.shared}
          onPress={() => set({ shared: !draft.shared })}
          testID="journal-share"
          style={[styles.card, styles.shareRow, { backgroundColor: c.card }]}
        >
          <Ionicons name="people-outline" size={20} color={c.inkSecondary} />
          <Text style={[type.bodyStrong, styles.flex, { color: c.ink }]}>Share with the group</Text>
          <View style={[styles.toggle, { backgroundColor: draft.shared ? c.accent : c.handle }]}>
            <View style={[styles.knob, { backgroundColor: c.card, alignSelf: draft.shared ? 'flex-end' : 'flex-start' }]} />
          </View>
        </Pressable>

        {previous ? (
          <Pressable accessibilityRole="button" onPress={remove} style={styles.delete}>
            <Text style={[type.bodyStrong, { color: c.danger }]}>Delete entry</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
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
  headerTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    letterSpacing: -0.2,
    color: c.ink,
  },
  save: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.card,
  },
  content: {
    paddingHorizontal: 20,
    gap: 14,
  },
  status: {
    textAlign: 'center',
  },
  days: {
    gap: 8,
    paddingVertical: 4,
    paddingRight: 20,
  },
  day: {
    width: 52,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.card,
  },
  dayWeek: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  dayNum: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 26,
  },
  card: {
    borderRadius: 22,
    padding: 16,
    boxShadow: shadow.card,
  },
  whereRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  where: {
    flex: 1,
    minHeight: 44,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 32,
    minHeight: 44,
    paddingVertical: 4,
  },
  body: {
    ...type.body,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 160,
    paddingTop: 8,
  },
  section: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 26,
    color: c.ink,
    marginTop: 6,
  },
  photos: {
    gap: 10,
    paddingRight: 20,
  },
  photoWrap: {
    width: PHOTO,
    height: PHOTO,
  },
  photo: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: 14,
  },
  photoRemoveHit: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: 4,
  },
  photoRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.accentDisabled,
  },
  notes: {
    gap: 10,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    borderRadius: 18,
    paddingHorizontal: 10,
    boxShadow: shadow.card,
  },
  recordDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    paddingVertical: 10,
    minHeight: 60,
  },
  toggle: {
    width: 51,
    height: 31,
    borderRadius: 16,
    padding: 2,
    justifyContent: 'center',
  },
  knob: {
    width: 27,
    height: 27,
    borderRadius: 14,
    boxShadow: shadow.card,
  },
  delete: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

