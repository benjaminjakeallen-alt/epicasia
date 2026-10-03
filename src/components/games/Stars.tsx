import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors as c } from '../../theme/colors';

/** A 1–5 star rating: read-only, or a radio group when `onChange` is set. */
export default function Stars({
  value,
  size = 18,
  onChange,
  labels,
}: {
  value: number;
  size?: number;
  onChange?: (n: number) => void;
  /** Spoken names for each star when picking ("1 star — no thanks"). */
  labels?: string[];
}) {
  if (!onChange) {
    return (
      <View style={styles.row} accessible accessibilityLabel={`Rated ${value} of 5`} testID="stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <Ionicons
            key={n}
            name={n <= value ? 'star' : 'star-outline'}
            size={size}
            color={n <= value ? c.winner : c.inkTertiary}
          />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Your rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        return (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={labels?.[n - 1] ?? `${n} star${n === 1 ? '' : 's'}`}
            accessibilityState={{ checked: n === value }}
            aria-checked={n === value}
            onPress={() => onChange(n)}
            style={styles.hit}
            testID={`rate-${n}`}
          >
            <Ionicons name={on ? 'star' : 'star-outline'} size={size} color={on ? c.winner : c.inkTertiary} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  hit: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
});
