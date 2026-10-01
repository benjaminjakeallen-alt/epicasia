import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';

// "Sarah is typing…" with three dots that breathe in turn. Only mounted
// while someone is actually typing, so the loop is functional status, not
// decoration; reduce-motion gets static dots.
export default function TypingIndicator({ label }: { label: string }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
      );
      loop.start();
    });
    AccessibilityInfo.announceForAccessibility?.(label);
    return () => loop?.stop();
  }, [t, label]);

  const dot = (i: number) => {
    const start = i * 0.18;
    return {
      opacity: t.interpolate({
        inputRange: [0, start, start + 0.2, start + 0.4, 1],
        outputRange: [0.35, 0.35, 1, 0.35, 0.35],
        extrapolate: 'clamp',
      }),
      transform: [
        {
          translateY: t.interpolate({
            inputRange: [0, start, start + 0.2, start + 0.4, 1],
            outputRange: [0, 0, -2.5, 0, 0],
            extrapolate: 'clamp',
          }),
        },
      ],
    };
  };

  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <View style={styles.bubble}>
        {[0, 1, 2].map((i) => (
          <Animated.View key={i} style={[styles.dot, dot(i)]} />
        ))}
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
  bubble: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: c.card,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 9,
    boxShadow: shadow.card,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.inkTertiary,
  },
  label: {
    fontFamily: fontFamily.body,
    fontSize: 12.5,
    color: c.inkSecondary,
  },
});
