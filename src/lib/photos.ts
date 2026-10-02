import { Linking, Platform, Share } from 'react-native';
import { supabase } from './supabase';

// Photo plumbing shared by the group chat and the gallery: reading picked
// files, making thumbnails, signed URLs for the private buckets, and
// save-to-Photos / share.

export type PhotoBucket = 'chat' | 'gallery' | 'journal' | 'avatars' | 'documents';
export type PickedPhoto = { uri: string; width: number; height: number; mimeType?: string | null };

const THUMB_WIDTH = 480; // ~3× a 160pt grid cell

export async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  const { File } = await import('expo-file-system');
  return new File(uri).arrayBuffer();
}

export function extFor(mime: string): string {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'jpg';
}

export function imageMime(m: string | null | undefined): string {
  return m && m.startsWith('image/') ? m : 'image/jpeg';
}

/**
 * Small JPEG for grids and chat bubbles, made on the device (Supabase's
 * image transformations are a paid feature). Returns null if it can't be
 * made — callers then fall back to the original.
 */
export async function makeThumb(photo: PickedPhoto): Promise<{ uri: string; width: number; height: number } | null> {
  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const ctx = ImageManipulator.manipulate(photo.uri);
    if (photo.width > THUMB_WIDTH) ctx.resize({ width: THUMB_WIDTH });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
    return { uri: out.uri, width: out.width, height: out.height };
  } catch {
    return null;
  }
}

/** Uploads an original + its thumbnail under `<base>.<ext>` / `<base>.thumb.jpg`. */
export async function uploadPhoto(bucket: PhotoBucket, base: string, photo: PickedPhoto) {
  const type = imageMime(photo.mimeType);
  const path = `${base}.${extFor(type)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, await readBytes(photo.uri), {
    contentType: type,
    upsert: false,
  });
  if (error) throw error;

  let thumbPath: string | null = null;
  const thumb = await makeThumb(photo);
  if (thumb) {
    thumbPath = `${base}.thumb.jpg`;
    const { error: tErr } = await supabase.storage.from(bucket).upload(thumbPath, await readBytes(thumb.uri), {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (tErr) thumbPath = null; // the original still works on its own
  }
  return { path, thumbPath };
}

export async function removePhotoFiles(bucket: PhotoBucket, paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (list.length) await supabase.storage.from(bucket).remove(list);
}

// ---- Signed URLs ----------------------------------------------------------

const SIGNED_TTL = 60 * 60; // seconds
const cache = new Map<string, { url: string; expires: number }>();
const key = (bucket: PhotoBucket, path: string) => `${bucket}:${path}`;

// The URL map is also kept on the phone. Offline, signing fails; handing
// back the last URL (even an expired one) still lets expo-image show the
// photo from its disk cache, which is keyed by `bucket:path`, not by URL.
const STORED = 'epicasia.cache.signedUrls'; // cleared with the other offline copies on sign-out
const MAX_STORED = 3000;
let hydrated: Promise<void> | null = null;
function hydrate() {
  hydrated ??= (async () => {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const raw = await AsyncStorage.getItem(STORED);
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) if (!cache.has(k)) cache.set(k, v as { url: string; expires: number });
    } catch {
      // nothing saved
    }
  })();
  return hydrated;
}
async function persist() {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const entries = [...cache.entries()].slice(-MAX_STORED);
    await AsyncStorage.setItem(STORED, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // best effort
  }
}

/** Signed URLs for private photos, cached until shortly before they expire (and kept for offline). */
export async function signedUrls(bucket: PhotoBucket, paths: string[]): Promise<Record<string, string>> {
  await hydrate();
  const now = Date.now();
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of new Set(paths)) {
    const hit = cache.get(key(bucket, p));
    if (hit && hit.expires > now + 60_000) out[p] = hit.url;
    else missing.push(p);
  }
  let signed = false;
  try {
    // createSignedUrls takes up to ~1000 paths; chunk to be safe.
    for (let i = 0; i < missing.length; i += 200) {
      const chunk = missing.slice(i, i + 200);
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(chunk, SIGNED_TTL);
      if (error) throw error;
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) {
          cache.set(key(bucket, item.path), { url: item.signedUrl, expires: now + SIGNED_TTL * 1000 });
          out[item.path] = item.signedUrl;
          signed = true;
        }
      }
    }
  } catch (e) {
    // Offline: fall back to any URL we had for these photos.
    let any = false;
    for (const p of missing) {
      const old = cache.get(key(bucket, p));
      if (old) {
        out[p] = old.url;
        any = true;
      }
    }
    if (!any && Object.keys(out).length === 0) throw e;
  }
  if (signed) persist();
  return out;
}

// ---- Save / share ---------------------------------------------------------

/**
 * Saves a photo to the phone's library (native) or downloads it (web).
 * Returns false if photo access was declined.
 */
export async function savePhoto(bucket: PhotoBucket, path: string): Promise<boolean> {
  const name = path.split('/').pop() ?? 'photo.jpg';
  if (Platform.OS === 'web') {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300, { download: name });
    if (error) throw error;
    await Linking.openURL(data.signedUrl);
    return true;
  }
  const [{ File, Paths }, MediaLibrary] = await Promise.all([import('expo-file-system'), import('expo-media-library')]);
  const { status } = await MediaLibrary.requestPermissionsAsync(true);
  if (status !== 'granted') return false;
  const url = (await signedUrls(bucket, [path]))[path];
  const dest = new File(Paths.cache, `epicasia-${name}`);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(url, dest);
  await MediaLibrary.Asset.create(file.uri);
  return true;
}

/** Share sheet for one photo — AirDrop, Messages, etc. (native). */
export async function sharePhoto(bucket: PhotoBucket, path: string): Promise<void> {
  const url = (await signedUrls(bucket, [path]))[path];
  await Share.share(Platform.OS === 'ios' ? { url } : { message: url });
}
