import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../components/CircleButton';
import SkyBackdrop from '../../components/SkyBackdrop';
import { useA11yMode, type SpeechRate } from '../../lib/a11yMode';
import { announce } from '../../lib/speech';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';

// Settings for the "large & spoken" accessibility mode. Everything on this
// screen is itself large (≥ 60pt rows, 18–20pt text) so it's usable by the
// people who need the mode.

const RATES: { value: SpeechRate; label: string }[] = [
  { value: 0.8, label: 'Slower' },
  { value: 1, label: 'Normal' },
  { value: 1.2, label: 'Faster' },
];

function ToggleRow({
  label,
  detail,
  value,
  onChange,
  testID,
}: {
  label: string;
  detail: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ checked: value }}
      aria-checked={value}
      onPress={() => onChange(!value)}
      testID={testID}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <View style={[styles.toggle, { backgroundColor: value ? c.accent : c.handle }]}>
        <View style={[styles.knob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </View>
    </Pressable>
  );
}

export default function AccessibilitySettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode, update } = useA11yMode();

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.headerTitle} accessibilityRole="header">
          Accessibility
        </Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <ToggleRow
          label="Large & spoken mode"
          detail="A bigger home menu with every label showing, items read aloud as you turn it, and no intro."
          value={mode.enabled}
          onChange={(enabled) => update({ enabled, offered: true })}
          testID="a11y-mode"
        />

        {mode.enabled ? (
          <>
            <ToggleRow
              label="Read menu items aloud"
              detail="When VoiceOver is on, VoiceOver reads them instead."
              value={mode.speak}
              onChange={(speak) => update({ speak })}
              testID="a11y-speak"
            />

            <Text style={styles.section} accessibilityRole="header">
              Speaking speed
            </Text>
            <View style={styles.rates} accessibilityRole="radiogroup">
              {RATES.map((r) => {
                const on = mode.rate === r.value;
                return (
                  <Pressable
                    key={r.label}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    onPress={() => {
                      update({ rate: r.value });
                      announce(`${r.label} speed`, { speak: mode.speak, rate: r.value });
                    }}
                    style={[styles.rate, { backgroundColor: on ? c.accent : c.card }]}
                  >
                    <Text style={[styles.rateText, { color: on ? c.onAccent : c.ink }]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                announce('Arrivals, 2 of 7. Visas, airports and your documents.', { speak: true, rate: mode.rate })
              }
              style={({ pressed }) => [styles.example, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
            >
              <Ionicons name="volume-high-outline" size={26} color={c.highlight} />
              <Text style={[styles.rowLabel, { color: c.highlight }]}>Hear an example</Text>
            </Pressable>
          </>
        ) : null}

        <Text style={styles.note}>
          Text in Epic Asia also follows your iPhone&apos;s text size (Settings › Accessibility › Display & Text
          Size › Larger Text).
        </Text>
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
    paddingBottom: 12,
  },
  headerTitle: { fontFamily: fontFamily.display, fontSize: 24, letterSpacing: -0.2, color: c.ink },
  spacer: { width: 44 },
  content: { paddingHorizontal: 20, gap: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 14,
    boxShadow: shadow.card,
  },
  rowText: { flex: 1, gap: 4 },
  rowLabel: { fontFamily: fontFamily.bodySemiBold, fontSize: 19, lineHeight: 24, color: c.ink },
  rowDetail: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 22, color: c.inkSecondary },
  toggle: { width: 60, height: 36, borderRadius: 18, padding: 3, justifyContent: 'center' },
  knob: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.card, boxShadow: shadow.card },
  section: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 28, color: c.ink, marginTop: 8 },
  rates: { flexDirection: 'row', gap: 10 },
  rate: {
    flex: 1,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.card,
  },
  rateText: { fontFamily: fontFamily.bodySemiBold, fontSize: 18 },
  example: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    borderRadius: 22,
    paddingHorizontal: 18,
    boxShadow: shadow.card,
  },
  note: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 23, color: c.inkSecondary, marginTop: 6 },
});
