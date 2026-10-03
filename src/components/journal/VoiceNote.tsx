import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatDuration } from '../../lib/journal';
import { colors as c } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';

// One voice note: play/pause, a progress bar, its length, and an optional
// caption (editable in the editor). `uri` is a local file or a signed URL.

export default function VoiceNote({
  uri,
  durationMs,
  caption,
  onChangeCaption,
  transcript,
  onChangeTranscript,
  onRemove,
  index,
}: {
  uri: string | null;
  durationMs: number | null | undefined;
  caption: string;
  onChangeCaption?: (text: string) => void;
  /** What was said (written down while recording). */
  transcript?: string;
  onChangeTranscript?: (text: string) => void;
  onRemove?: () => void;
  index: number;
}) {
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const total = (status.duration || 0) * 1000 || durationMs || 0;
  const progress = total ? Math.min(1, (status.currentTime * 1000) / total) : 0;

  useEffect(() => {
    if (status.didJustFinish) player.seekTo(0);
  }, [status.didJustFinish, player]);

  function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    // Voice notes should play even with the silent switch on.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    player.play();
  }

  const label = `Voice note ${index + 1}, ${formatDuration(total)}${caption ? `, ${caption}` : ''}`;

  return (
    <View style={[styles.row, { backgroundColor: c.card }]} testID="voice-note">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? `Pause ${label}` : `Play ${label}`}
        disabled={!uri}
        onPress={toggle}
        style={({ pressed }) => [
          styles.play,
          { backgroundColor: uri ? (pressed ? c.accentPressed : c.accent) : c.accentDisabled },
        ]}
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={20} color={c.onAccent} style={styles.playIcon} />
      </Pressable>
      <View style={styles.middle}>
        <View style={[styles.track, { backgroundColor: c.accentSoft }]}>
          <View style={[styles.fill, { backgroundColor: c.accent, width: `${progress * 100}%` }]} />
        </View>
        {onChangeCaption ? (
          <TextInput
            value={caption}
            onChangeText={onChangeCaption}
            placeholder="Add a caption"
            placeholderTextColor={c.inkTertiary}
            accessibilityLabel={`Caption for voice note ${index + 1}`}
            style={[type.body, styles.caption, { color: c.ink }]}
            maxLength={500}
          />
        ) : caption ? (
          <Text style={[type.body, styles.captionText, { color: c.ink }]}>{caption}</Text>
        ) : null}
        {onChangeTranscript && transcript ? (
          <TextInput
            value={transcript}
            onChangeText={onChangeTranscript}
            accessibilityLabel={`What you said in voice note ${index + 1}`}
            multiline
            style={[type.caption, styles.transcript, { color: c.inkSecondary }]}
            maxLength={8000}
            testID="voice-transcript"
          />
        ) : transcript ? (
          <Text style={[type.caption, styles.transcript, { color: c.inkSecondary }]} testID="voice-transcript">
            “{transcript}”
          </Text>
        ) : null}
      </View>
      <Text style={[styles.time, { color: c.inkSecondary }]}>
        {formatDuration(status.playing || status.currentTime ? status.currentTime * 1000 : total)}
      </Text>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove voice note ${index + 1}`}
          onPress={onRemove}
          style={styles.remove}
        >
          <Ionicons name="trash-outline" size={18} color={c.inkTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  transcript: {
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    marginLeft: 2,
  },
  middle: {
    flex: 1,
    gap: 4,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
  },
  caption: {
    minHeight: 44,
    paddingVertical: 4,
  },
  captionText: {
    paddingVertical: 2,
  },
  time: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    minWidth: 38,
    textAlign: 'right',
  },
  remove: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
