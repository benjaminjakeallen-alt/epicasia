import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHECKLIST } from '../../lib/arrivals';
import { onYukiWord, setYukiWake, startYukiVoice, stopYuki, talkToYuki, yukiStore } from '../../lib/yukiVoice';
import { colors as c } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';
import { PressScale, prefersReducedMotion } from '../shell/motion';
import Blossom from './Blossom';

export function useYuki() {
  return useSyncExternalStore(yukiStore.subscribe, yukiStore.get, yukiStore.get);
}

// What only this phone knows, so Yuki can answer "which checklist items are
// left?" or "what's that in my currency?" — and which screen they're on.
async function deviceContext(path: string): Promise<Record<string, unknown>> {
  const [currency, unit, checks] = await Promise.all(
    ['epicasia.homeCurrency', 'epicasia.tempUnit', 'epicasia.arrivalsChecklist'].map((k) =>
      AsyncStorage.getItem(k).catch(() => null),
    ),
  );
  let done: Record<string, boolean> = {};
  try {
    done = checks ? JSON.parse(checks) : {};
  } catch {
    // ignore
  }
  return {
    screen: path,
    home_currency: currency || 'USD',
    temperature_unit: unit === 'C' ? '°C' : '°F',
    checklist_done: CHECKLIST.filter((i) => done[i.id]).map((i) => i.text),
    checklist_left: CHECKLIST.filter((i) => !done[i.id]).map((i) => i.text),
  };
}

/**
 * Yuki, mounted once for the signed-in app: starts her voice (and the
 * "Hey Yuki" listener when that's on) and shows the glowing blossom over
 * whatever screen you're on while she listens, thinks and speaks.
 */
export default function YukiVoice({ name }: { name: string }) {
  const path = usePathname();
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => startYukiVoice({ name, device: () => deviceContext(pathRef.current) }), [name]);

  const live = useYuki();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // The veil fades in with the blossom springing up, and fades out again
  // when she's done — it stays mounted (showing her last words, taps passing
  // through) for the moment that takes.
  const open = live.state !== 'off' && live.state !== 'wake';
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const lastOpen = useRef(live);
  if (open) lastOpen.current = live;
  const yuki = open ? live : lastOpen.current;
  const veil = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (open) {
      rise.setValue(0);
      Animated.parallel([
        Animated.timing(veil, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(rise, { toValue: 1, stiffness: 190, damping: 17, mass: 0.9, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(veil, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        ({ finished }) => finished && setShown(false),
      );
    }
  }, [open, veil, rise]);
  if (!shown) return null;
  const still = prefersReducedMotion();

  const size = Math.min(width * 0.62, height * 0.34, 300);
  const status =
    yuki.state === 'listening'
      ? yuki.heard
        ? 'Listening…'
        : yuki.followUp
          ? 'Anything else?'
          : 'I’m listening'
      : yuki.state === 'thinking'
        ? 'Thinking…'
        : '';

  return (
    <Animated.View
      style={[styles.veil, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, opacity: veil }]}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityViewIsModal
      testID="yuki-overlay"
    >
      <Animated.View style={styles.top}>
        <Text style={[styles.name, { color: c.inkSecondary }]}>Yuki</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stop"
          onPress={stopYuki}
          testID="yuki-stop"
          style={({ pressed }) => [styles.close, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
        >
          <Ionicons name="close" size={24} color={c.ink} />
        </Pressable>
      </Animated.View>

      <Animated.View
        style={
          still ? undefined : { transform: [{ scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }
        }
      >
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={yuki.state === 'listening' && yuki.heard ? 'Done — send my question' : 'Talk to Yuki'}
          onPress={talkToYuki}
          style={styles.blossom}
          testID="yuki-talk"
        >
          <Blossom size={size} mode={yuki.state === 'off' || yuki.state === 'wake' ? 'still' : yuki.state} pulse={onYukiWord} />
        </PressScale>
      </Animated.View>

      <ScrollView style={styles.words} contentContainerStyle={styles.wordsContent}>
        {status ? (
          <Text style={[styles.status, { color: c.highlight }]} accessibilityLiveRegion="polite" testID="yuki-status">
            {status}
          </Text>
        ) : null}
        {yuki.heard ? (
          <Text style={[styles.heard, { color: c.inkSecondary }]} testID="yuki-heard">
            “{yuki.heard}”
          </Text>
        ) : null}
        {yuki.reply ? (
          <Text
            style={[styles.reply, { color: c.ink }]}
            accessibilityLiveRegion="polite"
            testID="yuki-reply"
            selectable
          >
            {yuki.reply}
          </Text>
        ) : null}
      </ScrollView>

      {!yuki.wakeOn && !yuki.unsupported ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setYukiWake(true)}
          testID="yuki-wake-offer"
          style={({ pressed }) => [styles.offer, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
        >
          <Ionicons name="mic-outline" size={20} color={c.highlight} />
          <Text style={[type.bodyStrong, { color: c.highlight }]}>Listen for “Hey Yuki”</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.yukiVeil,
    paddingHorizontal: 22,
    alignItems: 'center',
    zIndex: 1000,
  },
  top: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontFamily: fontFamily.displayItalic, fontSize: 22 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  blossom: { marginTop: 18, alignItems: 'center', justifyContent: 'center' },
  words: { alignSelf: 'stretch', flex: 1, marginTop: 12 },
  wordsContent: { gap: 12, paddingBottom: 12 },
  status: { fontFamily: fontFamily.display, fontSize: 28, textAlign: 'center' },
  heard: { ...type.body, fontSize: 18, lineHeight: 26, textAlign: 'center' },
  reply: { fontFamily: fontFamily.display, fontSize: 24, lineHeight: 33, textAlign: 'center' },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
  },
});
