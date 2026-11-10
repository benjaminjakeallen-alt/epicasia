import { Ionicons } from '@expo/vector-icons';
import { Animated, Image, Modal, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLast, usePresence } from '../../lib/socialMotion';
import { colors as c } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';

type Props = {
  uri: string | null;
  /** Set for a video message: the viewer plays it (the photo is its poster). */
  videoUri?: string | null;
  caption: string;
  onClose: () => void;
  onSave: () => void;
  onShare: () => void;
  saving: boolean;
  note: string | null;
};

// Full-screen photo or video: dark backdrop so the picture carries the
// screen, with close at the top and download/share at the bottom (thumb reach).
export default function PhotoViewer({ onClose, onSave, onShare, saving, note, ...media }: Props) {
  const open = !!media.uri;
  // Fades in with the picture settling to full size, and fades out with what it was showing.
  const { mounted, t } = usePresence(open, 140);
  const { uri, videoUri, caption } = useLast(media, open);
  const kind = videoUri ? 'video' : 'photo';
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <Animated.View style={[styles.root, { opacity: t }]}>
        <Animated.View style={{ transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }}>
        {videoUri ? (
          <video
            src={videoUri}
            poster={uri ?? undefined}
            controls
            autoPlay
            playsInline
            aria-label="Video"
            data-testid="chat-video"
            style={{ width, height: height - insets.top - insets.bottom - 150, objectFit: 'contain', background: c.mediaBackground }}
          />
        ) : uri ? (
          <Image source={{ uri }} style={{ width, height }} resizeMode="contain" accessibilityLabel="Photo" />
        ) : null}
        </Animated.View>

        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <Pressable accessibilityRole="button" onPress={onClose} accessibilityLabel={`Close ${kind}`} style={styles.round}>
            <Ionicons name="close" size={22} color={c.onMedia} />
          </Pressable>
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
          {caption ? (
            <Text style={styles.caption} numberOfLines={3}>
              {caption}
            </Text>
          ) : null}
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <View style={styles.buttons}>
            <Pressable
              onPress={onSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={`Download ${kind}`}
              style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
            >
              <Ionicons name="download-outline" size={19} color={c.onMedia} />
              <Text style={styles.pillText}>{saving ? 'Saving…' : 'Download'}</Text>
            </Pressable>
            <Pressable
              onPress={onShare}
              accessibilityRole="button"
              accessibilityLabel={`Share ${kind}`}
              style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
            >
              <Ionicons name="share-outline" size={19} color={c.onMedia} />
              <Text style={styles.pillText}>Share</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: c.mediaBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.mediaControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
    backgroundColor: c.mediaBar,
  },
  caption: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    lineHeight: 21,
    color: c.onMedia,
  },
  note: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13,
    color: c.onMediaAccent,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 23,
    backgroundColor: c.mediaControl,
  },
  pillPressed: {
    backgroundColor: c.mediaControlPressed,
  },
  pillText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 15,
    color: c.onMedia,
  },
});
