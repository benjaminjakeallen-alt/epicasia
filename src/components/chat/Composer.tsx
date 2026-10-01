import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';

import type { PickedPhoto } from '../../lib/photos';

export type { PickedPhoto };

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  photo: PickedPhoto | null;
  onClearPhoto: () => void;
  replyTo: { name: string; text: string; color: string } | null;
  onCancelReply: () => void;
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
  onPickPhoto,
  onTakePhoto,
  onSend,
  bottomInset,
}: Props) {
  const [contentHeight, setContentHeight] = useState(0);
  // One line when empty; grows with the text up to ~5 lines. RN-web reports
  // the textarea's scrollHeight (padding included), native reports the text
  // alone, so only native adds the vertical padding back.
  const pad = Platform.OS === 'web' ? 0 : 20;
  const height = value ? Math.min(120, Math.max(44, contentHeight + pad)) : 44;
  const canSend = value.trim().length > 0 || !!photo;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 10) }]}>
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
            <Image source={{ uri: photo.uri }} style={styles.preview} />
            <Pressable accessibilityRole="button" onPress={onClearPhoto} hitSlop={8} accessibilityLabel="Remove photo" style={styles.previewClose}>
              <Ionicons name="close" size={13} color={c.onMedia} />
            </Pressable>
          </View>
          <Text style={styles.previewHint}>Photo ready — add a caption or send</Text>
        </View>
      ) : null}

      <View style={styles.bar}>
        <Pressable accessibilityRole="button" onPress={onPickPhoto} hitSlop={6} accessibilityLabel="Attach a photo" style={styles.tool}>
          <Ionicons name="images-outline" size={22} color={c.highlight} />
        </Pressable>
        {Platform.OS !== 'web' ? (
          <Pressable accessibilityRole="button" onPress={onTakePhoto} hitSlop={6} accessibilityLabel="Take a photo" style={styles.tool}>
            <Ionicons name="camera-outline" size={23} color={c.highlight} />
          </Pressable>
        ) : null}

        <View style={styles.inputWrap}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={photo ? 'Add a caption…' : 'Message the group'}
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
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          testID="chat-send"
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: canSend ? c.accent : c.accentDisabled, transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}
        >
          <Ionicons name="arrow-up" size={20} color={c.onAccent} />
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
