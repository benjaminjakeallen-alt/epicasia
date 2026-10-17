import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { voteFeedback } from '../../lib/feedback';
import { fontFamily } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

// The upvote pill on the photo games' walls: an arrow and the count. Giving
// an upvote pops it (a quick spring) with a rising "pop" and a haptic tick.

const plural = (n: number) => `${n} ${n === 1 ? 'upvote' : 'upvotes'}`;

export default function VoteButton({
  count,
  voted,
  onToggle,
}: {
  count: number;
  voted: boolean;
  onToggle: () => void;
}) {
  const colors = useTheme();
  const pop = useRef(new Animated.Value(0)).current;
  function press() {
    if (!voted) {
      voteFeedback();
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start(() =>
        pop.setValue(0),
      );
    }
    onToggle();
  }
  const scale = pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.22, 1] });
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        testID="upvote"
        accessibilityRole="button"
        accessibilityState={{ selected: voted }}
        aria-pressed={voted}
        accessibilityLabel={voted ? `Remove your upvote, ${plural(count)}` : `Upvote, ${plural(count)}`}
        onPress={press}
        style={({ pressed }) => [
          styles.vote,
          {
            borderColor: voted ? colors.accent : colors.border,
            backgroundColor: voted ? colors.accent : pressed ? colors.accentSoft : colors.card,
          },
        ]}
      >
        <Ionicons name="arrow-up" size={18} color={voted ? colors.onAccent : colors.highlight} />
        <Text style={[styles.voteText, { color: voted ? colors.onAccent : colors.highlight }]}>{count}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  vote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 64,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
  },
  voteText: { fontFamily: fontFamily.bodySemiBold, fontSize: 16 },
});
