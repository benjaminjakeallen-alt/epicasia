import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Member } from '../../lib/chat';
import { personColor } from '../../lib/chatFormat';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';
import Avatar from '../Avatar';

export const ROOM_EMOJI = ['💬', '🍜', '🏯', '🎢', '🛍️', '📸', '🚄', '🍻', '🎌', '🗺️'];

/** Row of emoji to pick a room's picture. */
export function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  return (
    <View style={styles.emojiRow} accessibilityRole="radiogroup" accessibilityLabel="Room picture">
      {ROOM_EMOJI.map((e) => {
        const on = e === value;
        return (
          <Pressable
            key={e}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={e}
            onPress={() => onChange(e)}
            style={[styles.emoji, { backgroundColor: on ? c.accentSoft : c.card, borderColor: on ? c.accent : c.card }]}
          >
            <Text style={styles.emojiText}>{e}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A switch row: the whole row is the control, the toggle is its picture. */
export function SwitchRow({
  label,
  icon,
  value,
  onChange,
  testID,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      aria-checked={value}
      onPress={() => onChange(!value)}
      testID={testID}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
    >
      <Ionicons name={icon} size={21} color={c.highlight} />
      <Text style={[type.bodyStrong, styles.flex, { color: c.ink }]}>{label}</Text>
      <View style={[styles.toggle, { backgroundColor: value ? c.accent : c.handle }]}>
        <View style={[styles.knob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </View>
    </Pressable>
  );
}

/** Pick people (a private room's members). */
export function PeoplePicker({
  members,
  selected,
  onToggle,
  locked,
}: {
  members: Member[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** Always in (you), shown but not toggleable. */
  locked?: string;
}) {
  return (
    <View style={styles.people}>
      {members.map((m, i) => {
        const on = selected.has(m.id) || m.id === locked;
        return (
          <Pressable
            key={m.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: m.id === locked }}
            aria-checked={on}
            accessibilityLabel={m.id === locked ? `${m.name} (you)` : m.name}
            disabled={m.id === locked}
            onPress={() => onToggle(m.id)}
            style={({ pressed }) => [styles.person, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
          >
            <Avatar name={m.name} path={m.avatar} color={personColor(i)} size={34} />
            <Text style={[type.body, styles.flex, { color: c.ink }]} numberOfLines={1}>
              {m.name}
              {m.id === locked ? ' (you)' : ''}
            </Text>
            <View style={[styles.check, { backgroundColor: on ? c.accent : c.card, borderColor: on ? c.accent : c.inkTertiary }]}>
              {on ? <Ionicons name="checkmark" size={16} color={c.onAccent} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emoji: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.card,
  },
  emojiText: { fontSize: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    borderRadius: 18,
    paddingHorizontal: 16,
    boxShadow: shadow.card,
  },
  toggle: { width: 51, height: 31, borderRadius: 16, padding: 2, justifyContent: 'center' },
  knob: { width: 27, height: 27, borderRadius: 14, backgroundColor: c.card, boxShadow: shadow.card },
  people: { gap: 8 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 12,
    boxShadow: shadow.card,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const sectionLabel = { fontFamily: fontFamily.bodySemiBold, fontSize: 13, color: c.inkSecondary, marginTop: 8 };
