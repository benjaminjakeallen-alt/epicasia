import { useEffect, useId, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors as c, shadow } from '../../theme/colors';

export type BlossomMode = 'still' | 'idle' | 'listening' | 'thinking' | 'speaking';

// One petal pointing up from the centre (50, 50) of a 100×100 box, with the
// cherry blossom's notch at its tip.
const PETAL = 'M50 50 C35 43 26 26 36 13 Q43 7 50 15 Q57 7 64 13 C74 26 65 43 50 50 Z';
const STAMENS = Array.from({ length: 10 }, (_, i) => (i * 36 + 18) * (Math.PI / 180));

/** The cherry-blossom drawing itself (no animation). */
export function BlossomArt({ size }: { size: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`p${id}`} cx="50" cy="50" r="42" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={c.blossomPetalDeep} />
          <Stop offset="0.45" stopColor={c.blossomPetal} />
          <Stop offset="1" stopColor={c.blossomPetal} />
        </RadialGradient>
      </Defs>
      {[0, 72, 144, 216, 288].map((a) => (
        <G key={a} transform={`rotate(${a} 50 50)`}>
          <Path d={PETAL} fill={`url(#p${id})`} />
          <Path d="M50 46 L50 22" stroke={c.blossomVein} strokeWidth={1} strokeLinecap="round" />
        </G>
      ))}
      {STAMENS.map((a) => {
        const x = 50 + Math.cos(a) * 13;
        const y = 50 + Math.sin(a) * 13;
        return (
          <G key={a}>
            <Line x1={50} y1={50} x2={x} y2={y} stroke={c.blossomHeart} strokeWidth={0.9} />
            <Circle cx={x} cy={y} r={1.7} fill={c.blossomPollen} />
          </G>
        );
      })}
      <Circle cx={50} cy={50} r={5.5} fill={c.blossomHeart} />
    </Svg>
  );
}

/**
 * Yuki's cherry blossom. It breathes while she listens, turns while she
 * thinks, and glows — brightening with each spoken word (`pulse`) — while she
 * speaks. Under Reduce Motion it stays still and only the glow changes.
 */
export default function Blossom({
  size,
  mode = 'still',
  pulse,
}: {
  size: number;
  mode?: BlossomMode;
  /** Subscribe to word boundaries; returns an unsubscribe. */
  pulse?: (onWord: () => void) => () => void;
}) {
  const glow = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const reduce = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => (reduce.current = r))
      .catch(() => {});
  }, []);

  // Glow level and motion per mode.
  useEffect(() => {
    const level = { still: 0, idle: 0.25, listening: 0.6, thinking: 0.45, speaking: 0.75 }[mode];
    Animated.timing(glow, { toValue: level, duration: 300, useNativeDriver: true }).start();
    if (mode === 'still' || reduce.current) return;
    const loops: Animated.CompositeAnimation[] = [];
    loops.push(
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, {
            toValue: 1,
            duration: mode === 'listening' ? 900 : 1600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(breathe, {
            toValue: 0,
            duration: mode === 'listening' ? 900 : 1600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    if (mode === 'thinking' || mode === 'speaking') {
      spin.setValue(0);
      loops.push(
        Animated.loop(
          Animated.timing(spin, {
            toValue: 1,
            duration: mode === 'thinking' ? 6000 : 24000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ),
      );
    }
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [mode, glow, breathe, spin]);

  // Each spoken word flares the glow, then it settles back.
  useEffect(() => {
    if (!pulse || mode !== 'speaking') return;
    return pulse(() => {
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.7, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    });
  }, [pulse, mode, glow]);

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.04] });
  const haloScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.12] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="yuki-blossom"
    >
      <Animated.View
        style={[
          styles.halo,
          {
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: size,
            opacity: glow,
            transform: [{ scale: haloScale }],
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale }, { rotate }] }}>
        <BlossomArt size={size} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { position: 'absolute', backgroundColor: c.blossomGlow, boxShadow: shadow.blossom },
});
