import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { countryColor } from '../../../lib/arrivals';
import { todayDay } from '../../../lib/dates';
import { isIos } from '../../../lib/device';
import { CATEGORIES, EMERGENCY, LANGUAGES, PHRASES, type LangKey, type Phrase } from '../../../lib/phrases';
import { stopForDay } from '../../../lib/places';
import { colors as c, shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// Phrasebook: Japanese, Mandarin and Cantonese essentials. Each phrase
// shows the local script, a pronunciation guide and the English; tap it to
// show it full screen (hand the phone over) and play it aloud with the
// phone's own voice for that language.

const LEG_LANG: Record<string, LangKey> = { tokyo: 'ja', kyoto: 'ja', beijing: 'zh', shanghai: 'zh', hongKong: 'yue' };

async function speak(text: string, language: string): Promise<boolean> {
  try {
    const Speech = await import('expo-speech');
    // The voice list can wait forever on a browser with no voices; give up
    // after a moment and just try speaking.
    const voices = await Promise.race([
      Speech.getAvailableVoicesAsync().catch(() => []),
      new Promise<[]>((resolve) => setTimeout(() => resolve([]), 800)),
    ]);
    // Only refuse when the list is known and has nothing for this language
    // (an empty list can just mean it hasn't loaded yet).
    const prefix = language.toLowerCase();
    const match = (v: { language?: string }) => (v.language ?? '').toLowerCase().replace('_', '-').startsWith(prefix);
    if (voices.length > 0 && !voices.some(match)) return false;
    await Speech.stop();
    Speech.speak(text, { language, rate: 0.85 });
    return true;
  } catch {
    return false;
  }
}

export default function Phrasebook() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const [lang, setLang] = useState<LangKey>(() => LEG_LANG[stopForDay(todayDay())?.key ?? ''] ?? 'ja');
  const [shown, setShown] = useState<Phrase | null>(null);
  const [noVoice, setNoVoice] = useState(false);
  const L = LANGUAGES.find((l) => l.key === lang)!;
  const tint = countryColor(L.country);

  async function play(p: Phrase) {
    const ok = await speak(p[lang].text, L.speech);
    setNoVoice(!ok);
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header">
          Phrasebook
        </Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {LANGUAGES.map((l) => {
          const on = l.key === lang;
          const t = countryColor(l.country);
          return (
            <Pressable
              key={l.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              aria-selected={on}
              accessibilityLabel={`${l.name}, ${l.where}`}
              onPress={() => {
                setLang(l.key);
                setNoVoice(false);
              }}
              style={[styles.tab, { backgroundColor: on ? t.text : colors.card, borderColor: on ? t.text : colors.border }]}
            >
              <Text style={[styles.tabName, { color: on ? colors.onAccent : colors.ink }]}>{l.name}</Text>
              <Text style={[styles.tabWhere, { color: on ? colors.onAccent : colors.inkSecondary }]} numberOfLines={1}>
                {l.where}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {noVoice ? (
          <View style={[styles.notice, { backgroundColor: colors.warningSoft }]} accessibilityRole="alert" testID="no-voice">
            <Ionicons name="volume-mute-outline" size={18} color={colors.warning} />
            <Text style={[type.body, styles.flex, { color: colors.ink }]}>
              {isIos()
                ? `No ${L.name} voice on this phone yet. Add one in Settings → Accessibility → Spoken Content → Voices.`
                : `No ${L.name} voice is available here.`}
            </Text>
          </View>
        ) : null}

        {CATEGORIES.map((cat) => (
          <View key={cat} style={styles.group}>
            <Text style={[styles.section, { color: colors.ink }]} accessibilityRole="header">
              {cat}
            </Text>
            {cat === 'Help' ? (
              <Text style={[type.bodyStrong, { color: colors.danger }]} testID="emergency">
                {EMERGENCY[lang]}
              </Text>
            ) : null}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {PHRASES[cat].map((ph, i) => (
                <View
                  key={ph.id}
                  style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
                >
                  <Pressable
                    testID="phrase"
                    accessibilityRole="button"
                    accessibilityLabel={`${ph.en}. ${ph[lang].say}`}
                    accessibilityHint="Shows it large, to hand to someone"
                    onPress={() => setShown(ph)}
                    style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text style={[type.caption, { color: colors.inkSecondary }]}>{ph.en}</Text>
                    <Text style={[styles.native, { color: colors.ink }]}>{ph[lang].text}</Text>
                    <Text style={[styles.say, { color: tint.text }]}>{ph[lang].say}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Say “${ph.en}” in ${L.name}`}
                    onPress={() => play(ph)}
                    style={styles.speak}
                  >
                    <Ionicons name="volume-high-outline" size={22} color={colors.highlight} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ))}
        <Text style={[type.caption, { color: colors.inkSecondary }]}>{L.guide} shows how to say it.</Text>
      </ScrollView>

      {shown ? (
        <ShowCard phrase={shown} lang={lang} onClose={() => setShown(null)} onSpeak={() => play(shown)} />
      ) : null}
    </View>
  );
}

/** The phrase full screen: big script to show someone, plus play. */
function ShowCard({ phrase, lang, onClose, onSpeak }: { phrase: Phrase; lang: LangKey; onClose: () => void; onSpeak: () => void }) {
  const insets = useSafeAreaInsets();
  const L = LANGUAGES.find((l) => l.key === lang)!;
  return (
    // No fade on web: RN-web's Modal only unmounts after its CSS animationend.
    <Modal visible animationType="none" onRequestClose={onClose}>
      <View style={[styles.show, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]} testID="phrase-card">
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={28} color={c.ink} />
        </Pressable>
        <View style={styles.showBody}>
          <Text style={styles.showNative} adjustsFontSizeToFit numberOfLines={4} accessibilityLanguage={L.speech}>
            {phrase[lang].text}
          </Text>
          <Text style={styles.showSay}>{phrase[lang].say}</Text>
          <Text style={styles.showEn}>{phrase.en}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onSpeak}
          style={({ pressed }) => [styles.play, { backgroundColor: pressed ? c.accentPressed : c.accent }]}
        >
          <Ionicons name="volume-high" size={22} color={c.onAccent} />
          <Text style={styles.playText}>Play in {L.name}</Text>
        </Pressable>
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
  spacer: { width: 44 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  tab: { flex: 1, minHeight: 56, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabName: { fontFamily: fontFamily.bodySemiBold, fontSize: 15 },
  tabWhere: { fontFamily: fontFamily.body, fontSize: 12 },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 18 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14 },
  group: { gap: 8 },
  section: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 27 },
  card: { borderRadius: 22, paddingLeft: 18, paddingRight: 6, boxShadow: shadow.card },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, paddingVertical: 12, gap: 2 },
  native: { fontSize: 22, lineHeight: 30 },
  say: { fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 },
  speak: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  show: { flex: 1, backgroundColor: c.background, paddingHorizontal: 24 },
  close: { alignSelf: 'flex-end', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  showBody: { flex: 1, justifyContent: 'center', gap: 18 },
  showNative: { fontSize: 64, lineHeight: 80, color: c.ink, textAlign: 'center' },
  showSay: { fontFamily: fontFamily.bodyMedium, fontSize: 22, lineHeight: 30, color: c.highlight, textAlign: 'center' },
  showEn: { fontFamily: fontFamily.display, fontSize: 24, lineHeight: 30, color: c.inkSecondary, textAlign: 'center' },
  play: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 28,
  },
  playText: { fontFamily: fontFamily.bodySemiBold, fontSize: 17, color: c.onAccent },
});
