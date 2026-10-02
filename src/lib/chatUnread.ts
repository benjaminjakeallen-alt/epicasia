import { supabase } from './supabase';

// Group-chat unread badge (0009_chat_unread_push.sql): `chat_reads` keeps
// when you last had the chat open; unread = others' messages since then.

/** Marks everything up to now as read. */
export async function markChatRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_reads')
    .upsert({ user_id: userId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** Others' messages since you last opened the chat (all of them if you never have). */
export async function fetchUnreadCount(userId: string): Promise<number> {
  const { data: read, error: readErr } = await supabase
    .from('chat_reads')
    .select('last_read_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (readErr) throw readErr;
  let q = supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .neq('user_id', userId)
    .is('deleted_at', null);
  if (read?.last_read_at) q = q.gt('created_at', read.last_read_at);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** Calls `onNew` whenever someone else posts (for a live badge). Returns an unsubscribe. */
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
