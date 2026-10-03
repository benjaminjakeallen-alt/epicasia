import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHECKLIST } from '../../lib/arrivals';
import { onYukiWord, setYukiWake, startYukiVoice, stopYuki, talkToYuki, yukiStore } from '../../lib/yukiVoice';
import { colors as c } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';
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

  const yuki = useYuki();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  if (yuki.state === 'off' || yuki.state === 'wake') return null;

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
    <View
      style={[styles.veil, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
      accessibilityViewIsModal
      testID="yuki-overlay"
    >
      <View style={styles.top}>
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
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={yuki.state === 'listening' && yuki.heard ? 'Done — send my question' : 'Talk to Yuki'}
        onPress={talkToYuki}
        style={styles.blossom}
        testID="yuki-talk"
      >
        <Blossom size={size} mode={yuki.state} pulse={onYukiWord} />
      </Pressable>

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
    </View>
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
