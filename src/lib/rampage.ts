import AsyncStorage from '@react-native-async-storage/async-storage';
import { cached } from './offline';
import { supabase } from './supabase';

// Godzilla Rampage scores (0014_game_scores.sql). The game itself lives in
// assets/games/rampage.html; it posts one `score` message per finished run.
// Each run is saved as a row; the board shows every player's best run. A
// run finished offline waits in AsyncStorage and goes up on the next save
// or the next visit to the board.

const RAMPAGE = 'godzilla_rampage' as const;
export const HEROES = ['chris', 'shea', 'emily', 'heather'] as const;
export type Hero = (typeof HEROES)[number];

export type Run = { score: number; level: number; round: number; hero: Hero };
export type ScoreRow = Run & { id: string; user_id: string; created_at: string };

const BEST_KEY = 'epicasia.rampage.best';
const PENDING_KEY = 'epicasia.rampage.pending';
const GIRL_POWER_KEY = 'epicasia.rampage.girlPower';

/** Whether this phone has found the secret barrel ("Girl Power" mode). */
export async function girlPowerUnlocked(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(GIRL_POWER_KEY)) === '1';
  } catch {
    return false;
  }
}

/** The game found the secret: Emily and Heather stay playable on this phone. */
export async function unlockGirlPower(): Promise<void> {
  await AsyncStorage.setItem(GIRL_POWER_KEY, '1').catch(() => {});
}

/** This phone's best score (shown as HIGH SCORE in the game). */
export async function localBest(): Promise<number> {
  try {
    return Number(await AsyncStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

async function readPending(): Promise<Run[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Run[]) : [];
  } catch {
    return [];
  }
}

/** A run from the game, checked before it goes anywhere near the database. */
export function parseRun(msg: unknown): Run | null {
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as Record<string, unknown>;
  const n = (v: unknown, lo: number, hi: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  const score = n(m.score, 1, 9_999_999);
  const level = n(m.level, 1, 5);
  const round = n(m.round, 1, 999);
  const hero = HEROES.find((h) => h === m.hero) ?? null;
  return score && level && round && hero ? { score, level, round, hero } : null;
}

/** Keeps the phone's best and saves the run (queued if offline). */
export async function saveRun(userId: string, run: Run): Promise<void> {
  if (run.score > (await localBest())) await AsyncStorage.setItem(BEST_KEY, String(run.score)).catch(() => {});
  const queue = [...(await readPending()), run];
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(queue)).catch(() => {});
  await flushRuns(userId);
}

/** Sends any runs that couldn't be saved earlier. */
export async function flushRuns(userId: string): Promise<void> {
  const queue = await readPending();
  if (!queue.length) return;
  const { error } = await supabase
    .from('game_scores')
    .insert(queue.map((r) => ({ game: RAMPAGE, user_id: userId, ...r })));
  if (!error) await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
}

async function fetchScoresLive(): Promise<ScoreRow[]> {
  const { data, error } = await supabase
    .from('game_scores')
    .select('id, user_id, score, level, round, hero, created_at')
    .eq('game', RAMPAGE)
    .order('score', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as ScoreRow[];
}

/** Every saved run, best first. Cached for offline use. */
export function fetchScores(): Promise<ScoreRow[]> {
  return cached('game.rampage.scores', fetchScoresLive);
}

export type HighScore = ScoreRow & { rank: number; runs: number };

/** Each player's best run, best first; ties share a rank, earlier run first. */
export function highScores(rows: ScoreRow[]): HighScore[] {
  const best = new Map<string, ScoreRow>();
  const runs = new Map<string, number>();
  for (const r of rows) {
    runs.set(r.user_id, (runs.get(r.user_id) ?? 0) + 1);
    const cur = best.get(r.user_id);
    if (!cur || r.score > cur.score || (r.score === cur.score && r.created_at < cur.created_at)) best.set(r.user_id, r);
  }
  const sorted = [...best.values()].sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at));
  let rank = 0;
  return sorted.map((r, i) => {
    if (i === 0 || r.score !== sorted[i - 1].score) rank = i + 1;
    return { ...r, rank, runs: runs.get(r.user_id) ?? 0 };
  });
}
