import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { colors as c } from '../theme/colors';

/** Yuki's picture: a snowflake (雪, "snow") on sage. */
export default function YukiMark({ size = 32 }: { size?: number }) {
  return (
    <View
      style={[styles.mark, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name="snow" size={Math.round(size * 0.58)} color={c.onAccent} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
});
