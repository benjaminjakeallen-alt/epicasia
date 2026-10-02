import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { countryColor } from '../../../lib/arrivals';
import {
  BUNDLED,
  convert,
  currency,
  formatMoney,
  HOME,
  LOCAL,
  loadRates,
  QUICK,
  savedHomeCurrency,
  savedRates,
  saveHomeCurrency,
  shortDate,
  type RateSet,
} from '../../../lib/currency';
import { todayDay } from '../../../lib/dates';
import { stopForDay } from '../../../lib/places';
import { shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// Currency converter: the trip's three currencies against your own, typed
// on a big built-in keypad (no keyboard), with a swap button and a table of
// everyday amounts. Works offline from the last saved rates.

const LEG_CURRENCY: Record<string, string> = { tokyo: 'JPY', kyoto: 'JPY', beijing: 'CNY', shanghai: 'CNY', hongKong: 'HKD' };
const MAX_INT = 9;

/** "12345.6" → "12,345.6" (keeps a trailing "." while typing). */
function groupInput(raw: string): string {
  const [int, dec] = raw.split('.');
  const grouped = (int || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec === undefined ? grouped : `${grouped}.${dec}`;
}

export default function CurrencyConverter() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();

  const [local, setLocal] = useState(() => LEG_CURRENCY[stopForDay(todayDay())?.key ?? ''] ?? 'JPY');
  const [home, setHome] = useState('USD');
  const [toHome, setToHome] = useState(true);
  const [input, setInput] = useState('1000');
  const [rates, setRates] = useState<RateSet>(BUNDLED);

  useEffect(() => {
    let live = false;
    savedHomeCurrency().then(setHome);
    savedRates().then((s) => {
      if (s && !live) setRates(s);
    });
    loadRates().then((r) => {
      live = true;
      setRates(r);
    });
  }, []);

  const from = toHome ? local : home;
  const to = toHome ? home : local;
  const fromC = currency(from);
  const amount = Number(input || '0');
  const result = convert(amount, from, to, rates.rates);
  const localInfo = LOCAL.find((l) => l.code === local)!;
  const tint = countryColor(localInfo.country);

  function press(key: string) {
    setInput((cur) => {
      if (key === 'del') return cur.slice(0, -1);
      if (key === '.') {
        if (fromC.decimals === 0 || cur.includes('.')) return cur;
        return (cur || '0') + '.';
      }
      const [int, dec] = cur.split('.');
      if (dec !== undefined) return dec.length >= fromC.decimals ? cur : cur + key;
      if ((int + key).replace(/^0+/, '').length > MAX_INT) return cur;
      const next = (cur === '0' ? '' : cur) + key;
      return next.replace(/^0+(?=\d)/, '');
    });
  }

  function swap() {
    // Keep the converted value as the new starting amount, rounded sensibly.
    const toC = currency(to);
    setInput(amount ? String(Number(result.toFixed(toC.decimals))) : '');
    setToHome((v) => !v);
  }

  function chooseLocal(code: string) {
    setLocal(code);
    if (toHome && currency(code).decimals === 0) setInput((cur) => cur.split('.')[0]);
  }

  function chooseHome(code: string) {
    setHome(code);
    saveHomeCurrency(code);
  }

  const status =
    rates.source === 'live'
      ? `Rates from ${shortDate(rates.date)}`
      : rates.source === 'saved'
        ? `Offline · using rates saved ${shortDate(rates.date)}`
        : `Approximate rates from ${shortDate(rates.date)} · connect once to update`;

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', fromC.decimals ? '.' : '00', '0', 'del'];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header">
          Currency
        </Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Trip currency">
          {LOCAL.map((l) => {
            const on = l.code === local;
            const t = countryColor(l.country);
            return (
              <Pressable
                key={l.code}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={`${l.place}, ${l.name}`}
                onPress={() => chooseLocal(l.code)}
                style={[styles.chip, { backgroundColor: on ? t.text : colors.card, borderColor: on ? t.text : colors.border }]}
              >
                <Text style={[styles.chipText, { color: on ? colors.onAccent : colors.ink }]}>{l.place}</Text>
                <Text style={[styles.chipCode, { color: on ? colors.onAccent : colors.inkSecondary }]}>{l.code}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.display, { backgroundColor: colors.card }]}>
          <View
            accessible
            accessibilityLabel={`${formatMoney(amount, from)} is ${formatMoney(result, to)}`}
            accessibilityLiveRegion="polite"
            testID="conversion"
          >
            <Text style={[type.caption, { color: colors.inkSecondary }]}>{currency(from).name}</Text>
            <Text style={[styles.amount, { color: colors.ink }]} numberOfLines={1} adjustsFontSizeToFit testID="amount-from">
              {fromC.symbol}
              {groupInput(input)}
            </Text>
            <View style={[styles.rule, { backgroundColor: colors.separator }]} />
            <Text style={[type.caption, { color: colors.inkSecondary }]}>{currency(to).name}</Text>
            <Text
              style={[styles.amount, styles.result, { color: toHome ? colors.highlight : tint.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              testID="amount-to"
            >
              {formatMoney(result, to)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Swap: convert ${currency(to).name} to ${currency(from).name}`}
            onPress={swap}
            testID="swap"
            style={({ pressed }) => [styles.swap, { backgroundColor: colors.accentSoft, opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="swap-vertical" size={24} color={colors.highlight} />
          </Pressable>
        </View>

        <View style={styles.keypad}>
          {keys.map((k) => (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? 'Delete' : k === '.' ? 'Decimal point' : k}
              accessibilityHint={k === 'del' ? 'Press and hold to clear' : undefined}
              onPress={() => (k === '00' ? (press('0'), press('0')) : press(k))}
              onLongPress={k === 'del' ? () => setInput('') : undefined}
              testID={`key-${k}`}
              style={({ pressed }) => [styles.key, { backgroundColor: pressed ? colors.surfacePressed : colors.card }]}
            >
              {k === 'del' ? (
                <Ionicons name="backspace-outline" size={26} color={colors.ink} />
              ) : (
                <Text style={[styles.keyText, { color: colors.ink }]}>{k}</Text>
              )}
            </Pressable>
          ))}
        </View>

        <Text style={[styles.section, { color: colors.ink }]} accessibilityRole="header">
          Quick prices
        </Text>
        <View style={[styles.table, { backgroundColor: colors.card }]}>
          {QUICK[local].map((n, i) => (
            <View
              key={n}
              style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
              accessible
              accessibilityLabel={`${formatMoney(n, local, { trimWhole: true })} is ${formatMoney(convert(n, local, home, rates.rates), home)}`}
            >
              <Text style={[styles.rowLocal, { color: tint.text }]}>{formatMoney(n, local, { trimWhole: true })}</Text>
              <Text style={[styles.rowHome, { color: colors.ink }]}>{formatMoney(convert(n, local, home, rates.rates), home)}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.section, { color: colors.ink }]} accessibilityRole="header">
          Your currency
        </Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Your currency">
          {HOME.map((h) => {
            const on = h.code === home;
            return (
              <Pressable
                key={h.code}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={h.name}
                onPress={() => chooseHome(h.code)}
                style={[styles.small, { backgroundColor: on ? colors.accent : colors.card, borderColor: on ? colors.accent : colors.border }]}
              >
                <Text style={[styles.chipCode, { color: on ? colors.onAccent : colors.ink }]}>{h.code}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[type.caption, styles.status, { color: colors.inkSecondary }]} testID="rates-status">
          {status}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL('https://www.exchangerate-api.com').catch(() => {})}
          style={styles.attribution}
        >
          <Text style={[type.caption, { color: colors.highlight }]}>Rates By Exchange Rate API</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2 },
  spacer: { width: 44 },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flex: 1, minHeight: 56, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  chipText: { fontFamily: fontFamily.bodySemiBold, fontSize: 15 },
  chipCode: { fontFamily: fontFamily.monoSemiBold, fontSize: 13, letterSpacing: 0.6 },
  small: { minWidth: 64, minHeight: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  display: { borderRadius: 24, padding: 20, paddingRight: 76, boxShadow: shadow.card },
  amount: { fontFamily: fontFamily.display, fontSize: 40, lineHeight: 48, letterSpacing: -0.5 },
  result: { fontFamily: fontFamily.displayMedium },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  swap: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -26,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  key: {
    flexBasis: '30%',
    flexGrow: 1,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.card,
  },
  keyText: { fontFamily: fontFamily.bodyMedium, fontSize: 26 },
  section: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 27, marginTop: 8 },
  table: { borderRadius: 22, paddingHorizontal: 18, boxShadow: shadow.card },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 },
  rowLocal: { fontFamily: fontFamily.bodySemiBold, fontSize: 17 },
  rowHome: { fontFamily: fontFamily.body, fontSize: 17 },
  status: { marginTop: 6 },
  attribution: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
