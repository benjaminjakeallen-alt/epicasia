import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import OfflineNotice from '../../../components/OfflineNotice';
import { DocsSkeleton } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { useAuth } from '../../../lib/AuthProvider';
import { confirm } from '../../../lib/confirm';
import { peek } from '../../../lib/offline';
import { deletePin, fetchPins, mapLinks, pinCategory, type Pin } from '../../../lib/pins';
import { CITIES } from '../../../lib/weather';
import { colors as c, legTextColors, shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// Map pins: the group's saved places, by city. Each opens in Apple Maps or
// Google Maps, and its address can be shown full screen for a taxi driver.

export default function Pins() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Pin | null>(null);

  const load = useCallback(() => {
    setError(null);
    peek<Pin[]>('pins').then((saved) => {
      if (saved) {
        setPins((cur) => (cur.length ? cur : saved));
        setLoading(false);
      }
    });
    fetchPins()
      .then(setPins)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function remove(pin: Pin) {
    if (!(await confirm('Remove this pin?', `“${pin.name}” will be removed for everyone.`, 'Remove', true))) return;
    try {
      await deletePin(pin.id);
      setPins((prev) => prev.filter((p) => p.id !== pin.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove');
    }
  }

  const groups = [
    ...CITIES.map((city) => ({ key: city.key as string, title: city.name, color: legTextColors[city.key], pins: pins.filter((p) => p.city === city.key) })),
    { key: 'anywhere', title: 'Anywhere', color: colors.ink, pins: pins.filter((p) => !p.city) },
  ].filter((g) => g.pins.length);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header">
          Map pins
        </Text>
        <CircleButton icon="add" label="Add a pin" testID="pins-add-button" onPress={() => router.push('/(app)/toolkit/new-pin')} />
      </View>
      <OfflineNotice />

      {loading ? (
        <DocsSkeleton label="Loading map pins" />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {error ? <Text style={[type.body, { color: colors.error }]}>{error}</Text> : null}
          {pins.length === 0 && !error ? (
            <View style={[styles.empty, { backgroundColor: colors.card }]}>
              <Ionicons name="map-outline" size={34} color={colors.highlight} />
              <Text style={[type.cardTitle, { color: colors.ink }]}>Save the places that matter</Text>
              <Text style={[type.body, { color: colors.inkSecondary }]}>
                Hotels, meeting points, that noodle shop. Everyone on the trip sees them, and each one opens in Maps.
              </Text>
            </View>
          ) : null}

          {groups.map((g) => (
            <View key={g.key} style={styles.group}>
              <Text style={[styles.section, { color: g.color }]} accessibilityRole="header">
                {g.title}
              </Text>
              {g.pins.map((pin) => {
                const cat = pinCategory(pin.category);
                const links = mapLinks(pin);
                const mine = pin.created_by === session?.user.id;
                return (
                  <View key={pin.id} style={[styles.card, { backgroundColor: colors.card }]} testID="pin">
                    <View style={styles.top}>
                      <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
                        <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.highlight} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={[type.cardTitle, { color: colors.ink }]}>{pin.name}</Text>
                        <Text style={[type.caption, { color: colors.inkSecondary }]}>
                          {cat.label}
                          {pin.lat != null ? ' · exact spot saved' : ''}
                        </Text>
                      </View>
                      {mine ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${pin.name}`}
                          onPress={() => remove(pin)}
                          style={styles.iconHit}
                        >
                          <Ionicons name="trash-outline" size={19} color={colors.inkTertiary} />
                        </Pressable>
                      ) : null}
                    </View>
                    {pin.address ? (
                      <Text style={[styles.address, { color: colors.ink }]} selectable>
                        {pin.address}
                      </Text>
                    ) : null}
                    {pin.note ? <Text style={[type.body, { color: colors.inkSecondary }]}>{pin.note}</Text> : null}
                    <View style={styles.actions}>
                      <Action label="Apple Maps" icon="navigate-outline" a11y={`Open ${pin.name} in Apple Maps`} onPress={() => Linking.openURL(links.apple).catch(() => {})} />
                      <Action label="Google Maps" icon="map-outline" a11y={`Open ${pin.name} in Google Maps`} onPress={() => Linking.openURL(links.google).catch(() => {})} />
                      {pin.address ? (
                        <Action label="Show address" icon="expand-outline" a11y={`Show the address of ${pin.name} large`} onPress={() => setShown(pin)} />
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {shown ? <AddressCard pin={shown} onClose={() => setShown(null)} /> : null}
    </View>
  );
}

function Action({ label, icon, a11y, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; a11y: string; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { backgroundColor: pressed ? colors.accentSoft : colors.cardRaised, borderColor: colors.border }]}
    >
      <Ionicons name={icon} size={16} color={colors.highlight} />
      <Text style={[styles.actionText, { color: colors.highlight }]}>{label}</Text>
    </Pressable>
  );
}

/** The address full screen, to show a taxi driver. */
function AddressCard({ pin, onClose }: { pin: Pin; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType={Platform.OS === 'web' ? 'none' : 'fade'} onRequestClose={onClose}>
      <View style={[styles.show, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]} testID="address-card">
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={28} color={c.ink} />
        </Pressable>
        <View style={styles.showBody}>
          <Text style={styles.showName}>{pin.name}</Text>
          <Text style={styles.showAddress} adjustsFontSizeToFit numberOfLines={6} selectable>
            {pin.address}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2 },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 18 },
  empty: { borderRadius: 22, padding: 20, gap: 8, alignItems: 'flex-start', boxShadow: shadow.card },
  group: { gap: 10 },
  section: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 27 },
  card: { borderRadius: 22, padding: 16, gap: 10, boxShadow: shadow.card },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  address: { fontSize: 17, lineHeight: 24 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
  },
  actionText: { fontFamily: fontFamily.bodySemiBold, fontSize: 14 },
  show: { flex: 1, backgroundColor: c.background, paddingHorizontal: 24 },
  close: { alignSelf: 'flex-end', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  showBody: { flex: 1, justifyContent: 'center', gap: 20 },
  showName: { fontFamily: fontFamily.display, fontSize: 26, lineHeight: 32, color: c.inkSecondary, textAlign: 'center' },
  showAddress: { fontSize: 44, lineHeight: 58, color: c.ink, textAlign: 'center' },
});
