import { formatScore } from '../core/format';
import { isComplete, scoreTableArr } from '../core/scoring';
import { Player, Table, TournamentSettings } from '../core/types';
import { getPlayerName } from '../store/store';

interface Props {
  tables: Table[];
  settings: TournamentSettings;
  playersById: Record<number, Player>;
  /** Only show this round (0 = manually created hanchan). Omit or pass -1 for all. */
  roundFilter?: number;
  /** Only show hanchan this player took part in. */
  playerFilter?: number | null;
  selected?: { roundId: number; tableId: number } | null;
  onSelect?: (roundId: number, tableId: number) => void;
}

export const tableLabel = (t: Table) => (t.roundId === 0 ? `Table ${t.tableId}` : `Round ${t.roundId}, Table ${t.tableId}`);

export function HanchanList({ tables, settings, playersById, roundFilter = -1, playerFilter, selected, onSelect }: Props) {
  const shuugi = settings.shuugi;
  const colSpan = shuugi ? 6 : 5;

  const visible = tables.filter(
    (t) => (roundFilter === -1 || t.roundId === roundFilter) && (!playerFilter || t.playerIds.includes(playerFilter)),
  );

  return (
    <div className="tree">
      <table>
        <thead>
          <tr>
            <th>Player ID</th>
            <th>Player Name</th>
            <th>Points</th>
            {shuugi && <th>Shuugi</th>}
            <th>Penalty</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((table) => {
            const complete = isComplete(table, settings);
            const scores = complete ? scoreTableArr(table, settings) : [];
            const isSelected = selected?.roundId === table.roundId && selected?.tableId === table.tableId;
            const key = `${table.roundId}-${table.tableId}`;
            return [
              <tr
                key={key}
                className={`group ${onSelect ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelect?.(table.roundId, table.tableId)}
              >
                <td colSpan={colSpan}>{tableLabel(table)}</td>
              </tr>,
              ...table.playerIds.map((id, i) => (
                <tr
                  key={`${key}-${i}`}
                  className={`child ${onSelect ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelect?.(table.roundId, table.tableId)}
                >
                  <td>{id}</td>
                  <td>{getPlayerName(playersById, id)}</td>
                  <td className="num">{complete ? table.finalPoints[i] : ''}</td>
                  {shuugi && <td className="num">{complete ? table.finalShuugi[i] : ''}</td>}
                  <td className="num">{complete ? (table.penalties[i] ?? 0) : ''}</td>
                  <td className="num">{complete ? formatScore(scores[i], settings) : ''}</td>
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
