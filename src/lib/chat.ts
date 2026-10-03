import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  isVideo,
  removePhotoFiles,
  savePhoto as savePhotoIn,
  sharePhoto as sharePhotoIn,
  signedUrls as signedIn,
  uploadPhoto,
  uploadVideo,
  type PickedPhoto,
} from './photos';
import { cached } from './offline';
import { supabase } from './supabase';

// Group chat data layer. Rooms (0015): "Everyone" plus any open or private
// rooms people make. Messages/reactions live in Postgres (0005, 0015),
// photos and videos in the private `chat` storage bucket under
// "<sender uid>/<message id>.<ext>" (a video also gets a poster photo, which
// is what `image_path` points at), shown through short-lived signed URLs.
// New rows arrive over Supabase Realtime; typing indicators ride a private
// broadcast channel per room ("chat:<room id>").

/** The original whole-trip room; can't be deleted. */
export const EVERYONE_ROOM = '00000000-0000-4000-8000-000000000001';

export type Room = {
  id: string;
  name: string;
  emoji: string | null;
  is_private: boolean;
  created_by: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  room_id: string;
  user_id: string;
  body: string | null;
  image_path: string | null;
  image_thumb_path: string | null;
  image_width: number | null;
  image_height: number | null;
  video_path: string | null;
  video_duration_ms: number | null;
  reply_to: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type Reaction = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at?: string;
};

export type Member = { id: string; name: string; avatar: string | null };

export const PAGE_SIZE = 40;
export const QUICK_REACTIONS = ['❤️', '😂', '👍', '😮', '😢', '🙏'];
export const MORE_REACTIONS = [
  '🔥', '🎉', '👏', '😍', '🤩', '🥰', '😎', '🤔', '🙌', '💯',
  '😅', '🤣', '😭', '😱', '🥳', '😴', '🤤', '🍜', '🍣', '🍡',
  '🥟', '🍵', '🧋', '🍻', '🏯', '⛩️', '🗼', '🎢', '🏰', '🐉',
  '🐼', '🦌', '🌸', '🎌', '✈️', '🚄', '🛍️', '📸', '🙈', '✅',
];

// RFC 4122 v4 id made on the device, so a sent message can be shown at once
// and its realtime echo recognised as the same row (no crypto module needed
// for an id that only has to be unique).
export function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function fetchMembersLive(): Promise<Member[]> {
  const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_url').order('display_name');
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, name: p.display_name, avatar: p.avatar_url ?? null }));
}

/** Cached for offline use. */
export async function fetchMembers(): Promise<Member[]> {
  return cached('members', () => fetchMembersLive());
}

// ---- Rooms --------------------------------------------------------------

async function fetchRoomsLive(): Promise<Room[]> {
  const { data, error } = await supabase.from('chat_rooms').select('*').order('created_at');
  if (error) throw error;
  return data ?? [];
}

/** Every room you can see, Everyone first. Cached for offline use. */
export async function fetchRooms(): Promise<Room[]> {
  const rooms = await cached('rooms', () => fetchRoomsLive());
  return [...rooms].sort((a, b) => (a.id === EVERYONE_ROOM ? -1 : b.id === EVERYONE_ROOM ? 1 : a.created_at.localeCompare(b.created_at)));
}

export async function fetchRoomMembers(roomId: string): Promise<string[]> {
  const { data, error } = await supabase.from('chat_room_members').select('user_id').eq('room_id', roomId);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id);
}

export type NewRoom = { name: string; emoji: string | null; isPrivate: boolean; memberIds: string[] };

export async function createRoom(r: NewRoom, myId: string): Promise<Room> {
  const id = newId();
  const { data, error } = await supabase
    .from('chat_rooms')
    .insert({ id, name: r.name.trim(), emoji: r.emoji, is_private: r.isPrivate, created_by: myId })
    .select()
    .single();
  if (error) throw error;
  const others = r.memberIds.filter((u) => u !== myId);
  if (r.isPrivate && others.length) {
    const { error: mErr } = await supabase
      .from('chat_room_members')
      .insert([myId, ...others].map((user_id) => ({ room_id: id, user_id })));
    if (mErr) {
      await supabase.from('chat_rooms').delete().eq('id', id);
      throw mErr;
    }
  }
  return data;
}

