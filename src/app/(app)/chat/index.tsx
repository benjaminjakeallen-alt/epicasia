import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import Composer, { type PickedPhoto } from '../../../components/chat/Composer';
import MessageActions, { type SheetAction } from '../../../components/chat/MessageActions';
import MessageRow, { type ChatItem } from '../../../components/chat/MessageRow';
import PhotoViewer from '../../../components/chat/PhotoViewer';
import TypingIndicator from '../../../components/chat/TypingIndicator';
import { useAuth } from '../../../lib/AuthProvider';
import {
  PAGE_SIZE,
  addReaction,
  deleteMessage,
  fetchMembers,
  fetchMessages,
  fetchReactions,
  newId,
  removeReaction,
  savePhoto,
  sendMessage,
  sharePhoto,
  signedUrls,
  subscribeChat,
  type Member,
  type Message,
  type Outgoing,
  type Reaction,
} from '../../../lib/chat';
import { firstName, initials, personColor, sameDay, sameRun, typingLabel } from '../../../lib/chatFormat';
import { colors as c, shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';

const STARTERS = ['Who’s landing when? ✈️', 'Dinner plans tonight? 🍜', 'Meet at the hotel lobby at 9?'];

function previewText(m: Message | undefined): string {
  if (!m) return 'Original message';
  if (m.deleted_at) return 'Message deleted';
  if (m.body) return m.body;
  return m.image_path ? '📷 Photo' : '';
}

export default function GroupChat() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const bubbleMax = Math.min(width * 0.72, 330);

  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatItem[]>([]); // newest first
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [replyTo, setReplyTo] = useState<ChatItem | null>(null);
  const [actionFor, setActionFor] = useState<ChatItem | null>(null);
  const [viewer, setViewer] = useState<ChatItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewerNote, setViewerNote] = useState<string | null>(null);
  const [typingIds, setTypingIds] = useState<string[]>([]);

  const outgoing = useRef(new Map<string, Outgoing>());
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastTypingSent = useRef(0);
  const chat = useRef<ReturnType<typeof subscribeChat> | null>(null);
  const membersRef = useRef<Member[]>([]);
  membersRef.current = members;

  const people = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    members.forEach((m, i) => map.set(m.id, { name: m.name, color: personColor(i) }));
    return map;
  }, [members]);
  const person = useCallback(
    (id: string) => people.get(id) ?? { name: id === myId ? 'You' : 'Traveler', color: c.inkSecondary },
    [people, myId],
  );

  const ensureUrls = useCallback(async (msgs: Message[]) => {
    const paths = msgs.flatMap((m) => [m.image_path, m.image_thumb_path]).filter((p): p is string => !!p);
    if (!paths.length) return;
    try {
      const got = await signedUrls(paths);
      setUrls((prev) => ({ ...prev, ...got }));
    } catch {
      // A missing thumbnail shouldn't break the chat; it stays a placeholder.
    }
  }, []);

  const mergeReactions = useCallback((list: Reaction[]) => {
    setReactions((prev) => {
      const next = { ...prev };
      for (const r of list) {
        const cur = next[r.message_id] ?? [];
        if (!cur.some((x) => x.user_id === r.user_id && x.emoji === r.emoji)) next[r.message_id] = [...cur, r];
      }
      return next;
    });
  }, []);

  // Initial load.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [m, msgs] = await Promise.all([fetchMembers(), fetchMessages()]);
        if (!alive) return;
        setMembers(m);
        setMessages(msgs);
        setHasMore(msgs.length === PAGE_SIZE);
        ensureUrls(msgs);
        mergeReactions(await fetchReactions(msgs.map((x) => x.id)));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the chat');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ensureUrls, mergeReactions]);

  // Realtime: new/edited messages, reactions, typing.
  useEffect(() => {
    if (!myId) return;
    const timers = typingTimers.current;
    const sub = subscribeChat(myId, {
      onMessage: (m) => {
        setMessages((prev) => {
          const i = prev.findIndex((x) => x.id === m.id);
          if (i >= 0) {
            const next = prev.slice();
            next[i] = { ...m, localUri: prev[i].localUri };
            return next;
          }
          const next = [m as ChatItem, ...prev];
          next.sort((a, b) => b.created_at.localeCompare(a.created_at));
          return next;
        });
        ensureUrls([m]);
        if (!membersRef.current.some((p) => p.id === m.user_id)) fetchMembers().then(setMembers).catch(() => {});
        // Someone who just sent a message has stopped typing.
        setTypingIds((ids) => ids.filter((id) => id !== m.user_id));
      },
      onReactionAdded: (r) => mergeReactions([r]),
      onReactionRemoved: (r) =>
        setReactions((prev) => {
          const cur = prev[r.message_id];
          if (!cur) return prev;
          return { ...prev, [r.message_id]: cur.filter((x) => !(x.user_id === r.user_id && x.emoji === r.emoji)) };
        }),
      onTyping: (uid, typing) => {
        const old = timers.get(uid);
        if (old) clearTimeout(old);
        if (typing) {
          setTypingIds((ids) => (ids.includes(uid) ? ids : [...ids, uid]));
          timers.set(
            uid,
            setTimeout(() => setTypingIds((ids) => ids.filter((id) => id !== uid)), 5000),
          );
        } else {
          setTypingIds((ids) => ids.filter((id) => id !== uid));
        }
      },
    });
    chat.current = sub;
    return () => {
      sub.unsubscribe();
      timers.forEach(clearTimeout);
      chat.current = null;
    };
  }, [myId, ensureUrls, mergeReactions]);

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[messages.length - 1].created_at;
      const older = await fetchMessages(oldest);
      setMessages((prev) => [...prev, ...older.filter((o) => !prev.some((p) => p.id === o.id))]);
      setHasMore(older.length === PAGE_SIZE);
      ensureUrls(older);
      mergeReactions(await fetchReactions(older.map((x) => x.id)));
    } catch {
      // Leave hasMore set so scrolling up tries again.
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, messages, ensureUrls, mergeReactions]);

  // ---- sending ----------------------------------------------------------

  const deliver = useCallback(
    async (out: Outgoing) => {
      try {
        const saved = await sendMessage(out);
        outgoing.current.delete(out.id);
        setMessages((prev) => prev.map((m) => (m.id === out.id ? { ...saved, localUri: m.localUri } : m)));
        ensureUrls([saved]);
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === out.id ? { ...m, status: 'failed' } : m)));
      }
    },
    [ensureUrls],
  );

  const send = useCallback(() => {
    const body = text.trim();
    if (!body && !photo) return;
    const out: Outgoing = { id: newId(), userId: myId, body: body || null, replyTo: replyTo?.id ?? null, photo };
    outgoing.current.set(out.id, out);
    const optimistic: ChatItem = {
      id: out.id,
      user_id: myId,
      body: out.body,
      image_path: null,
      image_thumb_path: null,
      image_width: photo?.width ?? null,
      image_height: photo?.height ?? null,
      reply_to: out.replyTo,
      deleted_at: null,
      created_at: new Date().toISOString(),
      status: 'sending',
      localUri: photo?.uri,
    };
    setMessages((prev) => [optimistic, ...prev]);
    setText('');
    setPhoto(null);
    setReplyTo(null);
    chat.current?.sendTyping(false);
    lastTypingSent.current = 0;
    deliver(out);
  }, [text, photo, replyTo, myId, deliver]);

  const retry = useCallback(
    (m: ChatItem) => {
      const out = outgoing.current.get(m.id);
      if (!out) return;
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'sending' } : x)));
      deliver(out);
    },
    [deliver],
  );

  const onChangeText = useCallback((t: string) => {
    setText(t);
    const now = Date.now();
    if (!t.trim()) {
      chat.current?.sendTyping(false);
      lastTypingSent.current = 0;
    } else if (now - lastTypingSent.current > 2500) {
      chat.current?.sendTyping(true);
      lastTypingSent.current = now;
    }
  }, []);

  const pickPhoto = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      setPhoto({ uri: a.uri, width: a.width, height: a.height, mimeType: a.mimeType });
    }
  }, []);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera access is off — turn it on in Settings to take photos here.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      setPhoto({ uri: a.uri, width: a.width, height: a.height, mimeType: a.mimeType });
    }
  }, []);

  // ---- reactions & actions ------------------------------------------------

  const toggleReaction = useCallback(
    async (m: ChatItem, emoji: string) => {
      const has = (reactions[m.id] ?? []).some((r) => r.user_id === myId && r.emoji === emoji);
      const mine: Reaction = { message_id: m.id, user_id: myId, emoji };
      setReactions((prev) => {
        const cur = prev[m.id] ?? [];
        return {
          ...prev,
          [m.id]: has ? cur.filter((r) => !(r.user_id === myId && r.emoji === emoji)) : [...cur, mine],
        };
      });
      try {
        if (has) await removeReaction(m.id, myId, emoji);
        else await addReaction(m.id, myId, emoji);
      } catch {
        // Put it back the way it was.
        setReactions((prev) => {
          const cur = prev[m.id] ?? [];
          return {
            ...prev,
            [m.id]: has ? [...cur, mine] : cur.filter((r) => !(r.user_id === myId && r.emoji === emoji)),
          };
        });
      }
    },
    [reactions, myId],
  );

  const doSave = useCallback(async (m: ChatItem) => {
    if (!m.image_path) return;
    setSaving(true);
    setViewerNote(null);
    try {
      const ok = await savePhoto(m.image_path);
      setViewerNote(ok ? (Platform.OS === 'web' ? 'Downloading…' : 'Saved to your photos') : 'Photo access is off — allow it in Settings.');
    } catch {
      setViewerNote('Couldn’t save that photo. Try again.');
    } finally {
      setSaving(false);
    }
  }, []);

  const actionsFor = (m: ChatItem): SheetAction[] => {
    const list: SheetAction[] = [{ key: 'reply', label: 'Reply', icon: 'arrow-undo-outline', onPress: () => setReplyTo(m) }];
    if (m.body) {
      list.push({ key: 'copy', label: 'Copy text', icon: 'copy-outline', onPress: () => void Clipboard.setStringAsync(m.body ?? '') });
    }
    if (m.image_path) {
      list.push({
        key: 'save',
        label: Platform.OS === 'web' ? 'Download photo' : 'Save photo',
        icon: 'download-outline',
        onPress: () => {
          setViewer(m);
          void doSave(m);
        },
      });
    }
    if (m.user_id === myId) {
      list.push({
        key: 'delete',
        label: 'Delete message',
        icon: 'trash-outline',
        destructive: true,
        onPress: () => {
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, deleted_at: new Date().toISOString(), body: null, image_path: null, image_thumb_path: null } : x)),
          );
          deleteMessage(m).catch(() => setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x))));
        },
      });
    }
    return list;
  };

  // ---- render -------------------------------------------------------------

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const typingNames = typingIds.map((id) => firstName(person(id).name));
  const replyInfo = (m: ChatItem | null) =>
    m ? { name: m.user_id === myId ? 'yourself' : firstName(person(m.user_id).name), text: previewText(m), color: person(m.user_id).color } : null;

  const renderItem = ({ item, index }: { item: ChatItem; index: number }) => {
    const older = messages[index + 1];
    const newer = messages[index - 1];
    const quoted = item.reply_to ? byId.get(item.reply_to) : undefined;
    const sender = person(item.user_id);
    return (
      <MessageRow
        item={item}
        mine={item.user_id === myId}
        senderName={sender.name}
        senderColor={sender.color}
        startsRun={!sameRun(item, older)}
        endsRun={!sameRun(item, newer) || !!item.status}
        dayDivider={!older || !sameDay(item.created_at, older.created_at)}
        reply={
          item.reply_to
            ? {
                name: quoted ? (quoted.user_id === myId ? 'You' : firstName(person(quoted.user_id).name)) : 'Reply',
                text: previewText(quoted),
                color: quoted ? person(quoted.user_id).color : c.inkTertiary,
              }
            : null
        }
        reactions={reactions[item.id] ?? []}
        myId={myId}
        // Bubbles show the small thumbnail; the viewer loads the original.
        photoUrl={
          (item.image_thumb_path && urls[item.image_thumb_path]) || (item.image_path && urls[item.image_path]) || null
        }
        maxWidth={bubbleMax}
        onLongPress={setActionFor}
        onPressPhoto={(m) => {
          setViewerNote(null);
          setViewer(m);
        }}
        onToggleReaction={toggleReaction}
        onRetry={retry}
      />
    );
  };

  const shownMembers = members.slice(0, 4);

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop height={260} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Group chat</Text>
          <Text style={[type.caption, { color: c.inkSecondary }]}>
            {members.length ? `${members.length} traveler${members.length === 1 ? '' : 's'}` : 'Everyone on the trip'}
          </Text>
        </View>
        <View style={styles.faces} accessibilityLabel={`${members.length} travelers`}>
          {shownMembers.map((m, i) => (
            <View
              key={m.id}
              style={[styles.face, { backgroundColor: personColor(i), marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }]}
            >
              <Text style={styles.faceText}>{initials(m.name)}</Text>
            </View>
          ))}
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <ActivityIndicator style={styles.loading} color={c.accent} />
        ) : messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>👋</Text>
              <Text style={styles.emptyTitle}>Say hello to the group</Text>
              <Text style={[type.body, styles.emptyBody]}>
                Plans, photos and “where are you?” — everyone on the trip sees this chat.
              </Text>
              <View style={styles.starters}>
                {STARTERS.map((s) => (
                  <Pressable key={s} onPress={() => onChangeText(s)} style={styles.starter} accessibilityRole="button">
                    <Text style={styles.starterText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        ) : (
          <FlatList
            data={messages}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListFooterComponent={loadingOlder ? <ActivityIndicator style={styles.older} color={c.accent} /> : null}
            testID="chat-list"
          />
        )}

        {error ? (
          <Pressable onPress={() => setError(null)} style={styles.error} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={16} color={c.error} />
            <Text style={[type.caption, { color: c.error, flex: 1 }]}>{error}</Text>
          </Pressable>
        ) : null}

        {typingNames.length ? <TypingIndicator label={typingLabel(typingNames)} /> : null}

        <Composer
          value={text}
          onChangeText={onChangeText}
          photo={photo}
          onClearPhoto={() => setPhoto(null)}
          replyTo={replyInfo(replyTo)}
          onCancelReply={() => setReplyTo(null)}
          onPickPhoto={pickPhoto}
          onTakePhoto={takePhoto}
          onSend={send}
          bottomInset={insets.bottom}
        />
      </KeyboardAvoidingView>

      <MessageActions
        visible={!!actionFor}
        preview={actionFor ? previewText(actionFor) : ''}
        myReactions={actionFor ? (reactions[actionFor.id] ?? []).filter((r) => r.user_id === myId).map((r) => r.emoji) : []}
        onReact={(e) => actionFor && toggleReaction(actionFor, e)}
        actions={actionFor ? actionsFor(actionFor) : []}
        onClose={() => setActionFor(null)}
        bottomInset={insets.bottom}
      />

      <PhotoViewer
        uri={viewer ? ((viewer.image_path && urls[viewer.image_path]) || viewer.localUri || null) : null}
        caption={viewer?.body ?? ''}
        onClose={() => setViewer(null)}
        onSave={() => viewer && doSave(viewer)}
        onShare={() => viewer?.image_path && sharePhoto(viewer.image_path).catch(() => {})}
        saving={saving}
        note={viewerNote}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.2,
    color: c.ink,
  },
  faces: {
    flexDirection: 'row',
  },
  face: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: c.background,
  },
  faceText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 10.5,
    color: '#fff',
  },
  loading: {
    marginTop: 40,
  },
  list: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  older: {
    marginVertical: 14,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyCard: {
    backgroundColor: c.card,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    gap: 8,
    boxShadow: shadow.card,
  },
  emptyEmoji: {
    fontSize: 34,
  },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    color: c.ink,
  },
  emptyBody: {
    color: c.inkSecondary,
    textAlign: 'center',
  },
  starters: {
    marginTop: 6,
    gap: 8,
    alignSelf: 'stretch',
  },
  starter: {
    backgroundColor: c.accentSoft,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  starterText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 14.5,
    color: c.accentPressed,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 10,
    borderRadius: 12,
    backgroundColor: c.card,
    boxShadow: shadow.card,
  },
});
