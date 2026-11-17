import { isComplete } from './scoring';
import { Tournament } from './types';

const field = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (cells: (string | number)[]) => cells.map(field).join(',') + '\n';

export function playersCsv(t: Tournament): string {
  let out = row(['ID', 'Name', 'Affiliation']);
  for (const p of [...t.registeredPlayers, ...t.inactivePlayers]) {
    out += row([p.id, p.name, p.affiliation]);
  }
  return out;
}

export function tablesCsv(t: Tournament): string {
  const header = ['Round ID', 'Table ID', 'Player ID', 'Seat Wind', 'Points', 'Penalties'];
  if (t.settings.shuugi) header.push('Shuugi');
  let out = row(header);

  for (const table of t.tables) {
    table.playerIds.forEach((playerId, i) => {
      const cells: (string | number)[] = [table.roundId, table.tableId, playerId];
      if (isComplete(table, t.settings)) {
        cells.push(
          table.playerSeats[i] ?? i,
          Math.trunc(table.finalPoints[i]),
          Math.trunc(table.penalties[i] ?? 0),
        );
        if (t.settings.shuugi) cells.push(Math.trunc(table.finalShuugi[i]));
      }
      out += row(cells);
    });
  }
  return out;
}
