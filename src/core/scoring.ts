import {
  GameType,
  RiichiSticksStrategy,
  Scores,
  Table,
  TiebreakStrategy,
  TournamentSettings,
  UmaType,
} from './types';

export function isComplete(table: Table, settings: TournamentSettings): boolean {
  const scoresComplete = table.finalPoints.length === table.playerIds.length;
  const shuugiComplete = table.finalShuugi.length === table.playerIds.length;
  return scoresComplete && (!settings.shuugi || shuugiComplete);
}

/** Groups player indices into rank tiers, best first. Players with equal net score share a tier. */
function rankTiers(net: number[]): number[][] {
  const order = net.map((_, i) => i).sort((a, b) => net[b] - net[a] || a - b);
  const tiers: number[][] = [];
  for (const idx of order) {
    const last = tiers[tiers.length - 1];
    if (last && net[last[0]] === net[idx]) last.push(idx);
    else tiers.push([idx]);
  }
  return tiers;
}

function pickUma(settings: TournamentSettings, atOrAboveReturn: number): number[] {
  if (settings.umaType === UmaType.Fixed) return settings.fixedUma;
  if (settings.gameType === GameType.Yonma) {
    if (atOrAboveReturn === 4 || atOrAboveReturn === 2 || atOrAboveReturn === 0) return settings.floatingUma1;
    if (atOrAboveReturn === 3) return settings.floatingUma2;
    return settings.floatingUma3;
  }
  if (atOrAboveReturn === 3 || atOrAboveReturn === 1 || atOrAboveReturn === 0) return settings.floatingUma1;
  return settings.floatingUma2;
}

/**
 * Final score for every seat of a completed table, in table order.
 * Returns [] if the table isn't fully scored yet.
 */
export function scoreTableArr(table: Table, settings: TournamentSettings): number[] {
  if (!isComplete(table, settings)) return [];

  const net = table.finalPoints.map((p) => (p - settings.returnPoints) / 1000);
  const atOrAboveReturn = net.filter((n) => n >= 0).length;
  const uma = pickUma(settings, atOrAboveReturn);
  const umaAt = (slot: number) => uma[slot] ?? 0;
  const okaAt = (slot: number) => settings.oka[slot] ?? 0;
  const seat = (idx: number) => table.playerSeats[idx] ?? idx;
  const lowestSeat = (idxs: number[]) => idxs.reduce((best, i) => (seat(i) < seat(best) ? i : best), idxs[0]);

  const tiers = rankTiers(net);
  const post: number[] = new Array(net.length).fill(0);
  let slot = 0;

  tiers.forEach((tier, tierIdx) => {
    const tierNet = net[tier[0]];
    const k = tier.length;

    if (k === 1) {
      post[tier[0]] = tierNet + umaAt(slot) + okaAt(slot);
      slot += 1;
      return;
    }

    if (settings.tiebreakStrategy === TiebreakStrategy.WindOrder) {
      // Tied players take the uma slots in seat-wind order.
      const bySeat = [...tier].sort((a, b) => seat(a) - seat(b));
      for (const idx of bySeat) {
        post[idx] = tierNet + umaAt(slot) + okaAt(slot);
        slot += 1;
      }
      return;
    }

    // Split: pool the uma/oka of the occupied slots and share it equally.
    let cumUma = 0;
    let cumOka = 0;
    for (let s = 0; s < k; s++) {
      cumUma += umaAt(slot + s);
      cumOka += okaAt(slot + s);
    }
    slot += k;

    const needsRemainder =
      k === 3 && tierIdx <= 1 && (Math.trunc(cumUma) % 3 !== 0 || Math.trunc(cumOka) % 3 !== 0);

    if (!needsRemainder) {
      for (const idx of tier) post[idx] = tierNet + cumUma / k + cumOka / k;
      return;
    }

    // Three-way tie that doesn't divide evenly to one decimal place: the
    // leftover tenths go to the player in the earliest seat.
    let umaRemainder = (Math.trunc(cumUma * 10) % 3) / 10;
    let umaDivided: number;
    const okaRemainder = (Math.trunc(cumOka * 10) % 3) / 10;
    const okaDivided = Math.floor((cumOka * 10) / 3) / 10;

    if (tierIdx === 0) {
      umaDivided = Math.floor((cumUma * 10) / 3) / 10;
    } else if (cumUma < 0) {
      umaDivided = Math.ceil((cumUma * 10) / 3) / 10;
      umaRemainder += 0.3;
      umaDivided -= 0.1;
    } else {
      umaDivided = Math.floor((cumUma * 10) / 3) / 10;
    }

    for (const idx of tier) post[idx] = tierNet + umaDivided + okaDivided;
    post[lowestSeat(tier)] += umaRemainder + okaRemainder;
  });

  // Leftover riichi sticks go to first place, if the tournament is configured that way.
  if (settings.riichiSticksStrategy === RiichiSticksStrategy.First) {
    const top = tiers[0];
    const winner = lowestSeat(top);
    // Stored in raw points; scores here are still in thousands.
    const kyotaku = table.leftOverKyotaku / 1000;
    if (settings.tiebreakStrategy === TiebreakStrategy.WindOrder) {
      post[winner] += kyotaku;
    } else if (top.length === 3 && Math.trunc(kyotaku) % 3 !== 0) {
      for (const idx of top) post[idx] += kyotaku * 0.3;
      post[winner] += kyotaku * 0.1;
    } else {
      for (const idx of top) post[idx] += kyotaku / top.length;
    }
  }

  return post.map((p, i) => {
    let score = p * settings.scorePerThousandPoints;
    score -= table.penalties[i] ?? 0;
    if (settings.shuugi) {
      score += ((table.finalShuugi[i] ?? 0) - settings.endShuugi) * settings.scorePerShuugi;
    }
    return score;
  });
}

/** Player id -> score for a completed table; {} if the table isn't fully scored. */
export function scoreTable(table: Table, settings: TournamentSettings): Scores {
  const arr = scoreTableArr(table, settings);
  const result: Scores = {};
  arr.forEach((score, i) => {
    result[table.playerIds[i]] = score;
  });
  return result;
}
