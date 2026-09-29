import { useId } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme/useTheme';

// Soft morning sky pinned to the top of a screen: a pale blue-grey that
// fades into the paper background, with a few diffuse clouds. Render it as
// a screen's first child; it never takes touches.
export default function SkyBackdrop({ height = 440 }: { height?: number }) {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  // Gradient ids must be unique per instance: on web, stacked screens stay
  // in the DOM, and a url(#id) that resolves to a hidden screen's gradient
  // paints nothing.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fade = `skyFade${uid}`;
  const cloud = `cloud${uid}`;
  return (
    <Svg width={width} height={height} style={styles.sky}>
      <Defs>
        <LinearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.sky} stopOpacity={1} />
          <Stop offset="1" stopColor={colors.background} stopOpacity={1} />
        </LinearGradient>
        <RadialGradient id={cloud} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${fade})`} />
      <Ellipse cx={width * 0.18} cy={height * 0.16} rx={width * 0.42} ry={height * 0.12} fill={`url(#${cloud})`} />
      <Ellipse cx={width * 0.86} cy={height * 0.3} rx={width * 0.38} ry={height * 0.1} fill={`url(#${cloud})`} />
      <Ellipse cx={width * 0.5} cy={height * 0.58} rx={width * 0.6} ry={height * 0.12} fill={`url(#${cloud})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  sky: {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none',
  },
});
