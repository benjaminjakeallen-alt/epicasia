import type { RealtimeChannel } from '@supabase/supabase-js';
import { removePhotoFiles, savePhoto as savePhotoIn, sharePhoto as sharePhotoIn, signedUrls as signedIn, uploadPhoto, type PickedPhoto } from './photos';
import { cached } from './offline';
import { supabase } from './supabase';

// Group chat data layer: one room for the whole trip ("everyone").
// Messages/reactions live in Postgres (0005_group_chat.sql), photos in the
// private `chat` storage bucket under "<sender uid>/<message id>.<ext>",
// shown through short-lived signed URLs. New rows arrive over Supabase
// Realtime; typing indicators ride a private broadcast channel.

export type Message = {
  id: string;
  user_id: string;
  body: string | null;
  image_path: string | null;
  image_thumb_path: string | null;
  image_width: number | null;
  image_height: number | null;
  reply_to: string | null;
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

const TYPING_TOPIC = 'chat:everyone';

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

/** Newest first; pass the oldest loaded timestamp to page further back. */
async function fetchMessagesLive(before?: string): Promise<Message[]> {
  let q = supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(PAGE_SIZE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Cached for offline use (first page only). */
export async function fetchMessages(before?: string): Promise<Message[]> {
  return before ? fetchMessagesLive(before) : cached('messages', () => fetchMessagesLive());
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
export async function fetchReactions(messageIds: string[]): Promise<Reaction[]> {
  const want = new Set(messageIds);
  const all = await cached('reactions', () => fetchReactionsLive(messageIds));
  return all.filter((r) => want.has(r.message_id));
}

export type Outgoing = {
  id: string;
  userId: string;
  body: string | null;
  replyTo: string | null;
  photo?: PickedPhoto | null;
};

/**
 * Uploads the photo (original + thumbnail) first, then inserts the row with
 * the client-made id. The database copies photo messages into the gallery
 * (0006_shared_gallery.sql), so nothing else to do here for that.
 */
export async function sendMessage(m: Outgoing): Promise<Message> {
  let up: { path: string; thumbPath: string | null } | null = null;
  if (m.photo) up = await uploadPhoto('chat', `${m.userId}/${m.id}`, m.photo);
  const row = {
    id: m.id,
    user_id: m.userId,
    body: m.body?.trim() ? m.body.trim() : null,
    image_path: up?.path ?? null,
    image_thumb_path: up?.thumbPath ?? null,
    image_width: m.photo ? Math.round(m.photo.width) : null,
    image_height: m.photo ? Math.round(m.photo.height) : null,
    reply_to: m.replyTo,
  };
  const { data, error } = await supabase.from('messages').insert(row).select().single();
  if (error) {
    if (up) await removePhotoFiles('chat', [up.path, up.thumbPath]);
    throw error;
  }
  return data;
}

/** Soft delete: the row stays (so replies keep their place) but its content goes. */
export async function deleteMessage(message: Message): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString(), body: null, image_path: null, image_thumb_path: null })
    .eq('id', message.id);
  if (error) throw error;
  await removePhotoFiles('chat', [message.image_path, message.image_thumb_path]);
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

/** Subscribes to new/edited messages, reactions and typing. Returns cleanup + a typing sender. */
export function subscribeChat(myId: string, events: ChatEvents) {
  const db: RealtimeChannel = supabase
    .channel('chat-db')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) =>
      events.onMessage(p.new as Message),
    )
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) =>
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
        .channel(TYPING_TOPIC, { config: { private: true, broadcast: { self: false } } })
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
