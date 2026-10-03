import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { disablePush, enablePush, pushState, type PushState } from '../../lib/push';
import { colors as c, shadow } from '../../theme/colors';
import { type } from '../../theme/typography';

const NOTES: Partial<Record<PushState, string>> = {
  install: 'On iPhone, add Epic Asia to your Home Screen first: tap Share, then Add to Home Screen, and open it from there.',
  denied: 'Notifications are blocked for Epic Asia. Allow them in your browser or phone settings, then come back.',
  unsupported: "This browser can't show notifications.",
};

/**
 * "Chat notifications" on/off for this browser. The whole row is the switch;
 * when notifications can't be turned on here, it says why instead.
 * `compact` hides the row once notifications are on (the chat's room list).
 */
export default function NotificationsRow({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    pushState()
      .then(setState)
      .catch(() => setState('unsupported'));
  }, []);
  useEffect(refresh, [refresh]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (state === 'on') {
        await disablePush();
        setState('off');
      } else {
        setState(await enablePush());
      }
    } catch {
      setError('Could not change notifications. Try again.');
      refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!state || (compact && (state === 'on' || state === 'unsupported'))) return null;
  const note = NOTES[state];
  const on = state === 'on';

  if (note) {
    return (
      <View style={[styles.row, styles.noteRow, { backgroundColor: c.card }]} testID="push-note">
        <Ionicons name="notifications-off-outline" size={22} color={c.inkSecondary} />
        <View style={styles.flex}>
          <Text style={[type.bodyStrong, { color: c.ink }]}>Chat notifications</Text>
          <Text style={[type.caption, { color: c.inkSecondary }]}>{note}</Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Chat notifications"
        accessibilityState={{ checked: on, busy }}
        aria-checked={on}
        onPress={toggle}
        testID="push-toggle"
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
      >
        <Ionicons name={on ? 'notifications' : 'notifications-outline'} size={22} color={c.highlight} />
        <Text style={[type.bodyStrong, styles.flex, { color: c.ink }]}>Chat notifications</Text>
        <View style={[styles.toggle, { backgroundColor: on ? c.accent : c.handle }]}>
          <View style={[styles.knob, { backgroundColor: c.card, alignSelf: on ? 'flex-end' : 'flex-start' }]} />
        </View>
      </Pressable>
      {error ? (
        <Text style={[type.caption, styles.error, { color: c.danger }]} accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    borderRadius: 18,
    paddingHorizontal: 16,
    boxShadow: shadow.card,
  },
  noteRow: { alignItems: 'flex-start', paddingVertical: 14 },
  toggle: { width: 51, height: 31, borderRadius: 16, padding: 2, justifyContent: 'center' },
  knob: { width: 27, height: 27, borderRadius: 14, boxShadow: shadow.card },
  error: { marginTop: 6, paddingHorizontal: 16 },
});
