import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HeaderGlow from '../../components/HeaderGlow';
import Wordmark from '../../components/Wordmark';
import { useAuth } from '../../lib/AuthProvider';
import { supabase } from '../../lib/supabase';
import { TRIP } from '../../lib/trip';
import { type } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

const SECTIONS: { label: string; icon: keyof typeof Ionicons.glyphMap; href?: string }[] = [
  { label: 'Itinerary', icon: 'calendar-outline', href: '/(app)/itinerary' },
  { label: 'Flights', icon: 'airplane-outline' },
  { label: 'Lodging', icon: 'bed-outline' },
  { label: 'Packing List', icon: 'briefcase-outline' },
  { label: 'Journal', icon: 'book-outline' },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const { session } = useAuth();
  const router = useRouter();

  return (
    <View style={[styles.screen, { backgroundColor: colors.groupedBackground }]}>
      <HeaderGlow />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 28 }]}
      >
        <Text style={[type.caption, styles.eyebrow, { color: colors.highlight }]}>
          {TRIP.dates.toUpperCase()}
        </Text>
        <Wordmark size={40} testID="home-title" />
        <Text style={[type.subtitle, styles.subtitle, { color: colors.inkSecondary }]}>
          Signed in as {session?.user.email}
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {SECTIONS.map((section, i) => (
            <Pressable
              key={section.label}
              disabled={!section.href}
              onPress={() => section.href && router.push(section.href)}
              style={[
                styles.row,
                i < SECTIONS.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.separator,
                },
              ]}
            >
              <View style={styles.rowLeft}>
                <Ionicons name={section.icon} size={19} color={colors.highlight} />
                <Text
                  style={[
                    type.body,
                    { color: section.href ? colors.ink : colors.inkTertiary },
                  ]}
                >
                  {section.label}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()} hitSlop={8}>
          <Text style={[type.body, { color: colors.inkSecondary }]}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  eyebrow: {
    marginBottom: 8,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 32,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  signOut: {
    marginTop: 24,
    alignItems: 'center',
  },
});
