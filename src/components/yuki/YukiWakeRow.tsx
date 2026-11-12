import { StyleSheet, Text, Pressable, View } from 'react-native';
import { SlideSwitch } from '../shell/motion';
import { setYukiWake } from '../../lib/yukiVoice';
import { colors as c, shadow } from '../../theme/colors';
import { type } from '../../theme/typography';
import YukiMark from '../YukiMark';
import { useYuki } from './YukiVoice';

/** "Listen for Hey Yuki" on/off for this phone. The whole row is the switch. */
export default function YukiWakeRow() {
  const yuki = useYuki();
  const note = yuki.unsupported
    ? 'This browser can’t listen. Open Epic Asia in Safari or Chrome to talk to Yuki.'
    : yuki.blocked
      ? 'The microphone is blocked for Epic Asia. Allow it in your browser or phone settings.'
      : 'While Epic Asia is open, say “Hey Yuki” and ask anything about the trip.';
  const on = yuki.wakeOn && !yuki.unsupported;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="Listen for Hey Yuki"
      accessibilityState={{ checked: on, disabled: yuki.unsupported }}
      aria-checked={on}
      disabled={yuki.unsupported}
      onPress={() => setYukiWake(!yuki.wakeOn)}
      testID="yuki-wake-toggle"
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
    >
      <YukiMark size={30} />
      <View style={styles.flex}>
        <Text style={[type.bodyStrong, { color: c.ink }]}>Listen for “Hey Yuki”</Text>
        <Text style={[type.caption, { color: c.inkSecondary }]}>{note}</Text>
      </View>
      {yuki.unsupported ? null : (
        <SlideSwitch on={on} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    boxShadow: shadow.card,
  },
});
