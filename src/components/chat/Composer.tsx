import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';

import { durationLabel, isVideo, type PickedPhoto } from '../../lib/photos';

export type { PickedPhoto };

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  photo: PickedPhoto | null;
  onClearPhoto: () => void;
  replyTo: { name: string; text: string; color: string } | null;
  onCancelReply: () => void;
  /** Editing one of your messages: its old text, shown above the box. */
  editing: string | null;
  onCancelEdit: () => void;
  placeholder: string;
  onPickPhoto: () => void;
  onTakePhoto: () => void;
  onSend: () => void;
  bottomInset: number;
};

export default function Composer({
  value,
  onChangeText,
  photo,
  onClearPhoto,
  replyTo,
  onCancelReply,
  editing,
  onCancelEdit,
  placeholder,
  onPickPhoto,
  onTakePhoto,
  onSend,
  bottomInset,
}: Props) {
  const [contentHeight, setContentHeight] = useState(0);
  // One line when empty; grows with the text up to ~5 lines. RN-web reports
  // the textarea's scrollHeight, padding included.
  const height = value ? Math.min(120, Math.max(44, contentHeight)) : 44;
  const canSend = value.trim().length > 0 || !!photo;
  const video = photo ? isVideo(photo) : false;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 10) }]}>
      {editing !== null ? (
        <View style={styles.attachRow}>
          <View style={[styles.replyBar, { borderLeftColor: c.accent }]}>
            <Text style={[styles.replyName, { color: c.highlight }]} numberOfLines={1}>
              Editing message
            </Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {editing || 'Add text to your message'}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onCancelEdit} accessibilityLabel="Cancel editing" style={styles.dismiss}>
            <Ionicons name="close" size={18} color={c.inkSecondary} />
          </Pressable>
        </View>
      ) : null}

      {replyTo ? (
        <View style={styles.attachRow}>
          <View style={[styles.replyBar, { borderLeftColor: replyTo.color }]}>
            <Text style={[styles.replyName, { color: replyTo.color }]} numberOfLines={1}>
              Replying to {replyTo.name}
            </Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {replyTo.text}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onCancelReply} hitSlop={10} accessibilityLabel="Cancel reply" style={styles.dismiss}>
            <Ionicons name="close" size={18} color={c.inkSecondary} />
          </Pressable>
        </View>
      ) : null}

      {photo ? (
        <View style={styles.attachRow}>
          <View>
            {video ? (
              <View style={[styles.preview, styles.videoPreview]} accessibilityLabel="Video">
                <Ionicons name="videocam" size={22} color={c.onMedia} />
                <Text style={styles.videoTime}>{durationLabel(photo.durationMs)}</Text>
              </View>
            ) : (
              <Image source={{ uri: photo.uri }} style={styles.preview} />
            )}
            <Pressable
              accessibilityRole="button"
              onPress={onClearPhoto}
              accessibilityLabel={video ? 'Remove video' : 'Remove photo'}
              style={styles.previewClose}
            >
              <Ionicons name="close" size={13} color={c.onMedia} />
            </Pressable>
          </View>
          <Text style={styles.previewHint}>{video ? 'Video' : 'Photo'} ready — add a caption or send</Text>
        </View>
      ) : null}

      <View style={styles.bar}>
        {editing === null ? (
          <>
            <Pressable accessibilityRole="button" onPress={onPickPhoto} accessibilityLabel="Attach a photo or video" style={styles.tool}>
              <Ionicons name="images-outline" size={22} color={c.highlight} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onTakePhoto} accessibilityLabel="Take a photo or video" style={styles.tool}>
              <Ionicons name="camera-outline" size={23} color={c.highlight} />
            </Pressable>
          </>
        ) : null}

        <View style={styles.inputWrap}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={photo ? 'Add a caption…' : placeholder}
            placeholderTextColor={c.inkTertiary}
            multiline
            onContentSizeChange={(e) => setContentHeight(e.nativeEvent.contentSize.height)}
            style={[styles.input, { height }]}
            accessibilityLabel="Message"
            maxLength={4000}
            testID="chat-input"
          />
        </View>

        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={editing !== null ? 'Save edit' : 'Send'}
          accessibilityState={{ disabled: !canSend }}
          testID="chat-send"
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: canSend ? c.accent : c.accentDisabled, transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}
        >
          <Ionicons name={editing !== null ? 'checkmark' : 'arrow-up'} size={20} color={c.onAccent} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: c.barBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    paddingTop: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  replyBar: {
    flex: 1,
    borderLeftWidth: 3,
    backgroundColor: c.card,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    boxShadow: shadow.card,
  },
  replyName: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 12.5,
  },
  replyText: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: c.inkSecondary,
  },
  dismiss: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.card,
  },
  preview: {
    width: 64,
    height: 64,
    borderRadius: 14,
  },
  previewClose: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.mediaBadge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPreview: {
    backgroundColor: c.mediaBackground,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  videoTime: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11,
    color: c.onMedia,
  },
  previewHint: {
    ...type.caption,
    color: c.inkSecondary,
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  tool: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    backgroundColor: c.card,
    borderRadius: 22,
    boxShadow: shadow.card,
    marginHorizontal: 2,
  },
  input: {
    ...type.body,
    color: c.ink,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    textAlignVertical: 'top',
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
});
