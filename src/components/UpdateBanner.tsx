import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reloadApp, watchForUpdate } from '../lib/appUpdate';
import { colors as c, shadow } from '../theme/colors';
import { fontFamily } from '../theme/typography';

// A new build is on the site. Coming back to the app on home switches to
// it straight away; anywhere else (a message half-typed, a game running)
// a small bar offers it instead.
export default function UpdateBanner() {
  const [ready, setReady] = useState(false);
  const path = usePathname();
  const insets = useSafeAreaInsets();

  useEffect(
    () =>
      watchForUpdate((resumed) => {
        if (resumed && window.location.pathname === '/') reloadApp();
        else setReady(true);
      }),
    [],
  );

  if (!ready || path.endsWith('/play')) return null; // (games are full screen; it waits until you leave)
  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + 8 }]}>
      <View style={[styles.bar, { backgroundColor: c.card, boxShadow: shadow.float }]} accessibilityRole="alert" testID="update-banner">
        <Ionicons name="sparkles-outline" size={18} color={c.highlight} />
        <Text style={[styles.text, { color: c.ink }]}>A new version of Epic Asia is ready</Text>
        <Pressable
          accessibilityRole="button"
          onPress={reloadApp}
          style={({ pressed }) => [styles.button, { backgroundColor: pressed ? c.accentPressed : c.accent }]}
          testID="update-now"
        >
          <Text style={[styles.buttonText, { color: c.onAccent }]}>Update</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 480,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 26,
  },
  text: { flex: 1, fontFamily: fontFamily.bodyMedium, fontSize: 14, lineHeight: 19 },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fontFamily.bodySemiBold, fontSize: 15 },
});
