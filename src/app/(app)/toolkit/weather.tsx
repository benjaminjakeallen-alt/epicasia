import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import { Bone } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { todayDay } from '../../../lib/dates';
import { savedLabel } from '../../../lib/offline';
import { stopForDay } from '../../../lib/places';
import {
  CITIES,
  condition,
  loadForecast,
  savedForecast,
  savedUnit,
  saveUnit,
  temp,
  weekday,
  type Forecast,
  type Unit,
} from '../../../lib/weather';
import { legColors, legTextColors, shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// Weather for every city on the route: now, the next 7 days, and what June
// is usually like. During the trip, today's city comes first. Works
// offline from the last saved forecast.

export default function Weather() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const [unit, setUnit] = useState<Unit>('F');
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = false;
    savedUnit().then(setUnit);
    savedForecast().then((s) => {
      if (s && !live) {
        setForecast(s);
        setLoading(false);
      }
    });
    loadForecast().then((f) => {
      live = true;
      if (f) setForecast(f);
      setLoading(false);
    });
  }, []);

  function chooseUnit(u: Unit) {
    setUnit(u);
    saveUnit(u);
  }

  const here = stopForDay(todayDay())?.key;
  const cities = here ? [...CITIES].sort((a, b) => (a.key === here ? -1 : b.key === here ? 1 : 0)) : CITIES;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header">
          Weather
        </Text>
        <View style={[styles.units, { backgroundColor: colors.card }]} accessibilityRole="radiogroup" accessibilityLabel="Temperature unit">
          {(['F', 'C'] as Unit[]).map((u) => {
            const on = unit === u;
            return (
              <Pressable
                key={u}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={u === 'F' ? 'Fahrenheit' : 'Celsius'}
                onPress={() => chooseUnit(u)}
                style={[styles.unit, on && { backgroundColor: colors.accent }]}
              >
                <Text style={[styles.unitText, { color: on ? colors.onAccent : colors.ink }]}>°{u}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {forecast?.source === 'saved' ? (
          <View style={[styles.notice, { backgroundColor: colors.warningSoft }]} accessibilityRole="alert" testID="weather-offline">
            <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
            <Text style={[type.body, styles.flex, { color: colors.ink }]}>
              Offline · forecast saved {savedLabel(forecast.fetchedAt)}
            </Text>
          </View>
        ) : null}
        {!loading && !forecast ? (
          <Text style={[type.body, { color: colors.inkSecondary }]} testID="weather-none">
            The forecast needs a connection the first time. Typical June weather is below.
          </Text>
        ) : null}

        {cities.map((city) => {
          const w = forecast?.cities[city.key];
          const now = w?.now;
          const cond = now ? condition(now.code) : null;
          return (
            <View key={city.key} style={[styles.card, { backgroundColor: colors.card }]} testID="weather-city">
              <View style={[styles.stripe, { backgroundColor: legColors[city.key] }]} />
              <View style={styles.body}>
                <View style={styles.top}>
                  <View style={styles.flex}>
                    <Text style={[styles.city, { color: colors.ink }]} accessibilityRole="header">
                      {city.name}
                    </Text>
                    {city.key === here ? (
                      <Text style={[type.caption, { color: legTextColors[city.key] }]}>You’re here today</Text>
                    ) : null}
                  </View>
                  {loading && !w ? (
                    <Bone width={90} height={40} />
                  ) : now && cond ? (
                    <View style={styles.now} accessible accessibilityLabel={`Now ${temp(now.temp, unit)}, ${cond.label}`}>
                      <Ionicons name={cond.icon as keyof typeof Ionicons.glyphMap} size={30} color={colors.ink} />
                      <View>
                        <Text style={[styles.nowTemp, { color: colors.ink }]} testID="now-temp">
                          {temp(now.temp, unit)}
                        </Text>
                        <Text style={[type.caption, { color: colors.inkSecondary }]}>{cond.label}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                {w?.days.length ? (
                  <View style={styles.days}>
                    {w.days.map((d) => {
                      const dc = condition(d.code);
                      return (
                        <View
                          key={d.day}
                          style={styles.day}
                          accessible
                          accessibilityLabel={`${weekday(d.day)}: ${dc.label}, high ${temp(d.hi, unit)}, low ${temp(d.lo, unit)}${d.rain != null ? `, ${d.rain}% chance of rain` : ''}`}
                        >
                          <Text style={[type.caption, { color: colors.inkSecondary }]}>{weekday(d.day)}</Text>
                          <Ionicons name={dc.icon as keyof typeof Ionicons.glyphMap} size={22} color={colors.ink} />
                          <Text style={[styles.hi, { color: colors.ink }]}>{temp(d.hi, unit)}</Text>
                          <Text style={[type.caption, { color: colors.inkSecondary }]}>{temp(d.lo, unit)}</Text>
                          {d.rain != null ? (
                            <Text style={[type.caption, { color: colors.info }]}>{d.rain}%</Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                <View style={[styles.june, { backgroundColor: colors.cardRaised }]} testID="june">
                  <Text style={[type.bodyStrong, { color: colors.ink }]}>
                    Typical in June: {temp(city.june.hi, unit)} / {temp(city.june.lo, unit)}
                  </Text>
                  <Text style={[type.body, { color: colors.inkSecondary }]}>{city.june.note}</Text>
                </View>
              </View>
            </View>
          );
        })}
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL('https://open-meteo.com').catch(() => {})}
          style={styles.credit}
        >
          <Text style={[type.caption, { color: colors.highlight }]}>Forecast by Open-Meteo.com</Text>
        </Pressable>
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
  units: { flexDirection: 'row', borderRadius: 22, padding: 2, boxShadow: shadow.card },
  unit: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  unitText: { fontFamily: fontFamily.bodySemiBold, fontSize: 15 },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 14 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14 },
  card: { flexDirection: 'row', borderRadius: 22, overflow: 'hidden', boxShadow: shadow.card },
  stripe: { width: 6 },
  body: { flex: 1, padding: 16, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  city: { fontFamily: fontFamily.display, fontSize: 24, lineHeight: 29 },
  now: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nowTemp: { fontFamily: fontFamily.displayMedium, fontSize: 34, lineHeight: 38 },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { flex: 1, alignItems: 'center', gap: 3 },
  credit: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  hi: { fontFamily: fontFamily.bodySemiBold, fontSize: 15 },
  june: { borderRadius: 14, padding: 12, gap: 2 },
});
