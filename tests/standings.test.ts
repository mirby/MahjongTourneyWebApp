import { describe, expect, it } from 'vitest';
import { computeStandings, tablePlacements, tiebreakStats } from '../src/core/standings';
import { scoreTable } from '../src/core/scoring';
import { defaultSettings, GameType, newTable, Player, Scores, Table, TiebreakStrategy } from '../src/core/types';

const settings = { ...defaultSettings(), wrcTiebreaks: true };

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
  it('counts 1st and last places and keeps the best raw table points', () => {
    const stats = tiebreakStats(
      [table([1, 2, 3, 4], [40000, 30000, 20000, 10000]), table([1, 2, 3, 4], [30000, 40000, 20000, 10000])],
      settings,
    );
    expect(stats[1]).toEqual({ firsts: 1, lasts: 0, bestGamePoints: 40000 });
    expect(stats[2]).toEqual({ firsts: 1, lasts: 0, bestGamePoints: 40000 });
    expect(stats[4]).toEqual({ firsts: 0, lasts: 2, bestGamePoints: 10000 });
  });

  it('counts last place at a three-player table as 3rd', () => {
    const sanma = newTable({ playerIds: [1, 2, 3], playerSeats: [0, 1, 2], finalPoints: [50000, 35000, 20000], penalties: [0, 0, 0] });
    expect(tiebreakStats([sanma], { ...settings, gameType: GameType.Sanma })[3].lasts).toBe(1);
  });

  it('does not count a shared 1st or last under Split', () => {
    const split = { ...settings, tiebreakStrategy: TiebreakStrategy.Split };
    const stats = tiebreakStats([table([1, 2, 3, 4], [30000, 30000, 20000, 20000])], split);
    expect(stats[1]).toEqual({ firsts: 0, lasts: 0, bestGamePoints: 30000 });
  });
});

/** A finished table with `id` in the given place (1-4); players 5-7 fill the other seats. */
const finish = (id: number, place: number, points = [40000, 30000, 20000, 10000]) => {
  const ids = [5, 6, 7];
  ids.splice(place - 1, 0, id);
  return table(ids, points);
};

describe('computeStandings', () => {
  it('orders score ties by most 1st places, even over a better average placement', () => {
    // Player 1: 1st, 1st, 4th (average 2). Player 2: 1st, 2nd, 2nd (average 1.67).
    const tables = [finish(1, 1), finish(1, 1), finish(1, 4), finish(2, 1), finish(2, 2), finish(2, 2)];
    expect(computeStandings(players(2, 1, 3), { 1: 50, 2: 50, 3: 0 }, tables, settings)).toEqual({
      1: { rank: 1, position: 1 },
      2: { rank: 2, position: 2 },
      3: { rank: 3, position: 3 },
    });
  });

  it('then by fewest last places', () => {
    // One 1st each. Player 1: 3rd, 3rd. Player 2: 2nd, 4th, but with a bigger single game.
    const tables = [finish(1, 1), finish(1, 3), finish(1, 3), finish(2, 1, [50000, 30000, 15000, 5000]), finish(2, 2), finish(2, 4)];
    expect(computeStandings(players(1, 2), { 1: 0, 2: 0 }, tables, settings)).toEqual({
      1: { rank: 1, position: 1 },
      2: { rank: 2, position: 2 },
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
    // Totals are forced equal; player 1 has played no games, player 2 has a 1st (by seat).
    const tables = [table([2, 5, 6, 7], [25000, 25000, 25000, 25000])];
    expect(computeStandings(players(1, 2), { 1: 0, 2: 0 }, tables, settings)).toEqual({
      1: { rank: 2, position: 2 },
      2: { rank: 1, position: 1 },
    });
  });
});

describe('computeStandings without WRC tiebreaks', () => {
  const plain = { ...settings, wrcTiebreaks: false };

  it('ranks by score alone: equal scores share a rank and are listed by Player ID', () => {
    // Player 2 has more 1st places, but that only counts with WRC tiebreaks.
    const tables = [finish(1, 4), finish(2, 1), finish(2, 1)];
    expect(computeStandings(players(3, 2, 1), { 1: 50, 2: 50, 3: 0 }, tables, plain)).toEqual({
      1: { rank: 1, position: 1 },
      2: { rank: 1, position: 2 },
      3: { rank: 3, position: 3 },
    });
  });

  it('is the default for new tournaments and older saves', () => {
    expect(defaultSettings().wrcTiebreaks).toBe(false);
  });
});

