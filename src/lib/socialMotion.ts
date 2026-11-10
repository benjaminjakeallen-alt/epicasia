import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

// Motion shared by the chat, photos and journal: short, spring-based, and
// still under Reduce Motion (everything lands on its end state at once).

/** The system's Reduce Motion setting, read when asked (the browser's media query). */
export function reduceMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export const SPRING = { damping: 24, stiffness: 300, mass: 0.9, useNativeDriver: true } as const;
export const POP = { damping: 12, stiffness: 320, mass: 0.7, useNativeDriver: true } as const;

/**
 * Enter and exit for something that is either there or not (a sheet, a
 * viewer, a bar): `t` runs 0 → 1 on a spring when it appears and back in
 * `outMs` when it goes; `mounted` stays true until the exit has played, so
 * the thing can still be drawn while it leaves.
 */
export function usePresence(visible: boolean, outMs = 160) {
  const t = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    const still = reduceMotion();
    if (visible) {
      const a = still
        ? Animated.timing(t, { toValue: 1, duration: 0, useNativeDriver: true })
        : Animated.spring(t, { toValue: 1, ...SPRING });
      a.start();
      return () => a.stop();
    }
    const a = Animated.timing(t, {
      toValue: 0,
      duration: still ? 0 : outMs,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    a.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => a.stop();
  }, [visible, t, outMs]);

  return { mounted, t };
}

/** A value that springs 0 → 1 once, when the component mounts (1 at once if `on` is false or under Reduce Motion). */
export function useEnter(on = true, config: { damping: number; stiffness: number; mass: number } = SPRING) {
  const still = !on || reduceMotion();
  const t = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) return;
    const a = Animated.spring(t, { toValue: 1, ...config, useNativeDriver: true });
    a.start();
    return () => a.stop();
    // Runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return t;
}

/** Remembers the last value given while `keep` was true — what a sheet shows while it slides away. */
export function useLast<T>(value: T, keep: boolean): T {
  const last = useRef(value);
  if (keep) last.current = value;
  return keep ? value : last.current;
}
