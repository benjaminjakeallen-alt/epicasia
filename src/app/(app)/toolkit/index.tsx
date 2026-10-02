import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// Toolkit: small helpers for out and about — all of them work with no
// signal. (Weather and shared map pins come next.)

const TOOLS: { key: string; title: string; line: string; icon: keyof typeof Ionicons.glyphMap; href: Href }[] = [
  {
    key: 'currency',
    title: 'Currency converter',
    line: 'Yen, yuan and Hong Kong dollars, saved for offline',
    icon: 'cash-outline',
    href: '/(app)/toolkit/currency',
  },
  {
    key: 'phrases',
    title: 'Phrasebook',
    line: 'Japanese, Mandarin and Cantonese, with sound',
    icon: 'chatbubbles-outline',
    href: '/(app)/toolkit/phrases',
  },
];

export default function Toolkit() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header">
          Toolkit
        </Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {TOOLS.map((t) => (
          <Pressable
            key={t.key}
            testID={`tool-${t.key}`}
            accessibilityRole="button"
            accessibilityLabel={`${t.title}. ${t.line}`}
            onPress={() => router.push(t.href)}
            style={({ pressed }) => [styles.card, { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name={t.icon} size={26} color={colors.highlight} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: colors.ink }]}>{t.title}</Text>
              <Text style={[type.body, { color: colors.inkSecondary }]}>{t.line}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.inkTertiary} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
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
  spacer: { width: 44 },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 18, boxShadow: shadow.card },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 27 },
});
