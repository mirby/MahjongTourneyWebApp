import { newTable, Player, Scores, Table, Wind } from './types';

export type Rng = () => number;

export interface PairingSettings {
  avoidDuplicates: boolean;
  assignSeatWinds: boolean;
  assignSubs: boolean;
  swissBlocks: number;
  timePerRoundMinutes: number;
}

export interface PairingResult {
  tables: Table[];
  byes: number[];
  /** Number of tables that still contain players who have already met. */
  duplicateCount: number;
}

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const byNumber = (a: number, b: number) => a - b;

/** For every player id, the set of players they have already shared a table with. */
export function priorPairings(tables: Table[]): Map<number, Set<number>> {
  const prior = new Map<number, Set<number>>();
  for (const table of tables) {
    for (const id of table.playerIds) {
      let met = prior.get(id);
      if (!met) {
        met = new Set();
        prior.set(id, met);
      }
      for (const other of table.playerIds) {
        if (other !== id) met.add(other);
      }
    }
  }
  return prior;
}

/** Number of seats at the table occupied by someone who has already met an earlier-sorted player there. */
export function pairingCost(pairing: number[], prior: Map<number, Set<number>>): number {
  const seen = new Set<number>();
  let cost = 0;
  for (const player of [...pairing].sort(byNumber)) {
    if (seen.has(player)) cost += 1;
    prior.get(player)?.forEach((o) => seen.add(o));
  }
  return cost;
}

/**
 * Greedy local search: repeatedly take the worst table and find the single
 * swap with another table that removes the most repeat pairings.
 * Mutates `pairings` in place.
 */
function resolveDuplicates(pairings: number[][], prior: Map<number, Set<number>>, size: number): void {
  const dupTables = () => pairings.filter((p) => pairingCost(p, prior) > 0).length;
  if (dupTables() === 0 || pairings.length < 2) return;

  const swaps: [number, number, number][] = [];
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size; j++)
      for (let k = 1; k < pairings.length; k++) swaps.push([i, j, k]);

  const applySwap = ([i, j, k]: [number, number, number]) => {
    const tmp = pairings[0][i];
    pairings[0][i] = pairings[k][j];
    pairings[k][j] = tmp;
  };

  for (let attempt = 0; attempt < 30; attempt++) {
    pairings.sort((a, b) => pairingCost(b, prior) - pairingCost(a, prior));

    let bestDelta = 0;
    let best: [number, number, number] | null = null;
    for (const swap of swaps) {
      const k = swap[2];
      const before = pairingCost(pairings[0], prior) + pairingCost(pairings[k], prior);
      applySwap(swap);
      const after = pairingCost(pairings[0], prior) + pairingCost(pairings[k], prior);
      applySwap(swap);
      if (after < before && before - after > bestDelta) {
        bestDelta = before - after;
        best = swap;
      }
    }

    if (!best) return;
    applySwap(best);
    pairings[0].sort(byNumber);
    pairings[best[2]].sort(byNumber);
    if (dupTables() === 0) return;
  }
}

function pairBlock(
  players: number[],
  size: number,
  settings: PairingSettings,
  prior: Map<number, Set<number>>,
  rng: Rng,
): number[][] {
  const pool = shuffle([...players], rng);
  const pairings: number[][] = [];

  if (!settings.avoidDuplicates) {
    for (let i = 0; i + size <= pool.length; i += size) pairings.push(pool.slice(i, i + size));
    return pairings;
  }

  // Not guaranteed to be duplicate-free, but good enough when the number of
  // rounds is small relative to the number of players.
  while (pool.length > 0) {
    const first = pool.shift()!;
    const table = [first];
    const hasPlayed = new Set<number>(prior.get(first) ?? []);

    let index = 0;
    while (index < pool.length && table.length < size) {
      const candidate = pool[index];
      if (!hasPlayed.has(candidate)) {
        table.push(candidate);
        prior.get(candidate)?.forEach((o) => hasPlayed.add(o));
        pool.splice(index, 1);
      } else {
        index += 1;
      }
    }
    while (table.length < size && pool.length > 0) table.push(pool.shift()!);
    pairings.push(table);
  }

  for (const p of pairings) p.sort(byNumber);
  resolveDuplicates(pairings, prior, size);
  for (const p of pairings) shuffle(p, rng);
  return pairings;
}

