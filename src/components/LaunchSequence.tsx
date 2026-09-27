import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { darkColors } from '../theme/colors';
import { fontFamily } from '../theme/typography';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// The plane/labels are positioned in the same raw coordinate space as the
// SVG viewBox, so the map box below is rendered at a FIXED pixel size
// (MAP_SIZE) equal to VIEWBOX — no percentage/responsive sizing here, or
// the SVG's internal scaling and the plane's Animated transform would
// drift apart.
const MAP_SIZE = 300;
const VIEWBOX = MAP_SIZE;
const START = { x: 46, y: 226 };
const CONTROL = { x: 158, y: 30 };
const END = { x: 256, y: 120 };
const SAMPLES = 48;

function bezierPoint(t: number) {
  const mt = 1 - t;
  const x = mt * mt * START.x + 2 * mt * t * CONTROL.x + t * t * END.x;
  const y = mt * mt * START.y + 2 * mt * t * CONTROL.y + t * t * END.y;
  return { x, y };
}

function buildPath() {
  const points = Array.from({ length: SAMPLES + 1 }, (_, i) => bezierPoint(i / SAMPLES));
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  let length = 0;
  const angles: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(i - 1, 0)];
    const b = points[Math.min(i + 1, points.length - 1)];
    angles.push((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
    if (i > 0) {
      length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
  }
  return { d, points, angles, length };
}

const PATH = buildPath();
const INPUT_RANGE = PATH.points.map((_, i) => i / SAMPLES);
const XS = PATH.points.map((p) => p.x);
const YS = PATH.points.map((p) => p.y);
// The airplane glyph points to the upper-right (~-45deg) at rest, so that
// offset is baked into every sampled angle before it ever reaches Animated.
const PLANE_BASE_ROTATION = -45;
const ROTATIONS = PATH.angles.map((deg) => `${deg + PLANE_BASE_ROTATION}deg`);

export default function LaunchSequence({ onFinish }: { onFinish: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const markers = useRef(new Animated.Value(0)).current;
  const wordmark = useRef(new Animated.Value(0)).current;
  const overlay = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);

  const translateX = progress.interpolate({ inputRange: INPUT_RANGE, outputRange: XS });
  const translateY = progress.interpolate({ inputRange: INPUT_RANGE, outputRange: YS });
  const rotate = progress.interpolate({ inputRange: INPUT_RANGE, outputRange: ROTATIONS });
  const dashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [PATH.length, 0],
  });

  const finish = useMemo(
    () => () => {
      if (finished.current) return;
      finished.current = true;
      Animated.timing(overlay, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(onFinish);
    },
    [overlay, onFinish],
  );

  useEffect(() => {
    const sequence = Animated.sequence([
      Animated.delay(200),
      Animated.timing(markers, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.delay(150),
      Animated.timing(wordmark, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(900),
    ]);
    sequence.start(({ finished: didFinish }) => {
      if (didFinish) finish();
    });
    return () => sequence.stop();
  }, [markers, progress, wordmark, finish]);

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          backgroundColor: darkColors.background,
          opacity: overlay,
          pointerEvents: finished.current ? 'none' : 'auto',
        },
      ]}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={finish} />

      <View style={styles.mapWrap}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
          <Path d={PATH.d} stroke={darkColors.border} strokeWidth={1.5} strokeDasharray="2 8" fill="none" />
          <AnimatedPath
            d={PATH.d}
            stroke={darkColors.accent}
            strokeWidth={1.5}
            fill="none"
            strokeDasharray={PATH.length}
            strokeDashoffset={dashoffset}
          />
          <Circle cx={START.x} cy={START.y} r={4} fill={darkColors.accent} />
          <Circle cx={END.x} cy={END.y} r={4} fill={darkColors.accent} />
        </Svg>

        <Animated.Text
          style={[styles.label, { left: START.x - 30, top: START.y + 12, opacity: markers }]}
        >
          USA
        </Animated.Text>
        <Animated.Text
          style={[styles.label, { left: END.x - 12, top: END.y - 28, opacity: markers }]}
        >
          ASIA
        </Animated.Text>

        <Animated.View
          style={[
            styles.plane,
            {
              opacity: markers,
              transform: [{ translateX }, { translateY }, { rotate }],
            },
          ]}
        >
          <Ionicons name="airplane" size={16} color={darkColors.accent} />
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.wordmarkWrap,
          {
            opacity: wordmark,
            transform: [{ translateY: wordmark.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        <Text style={styles.wordmark}>Epic Asia</Text>
        <Text style={styles.tagline}>UNITED STATES   →   ASIA</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapWrap: {
    width: MAP_SIZE,
    height: MAP_SIZE,
  },
  label: {
    position: 'absolute',
    color: darkColors.inkTertiary,
    fontSize: 11,
    letterSpacing: 2,
  },
  plane: {
    position: 'absolute',
    left: -8,
    top: -8,
  },
  wordmarkWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: fontFamily.display,
    fontSize: 38,
    color: darkColors.ink,
  },
  tagline: {
    marginTop: 10,
    fontSize: 11,
    letterSpacing: 3,
    color: darkColors.inkTertiary,
  },
});
