import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Message, Reaction } from '../../lib/chat';
import { dayLabel, firstName, initials, photoSize, timeLabel } from '../../lib/chatFormat';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';

export type ChatItem = Message & {
  /** Set while an optimistic message is in flight / after it failed. */
  status?: 'sending' | 'failed';
  /** Local photo URI shown until the uploaded one is available. */
  localUri?: string;
};

type Props = {
  item: ChatItem;
  mine: boolean;
  senderName: string;
  senderColor: string;
  /** First message of a run: show the sender's name (others) and round the top corner. */
  startsRun: boolean;
  /** Last message of a run: show avatar + time and the bubble "tail" corner. */
  endsRun: boolean;
  /** Show a day divider above this message. */
  dayDivider: boolean;
  reply: { name: string; text: string; color: string } | null;
  reactions: Reaction[];
  myId: string;
  photoUrl: string | null;
  maxWidth: number;
  onLongPress: (m: ChatItem) => void;
  onPressPhoto: (m: ChatItem) => void;
  onToggleReaction: (m: ChatItem, emoji: string) => void;
  onRetry: (m: ChatItem) => void;
};

function MessageRow({
  item,
  mine,
  senderName,
  senderColor,
  startsRun,
  endsRun,
  dayDivider,
  reply,
  reactions,
  myId,
  photoUrl,
  maxWidth,
  onLongPress,
  onPressPhoto,
  onToggleReaction,
  onRetry,
}: Props) {
  const deleted = !!item.deleted_at;
  const hasPhoto = !deleted && (!!item.image_path || !!item.localUri);
  const hasText = !deleted && !!item.body;
  const photo = hasPhoto ? photoSize(item.image_width, item.image_height, maxWidth, 320) : null;

  // Group reactions by emoji: count + whether I'm one of them.
  const grouped: { emoji: string; count: number; mine: boolean }[] = [];
  for (const r of reactions) {
    const g = grouped.find((x) => x.emoji === r.emoji);
    if (g) {
      g.count += 1;
      g.mine ||= r.user_id === myId;
    } else grouped.push({ emoji: r.emoji, count: 1, mine: r.user_id === myId });
  }

  // Corner radii: rounded everywhere except the sender's side between
  // bubbles of one run, and a tighter bottom corner on that side (the "tail").
  const big = 20;
  const small = 6;
  const senderTop = startsRun ? big : small;
  const corners = mine
    ? { borderTopLeftRadius: big, borderBottomLeftRadius: big, borderTopRightRadius: senderTop, borderBottomRightRadius: small }
    : { borderTopRightRadius: big, borderBottomRightRadius: big, borderTopLeftRadius: senderTop, borderBottomLeftRadius: small };

  const a11y = deleted
    ? `${senderName}: message deleted`
    : `${mine ? 'You' : senderName}${hasPhoto ? ', photo' : ''}${hasText ? `: ${item.body}` : ''}, ${timeLabel(item.created_at)}`;

  return (
    <View>
      {dayDivider ? (
        <View style={styles.dayWrap}>
          <Text style={[styles.day, { color: c.inkSecondary, backgroundColor: c.card }]}>{dayLabel(item.created_at)}</Text>
        </View>
      ) : null}

      <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, { marginTop: startsRun ? 10 : 2 }]}>
        {!mine ? (
          <View style={styles.avatarSlot}>
            {endsRun ? (
              <View style={[styles.avatar, { backgroundColor: senderColor }]}>
                <Text style={styles.avatarText}>{initials(senderName)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.column, mine ? styles.columnMine : styles.columnTheirs, { maxWidth: maxWidth + 4 }]}>
          {!mine && startsRun ? (
            <Text style={[styles.name, { color: senderColor }]} numberOfLines={1}>
              {firstName(senderName)}
            </Text>
          ) : null}

          <Pressable
            onLongPress={() => !deleted && item.status !== 'sending' && onLongPress(item)}
            onPress={() => (item.status === 'failed' ? onRetry(item) : undefined)}
            delayLongPress={280}
            accessibilityLabel={a11y}
            accessibilityHint={deleted ? undefined : 'Long press for reactions, reply and more'}
            style={({ pressed }) => [
              styles.bubble,
              corners,
              deleted
                ? styles.bubbleDeleted
                : mine
                  ? { backgroundColor: c.accent }
                  : { backgroundColor: c.card, boxShadow: shadow.card },
              hasPhoto && !hasText && !reply ? styles.bubblePhotoOnly : null,
              { opacity: item.status === 'sending' ? 0.7 : pressed ? 0.85 : 1 },
            ]}
          >
            {reply && !deleted ? (
              <View
                style={[
                  styles.quote,
                  { borderLeftColor: mine ? 'rgba(255,255,255,0.75)' : reply.color },
                  { backgroundColor: mine ? 'rgba(255,255,255,0.14)' : 'rgba(30,39,33,0.05)' },
                ]}
              >
                <Text style={[styles.quoteName, { color: mine ? '#fff' : reply.color }]} numberOfLines={1}>
                  {reply.name}
                </Text>
                <Text style={[styles.quoteText, { color: mine ? 'rgba(255,255,255,0.85)' : c.inkSecondary }]} numberOfLines={2}>
                  {reply.text}
                </Text>
              </View>
            ) : null}

            {hasPhoto && photo ? (
              <Pressable onPress={() => onPressPhoto(item)} onLongPress={() => onLongPress(item)} accessibilityLabel="Open photo">
                {photoUrl || item.localUri ? (
                  <Image
                    source={{ uri: photoUrl ?? item.localUri }}
                    style={[styles.photo, { width: photo.width, height: photo.height }]}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.photo, styles.photoLoading, { width: photo.width, height: photo.height }]} />
                )}
              </Pressable>
            ) : null}

            {deleted ? (
              <Text style={[styles.text, styles.deletedText]}>
                <Ionicons name="ban-outline" size={13} color={c.inkTertiary} /> Message deleted
              </Text>
            ) : hasText ? (
              <Text
                style={[styles.text, { color: mine ? c.onAccent : c.ink }, hasPhoto ? styles.textUnderPhoto : null]}
                selectable
              >
                {item.body}
              </Text>
            ) : null}
          </Pressable>

          {grouped.length > 0 ? (
            <View style={[styles.reactions, mine ? styles.reactionsMine : null]}>
              {grouped.map((g) => (
                <Pressable
                  key={g.emoji}
                  onPress={() => onToggleReaction(item, g.emoji)}
                  accessibilityLabel={`${g.emoji} ${g.count}${g.mine ? ', including you. Tap to remove' : '. Tap to add yours'}`}
                  style={[
                    styles.reaction,
                    { backgroundColor: g.mine ? c.accentSoft : c.card, borderColor: g.mine ? c.accent : c.border },
                  ]}
                >
                  <Text style={styles.reactionEmoji}>{g.emoji}</Text>
                  {g.count > 1 ? (
                    <Text style={[styles.reactionCount, { color: g.mine ? c.accent : c.inkSecondary }]}>{g.count}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          {endsRun || item.status ? (
            <View style={[styles.meta, mine ? styles.metaMine : null]}>
              {item.status === 'failed' ? (
                <Text style={[styles.metaText, { color: c.error }]}>Not sent · tap to retry</Text>
              ) : item.status === 'sending' ? (
                <Text style={[styles.metaText, { color: c.inkTertiary }]}>Sending…</Text>
              ) : (
                <Text style={[styles.metaText, { color: c.inkTertiary }]}>{timeLabel(item.created_at)}</Text>
              )}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default memo(MessageRow);

const styles = StyleSheet.create({
  dayWrap: {
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 4,
  },
  day: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    boxShadow: shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowTheirs: {
    justifyContent: 'flex-start',
  },
  avatarSlot: {
    width: 34,
    marginRight: 6,
    // Sit level with the bubble, above the time line.
    marginBottom: 20,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 11.5,
    color: '#fff',
  },
  column: {
    flexShrink: 1,
  },
  columnMine: {
    alignItems: 'flex-end',
  },
  columnTheirs: {
    alignItems: 'flex-start',
  },
  name: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 12.5,
    marginLeft: 12,
    marginBottom: 3,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    overflow: 'hidden',
  },
  bubblePhotoOnly: {
    padding: 3,
  },
  bubbleDeleted: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: c.border,
    borderStyle: 'dashed',
  },
  quote: {
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 6,
    marginTop: 1,
  },
  quoteName: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 12,
  },
  quoteText: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 17,
  },
  photo: {
    borderRadius: 16,
  },
  photoLoading: {
    backgroundColor: 'rgba(30,39,33,0.08)',
  },
  text: {
    ...type.body,
    fontSize: 15.5,
    lineHeight: 21,
  },
  textUnderPhoto: {
    marginTop: 7,
    marginHorizontal: 4,
    marginBottom: 2,
  },
  deletedText: {
    color: c.inkTertiary,
    fontSize: 14,
  },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: -6,
    marginLeft: 8,
  },
  reactionsMine: {
    marginLeft: 0,
    marginRight: 8,
    justifyContent: 'flex-end',
  },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 7,
    paddingVertical: 2,
    boxShadow: shadow.card,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 12,
  },
  meta: {
    marginTop: 3,
    marginLeft: 10,
  },
  metaMine: {
    marginLeft: 0,
    marginRight: 6,
  },
  metaText: {
    fontFamily: fontFamily.body,
    fontSize: 11,
  },
});
