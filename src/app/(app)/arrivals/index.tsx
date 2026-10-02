import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BoardingPass from '../../../components/BoardingPass';
import CircleButton from '../../../components/CircleButton';
import OfflineNotice from '../../../components/OfflineNotice';
import { PassSkeleton } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { useAuth } from '../../../lib/AuthProvider';
import { CHECKED, CHECKLIST, COUNTRIES, countryColor, PASSPORT } from '../../../lib/arrivals';
import { deleteFlight, fetchFlights, type Flight } from '../../../lib/flights';
import { peek } from '../../../lib/offline';
import { shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// Arrivals: getting into each country — visas, arrival forms, airport
// walk-throughs — plus your boarding passes, your private documents and a
// before-you-go checklist. The guides are bundled, so they work offline.

const CHECKS_KEY = 'epicasia.arrivalsChecklist';

export default function Arrivals() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const { session } = useAuth();

  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    setError(null);
    // Show the saved copy at once (offline, or while the fresh one loads).
    peek<Flight[]>('flights').then((saved) => {
      if (saved) {
        setFlights((cur) => (cur.length ? cur : saved));
        setLoading(false);
      }
    });
    fetchFlights()
      .then(setFlights)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    AsyncStorage.getItem(CHECKS_KEY)
      .then((raw) => raw && setDone(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  function toggle(id: string) {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      AsyncStorage.setItem(CHECKS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  async function handleDelete(id: string) {
    try {
      await deleteFlight(id);
      setFlights((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  const ticked = CHECKLIST.filter((i) => done[i.id]).length;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header">
          Arrivals
        </Text>
        <CircleButton
          icon="add"
          label="Add a flight"
          testID="flights-add-button"
          onPress={() => router.push('/(app)/flights/new')}
        />
      </View>
      <OfflineNotice />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {COUNTRIES.map((country) => {
          const tint = countryColor(country.key);
          return (
            <Pressable
              key={country.key}
              testID="country-card"
              accessibilityRole="button"
              accessibilityLabel={`${country.name}, ${country.dates}. ${country.entry}`}
              accessibilityHint="Opens the visa, arrival and airport guide"
              onPress={() => router.push({ pathname: '/(app)/arrivals/[country]', params: { country: country.key } })}
              style={({ pressed }) => [styles.card, { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={[styles.stripe, { backgroundColor: tint.fill }]} />
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text style={[styles.countryName, { color: colors.ink }]}>{country.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.inkTertiary} />
                </View>
                <Text style={[type.caption, { color: tint.text }]}>
                  {country.dates} · {country.airports.join(' · ')}
                </Text>
                <Text style={[type.body, { color: colors.inkSecondary }]}>{country.entry}</Text>
              </View>
            </Pressable>
          );
        })}

        <Pressable
          testID="documents-card"
          accessibilityRole="button"
          accessibilityLabel="My documents. Passport, visa, insurance and QR codes, private to you"
          onPress={() => router.push('/(app)/arrivals/documents')}
          style={({ pressed }) => [styles.card, styles.docsCard, { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={[styles.docsIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="wallet-outline" size={24} color={colors.highlight} />
          </View>
          <View style={styles.flex}>
            <Text style={[type.cardTitle, { color: colors.ink }]}>My documents</Text>
            <Text style={[type.body, { color: colors.inkSecondary }]}>Passport, visa, insurance, QR codes · only you</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.inkTertiary} />
        </Pressable>

        <Text style={[styles.section, { color: colors.ink }]} accessibilityRole="header">
          Before you go
        </Text>
        <View style={[styles.checklist, { backgroundColor: colors.card }]}>
          <Text style={[type.caption, { color: colors.inkSecondary }]}>
            {ticked} of {CHECKLIST.length} done
          </Text>
          {CHECKLIST.map((item) => {
            const on = !!done[item.id];
            return (
              <Pressable
                key={item.id}
                testID="checklist-item"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={item.text}
                onPress={() => toggle(item.id)}
                style={styles.checkRow}
              >
                <View
                  style={[
                    styles.box,
                    { borderColor: on ? colors.accent : colors.inkTertiary, backgroundColor: on ? colors.accent : 'transparent' },
                  ]}
                >
                  {on ? <Ionicons name="checkmark" size={16} color={colors.onAccent} /> : null}
                </View>
                <Text style={[type.body, styles.flex, { color: on ? colors.inkSecondary : colors.ink }]}>{item.text}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.section, { color: colors.ink }]} accessibilityRole="header">
          Your flights
        </Text>
        {error ? <Text style={[type.body, { color: colors.error }]}>{error}</Text> : null}
        {loading ? (
          <View style={styles.bleed}>
            <PassSkeleton />
          </View>
        ) : flights.length === 0 && !error ? (
          <Text style={[type.body, { color: colors.inkSecondary }]}>Add your boarding passes with the + button.</Text>
        ) : (
          flights.map((flight) => (
            <BoardingPass
              key={flight.id}
              flight={flight}
              canDelete={flight.created_by === session?.user.id}
              onDelete={() => handleDelete(flight.id)}
            />
          ))
        )}

        <Text style={[type.caption, styles.note, { color: colors.inkSecondary }]}>
          Entry rules are for {PASSPORT}, last checked {CHECKED}. Rules change: check the official links in each guide
          before you fly.
        </Text>
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
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2 },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 14 },
  card: { flexDirection: 'row', borderRadius: 22, overflow: 'hidden', boxShadow: shadow.card },
  stripe: { width: 6 },
  cardBody: { flex: 1, padding: 16, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countryName: { fontFamily: fontFamily.display, fontSize: 24, lineHeight: 29, letterSpacing: -0.2 },
  docsCard: { alignItems: 'center', gap: 14, padding: 16 },
  docsIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  section: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 27, marginTop: 10 },
  checklist: { borderRadius: 22, padding: 16, gap: 4, boxShadow: shadow.card },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  note: { marginTop: 8 },
  bleed: { marginHorizontal: -20 },
});
