import { decodeGodotVar, looksLikeJson } from './godotVar';
import {
  Cut,
  defaultSettings,
  newTable,
  Player,
  Table,
  Tournament,
  TournamentSettings,
} from './types';

// The JSON keys intentionally match the Godot version's serialize() dictionaries,
// so data from that version can be mapped across later.

type Json = Record<string, any>;

const serializePlayer = (p: Player): Json => ({ id: p.id, name: p.name, affiliation: p.affiliation });
const deserializePlayer = (d: Json): Player => ({ id: d.id, name: d.name, affiliation: d.affiliation });

const serializeTable = (t: Table): Json => ({
  table_id: t.tableId,
  round_id: t.roundId,
  cut_id: t.cutId,
  player_ids: t.playerIds,
  player_seats: t.playerSeats,
  final_points: t.finalPoints,
  final_shuugi: t.finalShuugi,
  penalties: t.penalties,
  left_over_kyotaku: t.leftOverKyotaku,
});

const deserializeTable = (d: Json): Table =>
  newTable({
    tableId: d.table_id,
    roundId: d.round_id,
    cutId: d.cut_id ?? -1,
    playerIds: d.player_ids ?? [],
    playerSeats: d.player_seats ?? [],
    finalPoints: d.final_points ?? [],
    finalShuugi: d.final_shuugi ?? [],
    penalties: d.penalties ?? [],
    leftOverKyotaku: d.left_over_kyotaku ?? 0,
  });

const serializeCut = (c: Cut): Json => ({
  player_count: c.playerCount,
  score_modification: c.scoreModification,
  start_round: c.startRound,
  end_round: c.endRound,
  tiebreak_priority: c.tiebreakPriority,
});

const deserializeCut = (d: Json): Cut => ({
  playerCount: d.player_count,
  scoreModification: d.score_modification,
  startRound: d.start_round,
  endRound: d.end_round,
  tiebreakPriority: d.tiebreak_priority ?? [],
});

const serializeSettings = (s: TournamentSettings): Json => ({
  game_type: s.gameType,
  uma_type: s.umaType,
  fixed_uma: s.fixedUma,
  floating_uma_1: s.floatingUma1,
  floating_uma_2: s.floatingUma2,
  floating_uma_3: s.floatingUma3,
  tiebreak_strategy: s.tiebreakStrategy,
  start_points: s.startPoints,
  return_points: s.returnPoints,
  oka: s.oka,
  pairing_system: s.pairingSystem,
  time_per_round_minutes: s.timePerRoundMinutes,
  assign_seat_winds: s.assignSeatWinds,
  riichi_sticks_strategy: s.riichiSticksStrategy,
  advanced_settings: s.advancedSettings,
  score_per_thousand_points: s.scorePerThousandPoints,
  shuugi: s.shuugi,
  start_shuugi: s.startShuugi,
  end_shuugi: s.endShuugi,
  score_per_shuugi: s.scorePerShuugi,
  script_id: s.scriptId,
});

function deserializeSettings(d: Json): TournamentSettings {
  const base = defaultSettings();
  return {
    gameType: d.game_type ?? base.gameType,
    umaType: d.uma_type ?? base.umaType,
    fixedUma: d.fixed_uma ?? base.fixedUma,
    floatingUma1: d.floating_uma_1 ?? base.floatingUma1,
    floatingUma2: d.floating_uma_2 ?? base.floatingUma2,
    floatingUma3: d.floating_uma_3 ?? base.floatingUma3,
    tiebreakStrategy: d.tiebreak_strategy ?? base.tiebreakStrategy,
    startPoints: d.start_points ?? base.startPoints,
    returnPoints: d.return_points ?? base.returnPoints,
    oka: d.oka ?? base.oka,
    pairingSystem: d.pairing_system ?? base.pairingSystem,
    timePerRoundMinutes: d.time_per_round_minutes ?? base.timePerRoundMinutes,
    assignSeatWinds: d.assign_seat_winds ?? base.assignSeatWinds,
    riichiSticksStrategy: d.riichi_sticks_strategy ?? base.riichiSticksStrategy,
    advancedSettings: d.advanced_settings ?? base.advancedSettings,
    scorePerThousandPoints: d.score_per_thousand_points ?? base.scorePerThousandPoints,
    shuugi: d.shuugi ?? base.shuugi,
    startShuugi: d.start_shuugi ?? base.startShuugi,
    endShuugi: d.end_shuugi ?? base.endShuugi,
    scorePerShuugi: d.score_per_shuugi ?? base.scorePerShuugi,
    scriptId: d.script_id ?? '',
  };
}

/** Reads a save file: either JSON from this app, or the Godot version's binary .tmnt format. */
export function parseSaveFile(buffer: ArrayBuffer): Tournament {
  if (looksLikeJson(buffer)) {
    return deserializeTournament(JSON.parse(new TextDecoder().decode(buffer)));
  }
  return deserializeTournament(decodeGodotVar(buffer) as Json);
}

export function serializeTournament(t: Tournament): Json {
  return {
    name: t.name,
    registered_players: t.registeredPlayers.map(serializePlayer),
    inactive_players: t.inactivePlayers.map(serializePlayer),
    settings: serializeSettings(t.settings),
    tables: t.tables.map(serializeTable),
    cuts: t.cuts.map(serializeCut),
    next_round: t.nextRound,
  };
}

export function deserializeTournament(d: Json): Tournament {
  if (!d || typeof d !== 'object' || !Array.isArray(d.registered_players) || !d.settings) {
    throw new Error('This file does not look like a tournament save.');
  }
  return {
    name: d.name ?? '',
    registeredPlayers: d.registered_players.map(deserializePlayer),
    inactivePlayers: (d.inactive_players ?? []).map(deserializePlayer),
    settings: deserializeSettings(d.settings),
    tables: (d.tables ?? []).map(deserializeTable),
    cuts: (d.cuts ?? []).map(deserializeCut),
    nextRound: d.next_round ?? 1,
  };
}
