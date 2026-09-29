import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { Stop as TripStop } from '../lib/places';
import { shadow } from '../theme/colors';
import { fontFamily } from '../theme/typography';

const W = 150;
const H = 196;

// Photo card for one leg of the trip, like the "Inspiring Destinations"
// cards in the reference designs: rounded photo, soft dark fade at the
// bottom, city + dates in white, and a small arrow button.
export default function PlaceCard({ stop, onPress }: { stop: TripStop; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${stop.city}, ${stop.dates}`}
      style={({ pressed }) => [styles.card, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <Image source={stop.photo} style={styles.photo} resizeMode="cover" />
      <Svg style={StyleSheet.absoluteFill} width={W} height={H}>
        <Defs>
          <LinearGradient id={`fade-${stop.key}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.45" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.6} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill={`url(#fade-${stop.key})`} />
      </Svg>
      <View style={styles.footer}>
        <View style={styles.text}>
          <Text style={styles.city} numberOfLines={1}>
            {stop.city}
          </Text>
          <Text style={styles.dates}>{stop.dates}</Text>
        </View>
        <View style={styles.arrow}>
          <Ionicons name="arrow-forward" size={14} color="#1e2721" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: W,
    height: H,
    borderRadius: 22,
    overflow: 'hidden',
    boxShadow: shadow.card,
  },
  // Explicit size (not absoluteFill): RN-web only scales a cover image
  // correctly when the Image itself has dimensions.
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: W,
    height: H,
  },
  footer: {
    position: 'absolute',
    left: 12,
    right: 10,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  text: {
    flexShrink: 1,
  },
  city: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 19,
    color: '#ffffff',
  },
  dates: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.85)',
  },
  arrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
