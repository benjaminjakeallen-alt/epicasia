import { newId } from './chat';
import { cached } from './offline';
import { readBytes, removePhotoFiles, signedUrls, uploadPhoto } from './photos';
import { supabase } from './supabase';

// My documents: each traveler's private copies of their passport, visa,
// insurance, QR codes and bookings (0011_travel_documents.sql). Owner-only
// rows; files in the private `documents` bucket at "<uid>/<id>.<ext>"
// (photos also get a "<id>.thumb.jpg"). Every document is also kept in the
// browser (Cache Storage), so it opens at a border desk with no signal;
// signing out deletes those copies.

export type DocKind = 'passport' | 'visa' | 'insurance' | 'vjw' | 'china-arrival' | 'booking' | 'other';

export const DOC_KINDS: { kind: DocKind; label: string; icon: string }[] = [
  { kind: 'passport', label: 'Passport', icon: 'id-card-outline' },
  { kind: 'visa', label: 'Visa', icon: 'document-text-outline' },
  { kind: 'insurance', label: 'Travel insurance', icon: 'medkit-outline' },
  { kind: 'vjw', label: 'Visit Japan Web QR', icon: 'qr-code-outline' },
  { kind: 'china-arrival', label: 'China arrival card', icon: 'clipboard-outline' },
  { kind: 'booking', label: 'Booking', icon: 'bed-outline' },
  { kind: 'other', label: 'Other', icon: 'folder-open-outline' },
];

export function kindInfo(kind: string) {
  return DOC_KINDS.find((k) => k.kind === kind) ?? DOC_KINDS[DOC_KINDS.length - 1];
}

export type TravelDoc = {
  id: string;
  user_id: string;
  kind: DocKind;
  label: string;
  storage_path: string;
  thumb_path: string | null;
  mime: string;
  size_bytes: number | null;
  file_name: string | null;
  created_at: string;
};

/** A file picked from Photos, the camera or Files. */
export type PickedFile = {
  uri: string;
  name: string | null;
  mime: string;
  size: number | null;
  width?: number;
  height?: number;
};

export const MAX_BYTES = 20 * 1024 * 1024; // the bucket's limit
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

export const isPdf = (d: { mime: string }) => d.mime === 'application/pdf';

async function fetchDocumentsLive(): Promise<TravelDoc[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, user_id, kind, label, storage_path, thumb_path, mime, size_bytes, file_name, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TravelDoc[];
}

/** Your documents (RLS returns only your own). Cached for offline use. */
export async function fetchDocuments(): Promise<TravelDoc[]> {
  return cached('documents', () => fetchDocumentsLive());
}

function extFor(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic') return 'heic';
  return 'jpg';
}

/** Uploads the file, then saves the row. A failed save removes the upload. */
export async function addDocument(
  userId: string,
  file: PickedFile,
  kind: DocKind,
  label: string,
): Promise<TravelDoc> {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 80) throw new Error('Give it a name of 1 to 80 characters.');
  if (!ALLOWED.includes(file.mime)) throw new Error('Choose a photo or a PDF.');
  if (file.size != null && file.size > MAX_BYTES) throw new Error('That file is over 20 MB.');

  const id = newId();
  const base = `${userId}/${id}`;
  let path: string;
  let thumbPath: string | null = null;
  if (file.mime === 'application/pdf') {
    path = `${base}.pdf`;
    const { error } = await supabase.storage
      .from('documents')
      .upload(path, await readBytes(file.uri), { contentType: file.mime, upsert: false });
    if (error) throw error;
  } else {
    // Size unknown (picked from Files): treat as large so the thumbnail is shrunk.
    const up = await uploadPhoto('documents', base, {
      uri: file.uri,
      width: file.width || 10_000,
      height: file.height || 10_000,
      mimeType: file.mime,
    });
    path = up.path;
    thumbPath = up.thumbPath;
  }

  const row = {
    id,
    user_id: userId,
    kind,
    label: clean,
    storage_path: path,
    thumb_path: thumbPath,
    mime: file.mime === 'application/pdf' ? file.mime : path.endsWith('.jpg') ? 'image/jpeg' : file.mime,
    size_bytes: file.size,
    file_name: file.name ? file.name.slice(0, 200) : null,
  };
  const { data, error } = await supabase.from('documents').insert(row).select().single();
  if (error) {
    await removePhotoFiles('documents', [path, thumbPath]).catch(() => {});
    throw error;
  }
  return data as TravelDoc;
}

