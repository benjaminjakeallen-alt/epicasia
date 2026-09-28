import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../lib/AuthProvider';
import { deleteItineraryItem, fetchItinerary, type ItineraryItem } from '../../../lib/itinerary';
import { type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// "2027-06-06" -> a local Date at midnight. Deliberately not `new
// Date(dayString)` — that parses as UTC midnight, which shifts to the
// previous day once formatted in a negative-UTC-offset timezone (all of
// the Americas).
function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDayHeader(day: string): string {
  return parseDay(day)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase();
}

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

  async function handleDelete(id: string) {
    try {
      await deleteItineraryItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  const days = Array.from(new Set(items.map((i) => i.day))).sort();

  return (
    <View style={[styles.screen, { backgroundColor: colors.groupedBackground }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={[type.title, { color: colors.ink }]}>Itinerary</Text>
        <Pressable
          testID="itinerary-add-button"
          onPress={() => router.push('/(app)/itinerary/new')}
          hitSlop={12}
        >
          <Ionicons name="add" size={26} color={colors.accent} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={[type.body, { color: colors.error }]}>{error}</Text> : null}

          {days.length === 0 && !error ? (
            <Text style={[type.body, { color: colors.inkSecondary }]}>
              No itinerary items yet — add the first one.
            </Text>
          ) : null}

          {days.map((day) => (
            <View key={day} style={styles.dayGroup}>
              <Text style={[type.caption, styles.dayHeader, { color: colors.accent }]}>
                {formatDayHeader(day)}
              </Text>
              <View
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                {items
                  .filter((i) => i.day === day)
                  .map((item, idx, arr) => (
                    <View
                      key={item.id}
                      style={[
                        styles.row,
                        idx < arr.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.separator,
                        },
                      ]}
                    >
                      <View style={styles.rowMain}>
                        <View style={styles.rowTop}>
                          <Text style={[type.body, styles.rowTitle, { color: colors.ink }]}>
                            {item.title}
                          </Text>
                          {item.start_time ? (
                            <Text style={[type.caption, { color: colors.inkTertiary }]}>
                              {formatTime(item.start_time)}
                            </Text>
                          ) : null}
                        </View>
                        {item.city ? (
                          <Text style={[type.subtitle, { color: colors.inkSecondary }]}>
                            {item.city}
                          </Text>
                        ) : null}
                        {item.description ? (
                          <Text style={[type.subtitle, styles.description, { color: colors.inkSecondary }]}>
                            {item.description}
                          </Text>
                        ) : null}
                      </View>
                      {item.created_by === session?.user.id ? (
                        <Pressable onPress={() => handleDelete(item.id)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={18} color={colors.inkTertiary} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  loading: {
    marginTop: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  dayGroup: {
    marginBottom: 24,
  },
  dayHeader: {
    marginBottom: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowMain: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  rowTitle: {
    flex: 1,
  },
  description: {
    marginTop: 4,
  },
});
