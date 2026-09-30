import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { TRIP } from '../lib/trip';
import { colors as c } from '../theme/colors';
import { fontFamily } from '../theme/typography';
import SkyBackdrop from './SkyBackdrop';
import Wordmark from './Wordmark';

// "Little planet" intro: a miniature world turns into place and the trip's
// landmarks spring up from its surface one by one as they come over the
// horizon, while the silver airliner from the Flights icon circles it.
// Then the wordmark rises in beneath and the whole scene fades out.
//
// Art is generated in the menu icons' style (tools/menu-icons, see the
// README): hyper-real miniatures, soft morning light, sage green.
//
// Motion notes (design-motion-principles: Jakub primary, Jhey secondary —
// plays on every cold open, so it stays under ~5s, is skippable, and
// nothing loops for attention):
// - only View transforms/opacity animate, all on the native driver;
// - the spin decelerates into place (no overshoot on the big mass), while
//   the small landmarks get a light spring overshoot — the "pop";
// - each pop is timed to the moment its landmark crosses the upper-left
//   horizon, computed by inverting the spin's easing curve;
// - the exit is quieter than the entrance (short fade, 3% scale).

type Landmark = { key: string; source: ImageSourcePropType; label: string };

// Clockwise from the top, in trip order.
const LANDMARKS: Landmark[] = [
  { key: 'castle', source: require('../../assets/images/launch/castle.png'), label: 'Tokyo Disney' },
  { key: 'torii', source: require('../../assets/images/launch/torii.png'), label: 'Meiji Shrine' },
  { key: 'kinkakuji', source: require('../../assets/images/launch/kinkakuji.png'), label: 'Kinkaku-ji' },
  { key: 'todaiji', source: require('../../assets/images/launch/todaiji.png'), label: 'Tōdai-ji' },
  { key: 'greatwall', source: require('../../assets/images/launch/greatwall.png'), label: 'Great Wall' },
  { key: 'heaven', source: require('../../assets/images/launch/heaven.png'), label: 'Temple of Heaven' },
  { key: 'pearl', source: require('../../assets/images/launch/pearl.png'), label: 'Pearl Tower' },
  { key: 'buddha', source: require('../../assets/images/launch/buddha.png'), label: 'Big Buddha' },
];
const PLANET = require('../../assets/images/launch/planet.png');
const PLANE = require('../../assets/images/menu/flights.png');
const IMAGE_COUNT = LANDMARKS.length + 2;

const N = LANDMARKS.length;
const SPIN_FROM = -300; // degrees; the planet turns clockwise into place
const SPIN_MS = 3600;
const SPIN_EASING = Easing.bezier(0.4, 0, 0.1, 1);
const GATE = -60; // screen angle (0 = top) where a landmark pops up
const PLANE_MS = 5600;
const PLANE_TURNS = 1.5; // two near-side passes: during the spin and under the wordmark
const HERO_AT = 3300;
const HOLD_MS = 1400;
const LOAD_TIMEOUT_MS = 1500;
const SAMPLES = 72;

