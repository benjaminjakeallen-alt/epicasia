import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OrbitMenu, { type OrbitMenuItem } from '../../components/OrbitMenu';
import SkyBackdrop from '../../components/SkyBackdrop';
import Wordmark from '../../components/Wordmark';
import { useAuth } from '../../lib/AuthProvider';
import { supabase } from '../../lib/supabase';
import { colors as palette, legTextColors, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

// Ring order = swipe order. Icons are the generated 3D miniatures
// (tools/menu-icons); `color` tints the selected label. Items without an
// href are on the ring but show "Coming soon" until their screen exists.
const MENU: OrbitMenuItem[] = [
  { key: 'itinerary', label: 'Itinerary', caption: 'Day by day · Jun 6 – 19', color: palette.accent, image: require('../../../assets/images/menu/itinerary.png'), href: '/(app)/itinerary' },
  { key: 'flights', label: 'Flights', caption: 'Boarding passes · NRT → HKG', color: legTextColors.beijing, image: require('../../../assets/images/menu/flights.png'), href: '/(app)/flights' },
  { key: 'photos', label: 'Photos', caption: 'Everyone’s trip photos', color: legTextColors.hongKong, image: require('../../../assets/images/menu/photos.png'), href: '/(app)/photos' },
  { key: 'chat', label: 'Group Chat', caption: 'Everyone on the trip', color: legTextColors.kyoto, image: require('../../../assets/images/menu/chat.png'), href: '/(app)/chat' },
  { key: 'journal', label: 'Journal', caption: 'Your memories, photos and voice notes', color: legTextColors.tokyo, image: require('../../../assets/images/menu/journal.png'), href: '/(app)/journal' },
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

  // The home is one screen, no scrolling: greeting at the top, the orbit
  // menu filling the rest. Sign out lives behind the avatar.
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop height={560} />
      <View style={[styles.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.topRow}>
          <Wordmark size={24} testID="home-title" />
          <Pressable
            onPress={() => setAccountOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityLabel="Account"
            style={[styles.avatar, { backgroundColor: colors.card }]}
          >
            <Text style={[styles.avatarText, { color: colors.accent }]}>{initial}</Text>
          </Pressable>
        </View>

        <Text style={[styles.headline, { color: colors.ink }]}>
          Where are we going{name ? ',\n' : '?'}
          {name ? (
            <Text style={{ fontFamily: fontFamily.displayItalic, color: colors.highlight }}>{name}?</Text>
          ) : null}
        </Text>

        <OrbitMenu items={MENU} onOpen={(item) => item.href && router.push(item.href)} />
      </View>

      {accountOpen ? (
        <>
          <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={() => setAccountOpen(false)} accessibilityLabel="Close account menu" />
          <View style={[styles.accountCard, { top: insets.top + 66, backgroundColor: colors.card }]}>
            <Text style={[type.cardTitle, { color: colors.ink }]} numberOfLines={1}>
              {fullName || 'Signed in'}
            </Text>
            {session?.user.email ? (
              <Text style={[type.caption, { color: colors.inkSecondary }]} numberOfLines={1}>
                {session.user.email}
              </Text>
            ) : null}
            <Pressable
              onPress={() => supabase.auth.signOut()}
              accessibilityRole="button"
              style={({ pressed }) => [styles.signOut, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[type.bodyStrong, { color: colors.error }]}>Sign out</Text>
            </Pressable>
          </View>
        </>
      ) : null}
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.card,
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
  page: {
    flex: 1,
  },
  accountCard: {
    position: 'absolute',
    right: 18,
    width: 230,
    borderRadius: 20,
    padding: 16,
    gap: 2,
    boxShadow: shadow.float,
  },
  signOut: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
