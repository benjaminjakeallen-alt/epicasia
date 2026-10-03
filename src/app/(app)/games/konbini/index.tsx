import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../../../components/Avatar';
import CircleButton from '../../../../components/CircleButton';
import OfflineNotice from '../../../../components/OfflineNotice';
import { JournalSkeleton } from '../../../../components/Skeleton';
import SkyBackdrop from '../../../../components/SkyBackdrop';
import PhotoViewer from '../../../../components/chat/PhotoViewer';
import Stars from '../../../../components/games/Stars';
import { useAuth } from '../../../../lib/AuthProvider';
import { fetchMembers, type Member } from '../../../../lib/chat';
import { personColor } from '../../../../lib/chatFormat';
import { confirm } from '../../../../lib/confirm';
import { todayDay } from '../../../../lib/dates';
import {
  bySnackRating,
  dailyWinners,
  deleteEntry,
  entryDay,
  fetchEntries,
  fetchVotes,
  leaderboard,
  setVote,
  voteCounts,
  type Entry,
  type Vote,
} from '../../../../lib/games';
import { durationLabel, savePhoto, sharePhoto, signedUrls } from '../../../../lib/photos';
import { CITIES } from '../../../../lib/weather';
import { shadow } from '../../../../theme/colors';
import { fontFamily, type } from '../../../../theme/typography';
import { useTheme } from '../../../../theme/useTheme';

// Konbini Review: buy a mystery snack or drink at a convenience store, film
// your reaction, rate it 1–5. The group upvotes the best reactions (points =
// upvotes received, like every photo game) and each day's top reaction is
// crowned. "Snacks" lists everything tried, best to worst. Videos live in
// the private `games` bucket — not in the shared Photos gallery.

