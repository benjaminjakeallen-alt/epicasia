import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../../components/Avatar';
import CircleButton from '../../../components/CircleButton';
import OfflineNotice from '../../../components/OfflineNotice';
import { DocsSkeleton } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { useAuth } from '../../../lib/AuthProvider';
import { personColor } from '../../../lib/chatFormat';
import { fetchTripStandings, ordinal, PLACE_POINTS, type TripStanding } from '../../../lib/leaderboard';
import { shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// The trip leaderboard across every game: each game ranks its players and
// the placing earns trip points (src/lib/leaderboard.ts). The top three
// stand on a podium; everyone is listed below with how they placed in each
// game.

export default function TripLeaderboard() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;
  const [rows, setRows] = useState<TripStanding[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchTripStandings()
        .then((r) => {
          setRows(r);
          setError(null);
        })
        .catch(() => setError('Could not load the leaderboard.'));
    }, []),
  );

  const colorFor = (id: string) =>
    personColor(
      Math.max(
        0,
        (rows ?? []).findIndex((r) => r.userId === id),
      ),
    );
  const podium = (rows ?? []).filter((r) => r.rank <= 3).slice(0, 3);
  // Podium order on screen: 2nd, 1st, 3rd.
  const stage = [podium[1], podium[0], podium[2]].filter(Boolean) as TripStanding[];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header">
          Leaderboard
        </Text>
        <View style={styles.spacer} />
      </View>
      <OfflineNotice />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        {error ? <Text style={[type.body, { color: colors.danger }]}>{error}</Text> : null}
        {!rows ? (
          error ? null : (
            <DocsSkeleton label="Loading the leaderboard" />
          )
        ) : rows.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card }]} testID="trip-board-empty">
            <Ionicons name="trophy-outline" size={34} color={colors.highlight} />
            <Text style={[type.body, styles.center, { color: colors.inkSecondary }]}>
              No points yet. Play a game to get on the board.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.podium} testID="podium">
              {stage.map((s) => {
                const first = s.rank === 1;
                return (
                  <View
                    key={s.userId}
                    style={styles.podiumCol}
                    accessible
                    accessibilityLabel={`${ordinal(s.rank)}, ${s.name}, ${s.total} points`}
                  >
                    {first ? <Ionicons name="trophy" size={26} color={colors.winner} /> : null}
                    <Avatar name={s.name} path={s.avatar} color={colorFor(s.userId)} size={first ? 68 : 54} />
                    <Text style={[styles.podiumName, { color: colors.ink }]} numberOfLines={1}>
                      {s.name.split(' ')[0]}
                    </Text>
                    <View
                      style={[
                        styles.step,
                        {
                          height: first ? 92 : s.rank === 2 ? 70 : 54,
                          backgroundColor: first ? colors.winnerSoft : colors.card,
                          borderColor: first ? colors.winner : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.stepPlace, { color: first ? colors.winnerInk : colors.inkSecondary }]}>
                        {ordinal(s.rank)}
                      </Text>
                      <Text style={[styles.stepPoints, { color: first ? colors.winnerInk : colors.ink }]}>
                        {s.total}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={[styles.board, { backgroundColor: colors.card }]}>
              {rows.map((s, i) => {
                const you = s.userId === me ? ' (you)' : '';
                const games = s.placings.map((p) => `${p.title} ${ordinal(p.rank)}`).join(' · ');
                return (
                  <View
                    key={s.userId}
                    testID="trip-standing"
                    style={[
                      styles.row,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
                    ]}
                    accessible
                    accessibilityLabel={`${ordinal(s.rank)}. ${s.name}${you}, ${s.total} points. ${s.placings
                      .map((p) => `${p.title}: ${ordinal(p.rank)}, ${p.detail}`)
                      .join('. ')}`}
                  >
                    <Text style={[styles.rank, { color: s.rank === 1 ? colors.winnerInk : colors.inkSecondary }]}>
                      {s.rank}
                    </Text>
                    <Avatar name={s.name} path={s.avatar} color={colorFor(s.userId)} size={40} />
                    <View style={styles.flex}>
                      <Text style={[type.cardTitle, { color: colors.ink }]} numberOfLines={1}>
                        {s.name}
                        {you}
                      </Text>
                      <Text style={[type.caption, { color: colors.inkSecondary }]} testID="trip-placings">
                        {games}
                      </Text>
                    </View>
                    <View style={styles.pointsCol}>
                      <Text style={[styles.points, { color: colors.ink }]} testID="trip-points">
                        {s.total}
                      </Text>
                      <Text style={[type.caption, { color: colors.inkSecondary }]}>pts</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={[type.caption, styles.how, { color: colors.inkSecondary }]}>
          Each game ranks its players. 1st place earns {PLACE_POINTS[0]} trip points, 2nd {PLACE_POINTS[1]}, 3rd{' '}
          {PLACE_POINTS[2]}, then {PLACE_POINTS.slice(3).join(', ')}, and 1 for anyone else who played. Ties share
          points.
        </Text>
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
  headerTitle: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2 },
  spacer: { width: 44 },
  content: { paddingHorizontal: 20, gap: 16 },
  empty: { borderRadius: 22, padding: 28, alignItems: 'center', gap: 10, boxShadow: shadow.card },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 10, paddingTop: 8 },
  podiumCol: { flex: 1, maxWidth: 120, alignItems: 'center', gap: 6 },
  podiumName: { fontFamily: fontFamily.bodySemiBold, fontSize: 15 },
  step: {
    alignSelf: 'stretch',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.card,
  },
  stepPlace: { fontFamily: fontFamily.bodySemiBold, fontSize: 14 },
  stepPoints: { fontFamily: fontFamily.display, fontSize: 26 },
  board: { borderRadius: 22, paddingHorizontal: 16, boxShadow: shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  rank: { width: 22, textAlign: 'center', fontFamily: fontFamily.bodySemiBold, fontSize: 17 },
  pointsCol: { alignItems: 'flex-end' },
  points: { fontFamily: fontFamily.display, fontSize: 24 },
  how: { paddingHorizontal: 4 },
});
