import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { CITIES, type CityKey } from '../../lib/weather';
import { fontFamily } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

// "All · Tokyo · Kyoto & Nara …": filters a photo game's wall by city. Only
// shown once the entries come from more than one city.

export default function CityChips({
  cities,
  value,
  onChange,
}: {
  cities: CityKey[];
  value: CityKey | null;
  onChange: (c: CityKey | null) => void;
}) {
  const colors = useTheme();
  if (cities.length < 2) return null;
  const chips: [CityKey | null, string][] = [
    [null, 'All'],
    ...cities.map((c) => [c, CITIES.find((x) => x.key === c)?.name ?? c] as [CityKey, string]),
  ];
  return (
    <ScrollView
      horizontal
      style={styles.strip}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID="city-chips"
    >
      {chips.map(([k, label]) => {
        const on = value === k;
        return (
          <Pressable
            key={k ?? 'all'}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            aria-pressed={on}
            onPress={() => onChange(k)}
            style={[
              styles.chip,
              { backgroundColor: on ? colors.accent : colors.card, borderColor: on ? colors.accent : colors.border },
            ]}
          >
            <Text style={[styles.text, { color: on ? colors.onAccent : colors.ink }]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { flexGrow: 0, flexShrink: 0 },
  row: { gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontFamily: fontFamily.bodySemiBold, fontSize: 15 },
});
