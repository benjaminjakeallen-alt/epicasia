import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayLabel, timeLabel } from '../../lib/chatFormat';
import type { GalleryPhoto } from '../../lib/gallery';
import { fontFamily } from '../../theme/typography';

type Person = { name: string; color: string };

type Props = {
  photos: GalleryPhoto[];
  /** Index to open at; null = closed. */
  startIndex: number | null;
  urls: Record<string, string>;
  myId: string;
  person: (id: string) => Person;
  favCount: (id: string) => number;
  isFav: (id: string) => boolean;
  onToggleFav: (p: GalleryPhoto) => void;
  onSave: (p: GalleryPhoto) => Promise<string>;
  onShare: (p: GalleryPhoto) => void;
  onDelete: (p: GalleryPhoto) => void;
  onCaption: (p: GalleryPhoto, caption: string) => void;
  onNeedUrls: (p: GalleryPhoto[]) => void;
  onClose: () => void;
};

// Full-screen, swipeable photo viewer: dark stage so the photo carries the
// screen, the thumbnail shown instantly and the original fading in over it,
// pinch-to-zoom on iOS, info + actions at the bottom within thumb reach.
export default function GalleryViewer({
  photos,
  startIndex,
  urls,
  myId,
  person,
  favCount,
  isFav,
  onToggleFav,
  onSave,
  onShare,
  onDelete,
  onCaption,
  onNeedUrls,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const list = useRef<FlatList<GalleryPhoto>>(null);
  const open = startIndex !== null;

  useEffect(() => {
    if (startIndex !== null) {
      setIndex(startIndex);
      setNote(null);
      setEditing(false);
    }
  }, [startIndex]);

  const current = photos[index];

  // Originals for this photo and its neighbours, so swiping is instant.
  useEffect(() => {
    if (open && photos.length) onNeedUrls(photos.slice(Math.max(0, index - 1), index + 2));
  }, [open, index, photos, onNeedUrls]);

  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(photos.length - 1, i));
      list.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
      setNote(null);
      setEditing(false);
    },
    [photos.length],
  );

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) {
      setIndex(i);
      setNote(null);
      setEditing(false);
    }
  };

  if (!open) return null;
  const who = current ? person(current.user_id) : null;
  const mine = current?.user_id === myId;
  const fav = current ? isFav(current.id) : false;
  const count = current ? favCount(current.id) : 0;

  return (
    <Modal visible animationType={Platform.OS === 'web' ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        <FlatList
          ref={list}
          data={photos}
          keyExtractor={(p) => p.id}
          horizontal
          pagingEnabled
          initialScrollIndex={startIndex ?? 0}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onScrollEnd}
          onScrollEndDrag={Platform.OS === 'web' ? onScrollEnd : undefined}
          showsHorizontalScrollIndicator={false}
          windowSize={3}
          initialNumToRender={1}
          renderItem={({ item }) => {
            const full = urls[item.storage_path];
            const thumb = item.thumb_path ? urls[item.thumb_path] : undefined;
            return (
              <ScrollView
                style={{ width, height }}
                contentContainerStyle={styles.page}
                maximumZoomScale={4}
                minimumZoomScale={1}
                centerContent
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
              >
                <Image
                  source={full ? { uri: full, cacheKey: `${item.bucket}:${item.storage_path}` } : undefined}
                  placeholder={thumb ? { uri: thumb, cacheKey: `${item.bucket}:${item.thumb_path}` } : undefined}
                  placeholderContentFit="contain"
                  contentFit="contain"
                  transition={220}
                  style={{ width, height }}
                  accessibilityLabel={item.caption ? `Photo: ${item.caption}` : 'Photo'}
                />
              </ScrollView>
            );
          }}
        />

        <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close" style={styles.round}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.counter}>
            {index + 1} / {photos.length}
          </Text>
          <View style={styles.roundSpacer} />
        </View>

        {Platform.OS === 'web' && photos.length > 1 ? (
          <>
            {index > 0 ? (
              <Pressable onPress={() => goTo(index - 1)} accessibilityLabel="Previous photo" style={[styles.arrow, { left: 12 }]}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </Pressable>
            ) : null}
            {index < photos.length - 1 ? (
              <Pressable onPress={() => goTo(index + 1)} accessibilityLabel="Next photo" style={[styles.arrow, { right: 12 }]}>
                <Ionicons name="chevron-forward" size={24} color="#fff" />
              </Pressable>
            ) : null}
          </>
        ) : null}

        {current && who ? (
          <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
            <View style={styles.byline}>
              <View style={[styles.dot, { backgroundColor: who.color }]} />
              <Text style={styles.who} numberOfLines={1}>
                {mine ? 'You' : who.name}
              </Text>
              <Text style={styles.when}>
                {dayLabel(current.created_at)} · {timeLabel(current.created_at)}
              </Text>
              {current.bucket === 'chat' ? (
                <View style={styles.tag}>
                  <Ionicons name="chatbubble-outline" size={11} color="#cfe3d4" />
                  <Text style={styles.tagText}>From chat</Text>
                </View>
              ) : null}
            </View>

            {editing ? (
              <View style={styles.captionEdit}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Add a caption…"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  style={styles.captionInput}
                  autoFocus
                  maxLength={1000}
                  multiline
                />
                <Pressable
                  onPress={() => {
                    onCaption(current, draft);
                    setEditing(false);
                  }}
                  accessibilityLabel="Save caption"
                  style={styles.captionSave}
                >
                  <Text style={styles.captionSaveText}>Done</Text>
                </Pressable>
              </View>
            ) : current.caption ? (
              <Pressable
                disabled={!mine}
                onPress={() => {
                  setDraft(current.caption ?? '');
                  setEditing(true);
                }}
              >
                <Text style={styles.caption} numberOfLines={4}>
                  {current.caption}
                </Text>
              </Pressable>
            ) : mine ? (
              <Pressable
                onPress={() => {
                  setDraft('');
                  setEditing(true);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.addCaption}>Add a caption…</Text>
              </Pressable>
            ) : null}

            {note ? <Text style={styles.note}>{note}</Text> : null}

            <View style={styles.actions}>
              <Pressable
                onPress={() => onToggleFav(current)}
                accessibilityRole="button"
                accessibilityLabel={fav ? 'Remove from favorites' : 'Add to favorites'}
                style={({ pressed }) => [styles.pill, fav && styles.pillOn, pressed && styles.pillPressed]}
              >
                <Ionicons name={fav ? 'heart' : 'heart-outline'} size={19} color={fav ? '#ff8a8a' : '#fff'} />
                {count > 0 ? <Text style={styles.pillText}>{count}</Text> : null}
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  setNote(await onSave(current));
                  setBusy(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={Platform.OS === 'web' ? 'Download photo' : 'Save to Photos'}
                style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
              >
                <Ionicons name="download-outline" size={19} color="#fff" />
                <Text style={styles.pillText}>{busy ? 'Saving…' : Platform.OS === 'web' ? 'Download' : 'Save'}</Text>
              </Pressable>
              {Platform.OS !== 'web' ? (
                <Pressable
                  onPress={() => onShare(current)}
                  accessibilityRole="button"
                  accessibilityLabel="Share photo"
                  style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                >
                  <Ionicons name="share-outline" size={19} color="#fff" />
                </Pressable>
              ) : null}
              {mine && current.bucket === 'gallery' ? (
                <Pressable
                  onPress={() => onDelete(current)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete photo"
                  style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                >
                  <Ionicons name="trash-outline" size={19} color="#ffb4a6" />
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d110e',
  },
  page: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundSpacer: {
    width: 42,
  },
  counter: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  arrow: {
    position: 'absolute',
    top: '45%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
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
    gap: 10,
    backgroundColor: 'rgba(13,17,14,0.6)',
  },
  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  who: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 15,
    color: '#fff',
  },
  when: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(79,122,92,0.45)',
  },
  tagText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11.5,
    color: '#cfe3d4',
  },
  caption: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    lineHeight: 21,
    color: '#fff',
  },
  addCaption: {
    fontFamily: fontFamily.body,
    fontSize: 14.5,
    color: 'rgba(255,255,255,0.55)',
  },
  captionEdit: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  captionInput: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 15,
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 100,
  },
  captionSave: {
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#4f7a5c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionSaveText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 14,
    color: '#fff',
  },
  note: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13,
    color: '#cfe3d4',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 44,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  pillOn: {
    backgroundColor: 'rgba(255,138,138,0.18)',
  },
  pillPressed: {
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  pillText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 15,
    color: '#fff',
  },
});
