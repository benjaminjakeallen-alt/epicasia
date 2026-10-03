import type { Href } from 'expo-router';
import { newId } from './chat';
import { cached } from './offline';
import { removePhotoFiles, uploadPhoto, type PickedPhoto } from './photos';
import { supabase } from './supabase';
import type { CityKey } from './weather';

// Games (0013_games.sql). Every game shares one scoring model: players post
// entries, other players upvote them, and a player's points in a game are
// the upvotes their entries received. A combined leaderboard across games
// is the same sum over every game's entries.

export type GameKey = 'lost_in_translation';

export const GAMES: { key: GameKey; title: string; line: string; icon: string; href: Href }[] = [
  {
    key: 'lost_in_translation',
    title: 'Lost in Translation',
    line: 'Snap the wonkiest English on the trip. Most upvotes wins.',
    icon: 'language-outline',
    href: '/(app)/games/lost-in-translation',
  },
];

export type Entry = {
  id: string;
  game: GameKey;
  created_by: string;
  storage_path: string;
  thumb_path: string | null;
  width: number | null;
  height: number | null;
  caption: string | null;
  city: CityKey | null;
  created_at: string;
};

export type Vote = { entry_id: string; user_id: string };

async function fetchEntriesLive(game: GameKey): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('game_entries')
    .select('id, game, created_by, storage_path, thumb_path, width, height, caption, city, created_at')
    .eq('game', game)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Entry[];
}

async function fetchVotesLive(): Promise<Vote[]> {
  const { data, error } = await supabase.from('game_votes').select('entry_id, user_id');
  if (error) throw error;
  return data ?? [];
}

/** A game's entries, newest first. Cached for offline use. */
export function fetchEntries(game: GameKey): Promise<Entry[]> {
  return cached(`game.${game}.entries`, () => fetchEntriesLive(game));
}

/** Every vote (small: one trip's worth). Cached for offline use. */
export function fetchVotes(): Promise<Vote[]> {
  return cached('game.votes', () => fetchVotesLive());
}

/** Uploads the photo to the private `games` bucket, then saves the entry. */
export async function addEntry(
  userId: string,
  game: GameKey,
  photo: PickedPhoto,
  caption: string,
  city: CityKey | null,
): Promise<Entry> {
  const id = newId();
  const { path, thumbPath } = await uploadPhoto('games', `${userId}/${id}`, photo);
  const clean = caption.trim().replace(/\s+/g, ' ').slice(0, 200);
  const { data, error } = await supabase
    .from('game_entries')
    .insert({
      id,
      game,
      created_by: userId,
      storage_path: path,
      thumb_path: thumbPath,
      width: Math.round(photo.width) || null,
      height: Math.round(photo.height) || null,
      caption: clean || null,
      city,
    })
    .select('id, game, created_by, storage_path, thumb_path, width, height, caption, city, created_at')
    .single();
  if (error) {
    await removePhotoFiles('games', [path, thumbPath]).catch(() => {});
    throw error;
  }
  return data as Entry;
}

/** Removes an entry (its votes go with it) and its photo files. */
export async function deleteEntry(entry: Entry): Promise<void> {
  const { error } = await supabase.from('game_entries').delete().eq('id', entry.id);
  if (error) throw error;
  await removePhotoFiles('games', [entry.storage_path, entry.thumb_path]).catch(() => {});
}

export async function setVote(entryId: string, userId: string, on: boolean): Promise<void> {
  const { error } = on
    ? await supabase.from('game_votes').insert({ entry_id: entryId, user_id: userId })
    : await supabase.from('game_votes').delete().eq('entry_id', entryId).eq('user_id', userId);
  if (error) throw error;
}

// ---- Scoring ----------------------------------------------------------------

export function voteCounts(votes: Vote[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of votes) m.set(v.entry_id, (m.get(v.entry_id) ?? 0) + 1);
  return m;
}

/** The local calendar day an entry was posted, "YYYY-MM-DD". */
export function entryDay(e: Pick<Entry, 'created_at'>): string {
  const d = new Date(e.created_at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Each day's winner: the entry posted that day with the most upvotes (at
 * least one); a tie goes to whoever posted first. Day → entry id.
 */
export function dailyWinners(entries: Entry[], counts: Map<string, number>): Map<string, string> {
  const best = new Map<string, Entry>();
  for (const e of entries) {
    const n = counts.get(e.id) ?? 0;
    if (n < 1) continue;
    const day = entryDay(e);
    const cur = best.get(day);
    const curN = cur ? (counts.get(cur.id) ?? 0) : -1;
    if (!cur || n > curN || (n === curN && e.created_at < cur.created_at)) best.set(day, e);
  }
  return new Map([...best].map(([day, e]) => [day, e.id]));
}

export type Standing = { userId: string; points: number; finds: number; dayWins: number };

/** Points = upvotes received. Ties share a rank (1, 2, 2, 4). */
export function leaderboard(entries: Entry[], counts: Map<string, number>): (Standing & { rank: number })[] {
  const winners = new Set(dailyWinners(entries, counts).values());
  const by = new Map<string, Standing>();
  for (const e of entries) {
    const s = by.get(e.created_by) ?? { userId: e.created_by, points: 0, finds: 0, dayWins: 0 };
    s.points += counts.get(e.id) ?? 0;
    s.finds += 1;
    if (winners.has(e.id)) s.dayWins += 1;
    by.set(e.created_by, s);
  }
  const sorted = [...by.values()].sort((a, b) => b.points - a.points || b.dayWins - a.dayWins || b.finds - a.finds);
  let rank = 0;
  return sorted.map((s, i) => {
    if (i === 0 || s.points !== sorted[i - 1].points) rank = i + 1;
    return { ...s, rank };
  });
}
