export interface Player {
  id: number;
  name: string;
  affiliation: string;
}

export enum Wind {
  East = 0,
  South = 1,
  West = 2,
  North = 3,
}
export const WIND_NAMES = ['East', 'South', 'West', 'North'] as const;

export interface Table {
  tableId: number;
  /** 0 means a manually created hanchan that isn't part of a numbered round. */
  roundId: number;
  cutId: number;
  playerIds: number[];
  playerSeats: number[];
  finalPoints: number[];
  finalShuugi: number[];
  penalties: number[];
  /** Raw points left on the table (riichi sticks not awarded). */
  leftOverKyotaku: number;
}

export function newTable(partial: Partial<Table> = {}): Table {
  return {
    tableId: 0,
    roundId: 0,
    cutId: -1,
    playerIds: [],
    playerSeats: [],
    finalPoints: [],
    finalShuugi: [],
    penalties: [],
    leftOverKyotaku: 0,
    ...partial,
  };
}

export enum ScoreModification {
  None = 0,
  Halved = 1,
  Zero = 2,
}

export interface Cut {
  playerCount: number;
  scoreModification: ScoreModification;
  startRound: number;
  endRound: number;
  tiebreakPriority: number[];
  /**
   * Players who miss the cut keep playing (they stay in pairings) instead of being removed.
   * Their scores are never modified, and everyone who made the cut always ranks above them.
   */
  remainingContinue: boolean;
}

export enum GameType {
  Yonma = 0,
  Sanma = 1,
}
export enum UmaType {
  Fixed = 0,
  Floating = 1,
}
export enum PairingSystem {
  Random = 0,
  ProgressiveSwiss = 1,
}
export enum TiebreakStrategy {
  WindOrder = 0,
  Split = 1,
}
export enum RiichiSticksStrategy {
  Lost = 0,
  First = 1,
}

export interface TournamentSettings {
  gameType: GameType;
  umaType: UmaType;
  fixedUma: number[];
  floatingUma1: number[];
  floatingUma2: number[];
  /** Unused for sanma. */
  floatingUma3: number[];
  tiebreakStrategy: TiebreakStrategy;
  startPoints: number;
  returnPoints: number;
  oka: number[];
  pairingSystem: PairingSystem;
  timePerRoundMinutes: number;
  assignSeatWinds: boolean;
  riichiSticksStrategy: RiichiSticksStrategy;
  advancedSettings: boolean;
  scorePerThousandPoints: number;
  shuugi: boolean;
  startShuugi: number;
  endShuugi: number;
  scorePerShuugi: number;
  scriptId: string;
}

export function defaultSettings(): TournamentSettings {
  return {
    gameType: GameType.Yonma,
    umaType: UmaType.Fixed,
    fixedUma: [30, 10, -10, -30],
    floatingUma1: [15, 5, -5, -15],
    floatingUma2: [15, 5, 0, -20],
    floatingUma3: [20, 0, -5, -15],
    tiebreakStrategy: TiebreakStrategy.WindOrder,
    startPoints: 25000,
    returnPoints: 30000,
    oka: [20, 0, 0, 0],
    pairingSystem: PairingSystem.ProgressiveSwiss,
    timePerRoundMinutes: 75,
    assignSeatWinds: true,
    riichiSticksStrategy: RiichiSticksStrategy.Lost,
    advancedSettings: false,
    scorePerThousandPoints: 1.0,
    shuugi: false,
    startShuugi: 10,
    endShuugi: 10,
    scorePerShuugi: 2.0,
    scriptId: '',
  };
}

export interface Tournament {
  name: string;
  registeredPlayers: Player[];
  inactivePlayers: Player[];
  settings: TournamentSettings;
  tables: Table[];
  cuts: Cut[];
  nextRound: number;
  /** Round number -> Pairing Blocks setting used to create it. Missing for rounds from older saves. */
  roundPairingBlocks: Record<number, number>;
  /**
   * Players moved to Inactive by hand on the Player Management tab: Player ID -> how many cuts
   * existed when they were deactivated. They stay inactive whatever the cuts say, and only
   * compete in the cuts made before they left (so leaving doesn't change an earlier cut).
   */
  withdrawnAt: Record<number, number>;
}

export function newTournament(): Tournament {
  return {
    name: '',
    registeredPlayers: [],
    inactivePlayers: [],
    settings: defaultSettings(),
    tables: [],
    cuts: [],
    nextRound: 1,
    roundPairingBlocks: {},
    withdrawnAt: {},
  };
}

/** Player id -> cumulative score. */
export type Scores = Record<number, number>;

export function tableSize(settings: TournamentSettings): 3 | 4 {
  return settings.gameType === GameType.Yonma ? 4 : 3;
}
