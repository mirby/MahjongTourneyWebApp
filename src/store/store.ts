import { create } from 'zustand';
import { deserializeTournament, serializeTournament } from '../core/serialize';
import { calculateScores, CutLevels, roundDeleteBlocker, topCutLevel, withoutRound } from '../core/tournament';
import { cutQualifiers } from '../core/standings';
import { Cut, newTournament, Player, Scores, Table, Tournament } from '../core/types';

const AUTOSAVE_KEY = 'mahjong-tournament-autosave';

function withoutKey(record: Record<number, number>, key: number): Record<number, number> {
  const { [key]: _, ...rest } = record;
  return rest;
}

function indexPlayers(t: Tournament): Record<number, Player> {
  const map: Record<number, Player> = {};
  for (const p of t.registeredPlayers) map[p.id] = p;
  for (const p of t.inactivePlayers) map[p.id] = p;
  return map;
}

/** Recomputes scores (which may also move players between active/inactive after cuts). */
function recalculated(t: Tournament) {
  const r = calculateScores(t);
  const tournament: Tournament = { ...t, registeredPlayers: r.registeredPlayers, inactivePlayers: r.inactivePlayers };
  return { tournament, scores: r.scores, cutLevels: r.cutLevels, playersById: indexPlayers(tournament) };
}

interface StoreState {
  /** True once a tournament has been started or loaded. */
  active: boolean;
  tournament: Tournament;
  scores: Scores;
  /** Cut level of each player (see calculateScores): players in a top cut rank and pair above the rest. */
  cutLevels: CutLevels;
  playersById: Record<number, Player>;
  /** Epoch ms at which the current round ends, or null when no timer is running. */
  roundEndsAt: number | null;
  /**
   * Pairing Blocks value typed on the Round Management tab, kept here so it survives
   * switching tabs. null until changed; the tab then defaults to the last round's value.
   */
  pairingBlocks: number | null;

  loadTournament: (t: Tournament) => void;
  closeTournament: () => void;

  addSingleTable: (table: Table) => void;
  addRound: (tables: Table[], pairingBlocks?: number) => void;
  /** Removes the latest round's pairings. Returns an error message instead if it can't. */
  deleteRound: (round: number) => string | null;
  updateTable: (table: Table) => void;
  replaceTables: (tables: Table[]) => void;

  updateInactivePlayers: (players: Player[]) => void;
  activatePlayer: (id: number) => void;
  deactivatePlayer: (id: number) => void;

  /** Returns true if ties put too many players through and the organizer must resolve it. */
  createCut: (cut: Cut) => boolean;
  deleteCut: (index: number) => void;

  setScriptId: (id: string) => void;
  startRound: (seconds: number) => void;
  clearRoundTimer: () => void;
  setPairingBlocks: (blocks: number) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  active: false,
  tournament: newTournament(),
  scores: {},
  cutLevels: {},
  playersById: {},
  roundEndsAt: null,
  pairingBlocks: null,

  loadTournament: (t) => set({ ...recalculated(t), active: true, roundEndsAt: null, pairingBlocks: null }),
  closeTournament: () =>
    set({
      active: false,
      tournament: newTournament(),
      scores: {},
      cutLevels: {},
      playersById: {},
      roundEndsAt: null,
      pairingBlocks: null,
    }),

  addSingleTable: (table) =>
    set((s) => ({ tournament: { ...s.tournament, tables: [...s.tournament.tables, table] } })),

  addRound: (newTables, pairingBlocks) =>
    set((s) => {
      const roundId = s.tournament.nextRound;
      return {
        tournament: {
          ...s.tournament,
          nextRound: roundId + 1,
          tables: [...s.tournament.tables, ...newTables.map((t) => ({ ...t, roundId }))],
          roundPairingBlocks:
            pairingBlocks === undefined
              ? s.tournament.roundPairingBlocks
              : { ...s.tournament.roundPairingBlocks, [roundId]: pairingBlocks },
        },
      };
    }),

  deleteRound: (round) => {
    const s = get();
    const blocker = roundDeleteBlocker(s.tournament, round);
    if (blocker) return blocker;
    set(recalculated(withoutRound(s.tournament, round)));
    return null;
  },

  updateTable: (nt) =>
    set((s) => {
      const tables = s.tournament.tables.map((t) =>
        t.roundId === nt.roundId && t.tableId === nt.tableId
          ? {
              ...t,
              playerIds: nt.playerIds,
              playerSeats: nt.playerSeats,
              finalPoints: nt.finalPoints,
              finalShuugi: nt.finalShuugi,
              penalties: nt.penalties,
              leftOverKyotaku: nt.leftOverKyotaku,
            }
          : t,
      );
      return recalculated({ ...s.tournament, tables });
    }),

