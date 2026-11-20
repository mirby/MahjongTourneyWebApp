import { formatScore } from './format';
import { isComplete } from './scoring';
import { newTable, Player, Scores, Table, Tournament, TournamentSettings, tableSize } from './types';

const urlFor = (scriptId: string) => `https://script.google.com/macros/s/${encodeURIComponent(scriptId.trim())}/exec`;

export function getRound(tables: Table[], roundId: number): Table[] {
  return tables.filter((t) => t.roundId === roundId).sort((a, b) => a.tableId - b.tableId);
}

/**
 * Tournament-wide stats over every fully scored table so far:
 * the highest raw final table points anyone has finished a game with (null before any game is scored),
 * and how many penalties have been given (each non-zero penalty entry counts once, whatever its size).
 */
export function exportStats(tables: Table[], settings: TournamentSettings) {
  let highestScore: number | null = null;
  let penaltyCount = 0;
  for (const table of tables) {
    if (!isComplete(table, settings)) continue;
    for (const points of table.finalPoints) {
      if (highestScore === null || points > highestScore) highestScore = points;
    }
    penaltyCount += table.penalties.filter((p) => p !== 0).length;
  }
  return { highestScore, penaltyCount };
}

export function buildExportPayload(
  t: Tournament,
  scores: Scores,
  playersById: Record<number, Player>,
) {
  const roundNumber = t.nextRound - 1;

  const standings = t.registeredPlayers
    .map((p) => ({ id: p.id, name: p.name, score: scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => [i + 1, r.id, r.name, formatScore(r.score, t.settings)]);

  const tables = getRound(t.tables, roundNumber).map((table) =>
    table.playerIds.map((id) => [id, id === 0 ? 'Substitute Player' : (playersById[id]?.name ?? '')]),
  );

  // tableCount is written to Score Entry!R3 and stats to Stats!B1:B2 by the Apps Script
  // (scripts that predate these fields ignore them).
  return {
    roundNumber,
    standings,
    tables,
    tableCount: tables.length,
    stats: exportStats(t.tables, t.settings),
    shuugi: t.settings.shuugi,
  };
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function exportToSheets(scriptId: string, payload: unknown): Promise<string> {
  // text/plain keeps this a "simple" CORS request (no preflight), which Apps Script requires.
  const res = await fetch(urlFor(scriptId), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Error ${res.status}: ${await errorMessage(res)}`);
  return exportResult(await res.text());
}

/**
 * Interprets the script's reply to an export. The script answers "Success!" when the round
 * was written; with a try/catch in doPost it answers "Error: <message>" instead. An HTML page
 * means the script crashed before it could answer.
 */
export function exportResult(body: string): string {
  const text = body.trim();
  if (text === 'Success!') return 'Export complete.';
  if (text.startsWith('<')) {
    throw new Error(
      'The spreadsheet script crashed during the export. Some tabs may already be updated. Run the failing step from the Apps Script editor to see the error.',
    );
  }
  throw new Error(`The spreadsheet script reported a problem: ${text.replace(/^Error:\s*/i, '') || '(empty reply)'}`);
}

export async function fetchSheetScores(scriptId: string, t: Tournament): Promise<unknown> {
  const url = `${urlFor(scriptId)}?tableSize=${tableSize(t.settings)}&shuugi=${t.settings.shuugi}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status}: ${await errorMessage(res)}`);
  return res.json();
}

export type ImportResult = { ok: true; tables: Table[] } | { ok: false; error: string };

/**
 * Applies a score import from the spreadsheet script. Expected shape:
 * [roundNumber, [tableId, [playerId, points, (shuugi,) penalty], ...], ...]
 * Returns the full updated table list, or an error without changing anything.
 */
export function applySheetScores(data: unknown, t: Tournament): ImportResult {
  if (!Array.isArray(data) || data.length < 1) {
    return { ok: false, error: 'Unexpected response from the spreadsheet script.' };
  }
  const [roundNumber, ...tableData] = data as [number, ...any[]];
  const size = tableSize(t.settings);
  const tables = t.tables.map((tbl) => newTable({ ...tbl }));

  for (const entry of tableData) {
    const [tableId, ...scoreRows] = entry as [number, ...any[]];
    const table = tables.find((x) => x.roundId === roundNumber && x.tableId === tableId);
    if (!table) {
      return { ok: false, error: `Error when importing: table ${tableId} of round ${roundNumber} not found.` };
    }

    // Copy before mutating so a failed import leaves everything untouched.
    table.finalPoints = [...table.finalPoints];
    table.finalShuugi = [...table.finalShuugi];
    table.penalties = [...table.penalties];

    for (const score of scoreRows) {
      const idx = table.playerIds.indexOf(score[0]);
      if (idx === -1) {
        return {
          ok: false,
          error: `Error when importing table ${tableId}: Player ${score[0]} in spreadsheet not present in software.`,
        };
      }
      if (table.finalPoints.length < size) table.finalPoints = new Array(size).fill(0);
      if (t.settings.shuugi && table.finalShuugi.length < size) table.finalShuugi = new Array(size).fill(0);
      if (table.penalties.length < size) table.penalties = new Array(size).fill(0);

      table.finalPoints[idx] = Number(score[1]);
      if (t.settings.shuugi) {
        table.finalShuugi[idx] = Number(score[2]);
        table.penalties[idx] = Number(score[3]);
      } else {
        table.penalties[idx] = Number(score[2]);
      }
    }
  }

  return { ok: true, tables };
}