// t in [0,1] at which SPIN_EASING(t) reaches `progress` (bisection).
function invertEasing(progress: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (SPIN_EASING(mid) < progress) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// When landmark i (resting at angle i·45°) crosses the gate during the
// spin. Landmarks already past it when the spin starts pop in with the
// planet instead, lightly staggered.
function popDelays(): number[] {
  let early = 0;
  return LANDMARKS.map((_, i) => {
    const rest = (i * 360) / N;
    const start = rest + SPIN_FROM;
    for (let k = -2; k <= 2; k++) {
      const target = GATE + 360 * k;
      if (target > start + 20 && target <= rest) {
        const progress = (target - start) / -SPIN_FROM;
        return Math.round(invertEasing(progress) * SPIN_MS);
      }
    }
    return 250 + 110 * early++;
  });
}

export default function LaunchSequence({ onFinish }: { onFinish: () => void }) {
  const { width, height } = useWindowDimensions();

  // Planet radius and landmark size scale with the screen, capped so the
  // whole world (rim + landmark height) fits with a margin.
  const R = Math.min(width * 0.29, height * 0.16, 150);
  const L = R * 0.66;
  // How far each landmark sinks into the planet. They're drawn *behind* the
  // planet, so it hides the front of each grass base and the landmark reads
  // as standing on the curve of the world rather than on a stuck-on disc.
  const SINK = L * 0.24;
  const D = R * 2;
  const cx = width / 2;
  const cy = height * 0.4;

  const planetIn = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pops = useRef(LANDMARKS.map(() => new Animated.Value(0))).current;
  const planeIn = useRef(new Animated.Value(0)).current;
  const plane = useRef(new Animated.Value(0)).current;
  const heroIn = useRef(new Animated.Value(0)).current;
  const overlay = useRef(new Animated.Value(1)).current;

  const finished = useRef(false);
  const started = useRef(false);
  const loaded = useRef(0);
  const sequence = useRef<Animated.CompositeAnimation | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const delays = useMemo(popDelays, []);

  // Gradient ids must be unique per mount (see SkyBackdrop).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const worldBox = { position: 'absolute' as const, left: cx - R, top: cy - R, width: D, height: D };
  const worldTransform = [
    { translateY: planetIn.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
    { scale: planetIn.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
    { scale: overlay.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1] }) },
  ];

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: [`${SPIN_FROM}deg`, '0deg'] });

  // The plane flies a tilted ellipse around the planet, left to right
  // across the near side. It is only ever seen on that near arc: it fades
  // out into the haze as it curves away on the right and comes back out of
  // it on the left, so the turn-around (which a flat side-view sprite can't
  // show convincingly) always happens unseen, and it never flips. sin/cos
  // aren't expressible with interpolate, so the path is pre-sampled.
  const planePath = useMemo(() => {
    const rx = R + L * 0.95;
    const ry = rx * 0.3;
    const tilt = (-8 * Math.PI) / 180; // the orbit's inclination on screen
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    const input: number[] = [];
    const xs: number[] = [];
    const ys: number[] = [];
    const pitches: string[] = [];
    const scales: number[] = [];
    const opacities: number[] = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const p = k / SAMPLES;
      // Starts just behind the left limb so the first pass begins at once.
      const a = p * Math.PI * 2 * PLANE_TURNS - 0.3;
      const ex = -rx * Math.cos(a);
      const ey = ry * Math.sin(a); // sin(a) > 0 = near side
      const dx = rx * Math.sin(a);
      const dy = ry * Math.cos(a);
      input.push(p);
      xs.push(ex * cosT - ey * sinT);
      ys.push(ex * sinT + ey * cosT);
      // Pitch follows the path's slope (on the near arc dx > 0, flying right).
      pitches.push(`${(Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI - 8}deg`);
      const near = Math.sin(a);
      scales.push(0.8 + 0.28 * Math.max(near, 0));
      // Smoothstep in from the haze once well onto the near arc.
      const t = Math.min(Math.max((near - 0.2) / 0.5, 0), 1);
      opacities.push(t * t * (3 - 2 * t));
    }
    const at = (outputRange: number[]) => plane.interpolate({ inputRange: input, outputRange });
    return {
      translateX: at(xs),
      translateY: at(ys),
      rotate: plane.interpolate({ inputRange: input, outputRange: pitches }),
      scale: at(scales),
      opacity: Animated.multiply(at(opacities), planeIn),
    };
  }, [plane, planeIn, R, L]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    if (finishTimer.current) clearTimeout(finishTimer.current);
    sequence.current?.stop();
    Animated.timing(overlay, {
      toValue: 0,
      duration: 380,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(onFinish);
  }, [overlay, onFinish]);

  const start = useCallback(() => {
    if (started.current || finished.current) return;
    started.current = true;

    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (finished.current) return;
      if (reduceMotion) {
        // The finished scene, still, with a plain crossfade.
        spin.setValue(1);
        pops.forEach((p) => p.setValue(1));
        sequence.current = Animated.sequence([
          Animated.parallel([
            Animated.timing(planetIn, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(heroIn, { toValue: 1, duration: 300, useNativeDriver: true }),
          ]),
          Animated.delay(1500),
        ]);
      } else {
        sequence.current = Animated.parallel([
          Animated.timing(planetIn, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(spin, { toValue: 1, duration: SPIN_MS, easing: SPIN_EASING, useNativeDriver: true }),
          ...pops.map((p, i) =>
            Animated.spring(p, {
              toValue: 1,
              delay: delays[i],
              stiffness: 240,
              damping: 13,
              mass: 1,
              useNativeDriver: true,
            }),
          ),
          Animated.timing(planeIn, { toValue: 1, duration: 600, delay: 350, useNativeDriver: true }),
          Animated.timing(plane, {
            toValue: 1,
            duration: PLANE_MS,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(HERO_AT),
            Animated.timing(heroIn, {
              toValue: 1,
              duration: 650,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.delay(HOLD_MS),
          ]),
        ]);
      }
      // Finish once the hero has been held — not when the plane's longer
      // loop ends.
      const total = reduceMotion ? 1800 : HERO_AT + 650 + HOLD_MS;
      sequence.current.start();
      finishTimer.current = setTimeout(finish, total);
    });
  }, [delays, finish, heroIn, planeIn, plane, planetIn, pops, spin]);

  // Start once every image has decoded (so no landmark pops in blank), or
  // after a short timeout as a fallback.
  const onImageLoad = useCallback(() => {
    loaded.current += 1;
    if (loaded.current >= IMAGE_COUNT) start();
  }, [start]);

  useEffect(() => {
    const id = setTimeout(start, LOAD_TIMEOUT_MS);
    return () => {
      clearTimeout(id);
      if (finishTimer.current) clearTimeout(finishTimer.current);
      sequence.current?.stop();
    };
  }, [start]);

  const planeImage = (
    <Animated.Image
      source={PLANE}
      onLoad={onImageLoad}
      style={[
        styles.plane,
        {
          width: L * 0.8,
          height: L * 0.8,
          left: cx - L * 0.4,
          top: cy - L * 0.4,
          opacity: planePath.opacity,
          transform: [
            { translateX: planePath.translateX },
            { translateY: planePath.translateY },
            { scale: planePath.scale },
            { rotate: planePath.rotate },
            // The icon's nose points left; it always flies right.
            { scaleX: -1 },
          ],
        },
      ]}
      resizeMode="contain"
    />
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: overlay }]} testID="launch-sequence">
      <SkyBackdrop height={height} />

      {/* Soft daylight halo behind the world. */}
      <Animated.View
        style={[
          styles.halo,
          { width: D * 1.9, height: D * 1.9, borderRadius: D, left: cx - D * 0.95, top: cy - D * 0.95 },
          { opacity: planetIn },
        ]}
      />

      {/* Three stacked layers share the world's placement: the landmarks
          (turning, tucked behind the planet), the planet (turning), and fixed
          sunlight shading on top (not turning, so the light doesn't spin
          with the ground). */}
      <Animated.View style={[worldBox, { opacity: planetIn, transform: [...worldTransform, { rotate }] }]}>
        {LANDMARKS.map((lm, i) => (
          // A full-size "arm" rotated to the landmark's angle; the landmark
          // stands at its top edge, so it rotates about the planet's center.
          <View
            key={lm.key}
            style={[StyleSheet.absoluteFill, { pointerEvents: 'none', transform: [{ rotate: `${(i * 360) / N}deg` }] }]}
          >
            <Animated.Image
              source={lm.source}
              onLoad={onImageLoad}
              accessibilityIgnoresInvertColors
              style={{
                position: 'absolute',
                width: L,
                height: L,
                left: R - L / 2,
                top: -(L - SINK),
                opacity: pops[i].interpolate({ inputRange: [0, 0.35], outputRange: [0, 1], extrapolate: 'clamp' }),
                transformOrigin: 'bottom',
                transform: [
                  // Rises up from behind the planet's horizon.
                  { translateY: pops[i].interpolate({ inputRange: [0, 1], outputRange: [L * 0.4, 0] }) },
                  { scale: pops[i].interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) },
                ],
              }}
              resizeMode="contain"
            />
          </View>
        ))}
      </Animated.View>

      <Animated.View style={[worldBox, { opacity: planetIn, transform: [...worldTransform, { rotate }] }]}>
        <Image source={PLANET} onLoad={onImageLoad} style={{ width: D, height: D }} resizeMode="contain" />
      </Animated.View>
      <Animated.View style={[worldBox, { opacity: planetIn, transform: worldTransform, pointerEvents: 'none' }]}>
        <Svg width={D} height={D}>
          <Defs>
            <RadialGradient id={`${uid}shade`} cx="38%" cy="32%" r="72%">
              <Stop offset="0.55" stopColor="#1e2721" stopOpacity="0" />
              <Stop offset="1" stopColor="#1e2721" stopOpacity="0.32" />
            </RadialGradient>
            <RadialGradient id={`${uid}sun`} cx="32%" cy="26%" r="42%">
              <Stop offset="0" stopColor="#fff6dc" stopOpacity="0.38" />
              <Stop offset="1" stopColor="#fff6dc" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={R} cy={R} r={R * 0.985} fill={`url(#${uid}shade)`} />
          <Circle cx={R} cy={R} r={R * 0.985} fill={`url(#${uid}sun)`} />
        </Svg>
      </Animated.View>
      {planeImage}

      <Animated.View
        style={[
          styles.hero,
          { top: cy + R + L * 0.95 + 18 },
          {
            opacity: heroIn,
            transform: [{ translateY: heroIn.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          },
        ]}
      >
        <Wordmark size={40} />
        <Text style={styles.tagline}>
          {TRIP.dates} · Tokyo to Hong Kong
        </Text>
      </Animated.View>

      <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityLabel="Skip intro" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: c.background,
    zIndex: 10,
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.55)',
    boxShadow: '0px 0px 80px 40px rgba(255,255,255,0.55)',
  },
  plane: {
    position: 'absolute',
  },
  hero: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 10,
  },
  tagline: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 14,
    letterSpacing: 0.2,
    color: c.inkSecondary,
  },
});
