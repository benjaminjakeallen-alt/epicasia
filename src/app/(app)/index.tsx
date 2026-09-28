import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HeaderGlow from '../../components/HeaderGlow';
import {
  FlightsIcon,
  GamesIcon,
  ItineraryIcon,
  JournalIcon,
  LodgingIcon,
  PackingIcon,
} from '../../components/MenuIcons';
import OrbitMenu, { type OrbitMenuItem } from '../../components/OrbitMenu';
import Wordmark from '../../components/Wordmark';
import { useAuth } from '../../lib/AuthProvider';
import { supabase } from '../../lib/supabase';
import { TRIP } from '../../lib/trip';
import { darkColors, legColors } from '../../theme/colors';
import { type } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

// Ring order = swipe order. Colors reuse the leg palette so the menu sits in
// the same family as the intro's landmarks; items without an href are on
// the ring but show "Coming soon" until their screen exists.
const MENU: OrbitMenuItem[] = [
  { key: 'itinerary', label: 'Itinerary', caption: 'DAY BY DAY · JUN 6 – 19', color: darkColors.highlight, Icon: ItineraryIcon, href: '/(app)/itinerary' },
  { key: 'flights', label: 'Flights', caption: 'COMING SOON', color: legColors.beijing, Icon: FlightsIcon },
  { key: 'lodging', label: 'Lodging', caption: 'COMING SOON', color: legColors.hongKong, Icon: LodgingIcon },
  { key: 'packing', label: 'Packing List', caption: 'COMING SOON', color: legColors.shanghai, Icon: PackingIcon },
  { key: 'journal', label: 'Journal', caption: 'COMING SOON', color: legColors.tokyo, Icon: JournalIcon },
  { key: 'games', label: 'Games', caption: 'COMING SOON', color: darkColors.accent, Icon: GamesIcon },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const { session } = useAuth();
  const router = useRouter();

  const name = (session?.user.user_metadata?.display_name as string | undefined)?.split(' ')[0];

  return (
    <View style={[styles.screen, { backgroundColor: colors.groupedBackground }]}>
      <HeaderGlow />
      <View style={[styles.header, { paddingTop: insets.top + 28 }]}>
        <Text style={[type.caption, styles.eyebrow, { color: colors.highlight }]}>
          {TRIP.dates.toUpperCase()}
        </Text>
        <Wordmark size={40} testID="home-title" />
        <Text style={[type.subtitle, styles.subtitle, { color: colors.inkSecondary }]}>
          {name ? `Welcome, ${name}` : `Signed in as ${session?.user.email}`}
        </Text>
      </View>

      <OrbitMenu items={MENU} onOpen={(item) => item.href && router.push(item.href)} />

      <Pressable
        style={[styles.signOut, { marginBottom: insets.bottom + 16 }]}
        onPress={() => supabase.auth.signOut()}
        hitSlop={8}
      >
        <Text style={[type.body, { color: colors.inkTertiary }]}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
  },
  eyebrow: {
    marginBottom: 8,
  },
  subtitle: {
    marginTop: 8,
  },
  signOut: {
    alignItems: 'center',
    paddingTop: 8,
  },
});
