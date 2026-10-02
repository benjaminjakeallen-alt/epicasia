import { newId } from './chat';
import { readBytes, removePhotoFiles, type PickedPhoto } from './photos';
import { cached } from './offline';
import { supabase } from './supabase';

// Your profile: display name and photo (0008_avatars.sql). The photo is a
// 512px square JPEG in the private `avatars` bucket at "<uid>/<id>.jpg";
// profiles.avatar_url holds that path. Each new photo gets a new name so
// cached copies of the old one never linger.

export type Profile = { id: string; display_name: string; avatar_url: string | null; is_admin: boolean };

const AVATAR_SIZE = 512;

async function fetchProfileLive(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Cached for offline use. */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  return cached('profile', () => fetchProfileLive(userId));
}

/** Updates the name everywhere it's read: the profile row and the auth user (the home greeting). */
export async function updateDisplayName(userId: string, name: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 60) throw new Error('Your name needs 1 to 60 characters.');
  const { error } = await supabase.from('profiles').update({ display_name: clean }).eq('id', userId);
  if (error) throw error;
  const { error: authErr } = await supabase.auth.updateUser({ data: { display_name: clean } });
  if (authErr) throw authErr;
}

/** Center-crops to a square, shrinks to 512px, uploads, and swaps it in. Returns the new path. */
export async function setAvatar(userId: string, photo: PickedPhoto, previous: string | null): Promise<string> {
  let uri = photo.uri;
  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const side = Math.min(photo.width, photo.height);
    const ctx = ImageManipulator.manipulate(photo.uri);
    if (side > 0) {
      ctx.crop({ originX: (photo.width - side) / 2, originY: (photo.height - side) / 2, width: side, height: side });
      if (side > AVATAR_SIZE) ctx.resize({ width: AVATAR_SIZE, height: AVATAR_SIZE });
    }
    uri = (await (await ctx.renderAsync()).saveAsync({ compress: 0.85, format: SaveFormat.JPEG })).uri;
  } catch {
    // Fall back to the original if it can't be processed on this device.
  }
  const path = `${userId}/${newId()}.jpg`;
  const { error } = await supabase.storage.from('avatars').upload(path, await readBytes(uri), {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  const { error: rowErr } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', userId);
  if (rowErr) {
    await removePhotoFiles('avatars', [path]).catch(() => {});
    throw rowErr;
  }
  if (previous) await removePhotoFiles('avatars', [previous]).catch(() => {});
  return path;
}

export async function removeAvatar(userId: string, previous: string | null): Promise<void> {
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
  if (error) throw error;
  if (previous) await removePhotoFiles('avatars', [previous]).catch(() => {});
}
