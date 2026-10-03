import { EVERYONE_ROOM } from './chat';
import { supabase } from './supabase';

// Unread counts per room (0015, `chat_room_reads`): when you last had each
// room open; unread = others' live messages since then. Home's Group Chat
// badge is the sum over rooms you haven't muted.

/** Marks everything in a room up to now as read. */
export async function markRoomRead(userId: string, roomId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_room_reads')
    .upsert({ user_id: userId, room_id: roomId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,room_id' });
  if (error) throw error;
}

/** Others' messages since you last opened each room (all of them if you never have), by room id. */
export async function fetchUnreadCounts(userId: string): Promise<Record<string, number>> {
  const [{ data: rooms, error: roomsErr }, { data: reads, error: readsErr }] = await Promise.all([
    supabase.from('chat_rooms').select('id'),
    supabase.from('chat_room_reads').select('room_id, last_read_at').eq('user_id', userId),
  ]);
  if (roomsErr) throw roomsErr;
  if (readsErr) throw readsErr;
  const lastRead = new Map((reads ?? []).map((r) => [r.room_id, r.last_read_at as string]));
  const ids = (rooms ?? []).map((r) => r.id as string);
  if (!ids.includes(EVERYONE_ROOM)) ids.push(EVERYONE_ROOM);
  const counts = await Promise.all(
    ids.map(async (id) => {
      let q = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', id)
        .neq('user_id', userId)
        .is('deleted_at', null);
      const since = lastRead.get(id);
      if (since) q = q.gt('created_at', since);
      const { count, error } = await q;
      if (error) throw error;
      return [id, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts);
}

/** The home badge: unread across rooms, leaving out muted ones. */
export async function fetchUnreadCount(userId: string): Promise<number> {
  const [counts, { data: mutes }] = await Promise.all([
    fetchUnreadCounts(userId),
    supabase.from('chat_mutes').select('muted_room_id').eq('user_id', userId).not('muted_room_id', 'is', null),
  ]);
  const muted = new Set((mutes ?? []).map((m) => m.muted_room_id));
  return Object.entries(counts).reduce((n, [id, c]) => (muted.has(id) ? n : n + c), 0);
}

/** Calls `onNew` whenever someone else posts in a room you can see (for a live badge). Returns an unsubscribe. */
export function watchNewMessages(userId: string, onNew: () => void): () => void {
  const channel = supabase
    .channel('unread-badge')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      if ((payload.new as { user_id?: string }).user_id !== userId) onNew();
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
