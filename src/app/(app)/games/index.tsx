import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { GAMES } from '../../../lib/games';
import { shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// Games hub: one card per game. New games are added to GAMES in
// src/lib/games.ts. Photo games score by upvotes received (game_entries/
// game_votes); arcade games by runs (game_scores) — each has its own board.

export default function Games() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header">
          Games
        </Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {GAMES.map((g) => (
          <Pressable
            key={g.key}
            testID={`game-${g.key}`}
            accessibilityRole="button"
            accessibilityLabel={`${g.title}. ${g.line}`}
            onPress={() => router.push(g.href)}
            style={({ pressed }) => [styles.card, { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name={g.icon as keyof typeof Ionicons.glyphMap} size={26} color={colors.highlight} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: colors.ink }]}>{g.title}</Text>
              <Text style={[type.body, { color: colors.inkSecondary }]}>{g.line}</Text>
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
