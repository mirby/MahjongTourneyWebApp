import { scoreTable } from './scoring';
import { Player, Scores, ScoreModification, Tournament } from './types';

export interface ScoreResult {
  scores: Scores;
  registeredPlayers: Player[];
  inactivePlayers: Player[];
}

/**
 * Cumulative scores for every player, applying cuts in order.
 * Cuts move players between the registered/inactive lists, so the resulting
 * lists are returned alongside the scores rather than mutated in place.
 */
export function calculateScores(t: Tournament): ScoreResult {
  const scores: Scores = {};
  let registered = [...t.registeredPlayers];
  let inactive = [...t.inactivePlayers];
  let remaining = [...t.tables];

  if (t.cuts.length > 0) {
    registered = [...registered, ...inactive];
    inactive = [];
  }

  for (const cut of t.cuts) {
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

    const cutScores = registered.map((p) => scores[p.id] ?? 0);
    if (cutScores.length <= cut.playerCount) continue;

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
    for (const p of registered) {
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

    const stillIn: Player[] = [];
    for (const p of registered) {
      if (postCutIds.includes(p.id)) stillIn.push(p);
      else inactive.push(p);
    }
    registered = stillIn;

    if (cut.scoreModification !== ScoreModification.None) {
      for (const key of Object.keys(scores)) {
        const id = +key;
        scores[id] = cut.scoreModification === ScoreModification.Halved ? scores[id] / 2 : 0;
      }
    }
  }

  for (const table of remaining) {
    const tableScores = scoreTable(table, t.settings);
    for (const [id, s] of Object.entries(tableScores)) {
      scores[+id] = (scores[+id] ?? 0) + s;
    }
  }

  return { scores, registeredPlayers: registered, inactivePlayers: inactive };
}
