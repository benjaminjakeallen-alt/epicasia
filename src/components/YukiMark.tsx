import { StyleSheet, View } from 'react-native';
import { colors as c } from '../theme/colors';
import { BlossomArt } from './yuki/Blossom';

/** Yuki's small picture: her cherry blossom on a white disc. */
export default function YukiMark({ size = 32 }: { size?: number }) {
  return (
    <View
      style={[styles.mark, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <BlossomArt size={Math.round(size * 0.92)} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
});
