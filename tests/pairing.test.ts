import { describe, expect, it } from 'vitest';
import { generatePairings, pairingCost, priorPairings, PairingSettings } from '../src/core/pairing';
import { newTable, Player } from '../src/core/types';

// Small seeded RNG so these tests are deterministic.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const players = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, affiliation: '' }));

const base: PairingSettings = {
  avoidDuplicates: true,
  assignSeatWinds: true,
  assignSubs: true,
  swissBlocks: 1,
  timePerRoundMinutes: 75,
};

const seatedIds = (r: ReturnType<typeof generatePairings>) => r.tables.flatMap((t) => t.playerIds);

describe('generatePairings', () => {
  it('seats every player exactly once with seat winds assigned', () => {
    const r = generatePairings({
      registered: players(16), scores: {}, existingTables: [], tableSize: 4, settings: base, rng: mulberry32(1),
    });
    expect(r.tables.length).toBe(4);
    expect(seatedIds(r).sort((a, b) => a - b)).toEqual(players(16).map((p) => p.id));
    expect(r.tables.every((t) => t.playerSeats.join() === '0,1,2,3')).toBe(true);
    expect(r.tables.map((t) => t.tableId)).toEqual([1, 2, 3, 4]);
  });

  it('fills the last table with substitutes (id 0) when assigning subs', () => {
    const r = generatePairings({
      registered: players(18), scores: {}, existingTables: [], tableSize: 4, settings: base, rng: mulberry32(2),
    });
    expect(r.tables.length).toBe(5);
    expect(seatedIds(r).filter((id) => id === 0).length).toBe(2);
    expect(r.byes).toEqual([]);
  });

  it('sits players out when not assigning subs', () => {
    const r = generatePairings({
      registered: players(18), scores: {}, existingTables: [], tableSize: 4,
      settings: { ...base, assignSubs: false }, rng: mulberry32(3),
    });
    expect(r.tables.length).toBe(4);
    expect(r.byes.length).toBe(2);
    expect(new Set([...seatedIds(r), ...r.byes]).size).toBe(18);
  });

  it('supports three-player tables', () => {
    const r = generatePairings({
      registered: players(9), scores: {}, existingTables: [], tableSize: 3, settings: base, rng: mulberry32(4),
    });
    expect(r.tables.length).toBe(3);
    expect(r.tables.every((t) => t.playerIds.length === 3 && t.playerSeats.length === 3)).toBe(true);
  });

  it('omits seats when seat winds are off', () => {
    const r = generatePairings({
      registered: players(8), scores: {}, existingTables: [], tableSize: 4,
      settings: { ...base, assignSeatWinds: false }, rng: mulberry32(5),
    });
    expect(r.tables.every((t) => t.playerSeats.length === 0)).toBe(true);
  });

  it('keeps swiss blocks together: top scorers only meet top scorers', () => {
    const scores: Record<number, number> = {};
    players(16).forEach((p) => (scores[p.id] = p.id)); // P16 best ... P1 worst
    const r = generatePairings({
      registered: players(16), scores, existingTables: [], tableSize: 4,
      settings: { ...base, swissBlocks: 2 }, rng: mulberry32(6),
    });
    const topBlock = new Set([9, 10, 11, 12, 13, 14, 15, 16]);
    for (const t of r.tables) {
      const inTop = t.playerIds.filter((id) => topBlock.has(id)).length;
      expect([0, 4]).toContain(inTop);
    }
  });

  it('avoids repeat opponents when there is room to', () => {
    const rng = mulberry32(7);
    const existing = [
      newTable({ roundId: 1, tableId: 1, playerIds: [1, 2, 3, 4] }),
      newTable({ roundId: 1, tableId: 2, playerIds: [5, 6, 7, 8] }),
      newTable({ roundId: 1, tableId: 3, playerIds: [9, 10, 11, 12] }),
      newTable({ roundId: 1, tableId: 4, playerIds: [13, 14, 15, 16] }),
    ];
    const r = generatePairings({
      registered: players(16), scores: {}, existingTables: existing, tableSize: 4, settings: base, rng,
    });
    expect(r.duplicateCount).toBe(0);
    const prior = priorPairings(existing);
    expect(r.tables.every((t) => pairingCost(t.playerIds, prior) === 0)).toBe(true);
  });
});

describe('pairingCost', () => {
  it('is zero for strangers and positive for repeat opponents', () => {
    const prior = priorPairings([newTable({ playerIds: [1, 2, 3, 4] })]);
    expect(pairingCost([1, 5, 6, 7], prior)).toBe(0);
    expect(pairingCost([1, 2, 6, 7], prior)).toBeGreaterThan(0);
  });
});
