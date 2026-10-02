import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { initials } from '../lib/chatFormat';
import { signedUrls } from '../lib/photos';
import { colors as c } from '../theme/colors';
import { fontFamily } from '../theme/typography';

// A traveler's face: their profile photo when they've set one, otherwise
// their initials on their person color. Decorative — the surrounding
// control or text names the person.
export default function Avatar({
  name,
  path,
  color,
  size,
  style,
}: {
  name: string;
  path: string | null | undefined;
  color: string;
  size: number;
  style?: ViewStyle;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setUrl(null);
    if (path) {
      signedUrls('avatars', [path])
        .then((u) => live && setUrl(u[path] ?? null))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [path]);

  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.wrap, box, { backgroundColor: color }, style]} aria-hidden>
      {url && path ? (
        <Image source={{ uri: url, cacheKey: `avatars:${path}` }} style={box} contentFit="cover" accessibilityLabel="" transition={150} />
      ) : (
        <Text style={[styles.text, { fontSize: Math.round(size * 0.38) }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: {
    fontFamily: fontFamily.bodySemiBold,
    color: c.onAccent,
  },
});
