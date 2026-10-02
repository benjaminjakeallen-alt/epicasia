import { Platform } from 'react-native';
import { newId } from './chat';
import { readBytes, removePhotoFiles, uploadPhoto } from './photos';
import { supabase } from './supabase';

// Personal trip journal (0007_journal.sql). An entry has a trip day, an
// optional title and text, and any number of photos and voice notes
// (journal_media). Files live in the private `journal` bucket under
// "<uid>/<entry id>/<media id>.<ext>". Entries are private unless shared
// with the group.

export type JournalMedia = {
  id: string;
  entry_id: string;
  user_id: string;
  kind: 'photo' | 'audio';
  storage_path: string;
  thumb_path: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  caption: string | null;
  position: number;
  created_at: string;
};

export type JournalEntry = {
  id: string;
  user_id: string;
  title: string | null;
  body: string | null;
  day: string; // "YYYY-MM-DD"
  city: string | null;
  shared_to_group: boolean;
  created_at: string;
  updated_at: string;
  journal_media: JournalMedia[];
};

/** A photo or voice note in the editor — saved (has storage_path) or new (has localUri). */
export type DraftMedia = {
  id: string;
  kind: 'photo' | 'audio';
  storage_path?: string;
  thumb_path?: string | null;
  localUri?: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  caption: string;
};

export type Draft = {
  id: string;
  isNew: boolean;
  title: string;
  body: string;
  day: string;
  city: string;
  shared: boolean;
  media: DraftMedia[];
};

const SELECT = '*, journal_media(*)';

function sortMedia(e: JournalEntry): JournalEntry {
  return { ...e, journal_media: [...(e.journal_media ?? [])].sort((a, b) => a.position - b.position) };
}

export async function fetchMyEntries(userId: string): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select(SELECT)
    .eq('user_id', userId)
    .order('day', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as JournalEntry[]).map(sortMedia);
}

export async function fetchSharedEntries(userId: string): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select(SELECT)
    .eq('shared_to_group', true)
    .neq('user_id', userId)
    .order('day', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as JournalEntry[]).map(sortMedia);
}

export async function fetchEntry(id: string): Promise<JournalEntry | null> {
  const { data, error } = await supabase.from('journal_entries').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? sortMedia(data as JournalEntry) : null;
}

export function draftFrom(e: JournalEntry): Draft {
  return {
    id: e.id,
    isNew: false,
    title: e.title ?? '',
    body: e.body ?? '',
    day: e.day,
    city: e.city ?? '',
    shared: e.shared_to_group,
    media: e.journal_media.map((m) => ({
      id: m.id,
      kind: m.kind,
      storage_path: m.storage_path,
      thumb_path: m.thumb_path,
      width: m.width,
      height: m.height,
      duration_ms: m.duration_ms,
      caption: m.caption ?? '',
    })),
  };
}

export function emptyDraft(day: string, city: string): Draft {
  return { id: newId(), isNew: true, title: '', body: '', day, city, shared: false, media: [] };
}

export function hasContent(d: Draft): boolean {
  return !!(d.title.trim() || d.body.trim() || d.media.length);
}

function audioType(uri: string, mime?: string | null): { type: string; ext: string } {
  if (mime?.startsWith('audio/')) return { type: mime.split(';')[0], ext: mime.includes('webm') ? 'webm' : 'm4a' };
  if (uri.endsWith('.webm') || Platform.OS === 'web') return { type: 'audio/webm', ext: 'webm' };
  if (uri.endsWith('.wav')) return { type: 'audio/wav', ext: 'wav' };
  return { type: 'audio/mp4', ext: 'm4a' };
}

async function uploadAudio(base: string, m: DraftMedia): Promise<string> {
  const { type, ext } = audioType(m.localUri!, m.mimeType);
  const path = `${base}.${ext}`;
  const { error } = await supabase.storage.from('journal').upload(path, await readBytes(m.localUri!), {
    contentType: type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/**
 * Saves an entry: the row first (so media rows have a parent), then new
 * files, then media rows; media removed in the editor are deleted with
 * their files. `onProgress` reports uploads done / total.
 */
export async function saveDraft(
  draft: Draft,
  userId: string,
  previous: JournalEntry | null,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const row = {
    id: draft.id,
    user_id: userId,
    title: draft.title.trim() || null,
    body: draft.body.trim() || null,
    day: draft.day,
    city: draft.city.trim() || null,
    shared_to_group: draft.shared,
    updated_at: new Date().toISOString(),
  };
  const { error } = draft.isNew
    ? await supabase.from('journal_entries').insert(row)
    : await supabase.from('journal_entries').update(row).eq('id', draft.id);
  if (error) throw error;

  // Removed media: rows, then files.
  const keep = new Set(draft.media.map((m) => m.id));
  const removed = (previous?.journal_media ?? []).filter((m) => !keep.has(m.id));
  if (removed.length) {
    const { error: delErr } = await supabase
      .from('journal_media')
      .delete()
      .in(
        'id',
        removed.map((m) => m.id),
      );
    if (delErr) throw delErr;
    await removePhotoFiles(
      'journal',
      removed.flatMap((m) => [m.storage_path, m.thumb_path]),
    ).catch(() => {});
  }

  // New media: upload, then insert rows in editor order.
  const fresh = draft.media.filter((m) => !m.storage_path);
  let done = 0;
  onProgress?.(0, fresh.length);
  const rows = [];
  for (const [position, m] of draft.media.entries()) {
    if (m.storage_path) continue;
    const base = `${userId}/${draft.id}/${m.id}`;
    if (m.kind === 'photo') {
      const { path, thumbPath } = await uploadPhoto('journal', base, {
        uri: m.localUri!,
        width: m.width ?? 0,
        height: m.height ?? 0,
        mimeType: m.mimeType,
      });
      rows.push({ ...mediaRow(m, draft.id, userId, position), storage_path: path, thumb_path: thumbPath });
    } else {
      const path = await uploadAudio(base, m);
      rows.push({ ...mediaRow(m, draft.id, userId, position), storage_path: path, thumb_path: null });
    }
    onProgress?.(++done, fresh.length);
  }
  if (rows.length) {
    const { error: insErr } = await supabase.from('journal_media').insert(rows);
    if (insErr) throw insErr;
  }

  // Existing media: captions and order.
  for (const [position, m] of draft.media.entries()) {
    if (!m.storage_path) continue;
    const before = previous?.journal_media.find((p) => p.id === m.id);
    const caption = m.caption.trim() || null;
    if (before && (before.caption !== caption || before.position !== position)) {
      const { error: upErr } = await supabase.from('journal_media').update({ caption, position }).eq('id', m.id);
      if (upErr) throw upErr;
    }
  }
}

function mediaRow(m: DraftMedia, entryId: string, userId: string, position: number) {
  return {
    id: m.id,
    entry_id: entryId,
    user_id: userId,
    kind: m.kind,
    width: m.width ?? null,
    height: m.height ?? null,
    duration_ms: m.duration_ms ?? null,
    caption: m.caption.trim() || null,
    position,
  };
}

export async function deleteEntry(entry: JournalEntry): Promise<void> {
  const files = entry.journal_media.flatMap((m) => [m.storage_path, m.thumb_path]);
  const { error } = await supabase.from('journal_entries').delete().eq('id', entry.id);
  if (error) throw error;
  await removePhotoFiles('journal', files).catch(() => {});
}

/** "1:05" */
export function formatDuration(ms: number | null | undefined): string {
  const s = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
