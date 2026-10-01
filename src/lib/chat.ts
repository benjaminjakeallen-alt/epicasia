import type { RealtimeChannel } from '@supabase/supabase-js';
import { Linking, Platform } from 'react-native';
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

export type Member = { id: string; name: string };

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

export async function fetchMembers(): Promise<Member[]> {
  const { data, error } = await supabase.from('profiles').select('id, display_name').order('display_name');
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, name: p.display_name }));
}

/** Newest first; pass the oldest loaded timestamp to page further back. */
export async function fetchMessages(before?: string): Promise<Message[]> {
  let q = supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(PAGE_SIZE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchReactions(messageIds: string[]): Promise<Reaction[]> {
  if (messageIds.length === 0) return [];
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji, created_at')
    .in('message_id', messageIds);
  if (error) throw error;
  return data ?? [];
}

export type Outgoing = {
  id: string;
  userId: string;
  body: string | null;
  replyTo: string | null;
  photo?: { uri: string; width: number; height: number; mimeType?: string | null } | null;
};

async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  const { File } = await import('expo-file-system');
  return new File(uri).arrayBuffer();
}

/** Uploads the photo (if any) first, then inserts the row with the client-made id. */
export async function sendMessage(m: Outgoing): Promise<Message> {
  let imagePath: string | null = null;
  if (m.photo) {
    const type = m.photo.mimeType && m.photo.mimeType.startsWith('image/') ? m.photo.mimeType : 'image/jpeg';
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/gif' ? 'gif' : 'jpg';
    imagePath = `${m.userId}/${m.id}.${ext}`;
    const bytes = await readBytes(m.photo.uri);
    const { error: upErr } = await supabase.storage.from('chat').upload(imagePath, bytes, {
      contentType: type,
      upsert: false,
    });
    if (upErr) throw upErr;
  }
  const row = {
    id: m.id,
    user_id: m.userId,
    body: m.body?.trim() ? m.body.trim() : null,
    image_path: imagePath,
    image_width: m.photo ? Math.round(m.photo.width) : null,
    image_height: m.photo ? Math.round(m.photo.height) : null,
    reply_to: m.replyTo,
  };
  const { data, error } = await supabase.from('messages').insert(row).select().single();
  if (error) {
    if (imagePath) await supabase.storage.from('chat').remove([imagePath]);
    throw error;
  }
  return data;
}

/** Soft delete: the row stays (so replies keep their place) but its content goes. */
export async function deleteMessage(message: Message): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString(), body: null, image_path: null })
    .eq('id', message.id);
  if (error) throw error;
  if (message.image_path) await supabase.storage.from('chat').remove([message.image_path]);
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

// ---- Photos -------------------------------------------------------------

const SIGNED_TTL = 60 * 60; // seconds
const signed = new Map<string, { url: string; expires: number }>();

/** Signed URLs for private chat photos, cached until shortly before expiry. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of new Set(paths)) {
    const hit = signed.get(p);
    if (hit && hit.expires > now + 60_000) out[p] = hit.url;
    else missing.push(p);
  }
  if (missing.length) {
    const { data, error } = await supabase.storage.from('chat').createSignedUrls(missing, SIGNED_TTL);
    if (error) throw error;
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        signed.set(item.path, { url: item.signedUrl, expires: now + SIGNED_TTL * 1000 });
        out[item.path] = item.signedUrl;
      }
    }
  }
  return out;
}

/**
 * Saves a chat photo to the phone's photo library (native), or downloads it
 * (web). Returns false if the user declined the photo permission.
 */
export async function savePhoto(path: string): Promise<boolean> {
  const name = path.split('/').pop() ?? 'photo.jpg';
  if (Platform.OS === 'web') {
    const { data, error } = await supabase.storage.from('chat').createSignedUrl(path, 300, { download: name });
    if (error) throw error;
    await Linking.openURL(data.signedUrl);
    return true;
  }
  const [{ File, Paths }, MediaLibrary] = await Promise.all([import('expo-file-system'), import('expo-media-library')]);
  const { status } = await MediaLibrary.requestPermissionsAsync(true);
  if (status !== 'granted') return false;
  const url = (await signedUrls([path]))[path];
  const dest = new File(Paths.cache, `epicasia-${name}`);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(url, dest);
  await MediaLibrary.Asset.create(file.uri);
  return true;
}

/** Opens the share sheet for a chat photo (native) — AirDrop, Messages, etc. */
export async function sharePhoto(path: string): Promise<void> {
  const url = (await signedUrls([path]))[path];
  const { Share } = await import('react-native');
  await Share.share(Platform.OS === 'ios' ? { url } : { message: url });
}

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
