import { dailyWinnerHistory, tripAwards, type Award, type DayWin } from './awards';
import { fetchMembers } from './chat';
import { GAMES, fetchEntries, fetchVotes, leaderboard, voteCounts, type Entry, type GameKey, type Vote } from './games';
import { ARCADE, fetchScores, highScores, type ArcadeGame } from './arcade';

// The trip leaderboard: one table across every game. Games score in
// different units (upvotes, arcade points), so each game ranks its own
// players and the placing earns trip points — 1st 10, 2nd 8, 3rd 6, then
// 5, 4, 3, 2, 1, and 1 for anyone further down who played. Ties share a
// placing (and its points). Trip points = the sum over games.

export const PLACE_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

export function placePoints(rank: number): number {
  return PLACE_POINTS[rank - 1] ?? 1;
}

export type GameRank = { userId: string; rank: number; detail: string };
export type GameResult = { game: string; title: string; ranks: GameRank[] };

export type Placing = { game: string; title: string; rank: number; points: number; detail: string };
export type TripStanding = {
  userId: string;
  name: string;
  avatar: string | null;
  total: number;
  wins: number;
  placings: Placing[];
  rank: number;
};

/** Sums placement points over games; ties share a rank, then more 1st places, then name. */
export function combine(
  results: GameResult[],
  people: Map<string, { name: string; avatar: string | null }>,
): TripStanding[] {
  const by = new Map<string, Omit<TripStanding, 'rank'>>();
  for (const r of results) {
    for (const p of r.ranks) {
      const who = people.get(p.userId);
      const s = by.get(p.userId) ?? {
        userId: p.userId,
        name: who?.name ?? 'Someone',
        avatar: who?.avatar ?? null,
        total: 0,
        wins: 0,
        placings: [],
      };
      const points = placePoints(p.rank);
      s.total += points;
      if (p.rank === 1) s.wins += 1;
      s.placings.push({ game: r.game, title: r.title, rank: p.rank, points, detail: p.detail });
      by.set(p.userId, s);
    }
  }
  const sorted = [...by.values()].sort((a, b) => b.total - a.total || b.wins - a.wins || a.name.localeCompare(b.name));
  let rank = 0;
  return sorted.map((s, i) => {
    if (i === 0 || s.total !== sorted[i - 1].total) rank = i + 1;
    return { ...s, placings: [...s.placings].sort((a, b) => a.rank - b.rank), rank };
  });
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Every game's ranking, from the same tables each game's own board uses (and the rows behind them). */
async function loadResults(): Promise<{ results: GameResult[]; entries: Map<GameKey, Entry[]>; votes: Vote[] }> {
  const isArcade = (k: string): k is ArcadeGame => k in ARCADE;
  const voteGames = GAMES.filter((g) => !isArcade(g.key)).map((g) => g.key as GameKey);
  const arcadeGames = GAMES.map((g) => g.key).filter(isArcade);
  const [votes, scoreLists, entryLists] = await Promise.all([
    fetchVotes(),
    Promise.all(arcadeGames.map((g) => fetchScores(g))),
    Promise.all(voteGames.map((g) => fetchEntries(g))),
  ]);
  const counts = voteCounts(votes);
  const title = (key: string) => GAMES.find((g) => g.key === key)?.title ?? key;
  const results: GameResult[] = voteGames.map((game, i) => ({
    game,
    title: title(game),
    ranks: leaderboard(entryLists[i], counts).map((s) => ({
      userId: s.userId,
      rank: s.rank,
      detail: plural(s.points, 'upvote'),
    })),
  }));
  arcadeGames.forEach((game, i) =>
    results.push({
      game,
      title: title(game),
      ranks: highScores(scoreLists[i]).map((h) => ({
        userId: h.user_id,
        rank: h.rank,
        detail: `best ${h.score.toLocaleString('en-US')}`,
      })),
    }),
  );
  return { results, entries: new Map(voteGames.map((g, i) => [g, entryLists[i]])), votes };
}

export async function fetchGameResults(): Promise<GameResult[]> {
  return (await loadResults()).results;
}

export async function fetchTripStandings(): Promise<TripStanding[]> {
  return (await fetchTripBoard()).standings;
}

export type TripBoard = {
  standings: TripStanding[];
  awards: Award[];
  days: DayWin[];
  people: Map<string, { name: string; avatar: string | null }>;
};

/** The standings, the trip awards and every day's winners, in one load. */
export async function fetchTripBoard(): Promise<TripBoard> {
  const [{ results, entries, votes }, members] = await Promise.all([loadResults(), fetchMembers()]);
  const lit = entries.get('lost_in_translation') ?? [],
    konbini = entries.get('konbini_review') ?? [];
  const title = (key: string) => GAMES.find((g) => g.key === key)?.title ?? key;
  const people = new Map(members.map((m) => [m.id, { name: m.name, avatar: m.avatar }]));
  return {
    people,
    standings: combine(results, people),
    awards: tripAwards(
      lit,
      konbini,
      votes,
      results.filter((r) => r.game in ARCADE),
    ),
    days: dailyWinnerHistory(
      [...entries].map(([game, list]) => ({ game, title: title(game), entries: list })),
      votes,
    ),
  };
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}
