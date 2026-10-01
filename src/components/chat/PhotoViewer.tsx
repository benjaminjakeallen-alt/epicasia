import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors as c } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';

type Props = {
  uri: string | null;
  caption: string;
  onClose: () => void;
  onSave: () => void;
  onShare: () => void;
  saving: boolean;
  note: string | null;
};

// Full-screen photo: dark backdrop so the picture carries the screen, with
// close at the top and save/share at the bottom (thumb reach).
export default function PhotoViewer({ uri, caption, onClose, onSave, onShare, saving, note }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  return (
    <Modal
      visible={!!uri}
      animationType={Platform.OS === 'web' ? 'none' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        {uri ? (
          <Image source={{ uri }} style={{ width, height }} resizeMode="contain" accessibilityLabel="Photo" />
        ) : null}

        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10} accessibilityLabel="Close photo" style={styles.round}>
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
              accessibilityLabel={Platform.OS === 'web' ? 'Download photo' : 'Save photo to your library'}
              style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
            >
              <Ionicons name="download-outline" size={19} color={c.onMedia} />
              <Text style={styles.pillText}>{saving ? 'Saving…' : Platform.OS === 'web' ? 'Download' : 'Save'}</Text>
            </Pressable>
            {Platform.OS !== 'web' ? (
              <Pressable
                onPress={onShare}
                accessibilityRole="button"
                accessibilityLabel="Share photo"
                style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
              >
                <Ionicons name="share-outline" size={19} color={c.onMedia} />
                <Text style={styles.pillText}>Share</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
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