export async function renameRoom(roomId: string, name: string, emoji: string | null): Promise<void> {
  const { error } = await supabase.from('chat_rooms').update({ name: name.trim(), emoji }).eq('id', roomId);
  if (error) throw error;
}

export async function deleteRoom(roomId: string): Promise<void> {
  const { error } = await supabase.from('chat_rooms').delete().eq('id', roomId);
  if (error) throw error;
}

export async function addRoomMember(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('chat_room_members').insert({ room_id: roomId, user_id: userId });
  if (error && error.code !== '23505') throw error;
}

/** Removes someone from a private room (or yourself: leaving). */
export async function removeRoomMember(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('chat_room_members').delete().match({ room_id: roomId, user_id: userId });
  if (error) throw error;
}

/** The newest message in each room, for the room list. */
export async function fetchLatestMessages(roomIds: string[]): Promise<Record<string, Message>> {
  const out: Record<string, Message> = {};
  const got = await cached('latest', async () => {
    const rows = await Promise.all(
      roomIds.map(async (id) => {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('room_id', id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) throw error;
        return data?.[0] ?? null;
      }),
    );
    return rows.filter((m): m is Message => !!m);
  });
  for (const m of got) out[m.room_id] = m;
  return out;
}

// ---- Messages -------------------------------------------------------------

