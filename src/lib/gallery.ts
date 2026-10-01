import type { RealtimeChannel } from '@supabase/supabase-js';
import { newId } from './chat';
import { removePhotoFiles, uploadPhoto, type PhotoBucket, type PickedPhoto } from './photos';
import { supabase } from './supabase';

// Shared trip gallery (0006_shared_gallery.sql). Photos uploaded here live
// in the private `gallery` bucket; photos posted in the group chat are
// added by a database trigger and keep living in the `chat` bucket
// (`bucket` says which). Every photo has an original and, normally, a
// small thumbnail made on the device.

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
  created_at: string;
};

export type Favorite = { photo_id: string; user_id: string };

export const GALLERY_PAGE = 150;

export async function fetchPhotos(before?: string): Promise<GalleryPhoto[]> {
  let q = supabase.from('gallery_photos').select('*').order('created_at', { ascending: false }).limit(GALLERY_PAGE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as GalleryPhoto[];
}

export async function fetchFavorites(): Promise<Favorite[]> {
  const { data, error } = await supabase.from('photo_favorites').select('photo_id, user_id');
  if (error) throw error;
  return data ?? [];
}

/** Uploads one photo (original + thumbnail) and adds it to the gallery. */
export async function addPhoto(userId: string, photo: PickedPhoto, caption?: string): Promise<GalleryPhoto> {
  const id = newId();
  const { path, thumbPath } = await uploadPhoto('gallery', `${userId}/${id}`, photo);
  const row = {
    id,
    user_id: userId,
    bucket: 'gallery' as const,
    storage_path: path,
    thumb_path: thumbPath,
    width: Math.round(photo.width) || null,
    height: Math.round(photo.height) || null,
    caption: caption?.trim() || null,
  };
  const { data, error } = await supabase.from('gallery_photos').insert(row).select().single();
  if (error) {
    await removePhotoFiles('gallery', [path, thumbPath]);
    throw error;
  }
  return data as GalleryPhoto;
}

/**
 * Removes a photo from the gallery. Gallery uploads also delete their files;
 * chat photos only leave the gallery (the chat message keeps its photo —
 * deleting the message in the chat removes both).
 */
export async function deletePhoto(p: GalleryPhoto): Promise<void> {
  const { error } = await supabase.from('gallery_photos').delete().eq('id', p.id);
  if (error) throw error;
  if (p.bucket === 'gallery') await removePhotoFiles('gallery', [p.storage_path, p.thumb_path]);
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
