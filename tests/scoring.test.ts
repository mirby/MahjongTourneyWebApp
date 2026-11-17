import { describe, expect, it } from 'vitest';
import { scoreTableArr } from '../src/core/scoring';
import { calculateScores } from '../src/core/tournament';
import { deserializeTournament, serializeTournament } from '../src/core/serialize';
import {
  Cut,
  defaultSettings,
  newTable,
  newTournament,
  RiichiSticksStrategy,
  ScoreModification,
  TiebreakStrategy,
  UmaType,
} from '../src/core/types';

const settings = defaultSettings(); // 25k start, 30k return, uma 30/10/-10/-30, oka 20 to first

const table = (points: number[], extra: Partial<ReturnType<typeof newTable>> = {}) =>
  newTable({
    playerIds: [1, 2, 3, 4],
    playerSeats: [0, 1, 2, 3],
    finalPoints: points,
    penalties: [0, 0, 0, 0],
    ...extra,
  });

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe('scoreTableArr', () => {
  it('applies return, uma and oka for an untied game', () => {
    const s = scoreTableArr(table([40000, 30000, 20000, 10000]), settings);
    expect(s).toEqual([60, 10, -20, -50]);
    expect(sum(s)).toBeCloseTo(0);
  });

  it('returns nothing for an unscored table', () => {
    expect(scoreTableArr(newTable({ playerIds: [1, 2, 3, 4] }), settings)).toEqual([]);
  });

  it('breaks ties by seat wind', () => {
    // Players 1 and 2 tie for first, 3 and 4 tie for third. Seat order decides who gets the better uma.
    const t = table([30000, 30000, 20000, 20000]);
    expect(scoreTableArr(t, settings)).toEqual([50, 10, -20, -40]);
    // Same scores but seats reversed: player 2 now sits East so takes first-place uma.
    const swapped = table([30000, 30000, 20000, 20000], { playerSeats: [1, 0, 3, 2] });
    expect(scoreTableArr(swapped, settings)).toEqual([10, 50, -40, -20]);
  });

  it('splits uma and oka between tied players with the split strategy', () => {
    const s = { ...settings, tiebreakStrategy: TiebreakStrategy.Split };
    const out = scoreTableArr(table([30000, 30000, 20000, 20000]), s);
    expect(out).toEqual([30, 30, -30, -30]);
  });

  it('distributes the leftover tenths on a three-way split tie', () => {
    const s = { ...settings, tiebreakStrategy: TiebreakStrategy.Split };
    // Three players tie for first on 30000, last place has 10000.
    const out = scoreTableArr(table([30000, 30000, 30000, 10000]), s);
    expect(sum(out)).toBeCloseTo(0);
    // Pooled first-three uma+oka = 30+10-10+20 = 50 -> 16.6 each, 0.2 extra to the East seat.
    expect(out[0]).toBeCloseTo(16.8);
    expect(out[1]).toBeCloseTo(16.6);
    expect(out[2]).toBeCloseTo(16.6);
  });

  it('picks floating uma by the number of players at or above return', () => {
    const s = { ...settings, umaType: UmaType.Floating, oka: [0, 0, 0, 0] };
    // Three players at/above return -> floatingUma2 [15, 5, 0, -20]
    const out = scoreTableArr(table([45000, 31000, 30000, -6000]), s);
    expect(out[0]).toBeCloseTo(15 + 15);
    expect(out[3]).toBeCloseTo(-36 - 20);
  });

  it('applies penalties after the per-thousand multiplier', () => {
    const s = { ...settings, scorePerThousandPoints: 0.5 };
    const out = scoreTableArr(table([40000, 30000, 20000, 10000], { penalties: [0, 0, 0, 5] }), s);
    expect(out[0]).toBeCloseTo(30);
    expect(out[3]).toBeCloseTo(-25 - 5);
  });

  it('adds shuugi relative to the ending shuugi', () => {
    const s = { ...settings, shuugi: true, endShuugi: 10, scorePerShuugi: 2 };
    const out = scoreTableArr(table([40000, 30000, 20000, 10000], { finalShuugi: [14, 10, 10, 6] }), s);
    expect(out[0]).toBe(60 + 8);
    expect(out[3]).toBe(-50 - 8);
  });

  it('gives leftover riichi sticks to first place in thousands, not raw points', () => {
    const s = { ...settings, riichiSticksStrategy: RiichiSticksStrategy.First };
    const out = scoreTableArr(table([39000, 30000, 20000, 10000], { leftOverKyotaku: 1000 }), s);
    expect(out[0]).toBeCloseTo(60 - 1 + 1);
  });

  it('scores a three-player (sanma) table', () => {
    const s = {
      ...settings,
      gameType: 1,
      startPoints: 35000,
      returnPoints: 40000,
      fixedUma: [30, 0, -30],
      oka: [15, 0, 0],
    };
    const t = newTable({
      playerIds: [1, 2, 3],
      playerSeats: [0, 1, 2],
      finalPoints: [60000, 30000, 15000],
      penalties: [0, 0, 0],
    });
    const out = scoreTableArr(t, s);
    expect(out).toEqual([20 + 30 + 15, -10, -25 - 30]);
    expect(sum(out)).toBeCloseTo(0);
  });
});

describe('calculateScores with cuts', () => {
  const players = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, affiliation: '' }));

  const build = () => {
    const t = newTournament();
    t.registeredPlayers = players;
    // Round 1: P1-P4 at one table. P5/P6 are not seated (and score nothing).
    t.tables = [table([40000, 30000, 20000, 10000], { roundId: 1, tableId: 1 })];
    t.nextRound = 2;
    return t;
  };

  it('adds up scores across tables', () => {
    const t = build();
    t.tables.push(table([10000, 20000, 30000, 40000], { roundId: 2, tableId: 1 }));
    const { scores } = calculateScores(t);
    expect(scores[1]).toBeCloseTo(60 - 50);
    expect(scores[4]).toBeCloseTo(-50 + 60);
  });

  it('moves players below the cut to inactive and halves scores', () => {
    const t = build();
    const cut: Cut = { playerCount: 2, scoreModification: ScoreModification.Halved, startRound: 1, endRound: 1, tiebreakPriority: [] };
    t.cuts = [cut];
    const r = calculateScores(t);
    expect(r.registeredPlayers.map((p) => p.id).sort()).toEqual([1, 2]);
    expect(r.inactivePlayers.length).toBe(4);
    expect(r.scores[1]).toBeCloseTo(30);
  });

  it('zeroes scores for a Zero cut', () => {
    const t = build();
    t.cuts = [{ playerCount: 2, scoreModification: ScoreModification.Zero, startRound: 1, endRound: 1, tiebreakPriority: [] }];
    expect(calculateScores(t).scores[1]).toBe(0);
  });
});

describe('serialization', () => {
  it('round-trips a tournament through JSON', () => {
    const t = newTournament();
    t.name = 'Test Open';
    t.registeredPlayers = [{ id: 1, name: 'A', affiliation: 'X' }];
    t.tables = [table([40000, 30000, 20000, 10000], { roundId: 1, tableId: 1 })];
    t.cuts = [{ playerCount: 8, scoreModification: ScoreModification.Halved, startRound: 1, endRound: 2, tiebreakPriority: [1] }];
    const back = deserializeTournament(JSON.parse(JSON.stringify(serializeTournament(t))));
    expect(back).toEqual(t);
  });

  it('rejects garbage', () => {
    expect(() => deserializeTournament({ nope: true })).toThrow();
  });
});
