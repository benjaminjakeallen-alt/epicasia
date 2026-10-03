import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../components/CircleButton';
import SkyBackdrop from '../../components/SkyBackdrop';
import YukiMark from '../../components/YukiMark';
import TypingIndicator from '../../components/chat/TypingIndicator';
import { useAuth } from '../../lib/AuthProvider';
import { newId } from '../../lib/chat';
import { firstName } from '../../lib/chatFormat';
import { confirm } from '../../lib/confirm';
import {
  YUKI_SUGGESTIONS,
  askYuki,
  clearConversation,
  loadConversation,
  saveConversation,
  type YukiTurn,
} from '../../lib/yuki';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';

// Yuki (雪), the trip's AI assistant: ask about today's plan, flights,
// arrivals, pins, the chat, your journal, weather, money… Answers come from
// the app's own data (supabase/functions/yuki). The conversation stays on
// this phone.
export default function Yuki() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id ?? '';
  const name = String(session?.user.user_metadata?.display_name ?? '');
  const [turns, setTurns] = useState<YukiTurn[]>([]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const list = useRef<FlatList<YukiTurn>>(null);

  useEffect(() => {
    if (uid) loadConversation(uid).then(setTurns);
  }, [uid]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || thinking) return;
    const mine: YukiTurn = { id: newId(), role: 'user', text: q };
    const history = [...turns, mine];
    setTurns(history);
    setText('');
    setThinking(true);
    try {
      const { reply, remaining: left } = await askYuki(history, firstName(name));
      const next = [...history, { id: newId(), role: 'assistant' as const, text: reply }];
      setTurns(next);
      setRemaining(left);
      saveConversation(uid, next);
    } catch (e) {
      // Shown as Yuki's reply, but not sent back as part of the conversation.
      const next = [...history, { id: newId(), role: 'assistant' as const, text: (e as Error).message, failed: true }];
      setTurns(next);
      saveConversation(uid, next);
    } finally {
      setThinking(false);
    }
  }

  async function startOver() {
    if (!turns.length) return;
    if (!(await confirm('Start a new chat?', 'This conversation with Yuki is cleared from this phone.'))) return;
    setTurns([]);
    clearConversation(uid);
  }

  const shown = [...turns].reverse(); // inverted list: newest at the bottom

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop height={260} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <View style={styles.headerTitle}>
          <YukiMark size={30} />
          <Text style={styles.title} accessibilityRole="header">
            Yuki
          </Text>
        </View>
        <CircleButton icon="create-outline" label="New chat" onPress={startOver} testID="yuki-new" />
      </View>

      {turns.length === 0 ? (
        <View style={styles.welcome}>
          <YukiMark size={72} />
          <Text style={styles.hello}>{`Hi${name ? ` ${firstName(name)}` : ''}, I’m Yuki`}</Text>
          <Text style={[type.body, styles.helloBody]}>
            Ask me anything about the trip — the plan for any day, flights, getting through the airports, what the
            group said, the weather, money, phrases.
          </Text>
          <View style={styles.suggestions}>
            {YUKI_SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                accessibilityRole="button"
                onPress={() => ask(s)}
                style={({ pressed }) => [styles.suggestion, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
              >
                <Text style={styles.suggestionText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={list}
          data={shown}
          inverted
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          testID="yuki-list"
          renderItem={({ item }) =>
            item.role === 'user' ? (
              <View style={[styles.row, styles.rowMine]}>
                <View style={[styles.bubble, styles.bubbleMine]}>
                  <Text style={[styles.text, { color: c.onBubbleMine }]} selectable>
                    {item.text}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.row} accessible accessibilityLabel={`Yuki: ${item.text}`}>
                <YukiMark size={28} />
                <View style={[styles.bubble, styles.bubbleYuki, item.failed && styles.bubbleFailed]}>
                  <Text style={[styles.text, { color: item.failed ? c.inkSecondary : c.ink }]} selectable testID="yuki-reply">
                    {item.text}
                  </Text>
                </View>
              </View>
            )
          }
        />
      )}

      {thinking ? <TypingIndicator label="Yuki is thinking" /> : null}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {remaining !== null && remaining <= 10 ? (
          <Text style={[type.caption, styles.remaining]}>{remaining} questions left today</Text>
        ) : null}
        <View style={styles.bar}>
          <View style={styles.inputWrap}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ask Yuki…"
              placeholderTextColor={c.inkTertiary}
              style={styles.input}
              accessibilityLabel="Ask Yuki"
              maxLength={2000}
              onSubmitEditing={() => ask(text)}
              returnKeyType="send"
              testID="yuki-input"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !text.trim() || thinking }}
            disabled={!text.trim() || thinking}
            onPress={() => ask(text)}
            testID="yuki-send"
            style={[styles.send, { backgroundColor: text.trim() && !thinking ? c.accent : c.accentDisabled }]}
          >
            <Ionicons name="arrow-up" size={20} color={c.onAccent} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2, color: c.ink },
  welcome: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, gap: 10 },
  hello: { fontFamily: fontFamily.display, fontSize: 28, color: c.ink, marginTop: 6, textAlign: 'center' },
  helloBody: { color: c.inkSecondary, textAlign: 'center' },
  suggestions: { alignSelf: 'stretch', gap: 8, marginTop: 10 },
  suggestion: { borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16, minHeight: 44, boxShadow: shadow.card },
  suggestionText: { fontFamily: fontFamily.bodyMedium, fontSize: 15, color: c.highlight },
  list: { paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '100%' },
  rowMine: { justifyContent: 'flex-end' },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '82%' },
  bubbleMine: { backgroundColor: c.bubbleMine, borderBottomRightRadius: 6 },
  bubbleYuki: { backgroundColor: c.card, borderBottomLeftRadius: 6, boxShadow: shadow.card, flexShrink: 1 },
  bubbleFailed: { backgroundColor: c.surfacePressed, boxShadow: 'none' },
  text: { ...type.body, fontSize: 15.5, lineHeight: 22 },
  composer: {
    backgroundColor: c.barBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    paddingTop: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  remaining: { color: c.inkTertiary, textAlign: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inputWrap: { flex: 1, backgroundColor: c.card, borderRadius: 22, boxShadow: shadow.card },
  input: { ...type.body, color: c.ink, paddingHorizontal: 16, height: 44 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