function swissPairings(
  registered: Player[],
  scores: Scores,
  priorTables: Table[],
  size: number,
  settings: PairingSettings,
  rng: Rng,
): { pairings: number[][]; byes: number[] } {
  // Shuffle first so players on equal scores are ordered randomly (this also
  // decides who sits out when there are no substitutes).
  const players = shuffle(registered.map((p) => p.id), rng);
  players.sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));

  const leftover = players.length % size;
  let byes: number[] = [];
  if (leftover !== 0) {
    if (settings.assignSubs) {
      for (let i = 0; i < size - leftover; i++) players.push(0);
    } else {
      byes = players.splice(players.length - leftover, leftover);
    }
  }

  const blocks = Math.max(1, Math.floor(settings.swissBlocks) || 1);
  const tablesNum = players.length / size;
  let tablesPerBlock = Math.floor(tablesNum / blocks);
  let largerBlocksLeft = 0;
  if (tablesNum % blocks !== 0) {
    tablesPerBlock += 1;
    largerBlocksLeft = tablesNum % blocks;
  }

  const prior = priorPairings(priorTables);
  const pairings: number[][] = [];
  let start = 0;
  for (let block = 0; block < blocks; block++) {
    const blockPlayers = tablesPerBlock * size;
    pairings.push(...pairBlock(players.slice(start, start + blockPlayers), size, settings, prior, rng));
    start += blockPlayers;

    if (largerBlocksLeft > 0) {
      largerBlocksLeft -= 1;
      if (largerBlocksLeft === 0) tablesPerBlock -= 1;
    }
  }

  return { pairings, byes };
}

/**
 * For every player id, how many times they have sat in each wind (indexed by Wind).
 * Tables with no seat winds recorded are ignored; substitutes (id 0) are not tracked.
 */
export function windHistory(tables: Table[]): Map<number, number[]> {
  const history = new Map<number, number[]>();
  for (const table of tables) {
    if (table.playerSeats.length === 0) continue;
    table.playerIds.forEach((id, i) => {
      const wind = table.playerSeats[i];
      if (id === 0 || wind === undefined) return;
      let counts = history.get(id);
      if (!counts) {
        counts = [0, 0, 0, 0];
        history.set(id, counts);
      }
      counts[wind] += 1;
    });
  }
  return history;
}

/** Every ordering of `items`. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

/**
 * Orders a table's players so position i sits in wind i (East, South, ...), spreading winds
 * as evenly as possible over the tournament. Picks the seating whose winds each player has
 * had least often so far (the sum of those counts; this also minimises the sum of squared
 * wind counts). Equally good seatings are chosen at random.
 */
export function balanceWinds(pairing: number[], history: Map<number, number[]>, rng: Rng = Math.random): number[] {
  const had = (id: number, wind: number) => (id === 0 ? 0 : history.get(id)?.[wind] ?? 0);
  let best: number[][] = [];
  let bestCost = Infinity;
  for (const order of permutations(pairing)) {
    const cost = order.reduce((sum, id, wind) => sum + had(id, wind), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = [order];
    } else if (cost === bestCost) {
      best.push(order);
    }
  }
  return best[Math.floor(rng() * best.length)];
}

/** Generates a set of pairings, retrying a few times to minimise repeat opponents. */
export function generatePairings(opts: {
  registered: Player[];
  scores: Scores;
  existingTables: Table[];
  tableSize: number;
  settings: PairingSettings;
  /**
   * Cut level of each player (from "remaining players continue" cuts). Each level is paired
   * separately, so players in a top cut only play each other. Highest level gets the first tables.
   */
  cutLevels?: Record<number, number>;
  rng?: Rng;
  maxAttempts?: number;
}): PairingResult {
  const { registered, scores, existingTables, tableSize, settings } = opts;
  const rng = opts.rng ?? Math.random;
  const maxAttempts = opts.maxAttempts ?? 100;
  const prior = priorPairings(existingTables);

  const levelOf = (p: Player) => opts.cutLevels?.[p.id] ?? 0;
  const groups = [...new Set(registered.map(levelOf))]
    .sort((a, b) => b - a)
    .map((level) => registered.filter((p) => levelOf(p) === level));

  let bestPairings: number[][] = [];
  let bestByes: number[] = [];
  let minDuplicates = Infinity;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pairings: number[][] = [];
    const byes: number[] = [];
    for (const group of groups) {
      const r = swissPairings(group, scores, existingTables, tableSize, settings, rng);
      pairings.push(...r.pairings);
      byes.push(...r.byes);
    }

    if (!settings.avoidDuplicates) {
      bestPairings = pairings;
      bestByes = byes;
      minDuplicates = 0;
      break;
    }

    const dups = pairings.filter((p) => pairingCost(p, prior) > 0).length;
    if (dups < minDuplicates) {
      bestPairings = pairings;
      bestByes = byes;
      minDuplicates = dups;
    }
    if (minDuplicates === 0) break;
  }

  const seats = [Wind.East, Wind.South, Wind.West, Wind.North].slice(0, tableSize);
  // Tables and who sits at them are settled above; balancing winds only reorders players
  // within a table, so it never undoes Swiss blocks or duplicate avoidance.
  const history = settings.assignSeatWinds ? windHistory(existingTables) : new Map<number, number[]>();
  const tables = bestPairings.map((pairing, i) =>
    newTable({
      tableId: i + 1,
      playerIds: settings.assignSeatWinds ? balanceWinds(pairing, history, rng) : pairing,
      playerSeats: settings.assignSeatWinds ? [...seats] : [],
    }),
  );

  return {
    tables,
    byes: bestByes,
    duplicateCount: settings.avoidDuplicates ? minDuplicates : 0,
  };
}