/** Newest first; pass the oldest loaded timestamp to page further back. */
async function fetchMessagesLive(roomId: string, before?: string): Promise<Message[]> {
  let q = supabase
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Cached for offline use (first page only). */
export async function fetchMessages(roomId: string, before?: string): Promise<Message[]> {
  return before ? fetchMessagesLive(roomId, before) : cached(`messages.${roomId}`, () => fetchMessagesLive(roomId));
}

async function fetchReactionsLive(messageIds: string[]): Promise<Reaction[]> {
  if (messageIds.length === 0) return [];
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji, created_at')
    .in('message_id', messageIds);
  if (error) throw error;
  return data ?? [];
}

/** Cached for offline use; offline, the saved set is filtered to `messageIds`. */
export async function fetchReactions(roomId: string, messageIds: string[]): Promise<Reaction[]> {
  const want = new Set(messageIds);
  const all = await cached(`reactions.${roomId}`, () => fetchReactionsLive(messageIds));
  return all.filter((r) => want.has(r.message_id));
}

export type Outgoing = {
  id: string;
  roomId: string;
  userId: string;
  body: string | null;
  replyTo: string | null;
  photo?: PickedPhoto | null;
};

/**
 * Uploads the photo (original + thumbnail) or video (+ poster) first, then
 * inserts the row with the client-made id. The database copies photo and
 * video messages into the gallery (0006/0015), so nothing else to do here.
 */
export async function sendMessage(m: Outgoing): Promise<Message> {
  const base = `${m.userId}/${m.id}`;
  let up: { path: string; thumbPath: string | null; width: number; height: number } | null = null;
  let video: { videoPath: string; durationMs: number } | null = null;
  if (m.photo && isVideo(m.photo)) {
    const v = await uploadVideo('chat', base, m.photo);
    up = v;
    video = v;
  } else if (m.photo) {
    up = { ...(await uploadPhoto('chat', base, m.photo)), width: m.photo.width, height: m.photo.height };
  }
  const row = {
    id: m.id,
    room_id: m.roomId,
    user_id: m.userId,
    body: m.body?.trim() ? m.body.trim() : null,
    image_path: up?.path ?? null,
    image_thumb_path: up?.thumbPath ?? null,
    image_width: up ? Math.round(up.width) : null,
    image_height: up ? Math.round(up.height) : null,
    video_path: video?.videoPath ?? null,
    video_duration_ms: video?.durationMs ?? null,
    reply_to: m.replyTo,
  };
  const { data, error } = await supabase.from('messages').insert(row).select().single();
  if (error) {
    if (up) await removePhotoFiles('chat', [up.path, up.thumbPath, video?.videoPath]);
    throw error;
  }
  return data;
}

/** Changes your message's text; the database stamps `edited_at`. */
export async function editMessage(id: string, body: string): Promise<Message> {
  const { data, error } = await supabase.from('messages').update({ body: body.trim() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/** Soft delete: the row stays (so replies keep their place) but its content goes. */
export async function deleteMessage(message: Message): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({
      deleted_at: new Date().toISOString(),
      body: null,
      image_path: null,
      image_thumb_path: null,
      video_path: null,
    })
    .eq('id', message.id);
  if (error) throw error;
  await removePhotoFiles('chat', [message.image_path, message.image_thumb_path, message.video_path]);
}

// ---- Mutes (no notifications from a person or a room) -------------------

export type Mutes = { people: Set<string>; rooms: Set<string> };

export async function fetchMutes(): Promise<Mutes> {
  const rows = await cached('mutes', async () => {
    const { data, error } = await supabase.from('chat_mutes').select('muted_user_id, muted_room_id');
    if (error) throw error;
    return data ?? [];
  });
  return {
    people: new Set(rows.map((r) => r.muted_user_id).filter((x): x is string => !!x)),
    rooms: new Set(rows.map((r) => r.muted_room_id).filter((x): x is string => !!x)),
  };
}

export async function setMuted(kind: 'person' | 'room', id: string, muted: boolean, myId: string): Promise<void> {
  const col = kind === 'person' ? 'muted_user_id' : 'muted_room_id';
  if (muted) {
    const { error } = await supabase.from('chat_mutes').insert({ user_id: myId, [col]: id });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase.from('chat_mutes').delete().eq('user_id', myId).eq(col, id);
    if (error) throw error;
  }
}

export async function addReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await supabase.from('message_reactions').insert({ message_id: messageId, user_id: userId, emoji });
  if (error && error.code !== '23505') throw error; // already reacted: fine
}

export async function removeReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .match({ message_id: messageId, user_id: userId, emoji });
  if (error) throw error;
}

// ---- Photos (chat bucket) ------------------------------------------------

export const signedUrls = (paths: string[]) => signedIn('chat', paths);
export const savePhoto = (path: string) => savePhotoIn('chat', path);
export const sharePhoto = (path: string) => sharePhotoIn('chat', path);

// ---- Realtime -----------------------------------------------------------

export type ChatEvents = {
  onMessage: (m: Message) => void; // insert or update
  onReactionAdded: (r: Reaction) => void;
  onReactionRemoved: (r: Reaction) => void;
  onTyping: (userId: string, typing: boolean) => void;
};

/** Subscribes to one room's new/edited messages, reactions and typing. Returns cleanup + a typing sender. */
export function subscribeChat(roomId: string, myId: string, events: ChatEvents) {
  const filter = `room_id=eq.${roomId}`;
  const db: RealtimeChannel = supabase
    .channel(`chat-db-${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (p) =>
      events.onMessage(p.new as Message),
    )
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, (p) =>
      events.onMessage(p.new as Message),
    )
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, (p) =>
      events.onReactionAdded(p.new as Reaction),
    )
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, (p) =>
      events.onReactionRemoved(p.old as Reaction),
    )
    .subscribe();

  let typingChannel: RealtimeChannel | null = null;
  let cancelled = false;
  // Private channels need the user's JWT on the realtime socket first.
  supabase.realtime
    .setAuth()
    .catch(() => {})
    .then(() => {
      if (cancelled) return;
      typingChannel = supabase
        .channel(`chat:${roomId}`, { config: { private: true, broadcast: { self: false } } })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const p = payload as { userId?: string; typing?: boolean };
          if (p.userId && p.userId !== myId) events.onTyping(p.userId, !!p.typing);
        })
        .subscribe();
    });

  return {
    sendTyping(typing: boolean) {
      typingChannel?.send({ type: 'broadcast', event: 'typing', payload: { userId: myId, typing } }).catch(() => {});
    },
    unsubscribe() {
      cancelled = true;
      supabase.removeChannel(db);
      if (typingChannel) supabase.removeChannel(typingChannel);
    },
  };
}

/** Calls `onChange` when rooms or any visible room's messages change (the room list). */
export function watchRoomList(onChange: () => void): () => void {
  const channel = supabase
    .channel('chat-rooms')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
