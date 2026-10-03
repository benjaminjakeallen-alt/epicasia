import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMembers } from '../../lib/chat';
import { formatMonthDay, formatWeekday } from '../../lib/dates';
import type { JournalEntry } from '../../lib/journal';
import { signedUrls } from '../../lib/photos';
import { stopForDay } from '../../lib/places';
import { colors as c, legTextColors, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';
import CircleButton from '../CircleButton';
import SkyBackdrop from '../SkyBackdrop';
import VoiceNote from './VoiceNote';

// Someone else's entry, shared with the group: read and listen only.
export default function JournalReader({ entry }: { entry: JournalEntry }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [author, setAuthor] = useState<string | null>(null);

  useEffect(() => {
    const paths = entry.journal_media.map((m) => m.storage_path);
    if (paths.length) signedUrls('journal', paths).then(setUrls).catch(() => {});
    fetchMembers()
      .then((ms) => setAuthor(ms.find((m) => m.id === entry.user_id)?.name ?? null))
      .catch(() => {});
  }, [entry]);

  const stop = stopForDay(entry.day);
  const legText = stop ? legTextColors[stop.key as keyof typeof legTextColors] : c.inkSecondary;
  const photos = entry.journal_media.filter((m) => m.kind === 'photo');
  const notes = entry.journal_media.filter((m) => m.kind === 'audio');
  const photoW = Math.min(width, 720) - 40;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}>
        <Text style={[styles.when, { color: legText }]}>
          {formatWeekday(entry.day)}, {formatMonthDay(entry.day)}
          {entry.city || stop ? ` · ${entry.city ?? stop?.city}` : ''}
        </Text>
        {entry.title ? (
          <Text style={styles.title} accessibilityRole="header">
            {entry.title}
          </Text>
        ) : null}
        {author ? <Text style={[type.bodyStrong, { color: c.inkSecondary }]}>{author}</Text> : null}
        {entry.body ? <Text style={styles.body}>{entry.body}</Text> : null}
        {photos.map((p, i) => {
          const h = p.width && p.height ? (photoW * p.height) / p.width : photoW * 0.75;
          return (
            <View key={p.id} style={styles.photoBlock}>
              {urls[p.storage_path] ? (
                <Image
                  source={{ uri: urls[p.storage_path], cacheKey: `journal:${p.storage_path}` }}
                  placeholder={p.thumb_path ? { cacheKey: `journal:${p.thumb_path}` } : undefined}
                  style={[styles.photo, { width: photoW, height: h }]}
                  contentFit="cover"
                  transition={200}
                  accessibilityLabel={p.caption || `Photo ${i + 1}`}
                />
              ) : (
                <View style={[styles.photo, { width: photoW, height: h, backgroundColor: c.skeleton }]} />
              )}
              {p.caption ? <Text style={[type.body, { color: c.inkSecondary }]}>{p.caption}</Text> : null}
            </View>
          );
        })}
        {notes.map((n, i) => (
          <VoiceNote
            key={n.id}
            index={i}
            uri={urls[n.storage_path] ?? null}
            durationMs={n.duration_ms}
            caption={n.caption ?? ''}
            transcript={n.transcript ?? undefined}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  content: { paddingHorizontal: 20, gap: 14 },
  when: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, lineHeight: 18 },
  title: { fontFamily: fontFamily.display, fontSize: 32, lineHeight: 38, color: c.ink },
  body: { ...type.body, fontSize: 17, lineHeight: 26, color: c.ink },
  photoBlock: { gap: 6 },
  photo: { borderRadius: 18, boxShadow: shadow.card },
});
