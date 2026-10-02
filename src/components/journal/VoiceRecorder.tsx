import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { confirmTap } from '../../lib/haptics';
import { formatDuration } from '../../lib/journal';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';

// Records one voice note. Tap the big button to start, tap again to stop;
// the finished file is handed to `onDone`. Five minutes max per note.

const MAX_MS = 5 * 60 * 1000;
const PRESET = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

export default function VoiceRecorder({
  onDone,
  onCancel,
}: {
  onDone: (note: { uri: string; durationMs: number; mimeType: string | null }) => void;
  onCancel: () => void;
}) {
  const recorder = useAudioRecorder(PRESET);
  const state = useAudioRecorderState(recorder, 100);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const level = useRef(new Animated.Value(0)).current;
  const stopping = useRef(false);

  // Live input level (dBFS, about -60 … 0) → 0 … 1 for the ring.
  useEffect(() => {
    const db = state.metering ?? -60;
    const v = Math.max(0, Math.min(1, (db + 60) / 60));
    Animated.timing(level, { toValue: state.isRecording ? v : 0, duration: 100, useNativeDriver: true }).start();
  }, [state.metering, state.isRecording, level]);

  useEffect(() => {
    if (state.isRecording && state.durationMillis >= MAX_MS) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.durationMillis, state.isRecording]);

  // Never leave the microphone running if the sheet closes mid-recording.
  useEffect(
    () => () => {
      if (recorder.isRecording) recorder.stop().catch(() => {});
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    },
    [recorder],
  );

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone access is off. Turn it on for Epic Asia in Settings to record voice notes.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      confirmTap();
      AccessibilityInfo.announceForAccessibility('Recording');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start recording');
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    if (stopping.current) return;
    stopping.current = true;
    const durationMs = state.durationMillis;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      confirmTap();
      const uri = recorder.uri;
      if (uri && durationMs > 300) {
        onDone({ uri, durationMs, mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4' });
      } else {
        setError('That was too short to keep. Hold on a moment longer.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the recording');
    } finally {
      stopping.current = false;
    }
  }

  const recording = state.isRecording;
  const ring = level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });

  return (
    <View style={[styles.card, { backgroundColor: c.card }]} testID="voice-recorder">
      <Text style={[styles.time, { color: recording ? c.ink : c.inkSecondary }]} accessibilityLiveRegion="polite">
        {formatDuration(state.durationMillis)}
      </Text>
      <View style={styles.buttonWrap}>
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { backgroundColor: c.dangerSoft, transform: [{ scale: ring }] }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
          disabled={starting}
          onPress={recording ? stop : start}
          testID="record-button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: recording ? c.danger : c.accent, transform: [{ scale: pressed ? 0.95 : 1 }] },
          ]}
        >
          {recording ? (
            <View style={[styles.stopSquare, { backgroundColor: c.onDanger }]} />
          ) : (
            <Ionicons name="mic" size={30} color={c.onAccent} />
          )}
        </Pressable>
      </View>
      <Text style={[type.body, styles.hint, { color: c.inkSecondary }]}>
        {recording ? 'Tap to finish' : 'Tap to record a memory'}
      </Text>
      {error ? <Text style={[type.body, styles.error, { color: c.danger }]}>{error}</Text> : null}
      {!recording ? (
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
          <Text style={[type.bodyStrong, { color: c.highlight }]}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    boxShadow: shadow.card,
  },
  time: {
    fontFamily: fontFamily.mono,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 1,
  },
  buttonWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  ring: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  button: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.float,
  },
  stopSquare: {
    width: 24,
    height: 24,
    borderRadius: 5,
  },
  hint: {
    textAlign: 'center',
  },
  error: {
    textAlign: 'center',
    marginTop: 10,
  },
  cancel: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 6,
  },
});
