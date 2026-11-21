import { isComplete } from './scoring';
import { Player, Scores, Table, TiebreakStrategy, TournamentSettings } from './types';

/**
 * Finishing placement (1 = first) for every seat of a completed table, in table order.
 * Placement is by raw final points. Tied players are separated the same way uma is:
 * by seat wind under Wind Order, or given the average of the shared places under Split
 * (e.g. two players tied for first both get 1.5). Returns [] if the table isn't complete.
 */
export function tablePlacements(table: Table, settings: TournamentSettings): number[] {
  if (!isComplete(table, settings)) return [];
  const points = table.finalPoints;
  const seat = (i: number) => table.playerSeats[i] ?? i;
  const order = points.map((_, i) => i).sort((a, b) => points[b] - points[a] || seat(a) - seat(b));

  const placements: number[] = new Array(points.length).fill(0);
  let place = 1;
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j < order.length && points[order[j]] === points[order[i]]) j++;
    const k = j - i;
    for (let n = i; n < j; n++) {
      placements[order[n]] =
        settings.tiebreakStrategy === TiebreakStrategy.Split ? place + (k - 1) / 2 : place + (n - i);
    }
    place += k;
    i = j;
  }
  return placements;
}

export interface TiebreakStats {
  /** Mean placement over completed games; Infinity if the player has none. Lower is better. */
  averagePlacement: number;
  /** Highest raw final table points from a single game; -Infinity if the player has none. */
  bestGamePoints: number;
}

/** Placement and best-game stats for every player who appears in a completed table. */
export function tiebreakStats(tables: Table[], settings: TournamentSettings): Record<number, TiebreakStats> {
  const acc: Record<number, { placeSum: number; games: number; best: number }> = {};
  for (const table of tables) {
    const placements = tablePlacements(table, settings);
    if (placements.length === 0) continue;
    table.playerIds.forEach((id, i) => {
      const a = (acc[id] ??= { placeSum: 0, games: 0, best: -Infinity });
      a.placeSum += placements[i];
      a.games += 1;
      a.best = Math.max(a.best, table.finalPoints[i]);
    });
  }
  const result: Record<number, TiebreakStats> = {};
  for (const [id, a] of Object.entries(acc)) {
    result[+id] = { averagePlacement: a.placeSum / a.games, bestGamePoints: a.best };
  }
  return result;
}

const NO_STATS: TiebreakStats = { averagePlacement: Infinity, bestGamePoints: -Infinity };

// Scores and averages come from float arithmetic, so treat near-equal values as equal.
const EPSILON = 1e-9;
const differ = (a: number, b: number) =>
  a === b ? false : !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > EPSILON;

export interface Standing {
  /** Displayed rank: the same as position, so score ties are shown already broken (1, 2, 3, ...). */
  rank: number;
  /**
   * Position in the standings order (1-based, unique): by total score, then best average
   * placement, then highest raw table points in a single game, then Player ID.
   */
  position: number;
}

type Row = { id: number; key: number[] };

/** Compares the first `upTo` keys, higher first; 0 if they are equal (within EPSILON). */
function compareKeys(a: number[], b: number[], upTo = a.length) {
  for (let i = 0; i < upTo; i++) if (differ(a[i], b[i])) return b[i] - a[i];
  return 0;
}

/** Players in standings order: score, then best average placement, then best game, then Player ID. */
function sortedRows(players: Player[], scores: Scores, tables: Table[], settings: TournamentSettings): Row[] {
  const stats = tiebreakStats(tables, settings);
  const rows = players.map((p) => {
    const s = stats[p.id] ?? NO_STATS;
    // Each key is "higher is better".
    return { id: p.id, key: [scores[p.id] ?? 0, -s.averagePlacement, s.bestGamePoints] };
  });
  return rows.sort((a, b) => compareKeys(a.key, b.key) || a.id - b.id);
}

export function computeStandings(
  players: Player[],
  scores: Scores,
  tables: Table[],
  settings: TournamentSettings,
): Record<number, Standing> {
  const rows = sortedRows(players, scores, tables, settings);
  const result: Record<number, Standing> = {};
  rows.forEach((r, i) => {
    result[r.id] = { rank: i + 1, position: i + 1 };
  });
  return result;
}

/**
 * The players who make a cut of `count`, using the same tiebreaks as the standings.
 * Players still tied on every tiebreak across the cut line are left out, so the cut
 * reports the tie instead of choosing between them by Player ID.
 */
export function cutQualifiers(
  players: Player[],
  scores: Scores,
  tables: Table[],
  settings: TournamentSettings,
  count: number,
): number[] {
  const rows = sortedRows(players, scores, tables, settings);
  if (rows.length <= count) return rows.map((r) => r.id);
  let end = count;
  const line = rows[count].key;
  while (end > 0 && compareKeys(rows[end - 1].key, line) === 0) end--;
  return rows.slice(0, end).map((r) => r.id);
}
