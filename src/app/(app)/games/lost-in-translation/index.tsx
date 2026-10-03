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
import { useAuth } from '../../../../lib/AuthProvider';
import { fetchMembers, type Member } from '../../../../lib/chat';
import { personColor } from '../../../../lib/chatFormat';
import { confirm } from '../../../../lib/confirm';
import { todayDay } from '../../../../lib/dates';
import {
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
import { signedUrls } from '../../../../lib/photos';
import { CITIES } from '../../../../lib/weather';
import { shadow } from '../../../../theme/colors';
import { fontFamily, type } from '../../../../theme/typography';
import { useTheme } from '../../../../theme/useTheme';

// Lost in Translation: everyone posts photos of wonky English spotted on
// the trip and upvotes their favourites. Points = upvotes received. Each
// day's most-upvoted photo is highlighted as that day's winner ("Leading
// today" while the day is still on). Photos live in the private `games`
// bucket — not in the shared Photos gallery.

const GAME = 'lost_in_translation' as const;
type Tab = 'top' | 'new' | 'board';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function LostInTranslation() {
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
  const winners = useMemo(() => dailyWinners(entries, counts), [entries, counts]);
  const winnerIds = useMemo(() => new Set(winners.values()), [winners]);
  const board = useMemo(() => leaderboard(entries, counts), [entries, counts]);
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
    if (!(await confirm('Delete this find?', 'It and its upvotes will be removed for everyone.', 'Delete', true)))
      return;
    try {
      await deleteEntry(e);
      setEntries((prev) => prev.filter((x) => x.id !== e.id));
      setVotes((prev) => prev.filter((v) => v.entry_id !== e.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header" numberOfLines={1}>
          Lost in Translation
        </Text>
        <CircleButton
          icon="add"
          label="Post a find"
          testID="lit-add"
          onPress={() => router.push('/(app)/games/lost-in-translation/new')}
        />
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.card }]} accessibilityRole="tablist">
        {(
          [
            ['top', 'Top'],
            ['new', 'New'],
            ['board', 'Leaderboard'],
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
        <JournalSkeleton label="Loading finds" />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {error ? <Text style={[type.body, { color: colors.error }]}>{error}</Text> : null}

          {tab === 'board' ? (
            board.length === 0 ? (
              <Text style={[type.body, { color: colors.inkSecondary }]}>
                No points yet. Upvotes on your finds score points.
              </Text>
            ) : (
              <View style={[styles.board, { backgroundColor: colors.card }]} testID="leaderboard">
                {board.map((s, i) => {
                  const m = member(s.userId);
                  return (
                    <View
                      key={s.userId}
                      testID="standing"
                      style={[
                        styles.standing,
                        i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                      ]}
                      accessible
                      accessibilityLabel={`${s.rank}. ${m.name}${s.userId === me ? ' (you)' : ''}, ${plural(s.points, 'point')}, ${plural(s.finds, 'find')}${s.dayWins ? `, ${plural(s.dayWins, 'daily win')}` : ''}`}
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
                          {plural(s.finds, 'find')}
                          {s.dayWins ? ` · ${plural(s.dayWins, 'daily win')}` : ''}
                        </Text>
                      </View>
                      <Text style={[styles.points, { color: colors.ink }]}>{s.points}</Text>
                    </View>
                  );
                })}
              </View>
            )
          ) : entries.length === 0 && !error ? (
            <View style={[styles.empty, { backgroundColor: colors.card }]}>
              <Ionicons name="language-outline" size={34} color={colors.highlight} />
              <Text style={[type.cardTitle, { color: colors.ink }]}>Spot the wonkiest English</Text>
              <Text style={[type.body, { color: colors.inkSecondary }]}>
                Menus, signs, T-shirts, packaging. Snap it, post it, and the group upvotes their favourites. Each upvote
                is a point, and every day’s top photo is crowned.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(app)/games/lost-in-translation/new')}
                style={({ pressed }) => [
                  styles.cta,
                  { backgroundColor: pressed ? colors.accentPressed : colors.accent },
                ]}
              >
                <Text style={[styles.ctaText, { color: colors.onAccent }]}>Post the first find</Text>
              </Pressable>
            </View>
          ) : (
            shown.map((e) => {
              const m = member(e.created_by);
              const n = counts.get(e.id) ?? 0;
              const mine = e.created_by === me;
              const voted = votes.some((v) => v.entry_id === e.id && v.user_id === me);
              const day = entryDay(e);
              const won = winnerIds.has(e.id);
              const url = urls[e.storage_path];
              const thumb = e.thumb_path ? urls[e.thumb_path] : undefined;
              const ratio = e.width && e.height ? Math.min(1.6, Math.max(0.62, e.width / e.height)) : 4 / 3;
              const city = CITIES.find((c) => c.key === e.city)?.name;
              return (
                <View
                  key={e.id}
                  testID="find"
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
                    {url ? (
                      <Image
                        source={{ uri: url, cacheKey: `games:${e.storage_path}` }}
                        placeholder={thumb ? { uri: thumb, cacheKey: `games:${e.thumb_path}` } : undefined}
                        style={[styles.photo, { aspectRatio: ratio, backgroundColor: colors.skeleton }]}
                        contentFit="cover"
                        transition={150}
                        accessibilityLabel={e.caption ? `Photo: ${e.caption}` : `Photo by ${m.name}`}
                      />
                    ) : (
                      <View style={[styles.photo, { aspectRatio: ratio, backgroundColor: colors.skeleton }]} />
                    )}
                    <View style={styles.body}>
                      {e.caption ? <Text style={[styles.caption, { color: colors.ink }]}>“{e.caption}”</Text> : null}
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
                              accessibilityLabel={`Your find, ${plural(n, 'upvote')}`}
                            >
                              <Ionicons name="arrow-up" size={18} color={colors.inkSecondary} />
                              <Text style={[styles.voteText, { color: colors.inkSecondary }]}>{n}</Text>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Delete your find"
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
  // Shadow on the outer view, clipping on the inner one (on iOS
  // overflow: 'hidden' would clip the shadow too).
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
  body: { padding: 14, gap: 10 },
  caption: { fontFamily: fontFamily.displayItalic, fontSize: 20, lineHeight: 26 },
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
  board: { borderRadius: 22, paddingHorizontal: 16, boxShadow: shadow.card },
  standing: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  rank: { width: 22, textAlign: 'center', fontFamily: fontFamily.bodySemiBold, fontSize: 17 },
  points: { fontFamily: fontFamily.displayMedium, fontSize: 26 },
});
