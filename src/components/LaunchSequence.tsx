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
// horizon, while a 3D silver airliner (pre-rendered from every heading)
// circles it in perspective.
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
// 36 pre-rendered views of the 3D airliner, one per 10° of heading around
// a level orbit seen from PLANE_ELEV above (tools/menu-icons →
// render-plane.mjs). Row-major, SHEET_COLS per row; frame k = heading k·10°,
// heading 0 = flying right across the near side.
const PLANE_SHEET = require('../../assets/images/launch/plane-sheet.png');
const SHEET_COLS = 6;
const SHEET_FRAMES = 36;
const PLANE_ELEV = 26; // must match render-plane's camera elevation
const IMAGE_COUNT = LANDMARKS.length + 2;

const N = LANDMARKS.length;
const SPIN_FROM = -300; // degrees; the planet turns clockwise into place
const SPIN_MS = 3600;
const SPIN_EASING = Easing.bezier(0.4, 0, 0.1, 1);
const GATE = -60; // screen angle (0 = top) where a landmark pops up
const PLANE_MS = 5600;
const PLANE_TURNS = 1.25;
const PLANE_START = -100; // degrees round the orbit: just behind the left limb
const HERO_AT = 3300;
const HOLD_MS = 1400;
const LOAD_TIMEOUT_MS = 1500;

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

  // The plane orbits the planet in 3D: a level circle seen from PLANE_ELEV
  // above, so on screen an ellipse (tilted a few degrees). At orbit angle φ
  // (0 = nearest the viewer) it sits at (r·sinφ, r·cosφ·sin(elev)) and flies
  // with heading φ, so the sprite frame is simply round(φ / 10°) — nose-on
  // as it comes round the left, tail-on as it goes away on the right. It's
  // drawn twice, behind and in front of the world, switching at the ends
  // of the ellipse (outside the planet), where both copies show the same
  // frame. Positions are pre-sampled (no sin/cos in interpolate); the frame
  // and the front/back switch are exact step functions.
  const planePath = useMemo(() => {
    const r = R + L * 0.95;
    const sinE = Math.sin((PLANE_ELEV * Math.PI) / 180);
    const tilt = (-8 * Math.PI) / 180;
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    const span = 360 * PLANE_TURNS;
    const phiAt = (p: number) => PLANE_START + p * span;
    const rad = (deg: number) => (deg * Math.PI) / 180;

    const input: number[] = [];
    const xs: number[] = [];
    const ys: number[] = [];
    const scales: number[] = [];
    const SAMPLES_PLANE = 150;
    for (let k = 0; k <= SAMPLES_PLANE; k++) {
      const p = k / SAMPLES_PLANE;
      const phi = rad(phiAt(p));
      const ex = r * Math.sin(phi);
      const ey = r * Math.cos(phi) * sinE;
      input.push(p);
      xs.push(ex * cosT - ey * sinT);
      ys.push(ex * sinT + ey * cosT);
      scales.push(1 + 0.14 * Math.cos(phi)); // nearer = a little larger
    }

    // Step functions over p: a value that changes only at `edges` (degrees).
    const steps = (edgeEvery: number, edgeOffset: number, valueAt: (phiDeg: number) => number) => {
      const stepIn: number[] = [];
      const stepOut: number[] = [];
      const cuts: number[] = [];
      const first = Math.ceil((PLANE_START - edgeOffset) / edgeEvery) * edgeEvery + edgeOffset;
      for (let e = first; e < PLANE_START + span; e += edgeEvery) cuts.push((e - PLANE_START) / span);
      let from = 0;
      for (const cut of [...cuts, 1]) {
        const mid = phiAt((from + cut) / 2);
        const v = valueAt(mid);
        stepIn.push(from, Math.max(from, cut - 1e-6));
        stepOut.push(v, v);
        from = cut;
      }
      return { stepIn, stepOut };
    };
    const frameOf = (phiDeg: number) =>
      ((Math.round(phiDeg / (360 / SHEET_FRAMES)) % SHEET_FRAMES) + SHEET_FRAMES) % SHEET_FRAMES;
    const col = steps(360 / SHEET_FRAMES, 5, (d) => frameOf(d) % SHEET_COLS);
    const row = steps(360 / SHEET_FRAMES, 5, (d) => Math.floor(frameOf(d) / SHEET_COLS));
    const near = steps(180, 90, (d) => (Math.cos(rad(d)) >= 0 ? 1 : 0));

    const at = (outputRange: number[]) => plane.interpolate({ inputRange: input, outputRange });
    const nearOpacity = plane.interpolate({ inputRange: near.stepIn, outputRange: near.stepOut });
    const frame = L * 0.95;
    return {
      size: frame,
      translateX: at(xs),
      translateY: at(ys),
      scale: at(scales),
      sheetX: plane.interpolate({ inputRange: col.stepIn, outputRange: col.stepOut.map((c) => -c * frame) }),
      sheetY: plane.interpolate({ inputRange: row.stepIn, outputRange: row.stepOut.map((rw) => -rw * frame) }),
      frontOpacity: Animated.multiply(nearOpacity, planeIn),
      backOpacity: Animated.multiply(Animated.subtract(1, nearOpacity), planeIn),
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

  // A frame-sized window onto the sprite sheet, moved round the orbit.
  const planeSprite = (opacity: Animated.AnimatedMultiplication<number>, countsLoad: boolean) => (
    <Animated.View
      style={[
        styles.plane,
        {
          width: planePath.size,
          height: planePath.size,
          left: cx - planePath.size / 2,
          top: cy - planePath.size / 2,
          opacity,
          transform: [
            { translateX: planePath.translateX },
            { translateY: planePath.translateY },
            { rotate: '-8deg' }, // the orbit's tilt on screen
            { scale: planePath.scale },
          ],
        },
      ]}
    >
      <Animated.Image
        source={PLANE_SHEET}
        onLoad={countsLoad ? onImageLoad : undefined}
        style={{
          width: planePath.size * SHEET_COLS,
          height: planePath.size * SHEET_COLS,
          transform: [{ translateX: planePath.sheetX }, { translateY: planePath.sheetY }],
        }}
      />
    </Animated.View>
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

      {planeSprite(planePath.backOpacity, false)}

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
              <Stop offset="0.55" stopColor={c.ink} stopOpacity="0" />
              <Stop offset="1" stopColor={c.ink} stopOpacity="0.32" />
            </RadialGradient>
            <RadialGradient id={`${uid}sun`} cx="32%" cy="26%" r="42%">
              <Stop offset="0" stopColor={c.sunlight} stopOpacity="0.38" />
              <Stop offset="1" stopColor={c.sunlight} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={R} cy={R} r={R * 0.985} fill={`url(#${uid}shade)`} />
          <Circle cx={R} cy={R} r={R * 0.985} fill={`url(#${uid}sun)`} />
        </Svg>
      </Animated.View>
      {planeSprite(planePath.frontOpacity, true)}

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

      <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={finish} accessibilityLabel="Skip intro" />
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
    backgroundColor: c.halo,
    boxShadow: `0px 0px 80px 40px ${c.halo}`,
  },
  plane: {
    position: 'absolute',
    overflow: 'hidden',
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
