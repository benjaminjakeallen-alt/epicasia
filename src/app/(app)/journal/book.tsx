import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import { Bone } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { useAuth } from '../../../lib/AuthProvider';
import { fetchMyEntries, type JournalEntry } from '../../../lib/journal';
import { exportPhotoBook } from '../../../lib/photoBook';
import { signedUrls } from '../../../lib/photos';
import { colors as c, shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';

// Turn your journal into a printable 8×8 in photo book (PDF).
export default function PhotoBook() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const author = (session?.user.user_metadata?.display_name as string | undefined) ?? 'a traveler';

  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!myId) return;
    fetchMyEntries(myId)
      .then(async (list) => {
        setEntries(list);
        const first = [...list].reverse().flatMap((e) => e.journal_media).find((m) => m.kind === 'photo');
        if (first) {
          const path = first.thumb_path ?? first.storage_path;
          setCover((await signedUrls('journal', [path]))[path] ?? null);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your journal'));
  }, [myId]);

  const photos = entries?.reduce((n, e) => n + e.journal_media.filter((m) => m.kind === 'photo').length, 0) ?? 0;
  const notes = entries?.reduce((n, e) => n + e.journal_media.filter((m) => m.kind === 'audio').length, 0) ?? 0;

  async function make() {
    if (!entries?.length) return;
    setError(null);
    setDone(false);
    // On web the book prints from a new tab, which must open during the tap.
    const win = window.open('', '_blank');
    setBusy('Starting…');
    try {
      await exportPhotoBook(entries, author, setBusy, win);
      setDone(true);
    } catch (e) {
      win?.close();
      setError(e instanceof Error ? e.message : 'Could not make the photo book');
    } finally {
      setBusy(null);
    }
  }

  const stat = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.headerTitle} accessibilityRole="header">
          Photo book
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <View style={[styles.book, { backgroundColor: c.card }]} accessible accessibilityLabel="Cover preview">
          {entries === null ? (
            <Bone width="100%" height={210} radius={14} />
          ) : cover ? (
            <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" accessibilityLabel="" />
          ) : (
            <View style={[styles.cover, styles.coverEmpty, { backgroundColor: c.accentSoft }]}>
              <Ionicons name="book-outline" size={40} color={c.highlight} />
            </View>
          )}
          <Text style={styles.brand}>
            Epic <Text style={styles.brandItalic}>Asia</Text>
          </Text>
          <Text style={styles.by}>A trip journal by {author}</Text>
        </View>

        {entries ? (
          <View style={styles.stats} accessible accessibilityLabel={`${stat(entries.length, 'entry', 'entries')}, ${stat(photos, 'photo', 'photos')}, ${stat(notes, 'voice note', 'voice notes')}`}>
            {[
              [entries.length, entries.length === 1 ? 'entry' : 'entries'],
              [photos, photos === 1 ? 'photo' : 'photos'],
              [notes, notes === 1 ? 'voice note' : 'voice notes'],
            ].map(([n, label]) => (
              <View key={String(label)} style={[styles.stat, { backgroundColor: c.card }]}>
                <Text style={styles.statNum}>{n}</Text>
                <Text style={[type.caption, { color: c.inkSecondary }]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.points}>
          {[
            ['resize-outline', '8 × 8 in pages, ready for a print service'],
            ['albums-outline', 'A page for each city, then every entry in trip order'],
            ['qr-code-outline', 'Each voice note prints as a QR code that plays it'],
          ].map(([icon, text]) => (
            <View key={text} style={styles.point}>
              <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={c.highlight} />
              <Text style={[type.body, styles.flex, { color: c.ink }]}>{text}</Text>
            </View>
          ))}
        </View>

        {error ? <Text style={[type.body, styles.center, { color: c.danger }]}>{error}</Text> : null}
        {busy ? (
          <Text style={[type.bodyStrong, styles.center, { color: c.highlight }]} accessibilityLiveRegion="polite">
            {busy}
          </Text>
        ) : null}
        {done && !busy ? (
          <Text style={[type.bodyStrong, styles.center, { color: c.success }]} accessibilityLiveRegion="polite">
            Your photo book is ready.
          </Text>
        ) : null}

        {entries && entries.length === 0 ? (
          <Text style={[type.body, styles.center, { color: c.inkSecondary }]}>
            Write a journal entry first. The book is made from your own entries.
          </Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !entries || !!busy, busy: !!busy }}
            disabled={!entries || !!busy}
            onPress={make}
            testID="make-book"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: !entries || busy ? c.accentDisabled : pressed ? c.accentPressed : c.accent },
            ]}
          >
            <Ionicons name="document-outline" size={20} color={c.onAccent} />
            <Text style={[type.button, { color: c.onAccent }]}>Open the book to print</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2, color: c.ink },
  headerSpacer: { width: 44 },
  content: { paddingHorizontal: 20, gap: 16 },
  book: {
    alignSelf: 'center',
    width: '86%',
    maxWidth: 360,
    aspectRatio: 1,
    borderRadius: 6,
    padding: 18,
    justifyContent: 'flex-end',
    boxShadow: shadow.float,
  },
  cover: { flex: 1, width: '100%', borderRadius: 10, marginBottom: 14 },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  brand: { fontFamily: fontFamily.display, fontSize: 30, lineHeight: 34, color: c.ink },
  brandItalic: { fontFamily: fontFamily.displayItalic, color: c.highlight },
  by: { fontFamily: fontFamily.displayItalic, fontSize: 16, lineHeight: 22, color: c.inkSecondary },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, borderRadius: 18, paddingVertical: 12, alignItems: 'center', boxShadow: shadow.card },
  statNum: { fontFamily: fontFamily.display, fontSize: 26, lineHeight: 30, color: c.ink },
  points: { gap: 10, paddingHorizontal: 4 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: {
    height: 54,
    borderRadius: 27,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.card,
  },
});
