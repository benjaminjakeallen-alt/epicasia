import { StyleSheet, Text, View } from 'react-native';
import { fontFamily } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import Seal from './Seal';

// "Epic *Asia*" + 旅 seal. The one brand lockup — used by the intro hero,
// login, and home header so it can't drift between them.
export default function Wordmark({ size, testID }: { size: number; testID?: string }) {
  const colors = useTheme();
  return (
    <View style={[styles.row, { gap: Math.round(size * 0.26) }]}>
      <Text
        testID={testID}
        style={{
          fontFamily: fontFamily.display,
          fontSize: size,
          lineHeight: Math.round(size * 1.1),
          letterSpacing: -size * 0.012,
          color: colors.ink,
        }}
      >
        Epic <Text style={{ fontFamily: fontFamily.displayItalic, color: colors.highlight }}>Asia</Text>
      </Text>
      <Seal size={Math.round(size * 0.68)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