  replaceTables: (tables) => set((s) => recalculated({ ...s.tournament, tables })),

  updateInactivePlayers: (players) =>
    set((s) => {
      const tournament = { ...s.tournament, inactivePlayers: players };
      return { tournament, playersById: indexPlayers(tournament) };
    }),

  activatePlayer: (id) =>
    set((s) => {
      const player = s.playersById[id];
      if (!player) return {};
      const tournament = {
        ...s.tournament,
        inactivePlayers: s.tournament.inactivePlayers.filter((p) => p.id !== id),
        registeredPlayers: [...s.tournament.registeredPlayers, player].sort((a, b) => a.id - b.id),
        withdrawnAt: withoutKey(s.tournament.withdrawnAt, id),
      };
      return { tournament };
    }),

  deactivatePlayer: (id) =>
    set((s) => {
      const player = s.playersById[id];
      if (!player) return {};
      const tournament = {
        ...s.tournament,
        registeredPlayers: s.tournament.registeredPlayers.filter((p) => p.id !== id),
        inactivePlayers: [...s.tournament.inactivePlayers, player].sort((a, b) => a.id - b.id),
        withdrawnAt: { ...s.tournament.withdrawnAt, [id]: s.tournament.cuts.length },
      };
      return { tournament };
    }),

  createCut: (cut) => {
    const s = get();
    // Only the players in the current top group compete for the cut.
    const level = topCutLevel(s.tournament.registeredPlayers, s.cutLevels);
    const candidates = s.tournament.registeredPlayers.filter((p) => (s.cutLevels[p.id] ?? 0) === level);
    // Break score ties at the cut line the same way the Standings tab orders them.
    const tiebreakPriority = cutQualifiers(
      candidates,
      s.scores,
      s.tournament.tables,
      s.tournament.settings,
      cut.playerCount,
    );
    const withCut: Tournament = { ...s.tournament, cuts: [...s.tournament.cuts, { ...cut, tiebreakPriority }] };
    const r = calculateScores(withCut);
    // Remember who made the cut so later recalculations break ties the same way.
    const qualifiers = r.cutQualifierIds[r.cutQualifierIds.length - 1];
    const saved: Cut = { ...cut, tiebreakPriority: qualifiers };
    const tournament: Tournament = {
      ...withCut,
      cuts: [...s.tournament.cuts, saved],
      registeredPlayers: r.registeredPlayers,
      inactivePlayers: r.inactivePlayers,
    };
    set({ tournament, scores: r.scores, cutLevels: r.cutLevels, playersById: indexPlayers(tournament) });
    return qualifiers.length > cut.playerCount;
  },

  deleteCut: (index) =>
    set((s) => {
      const cuts = s.tournament.cuts.filter((_, i) => i !== index);
      let { registeredPlayers, inactivePlayers } = s.tournament;
      // Players who left after the deleted cut now left one cut earlier.
      const withdrawnAt: Record<number, number> = {};
      for (const [id, n] of Object.entries(s.tournament.withdrawnAt)) withdrawnAt[+id] = n > index ? n - 1 : n;
      // With cuts remaining, the recalculation re-applies them from scratch. With none left,
      // nothing would bring the cut players back, so restore everyone here except players
      // who were deactivated by hand.
      if (cuts.length === 0) {
        const all = [...registeredPlayers, ...inactivePlayers].sort((a, b) => a.id - b.id);
        registeredPlayers = all.filter((p) => withdrawnAt[p.id] === undefined);
        inactivePlayers = all.filter((p) => withdrawnAt[p.id] !== undefined);
      }
      return recalculated({ ...s.tournament, cuts, registeredPlayers, inactivePlayers, withdrawnAt });
    }),

  setScriptId: (id) =>
    set((s) => ({ tournament: { ...s.tournament, settings: { ...s.tournament.settings, scriptId: id } } })),

  startRound: (seconds) => set({ roundEndsAt: seconds > 0 ? Date.now() + seconds * 1000 : null }),
  clearRoundTimer: () => set({ roundEndsAt: null }),
  setPairingBlocks: (blocks) => set({ pairingBlocks: blocks }),
}));

// Autosave to the browser so a refresh or accidental close doesn't lose the tournament.
useStore.subscribe((state, prev) => {
  if (state.active && state.tournament !== prev.tournament) {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serializeTournament(state.tournament)));
    } catch {
      /* storage full or unavailable; ignore */
    }
  }
});

export function loadAutosave(): Tournament | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? deserializeTournament(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function getPlayerName(playersById: Record<number, Player>, id: number): string {
  if (id === 0) return 'Substitute Player';
  return playersById[id]?.name ?? `Unknown (${id})`;
}
