import { Platform } from 'react-native';
import { newId } from './chat';
import { cached } from './offline';
import { readBytes, removePhotoFiles, signedUrls, uploadPhoto } from './photos';
import { supabase } from './supabase';

// My documents: each traveler's private copies of their passport, visa,
// insurance, QR codes and bookings (0011_travel_documents.sql). Owner-only
// rows; files in the private `documents` bucket at "<uid>/<id>.<ext>"
// (photos also get a "<id>.thumb.jpg"). On a phone every document is also
// downloaded to the app's own storage, so it opens at a border desk with no
// signal; signing out deletes those copies.

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

export async function renameDocument(id: string, label: string): Promise<void> {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 80) throw new Error('Give it a name of 1 to 80 characters.');
  const { error } = await supabase.from('documents').update({ label: clean }).eq('id', id);
  if (error) throw error;
}

export async function deleteDocument(doc: TravelDoc): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', doc.id);
  if (error) throw error;
  await removePhotoFiles('documents', [doc.storage_path, doc.thumb_path]).catch(() => {});
  await deleteLocalCopy(doc).catch(() => {});
}

// ---- Copies on the phone (native) -----------------------------------------

const LOCAL_DIR = 'travel-documents';

async function localFile(doc: TravelDoc) {
  const { Directory, File, Paths } = await import('expo-file-system');
  const dir = new Directory(Paths.document, LOCAL_DIR, doc.user_id);
  return { dir, file: new File(dir, doc.storage_path.split('/').pop() ?? `${doc.id}.${extFor(doc.mime)}`) };
}

/** Local file URI if this document has been saved on the phone. */
export async function localUri(doc: TravelDoc): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { file } = await localFile(doc);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

async function download(doc: TravelDoc): Promise<string> {
  const { File } = await import('expo-file-system');
  const { dir, file } = await localFile(doc);
  if (file.exists) return file.uri;
  dir.create({ intermediates: true, idempotent: true });
  const url = (await signedUrls('documents', [doc.storage_path]))[doc.storage_path];
  const out = await File.downloadFileAsync(url, file, { idempotent: true });
  return out.uri;
}

async function deleteLocalCopy(doc: TravelDoc) {
  if (Platform.OS === 'web') return;
  const { file } = await localFile(doc);
  if (file.exists) file.delete();
}

/**
 * Saves every document on the phone (and drops copies of deleted ones), so
 * they all open offline. Returns how many are saved. Native only.
 */
export async function keepOffline(docs: TravelDoc[], userId: string): Promise<number> {
  if (Platform.OS === 'web') return 0;
  let saved = 0;
  for (const doc of docs) {
    try {
      await download(doc);
      saved += 1;
    } catch {
      // offline or failed: try again next time
    }
  }
  try {
    const { Directory, File, Paths } = await import('expo-file-system');
    const dir = new Directory(Paths.document, LOCAL_DIR, userId);
    if (dir.exists) {
      const keep = new Set(docs.map((d) => d.storage_path.split('/').pop()));
      for (const item of dir.list()) if (item instanceof File && !keep.has(item.name)) item.delete();
    }
  } catch {
    // best effort
  }
  return saved;
}

/** Sign-out: delete every document saved on this phone. */
export async function clearLocalDocuments(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { Directory, Paths } = await import('expo-file-system');
    const dir = new Directory(Paths.document, LOCAL_DIR);
    if (dir.exists) dir.delete();
  } catch {
    // ignore
  }
}

/** Best URI to show a photo document: the phone's copy, else a signed URL. */
export async function viewUri(doc: TravelDoc): Promise<string> {
  const local = await localUri(doc);
  if (local) return local;
  return (await signedUrls('documents', [doc.storage_path]))[doc.storage_path];
}

/**
 * Opens a PDF: on a phone the share sheet (with Quick Look preview, Save to
 * Files, Print…) from the saved copy; on the web a new tab.
 */
export async function openPdf(doc: TravelDoc): Promise<void> {
  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    const url = (await signedUrls('documents', [doc.storage_path]))[doc.storage_path];
    if (win) win.location.href = url;
    else window.location.href = url;
    return;
  }
  const uri = await download(doc);
  const Sharing = await import('expo-sharing');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: doc.label });
}

/** Share sheet for a document (AirDrop, Mail, Print…). Native. */
export async function shareDocument(doc: TravelDoc): Promise<void> {
  const uri = await download(doc);
  const Sharing = await import('expo-sharing');
  await Sharing.shareAsync(uri, { mimeType: doc.mime, dialogTitle: doc.label });
}

export function formatSize(bytes: number | null | undefined): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
