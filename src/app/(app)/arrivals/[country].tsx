import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BoardingPass from '../../../components/BoardingPass';
import CircleButton from '../../../components/CircleButton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { airportByCode, CHECKED, countryByKey, countryColor, PASSPORT, type Airport, type Link } from '../../../lib/arrivals';
import { fetchFlights, type Flight } from '../../../lib/flights';
import { peek } from '../../../lib/offline';
import { stopForAirport } from '../../../lib/places';
import { shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// One country's arrival guide: visa, forms, tips, each airport on the
// route (arriving / leaving steps, getting to the city, the official map),
// your flights through those airports, and the official sources.

export default function CountryGuide() {
  const { country: key } = useLocalSearchParams<{ country: string }>();
  const country = countryByKey(key ?? '');
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const [flights, setFlights] = useState<Flight[]>([]);

  useFocusEffect(
    useCallback(() => {
      peek<Flight[]>('flights').then((saved) => saved && setFlights((cur) => (cur.length ? cur : saved)));
      fetchFlights()
        .then(setFlights)
        .catch(() => {});
    }, []),
  );

  if (!country) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 10 }]}>
        <View style={styles.header}>
          <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        </View>
        <Text style={[type.body, styles.pad, { color: colors.inkSecondary }]}>That guide doesn’t exist.</Text>
      </View>
    );
  }

  const tint = countryColor(country.key);
  const mine = flights.filter((f) =>
    [f.departure_airport, f.arrival_airport].some((code) => {
      const leg = stopForAirport(code)?.key;
      return !!leg && country.legs.includes(leg);
    }),
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header">
          {country.name}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.entryBadge, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="id-card-outline" size={18} color={colors.highlight} />
            <Text style={[type.cardTitle, styles.flex, { color: colors.ink }]}>{country.entry}</Text>
          </View>
          <Heading text="Visa" />
          <Bullets items={country.visa} />
          <Heading text="Arrival forms" />
          <Bullets items={country.forms} />
          <Heading text="Good to know" />
          <Bullets items={country.tips} />
        </View>

        {country.airports.map((code) => {
          const airport = airportByCode(code);
          return airport ? <AirportCard key={code} airport={airport} tint={tint} /> : null;
        })}

        {mine.length ? (
          <>
            <Text style={[styles.section, { color: colors.ink }]} accessibilityRole="header">
              Your flights
            </Text>
            {mine.map((f) => (
              <BoardingPass key={f.id} flight={f} canDelete={false} onDelete={() => {}} />
            ))}
          </>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Heading text="Official sources" />
          {country.links.map((l) => (
            <ExternalLink key={l.url} link={l} />
          ))}
          <Text style={[type.caption, styles.mt8, { color: colors.inkSecondary }]}>
            Written for {PASSPORT}, last checked {CHECKED}. Re-check 4–6 weeks before you fly.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function AirportCard({ airport, tint }: { airport: Airport; tint: { fill: string; text: string } }) {
  const colors = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]} testID="airport-card">
      <View style={styles.airportTop}>
        <Text style={[styles.code, { color: tint.text }]}>{airport.code}</Text>
        <View style={styles.flex}>
          <Text style={[type.cardTitle, { color: colors.ink }]} accessibilityRole="header">
            {airport.name}
          </Text>
          <Text style={[type.body, { color: colors.inkSecondary }]}>
            {airport.city} · {airport.role}
          </Text>
        </View>
      </View>
      {airport.arrive ? (
        <>
          <Heading text="Arriving: gate to exit" />
          <Steps items={airport.arrive} color={tint.text} />
        </>
      ) : null}
      {airport.depart ? (
        <>
          <Heading text="Leaving" />
          <Steps items={airport.depart} color={tint.text} />
        </>
      ) : null}
      <Heading text={airport.arrive ? 'Into the city' : 'Getting there'} />
      <Bullets items={airport.toCity} />
      <ExternalLink link={airport.map} icon="map-outline" />
    </View>
  );
}

function Heading({ text }: { text: string }) {
  const colors = useTheme();
  return (
    <Text style={[styles.heading, { color: colors.ink }]} accessibilityRole="header">
      {text}
    </Text>
  );
}

function Bullets({ items }: { items: string[] }) {
  const colors = useTheme();
  return (
    <View style={styles.list}>
      {items.map((t) => (
        <View key={t} style={styles.bulletRow}>
          <View style={[styles.dot, { backgroundColor: colors.inkTertiary }]} />
          <Text style={[type.body, styles.flex, { color: colors.ink }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function Steps({ items, color }: { items: string[]; color: string }) {
  const colors = useTheme();
  return (
    <View style={styles.list}>
      {items.map((t, i) => (
        <View key={t} style={styles.bulletRow} accessible accessibilityLabel={`Step ${i + 1}. ${t}`}>
          <View style={[styles.stepNum, { backgroundColor: color }]}>
            <Text style={[styles.stepText, { color: colors.onAccent }]}>{i + 1}</Text>
          </View>
          <Text style={[type.body, styles.flex, { color: colors.ink }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function ExternalLink({ link, icon = 'open-outline' }: { link: Link; icon?: keyof typeof Ionicons.glyphMap }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={link.label}
      accessibilityHint="Opens the official website"
      onPress={() => Linking.openURL(link.url).catch(() => {})}
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={18} color={colors.highlight} />
      <Text style={[type.bodyStrong, styles.flex, { color: colors.highlight }]}>{link.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2 },
  headerSpacer: { width: 44 },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 14 },
  card: { borderRadius: 22, padding: 18, gap: 8, boxShadow: shadow.card },
  entryBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 12 },
  heading: { fontFamily: fontFamily.bodySemiBold, fontSize: 16, lineHeight: 22, marginTop: 10 },
  section: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 27, marginTop: 10 },
  list: { gap: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: fontFamily.monoSemiBold, fontSize: 12 },
  airportTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  code: { fontFamily: fontFamily.monoSemiBold, fontSize: 30, letterSpacing: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, marginTop: 4 },
  mt8: { marginTop: 8 },
});
