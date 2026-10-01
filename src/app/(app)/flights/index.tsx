import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import { PassSkeleton } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { useAuth } from '../../../lib/AuthProvider';
import { formatMonthDay, formatWallClockTime, formatWeekday, nightsBetween, wallClockDay } from '../../../lib/dates';
import { deleteFlight, fetchFlights, type Flight } from '../../../lib/flights';
import { airportName, STOPS, stopForAirport } from '../../../lib/places';
import { TRIP } from '../../../lib/trip';
import { shadow, textShadeOf } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

export default function FlightsList() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const { session } = useAuth();

  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchFlights()
      .then(setFlights)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Refetch whenever the screen regains focus (e.g. back from the add form).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleDelete(id: string) {
    try {
      await deleteFlight(id);
      setFlights((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]}>Flights</Text>
        <CircleButton
          icon="add"
          label="Add a flight"
          testID="flights-add-button"
          onPress={() => router.push('/(app)/flights/new')}
        />
      </View>

      {loading ? (
        <PassSkeleton />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.summary, { backgroundColor: colors.card }]}>
            <Text style={[styles.summaryTitle, { color: colors.ink }]}>The route</Text>
            <View style={styles.routeRow}>
              {TRIP.route.map((code, i) => (
                <View key={code} style={styles.routeStop}>
                  {i > 0 ? <Text style={[styles.routeArrow, { color: colors.inkTertiary }]}>→</Text> : null}
                  <View style={[styles.routeDot, { backgroundColor: STOPS[i]?.color ?? colors.accent }]} />
                  <Text style={[styles.routeCode, { color: colors.ink }]}>{code}</Text>
                </View>
              ))}
            </View>
          </View>

          {error ? <Text style={[type.body, styles.error, { color: colors.error }]}>{error}</Text> : null}

          {flights.length === 0 && !error ? (
            <Text style={[type.body, { color: colors.inkSecondary }]}>
              Add your first boarding pass with the + button.
            </Text>
          ) : null}

          {flights.map((flight) => (
            <BoardingPass
              key={flight.id}
              flight={flight}
              canDelete={flight.created_by === session?.user.id}
              onDelete={() => handleDelete(flight.id)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function BoardingPass({ flight, canDelete, onDelete }: { flight: Flight; canDelete: boolean; onDelete: () => void }) {
  const colors = useTheme();
  const legColor =
    stopForAirport(flight.arrival_airport)?.color ?? stopForAirport(flight.departure_airport)?.color ?? colors.accent;
  const legText = textShadeOf(legColor);

  const depDay = flight.departure_time ? wallClockDay(flight.departure_time) : null;
  const arrDay = flight.arrival_time ? wallClockDay(flight.arrival_time) : null;
  const dayShift = depDay && arrDay ? nightsBetween(depDay, arrDay) : 0;
  const carrier = [flight.airline, flight.flight_number].filter(Boolean).join(' · ');
  const route = `${flight.departure_airport ?? '—'} to ${flight.arrival_airport ?? '—'}`;

  return (
    <View
      style={styles.pass}
      testID="boarding-pass"
      accessible
      accessibilityLabel={`${carrier || 'Flight'}, ${route}${depDay ? `, ${formatMonthDay(depDay)}` : ''}`}
    >
      <View style={[styles.passClip, { backgroundColor: colors.card }]}>
        <View style={[styles.passStripe, { backgroundColor: legColor }]} />
        <View style={styles.passBody}>
          <View style={styles.passTop}>
            <Text style={[type.cardTitle, styles.carrier, { color: colors.ink }]} numberOfLines={1}>
              {carrier || 'Flight'}
            </Text>
            {depDay ? (
              <Text style={[type.caption, { color: legText }]}>
                {formatWeekday(depDay)}, {formatMonthDay(depDay)}
              </Text>
            ) : null}
            {canDelete ? (
              <Pressable accessibilityRole="button" onPress={onDelete} style={styles.iconHit} accessibilityLabel={`Delete flight ${route}`}>
                <Ionicons name="trash-outline" size={17} color={colors.inkTertiary} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.legs}>
            <View style={styles.end}>
              <Text style={[styles.code, { color: colors.ink }]}>{flight.departure_airport ?? '—'}</Text>
              <Text style={[type.caption, { color: colors.inkSecondary }]}>
                {flight.departure_time ? formatWallClockTime(flight.departure_time) : ' '}
              </Text>
              <Text style={[styles.place, { color: colors.inkTertiary }]} numberOfLines={1}>
                {airportName(flight.departure_airport) ?? ' '}
              </Text>
            </View>

            <View style={styles.path}>
              <View style={[styles.pathLine, { borderColor: `${legColor}88` }]} />
              <Ionicons name="airplane" size={18} color={legColor} style={styles.plane} />
              <View style={[styles.pathLine, { borderColor: `${legColor}88` }]} />
            </View>

            <View style={[styles.end, styles.endRight]}>
              <Text style={[styles.code, { color: colors.ink }]}>{flight.arrival_airport ?? '—'}</Text>
              <Text style={[type.caption, { color: colors.inkSecondary }]}>
                {flight.arrival_time ? formatWallClockTime(flight.arrival_time) : ' '}
                {dayShift > 0 ? <Text style={{ color: legText }}>{` +${dayShift}`}</Text> : null}
              </Text>
              <Text style={[styles.place, { color: colors.inkTertiary }]} numberOfLines={1}>
                {airportName(flight.arrival_airport) ?? ' '}
              </Text>
            </View>
          </View>

          {flight.confirmation_code ? (
            <>
              <View style={styles.perforation}>
                <View style={[styles.notch, { backgroundColor: colors.background }]} />
                <View style={[styles.perfLine, { borderColor: colors.border }]} />
                <View style={[styles.notch, { backgroundColor: colors.background }]} />
              </View>
              <View style={styles.passBottom}>
                <Text style={[type.caption, { color: colors.inkTertiary }]}>Confirmation</Text>
                <Text style={[styles.confirmation, { color: colors.ink }]} selectable>
                  {flight.confirmation_code}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 44×44 hit area around a 17pt icon, without moving the layout.
  iconHit: { width: 44, height: 44, margin: -13.5, alignItems: 'center', justifyContent: 'center' },
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    letterSpacing: -0.2,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 14,
  },
  summary: {
    borderRadius: 24,
    padding: 16,
    gap: 10,
    marginBottom: 12,
    boxShadow: shadow.card,
  },
  summaryTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.2,
  },
  routeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: 6,
  },
  routeStop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeArrow: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    marginHorizontal: 6,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  routeCode: {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 13,
    letterSpacing: 0.6,
  },
  error: {
    marginBottom: 4,
  },
  // Shadow on the outer view, clipping on the inner one: on iOS
  // overflow: 'hidden' would also clip the shadow. The clip trims the
  // stripe to the rounded corners and the notches to half-circles.
  pass: {
    borderRadius: 22,
    boxShadow: shadow.card,
  },
  passClip: {
    flexDirection: 'row',
    borderRadius: 22,
    overflow: 'hidden',
  },
  // Thin leg-colored edge, like the colored band on a printed pass.
  passStripe: {
    width: 6,
  },
  passBody: {
    flex: 1,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 16,
  },
  passTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  carrier: {
    flex: 1,
  },
  legs: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    gap: 8,
  },
  end: {
    width: 104,
    gap: 2,
  },
  endRight: {
    alignItems: 'flex-end',
  },
  code: {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: 1,
  },
  place: {
    fontFamily: fontFamily.body,
    fontSize: 11.5,
    lineHeight: 15,
  },
  path: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    gap: 6,
  },
  pathLine: {
    flex: 1,
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
  },
  plane: {
    marginTop: -1,
  },
  // Tear-off line: two half-circle notches centred on the card's edges.
  // Content starts 20px in (6 stripe + 14 padding) and ends 16px in, so
  // these margins put each 18px notch 9px past the edge.
  perforation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
    marginLeft: -29,
    marginRight: -25,
  },
  notch: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  perfLine: {
    flex: 1,
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    marginHorizontal: 8,
  },
  passBottom: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  confirmation: {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 15,
    letterSpacing: 1.5,
  },
});
