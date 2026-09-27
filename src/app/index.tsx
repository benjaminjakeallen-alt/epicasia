import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SECTIONS = ['Itinerary', 'Flights', 'Lodging', 'Packing List', 'Journal'];

export default function Home() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;

  return (
    <View style={[styles.screen, { backgroundColor: colors.groupedBackground }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      >
        <Text style={[styles.largeTitle, { color: colors.label }]}>Epic Asia</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryLabel }]}>
          Your upcoming trip, planned.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {SECTIONS.map((section, i) => (
            <View
              key={section}
              style={[
                styles.row,
                i < SECTIONS.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.separator,
                },
              ]}
            >
              <Text style={[styles.rowLabel, { color: colors.label }]}>{section}</Text>
              <Text style={[styles.rowChevron, { color: colors.tertiaryLabel }]}>›</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const lightColors = {
  groupedBackground: '#F2F2F7',
  card: '#FFFFFF',
  label: '#000000',
  secondaryLabel: '#3C3C43',
  tertiaryLabel: '#C7C7CC',
  separator: '#E5E5EA',
};

const darkColors = {
  groupedBackground: '#000000',
  card: '#1C1C1E',
  label: '#FFFFFF',
  secondaryLabel: '#EBEBF5',
  tertiaryLabel: '#48484A',
  separator: '#38383A',
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.37,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 4,
    marginBottom: 24,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowLabel: {
    fontSize: 17,
  },
  rowChevron: {
    fontSize: 20,
    fontWeight: '600',
  },
});
