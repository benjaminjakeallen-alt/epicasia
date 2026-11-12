import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OfflineNotice from '../../../components/OfflineNotice';
import CircleButton from '../../../components/CircleButton';
import { TimelineSkeleton } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { useAuth } from '../../../lib/AuthProvider';
import { confirm } from '../../../lib/confirm';
import { peek } from '../../../lib/offline';
import { formatMonthDay, formatWeekday, parseDay, todayDay } from '../../../lib/dates';
import { deleteItineraryItem, fetchItinerary, type ItineraryItem } from '../../../lib/itinerary';
import { photoForDay, STOPS } from '../../../lib/places';
import { legColorForCity, legTextForCity, shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ItineraryList() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const { session } = useAuth();

  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    // Show the saved copy at once (offline, or while the fresh one loads).
    peek<ItineraryItem[]>('itinerary').then((saved) => {
      if (saved) {
        setItems((cur) => (cur.length ? cur : saved));
        setLoading(false);
      }
    });
    fetchItinerary()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Refetch every time this screen regains focus (e.g. returning from the
  // add-item form), not just on first mount.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleDelete(item: ItineraryItem) {
    if (!(await confirm(`Remove “${item.title}”?`, 'It will be removed from the itinerary for everyone.'))) return;
    try {
      await deleteItineraryItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      setError('Couldn’t remove that. Try again.');
    }
  }

  const days = Array.from(new Set(items.map((i) => i.day))).sort();

  // During the trip the list opens on today (or the next day with plans), not back on day one.
  const today = todayDay();
  const openOn = days.length && today > days[0] && today <= days[days.length - 1] ? days.find((d) => d >= today) : undefined;
  const scroller = useRef<ScrollView>(null);
  const dayTops = useRef(new Map<string, number>());
  const jumped = useRef(false);
  const [laidOut, setLaidOut] = useState(0);
  useEffect(() => {
    if (jumped.current || !openOn) return;
    const top = dayTops.current.get(openOn);
    if (top === undefined) return;
    jumped.current = true;
    scroller.current?.scrollTo({ y: Math.max(0, top - 8), animated: false });
  }, [openOn, laidOut]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]}>Your Itinerary</Text>
        <CircleButton
          icon="add"
          label="Add to itinerary"
          testID="itinerary-add-button"
          onPress={() => router.push('/(app)/itinerary/new')}
        />
      </View>
      <OfflineNotice />

      {loading ? (
        <TimelineSkeleton />
      ) : (
        <ScrollView ref={scroller} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} testID="itinerary-scroll">
          <View style={[styles.summary, { backgroundColor: colors.card }]}>
            <View style={styles.summaryText}>
              <Text style={[styles.summaryTitle, { color: colors.ink }]}>Asia Disney Adventure</Text>
              <View style={styles.legRow}>
                {STOPS.map((stop) => (
                  <View key={stop.key} style={[styles.legPip, { backgroundColor: stop.color }]} />
                ))}
              </View>
            </View>
            <Image source={STOPS[1].photo} style={styles.summaryPhoto} resizeMode="cover" />
          </View>

          {error ? <Text style={[type.body, { color: colors.error }]}>{error}</Text> : null}

          {days.length === 0 && !error ? (
            <Text style={[type.body, { color: colors.inkSecondary }]}>
              No itinerary items yet — add the first one.
            </Text>
          ) : null}

          {days.map((day, dayIdx) => {
            const dayItems = items.filter((i) => i.day === day);
            const dayCity = dayItems.find((i) => i.city)?.city;
            const legColor = legColorForCity(dayCity) ?? colors.accent;
            // Text (and the white day number's circle) use the deeper, AA-safe shade.
            const legText = legTextForCity(dayCity) ?? colors.accent;
            const isLast = dayIdx === days.length - 1;
            return (
              <View
                key={day}
                style={styles.dayRow}
                onLayout={(e) => {
                  dayTops.current.set(day, e.nativeEvent.layout.y);
                  if (day === openOn && !jumped.current) setLaidOut((n) => n + 1);
                }}
                testID={day === today ? 'itinerary-today' : undefined}
              >
                <View style={styles.rail}>
                  <Text style={[styles.weekday, { color: day === today ? legText : colors.inkTertiary }, day === today && styles.todayLabel]}>
                    {day === today ? 'Today' : formatWeekday(day)}
                  </Text>
                  <View style={[styles.dayCircle, { backgroundColor: legText }]}>
                    <Text style={[styles.dayNum, { color: colors.onAccent }]}>{parseDay(day).getDate()}</Text>
                  </View>
                  {isLast ? null : <View style={[styles.railLine, { borderColor: `${legColor}66` }]} />}
                </View>

                <View style={styles.dayCards}>
                  {dayItems.map((item, idx) => {
                    const photo = idx === 0 ? photoForDay(item.title, item.city) : null;
                    return (
                      <View key={item.id} style={[styles.card, { backgroundColor: colors.card }]}>
                        <View style={styles.cardMain}>
                          <View style={styles.cardTop}>
                            <Text style={[type.cardTitle, styles.cardTitle, { color: colors.ink }]}>
                              {item.title}
                            </Text>
                            {item.created_by === session?.user.id ? (
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => handleDelete(item)}
                                style={styles.iconHit}
                                accessibilityLabel={`Delete ${item.title}`}
                              >
                                <Ionicons name="trash-outline" size={17} color={colors.inkTertiary} />
                              </Pressable>
                            ) : null}
                          </View>
                          <Text style={[type.caption, { color: legText }]}>
                            {formatMonthDay(day)}
                            {item.city ? ` · ${item.city}` : ''}
                            {item.start_time ? ` · ${formatTime(item.start_time)}` : ''}
                          </Text>
                          {item.description ? (
                            <Text style={[type.body, styles.description, { color: colors.inkSecondary }]}>
                              {item.description}
                            </Text>
                          ) : null}
                        </View>
                        {photo ? <Image source={photo} style={styles.thumb} resizeMode="cover" /> : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
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
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    padding: 16,
    gap: 14,
    marginBottom: 26,
    boxShadow: shadow.card,
  },
  summaryText: {
    flex: 1,
    gap: 6,
  },
  summaryTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.2,
  },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  legPip: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  summaryPhoto: {
    width: 96,
    height: 84,
    borderRadius: 18,
  },
  dayRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rail: {
    width: 38,
    alignItems: 'center',
  },
  weekday: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11,
    marginBottom: 4,
  },
  todayLabel: { fontFamily: fontFamily.bodySemiBold },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 14,
  },
  railLine: {
    flex: 1,
    width: 0,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    marginTop: 6,
    marginBottom: -4,
  },
  dayCards: {
    flex: 1,
    gap: 10,
    paddingTop: 16,
    paddingBottom: 22,
  },
  card: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 14,
    gap: 12,
    boxShadow: shadow.card,
  },
  cardMain: {
    flex: 1,
    gap: 3,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
  },
  description: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 14,
  },
});
