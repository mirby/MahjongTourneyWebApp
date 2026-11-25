import { beforeEach, describe, expect, it } from 'vitest';
import { generatePairings } from '../src/core/pairing';
import { newTable, newTournament, ScoreModification, tableSize } from '../src/core/types';
import { applySheetScores, buildExportPayload, exportResult, exportStats } from '../src/core/sheets';
import { playersCsv, tablesCsv } from '../src/core/csv';
import { deserializeTournament, serializeTournament } from '../src/core/serialize';
import { computeStandings } from '../src/core/standings';
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

describe('exportResult', () => {
  it('accepts the script success reply', () => {
    expect(exportResult('Success!\n')).toBe('Export complete.');
  });
  it('passes on an error the script caught', () => {
    expect(() => exportResult('Error: Cannot write to protected range B1:B2')).toThrow(
      'The spreadsheet script reported a problem: Cannot write to protected range B1:B2',
    );
  });
  it('explains an uncaught script crash', () => {
    expect(() => exportResult('<!DOCTYPE html><html>...')).toThrow(/crashed during the export/);
  });
});

describe('exportStats', () => {
  const settings = newTournament().settings;
  const scored = (points: number[], penalties: number[], roundId = 1) =>
    newTable({ roundId, playerIds: [1, 2, 3, 4], playerSeats: [0, 1, 2, 3], finalPoints: points, penalties });

  it('finds the highest raw points and counts penalties across scored tables', () => {
    const stats = exportStats(
      [
        scored([52300, 30000, 20000, -2300], [0, 20, 0, 0]),
        scored([41000, 35000, 14000, 10000], [10, 0, 0, 5], 2),
        newTable({ roundId: 3, playerIds: [1, 2, 3, 4] }), // not scored yet: ignored
      ],
      settings,
    );
    expect(stats).toEqual({ highestScore: 52300, penaltyCount: 3 });
  });

  it('has no high score before any game is scored', () => {
    expect(exportStats([newTable({ playerIds: [1, 2, 3, 4] })], settings)).toEqual({ highestScore: null, penaltyCount: 0 });
  });
});

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

  it('deletes the latest round so it can be re-paired', () => {
    playRound([[40000, 30000, 20000, 10000], [35000, 30000, 20000, 15000]]);
    const scoresAfterRound1 = { ...useStore.getState().scores };
    const s = useStore.getState();
    s.addRound([newTable({ tableId: 1, playerIds: [1, 2, 3, 4] }), newTable({ tableId: 2, playerIds: [5, 6, 7, 8] })], 4);
    // Enter a score on one table of round 2, so deleting must also remove it from the totals.
    const t = useStore.getState().tournament.tables.find((x) => x.roundId === 2 && x.tableId === 1)!;
    useStore.getState().updateTable({ ...t, finalPoints: [40000, 30000, 20000, 10000], penalties: [0, 0, 0, 0] });

    expect(useStore.getState().deleteRound(2)).toBeNull();
    const after = useStore.getState();
    expect(after.tournament.nextRound).toBe(2);
    expect(after.tournament.tables.every((x) => x.roundId === 1)).toBe(true);
    expect(after.tournament.roundPairingBlocks[2]).toBeUndefined();
    expect(after.scores).toEqual(scoresAfterRound1);

    // The next pairing becomes Round 2 again.
    after.addRound([newTable({ tableId: 1, playerIds: [1, 2, 3, 4] })], 2);
    expect(useStore.getState().tournament.roundPairingBlocks[2]).toBe(2);
  });

  it('refuses to delete an earlier round or one covered by a cut', () => {
    const s = useStore.getState();
    s.addRound([newTable({ tableId: 1, playerIds: [1, 2, 3, 4] })], 1);
    s.addRound([newTable({ tableId: 1, playerIds: [1, 2, 3, 4] })], 1);
    expect(useStore.getState().deleteRound(1)).toMatch(/Only the latest round/);
    expect(useStore.getState().tournament.nextRound).toBe(3);

    useStore.setState((st) => ({
      tournament: {
        ...st.tournament,
        cuts: [{ playerCount: 4, scoreModification: ScoreModification.None, startRound: 1, endRound: 2, tiebreakPriority: [], remainingContinue: false }],
      },
    }));
    expect(useStore.getState().deleteRound(2)).toMatch(/cut includes Round 2/);
    expect(useStore.getState().tournament.nextRound).toBe(3);
  });

  it('cuts to the top players and deactivates the rest', () => {
    playRound([[45000, 25000, 20000, 10000], [40000, 30000, 20000, 10000]]);
    const tieProblem = useStore.getState().createCut({
      playerCount: 2, scoreModification: ScoreModification.Halved, startRound: 1, endRound: 1, tiebreakPriority: [], remainingContinue: false,
    });
    const s = useStore.getState();
    expect(tieProblem).toBe(false);
    expect(s.tournament.registeredPlayers.length).toBe(2);
    expect(s.tournament.inactivePlayers.length).toBe(6);
    expect(s.tournament.cuts[0].tiebreakPriority.length).toBe(2);

    s.deleteCut(0);
    expect(useStore.getState().tournament.registeredPlayers.length).toBe(8);
  });

  it('breaks a score tie at the cut line with the standings tiebreaks', () => {
    useStore.setState((st) => ({ tournament: { ...st.tournament, settings: { ...st.tournament.settings, wrcTiebreaks: true } } }));
    const round = (tables: [number[], number[]][]) => {
      useStore.getState().addRound(tables.map(([ids], i) => newTable({ tableId: i + 1, playerIds: ids, playerSeats: [0, 1, 2, 3] })));
      const r = useStore.getState().tournament.nextRound - 1;
      tables.forEach(([ids, points], i) => {
        useStore.getState().updateTable(
          newTable({ roundId: r, tableId: i + 1, playerIds: ids, playerSeats: [0, 1, 2, 3], finalPoints: points, penalties: [0, 0, 0, 0] }),
        );
      });
    };
    // P2 and P6 finish 2nd then 1st. P1 and P5 both finish 1st then 3rd on the same total
    // points, so they tie on score for 3rd; P1 had the bigger single game (40,000 vs 35,000).
    round([[[1, 2, 3, 4], [40000, 30000, 20000, 10000]], [[5, 6, 7, 8], [35000, 32000, 23000, 10000]]]);
    round([[[1, 6, 7, 4], [20000, 45000, 25000, 10000]], [[5, 2, 3, 8], [25000, 40000, 28000, 7000]]]);
    const scores = useStore.getState().scores;
    expect(scores[1]).toBeCloseTo(scores[5]);

    const tieProblem = useStore.getState().createCut({
      playerCount: 3, scoreModification: ScoreModification.None, startRound: 1, endRound: 2, tiebreakPriority: [], remainingContinue: false,
    });
    expect(tieProblem).toBe(false);
    expect(useStore.getState().tournament.registeredPlayers.map((p) => p.id)).toEqual([1, 2, 6]);
  });

  it('without WRC tiebreaks, lets everyone tied at the cut line through and reports it', () => {
    // Same scores as the test above: Players 1 and 5 tie for 3rd.
    const round = (tables: [number[], number[]][]) => {
      useStore.getState().addRound(tables.map(([ids], i) => newTable({ tableId: i + 1, playerIds: ids, playerSeats: [0, 1, 2, 3] })));
      const r = useStore.getState().tournament.nextRound - 1;
      tables.forEach(([ids, points], i) => {
        useStore.getState().updateTable(
          newTable({ roundId: r, tableId: i + 1, playerIds: ids, playerSeats: [0, 1, 2, 3], finalPoints: points, penalties: [0, 0, 0, 0] }),
        );
      });
    };
    round([[[1, 2, 3, 4], [40000, 30000, 20000, 10000]], [[5, 6, 7, 8], [35000, 32000, 23000, 10000]]]);
    round([[[1, 6, 7, 4], [20000, 45000, 25000, 10000]], [[5, 2, 3, 8], [25000, 40000, 28000, 7000]]]);
    const tieProblem = useStore.getState().createCut({
      playerCount: 3, scoreModification: ScoreModification.None, startRound: 1, endRound: 2, tiebreakPriority: [], remainingContinue: false,
    });
    expect(tieProblem).toBe(true);
    expect(useStore.getState().tournament.registeredPlayers.map((p) => p.id)).toEqual([1, 2, 5, 6]);
  });

  it('still reports a cut tie that no tiebreak separates', () => {
    playRound([[40000, 30000, 20000, 10000], [40000, 30000, 20000, 10000]]);
    const tieProblem = useStore.getState().createCut({
      playerCount: 1, scoreModification: ScoreModification.None, startRound: 1, endRound: 1, tiebreakPriority: [], remainingContinue: false,
    });
    expect(tieProblem).toBe(true);
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
    expect(payload.tableCount).toBe(2);

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

  it('imports each of several substitutes (all ID 0) at a table into their own seat', () => {
    const t = newTournament();
    t.nextRound = 4;
    t.tables = [newTable({ roundId: 3, tableId: 4, playerIds: [0, 10, 14, 0], playerSeats: [0, 1, 2, 3] })];
    const rows = [[0, 50000, 0], [10, 40000, 0], [14, 20000, 0], [0, 10000, 0]];
    const result = applySheetScores([3, [4, ...rows]], t);
    expect(result.ok && result.tables[0].finalPoints).toEqual([50000, 40000, 20000, 10000]);

    // Rows in a different order still each fill a seat: the two substitutes take seats 1 and 4.
    const shuffled = applySheetScores([3, [4, [10, 40000, 0], [0, 50000, 0], [0, 10000, 0], [14, 20000, 0]]], t);
    expect(shuffled.ok && shuffled.tables[0].finalPoints).toEqual([50000, 40000, 20000, 10000]);

    // A third substitute row has no seat left.
    expect(applySheetScores([3, [4, ...rows, [0, 0, 0]]], t).ok).toBe(false);
  });

  it('labels standings with the latest fully scored round', () => {
    const after = () => {
      const s = useStore.getState();
      return buildExportPayload(s.tournament, s.scores, s.playersById).standingsAfterRound;
    };
    expect(after()).toBe(0);
    playRound([[40000, 30000, 20000, 10000], [35000, 30000, 20000, 15000]]);
    expect(after()).toBe(1); // final round scored, no new pairings: "After Round 1"

    // New pairings for round 2: still after round 1, also while only some scores are in.
    useStore.getState().addRound([
      newTable({ tableId: 1, playerIds: [1, 3, 5, 7], playerSeats: [0, 1, 2, 3] }),
      newTable({ tableId: 2, playerIds: [2, 4, 6, 8], playerSeats: [0, 1, 2, 3] }),
    ]);
    expect(after()).toBe(1);
    const [t1, t2] = useStore.getState().tournament.tables.filter((t) => t.roundId === 2);
    useStore.getState().updateTable({ ...t1, finalPoints: [40000, 30000, 20000, 10000], penalties: [0, 0, 0, 0] });
    expect(after()).toBe(1);
    useStore.getState().updateTable({ ...t2, finalPoints: [40000, 30000, 20000, 10000], penalties: [0, 0, 0, 0] });
    expect(after()).toBe(2);
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

describe('cuts where the remaining players continue', () => {
  beforeEach(freshTournament);

  // Round 1: P1-P4 at table 1 and P5-P8 at table 2, finishing in that order at each table.
  const scoreRound = (points: number[][]) => {
    const round = useStore.getState().tournament.nextRound - 1;
    useStore.getState().tournament.tables
      .filter((t) => t.roundId === round)
      .forEach((t, i) => useStore.getState().updateTable({ ...t, finalPoints: points[i], penalties: [0, 0, 0, 0] }));
  };
  const addRound = (tables: number[][]) =>
    useStore.getState().addRound(tables.map((ids, i) => newTable({ tableId: i + 1, playerIds: ids, playerSeats: [0, 1, 2, 3] })));
  const cut = (playerCount: number, scoreModification: ScoreModification) =>
    useStore.getState().createCut({
      playerCount, scoreModification, startRound: 1, endRound: useStore.getState().tournament.nextRound - 1,
      tiebreakPriority: [], remainingContinue: true,
    });

  beforeEach(() => {
    addRound([[1, 2, 3, 4], [5, 6, 7, 8]]);
    scoreRound([[50000, 30000, 15000, 5000], [40000, 30000, 20000, 10000]]);
  });

  it('keeps everyone playing and only modifies the scores of players who made the cut', () => {
    const before = { ...useStore.getState().scores };
    expect(cut(4, ScoreModification.Halved)).toBe(false);
    const s = useStore.getState();
    expect(s.tournament.registeredPlayers.length).toBe(8);
    expect(s.tournament.inactivePlayers).toEqual([]);
    const top = [1, 5, 2, 6]; // the four best scores
    for (const id of top) expect(s.scores[id]).toBeCloseTo(before[id] / 2);
    for (const id of [3, 4, 7, 8]) expect(s.scores[id]).toBeCloseTo(before[id]);
    expect(Object.keys(s.cutLevels).map(Number).sort()).toEqual([1, 2, 5, 6]);
  });

  it('ranks the top cut above everyone else, whatever their scores', () => {
    cut(4, ScoreModification.Zero);
    // Round 2: the top cut plays each other, and P8 wins big at the other table.
    addRound([[1, 2, 5, 6], [3, 4, 7, 8]]);
    scoreRound([[10000, 20000, 30000, 40000], [5000, 5000, 5000, 85000]]);
    const s = useStore.getState();
    expect(s.scores[8]).toBeGreaterThan(s.scores[1]);
    const st = computeStandings(s.tournament.registeredPlayers, s.scores, s.tournament.tables, s.tournament.settings, s.cutLevels);
    const ranked = Object.entries(st).sort((a, b) => a[1].rank - b[1].rank).map(([id]) => Number(id));
    expect(ranked.slice(0, 4).sort()).toEqual([1, 2, 5, 6]);
    expect(ranked[4]).toBe(8);
    // The sheet export uses the same order.
    const payload = buildExportPayload(s.tournament, s.scores, s.playersById, s.cutLevels);
    expect(payload.standings.slice(0, 5).map((r) => r[1])).toEqual(ranked.slice(0, 5));
  });

  it('pairs the top cut only with each other', () => {
    cut(4, ScoreModification.None);
    const s = useStore.getState();
    const { tables } = generatePairings({
      registered: s.tournament.registeredPlayers,
      scores: s.scores,
      cutLevels: s.cutLevels,
      existingTables: s.tournament.tables,
      tableSize: 4,
      settings: { avoidDuplicates: true, assignSeatWinds: true, assignSubs: true, swissBlocks: 1, timePerRoundMinutes: 75 },
    });
    expect([...tables[0].playerIds].sort()).toEqual([1, 2, 5, 6]);
    expect([...tables[1].playerIds].sort()).toEqual([3, 4, 7, 8]);
  });

  it('makes a later cut only from the players still in the top cut, and saves the option', () => {
    cut(4, ScoreModification.None);
    expect(cut(2, ScoreModification.None)).toBe(false);
    const s = useStore.getState();
    expect(Object.entries(s.cutLevels).filter(([, l]) => l === 2).map(([id]) => Number(id)).sort()).toEqual([1, 5]);
    expect(s.tournament.registeredPlayers.length).toBe(8);

    const roundTrip = deserializeTournament(JSON.parse(JSON.stringify(serializeTournament(s.tournament))));
    expect(roundTrip.cuts.map((c) => c.remainingContinue)).toEqual([true, true]);
    const { remaining_continue: _, ...old } = serializeTournament(s.tournament).cuts[0];
    expect(deserializeTournament({ ...serializeTournament(s.tournament), cuts: [old] }).cuts[0].remainingContinue).toBe(false);
  });
});

function freshTournamentWithScores() {
  freshTournament();
  useStore.getState().addRound([
    newTable({ tableId: 1, playerIds: [1, 2, 3, 4], playerSeats: [0, 1, 2, 3] }),
    newTable({ tableId: 2, playerIds: [5, 6, 7, 8], playerSeats: [0, 1, 2, 3] }),
  ]);
  const points = [[50000, 30000, 15000, 5000], [40000, 30000, 20000, 10000]];
  useStore.getState().tournament.tables.forEach((t, i) =>
    useStore.getState().updateTable({ ...t, finalPoints: points[i], penalties: [0, 0, 0, 0] }),
  );
}

describe('players deactivated by hand', () => {
  beforeEach(freshTournamentWithScores);
  const cut = (playerCount: number, remainingContinue: boolean) =>
    useStore.getState().createCut({
      playerCount, scoreModification: ScoreModification.None, startRound: 1, endRound: 1, tiebreakPriority: [], remainingContinue,
    });
  const ids = (players: { id: number }[]) => players.map((p) => p.id).sort((a, b) => a - b);

  it('stay inactive through a cut where the remaining players continue', () => {
    useStore.getState().deactivatePlayer(8);
    useStore.getState().deactivatePlayer(1); // the leader: doesn't take a place in the cut
    cut(4, true);
    // A later recalculation (entering a score) must not bring them back either.
    const t = useStore.getState().tournament.tables[0];
    useStore.getState().updateTable({ ...t });
    const s = useStore.getState();
    expect(ids(s.tournament.inactivePlayers)).toEqual([1, 8]);
    expect(ids(s.tournament.registeredPlayers)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(Object.keys(s.cutLevels).map(Number).sort()).toEqual([2, 5, 6, 7]);
  });

  it('stay inactive through a normal cut, and leaving later does not change the cut', () => {
    useStore.getState().deactivatePlayer(8);
    expect(cut(4, false)).toBe(false);
    expect(ids(useStore.getState().tournament.registeredPlayers)).toEqual([1, 2, 5, 6]);
    // A finalist drops out after the cut: nobody is promoted in their place.
    useStore.getState().deactivatePlayer(6);
    useStore.getState().replaceTables(useStore.getState().tournament.tables);
    const s = useStore.getState();
    expect(ids(s.tournament.registeredPlayers)).toEqual([1, 2, 5]);
    expect(ids(s.tournament.inactivePlayers)).toEqual([3, 4, 6, 7, 8]);

    // Deleting the cut brings back the players it removed, but not those who left.
    s.deleteCut(0);
    expect(ids(useStore.getState().tournament.registeredPlayers)).toEqual([1, 2, 3, 4, 5, 7]);
  });

  it('include players added on the Player Management tab, who never compete for a cut', () => {
    const sub = { id: 9, name: 'Sub', affiliation: '' };
    useStore.getState().addInactivePlayer(sub);
    // Four players have negative scores, so a 0-score player would make a top 6 if they competed.
    expect(cut(6, true)).toBe(false);
    let s = useStore.getState();
    expect(ids(s.tournament.inactivePlayers)).toEqual([9]);
    expect(Object.keys(s.cutLevels)).not.toContain('9');
    expect(Object.keys(s.cutLevels).length).toBe(6);

    cut(2, false);
    useStore.getState().replaceTables(useStore.getState().tournament.tables);
    s = useStore.getState();
    expect(ids(s.tournament.inactivePlayers)).toContain(9);
    expect(ids(s.tournament.registeredPlayers)).toHaveLength(2);

    // Still inactive with no cuts left.
    s.deleteCut(1);
    useStore.getState().deleteCut(0);
    expect(ids(useStore.getState().tournament.inactivePlayers)).toEqual([9]);
  });

  it('do not change an earlier cut when activated after it', () => {
    useStore.getState().addInactivePlayer({ id: 9, name: 'Sub', affiliation: '' });
    cut(6, true);
    const before = Object.keys(useStore.getState().cutLevels).sort();
    useStore.getState().activatePlayer(9);
    useStore.getState().replaceTables(useStore.getState().tournament.tables);
    let s = useStore.getState();
    // Player 9 is active but below the top cut, which still holds the same six players.
    expect(Object.keys(s.cutLevels).sort()).toEqual(before);
    expect(ids(s.tournament.registeredPlayers)).toContain(9);

    // A normal cut made earlier doesn't remove them either; a later one includes them.
    freshTournamentWithScores();
    useStore.getState().addInactivePlayer({ id: 9, name: 'Sub', affiliation: '' });
    cut(4, false);
    useStore.getState().activatePlayer(9);
    useStore.getState().replaceTables(useStore.getState().tournament.tables);
    s = useStore.getState();
    expect(ids(s.tournament.registeredPlayers)).toEqual([1, 2, 5, 6, 9]);
    expect(s.tournament.missedCuts).toEqual({ 9: [0, 1] });
    expect(deserializeTournament(JSON.parse(JSON.stringify(serializeTournament(s.tournament)))).missedCuts).toEqual({ 9: [0, 1] });

    // Deleting that cut: nothing left for them to have missed.
    s.deleteCut(0);
    expect(useStore.getState().tournament.missedCuts).toEqual({});
    expect(ids(useStore.getState().tournament.registeredPlayers)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('repairs saves where an added player was not recorded as inactive', () => {
    useStore.getState().addInactivePlayer({ id: 9, name: 'Sub', affiliation: '' });
    cut(4, false);
    const saved = serializeTournament(useStore.getState().tournament);
    const loaded = deserializeTournament({ ...saved, withdrawn_at: {} });
    expect(loaded.withdrawnAt).toEqual({ 9: 0 });
    useStore.getState().loadTournament(loaded);
    expect(ids(useStore.getState().tournament.registeredPlayers)).not.toContain(9);
  });

  it('come back when activated, and are recognised in older saves', () => {
    useStore.getState().deactivatePlayer(8);
    cut(4, false);
    useStore.getState().activatePlayer(8);
    expect(useStore.getState().tournament.withdrawnAt).toEqual({});

    useStore.getState().deactivatePlayer(5); // a finalist, after the cut
    const saved = serializeTournament(useStore.getState().tournament);
    const { withdrawn_at: _, ...old } = saved;
    // Player 5 is the only inactive player the cut doesn't explain.
    expect(deserializeTournament(old).withdrawnAt).toEqual({ 5: 1 });
    expect(deserializeTournament(JSON.parse(JSON.stringify(saved))).withdrawnAt).toEqual({ 5: 1 });
  });
});


describe('players removed by a cut on the standings', () => {
  beforeEach(freshTournamentWithScores);
  // Round 1 scores: P1 70, P5 60, P2 10, P6 10, P7 -20, P3 -25, P8 -50, P4 -55.
  const cut = (playerCount: number, startRound: number, endRound: number, scoreModification: ScoreModification) =>
    useStore.getState().createCut({
      playerCount, scoreModification, startRound, endRound, tiebreakPriority: [], remainingContinue: false,
    });
  const standingsOrder = () => {
    const s = useStore.getState();
    const payload = buildExportPayload(s.tournament, s.scores, s.playersById, s.cutLevels, s.cutOut);
    return payload.standings.map(([rank, id, , score]) => [rank, id, score]);
  };

  it('stay below the finalists, frozen at their score from the cut', () => {
    cut(4, 1, 1, ScoreModification.Zero);
    let s = useStore.getState();
    expect(s.tournament.registeredPlayers.map((p) => p.id)).toEqual([1, 2, 5, 6]);
    // Finalists are reset to 0; the others keep their round 1 totals, in that order.
    expect(standingsOrder()).toEqual([
      [1, 1, '0.0'], [1, 2, '0.0'], [1, 5, '0.0'], [1, 6, '0.0'],
      [5, 7, '(20.0)'], [6, 3, '(25.0)'], [7, 8, '(50.0)'], [8, 4, '(55.0)'],
    ]);

    // The finalists play on; the cut-out players don't change, even if a finalist ends up lower.
    useStore.getState().addRound([newTable({ tableId: 1, playerIds: [1, 2, 5, 6], playerSeats: [0, 1, 2, 3] })]);
    const t = useStore.getState().tournament.tables.find((x) => x.roundId === 2)!;
    useStore.getState().updateTable({ ...t, finalPoints: [70000, 25000, 5000, 0], penalties: [0, 0, 0, 0] });
    s = useStore.getState();
    expect(s.scores[6]).toBeLessThan(-55);
    expect(standingsOrder().map(([rank, id]) => [rank, id])).toEqual([
      [1, 1], [2, 2], [3, 5], [4, 6], [5, 7], [6, 3], [7, 8], [8, 4],
    ]);
    expect(standingsOrder()[4][2]).toBe('(20.0)');

    // A second cut: its players rank above those from the first cut.
    cut(2, 2, 2, ScoreModification.None);
    expect(standingsOrder().map(([, id]) => id)).toEqual([1, 2, 5, 6, 7, 3, 8, 4]);
    expect(useStore.getState().tournament.registeredPlayers.map((p) => p.id)).toEqual([1, 2]);
  });

  it('are not shown for players deactivated by hand or added later', () => {
    useStore.getState().deactivatePlayer(8);
    useStore.getState().addInactivePlayer({ id: 9, name: 'Sub', affiliation: '' });
    cut(4, 1, 1, ScoreModification.None);
    expect(standingsOrder().map(([, id]) => id)).toEqual([1, 5, 2, 6, 7, 3, 4]);
  });

  it('come back as normal players when the cut is deleted', () => {
    cut(4, 1, 1, ScoreModification.Zero);
    useStore.getState().deleteCut(0);
    expect(useStore.getState().cutOut).toEqual({});
    expect(standingsOrder()[0]).toEqual([1, 1, '70.0']);
  });
});