const GAME = 'konbini_review' as const;
type Tab = 'top' | 'new' | 'snacks' | 'board';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function KonbiniReview() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id ?? '';

  const [entries, setEntries] = useState<Entry[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>('top');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Entry | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([fetchEntries(GAME), fetchVotes(), fetchMembers().catch(() => [] as Member[])])
      .then(async ([e, v, m]) => {
        setEntries(e);
        setVotes(v);
        setMembers(m);
        const paths = e.flatMap((x) => [x.storage_path, ...(x.thumb_path ? [x.thumb_path] : [])]);
        if (paths.length) setUrls(await signedUrls('games', paths).catch(() => ({})));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const counts = useMemo(() => voteCounts(votes), [votes]);
  const winnerIds = useMemo(() => new Set(dailyWinners(entries, counts).values()), [entries, counts]);
  const board = useMemo(() => leaderboard(entries, counts), [entries, counts]);
  const snacks = useMemo(() => bySnackRating(entries, counts), [entries, counts]);
  const today = todayDay();

  const shown = useMemo(() => {
    const list = [...entries];
    if (tab === 'top')
      list.sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || (a.created_at < b.created_at ? 1 : -1));
    return list;
  }, [entries, counts, tab]);

  const member = (id: string) => {
    const i = members.findIndex((m) => m.id === id);
    return {
      name: members[i]?.name ?? 'Someone',
      avatar: members[i]?.avatar ?? null,
      color: personColor(Math.max(i, 0)),
    };
  };

  async function play(e: Entry) {
    if (!e.video_path) return;
    setNote(null);
    setPlaying(e);
    if (!urls[e.video_path]) {
      const got = await signedUrls('games', [e.video_path]).catch(() => ({}) as Record<string, string>);
      setUrls((prev) => ({ ...prev, ...got }));
    }
  }

  async function toggleVote(e: Entry) {
    const on = !votes.some((v) => v.entry_id === e.id && v.user_id === me);
    const before = votes;
    setVotes(
      on
        ? [...votes, { entry_id: e.id, user_id: me }]
        : votes.filter((v) => !(v.entry_id === e.id && v.user_id === me)),
    );
    try {
      await setVote(e.id, me, on);
    } catch (err) {
      setVotes(before);
      setError(err instanceof Error ? err.message : 'Your vote didn’t save');
    }
  }

  async function remove(e: Entry) {
    if (!(await confirm('Delete this review?', 'The video and its upvotes will be removed for everyone.'))) return;
    try {
      await deleteEntry(e);
      setEntries((prev) => prev.filter((x) => x.id !== e.id));
      setVotes((prev) => prev.filter((v) => v.entry_id !== e.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  const add = () => router.push('/(app)/games/konbini/new');

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header" numberOfLines={1}>
          Konbini Review
        </Text>
        <CircleButton icon="add" label="Post a review" testID="konbini-add" onPress={add} />
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.card }]} accessibilityRole="tablist">
        {(
          [
            ['top', 'Top'],
            ['new', 'New'],
            ['snacks', 'Snacks'],
            ['board', 'Points'],
          ] as [Tab, string][]
        ).map(([k, label]) => {
          const on = tab === k;
          return (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              aria-selected={on}
              onPress={() => setTab(k)}
              style={[styles.tab, on && { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.tabText, { color: on ? colors.onAccent : colors.ink }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <OfflineNotice />

      {loading ? (
        <JournalSkeleton label="Loading reviews" />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {error ? <Text style={[type.body, { color: colors.error }]}>{error}</Text> : null}

          {entries.length === 0 && !error ? (
            <View style={[styles.empty, { backgroundColor: colors.card }]} testID="konbini-empty">
              <Ionicons name="fast-food-outline" size={34} color={colors.highlight} />
              <Text style={[type.cardTitle, { color: colors.ink }]}>Try the weirdest snack you can find</Text>
              <Text style={[type.body, { color: colors.inkSecondary }]}>
                Grab a mystery snack or drink at a 7-Eleven, Lawson or FamilyMart, film your first bite, and rate it 1
                to 5. Every upvote on your reaction is a point.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={add}
                style={({ pressed }) => [
                  styles.cta,
                  { backgroundColor: pressed ? colors.accentPressed : colors.accent },
                ]}
              >
                <Text style={[styles.ctaText, { color: colors.onAccent }]}>Post the first review</Text>
              </Pressable>
            </View>
          ) : tab === 'board' ? (
            <View style={[styles.list, { backgroundColor: colors.card }]} testID="konbini-board">
              {board.map((s, i) => {
                const m = member(s.userId);
                return (
                  <View
                    key={s.userId}
                    testID="standing"
                    style={[
                      styles.row,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                    ]}
                    accessible
                    accessibilityLabel={`${s.rank}. ${m.name}${s.userId === me ? ' (you)' : ''}, ${plural(s.points, 'point')}, ${plural(s.finds, 'review')}`}
                  >
                    <Text style={[styles.rank, { color: s.rank === 1 ? colors.winnerInk : colors.inkSecondary }]}>
                      {s.rank}
                    </Text>
                    <Avatar name={m.name} path={m.avatar} color={m.color} size={40} />
                    <View style={styles.flex}>
                      <Text style={[type.cardTitle, { color: colors.ink }]}>
                        {m.name}
                        {s.userId === me ? ' (you)' : ''}
                      </Text>
                      <Text style={[type.caption, { color: colors.inkSecondary }]}>
                        {plural(s.finds, 'review')}
                        {s.dayWins ? ` · ${plural(s.dayWins, 'daily win')}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.points, { color: colors.ink }]}>{s.points}</Text>
                  </View>
                );
              })}
            </View>
          ) : tab === 'snacks' ? (
            <View style={[styles.list, { backgroundColor: colors.card }]} testID="snack-list">
              {snacks.map((e, i) => {
                const m = member(e.created_by);
                const thumb = e.thumb_path ? urls[e.thumb_path] : urls[e.storage_path];
                const best = i === 0 && (e.rating ?? 0) >= 4;
                const worst = i === snacks.length - 1 && snacks.length > 1 && (e.rating ?? 0) <= 2;
                return (
                  <Pressable
                    key={e.id}
                    testID="snack"
                    accessibilityRole="button"
                    accessibilityLabel={`${e.title}, rated ${e.rating} of 5 by ${m.name}${best ? ', best snack of the trip' : worst ? ', worst snack of the trip' : ''}. Play the reaction`}
                    onPress={() => play(e)}
                    style={[
                      styles.row,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                    ]}
                  >
                    {thumb ? (
                      <Image
                        source={{ uri: thumb, cacheKey: `games:${e.thumb_path ?? e.storage_path}` }}
                        style={[styles.snackThumb, { backgroundColor: colors.skeleton }]}
                        contentFit="cover"
                        accessibilityLabel=""
                      />
                    ) : (
                      <View style={[styles.snackThumb, { backgroundColor: colors.skeleton }]} />
                    )}
                    <View style={styles.flex}>
                      <Text style={[type.cardTitle, { color: colors.ink }]} numberOfLines={1}>
                        {e.title}
                      </Text>
                      <Text style={[type.caption, { color: colors.inkSecondary }]} numberOfLines={1}>
                        {e.created_by === me ? 'You' : m.name}
                      </Text>
                    </View>
                    <View style={styles.snackRight}>
                      <Stars value={e.rating ?? 0} size={15} />
                      {best ? (
                        <Text
                          style={[styles.tag, { color: colors.winnerInk, backgroundColor: colors.winnerSoft }]}
                          testID="best-snack"
                        >
                          Best
                        </Text>
                      ) : worst ? (
                        <Text
                          style={[styles.tag, { color: colors.danger, backgroundColor: colors.dangerSoft }]}
                          testID="worst-snack"
                        >
                          Worst
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            shown.map((e) => {
              const m = member(e.created_by);
              const n = counts.get(e.id) ?? 0;
              const mine = e.created_by === me;
              const voted = votes.some((v) => v.entry_id === e.id && v.user_id === me);
              const day = entryDay(e);
              const won = winnerIds.has(e.id);
              const poster = urls[e.storage_path];
              const thumb = e.thumb_path ? urls[e.thumb_path] : undefined;
              const ratio = e.width && e.height ? Math.min(1.25, Math.max(0.62, e.width / e.height)) : 3 / 4;
              const city = CITIES.find((c) => c.key === e.city)?.name;
              return (
                <View
                  key={e.id}
                  testID="review"
                  style={[
                    styles.card,
                    { backgroundColor: colors.card },
                    won && { borderColor: colors.winner, borderWidth: 3 },
                  ]}
                >
                  <View style={[styles.clip, won && styles.clipWon]}>
                    {won ? (
                      <View style={[styles.badge, { backgroundColor: colors.winnerSoft }]} testID="winner-badge">
                        <Ionicons name="trophy" size={16} color={colors.winnerInk} />
                        <Text style={[styles.badgeText, { color: colors.winnerInk }]}>
                          {day === today ? 'Leading today' : `Winner · ${dayLabel(day)}`}
                        </Text>
                      </View>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Play ${mine ? 'your' : `${m.name}’s`} reaction to ${e.title}, ${durationLabel(e.video_duration_ms)}`}
                      onPress={() => play(e)}
                      testID="play-reaction"
                    >
                      {poster ? (
                        <Image
                          source={{ uri: poster, cacheKey: `games:${e.storage_path}` }}
                          placeholder={thumb ? { uri: thumb, cacheKey: `games:${e.thumb_path}` } : undefined}
                          style={[styles.photo, { aspectRatio: ratio, backgroundColor: colors.skeleton }]}
                          contentFit="cover"
                          transition={150}
                          accessibilityLabel=""
                        />
                      ) : (
                        <View style={[styles.photo, { aspectRatio: ratio, backgroundColor: colors.skeleton }]} />
                      )}
                      <View style={styles.playWrap} pointerEvents="none">
                        <View style={[styles.playBtn, { backgroundColor: colors.mediaBadge }]}>
                          <Ionicons name="play" size={30} color={colors.onMedia} />
                        </View>
                      </View>
                      {e.video_duration_ms ? (
                        <View style={[styles.duration, { backgroundColor: colors.mediaBadge }]} pointerEvents="none">
                          <Text style={[styles.durationText, { color: colors.onMedia }]}>
                            {durationLabel(e.video_duration_ms)}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                    <View style={styles.body}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.snack, { color: colors.ink }]} numberOfLines={2}>
                          {e.title}
                        </Text>
                        <Stars value={e.rating ?? 0} size={18} />
                      </View>
                      {e.caption ? (
                        <Text style={[styles.caption, { color: colors.inkSecondary }]}>“{e.caption}”</Text>
                      ) : null}
                      <View style={styles.meta}>
                        <Avatar name={m.name} path={m.avatar} color={m.color} size={28} />
                        <Text style={[type.caption, styles.flex, { color: colors.inkSecondary }]} numberOfLines={1}>
                          {mine ? 'You' : m.name}
                          {city ? ` · ${city}` : ''} · {dayLabel(day)}
                        </Text>
                        {mine ? (
                          <>
                            <View
                              style={[styles.vote, { borderColor: colors.border }]}
                              accessible
                              accessibilityLabel={`Your review, ${plural(n, 'upvote')}`}
                            >
                              <Ionicons name="arrow-up" size={18} color={colors.inkSecondary} />
                              <Text style={[styles.voteText, { color: colors.inkSecondary }]}>{n}</Text>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Delete your review"
                              onPress={() => remove(e)}
                              style={styles.iconHit}
                            >
                              <Ionicons name="trash-outline" size={19} color={colors.inkTertiary} />
                            </Pressable>
                          </>
                        ) : (
                          <Pressable
                            testID="upvote"
                            accessibilityRole="button"
                            accessibilityState={{ selected: voted }}
                            aria-pressed={voted}
                            accessibilityLabel={
                              voted ? `Remove your upvote, ${plural(n, 'upvote')}` : `Upvote, ${plural(n, 'upvote')}`
                            }
                            onPress={() => toggleVote(e)}
                            style={({ pressed }) => [
                              styles.vote,
                              {
                                borderColor: voted ? colors.accent : colors.border,
                                backgroundColor: voted ? colors.accent : pressed ? colors.accentSoft : colors.card,
                              },
                            ]}
                          >
                            <Ionicons name="arrow-up" size={18} color={voted ? colors.onAccent : colors.highlight} />
                            <Text style={[styles.voteText, { color: voted ? colors.onAccent : colors.highlight }]}>
                              {n}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <PhotoViewer
        uri={playing ? (urls[playing.storage_path] ?? null) : null}
        videoUri={playing?.video_path ? (urls[playing.video_path] ?? null) : null}
        caption={playing ? `${playing.title} · ${playing.rating}/5` : ''}
        onClose={() => setPlaying(null)}
        saving={saving}
        note={note}
        onSave={async () => {
          if (!playing?.video_path) return;
          setSaving(true);
          const ok = await savePhoto('games', playing.video_path).catch(() => false);
          setSaving(false);
          setNote(ok ? 'Saved' : 'Could not download the video');
        }}
        onShare={() => {
          if (playing?.video_path) sharePhoto('games', playing.video_path).catch(() => {});
        }}
      />
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
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 24,
    padding: 3,
    boxShadow: shadow.card,
  },
  tab: { flex: 1, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontFamily: fontFamily.bodySemiBold, fontSize: 15 },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 16 },
  empty: { borderRadius: 22, padding: 20, gap: 10, alignItems: 'flex-start', boxShadow: shadow.card },
  cta: {
    height: 50,
    borderRadius: 25,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  ctaText: { fontFamily: fontFamily.bodySemiBold, fontSize: 16 },
  card: { borderRadius: 22, boxShadow: shadow.card },
  clip: { borderRadius: 22, overflow: 'hidden' },
  clipWon: { borderRadius: 19 },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: { fontFamily: fontFamily.bodySemiBold, fontSize: 14 },
  photo: { width: '100%' },
  playWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  duration: { position: 'absolute', right: 10, bottom: 10, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  durationText: { fontFamily: fontFamily.bodySemiBold, fontSize: 13 },
  body: { padding: 14, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  snack: { flex: 1, fontFamily: fontFamily.display, fontSize: 22, lineHeight: 27 },
  caption: { fontFamily: fontFamily.displayItalic, fontSize: 17, lineHeight: 23 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 64,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
  },
  voteText: { fontFamily: fontFamily.bodySemiBold, fontSize: 16 },
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  list: { borderRadius: 22, paddingHorizontal: 16, boxShadow: shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8 },
  rank: { width: 22, textAlign: 'center', fontFamily: fontFamily.bodySemiBold, fontSize: 17 },
  points: { fontFamily: fontFamily.displayMedium, fontSize: 26 },
  snackThumb: { width: 48, height: 48, borderRadius: 12 },
  snackRight: { alignItems: 'flex-end', gap: 4 },
  tag: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
