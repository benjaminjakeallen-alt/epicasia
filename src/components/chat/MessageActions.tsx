import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MORE_REACTIONS, QUICK_REACTIONS } from '../../lib/chat';
import { useLast, usePresence } from '../../lib/socialMotion';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';

export type SheetAction = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; destructive?: boolean; onPress: () => void };

type Props = {
  visible: boolean;
  preview: string;
  myReactions: string[];
  onReact: (emoji: string) => void;
  actions: SheetAction[];
  onClose: () => void;
  bottomInset: number;
};

// Long-press sheet: a reaction bar (+ a wider emoji picker) and the
// message's actions. A bottom sheet rather than a popover so it's always
// reachable with a thumb, whatever bubble was pressed.
export default function MessageActions({ visible, onReact, onClose, bottomInset, ...rest }: Props) {
  const [more, setMore] = useState(false);
  // The scrim fades and the sheet slides up on a spring, and back down when
  // it closes — showing what it last held while it leaves.
  const { mounted, t } = usePresence(visible);
  const { preview, myReactions, actions } = useLast(rest, visible);
  const [sheetH, setSheetH] = useState(460);

  // Back to the short emoji bar once it has gone (not while it slides away).
  if (!mounted && more) setMore(false);
  const close = onClose;

  return (
    // No Modal fade on web: RN-web's Modal only unmounts after its CSS fade's
    // animationend, and when that never fires the sheet can't reopen. The
    // motion is ours (usePresence) instead.
    <Modal visible={mounted} transparent animationType="none" onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: t }]}>
        <Pressable accessibilityRole="button" style={styles.scrim} onPress={close} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          styles.sheet,
          { paddingBottom: Math.max(bottomInset, 14) + 6 },
          { transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0], extrapolate: 'clamp' }) }] },
        ]}
        testID="message-actions"
      >
        <View style={styles.handle} />
        {preview ? (
          <Text style={styles.preview} numberOfLines={2}>
            {preview}
          </Text>
        ) : null}

        <View style={styles.quick}>
          {QUICK_REACTIONS.map((e) => {
            const on = myReactions.includes(e);
            return (
              <Pressable
                accessibilityRole="button"
                key={e}
                onPress={() => {
                  onReact(e);
                  close();
                }}
                accessibilityLabel={on ? `Remove ${e} reaction` : `React with ${e}`}
                style={({ pressed }) => [
                  styles.quickBtn,
                  on && { backgroundColor: c.accentSoft, borderColor: c.accent },
                  pressed && { transform: [{ scale: 1.12 }] },
                ]}
              >
                <Text style={styles.quickEmoji}>{e}</Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => setMore((m) => !m)}
            accessibilityLabel={more ? 'Fewer emoji' : 'More emoji'}
            style={[styles.quickBtn, more && { backgroundColor: c.accentSoft, borderColor: c.accent }]}
          >
            <Ionicons name={more ? 'chevron-up' : 'add'} size={22} color={c.inkSecondary} />
          </Pressable>
        </View>

        {more ? (
          <ScrollView style={styles.moreScroll} contentContainerStyle={styles.more}>
            {MORE_REACTIONS.map((e) => (
              <Pressable
                accessibilityRole="button"
                key={e}
                onPress={() => {
                  onReact(e);
                  close();
                }}
                accessibilityLabel={`React with ${e}`}
                style={({ pressed }) => [styles.moreBtn, pressed && { backgroundColor: c.accentSoft }]}
              >
                <Text style={styles.moreEmoji}>{e}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.actions}>
          {actions.map((a, i) => (
            <Pressable
              key={a.key}
              onPress={() => {
                close();
                a.onPress();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.action,
                i > 0 && styles.actionDivider,
                pressed && { backgroundColor: c.surfacePressed },
              ]}
            >
              <Ionicons name={a.icon} size={20} color={a.destructive ? c.error : c.ink} />
              <Text style={[styles.actionLabel, { color: a.destructive ? c.error : c.ink }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: c.scrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14,
    boxShadow: shadow.float,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: c.handle,
  },
  preview: {
    fontFamily: fontFamily.body,
    fontSize: 13.5,
    color: c.inkSecondary,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  quick: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: c.card,
    borderRadius: 30,
    padding: 6,
    boxShadow: shadow.card,
  },
  quickBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  quickEmoji: {
    fontSize: 25,
  },
  moreScroll: {
    maxHeight: 190,
  },
  more: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  moreBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreEmoji: {
    fontSize: 25,
  },
  actions: {
    backgroundColor: c.card,
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: shadow.card,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    minHeight: 52,
  },
  actionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.separator,
  },
  actionLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 16,
  },
});
