import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OrbitMenu, { type OrbitMenuItem } from '../../components/OrbitMenu';
import PlaceCard from '../../components/PlaceCard';
import SkyBackdrop from '../../components/SkyBackdrop';
import Wordmark from '../../components/Wordmark';
import { useAuth } from '../../lib/AuthProvider';
import { STOPS } from '../../lib/places';
import { supabase } from '../../lib/supabase';
import { TRIP } from '../../lib/trip';
import { colors as palette, legColors } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

// Ring order = swipe order. Icons are the rendered 3D-on-a-cloud images
// (tools/menu-icons); `color` tints the selected label. Items without an
// href are on the ring but show "Coming soon" until their screen exists.
const MENU: OrbitMenuItem[] = [
  { key: 'itinerary', label: 'Itinerary', caption: 'Day by day · Jun 6 – 19', color: palette.accent, image: require('../../../assets/images/menu/itinerary.png'), href: '/(app)/itinerary' },
  { key: 'flights', label: 'Flights', caption: 'Boarding passes · NRT → HKG', color: legColors.beijing, image: require('../../../assets/images/menu/flights.png'), href: '/(app)/flights' },
  { key: 'lodging', label: 'Lodging', caption: 'Where we\'re staying · 5 cities', color: legColors.hongKong, image: require('../../../assets/images/menu/lodging.png'), href: '/(app)/lodging' },
  { key: 'packing', label: 'Packing List', caption: 'Coming soon', color: legColors.shanghai, image: require('../../../assets/images/menu/packing.png') },
  { key: 'journal', label: 'Journal', caption: 'Coming soon', color: legColors.tokyo, image: require('../../../assets/images/menu/journal.png') },
  { key: 'games', label: 'Games', caption: 'Coming soon', color: palette.seal, image: require('../../../assets/images/menu/games.png') },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const { session } = useAuth();
  const router = useRouter();

  const fullName = session?.user.user_metadata?.display_name as string | undefined;
  const name = fullName?.split(' ')[0];
  const initial = (fullName || session?.user.email || '?').trim().charAt(0).toUpperCase();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop height={560} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Wordmark size={24} testID="home-title" />
          <View style={[styles.avatar, { backgroundColor: colors.card }]}>
            <Text style={[styles.avatarText, { color: colors.accent }]}>{initial}</Text>
          </View>
        </View>

        <Text style={[styles.headline, { color: colors.ink }]}>
          Where are we going{name ? ',\n' : '?'}
          {name ? (
            <Text style={{ fontFamily: fontFamily.displayItalic, color: colors.highlight }}>{name}?</Text>
          ) : null}
        </Text>
        <Text style={[type.subtitle, styles.meta, { color: colors.inkSecondary }]}>
          {TRIP.dates} · {TRIP.travelers} travelers · {TRIP.cities} cities
        </Text>

        <OrbitMenu
          items={MENU}
          height={430}
          onOpen={(item) => item.href && router.push(item.href)}
        />

        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Your route</Text>
          <Pressable onPress={() => router.push('/(app)/itinerary')} hitSlop={8}>
            <Text style={[type.bodyStrong, { color: colors.highlight }]}>See itinerary</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cards}
        >
          {STOPS.map((stop) => (
            <PlaceCard key={stop.key} stop={stop} onPress={() => router.push('/(app)/itinerary')} />
          ))}
        </ScrollView>

        <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()} hitSlop={8}>
          <Text style={[type.body, { color: colors.inkTertiary }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topRow: {
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 14px rgba(30,39,33,0.10)',
  },
  avatarText: {
    fontFamily: fontFamily.displayMedium,
    fontSize: 19,
  },
  headline: {
    paddingHorizontal: 22,
    marginTop: 26,
    fontFamily: fontFamily.display,
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: -0.7,
  },
  meta: {
    paddingHorizontal: 22,
    marginTop: 8,
  },
  sectionHead: {
    paddingHorizontal: 22,
    marginTop: 8,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    letterSpacing: -0.3,
  },
  cards: {
    paddingHorizontal: 22,
    gap: 12,
  },
  signOut: {
    alignItems: 'center',
    marginTop: 30,
  },
});
