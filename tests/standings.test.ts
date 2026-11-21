import { describe, expect, it } from 'vitest';
import { computeStandings, tablePlacements, tiebreakStats } from '../src/core/standings';
import { scoreTable } from '../src/core/scoring';
import { defaultSettings, newTable, Player, Scores, Table, TiebreakStrategy } from '../src/core/types';

const settings = defaultSettings();

const table = (playerIds: number[], points: number[], roundId = 1): Table =>
  newTable({ roundId, playerIds, playerSeats: [0, 1, 2, 3], finalPoints: points, penalties: [0, 0, 0, 0] });

const players = (...ids: number[]): Player[] => ids.map((id) => ({ id, name: `P${id}`, affiliation: '' }));

const totals = (tables: Table[]): Scores => {
  const s: Scores = {};
  for (const t of tables) {
    for (const [id, v] of Object.entries(scoreTable(t, settings))) s[+id] = (s[+id] ?? 0) + v;
  }
  return s;
};

describe('tablePlacements', () => {
  it('places by final points', () => {
    expect(tablePlacements(table([1, 2, 3, 4], [20000, 40000, 25000, 15000]), settings)).toEqual([3, 1, 2, 4]);
  });

  it('separates point ties by seat under Wind Order', () => {
    expect(tablePlacements(table([1, 2, 3, 4], [20000, 30000, 30000, 20000]), settings)).toEqual([3, 1, 2, 4]);
  });

  it('averages shared places under Split', () => {
    const split = { ...settings, tiebreakStrategy: TiebreakStrategy.Split };
    expect(tablePlacements(table([1, 2, 3, 4], [20000, 30000, 30000, 20000]), split)).toEqual([3.5, 1.5, 1.5, 3.5]);
  });

  it('ignores incomplete tables', () => {
    expect(tablePlacements(newTable({ playerIds: [1, 2, 3, 4] }), settings)).toEqual([]);
  });
});

describe('tiebreakStats', () => {
  it('averages placements and keeps the best raw table points', () => {
    const stats = tiebreakStats(
      [table([1, 2, 3, 4], [40000, 30000, 20000, 10000]), table([1, 2, 3, 4], [30000, 40000, 20000, 10000])],
      settings,
    );
    expect(stats[1].averagePlacement).toBe(1.5);
    expect(stats[1].bestGamePoints).toBe(40000);
    expect(stats[4].averagePlacement).toBe(4);
    expect(stats[4].bestGamePoints).toBe(10000);
  });
});

describe('computeStandings', () => {
  it('orders score ties by better average placement and ranks them in that order', () => {
    // Players 1 and 2 have the same total, but 1 has two firsts and 2 has a first and a second.
    const scores: Scores = { 1: 50, 2: 50, 3: 0 };
    const tables = [
      table([1, 3, 5, 6], [30000, 30000, 20000, 20000]), // 1 first (wind order), 3 second
      table([1, 3, 5, 6], [30000, 30000, 20000, 20000]),
      table([2, 3, 5, 6], [30000, 30000, 20000, 20000]),
      table([3, 2, 5, 6], [30000, 30000, 20000, 20000]), // 3 first, 2 second
    ];
    expect(computeStandings(players(2, 1, 3), scores, tables, settings)).toEqual({
      1: { rank: 1, position: 1 },
      2: { rank: 2, position: 2 },
      3: { rank: 3, position: 3 },
    });
  });

  it('then orders by highest raw table points in a single game', () => {
    // Both players: one 1st and one 4th, same total score; player 2 had the bigger single game.
    const tables = [
      table([1, 5, 6, 7], [40000, 30000, 20000, 10000]),
      table([1, 5, 6, 7], [5000, 35000, 30000, 30000]),
      table([2, 5, 6, 7], [50000, 20000, 20000, 10000]),
      table([2, 5, 6, 7], [-5000, 35000, 35000, 35000]),
    ];
    const t = totals(tables);
    expect(t[1]).toBeCloseTo(t[2]);
    expect(computeStandings(players(1, 2), { 1: t[1], 2: t[2] }, tables, settings)).toEqual({
      1: { rank: 2, position: 2 },
      2: { rank: 1, position: 1 },
    });
  });

  it('falls back to Player ID when every tiebreak is equal', () => {
    const tables = [table([1, 2, 3, 4], [30000, 30000, 20000, 20000]), table([2, 1, 3, 4], [30000, 30000, 20000, 20000])];
    const st = computeStandings(players(2, 1, 3, 4), totals(tables), tables, settings);
    expect(st[1]).toEqual({ rank: 1, position: 1 });
    expect(st[2]).toEqual({ rank: 2, position: 2 });
    expect(st[3].rank).toBe(3);
  });

  it('puts players with no games after players with games on equal score', () => {
    // Totals are forced equal; player 1 has played no games, so has no placement average.
    const tables = [table([2, 5, 6, 7], [25000, 25000, 25000, 25000])];
    expect(computeStandings(players(1, 2), { 1: 0, 2: 0 }, tables, settings)).toEqual({
      1: { rank: 2, position: 2 },
      2: { rank: 1, position: 1 },
    });
  });
});
