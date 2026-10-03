import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../../components/Avatar';
import OfflineNotice from '../../../components/OfflineNotice';
import CircleButton from '../../../components/CircleButton';
import { Bone, ChatSkeleton } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import Composer, { type PickedPhoto } from '../../../components/chat/Composer';
import MessageActions, { type SheetAction } from '../../../components/chat/MessageActions';
import MessageRow, { type ChatItem } from '../../../components/chat/MessageRow';
import PhotoViewer from '../../../components/chat/PhotoViewer';
import TypingIndicator from '../../../components/chat/TypingIndicator';
import { useAuth } from '../../../lib/AuthProvider';
import {
  EVERYONE_ROOM,
  PAGE_SIZE,
  addReaction,
  deleteMessage,
  editMessage,
  fetchMembers,
  fetchMessages,
  fetchMutes,
  fetchReactions,
  fetchRooms,
  newId,
  removeReaction,
  savePhoto,
  sendMessage,
  setMuted,
  sharePhoto,
  signedUrls,
  subscribeChat,
  type Member,
  type Message,
  type Outgoing,
  type Reaction,
  type Room,
} from '../../../lib/chat';
import { markRoomRead } from '../../../lib/chatUnread';
import { MAX_VIDEO_BYTES, type PickedPhoto as Picked } from '../../../lib/photos';
import { notifyChat } from '../../../lib/push';
import { firstName, personColor, sameDay, sameRun, typingLabel } from '../../../lib/chatFormat';
import { colors as c, shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';

const STARTERS = ['Who’s landing when? ✈️', 'Dinner plans tonight? 🍜', 'Meet at the hotel lobby at 9?'];

function previewText(m: Message | undefined): string {
  if (!m) return 'Original message';
  if (m.deleted_at) return 'Message deleted';
  if (m.body) return m.body;
  return m.video_path ? '🎬 Video' : m.image_path ? '📷 Photo' : '';
}

/** A picked library/camera asset as a chat attachment (photo or video). */
function toPicked(a: ImagePicker.ImagePickerAsset): Picked {
  const video = a.type === 'video' || !!a.mimeType?.startsWith('video/');
  return {
    uri: a.uri,
    width: a.width,
    height: a.height,
    mimeType: a.mimeType ?? (video ? 'video/mp4' : null),
    file: a.file ?? null,
    // The web picker gives seconds (Infinity for some recorded clips).
    durationMs: video ? (Number.isFinite(a.duration) ? Math.round((a.duration ?? 0) * 1000) : 0) : null,
  };
}

function tooBig(a: ImagePicker.ImagePickerAsset): boolean {
  const size = a.fileSize ?? a.file?.size ?? 0;
  return (a.type === 'video' || !!a.mimeType?.startsWith('video/')) && size > MAX_VIDEO_BYTES;
}

// A couple of placeholder bubbles while older messages load at the top.
function OlderSkeleton() {
  return (
    <View style={styles.older} accessibilityLabel="Loading older messages">
      <Bone width="55%" height={38} radius={19} />
      <Bone width="35%" height={38} radius={19} />
    </View>
  );
}

export default function ChatRoom() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ room: string }>();
  const roomId = typeof params.room === 'string' && params.room ? params.room : EVERYONE_ROOM;
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const bubbleMax = Math.min(width * 0.72, 330);

  const [members, setMembers] = useState<Member[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [mutedPeople, setMutedPeople] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ChatItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    const map = new Map<string, { name: string; color: string; avatar: string | null }>();
    members.forEach((m, i) => map.set(m.id, { name: m.name, color: personColor(i), avatar: m.avatar }));
    return map;
  }, [members]);
  const person = useCallback(
    (id: string) => people.get(id) ?? { name: id === myId ? 'You' : 'Traveler', color: c.inkSecondary, avatar: null },
    [people, myId],
  );

  const ensureUrls = useCallback(async (msgs: Message[]) => {
    const paths = msgs.flatMap((m) => [m.image_path, m.image_thumb_path, m.video_path]).filter((p): p is string => !!p);
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
        const [m, msgs, rooms] = await Promise.all([fetchMembers(), fetchMessages(roomId), fetchRooms()]);
        if (!alive) return;
        setMembers(m);
        setRoom(rooms.find((r) => r.id === roomId) ?? null);
        fetchMutes()
          .then((mutes) => alive && setMutedPeople(mutes.people))
          .catch(() => {});
        setMessages(msgs);
        setHasMore(msgs.length === PAGE_SIZE);
        ensureUrls(msgs);
        mergeReactions(await fetchReactions(roomId, msgs.map((x) => x.id)));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the chat');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [roomId, ensureUrls, mergeReactions]);

  // While the room is on screen it counts as read (the badges clear).
  useFocusEffect(
    useCallback(() => {
      if (!myId) return;
      markRoomRead(myId, roomId).catch(() => {});
      return () => {
        markRoomRead(myId, roomId).catch(() => {});
      };
    }, [myId, roomId]),
  );

  // Realtime: new/edited messages, reactions, typing.
  useEffect(() => {
    if (!myId) return;
    const timers = typingTimers.current;
    const sub = subscribeChat(roomId, myId, {
      onMessage: (m) => {
        setMessages((prev) => {
          const i = prev.findIndex((x) => x.id === m.id);
          if (i >= 0) {
            const next = prev.slice();
            next[i] = { ...m, localUri: prev[i].localUri, localVideo: prev[i].localVideo };
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
  }, [roomId, myId, ensureUrls, mergeReactions]);

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[messages.length - 1].created_at;
      const older = await fetchMessages(roomId, oldest);
      setMessages((prev) => [...prev, ...older.filter((o) => !prev.some((p) => p.id === o.id))]);
      setHasMore(older.length === PAGE_SIZE);
      ensureUrls(older);
      mergeReactions(await fetchReactions(roomId, older.map((x) => x.id)));
    } catch {
      // Leave hasMore set so scrolling up tries again.
    } finally {
      setLoadingOlder(false);
    }
  }, [roomId, hasMore, loadingOlder, messages, ensureUrls, mergeReactions]);

  // ---- sending ----------------------------------------------------------

  const deliver = useCallback(
    async (out: Outgoing) => {
      try {
        const saved = await sendMessage(out);
        outgoing.current.delete(out.id);
        setMessages((prev) =>
          prev.map((m) => (m.id === out.id ? { ...saved, localUri: m.localUri, localVideo: m.localVideo } : m)),
        );
        ensureUrls([saved]);
        notifyChat(saved.id);
      } catch (e) {
        setMessages((prev) => prev.map((m) => (m.id === out.id ? { ...m, status: 'failed' } : m)));
        if (e instanceof Error && /50 MB|video/i.test(e.message)) setError(e.message);
      }
    },
    [ensureUrls],
  );

  const saveEdit = useCallback(
    async (m: ChatItem, body: string) => {
      const before = m;
      setMessages((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, body, edited_at: new Date().toISOString() } : x)),
      );
      try {
        const saved = await editMessage(m.id, body);
        setMessages((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, ...saved, edited_at: saved.edited_at ?? x.edited_at } : x)),
        );
      } catch {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? before : x)));
        setError('Couldn’t save your edit. Try again.');
      }
    },
    [],
  );

  const send = useCallback(() => {
    const body = text.trim();
    if (editing) {
      const hasMedia = !!editing.image_path || !!editing.video_path;
      if (!body && !hasMedia) return;
      if (body !== (editing.body ?? '')) void saveEdit(editing, body);
      setEditing(null);
      setText('');
      return;
    }
    if (!body && !photo) return;
    const video = !!photo && photo.durationMs != null;
    const out: Outgoing = { id: newId(), roomId, userId: myId, body: body || null, replyTo: replyTo?.id ?? null, photo };
    outgoing.current.set(out.id, out);
    const optimistic: ChatItem = {
      id: out.id,
      room_id: roomId,
      user_id: myId,
      body: out.body,
      image_path: null,
      image_thumb_path: null,
      image_width: photo?.width ?? null,
      image_height: photo?.height ?? null,
      video_path: null,
      video_duration_ms: video ? (photo?.durationMs ?? null) : null,
      reply_to: out.replyTo,
      edited_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      status: 'sending',
      localUri: video ? undefined : photo?.uri,
      localVideo: video,
    };
    setMessages((prev) => [optimistic, ...prev]);
    setText('');
    setPhoto(null);
    setReplyTo(null);
    chat.current?.sendTyping(false);
    lastTypingSent.current = 0;
    deliver(out);
  }, [text, photo, replyTo, myId, roomId, editing, saveEdit, deliver]);

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

  const attach = useCallback((res: ImagePicker.ImagePickerResult) => {
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    if (tooBig(a)) {
      setError('That video is over 50 MB. Trim it and try again.');
      return;
    }
    setPhoto(toPicked(a));
  }, []);

  const pickPhoto = useCallback(async () => {
    attach(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 }));
  }, [attach]);

  const takePhoto = useCallback(async () => {
    attach(await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 }));
  }, [attach]);

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
    const path = m.video_path ?? m.image_path;
    if (!path) return;
    setSaving(true);
    setViewerNote(null);
    try {
      await savePhoto(path);
      setViewerNote('Downloading…');
    } catch {
      setViewerNote(`Couldn’t download that ${m.video_path ? 'video' : 'photo'}. Try again.`);
    } finally {
      setSaving(false);
    }
  }, []);

  const toggleMutePerson = useCallback(
    async (userId: string, name: string) => {
      const muted = !mutedPeople.has(userId);
      setMutedPeople((prev) => {
        const next = new Set(prev);
        if (muted) next.add(userId);
        else next.delete(userId);
        return next;
      });
      try {
        await setMuted('person', userId, muted, myId);
        setNotice(muted ? `No more notifications from ${name}` : `Notifications from ${name} are back on`);
      } catch {
        setMutedPeople((prev) => {
          const next = new Set(prev);
          if (muted) next.delete(userId);
          else next.add(userId);
          return next;
        });
        setError('Couldn’t change that. Try again.');
      }
    },
    [mutedPeople, myId],
  );

  const actionsFor = (m: ChatItem): SheetAction[] => {
    const list: SheetAction[] = [{ key: 'reply', label: 'Reply', icon: 'arrow-undo-outline', onPress: () => setReplyTo(m) }];
    if (m.body) {
      list.push({ key: 'copy', label: 'Copy text', icon: 'copy-outline', onPress: () => void Clipboard.setStringAsync(m.body ?? '') });
    }
    if (m.image_path) {
      list.push({
        key: 'save',
        label: m.video_path ? 'Download video' : 'Download photo',
        icon: 'download-outline',
        onPress: () => {
          setViewer(m);
          void doSave(m);
        },
      });
    }
    if (m.user_id === myId && !m.status) {
      list.push({
        key: 'edit',
        label: 'Edit message',
        icon: 'create-outline',
        onPress: () => {
          setReplyTo(null);
          setPhoto(null);
          setEditing(m);
          setText(m.body ?? '');
        },
      });
    }
    if (m.user_id !== myId) {
      const name = firstName(person(m.user_id).name);
      const muted = mutedPeople.has(m.user_id);
      list.push({
        key: 'mute',
        label: muted ? `Unmute ${name}` : `Mute ${name}`,
        icon: muted ? 'notifications-outline' : 'notifications-off-outline',
        onPress: () => void toggleMutePerson(m.user_id, name),
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
            prev.map((x) =>
              x.id === m.id
                ? { ...x, deleted_at: new Date().toISOString(), body: null, image_path: null, image_thumb_path: null, video_path: null }
                : x,
            ),
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
        senderAvatar={sender.avatar}
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

  const everyone = roomId === EVERYONE_ROOM;
  const title = room ? `${room.emoji ? `${room.emoji} ` : ''}${room.name}` : everyone ? 'Everyone' : 'Chat';
  const shownMembers = members.slice(0, 4);

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop height={260} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton
          icon="chevron-back"
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/chat'))}
        />
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1} testID="room-title">
            {title}
          </Text>
        </View>
        <Pressable
          style={styles.faces}
          accessibilityRole="button"
          accessibilityLabel="Room info and notifications"
          onPress={() => router.push({ pathname: '/(app)/chat/about/[room]', params: { room: roomId } })}
          testID="room-info"
        >
          {shownMembers.map((m, i) => (
            <Avatar
              key={m.id}
              name={m.name}
              path={m.avatar}
              color={personColor(i)}
              size={30}
              style={{ ...styles.face, marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }}
            />
          ))}
          <View style={styles.infoDot}>
            <Ionicons name="ellipsis-horizontal" size={16} color={c.inkSecondary} />
          </View>
        </Pressable>
      </View>
      <OfflineNotice />

      <KeyboardAvoidingView style={styles.flex}>
        {loading ? (
          <ChatSkeleton />
        ) : messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>👋</Text>
              <Text style={styles.emptyTitle}>{everyone ? 'Say hello to the group' : 'Say hello'}</Text>
              <Text style={[type.body, styles.emptyBody]}>
                {everyone
                  ? 'Plans, photos and “where are you?” — everyone on the trip sees this chat.'
                  : room?.is_private
                    ? 'Only the people in this room see it.'
                    : 'Anyone on the trip can open this room.'}
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
            ListFooterComponent={loadingOlder ? <OlderSkeleton /> : null}
            testID="chat-list"
          />
        )}

        {notice ? (
          <Pressable onPress={() => setNotice(null)} style={styles.error} accessibilityRole="button" accessibilityLiveRegion="polite">
            <Ionicons name="notifications-off-outline" size={16} color={c.highlight} />
            <Text style={[type.caption, { color: c.ink, flex: 1 }]}>{notice}</Text>
          </Pressable>
        ) : null}

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
          editing={editing ? (editing.body ?? '') : null}
          onCancelEdit={() => {
            setEditing(null);
            setText('');
          }}
          placeholder={everyone ? 'Message the group' : `Message ${room?.name ?? 'the room'}`}
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
        videoUri={viewer?.video_path ? (urls[viewer.video_path] ?? null) : null}
        caption={viewer?.body ?? ''}
        onClose={() => setViewer(null)}
        onSave={() => viewer && doSave(viewer)}
        onShare={() => {
          const path = viewer?.video_path ?? viewer?.image_path;
          if (path) sharePhoto(path).catch(() => {});
        }}
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
    alignItems: 'center',
    minHeight: 44,
  },
  infoDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginLeft: -8,
    backgroundColor: c.card,
    borderWidth: 2,
    borderColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: {
    borderWidth: 2,
    borderColor: c.background,
  },
  list: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  older: {
    gap: 8,
    paddingHorizontal: 56,
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
