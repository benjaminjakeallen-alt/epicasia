import { supabase } from './supabase';

// Photo and video plumbing shared by the group chat, the gallery and the
// rest: reading picked files, thumbnails and video posters (made in the
// browser), "taken at" from EXIF, signed URLs for the private buckets, and
// download / share (the app is a PWA — share uses the Web Share API, which
// on iPhone is the share sheet with "Save Image").

export type PhotoBucket = 'chat' | 'gallery' | 'journal' | 'avatars' | 'documents' | 'games';
export type PickedPhoto = {
  uri: string;
  width: number;
  height: number;
  mimeType?: string | null;
  /** The picked file itself (web picker), for EXIF. */
  file?: File | null;
  /** Set for a video: its length; `uri` is the video. */
  durationMs?: number | null;
};

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // the storage buckets' limit

const THUMB_WIDTH = 480; // ~3× a 160pt grid cell

export async function readBytes(uri: string): Promise<ArrayBuffer> {
  return (await fetch(uri)).arrayBuffer();
}

export function isVideo(p: Pick<PickedPhoto, 'mimeType' | 'durationMs'>): boolean {
  return !!p.mimeType?.startsWith('video/') || p.durationMs != null;
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

// ---- Video ---------------------------------------------------------------

function videoExt(mime: string): string {
  return mime === 'video/quicktime' ? 'mov' : mime === 'video/webm' ? 'webm' : 'mp4';
}

export function videoMime(m: string | null | undefined): string {
  return m === 'video/quicktime' || m === 'video/webm' ? m : 'video/mp4';
}

/** A still from early in the video (JPEG, ≤ 1280 wide), made in the browser. */
export async function videoPoster(uri: string): Promise<PickedPhoto & { durationMs: number }> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = uri;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Could not read that video'));
  });
  const durationMs = Math.round((Number.isFinite(video.duration) ? video.duration : 0) * 1000);
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    setTimeout(resolve, 1500); // some browsers never fire `seeked` for 0-length clips
  });
  const scale = Math.min(1, 1280 / (video.videoWidth || 1280));
  const width = Math.max(1, Math.round((video.videoWidth || 1280) * scale));
  const height = Math.max(1, Math.round((video.videoHeight || 720) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
  if (!blob) throw new Error('Could not read that video');
  return { uri: URL.createObjectURL(blob), width, height, mimeType: 'image/jpeg', durationMs };
}

/**
 * Uploads a video as `<base>.<mp4|mov|webm>` plus its poster as a photo
 * (`<base>.jpg` + thumbnail), so everything that shows pictures can show it.
 */
export async function uploadVideo(bucket: PhotoBucket, base: string, video: PickedPhoto) {
  const poster = await videoPoster(video.uri);
  const bytes = await readBytes(video.uri);
  if (bytes.byteLength > MAX_VIDEO_BYTES) throw new Error('That video is over 50 MB. Trim it and try again.');
  const type = videoMime(video.mimeType);
  const videoPath = `${base}.${videoExt(type)}`;
  const { error } = await supabase.storage.from(bucket).upload(videoPath, bytes, { contentType: type, upsert: false });
  if (error) throw error;
  try {
    const pics = await uploadPhoto(bucket, base, poster);
    return {
      videoPath,
      durationMs: video.durationMs || poster.durationMs,
      path: pics.path,
      thumbPath: pics.thumbPath,
      width: poster.width,
      height: poster.height,
    };
  } catch (e) {
    await removePhotoFiles(bucket, [videoPath]);
    throw e;
  }
}

export function durationLabel(ms: number | null | undefined): string {
  const s = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---- Taken at (EXIF) ------------------------------------------------------

/** DateTimeOriginal from a JPEG's EXIF ("2027:06:07 14:03:22", camera-local), as a wall-clock ISO string. */
export function exifTakenAt(buf: ArrayBuffer): string | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let o = 2;
  while (o + 4 <= v.byteLength) {
    const marker = v.getUint16(o);
    const len = v.getUint16(o + 2);
    if (marker === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return readTiff(v, o + 10);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    o += 2 + len;
  }
  return null;
}

function readTiff(v: DataView, t: number): string | null {
  if (t + 8 > v.byteLength) return null;
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  const find = (ifd: number, tag: number): number | null => {
    if (ifd + 2 > v.byteLength) return null;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > v.byteLength) return null;
      if (u16(e) === tag) return e;
    }
    return null;
  };
  const ascii = (entry: number) => {
    const count = u32(entry + 4);
    const at = count > 4 ? t + u32(entry + 8) : entry + 8;
    let s = '';
    for (let i = 0; i < count && at + i < v.byteLength; i++) {
      const ch = v.getUint8(at + i);
      if (!ch) break;
      s += String.fromCharCode(ch);
    }
    return s;
  };
  const ifd0 = t + u32(t + 4);
  const exifPtr = find(ifd0, 0x8769);
  let raw: string | null = null;
  if (exifPtr !== null) {
    const exif = t + u32(exifPtr + 8);
    const dto = find(exif, 0x9003) ?? find(exif, 0x9004);
    if (dto !== null) raw = ascii(dto);
  }
  if (!raw) {
    const dt = find(ifd0, 0x0132);
    if (dt !== null) raw = ascii(dt);
  }
  const m = raw?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m || m[1] === '0000') return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

/**
 * When a picked photo was taken: EXIF DateTimeOriginal (camera-local time,
 * read as this device's local time) — else null, and the upload time stands in.
 */
export async function photoTakenAt(p: PickedPhoto): Promise<string | null> {
  try {
    const blob = p.file ?? (await (await fetch(p.uri)).blob());
    const local = exifTakenAt(await blob.slice(0, 256 * 1024).arrayBuffer());
    if (!local) return null;
    const d = new Date(local);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

// ---- Save / share ---------------------------------------------------------

function fileName(path: string) {
  return path.split('/').pop() ?? 'photo.jpg';
}

/** Downloads one file (a signed URL that asks the browser to save it). */
export async function savePhoto(bucket: PhotoBucket, path: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300, { download: fileName(path) });
  if (error) throw error;
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = fileName(path);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Shares photos/videos as files through the share sheet (on iPhone that's
 * where "Save Image"/"Save N Items" lives); browsers that can't share files
 * download them instead.
 */
export async function shareFiles(items: { bucket: PhotoBucket; path: string }[]): Promise<ShareResult> {
  if (!items.length) return 'cancelled';
  const byBucket = new Map<PhotoBucket, string[]>();
  for (const it of items) byBucket.set(it.bucket, [...(byBucket.get(it.bucket) ?? []), it.path]);
  const urls: Record<string, string> = {};
  for (const [bucket, paths] of byBucket) {
    const got = await signedUrls(bucket, paths);
    for (const p of paths) if (got[p]) urls[`${bucket}:${p}`] = got[p];
  }
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function') {
    try {
      const files = await Promise.all(
        items.map(async (it) => {
          const blob = await (await fetch(urls[`${it.bucket}:${it.path}`])).blob();
          return new File([blob], fileName(it.path), { type: blob.type || 'image/jpeg' });
        }),
      );
      if (nav.canShare?.({ files })) {
        await nav.share({ files });
        return 'shared';
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // fall through to downloading
    }
  }
  for (const it of items) await savePhoto(it.bucket, it.path);
  return 'downloaded';
}

/** Share sheet for one photo. */
export async function sharePhoto(bucket: PhotoBucket, path: string): Promise<ShareResult> {
  return shareFiles([{ bucket, path }]);
}
