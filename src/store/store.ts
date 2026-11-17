import { create } from 'zustand';
import { deserializeTournament, serializeTournament } from '../core/serialize';
import { calculateScores } from '../core/tournament';
import { Cut, newTournament, Player, Scores, Table, Tournament } from '../core/types';

const AUTOSAVE_KEY = 'mahjong-tournament-autosave';

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
  return { tournament, scores: r.scores, playersById: indexPlayers(tournament) };
}

interface StoreState {
  /** True once a tournament has been started or loaded. */
  active: boolean;
  tournament: Tournament;
  scores: Scores;
  playersById: Record<number, Player>;
  /** Epoch ms at which the current round ends, or null when no timer is running. */
  roundEndsAt: number | null;

  loadTournament: (t: Tournament) => void;
  closeTournament: () => void;

  addSingleTable: (table: Table) => void;
  addRound: (tables: Table[]) => void;
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
}

export const useStore = create<StoreState>((set, get) => ({
  active: false,
  tournament: newTournament(),
  scores: {},
  playersById: {},
  roundEndsAt: null,

  loadTournament: (t) => set({ ...recalculated(t), active: true, roundEndsAt: null }),
  closeTournament: () => set({ active: false, tournament: newTournament(), scores: {}, playersById: {}, roundEndsAt: null }),

  addSingleTable: (table) =>
    set((s) => ({ tournament: { ...s.tournament, tables: [...s.tournament.tables, table] } })),

  addRound: (newTables) =>
    set((s) => {
      const roundId = s.tournament.nextRound;
      return {
        tournament: {
          ...s.tournament,
          nextRound: roundId + 1,
          tables: [...s.tournament.tables, ...newTables.map((t) => ({ ...t, roundId }))],
        },
      };
    }),

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
      };
      return { tournament };
    }),

  createCut: (cut) => {
    const s = get();
    const withCut: Tournament = { ...s.tournament, cuts: [...s.tournament.cuts, cut] };
    const r = calculateScores(withCut);
    // Remember who was still in after the cut so later recalculations break ties the same way.
    const saved: Cut = { ...cut, tiebreakPriority: r.registeredPlayers.map((p) => p.id) };
    const tournament: Tournament = {
      ...withCut,
      cuts: [...s.tournament.cuts, saved],
      registeredPlayers: r.registeredPlayers,
      inactivePlayers: r.inactivePlayers,
    };
    set({ tournament, scores: r.scores, playersById: indexPlayers(tournament) });
    return r.registeredPlayers.length !== cut.playerCount;
  },

  deleteCut: (index) =>
    set((s) => {
      const cuts = s.tournament.cuts.filter((_, i) => i !== index);
      let { registeredPlayers, inactivePlayers } = s.tournament;
      // With cuts remaining, the recalculation re-applies them from scratch. With none left,
      // nothing would bring the cut players back, so restore everyone here.
      if (cuts.length === 0) {
        registeredPlayers = [...registeredPlayers, ...inactivePlayers].sort((a, b) => a.id - b.id);
        inactivePlayers = [];
      }
      return recalculated({ ...s.tournament, cuts, registeredPlayers, inactivePlayers });
    }),

  setScriptId: (id) =>
    set((s) => ({ tournament: { ...s.tournament, settings: { ...s.tournament.settings, scriptId: id } } })),

  startRound: (seconds) => set({ roundEndsAt: seconds > 0 ? Date.now() + seconds * 1000 : null }),
  clearRoundTimer: () => set({ roundEndsAt: null }),
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
