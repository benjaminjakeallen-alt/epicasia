import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { colors as c, shadow } from '../../theme/colors';

export type BlossomMode = 'still' | 'idle' | 'listening' | 'thinking' | 'speaking';

// Yuki's blossom is a generated 3D miniature in the menu icons' style
// (pale sakura petals, rose heart, gold stamens, two sage leaves; prompt in
// tools/menu-icons/README.md), seen face-on so it can turn in place.
const BLOSSOM = require('../../../assets/images/yuki/blossom.png');

/** The cherry blossom picture itself (no animation). */
export function BlossomArt({ size }: { size: number }) {
  return <Image source={BLOSSOM} style={{ width: size, height: size }} contentFit="contain" accessibilityLabel="" />;
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
