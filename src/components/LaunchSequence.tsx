import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';
import { TRIP } from '../lib/trip';
import { colors as c, shadow } from '../theme/colors';
import { fontFamily } from '../theme/typography';
import { LANDMARKS } from './Landmarks';
import OrbitDial from './OrbitDial';
import SkyBackdrop from './SkyBackdrop';
import Wordmark from './Wordmark';

const N = LANDMARKS.length;
const TAU = Math.PI * 2;
const SAMPLES = 96;
const BADGE = 68;

// Sequence: the landmarks orbit the screen center like a 360° camera sweep
// around the trip, then the camera "pushes through" the ring (ring scales
// up and dissolves) into the hero wordmark. Everything animated is a View
// transform/opacity — no animated SVG props — so it runs on the native
// driver and avoids react-native-svg's web-only `collapsable` warning.
export default function LaunchSequence({ onFinish }: { onFinish: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const spin = useRef(new Animated.Value(0)).current;
  const rigIn = useRef(new Animated.Value(0)).current;
  const heroIn = useRef(new Animated.Value(0)).current;
  const overlay = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);
  const [front, setFront] = useState(0);

  const rx = Math.min(width * 0.4, 170);
  const ry = rx * 0.42;
  const cx = width / 2;
  const cy = height / 2 - 24;

  // sin/cos can't be expressed with Animated.interpolate directly, so each
  // landmark's elliptical path is pre-sampled into piecewise-linear ranges.
  // Depth (front of the ring = bottom of the ellipse) drives scale+opacity
  // for the perspective read.
  const orbit = useMemo(() => {
    const input = Array.from({ length: SAMPLES + 1 }, (_, k) => k / SAMPLES);
    return LANDMARKS.map((_, i) => {
      const phase = (i / N) * TAU;
      const xs: number[] = [];
      const ys: number[] = [];
      const scales: number[] = [];
      const opacities: number[] = [];
      for (const p of input) {
        const theta = phase - p * TAU;
        const depth = (Math.cos(theta) + 1) / 2;
        xs.push(rx * Math.sin(theta));
        ys.push(ry * Math.cos(theta));
        scales.push(0.5 + 0.62 * depth);
        opacities.push(0.16 + 0.84 * depth);
      }
      return {
        translateX: spin.interpolate({ inputRange: input, outputRange: xs }),
        translateY: spin.interpolate({ inputRange: input, outputRange: ys }),
        scale: spin.interpolate({ inputRange: input, outputRange: scales }),
        opacity: spin.interpolate({ inputRange: input, outputRange: opacities }),
      };
    });
  }, [spin, rx, ry]);

  // Only re-render when the landmark at the front of the ring changes
  // (8 times per revolution), not every frame.
  useEffect(() => {
    const id = spin.addListener(({ value }) => {
      const idx = Math.round(value * N) % N;
      setFront((prev) => (prev === idx ? prev : idx));
    });
    return () => spin.removeListener(id);
  }, [spin]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    Animated.timing(overlay, {
      toValue: 0,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(onFinish);
  }, [overlay, onFinish]);

  useEffect(() => {
    let cancelled = false;
    let seq: Animated.CompositeAnimation | null = null;

    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      seq = reduceMotion
        ? Animated.sequence([
            Animated.timing(heroIn, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.delay(1200),
          ])
        : Animated.sequence([
            Animated.parallel([
              Animated.timing(rigIn, {
                toValue: 1,
                duration: 500,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(spin, {
                toValue: 1,
                duration: 2800,
                easing: Easing.bezier(0.45, 0, 0.2, 1),
                useNativeDriver: true,
              }),
            ]),
            Animated.timing(heroIn, {
              toValue: 1,
              duration: 850,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.delay(1100),
          ]);
      seq.start(({ finished: done }) => {
        if (done) finish();
      });
    });

    return () => {
      cancelled = true;
      seq?.stop();
    };
  }, [spin, rigIn, heroIn, finish]);

  const heroOut = heroIn.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const rigOpacity = Animated.multiply(rigIn, heroOut);
  const rigScale = heroIn.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });

  const current = LANDMARKS[front];
  const bearing = `${String(Math.round((front * 360) / N)).padStart(3, '0')}°`;

  return (
    <Animated.View
      style={[
        styles.overlay,
        { backgroundColor: c.background, opacity: overlay, pointerEvents: finished.current ? 'none' : 'auto' },
      ]}
    >
      <SkyBackdrop height={height * 0.8} />

      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: rigOpacity, transform: [{ scale: rigScale }] }]}
      >
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          <OrbitDial cx={cx} cy={cy} rx={rx} ry={ry} />
        </Svg>

        {orbit.map((o, i) => {
          const { Icon, color, name } = LANDMARKS[i];
          // zIndex can't be native-animated, but `front` only changes 8x per
          // revolution — recomputing stacking from depth at that angle keeps
          // near badges drawn over far ones.
          const depth = Math.cos((i / N) * TAU - (front / N) * TAU);
          return (
            <Animated.View
              key={name}
              style={[
                styles.badge,
                {
                  left: cx - BADGE / 2,
                  top: cy - BADGE / 2,
                  zIndex: Math.round((depth + 1) * 50),
                  borderColor: 'transparent',
                  boxShadow: shadow.card,
                  opacity: o.opacity,
                  transform: [{ translateX: o.translateX }, { translateY: o.translateY }, { scale: o.scale }],
                },
              ]}
            >
              <Icon color={color} size={42} />
            </Animated.View>
          );
        })}

        <Corners inset={18} top={insets.top} bottom={insets.bottom} />

        <View style={[styles.hudTop, { top: insets.top + 30 }]}>
          <View style={styles.recRow}>
            <View style={styles.recDot} />
            <Text style={styles.hudText}>360° SWEEP</Text>
          </View>
          <Text style={styles.hudText}>{String(TRIP.cities).padStart(2, '0')} CITIES</Text>
        </View>

        <View style={[styles.readout, { bottom: insets.bottom + 44 }]}>
          <Text style={styles.readoutBearing}>{bearing}</Text>
          <Text style={[styles.readoutName, { color: current.color }]}>{current.name.toUpperCase()}</Text>
          <Text style={styles.readoutCity}>{current.city.toUpperCase()}</Text>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.hero,
          {
            pointerEvents: 'none',
            paddingBottom: 48,
            opacity: heroIn,
            transform: [
              { translateY: heroIn.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
              { scale: heroIn.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) },
            ],
          },
        ]}
      >
        <Text style={styles.heroEyebrow}>{TRIP.dates.toUpperCase()}</Text>
        <Wordmark size={60} />
        <Animated.View
          style={[
            styles.rule,
            {
              transform: [
                {
                  scaleX: heroIn.interpolate({
                    inputRange: [0.3, 1],
                    outputRange: [0, 1],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.Text
          style={[
            styles.heroRoute,
            { opacity: heroIn.interpolate({ inputRange: [0.4, 1], outputRange: [0, 1], extrapolate: 'clamp' }) },
          ]}
        >
          {TRIP.route.join('  ·  ')}
        </Animated.Text>
        <Animated.Text
          style={[
            styles.heroStats,
            { opacity: heroIn.interpolate({ inputRange: [0.55, 1], outputRange: [0, 1], extrapolate: 'clamp' }) },
          ]}
        >
          {TRIP.travelers} TRAVELERS · {TRIP.cities} CITIES · {TRIP.disneyDays} DISNEY DAYS
        </Animated.Text>
      </Animated.View>

      <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityLabel="Skip intro" />
    </Animated.View>
  );
}

// Camera viewfinder corner brackets.
function Corners({ inset, top, bottom }: { inset: number; top: number; bottom: number }) {
  const edge = { position: 'absolute' as const, width: 22, height: 22, borderColor: `${c.highlight}88` };
  return (
    <>
      <View style={[edge, { top: top + inset, left: inset, borderTopWidth: 1.5, borderLeftWidth: 1.5 }]} />
      <View style={[edge, { top: top + inset, right: inset, borderTopWidth: 1.5, borderRightWidth: 1.5 }]} />
      <View style={[edge, { bottom: bottom + inset, left: inset, borderBottomWidth: 1.5, borderLeftWidth: 1.5 }]} />
      <View style={[edge, { bottom: bottom + inset, right: inset, borderBottomWidth: 1.5, borderRightWidth: 1.5 }]} />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
  },
  badge: {
    position: 'absolute',
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 1.5,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudTop: {
    position: 'absolute',
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.seal,
  },
  hudText: {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: c.inkTertiary,
  },
  readout: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 4,
  },
  readoutBearing: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    letterSpacing: 2,
    color: c.inkTertiary,
  },
  readoutName: {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 13,
    letterSpacing: 2.4,
  },
  readoutCity: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: c.inkSecondary,
  },
  hero: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  heroEyebrow: {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 11,
    letterSpacing: 2.2,
    color: c.highlight,
    marginBottom: 14,
  },
  rule: {
    width: 64,
    height: 2,
    borderRadius: 1,
    backgroundColor: c.accent,
    marginTop: 18,
    marginBottom: 16,
  },
  heroRoute: {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 12,
    letterSpacing: 2,
    color: c.inkSecondary,
  },
  heroStats: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.8,
    color: c.inkTertiary,
    marginTop: 10,
  },
});