export async function deleteDocument(doc: TravelDoc): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', doc.id);
  if (error) throw error;
  await removePhotoFiles('documents', [doc.storage_path, doc.thumb_path]).catch(() => {});
  await deleteLocalCopy(doc).catch(() => {});
}

// ---- Copies kept in the browser (offline) --------------------------------
// Every document is also kept in the browser's Cache Storage, under a
// made-up same-origin URL per file, so it opens at a border desk with no
// signal. Signing out deletes the whole cache.

const CACHE = 'epicasia-documents';

function cacheKey(doc: TravelDoc): string {
  return `${location.origin}/__offline-documents/${doc.storage_path}`;
}

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE);
  } catch {
    return null;
  }
}

/** The saved copy, if this browser has one. */
async function localBlob(doc: TravelDoc): Promise<Blob | null> {
  const cache = await openCache();
  const hit = await cache?.match(cacheKey(doc));
  return hit ? hit.blob() : null;
}

async function signedUrl(doc: TravelDoc): Promise<string> {
  return (await signedUrls('documents', [doc.storage_path]))[doc.storage_path];
}

/** The file itself: the saved copy, else downloaded (and saved). */
async function fileBlob(doc: TravelDoc): Promise<Blob> {
  const local = await localBlob(doc);
  if (local) return local;
  const res = await fetch(await signedUrl(doc));
  if (!res.ok) throw new Error('Could not download that document');
  const blob = await res.blob();
  const cache = await openCache();
  await cache?.put(cacheKey(doc), new Response(blob, { headers: { 'Content-Type': doc.mime } })).catch(() => {});
  return blob;
}

async function deleteLocalCopy(doc: TravelDoc) {
  const cache = await openCache();
  await cache?.delete(cacheKey(doc));
}

/**
 * Saves every document in this browser (and drops copies of deleted ones),
 * so they all open offline. Returns how many are saved, or null when this
 * browser can't keep them.
 */
export async function keepOffline(docs: TravelDoc[], userId: string): Promise<number | null> {
  const cache = await openCache();
  if (!cache) return null;
  let saved = 0;
  for (const doc of docs) {
    try {
      await fileBlob(doc);
      saved += 1;
    } catch {
      // offline or failed: try again next time
    }
  }
  try {
    const keep = new Set(docs.map(cacheKey));
    const mine = `${location.origin}/__offline-documents/${userId}/`;
    for (const req of await cache.keys()) if (req.url.startsWith(mine) && !keep.has(req.url)) await cache.delete(req);
  } catch {
    // best effort
  }
  return saved;
}

/** Sign-out: delete every document saved in this browser. */
export async function clearLocalDocuments(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') await caches.delete(CACHE);
  } catch {
    // ignore
  }
}

/** Best URI to show a photo document: the saved copy, else a signed URL. */
export async function viewUri(doc: TravelDoc): Promise<string> {
  const local = await localBlob(doc);
  return local ? URL.createObjectURL(local) : signedUrl(doc);
}

/** Opens a PDF in a new tab (the browser's PDF viewer: zoom, print, save) — offline from the saved copy. */
export async function openPdf(doc: TravelDoc): Promise<void> {
  // Opened before any await, so popup blockers see the tap.
  const win = window.open('', '_blank');
  const local = await localBlob(doc);
  const url = local ? URL.createObjectURL(local) : await signedUrl(doc);
  if (win) win.location.href = url;
  else window.location.href = url;
}

/** Share sheet for a document (AirDrop, Mail, Save to Files…); downloads it where files can't be shared. */
export async function shareDocument(doc: TravelDoc): Promise<void> {
  const blob = await fileBlob(doc);
  const name = doc.file_name || `${doc.label}.${extFor(doc.mime)}`;
  const file = new File([blob], name, { type: doc.mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: doc.label });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function formatSize(bytes: number | null | undefined): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
