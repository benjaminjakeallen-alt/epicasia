import AsyncStorage from '@react-native-async-storage/async-storage';

// What this phone remembers about the games (per phone, not per account):
// which games have been opened (the hub's NEW badges), how many upvotes your
// entries had the last time you looked at each wall ("3 new upvotes since you
// last looked"), and a Konbini Review you started but didn't post.

const OPENED = 'epicasia.games.opened';
const seenKey = (game: string) => `epicasia.games.${game}.seenUpvotes`;
const DRAFT = 'epicasia.konbini.draft';

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
const write = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});

/** The games this phone has opened. */
export async function openedGames(): Promise<string[]> {
  const v = await read<unknown>(OPENED, []);
  return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
}
export async function markOpened(game: string): Promise<void> {
  const all = await openedGames();
  if (!all.includes(game)) await write(OPENED, [...all, game]);
}

/** Upvotes your entries in a game had when you last looked (null: never looked). */
export async function seenUpvotes(game: string): Promise<number | null> {
  const v = await read<unknown>(seenKey(game), null);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
export const setSeenUpvotes = (game: string, n: number) => write(seenKey(game), n);

export type KonbiniDraft = { snack: string; rating: number; caption: string };
export async function loadKonbiniDraft(): Promise<KonbiniDraft | null> {
  const v = await read<Partial<KonbiniDraft> | null>(DRAFT, null);
  if (!v || typeof v !== 'object') return null;
  const d = {
    snack: String(v.snack ?? '').slice(0, 80),
    rating: Math.min(5, Math.max(0, Number(v.rating) | 0)),
    caption: String(v.caption ?? '').slice(0, 200),
  };
  return d.snack || d.rating || d.caption ? d : null;
}
export const saveKonbiniDraft = (d: KonbiniDraft) => write(DRAFT, d);
export const clearKonbiniDraft = () => AsyncStorage.removeItem(DRAFT).catch(() => {});
