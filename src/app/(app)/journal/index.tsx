import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OfflineNotice from '../../../components/OfflineNotice';
import CircleButton from '../../../components/CircleButton';
import { JournalSkeleton } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { useAuth } from '../../../lib/AuthProvider';
import { fetchMembers, type Member } from '../../../lib/chat';
import { firstName } from '../../../lib/chatFormat';
import { formatMonthDay, formatWeekday } from '../../../lib/dates';
import { fetchMyEntries, fetchSharedEntries, type JournalEntry } from '../../../lib/journal';
import { signedUrls } from '../../../lib/photos';
import { stopForDay } from '../../../lib/places';
import { colors as c, legColors, legTextColors, shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';

type Tab = 'mine' | 'group';
const THUMB = 84;

export default function JournalList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';

  const [tab, setTab] = useState<Tab>('mine');
  const [mine, setMine] = useState<JournalEntry[] | null>(null);
  const [group, setGroup] = useState<JournalEntry[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!myId) return;
    setError(null);
    Promise.all([fetchMyEntries(myId), fetchSharedEntries(myId), fetchMembers()])
      .then(async ([m, g, people]) => {
        setMine(m);
        setGroup(g);
        setMembers(people);
        const thumbs = [...m, ...g].flatMap((e) =>
          e.journal_media.filter((x) => x.kind === 'photo').slice(0, 3).map((x) => x.thumb_path ?? x.storage_path),
        );
        if (thumbs.length) setUrls(await signedUrls('journal', thumbs));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the journal'));
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const list = tab === 'mine' ? mine : group;
  const byDay = useMemo(() => {
    const out: { day: string; entries: JournalEntry[] }[] = [];
    for (const e of list ?? []) {
      const last = out[out.length - 1];
      if (last?.day === e.day) last.entries.push(e);
      else out.push({ day: e.day, entries: [e] });
    }
    return out;
  }, [list]);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'A traveler';

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.headerTitle} accessibilityRole="header">
          Journal
        </Text>
        <View style={styles.headerRight}>
          <CircleButton
            icon="book-outline"
            label="Make a photo book"
            testID="journal-book-button"
            onPress={() => router.push('/(app)/journal/book')}
          />
          <CircleButton
            icon="add"
            label="Write an entry"
            testID="journal-add-button"
            onPress={() => router.push('/(app)/journal/new')}
          />
        </View>
      </View>
      <OfflineNotice />

      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            ['mine', 'Mine'],
            ['group', 'From the group'],
          ] as [Tab, string][]
        ).map(([key, label]) => {
          const on = tab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setTab(key)}
              style={[styles.tab, { backgroundColor: on ? c.accent : c.card }]}
            >
              <Text style={[type.bodyStrong, { color: on ? c.onAccent : c.ink }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {list === null && !error ? (
        <JournalSkeleton />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
          showsVerticalScrollIndicator={false}
        >
          {error ? <Text style={[type.body, { color: c.danger }]}>{error}</Text> : null}

          {list && list.length === 0 ? (
            tab === 'mine' ? (
              <View style={[styles.empty, { backgroundColor: c.card }]}>
                <View style={[styles.emptyIcon, { backgroundColor: c.accentSoft }]}>
                  <Ionicons name="mic-outline" size={26} color={c.highlight} />
                </View>
                <Text style={styles.emptyTitle}>Your trip journal starts here</Text>
                <Text style={[type.body, styles.emptyText, { color: c.inkSecondary }]}>
                  Write about your day, add photos and record voice memories. At the end of the trip, turn it all
                  into a printable photo book.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/(app)/journal/new')}
                  style={({ pressed }) => [styles.emptyButton, { backgroundColor: pressed ? c.accentPressed : c.accent }]}
                >
                  <Text style={[type.button, { color: c.onAccent }]}>Write the first entry</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[type.body, styles.groupEmpty, { color: c.inkSecondary }]}>
                Entries other travelers share with the group appear here.
              </Text>
            )
          ) : null}

          {byDay.map(({ day, entries }) => {
            const stop = stopForDay(day);
            const legKey = stop?.key as keyof typeof legColors | undefined;
            return (
              <View key={day} style={styles.dayGroup}>
                <View style={styles.dayHead}>
                  <View style={[styles.dayDot, { backgroundColor: legKey ? legColors[legKey] : c.inkTertiary }]} />
                  <Text style={[styles.dayLabel, { color: legKey ? legTextColors[legKey] : c.inkSecondary }]}>
                    {formatWeekday(day)}, {formatMonthDay(day)}
                  </Text>
                </View>
                {entries.map((e) => (
                  <EntryCard
                    key={e.id}
                    entry={e}
                    urls={urls}
                    author={e.user_id === myId ? null : firstName(nameOf(e.user_id))}
                    onPress={() => router.push({ pathname: '/(app)/journal/[id]', params: { id: e.id } })}
                  />
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function EntryCard({
  entry,
  urls,
  author,
  onPress,
}: {
  entry: JournalEntry;
  urls: Record<string, string>;
  author: string | null;
  onPress: () => void;
}) {
  const photos = entry.journal_media.filter((m) => m.kind === 'photo');
  const notes = entry.journal_media.filter((m) => m.kind === 'audio').length;
  const where = entry.city ?? stopForDay(entry.day)?.city;
  const title = entry.title || (entry.body ? entry.body.split('\n')[0].slice(0, 60) : 'Untitled');
  const a11y = [
    author ? `${author}:` : null,
    title,
    where,
    photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : null,
    notes ? `${notes} voice note${notes === 1 ? '' : 's'}` : null,
    entry.shared_to_group && !author ? 'shared with the group' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      testID="journal-entry"
      style={({ pressed }) => [styles.card, { backgroundColor: c.card, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
    >
      {photos.length ? (
        <View style={styles.strip}>
          {photos.slice(0, 3).map((p, i) => {
            const path = p.thumb_path ?? p.storage_path;
            const more = i === 2 && photos.length > 3 ? photos.length - 3 : 0;
            return (
              <View key={p.id} style={styles.thumbWrap}>
                {urls[path] ? (
                  <Image
                    source={{ uri: urls[path], cacheKey: `journal:${path}` }}
                    style={styles.thumb}
                    contentFit="cover"
                    accessibilityLabel=""
                    transition={150}
                  />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: c.skeleton }]} />
                )}
                {more ? (
                  <View style={[styles.more, { backgroundColor: c.mediaBadge }]}>
                    <Text style={[type.bodyStrong, { color: c.onMedia }]}>+{more}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      <Text style={styles.cardTitle} numberOfLines={2}>
        {title}
      </Text>
      {entry.body ? (
        <Text style={[type.body, { color: c.inkSecondary }]} numberOfLines={3}>
          {entry.body}
        </Text>
      ) : null}
      <View style={styles.meta}>
        {author ? <Text style={[type.caption, { color: c.inkSecondary }]}>{author}</Text> : null}
        {where ? (
          <Text style={[type.caption, { color: c.inkSecondary }]} numberOfLines={1}>
            {where}
          </Text>
        ) : null}
        {notes ? (
          <View style={styles.metaItem}>
            <Ionicons name="mic-outline" size={14} color={c.inkSecondary} />
            <Text style={[type.caption, { color: c.inkSecondary }]}>{notes}</Text>
          </View>
        ) : null}
        {entry.shared_to_group && !author ? (
          <View style={[styles.pill, { backgroundColor: c.accentSoft }]}>
            <Text style={[type.caption, { color: c.highlight }]}>Shared</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
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
  headerRight: {
    flexDirection: 'row',
    gap: 10,
  },
  headerTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    letterSpacing: -0.2,
    color: c.ink,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  tab: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.card,
  },
  content: {
    paddingHorizontal: 20,
    gap: 18,
  },
  dayGroup: {
    gap: 10,
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dayLabel: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  card: {
    borderRadius: 22,
    padding: 16,
    gap: 6,
    boxShadow: shadow.card,
  },
  strip: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  thumbWrap: {
    width: THUMB,
    height: THUMB,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 14,
  },
  more: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: fontFamily.display,
    fontSize: 21,
    lineHeight: 26,
    color: c.ink,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  empty: {
    borderRadius: 24,
    padding: 22,
    alignItems: 'flex-start',
    gap: 10,
    boxShadow: shadow.card,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    color: c.ink,
  },
  emptyText: {
    marginBottom: 6,
  },
  emptyButton: {
    height: 54,
    borderRadius: 27,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  groupEmpty: {
    marginTop: 8,
  },
});
