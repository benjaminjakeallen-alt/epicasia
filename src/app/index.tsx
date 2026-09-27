import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type } from '../theme/typography';
import { useTheme } from '../theme/useTheme';

const SECTIONS: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Itinerary', icon: 'calendar-outline' },
  { label: 'Flights', icon: 'airplane-outline' },
  { label: 'Lodging', icon: 'bed-outline' },
  { label: 'Packing List', icon: 'briefcase-outline' },
  { label: 'Journal', icon: 'book-outline' },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.groupedBackground }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 28 }]}
      >
        <Text style={[type.caption, styles.eyebrow, { color: colors.accent }]}>
          UNITED STATES → ASIA
        </Text>
        <Text testID="home-title" style={[type.largeTitle, { color: colors.ink }]}>
          Epic Asia
        </Text>
        <Text style={[type.subtitle, styles.subtitle, { color: colors.inkSecondary }]}>
          Your trip, planned together.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {SECTIONS.map((section, i) => (
            <View
              key={section.label}
              style={[
                styles.row,
                i < SECTIONS.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.separator,
                },
              ]}
            >
              <View style={styles.rowLeft}>
                <Ionicons name={section.icon} size={19} color={colors.accent} />
                <Text style={[type.body, styles.rowLabel, { color: colors.ink }]}>
                  {section.label}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
            </View>
          ))}
        </View>
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
  rowLabel: {
    fontSize: 17,
  },
});
