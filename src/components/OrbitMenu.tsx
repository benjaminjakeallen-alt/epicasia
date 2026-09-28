import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Svg from 'react-native-svg';
import { type } from '../theme/typography';
import { useTheme } from '../theme/useTheme';
import OrbitDial from './OrbitDial';

export type OrbitMenuItem = {
  key: string;
  label: string;
  caption: string;
  color: string;
  Icon: ComponentType<{ color: string; size: number }>;
  /** Omitted = not built yet; the item still sits on the ring but can't open. */
  href?: string;
};

const TAU = Math.PI * 2;
const SAMPLES_PER_ITEM = 16;
const BADGE = 82;
const READOUT = 150;

const mod = (n: number, m: number) => ((n % m) + m) % m;

// The launch sequence's 360° ring, as the home menu: swipe left/right to
// turn it, the item at the front (bottom of the ellipse) is selected, tap it
// (or the Open button) to go there; tapping any other badge turns it to the
// front. `rotation` is measured in items and unbounded — Animated.modulo
// wraps it for the pre-sampled orbit paths, so it spins forever either way.
export default function OrbitMenu({
  items,
  onOpen,
}: {
  items: OrbitMenuItem[];
  onOpen: (item: OrbitMenuItem) => void;
}) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const [height, setHeight] = useState(0);
  const N = items.length;

  const rotation = useRef(new Animated.Value(0)).current;
  const current = useRef(0);
  const dragStart = useRef(0);
  // On web a Pressable under the finger still fires onPress after the ring
  // captured the gesture as a drag; ignore presses that land right after one.
  const lastDragEnd = useRef(0);
  const justDragged = () => Date.now() - lastDragEnd.current < 350;
  const [front, setFront] = useState(0);
  const screenReader = useRef(false);

  // Dial labels sit at 1.36·rx, so 0.33·width keeps them on screen.
  const rx = Math.min(width * 0.33, 160);
  const ry = rx * 0.56;
  const cx = width / 2;
  const cy = Math.max(ry * 1.4 + 20, (height - READOUT) / 2);
  // Horizontal drag distance that turns the ring by one item.
  const step = Math.max(96, width / 3.2);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      screenReader.current = on;
    });
  }, []);

  useEffect(() => {
    const id = rotation.addListener(({ value }) => {
      current.current = value;
      const idx = mod(Math.round(value), N);
      setFront((prev) => (prev === idx ? prev : idx));
    });
    return () => rotation.removeListener(id);
  }, [rotation, N]);

  // A light tick each time a new item clicks into the front slot.
  const firstFront = useRef(true);
  useEffect(() => {
    if (firstFront.current) {
      firstFront.current = false;
      return;
    }
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  }, [front]);

  const orbit = useMemo(() => {
    const wrapped = Animated.modulo(rotation, N);
    const samples = N * SAMPLES_PER_ITEM;
    const input = Array.from({ length: samples + 1 }, (_, k) => (k / samples) * N);
    return items.map((_, i) => {
      const xs: number[] = [];
      const ys: number[] = [];
      const scales: number[] = [];
      const opacities: number[] = [];
      for (const r of input) {
        const theta = ((i - r) / N) * TAU;
        const depth = (Math.cos(theta) + 1) / 2;
        xs.push(rx * Math.sin(theta));
        ys.push(ry * Math.cos(theta));
        scales.push(0.52 + 0.6 * depth);
        opacities.push(0.22 + 0.78 * depth);
      }
      return {
        translateX: wrapped.interpolate({ inputRange: input, outputRange: xs }),
        translateY: wrapped.interpolate({ inputRange: input, outputRange: ys }),
        scale: wrapped.interpolate({ inputRange: input, outputRange: scales }),
        opacity: wrapped.interpolate({ inputRange: input, outputRange: opacities }),
      };
    });
  }, [items, rotation, N, rx, ry]);

  const settle = useCallback(
    (target: number) => {
      Animated.spring(rotation, {
        toValue: Math.round(target),
        damping: 20,
        stiffness: 170,
        mass: 1,
        useNativeDriver: true,
      }).start();
    },
    [rotation],
  );

  const goTo = useCallback(
    (i: number) => {
      const base = Math.round(current.current);
      let delta = i - mod(base, N);
      if (delta > N / 2) delta -= N;
      if (delta < -N / 2) delta += N;
      settle(base + delta);
    },
    [settle, N],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Capture on move (not start) so plain taps still reach the badges.
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          dragStart.current = current.current;
          rotation.stopAnimation((v) => {
            dragStart.current = v;
          });
        },
        onPanResponderMove: (_, g) => {
          rotation.setValue(dragStart.current - g.dx / step);
        },
        onPanResponderRelease: (_, g) => {
          lastDragEnd.current = Date.now();
          // Carry the flick a little past the finger, capped at one extra
          // item; any deliberate swipe moves at least one item.
          const start = dragStart.current;
          const from = start - g.dx / step;
          let target = Math.round(Math.max(from - 1, Math.min(from + 1, from - (g.vx * 90) / step)));
          if (target === Math.round(start) && Math.abs(g.dx) > 24) target -= Math.sign(g.dx);
          settle(target);
        },
        onPanResponderTerminate: (_, g) => {
          lastDragEnd.current = Date.now();
          settle(dragStart.current - g.dx / step);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [rotation, settle, step],
  );

  const onLayout = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);

  const selected = items[front];
  const bearing = `${String(Math.round((front * 360) / N)).padStart(3, '0')}°`;

  return (
    <View style={styles.flex} onLayout={onLayout} {...pan.panHandlers}>
      {height > 0 && (
        <>
          <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
            <OrbitDial cx={cx} cy={cy} rx={rx} ry={ry} />
          </Svg>

          {orbit.map((o, i) => {
            const item = items[i];
            const { Icon } = item;
            const depth = Math.cos(((i - front) / N) * TAU);
            const isFront = i === front;
            return (
              <Animated.View
                key={item.key}
                style={[
                  styles.badgeWrap,
                  {
                    left: cx - BADGE / 2,
                    top: cy - BADGE / 2,
                    zIndex: Math.round((depth + 1) * 50),
                    opacity: o.opacity,
                    transform: [{ translateX: o.translateX }, { translateY: o.translateY }, { scale: o.scale }],
                  },
                ]}
              >
                <Pressable
                  testID={`orbit-item-${item.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={item.href ? item.label : `${item.label}, coming soon`}
                  onPress={() => {
                    if (justDragged()) return;
                    if (isFront || screenReader.current) {
                      if (item.href) onOpen(item);
                      else goTo(i);
                    } else {
                      goTo(i);
                    }
                  }}
                  style={[
                    styles.badge,
                    {
                      backgroundColor: c.card,
                      borderColor: isFront ? item.color : `${item.color}88`,
                      borderWidth: isFront ? 2 : 1.5,
                    },
                  ]}
                >
                  <Icon color={item.color} size={48} />
                </Pressable>
              </Animated.View>
            );
          })}

          <View style={[styles.readout, { top: cy + ry * 1.36 + BADGE * 0.62 }]}>
            <Text style={[styles.bearing, { color: c.inkTertiary }]}>{bearing}</Text>
            <View style={styles.selectRow}>
              <Pressable
                onPress={() => !justDragged() && goTo(front - 1)}
                hitSlop={14}
                accessibilityLabel="Previous"
                style={styles.arrow}
              >
                <Text style={[styles.arrowText, { color: c.inkTertiary }]}>‹</Text>
              </Pressable>
              <Text testID="orbit-selected" style={[styles.label, { color: selected.color }]}>
                {selected.label.toUpperCase()}
              </Text>
              <Pressable
                onPress={() => !justDragged() && goTo(front + 1)}
                hitSlop={14}
                accessibilityLabel="Next"
                style={styles.arrow}
              >
                <Text style={[styles.arrowText, { color: c.inkTertiary }]}>›</Text>
              </Pressable>
            </View>
            <Text style={[styles.caption, { color: c.inkSecondary }]}>{selected.caption}</Text>
            <Pressable
              testID="orbit-open"
              disabled={!selected.href}
              onPress={() => !justDragged() && onOpen(selected)}
              style={({ pressed }) => [
                styles.open,
                selected.href
                  ? { backgroundColor: pressed ? c.accentPressed : c.accent }
                  : { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
              ]}
            >
              <Text style={[type.button, { color: selected.href ? c.onAccent : c.inkTertiary }]}>
                {selected.href ? `Open ${selected.label}` : 'Coming soon'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // userSelect: stops web from text-selecting the dial labels mid-drag.
  flex: { flex: 1, userSelect: 'none' },
  badgeWrap: {
    position: 'absolute',
    width: BADGE,
    height: BADGE,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readout: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 6,
  },
  bearing: {
    ...type.mono,
    fontSize: 11,
    letterSpacing: 2,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  arrow: {
    paddingHorizontal: 6,
  },
  arrowText: {
    fontSize: 26,
    lineHeight: 28,
  },
  label: {
    ...type.caption,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 3,
    minWidth: 150,
    textAlign: 'center',
  },
  caption: {
    ...type.mono,
    fontSize: 10.5,
    letterSpacing: 1.8,
  },
  open: {
    marginTop: 12,
    height: 44,
    paddingHorizontal: 26,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
