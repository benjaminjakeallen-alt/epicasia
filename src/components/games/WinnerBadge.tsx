import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { fontFamily } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

// The daily winner's trophy badge on a photo game's card. A soft sheen
// sweeps across it every few seconds (still under Reduce Motion).

export default function WinnerBadge({ label }: { label: string }) {
  const colors = useTheme();
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || !live) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(sweep, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(2600),
          Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      live = false;
      loop?.stop();
    };
  }, [sweep]);
  const x = sweep.interpolate({ inputRange: [0, 1], outputRange: [-60, 220] });
  return (
    <View style={[styles.badge, { backgroundColor: colors.winnerSoft }]} testID="winner-badge">
      <Animated.View
        pointerEvents="none"
        style={[styles.sheen, { backgroundColor: colors.halo, transform: [{ translateX: x }, { rotate: '18deg' }] }]}
      />
      <Ionicons name="trophy" size={16} color={colors.winnerInk} />
      <Text style={[styles.badgeText, { color: colors.winnerInk }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    overflow: 'hidden',
  },
  sheen: { position: 'absolute', top: -10, bottom: -10, width: 26 },
  badgeText: { fontFamily: fontFamily.bodySemiBold, fontSize: 14 },
});
