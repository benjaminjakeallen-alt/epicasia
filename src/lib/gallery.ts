import type { RealtimeChannel } from '@supabase/supabase-js';
import { newId } from './chat';
import { isVideo, photoTakenAt, removePhotoFiles, uploadPhoto, uploadVideo, type PhotoBucket, type PickedPhoto } from './photos';
import { cached } from './offline';
import { stopForDay, type Stop } from './places';
import { supabase } from './supabase';

// Shared trip gallery (0006, 0015). Photos uploaded here live in the private
// `gallery` bucket; photos and videos posted in the group chat are added by
// a database trigger and keep living in the `chat` bucket (`bucket` says
// which). Every photo has an original and, normally, a small thumbnail made
// on the device; a video is its file plus a poster photo (`storage_path`).
// Photos sort by `taken_at` — EXIF "date taken" when the photo has one,
// else when it was added. Albums: one per trip city, worked out from
// `taken_at`, plus shared albums people make.

export type GalleryPhoto = {
  id: string;
  user_id: string;
  bucket: PhotoBucket;
  storage_path: string;
  thumb_path: string | null;
  width: number | null;
  height: number | null;
  caption: string | null;
  message_id: string | null;
  video_path: string | null;
  video_duration_ms: number | null;
  taken_at: string;
  created_at: string;
};

export type Album = { id: string; name: string; created_by: string | null; created_at: string; photoIds: string[] };

export type Favorite = { photo_id: string; user_id: string };

export const GALLERY_PAGE = 150;

