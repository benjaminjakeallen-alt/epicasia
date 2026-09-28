import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme/useTheme';

const HEIGHT = 360;

// Soft vermilion wash (with a faint gold counter-glow) pinned to the top of
// a screen, behind its content — the lacquer-lit header in the B+ palette.
// Render it as a screen's first child; it never takes touches.
export default function HeaderGlow() {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  return (
    <Svg width={width} height={HEIGHT} style={styles.glow}>
      <Defs>
        <RadialGradient id="hgRed" cx="12%" cy="0%" rx="80%" ry="90%">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={0.24} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="hgGold" cx="95%" cy="0%" rx="55%" ry="70%">
          <Stop offset="0" stopColor={colors.highlight} stopOpacity={0.1} />
          <Stop offset="1" stopColor={colors.highlight} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#hgRed)" />
      <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#hgGold)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none',
  },
});
