import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../../../components/Avatar';
import CircleButton from '../../../../components/CircleButton';
import OfflineNotice from '../../../../components/OfflineNotice';
import { DocsSkeleton } from '../../../../components/Skeleton';
import SkyBackdrop from '../../../../components/SkyBackdrop';
import { useAuth } from '../../../../lib/AuthProvider';
import { fetchMembers, type Member } from '../../../../lib/chat';
import { personColor } from '../../../../lib/chatFormat';
import { fetchScores, flushRuns, highScores, localBest, type ScoreRow } from '../../../../lib/rampage';
import { shadow } from '../../../../theme/colors';
import { fontFamily, type } from '../../../../theme/typography';
import { useTheme } from '../../../../theme/useTheme';

// Godzilla Rampage: a Play card and the group's high-score board (each
// player's best run). The game itself is ./play (full screen).

const HERO = { chris: 'Chris', shea: 'Shea' } as const;
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export default function Rampage() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id ?? '';

  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [best, setBest] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    localBest().then(setBest);
    // A run saved offline goes up first, so it's on the board.
    (me ? flushRuns(me).catch(() => {}) : Promise.resolve())
      .then(() => Promise.all([fetchScores(), fetchMembers().catch(() => [] as Member[])]))
      .then(([s, m]) => {
        setRows(s);
        setMembers(m);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const board = useMemo(() => highScores(rows), [rows]);
  const myBest = Math.max(best, board.find((b) => b.user_id === me)?.score ?? 0);

  const member = (id: string) => {
    const i = members.findIndex((m) => m.id === id);
    return { name: members[i]?.name ?? 'Someone', avatar: members[i]?.avatar ?? null, color: personColor(Math.max(i, 0)) };
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header" numberOfLines={1}>
          Godzilla Rampage
        </Text>
        <View style={styles.spacer} />
      </View>
      <OfflineNotice />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.play, { backgroundColor: colors.arcade }]}>
          <Text style={[styles.playTitle, { color: colors.onArcade }]}>Climb. Dodge. Rescue.</Text>
          <Text style={[type.body, { color: colors.onArcade }]}>
            Chris swings a pickaxe to save Emily. Shea swings a candy cane to save Heather. Godzilla has barrels.
          </Text>
          {myBest > 0 ? (
            <Text style={[styles.best, { color: colors.onArcade }]} testID="my-best">
              Your best {fmt(myBest)}
            </Text>
          ) : null}
          <Pressable
            testID="rampage-play"
            accessibilityRole="button"
            onPress={() => router.push('/(app)/games/rampage/play')}
            style={({ pressed }) => [styles.cta, { backgroundColor: pressed ? colors.accentPressed : colors.accent }]}
          >
            <Ionicons name="play" size={18} color={colors.onAccent} />
            <Text style={[styles.ctaText, { color: colors.onAccent }]}>Play</Text>
          </Pressable>
        </View>

        <Text style={[styles.section, { color: colors.ink }]} accessibilityRole="header">
          High scores
        </Text>
        {error ? <Text style={[type.body, { color: colors.error }]}>{error}</Text> : null}
        {loading ? (
          <DocsSkeleton label="Loading high scores" />
        ) : board.length === 0 ? (
          <Text style={[type.body, { color: colors.inkSecondary }]}>No scores yet. Be the first on the board.</Text>
        ) : (
          <View style={[styles.board, { backgroundColor: colors.card }]}>
            {board.map((s, i) => {
              const m = member(s.user_id);
              const you = s.user_id === me ? ' (you)' : '';
              const detail = `as ${HERO[s.hero]} · level ${s.level}${s.round > 1 ? `, round ${s.round}` : ''}`;
              return (
                <View
                  key={s.user_id}
                  testID="high-score"
                  style={[
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                  ]}
                  accessible
                  accessibilityLabel={`${s.rank}. ${m.name}${you}, ${fmt(s.score)}, ${detail}`}
                >
                  <Text style={[styles.rank, { color: s.rank === 1 ? colors.winnerInk : colors.inkSecondary }]}>
                    {s.rank}
                  </Text>
                  <Avatar name={m.name} path={m.avatar} color={m.color} size={40} />
                  <View style={styles.flex}>
                    <Text style={[type.cardTitle, { color: colors.ink }]}>
                      {m.name}
                      {you}
                    </Text>
                    <Text style={[type.caption, { color: colors.inkSecondary }]}>{detail}</Text>
                  </View>
                  <Text style={[styles.score, { color: colors.ink }]}>{fmt(s.score)}</Text>
                </View>
              );
            })}
          </View>
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
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2 },
  spacer: { width: 44 },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 14 },
  play: { borderRadius: 24, padding: 20, gap: 10, boxShadow: shadow.card },
  playTitle: { fontFamily: fontFamily.display, fontSize: 26, lineHeight: 31 },
  best: { fontFamily: fontFamily.mono, fontSize: 15 },
  cta: {
    flexDirection: 'row',
    gap: 8,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  ctaText: { fontFamily: fontFamily.bodySemiBold, fontSize: 17 },
  section: { fontFamily: fontFamily.display, fontSize: 20, marginTop: 6 },
  board: { borderRadius: 22, paddingHorizontal: 16, boxShadow: shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8 },
  rank: { width: 22, textAlign: 'center', fontFamily: fontFamily.bodySemiBold, fontSize: 17 },
  score: { fontFamily: fontFamily.mono, fontSize: 18 },
});
