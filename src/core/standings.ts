import { isComplete } from './scoring';
import type { CutLevels } from './tournament';
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
  /** Games finished in 1st place. Higher is better. */
  firsts: number;
  /** Games finished in last place (4th, or 3rd in sanma). Lower is better. */
  lasts: number;
  /** Highest raw final table points from a single game; -Infinity if the player has none. */
  bestGamePoints: number;
}

/**
 * Placement and best-game stats for every player who appears in a completed table.
 * Only outright places count: under the Split tiebreak strategy, players sharing 1st
 * (or last) get an in-between placement (e.g. 1.5), which is neither.
 */
export function tiebreakStats(tables: Table[], settings: TournamentSettings): Record<number, TiebreakStats> {
  const result: Record<number, TiebreakStats> = {};
  for (const table of tables) {
    const placements = tablePlacements(table, settings);
    if (placements.length === 0) continue;
    table.playerIds.forEach((id, i) => {
      const s = (result[id] ??= { firsts: 0, lasts: 0, bestGamePoints: -Infinity });
      if (placements[i] === 1) s.firsts += 1;
      if (placements[i] === placements.length) s.lasts += 1;
      s.bestGamePoints = Math.max(s.bestGamePoints, table.finalPoints[i]);
    });
  }
  return result;
}

const NO_STATS: TiebreakStats = { firsts: 0, lasts: 0, bestGamePoints: -Infinity };

// Scores and averages come from float arithmetic, so treat near-equal values as equal.
const EPSILON = 1e-9;
const differ = (a: number, b: number) =>
  a === b ? false : !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > EPSILON;

export interface Standing {
  /**
   * Displayed rank. With WRC tiebreaks, the same as position (ties are shown already broken:
   * 1, 2, 3, ...). Without, players on equal scores share a rank (1, 1, 3, ...).
   */
  rank: number;
  /**
   * Position in the standings order (1-based, unique): players in a top cut first, then by
   * total score, then (with WRC tiebreaks) most 1st places, fewest last places and highest raw
   * table points in a single game, then Player ID.
   */
  position: number;
}

type Row = { id: number; key: number[] };

/** Compares the first `upTo` keys, higher first; 0 if they are equal (within EPSILON). */
function compareKeys(a: number[], b: number[], upTo = a.length) {
  for (let i = 0; i < upTo; i++) if (differ(a[i], b[i])) return b[i] - a[i];
  return 0;
}

/**
 * Players in standings order: cut level (players in a top cut first), then score, then (with
 * WRC tiebreaks on) most 1st places, fewest last places and best game, then Player ID.
 */
function sortedRows(
  players: Player[],
  scores: Scores,
  tables: Table[],
  settings: TournamentSettings,
  levels: CutLevels,
): Row[] {
  const stats = settings.wrcTiebreaks ? tiebreakStats(tables, settings) : {};
  const rows = players.map((p) => {
    // Each key is "higher is better".
    const key = [levels[p.id] ?? 0, scores[p.id] ?? 0];
    if (settings.wrcTiebreaks) {
      const s = stats[p.id] ?? NO_STATS;
      key.push(s.firsts, -s.lasts, s.bestGamePoints);
    }
    return { id: p.id, key };
  });
  return rows.sort((a, b) => compareKeys(a.key, b.key) || a.id - b.id);
}

export function computeStandings(
  players: Player[],
  scores: Scores,
  tables: Table[],
  settings: TournamentSettings,
  levels: CutLevels = {},
): Record<number, Standing> {
  const rows = sortedRows(players, scores, tables, settings, levels);
  const result: Record<number, Standing> = {};
  rows.forEach((r, i) => {
    // Without WRC tiebreaks nothing separates equal scores, so they share a rank.
    const prev = rows[i - 1];
    const tied = !settings.wrcTiebreaks && prev !== undefined && compareKeys(r.key, prev.key) === 0;
    result[r.id] = { rank: tied ? result[prev.id].rank : i + 1, position: i + 1 };
  });
  return result;
}

/**
 * The players who make a cut of `count`, using the same tiebreaks as the standings.
 * Pass only the players competing for the cut (those in the current top group).
 * Players still tied on every tiebreak across the cut line are left out, so the cut
 * reports the tie instead of choosing between them by Player ID. (Without WRC tiebreaks,
 * that is everyone on the score at the cut line, as in the original desktop app.)
 */
export function cutQualifiers(
  players: Player[],
  scores: Scores,
  tables: Table[],
  settings: TournamentSettings,
  count: number,
): number[] {
  const rows = sortedRows(players, scores, tables, settings, {});
  if (rows.length <= count) return rows.map((r) => r.id);
  let end = count;
  const line = rows[count].key;
  while (end > 0 && compareKeys(rows[end - 1].key, line) === 0) end--;
  return rows.slice(0, end).map((r) => r.id);
}
