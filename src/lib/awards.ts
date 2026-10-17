import { dailyWinners, entryDay, voteCounts, type Entry, type Vote } from './games';
import type { GameResult } from './leaderboard';

// Trip awards and the daily winners' history, for the trip leaderboard
// (review, Oct 17 2026). Pure functions over the same rows the boards use.

export type Award = {
  key: string;
  title: string;
  icon:
    | 'eye-outline'
    | 'flame-outline'
    | 'thumbs-down-outline'
    | 'heart-outline'
    | 'trophy-outline'
    | 'game-controller-outline';
  /** Everyone tied for it. */
  userIds: string[];
  detail: string;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The keys with the highest count (≥ min), everyone tied. */
function top(counts: Map<string, number>, min = 1): { ids: string[]; n: number } {
  let n = 0;
  for (const v of counts.values()) n = Math.max(n, v);
  if (n < min) return { ids: [], n: 0 };
  return {
    ids: [...counts]
      .filter(([, v]) => v === n)
      .map(([k]) => k)
      .sort(),
    n,
  };
}
function tally<T>(rows: T[], key: (r: T) => string | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function tripAwards(lit: Entry[], konbini: Entry[], votes: Vote[], arcade: GameResult[]): Award[] {
  const out: Award[] = [];
  const counts = voteCounts(votes);
  const spot = top(tally(lit, (e) => e.created_by));
  if (spot.ids.length)
    out.push({
      key: 'spotter',
      title: 'Eagle eye',
      icon: 'eye-outline',
      userIds: spot.ids,
      detail: `most finds · ${spot.n}`,
    });
  const brave = top(tally(konbini, (e) => e.created_by));
  if (brave.ids.length)
    out.push({
      key: 'brave',
      title: 'Bravest snacker',
      icon: 'flame-outline',
      userIds: brave.ids,
      detail: `${plural(brave.n, 'snack')} tried`,
    });
  // the lowest average rating, among people who rated at least two snacks
  const sums = new Map<string, { s: number; n: number }>();
  for (const e of konbini) {
    if (!e.rating) continue;
    const q = sums.get(e.created_by) ?? { s: 0, n: 0 };
    q.s += e.rating;
    q.n += 1;
    sums.set(e.created_by, q);
  }
  const avgs = [...sums].filter(([, q]) => q.n >= 2).map(([id, q]) => [id, q.s / q.n] as const);
  if (avgs.length > 1) {
    const low = Math.min(...avgs.map(([, a]) => a));
    out.push({
      key: 'critic',
      title: 'Toughest critic',
      icon: 'thumbs-down-outline',
      userIds: avgs
        .filter(([, a]) => a === low)
        .map(([id]) => id)
        .sort(),
      detail: `${low.toFixed(1)} stars on average`,
    });
  }
  const generous = top(tally(votes, (v) => v.user_id));
  if (generous.ids.length)
    out.push({
      key: 'generous',
      title: 'Most generous',
      icon: 'heart-outline',
      userIds: generous.ids,
      detail: `${plural(generous.n, 'upvote')} given`,
    });
  const wins = new Map<string, number>();
  for (const list of [lit, konbini]) {
    const byId = new Map(list.map((e) => [e.id, e]));
    for (const id of dailyWinners(list, counts).values()) {
      const who = byId.get(id)?.created_by;
      if (who) wins.set(who, (wins.get(who) ?? 0) + 1);
    }
  }
  const crowd = top(wins);
  if (crowd.ids.length)
    out.push({
      key: 'crowd',
      title: 'Crowd favourite',
      icon: 'trophy-outline',
      userIds: crowd.ids,
      detail: plural(crowd.n, 'daily win'),
    });
  const firsts = new Map<string, number>();
  for (const r of arcade)
    for (const p of r.ranks) if (p.rank === 1) firsts.set(p.userId, (firsts.get(p.userId) ?? 0) + 1);
  const ace = top(firsts);
  if (ace.ids.length)
    out.push({
      key: 'arcade',
      title: 'Arcade ace',
      icon: 'game-controller-outline',
      userIds: ace.ids,
      detail: `top score in ${plural(ace.n, 'game')}`,
    });
  return out;
}

export type DayWin = { day: string; game: string; title: string; userId: string; label: string | null };

/** Each day's winners in the photo games, newest day first. */
export function dailyWinnerHistory(
  games: { game: string; title: string; entries: Entry[] }[],
  votes: Vote[],
): DayWin[] {
  const counts = voteCounts(votes);
  const out: DayWin[] = [];
  for (const g of games) {
    const byId = new Map(g.entries.map((e) => [e.id, e]));
    for (const id of dailyWinners(g.entries, counts).values()) {
      const e = byId.get(id);
      if (e)
        out.push({
          day: entryDay(e),
          game: g.game,
          title: g.title,
          userId: e.created_by,
          label: e.title || e.caption || null,
        });
    }
  }
  return out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.title.localeCompare(b.title)));
}
