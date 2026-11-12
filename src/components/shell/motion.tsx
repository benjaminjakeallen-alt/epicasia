import { useIsFocused } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors as c, shadow } from '../../theme/colors';

// Shared motion for the app shell (home, profile, auth, banners, Yuki):
// quick, spring-based, interruptible, transforms and opacity only — and all
// of it still under Reduce Motion.

let reduceMotion = false;
const reduceListeners = new Set<(r: boolean) => void>();
let watchingReduce = false;
function watchReduceMotion() {
  if (watchingReduce) return;
  watchingReduce = true;
  const set = (r: boolean) => {
    reduceMotion = r;
    reduceListeners.forEach((l) => l(r));
  };
  AccessibilityInfo.isReduceMotionEnabled()
    .then(set)
    .catch(() => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

/** Whether the phone asks for less motion right now (no promise to wait for). */
export function prefersReducedMotion() {
  watchReduceMotion();
  return reduceMotion;
}

/** The Reduce Motion setting, live. */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(prefersReducedMotion);
  useEffect(() => {
    reduceListeners.add(setReduce);
    return () => {
      reduceListeners.delete(setReduce);
    };
  }, []);
  return reduce;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressScaleProps = Omit<PressableProps, 'style'> & {
  /** How far it sinks under the finger (0.97 for cards and pills, ~0.92 for small round buttons). */
  to?: number;
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
};

/**
 * A Pressable that sinks a little under the finger and springs back —
 * the same press feel on every shell button. `style` may still be a
 * function of `pressed` (for a pressed colour).
 */
export function PressScale({ to = 0.97, style, onPressIn, onPressOut, children, ...rest }: PressScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const spring = (toValue: number) =>
    Animated.spring(scale, { toValue, stiffness: 420, damping: 26, mass: 0.6, useNativeDriver: true }).start();
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        if (!prefersReducedMotion()) spring(to);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        spring(1);
        onPressOut?.(e);
      }}
      style={[typeof style === 'function' ? style({ pressed }) : style, { transform: [{ scale }] }]}
    >
      {children as ReactNode}
    </AnimatedPressable>
  );
}

/**
 * Children fade in and settle into place when they mount (an error line, a
 * notice, a banner) instead of popping. Under Reduce Motion they just fade.
 */
export function Appear({
  children,
  from = 'below',
  distance = 8,
  delay = 0,
  style,
  ...rest
}: {
  children: ReactNode;
  from?: 'below' | 'above';
  distance?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  pointerEvents?: 'box-none' | 'none' | 'auto';
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 220,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, delay]);
  const offset = prefersReducedMotion() ? 0 : from === 'below' ? distance : -distance;
  return (
    <Animated.View
      {...rest}
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The drawn switch on a settings row (the row itself is the control): the
 * knob slides across and the track turns sage, instead of jumping.
 */
export function SlideSwitch({ on, width = 51, height = 31, pad = 2 }: { on: boolean; width?: number; height?: number; pad?: number }) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (prefersReducedMotion()) v.setValue(on ? 1 : 0);
    else Animated.spring(v, { toValue: on ? 1 : 0, stiffness: 380, damping: 30, mass: 0.7, useNativeDriver: true }).start();
  }, [on, v]);
  const knob = height - pad * 2;
  return (
    <Animated.View style={{ width, height, borderRadius: height / 2, backgroundColor: c.handle, justifyContent: 'center' }}>
      <Animated.View
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: height / 2, backgroundColor: c.accent, opacity: v }}
      />
      <Animated.View
        style={{
          width: knob,
          height: knob,
          borderRadius: knob / 2,
          marginLeft: pad,
          backgroundColor: c.card,
          boxShadow: shadow.card,
          transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, width - knob - pad * 2] }) }],
        }}
      />
    </Animated.View>
  );
}

// The first screen of a cold open appears under the launch sequence; it has
// nothing to arrive from.
let firstScreenShown = false;

/**
 * Screen changes on the web are an instant swap (the stack only flips
 * `display`). This wraps each screen of a Stack (`screenLayout`): a pushed
 * screen fades in while gliding a few points in from the right, and the one
 * you come back to glides in from the left. Short and one-way — the old
 * screen is already gone — and only a fade under Reduce Motion. The
 * transform is dropped once it has settled, so a screen at rest is laid out
 * exactly as before.
 */
export function ScreenTransition({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  const v = useRef(new Animated.Value(1)).current;
  const [moving, setMoving] = useState(false);
  const from = useRef(1); // 1 = arriving (from the right), -1 = coming back (from the left)
  const [seenFocus, setSeenFocus] = useState(false);

  // React's adjust-during-render pattern (not setState in an effect): a change of focus decides whether to glide.
  if (focused !== seenFocus) {
    setSeenFocus(focused);
    if (focused) {
      if (!firstScreenShown) {
        from.current = -1;
      } else {
        v.setValue(0);
        setMoving(true);
      }
    } else if (moving) {
      // left mid-glide: settle now, so coming back glides afresh
      v.setValue(1);
      setMoving(false);
    }
  }

  useEffect(() => {
    firstScreenShown = true;
  }, []);

  useLayoutEffect(() => {
    if (!moving) return;
    const run = Animated.timing(v, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (!finished) return;
      from.current = -1; // the next time it gains focus, it's being returned to
      setMoving(false);
    });
    return () => run.stop();
  }, [moving, v]);

  if (!moving) return <Animated.View style={flex}>{children}</Animated.View>;
  const travel = prefersReducedMotion() ? 0 : 18 * from.current;
  return (
    <Animated.View
      style={[
        flex,
        {
          // the fade is over in the first half; the glide takes the whole time
          opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }),
          transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const flex = { flex: 1 } as const;
