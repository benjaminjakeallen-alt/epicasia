import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import { colors as c, shadow } from '../theme/colors';

// Skeleton loaders: grey shapes in the layout of the content that's coming,
// so the screen doesn't jump when it arrives (no spinners). All blocks in
// one skeleton share a single soft pulse; with Reduce Motion they're still.
// The whole skeleton is one "Loading" element for screen readers.

const Pulse = createContext<Animated.Value | null>(null);

function SkeletonRoot({ children, label = 'Loading', style }: { children: ReactNode; label?: string; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [v]);
  return (
    <Pulse.Provider value={v}>
      <View
        style={style}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityState={{ busy: true }}
        testID="skeleton"
      >
        {children}
      </View>
    </Pulse.Provider>
  );
}

export function Bone({
  width = '100%',
  height = 14,
  radius = 7,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: ViewStyle;
}) {
  const v = useContext(Pulse);
  const opacity = v ? v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) : 1;
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: c.skeleton, opacity }, style]} />;
}

/** Itinerary: timeline rail + cards. */
export function TimelineSkeleton() {
  return (
    <SkeletonRoot label="Loading itinerary" style={styles.pad}>
      <View style={[styles.card, styles.summary]}>
        <View style={styles.flex}>
          <Bone width="70%" height={22} />
          <Bone width="40%" height={10} style={styles.mt10} />
        </View>
        <Bone width={96} height={84} radius={18} />
      </View>
      {[0, 1, 2].map((d) => (
        <View key={d} style={styles.dayRow}>
          <View style={styles.rail}>
            <Bone width={24} height={10} />
            <Bone width={34} height={34} radius={17} style={styles.mt6} />
          </View>
          <View style={[styles.flex, styles.dayCards]}>
            {[0, 1].map((k) => (
              <View key={k} style={[styles.card, styles.row]}>
                <View style={styles.flex}>
                  <Bone width="75%" height={16} />
                  <Bone width="45%" height={11} style={styles.mt8} />
                  <Bone width="90%" height={11} style={styles.mt10} />
                </View>
                {k === 0 ? <Bone width={64} height={64} radius={14} /> : null}
              </View>
            ))}
          </View>
        </View>
      ))}
    </SkeletonRoot>
  );
}

/** Flights: boarding passes. */
export function PassSkeleton() {
  return (
    <SkeletonRoot label="Loading flights" style={styles.pad}>
      <View style={[styles.card, styles.mb14]}>
        <Bone width="45%" height={22} />
        <Bone width="85%" height={13} style={styles.mt10} />
      </View>
      {[0, 1].map((k) => (
        <View key={k} style={[styles.card, styles.mb14]}>
          <View style={styles.spread}>
            <Bone width="40%" height={16} />
            <Bone width="25%" height={12} />
          </View>
          <View style={[styles.spread, styles.mt14]}>
            <View>
              <Bone width={84} height={32} />
              <Bone width={64} height={11} style={styles.mt8} />
            </View>
            <Bone width={70} height={2} />
            <View style={styles.end}>
              <Bone width={84} height={32} />
              <Bone width={64} height={11} style={styles.mt8} />
            </View>
          </View>
        </View>
      ))}
    </SkeletonRoot>
  );
}

/** Chat: bubbles on both sides. */
export function ChatSkeleton() {
  const rows: { mine: boolean; w: DimensionValue; h: number }[] = [
    { mine: false, w: '62%', h: 40 },
    { mine: false, w: '44%', h: 40 },
    { mine: true, w: '55%', h: 40 },
    { mine: false, w: '70%', h: 62 },
    { mine: true, w: '38%', h: 40 },
    { mine: true, w: '58%', h: 150 },
  ];
  return (
    <SkeletonRoot label="Loading messages" style={styles.chat}>
      {rows.map((r, i) => (
        <View key={i} style={[styles.bubbleRow, r.mine ? styles.end : null]}>
          {!r.mine ? <Bone width={30} height={30} radius={15} style={styles.mr8} /> : null}
          <Bone width={r.w} height={r.h} radius={20} />
        </View>
      ))}
    </SkeletonRoot>
  );
}

/** Photos: day-grouped square grid. */
export function GridSkeleton({ cell, gap, pad }: { cell: number; gap: number; pad: number }) {
  return (
    <SkeletonRoot label="Loading photos" style={{ paddingHorizontal: pad }}>
      {[3, 2].map((rows, s) => (
        <View key={s}>
          <Bone width={110} height={20} style={styles.sectionHead} />
          {Array.from({ length: rows }).map((_, r) => (
            <View key={r} style={{ flexDirection: 'row', gap, marginBottom: gap }}>
              {[0, 1, 2].map((k) => (
                <Bone key={k} width={cell} height={cell} radius={6} />
              ))}
            </View>
          ))}
        </View>
      ))}
    </SkeletonRoot>
  );
}

/** Journal: day labels + entry cards with a photo strip. */
export function JournalSkeleton() {
  return (
    <SkeletonRoot label="Loading journal" style={styles.pad}>
      {[0, 1].map((d) => (
        <View key={d} style={styles.mb14}>
          <Bone width={120} height={14} style={styles.sectionHead} />
          <View style={styles.card}>
            {d === 0 ? (
              <View style={[styles.row, styles.mb14]}>
                {[0, 1, 2].map((k) => (
                  <Bone key={k} width={84} height={84} radius={14} />
                ))}
              </View>
            ) : null}
            <Bone width="60%" height={20} />
            <Bone width="95%" height={12} style={styles.mt10} />
            <Bone width="80%" height={12} style={styles.mt8} />
          </View>
        </View>
      ))}
    </SkeletonRoot>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  flex: { flex: 1 },
  card: { backgroundColor: c.card, borderRadius: 20, padding: 16, boxShadow: shadow.card },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 26 },
  row: { flexDirection: 'row', gap: 12 },
  dayRow: { flexDirection: 'row', gap: 12 },
  rail: { width: 38, alignItems: 'center' },
  dayCards: { gap: 10, paddingTop: 16, paddingBottom: 22 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  end: { alignItems: 'flex-end', justifyContent: 'flex-end' },
  chat: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end' },
  sectionHead: { marginTop: 14, marginBottom: 10 },
  mt6: { marginTop: 6 },
  mt8: { marginTop: 8 },
  mt10: { marginTop: 10 },
  mt14: { marginTop: 14 },
  mb14: { marginBottom: 14 },
  mr8: { marginRight: 8 },
});
