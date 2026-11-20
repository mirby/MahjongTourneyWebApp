import { beforeEach, describe, expect, it } from 'vitest';
import { generatePairings } from '../src/core/pairing';
import { newTable, newTournament, ScoreModification, tableSize } from '../src/core/types';
import { applySheetScores, buildExportPayload } from '../src/core/sheets';
import { playersCsv, tablesCsv } from '../src/core/csv';
import { deserializeTournament, serializeTournament } from '../src/core/serialize';
import { useStore } from '../src/store/store';

const players = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, affiliation: i % 2 ? 'A, Inc' : 'B' }));

function freshTournament() {
  const t = newTournament();
  t.name = 'Store Test';
  t.registeredPlayers = players;
  useStore.getState().loadTournament(t);
}

function playRound(scoresByTable: number[][]) {
  const s = useStore.getState();
  const { tables } = generatePairings({
    registered: s.tournament.registeredPlayers,
    scores: s.scores,
    existingTables: s.tournament.tables,
    tableSize: tableSize(s.tournament.settings),
    settings: { avoidDuplicates: true, assignSeatWinds: true, assignSubs: true, swissBlocks: 1, timePerRoundMinutes: 75 },
  });
  s.addRound(tables);
  const round = useStore.getState().tournament.nextRound - 1;
  tables.forEach((t, i) => {
    useStore.getState().updateTable({ ...t, roundId: round, finalPoints: scoresByTable[i], penalties: [0, 0, 0, 0] });
  });
}

describe('tournament flow through the store', () => {
  beforeEach(freshTournament);

  it('runs rounds, accumulates scores, and zero-sum holds', () => {
    playRound([[40000, 30000, 20000, 10000], [35000, 30000, 20000, 15000]]);
    playRound([[40000, 30000, 20000, 10000], [35000, 30000, 20000, 15000]]);
    const s = useStore.getState();
    expect(s.tournament.nextRound).toBe(3);
    expect(s.tournament.tables.length).toBe(4);
    const total = Object.values(s.scores).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(0);
    expect(Object.keys(s.scores).length).toBe(8);
  });

  it('records the pairing blocks used for each round and saves them', () => {
    const s = useStore.getState();
    s.addRound([newTable({ tableId: 1, playerIds: [1, 2, 3, 4] })], 1);
    s.addRound([newTable({ tableId: 1, playerIds: [1, 2, 3, 4] })], 4);
    const t = useStore.getState().tournament;
    expect(t.roundPairingBlocks).toEqual({ 1: 1, 2: 4 });
    const roundTrip = deserializeTournament(JSON.parse(JSON.stringify(serializeTournament(t))));
    expect(roundTrip.roundPairingBlocks).toEqual({ 1: 1, 2: 4 });
    // Older saves have no record of it.
    const { round_pairing_blocks: _, ...old } = serializeTournament(t);
    expect(deserializeTournament(old).roundPairingBlocks).toEqual({});
  });

  it('cuts to the top players and deactivates the rest', () => {
    playRound([[45000, 25000, 20000, 10000], [40000, 30000, 20000, 10000]]);
    const tieProblem = useStore.getState().createCut({
      playerCount: 2, scoreModification: ScoreModification.Halved, startRound: 1, endRound: 1, tiebreakPriority: [],
    });
    const s = useStore.getState();
    expect(tieProblem).toBe(false);
    expect(s.tournament.registeredPlayers.length).toBe(2);
    expect(s.tournament.inactivePlayers.length).toBe(6);
    expect(s.tournament.cuts[0].tiebreakPriority.length).toBe(2);

    s.deleteCut(0);
    expect(useStore.getState().tournament.registeredPlayers.length).toBe(8);
  });

  it('activates and deactivates players', () => {
    useStore.getState().deactivatePlayer(3);
    expect(useStore.getState().tournament.registeredPlayers.some((p) => p.id === 3)).toBe(false);
    expect(useStore.getState().tournament.inactivePlayers.map((p) => p.id)).toEqual([3]);
    useStore.getState().activatePlayer(3);
    expect(useStore.getState().tournament.registeredPlayers.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('exports valid csv and sheet payloads, and round-trips a sheet import', () => {
    playRound([[40000, 30000, 20000, 10000], [35000, 30000, 20000, 15000]]);
    const s = useStore.getState();

    const csv = playersCsv(s.tournament);
    expect(csv).toContain('"A, Inc"'); // commas are quoted
    expect(tablesCsv(s.tournament).split('\n')[0]).toBe('Round ID,Table ID,Player ID,Seat Wind,Points,Penalties');

    const payload = buildExportPayload(s.tournament, s.scores, s.playersById);
    expect(payload.roundNumber).toBe(1);
    expect(payload.standings.length).toBe(8);
    expect(payload.tables.length).toBe(2);

    // Pretend the spreadsheet returns new scores for table 1.
    const t1 = s.tournament.tables.find((t) => t.tableId === 1)!;
    const sheetRows = t1.playerIds.map((id, i) => [id, [10000, 20000, 30000, 40000][i], 0]);
    const result = applySheetScores([1, [1, ...sheetRows]], s.tournament);
    expect(result.ok).toBe(true);
    if (result.ok) {
      useStore.getState().replaceTables(result.tables);
      const updated = useStore.getState().tournament.tables.find((t) => t.tableId === 1)!;
      expect(updated.finalPoints).toEqual([10000, 20000, 30000, 40000]);
    }
  });

  it('reports a clear error when the sheet has an unknown player', () => {
    playRound([[40000, 30000, 20000, 10000], [35000, 30000, 20000, 15000]]);
    const result = applySheetScores([1, [1, [999, 25000, 0]]], useStore.getState().tournament);
    expect(result.ok).toBe(false);
  });

  it('keeps manual hanchan (round 0) separate from numbered rounds', () => {
    useStore.getState().addSingleTable(newTable({ roundId: 0, tableId: 1, playerIds: [1, 2, 3, 4], playerSeats: [0, 1, 2, 3] }));
    expect(useStore.getState().tournament.nextRound).toBe(1);
    useStore.getState().updateTable(
      newTable({ roundId: 0, tableId: 1, playerIds: [1, 2, 3, 4], playerSeats: [0, 1, 2, 3], finalPoints: [40000, 30000, 20000, 10000], penalties: [0, 0, 0, 0] }),
    );
    expect(useStore.getState().scores[1]).toBeCloseTo(60);
  });

  it('timer start and clear', () => {
    useStore.getState().startRound(60);
    expect(useStore.getState().roundEndsAt).not.toBeNull();
    useStore.getState().clearRoundTimer();
    expect(useStore.getState().roundEndsAt).toBeNull();
  });
});