async function fetchPhotosLive(before?: string): Promise<GalleryPhoto[]> {
  let q = supabase.from('gallery_photos').select('*').order('taken_at', { ascending: false }).limit(GALLERY_PAGE);
  if (before) q = q.lt('taken_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as GalleryPhoto[];
}

/** Newest taken first. Cached for offline use (first page only); page back with the oldest `taken_at`. */
export async function fetchPhotos(before?: string): Promise<GalleryPhoto[]> {
  return before ? fetchPhotosLive(before) : cached('photos', () => fetchPhotosLive());
}

async function fetchFavoritesLive(): Promise<Favorite[]> {
  const { data, error } = await supabase.from('photo_favorites').select('photo_id, user_id');
  if (error) throw error;
  return data ?? [];
}

/** Cached for offline use. */
export async function fetchFavorites(): Promise<Favorite[]> {
  return cached('favorites', () => fetchFavoritesLive());
}

/** When a photo was taken (when it was added, for rows from before 0015). */
export function takenAt(p: GalleryPhoto): string {
  return p.taken_at ?? p.created_at;
}

/** Newest taken first (ties: newest added). */
export function byTaken(a: GalleryPhoto, b: GalleryPhoto): number {
  return takenAt(b).localeCompare(takenAt(a)) || b.created_at.localeCompare(a.created_at);
}

/** Uploads one photo (original + thumbnail) or video (+ poster) and adds it to the gallery. */
export async function addPhoto(userId: string, photo: PickedPhoto, caption?: string): Promise<GalleryPhoto> {
  const id = newId();
  const base = `${userId}/${id}`;
  const video = isVideo(photo) ? await uploadVideo('gallery', base, photo) : null;
  const pics = video ?? (await uploadPhoto('gallery', base, photo));
  const takenAt = video ? null : await photoTakenAt(photo);
  const row = {
    id,
    user_id: userId,
    bucket: 'gallery' as const,
    storage_path: pics.path,
    thumb_path: pics.thumbPath,
    width: Math.round(video?.width ?? photo.width) || null,
    height: Math.round(video?.height ?? photo.height) || null,
    caption: caption?.trim() || null,
    video_path: video?.videoPath ?? null,
    video_duration_ms: video?.durationMs ?? null,
    ...(takenAt ? { taken_at: takenAt } : {}),
  };
  const { data, error } = await supabase.from('gallery_photos').insert(row).select().single();
  if (error) {
    await removePhotoFiles('gallery', [pics.path, pics.thumbPath, video?.videoPath]);
    throw error;
  }
  return data as GalleryPhoto;
}

/** The trip city a photo was taken in (by its local day), if any. */
export function cityOf(p: GalleryPhoto): Stop | null {
  const d = new Date(takenAt(p));
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return stopForDay(day);
}

// ---- Albums ---------------------------------------------------------------

async function fetchAlbumsLive(): Promise<Album[]> {
  const [{ data: albums, error }, { data: links, error: linkErr }] = await Promise.all([
    supabase.from('photo_albums').select('id, name, created_by, created_at').order('created_at'),
    supabase.from('album_photos').select('album_id, photo_id'),
  ]);
  if (error) throw error;
  if (linkErr) throw linkErr;
  return (albums ?? []).map((a) => ({
    ...a,
    photoIds: (links ?? []).filter((l) => l.album_id === a.id).map((l) => l.photo_id as string),
  }));
}

/** Shared albums with their photo ids. Cached for offline use. */
export async function fetchAlbums(): Promise<Album[]> {
  return cached('albums', () => fetchAlbumsLive());
}

export async function createAlbum(name: string, userId: string, photoIds: string[]): Promise<Album> {
  const id = newId();
  const clean = name.trim().replace(/\s+/g, ' ');
  const { data, error } = await supabase
    .from('photo_albums')
    .insert({ id, name: clean, created_by: userId })
    .select('id, name, created_by, created_at')
    .single();
  if (error) throw error;
  await addToAlbum(id, userId, photoIds);
  return { ...data, photoIds };
}

export async function addToAlbum(albumId: string, userId: string, photoIds: string[]): Promise<void> {
  if (!photoIds.length) return;
  const { error } = await supabase
    .from('album_photos')
    .upsert(photoIds.map((photo_id) => ({ album_id: albumId, photo_id, added_by: userId })), {
      onConflict: 'album_id,photo_id',
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

export async function removeFromAlbum(albumId: string, photoIds: string[]): Promise<void> {
  const { error } = await supabase.from('album_photos').delete().eq('album_id', albumId).in('photo_id', photoIds);
  if (error) throw error;
}

export async function deleteAlbum(albumId: string): Promise<void> {
  const { error } = await supabase.from('photo_albums').delete().eq('id', albumId);
  if (error) throw error;
}

/**
 * Removes a photo from the gallery. Gallery uploads also delete their files;
 * chat photos only leave the gallery (the chat message keeps its photo —
 * deleting the message in the chat removes both).
 */
export async function deletePhoto(p: GalleryPhoto): Promise<void> {
  const { error } = await supabase.from('gallery_photos').delete().eq('id', p.id);
  if (error) throw error;
  if (p.bucket === 'gallery') await removePhotoFiles('gallery', [p.storage_path, p.thumb_path, p.video_path]);
}

export async function updateCaption(id: string, caption: string): Promise<void> {
  const { error } = await supabase
    .from('gallery_photos')
    .update({ caption: caption.trim() || null })
    .eq('id', id);
  if (error) throw error;
}

export async function setFavorite(photoId: string, userId: string, on: boolean): Promise<void> {
  if (on) {
    const { error } = await supabase.from('photo_favorites').insert({ photo_id: photoId, user_id: userId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase.from('photo_favorites').delete().match({ photo_id: photoId, user_id: userId });
    if (error) throw error;
  }
}

export type GalleryEvents = {
  onUpsert: (p: GalleryPhoto) => void;
  onRemove: (id: string) => void;
  onFavorite: (f: Favorite, on: boolean) => void;
};

export function subscribeGallery(events: GalleryEvents) {
  const ch: RealtimeChannel = supabase
    .channel('gallery-db')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gallery_photos' }, (p) =>
      events.onUpsert(p.new as GalleryPhoto),
    )
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gallery_photos' }, (p) =>
      events.onUpsert(p.new as GalleryPhoto),
    )
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'gallery_photos' }, (p) =>
      events.onRemove((p.old as GalleryPhoto).id),
    )
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photo_favorites' }, (p) =>
      events.onFavorite(p.new as Favorite, true),
    )
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'photo_favorites' }, (p) =>
      events.onFavorite(p.old as Favorite, false),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}
