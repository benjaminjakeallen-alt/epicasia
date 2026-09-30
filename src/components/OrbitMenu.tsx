import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type LayoutChangeEvent,
} from 'react-native';
import { openFeedback, preloadSounds, stepFeedback } from '../lib/feedback';
import { colors as palette } from '../theme/colors';
import { fontFamily, type } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

export type OrbitMenuItem = {
  key: string;
  label: string;
  caption: string;
  color: string;
  /** Generated 3D object icon, transparent PNG (assets/images/menu, see tools/menu-icons). */
  image: ImageSourcePropType;
  /** Omitted = not built yet; the item still sits on the ring but can't open. */
  href?: string;
};

const TAU = Math.PI * 2;
const SAMPLES_PER_ITEM = 16;
const HUB = 108;
const READOUT = 150;

// The soft gold glow connecting neighbouring hubs.
const LINE_GLOW = 10;

const mod = (n: number, m: number) => ((n % m) + m) % m;

// The launch sequence's 360° ring, as the home menu: swipe left/right to
// turn it, the item at the front (bottom of the ellipse) is selected, tap it
// (or the Open button) to go there; tapping any other hub turns it to the
// front. `rotation` is measured in items and unbounded — Animated.modulo
// wraps it for the pre-sampled orbit paths, so it spins forever either way.
// Neighbouring hubs are joined by a soft gold glow whose segments ride the
// same pre-sampled paths (position, length, angle) and glow brighter while
// the ring is being dragged. Each step plays a click + haptic tick.
export default function OrbitMenu({
  items,
  onOpen,
  height: fixedHeight,
}: {
  items: OrbitMenuItem[];
  onOpen: (item: OrbitMenuItem) => void;
  /** Fixed height (e.g. inside a ScrollView); fills its parent otherwise. */
  height?: number;
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

  const rx = Math.min(width * 0.36, 165);
  const ry = rx * 0.5;
  const cx = width / 2;
  const cy = Math.max(ry + HUB * 0.62, (height - READOUT) / 2);
  const glow = useRef(new Animated.Value(0)).current;
  // Horizontal drag distance that turns the ring by one item.
  const step = Math.max(96, width / 3.2);

  useEffect(() => {
    preloadSounds();
    AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      screenReader.current = on;
    });
  }, []);

  // A light tick each time a new item passes the front slot. Fired from the
  // listener (not an effect) so on web it runs inside the drag's touch
  // handler — iOS Safari only allows the haptic during a user gesture.
  const lastFront = useRef(0);
  useEffect(() => {
    const id = rotation.addListener(({ value }) => {
      current.current = value;
      const idx = mod(Math.round(value), N);
      if (idx !== lastFront.current) {
        lastFront.current = idx;
        stepFeedback();
      }
      setFront((prev) => (prev === idx ? prev : idx));
    });
    return () => rotation.removeListener(id);
  }, [rotation, N]);

  const open = useCallback(
    (item: OrbitMenuItem) => {
      openFeedback();
      onOpen(item);
    },
    [onOpen],
  );

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
        scales.push(0.5 + 0.74 * depth);
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

  // Connector segment k joins hub k to hub k+1. Pre-sampled like the hubs;
  // angles are unwrapped so interpolation never spins the long way round.
  const segments = useMemo(() => {
    const wrapped = Animated.modulo(rotation, N);
    const samples = N * SAMPLES_PER_ITEM;
    const input = Array.from({ length: samples + 1 }, (_, k) => (k / samples) * N);
    const pos = (i: number, r: number) => {
      const theta = ((i - r) / N) * TAU;
      return { x: rx * Math.sin(theta), y: ry * Math.cos(theta) };
    };
    const raw = items.map((_, k) =>
      input.map((r) => {
        const a = pos(k, r);
        const b = pos((k + 1) % N, r);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return {
          mid,
          len: Math.hypot(b.x - a.x, b.y - a.y),
          angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
          depth: (mid.y / ry + 1) / 2,
        };
      }),
    );
    const base = Math.max(...raw.flat().map((p) => p.len));
    return {
      base,
      list: raw.map((pts) => {
        const angles: number[] = [];
        for (const p of pts) {
          let a = p.angle;
          const prev = angles[angles.length - 1];
          if (prev !== undefined) {
            while (a - prev > 180) a -= 360;
            while (a - prev < -180) a += 360;
          }
          angles.push(a);
        }
        return {
          translateX: wrapped.interpolate({ inputRange: input, outputRange: pts.map((p) => p.mid.x) }),
          translateY: wrapped.interpolate({ inputRange: input, outputRange: pts.map((p) => p.mid.y) }),
          rotate: wrapped.interpolate({ inputRange: input, outputRange: angles.map((a) => `${a}deg`) }),
          scaleX: wrapped.interpolate({ inputRange: input, outputRange: pts.map((p) => p.len / base) }),
          opacity: wrapped.interpolate({ inputRange: input, outputRange: pts.map((p) => 0.3 + 0.7 * p.depth) }),
        };
      }),
    };
  }, [items, rotation, N, rx, ry]);

  const setGlow = useCallback(
    (on: boolean) => {
      Animated.timing(glow, {
        toValue: on ? 1 : 0,
        duration: on ? 160 : 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [glow],
  );

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
          setGlow(true);
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
          setGlow(false);
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
          setGlow(false);
          settle(dragStart.current - g.dx / step);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [rotation, settle, step, setGlow],
  );

  const onLayout = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);

  const selected = items[front];
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <View
      style={[styles.root, fixedHeight != null ? { height: fixedHeight } : styles.flex]}
      onLayout={onLayout}
      {...pan.panHandlers}
    >
      {height > 0 && (
        <>
          {segments.list.map((seg, k) => (
            <Animated.View
              key={`seg-${items[k].key}`}
              style={[
                styles.segment,
                {
                  width: segments.base,
                  left: cx - segments.base / 2,
                  top: cy - LINE_GLOW / 2,
                  opacity: seg.opacity,
                  transform: [
                    { translateX: seg.translateX },
                    { translateY: seg.translateY },
                    { rotate: seg.rotate },
                    { scaleX: seg.scaleX },
                  ],
                },
              ]}
            >
              <Animated.View style={[styles.segmentGlow, { opacity: glowOpacity }]} />
            </Animated.View>
          ))}

          {orbit.map((o, i) => {
            const item = items[i];
            const depth = Math.cos(((i - front) / N) * TAU);
            const isFront = i === front;
            return (
              <Animated.View
                key={item.key}
                style={[
                  styles.hubWrap,
                  {
                    left: cx - HUB / 2,
                    top: cy - HUB / 2,
                    zIndex: 1 + Math.round((depth + 1) * 50),
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
                      if (item.href) open(item);
                      else goTo(i);
                    } else {
                      stepFeedback();
                      goTo(i);
                    }
                  }}
                  style={styles.hub}
                >
                  <Image source={item.image} style={styles.hubImage} resizeMode="contain" />
                </Pressable>
              </Animated.View>
            );
          })}

          <View style={[styles.readout, { top: cy + ry + HUB * 0.62 }]}>
            <View style={styles.selectRow}>
              <Pressable
                onPress={() => {
                  if (justDragged()) return;
                  stepFeedback();
                  goTo(front - 1);
                }}
                hitSlop={14}
                accessibilityLabel="Previous"
                style={styles.arrow}
              >
                <Text style={[styles.arrowText, { color: c.inkTertiary }]}>‹</Text>
              </Pressable>
              <Text testID="orbit-selected" style={[styles.label, { color: selected.color }]}>
                {selected.label}
              </Text>
              <Pressable
                onPress={() => {
                  if (justDragged()) return;
                  stepFeedback();
                  goTo(front + 1);
                }}
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
              onPress={() => !justDragged() && open(selected)}
              style={({ pressed }) => [
                styles.open,
                selected.href
                  ? { backgroundColor: pressed ? c.accentPressed : c.accent, boxShadow: '0px 6px 20px rgba(30,39,33,0.07)' }
                  : { backgroundColor: c.accentSoft },
              ]}
            >
              <Text style={[type.button, { color: selected.href ? c.onAccent : c.highlight }]}>
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
  // userSelect: stops web from text-selecting labels mid-drag.
  root: { width: '100%', userSelect: 'none' },
  flex: { flex: 1 },
  segment: {
    position: 'absolute',
    height: LINE_GLOW,
    justifyContent: 'center',
    zIndex: 0,
  },
  // Soft blurred halo only — translucent gold band + wide gold shadow, no
  // solid core line (the user preferred the glow on its own).
  segmentGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: LINE_GLOW / 2,
    backgroundColor: `${palette.gold}40`,
    boxShadow: `0px 0px 12px 3px ${palette.gold}8c`,
  },
  hubWrap: {
    position: 'absolute',
    width: HUB,
    height: HUB,
  },
  hub: {
    width: HUB,
    height: HUB,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Explicit size: RN-web only scales images correctly with dimensions.
  hubImage: {
    width: HUB,
    height: HUB,
  },
  readout: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 6,
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
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.3,
    minWidth: 170,
    textAlign: 'center',
  },
  caption: {
    ...type.caption,
  },
  open: {
    marginTop: 14,
    height: 50,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
