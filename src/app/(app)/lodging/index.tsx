import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { useAuth } from '../../../lib/AuthProvider';
import { formatMonthDay, nightsBetween } from '../../../lib/dates';
import { deleteStay, fetchLodging, type Stay } from '../../../lib/lodging';
import { STOPS, stopForCity, type Stop } from '../../../lib/places';
import { shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// A stay belongs to the leg its city names, else the leg its check-in
// falls in; anything else (a layover hotel, say) goes under "Elsewhere".
function stopForStay(stay: Stay): Stop | null {
  const byCity = stopForCity(stay.city);
  if (byCity) return byCity;
  const inDay = stay.check_in;
  if (!inDay) return null;
  return STOPS.find((s) => inDay >= s.checkIn && inDay < s.checkOut) ?? null;
}

// Apple Maps works in mainland China, where Google Maps doesn't.
function openInMaps(address: string) {
  const q = encodeURIComponent(address);
  const url =
    Platform.OS === 'web' || Platform.OS === 'android'
      ? `https://www.google.com/maps/search/?api=1&query=${q}`
      : `https://maps.apple.com/?q=${q}`;
  Linking.openURL(url).catch(() => {});
}

export default function LodgingList() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const { session } = useAuth();

  const [stays, setStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchLodging()
      .then(setStays)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleDelete(id: string) {
    try {
      await deleteStay(id);
      setStays((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  function addStay(stop?: Stop) {
    router.push(
      stop
        ? { pathname: '/(app)/lodging/new', params: { city: stop.city, checkIn: stop.checkIn, checkOut: stop.checkOut } }
        : '/(app)/lodging/new',
    );
  }

  const byStop = new Map<string, Stay[]>();
  const elsewhere: Stay[] = [];
  for (const stay of stays) {
    const stop = stopForStay(stay);
    if (stop) byStop.set(stop.key, [...(byStop.get(stop.key) ?? []), stay]);
    else elsewhere.push(stay);
  }
  const bookedLegs = STOPS.filter((s) => byStop.has(s.key)).length;

  const renderStay = (stay: Stay, color: string) => (
    <StayCard
      key={stay.id}
      stay={stay}
      color={color}
      canDelete={stay.created_by === session?.user.id}
      onDelete={() => handleDelete(stay.id)}
    />
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]}>Lodging</Text>
        <CircleButton icon="add" label="Add a stay" testID="lodging-add-button" onPress={() => addStay()} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.summary, { backgroundColor: colors.card }]}>
            <Text style={[styles.summaryTitle, { color: colors.ink }]}>Where we&apos;re staying</Text>
            <View style={styles.progressRow}>
              {STOPS.map((stop) => (
                <View
                  key={stop.key}
                  style={[
                    styles.progressPip,
                    byStop.has(stop.key)
                      ? { backgroundColor: stop.color }
                      : { borderColor: stop.color, borderWidth: 1.5 },
                  ]}
                />
              ))}
              <Text style={[type.caption, { color: colors.inkSecondary }]}>
                {bookedLegs} of {STOPS.length} cities booked
              </Text>
            </View>
          </View>

          {error ? <Text style={[type.body, { color: colors.error }]}>{error}</Text> : null}

          {STOPS.map((stop) => {
            const legStays = byStop.get(stop.key) ?? [];
            return (
              <View key={stop.key} style={styles.leg}>
                <View style={styles.legHeader}>
                  <Image source={stop.photo} style={styles.legPhoto} resizeMode="cover" />
                  <View style={styles.legText}>
                    <Text style={[styles.legCity, { color: colors.ink }]}>{stop.city}</Text>
                    <Text style={[type.caption, { color: stop.color }]}>
                      {stop.dates} · {nightsBetween(stop.checkIn, stop.checkOut)} nights
                    </Text>
                  </View>
                </View>
                {legStays.length > 0 ? (
                  legStays.map((stay) => renderStay(stay, stop.color))
                ) : (
                  <Pressable
                    onPress={() => addStay(stop)}
                    style={({ pressed }) => [
                      styles.emptyCard,
                      { borderColor: `${stop.color}66`, opacity: pressed ? 0.6 : 1 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Add a stay in ${stop.city}`}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={stop.color} />
                    <Text style={[type.bodyStrong, { color: colors.inkSecondary }]}>Add a stay in {stop.city}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}

          {elsewhere.length > 0 ? (
            <View style={styles.leg}>
              <Text style={[styles.legCity, styles.elsewhere, { color: colors.ink }]}>Elsewhere</Text>
              {elsewhere.map((stay) => renderStay(stay, colors.accent))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function StayCard({
  stay,
  color,
  canDelete,
  onDelete,
}: {
  stay: Stay;
  color: string;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const colors = useTheme();
  const nights = stay.check_in && stay.check_out ? nightsBetween(stay.check_in, stay.check_out) : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]} testID="stay-card">
      <View style={styles.cardTop}>
        <Text style={[type.cardTitle, styles.cardTitle, { color: colors.ink }]}>{stay.name}</Text>
        {canDelete ? (
          <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel={`Delete ${stay.name}`}>
            <Ionicons name="trash-outline" size={17} color={colors.inkTertiary} />
          </Pressable>
        ) : null}
      </View>
      {stay.check_in && stay.check_out ? (
        <Text style={[type.caption, { color }]}>
          {formatMonthDay(stay.check_in)} → {formatMonthDay(stay.check_out)}
          {nights != null ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}
        </Text>
      ) : null}

      {stay.address ? (
        <Pressable
          onPress={() => openInMaps(stay.address!)}
          style={styles.addressRow}
          accessibilityRole="link"
          accessibilityLabel={`Open ${stay.address} in Maps`}
        >
          <Ionicons name="location-outline" size={15} color={colors.highlight} />
          <Text style={[type.body, styles.address, { color: colors.highlight }]}>{stay.address}</Text>
        </Pressable>
      ) : null}

      {stay.confirmation_code ? (
        <View style={styles.confirmRow}>
          <Text style={[type.caption, { color: colors.inkTertiary }]}>Confirmation</Text>
          <Text style={[styles.confirmation, { color: colors.ink }]} selectable>
            {stay.confirmation_code}
          </Text>
        </View>
      ) : null}

      {stay.notes ? (
        <Text style={[type.body, styles.notes, { color: colors.inkSecondary }]}>{stay.notes}</Text>
      ) : null}
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
    paddingBottom: 14,
  },
  headerTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    letterSpacing: -0.2,
  },
  loading: {
    marginTop: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 22,
  },
  summary: {
    borderRadius: 24,
    padding: 16,
    gap: 10,
    boxShadow: shadow.card,
  },
  summaryTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  progressPip: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  leg: {
    gap: 10,
  },
  legHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  legText: {
    flex: 1,
    gap: 1,
  },
  legCity: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: -0.2,
  },
  elsewhere: {
    marginBottom: 2,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    gap: 4,
    boxShadow: shadow.card,
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
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
  },
  address: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  confirmation: {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 14,
    letterSpacing: 1.2,
  },
  notes: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
  },
});
