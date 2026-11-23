import { scoreTable } from './scoring';
import { Cut, Player, Scores, ScoreModification, Tournament } from './types';

export interface ScoreResult {
  scores: Scores;
  registeredPlayers: Player[];
  inactivePlayers: Player[];
  /**
   * How many "remaining players continue" cuts each registered player has made (0 if none).
   * Players on a higher level always rank above lower ones, and are paired separately.
   */
  cutLevels: CutLevels;
  /** The players who made each cut, in cut order. */
  cutQualifierIds: number[][];
}

/** Player ID → cut level. Missing players are level 0. */
export type CutLevels = Record<number, number>;

/** The highest cut level among these players: the group still competing in the top cut. */
export function topCutLevel(players: Player[], levels: CutLevels): number {
  return Math.max(0, ...players.map((p) => levels[p.id] ?? 0));
}

/**
 * Cumulative scores for every player, applying cuts in order.
 * Cuts move players between the registered/inactive lists, so the resulting
 * lists are returned alongside the scores rather than mutated in place.
 */
export function calculateScores(t: Tournament): ScoreResult {
  const scores: Scores = {};
  const cutLevels: CutLevels = {};
  const cutQualifierIds: number[][] = [];
  let registered = [...t.registeredPlayers];
  let inactive = [...t.inactivePlayers];
  let remaining = [...t.tables];

  // Cuts are re-applied from scratch, so start from every player. Players deactivated by hand
  // are set aside again at the end.
  const withdrawnAt = t.withdrawnAt ?? {};
  const isWithdrawn = (id: number) => withdrawnAt[id] !== undefined;
  if (t.cuts.length > 0) {
    registered = [...registered, ...inactive];
    inactive = [];
  }

  for (const [cutIndex, cut] of t.cuts.entries()) {
    const kept = [];
    for (const table of remaining) {
      if (cut.startRound <= table.roundId && table.roundId <= cut.endRound) {
        const tableScores = scoreTable(table, t.settings);
        for (const [id, s] of Object.entries(tableScores)) {
          scores[+id] = (scores[+id] ?? 0) + s;
        }
      } else {
        kept.push(table);
      }
    }
    remaining = kept;

    // Only the players still in the top group (who made every earlier cut) compete for this one.
    // A player who left before this cut was made doesn't compete for it.
    const competing = registered.filter((p) => !(isWithdrawn(p.id) && cutIndex >= withdrawnAt[p.id]));
    const level = topCutLevel(competing, cutLevels);
    const candidates = competing.filter((p) => (cutLevels[p.id] ?? 0) === level);
    const postCutIds = cutQualifiers(candidates, scores, cut);
    cutQualifierIds.push(postCutIds);
    // A cut no bigger than the field changes nothing (kept as in the original desktop app).
    if (!cut.remainingContinue && candidates.length <= cut.playerCount) continue;

    if (cut.remainingContinue) {
      for (const id of postCutIds) cutLevels[id] = level + 1;
    } else {
      const stillIn: Player[] = [];
      for (const p of registered) {
        if (postCutIds.includes(p.id)) stillIn.push(p);
        else inactive.push(p);
      }
      registered = stillIn;
    }

    if (cut.scoreModification !== ScoreModification.None) {
      // Players who continue below the cut keep their scores.
      const modified = cut.remainingContinue ? postCutIds : Object.keys(scores).map(Number);
      for (const id of modified) {
        scores[id] = cut.scoreModification === ScoreModification.Halved ? (scores[id] ?? 0) / 2 : 0;
      }
    }
  }

  for (const table of remaining) {
    const tableScores = scoreTable(table, t.settings);
    for (const [id, s] of Object.entries(tableScores)) {
      scores[+id] = (scores[+id] ?? 0) + s;
    }
  }

  if (t.cuts.length > 0) {
    inactive = [...inactive, ...registered.filter((p) => isWithdrawn(p.id))].sort((a, b) => a.id - b.id);
    registered = registered.filter((p) => !isWithdrawn(p.id));
  }

  return { scores, registeredPlayers: registered, inactivePlayers: inactive, cutLevels, cutQualifierIds };
}

/**
 * Which candidates make the cut. Score ties at the cut line are broken by the cut's saved
 * tiebreak priority; ties it doesn't settle let everyone tied through, for the organizer to resolve.
 */
function cutQualifiers(candidates: Player[], scores: Scores, cut: Cut): number[] {
  const cutScores = candidates.map((p) => scores[p.id] ?? 0);
  if (cutScores.length <= cut.playerCount) return candidates.map((p) => p.id);

  cutScores.sort((a, b) => b - a);

  let hasTie = false;
  let tiedScore = 0;
  if (cutScores[cut.playerCount - 1] === cutScores[cut.playerCount]) {
    hasTie = true;
    tiedScore = cutScores[cut.playerCount - 1];
  }
  const qualifying = cutScores.slice(0, cut.playerCount);

  const postCutIds: number[] = [];
  const tiedIds: number[] = [];
  for (const p of candidates) {
    const s = scores[p.id] ?? 0;
    if (qualifying.includes(s) && (!hasTie || s > tiedScore)) postCutIds.push(p.id);
    else if (hasTie && s === tiedScore) tiedIds.push(p.id);
  }

  // Break ties using the saved pre-cut priority list, if there is one.
  let tieIndex = 0;
  while (postCutIds.length < cut.playerCount && tieIndex < tiedIds.length) {
    if (cut.tiebreakPriority.includes(tiedIds[tieIndex])) {
      postCutIds.push(tiedIds[tieIndex]);
      tiedIds.splice(tieIndex, 1);
    } else {
      tieIndex += 1;
    }
  }
  // Still unresolved: everyone tied gets in, and the organizer has to resolve it manually.
  if (postCutIds.length < cut.playerCount) postCutIds.push(...tiedIds);
  return postCutIds;
}

/**
 * Why a round's pairings can't be deleted, or null if they can.
 * Only the latest round can go (removing an earlier one would leave a gap in the round
 * numbers), and not while a cut covers it.
 */
export function roundDeleteBlocker(t: Tournament, round: number): string | null {
  const latest = t.nextRound - 1;
  if (round < 1 || round > latest) return `Round ${round} does not exist.`;
  if (round !== latest) return `Only the latest round can be deleted. Delete Round ${latest} first.`;
  if (t.cuts.some((c) => c.endRound >= round)) return `A cut includes Round ${round}. Delete that cut first.`;
  return null;
}

/** The tournament with the latest round's pairings removed. Check roundDeleteBlocker first. */
export function withoutRound(t: Tournament, round: number): Tournament {
  const roundPairingBlocks = { ...t.roundPairingBlocks };
  delete roundPairingBlocks[round];
  return {
    ...t,
    tables: t.tables.filter((table) => table.roundId !== round),
    roundPairingBlocks,
    nextRound: round,
  };
}
