import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../components/Avatar';
import OrbitMenu, { type OrbitMenuItem } from '../../components/OrbitMenu';
import SkyBackdrop from '../../components/SkyBackdrop';
import Wordmark from '../../components/Wordmark';
import { useAuth } from '../../lib/AuthProvider';
import { useA11yMode } from '../../lib/a11yMode';
import { fetchUnreadCount, watchNewMessages } from '../../lib/chatUnread';
import { announce, isScreenReaderOn, watchScreenReader } from '../../lib/speech';
import { fetchProfile } from '../../lib/profile';
import { colors as palette, shadow } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

// Ring order = swipe order. Icons are the generated 3D miniatures
// (tools/menu-icons); `color` tints the selected label — sage green for every
// item (user, Oct 3 2026: "make them all green"). Items without an
// href are on the ring but show "Coming soon" until their screen exists.
const MENU: OrbitMenuItem[] = [
  { key: 'itinerary', label: 'Itinerary', caption: 'Day by day · Jun 6 – 19', color: palette.highlight, image: require('../../../assets/images/menu/itinerary.png'), href: '/(app)/itinerary' },
  { key: 'arrivals', label: 'Arrivals', caption: 'Visas, airports and your documents', color: palette.highlight, image: require('../../../assets/images/menu/arrivals.png'), href: '/(app)/arrivals' },
  { key: 'photos', label: 'Photos', caption: 'Everyone’s trip photos', color: palette.highlight, image: require('../../../assets/images/menu/photos.png'), href: '/(app)/photos' },
  { key: 'chat', label: 'Group Chat', caption: 'Everyone on the trip', color: palette.highlight, image: require('../../../assets/images/menu/chat.png'), href: '/(app)/chat' },
  { key: 'journal', label: 'Journal', caption: 'Your memories, photos and voice notes', color: palette.highlight, image: require('../../../assets/images/menu/journal.png'), href: '/(app)/journal' },
  { key: 'toolkit', label: 'Toolkit', caption: 'Currency, phrases, weather and map pins', color: palette.highlight, image: require('../../../assets/images/menu/satchel.png'), href: '/(app)/toolkit' },
  { key: 'games', label: 'Games', caption: 'Lost in Translation and more', color: palette.highlight, image: require('../../../assets/images/menu/games.png'), href: '/(app)/games' },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const { session } = useAuth();
  const router = useRouter();

  const fullName = session?.user.user_metadata?.display_name as string | undefined;
  const name = fullName?.split(' ')[0];

  // Your photo for the avatar (refreshed when you come back from Profile).
  const [avatar, setAvatar] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const myId = session?.user.id;
  useFocusEffect(
    useCallback(() => {
      if (!myId) return;
      fetchProfile(myId)
        .then((p) => setAvatar(p?.avatar_url ?? null))
        .catch(() => {});
      fetchUnreadCount(myId)
        .then(setUnread)
        .catch(() => {});
    }, [myId]),
  );
  // New messages from others bump the Group Chat badge live.
  useEffect(() => (myId ? watchNewMessages(myId, () => setUnread((n) => n + 1)) : undefined), [myId]);
  const menu = useMemo(() => MENU.map((m) => (m.key === 'chat' ? { ...m, badge: unread } : m)), [unread]);

  // Accessibility mode: large menu, each item spoken as it turns to the
  // front. Offered once to people already using VoiceOver or large text.
  const { mode, ready, update } = useA11yMode();
  const { fontScale } = useWindowDimensions();
  const [screenReader, setScreenReader] = useState(isScreenReaderOn);
  useEffect(() => watchScreenReader(setScreenReader), []);
  const needsHelp = screenReader || fontScale >= 1.3;
  const showOffer = ready && !mode.enabled && !mode.offered && needsHelp;
  const onFrontChange = useCallback(
    (item: OrbitMenuItem, index: number) => {
      if (!mode.enabled) return;
      const extra = item.href ? (item.badge ? `${item.badge} unread.` : item.caption) : 'Coming soon.';
      announce(`${item.label}, ${index + 1} of ${MENU.length}. ${extra}`, { speak: mode.speak, rate: mode.rate });
    },
    [mode.enabled, mode.speak, mode.rate],
  );

  // The home is one screen, no scrolling: greeting at the top, the orbit
  // menu filling the rest. The avatar opens your profile (and sign out).
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop height={560} />
      <View style={[styles.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.topRow}>
          <Wordmark size={24} testID="home-title" />
          <Pressable
            onPress={() => router.push('/(app)/profile')}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            testID="home-avatar"
            style={[styles.avatar, { backgroundColor: colors.card }]}
          >
            <Avatar name={fullName || session?.user.email || '?'} path={avatar} color={colors.accent} size={40} />
          </Pressable>
        </View>

        {showOffer ? (
          <View style={[styles.offer, { backgroundColor: colors.card }]} testID="a11y-offer">
            <Text style={[styles.offerTitle, { color: colors.ink }]}>Try large & spoken mode?</Text>
            <Text style={[styles.offerText, { color: colors.inkSecondary }]}>
              A bigger menu with every label showing, menu items read aloud as you turn it, and no intro.
            </Text>
            <View style={styles.offerRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => update({ enabled: true, offered: true })}
                style={({ pressed }) => [styles.offerYes, { backgroundColor: pressed ? colors.accentPressed : colors.accent }]}
              >
                <Text style={[styles.offerYesText, { color: colors.onAccent }]}>Turn it on</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => update({ offered: true })} style={styles.offerNo}>
                <Text style={[styles.offerNoText, { color: colors.highlight }]}>Not now</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text style={[styles.headline, { color: colors.ink }]}>
          Where are we going{name ? ',\n' : '?'}
          {name ? (
            <Text style={{ fontFamily: fontFamily.displayItalic, color: colors.highlight }}>{name}?</Text>
          ) : null}
        </Text>

        <OrbitMenu
          items={menu}
          large={mode.enabled}
          onFrontChange={onFrontChange}
          onOpen={(item) => item.href && router.push(item.href)}
        />
      </View>
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
  offer: {
    marginHorizontal: 22,
    marginTop: 18,
    borderRadius: 22,
    padding: 18,
    gap: 8,
    boxShadow: shadow.card,
  },
  offerTitle: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
  },
  offerText: {
    fontFamily: fontFamily.body,
    fontSize: 17,
    lineHeight: 24,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  offerYes: {
    height: 54,
    borderRadius: 27,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerYesText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 18,
  },
  offerNo: {
    height: 54,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  offerNoText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 18,
  },
});
