import { useMemo, useState } from 'react';
import { formatScore } from '../core/format';
import { Standing } from '../core/standings';
import { Player, Scores, TournamentSettings } from '../core/types';

export type SortKey = 'rank' | 'id' | 'name' | 'affiliation' | 'score';

interface Props {
  players: Player[];
  scores: Scores;
  settings: TournamentSettings;
  selectedId?: number | null;
  /** Called with a player id when a row is clicked, or null when empty space is clicked. */
  onSelect?: (id: number | null) => void;
  editable?: boolean;
  onEdit?: (player: Player) => void;
  /**
   * Player id -> standing. When given, a Rank column is shown; sorting by Rank, and ties
   * in any other column, follow the tiebroken standings order.
   */
  standings?: Record<number, Standing>;
  /** Initial sort column and direction. Defaults to Player ID ascending. */
  defaultSort?: { key: SortKey; asc: boolean };
}

const COLUMNS: { key: SortKey; title: string }[] = [
  { key: 'rank', title: 'Rank' },
  { key: 'id', title: 'Player ID' },
  { key: 'name', title: 'Player Name' },
  { key: 'affiliation', title: 'Affiliation' },
  { key: 'score', title: 'Score' },
];

export function PlayerList({
  players,
  scores,
  settings,
  selectedId,
  onSelect,
  editable,
  onEdit,
  standings,
  defaultSort,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort?.key ?? 'id');
  const [asc, setAsc] = useState(defaultSort?.asc ?? true);
  const columns = standings ? COLUMNS : COLUMNS.filter((c) => c.key !== 'rank');

  const rows = useMemo(() => {
    const withScore = players.map((p) => ({
      player: p,
      score: scores[p.id] ?? 0,
      rank: standings?.[p.id]?.rank ?? 0,
      position: standings?.[p.id]?.position ?? 0,
    }));
    const value = (r: (typeof withScore)[number]) =>
      sortKey === 'score' ? r.score : sortKey === 'rank' ? r.position : sortKey === 'id' ? r.player.id : r.player[sortKey];
    return withScore.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      const cmp = x < y ? -1 : x > y ? 1 : 0;
      // Within a tie, fall back to standings order and then Player ID, regardless of direction.
      if (cmp === 0) return a.position - b.position || a.player.id - b.player.id;
      return asc ? cmp : -cmp;
    });
  }, [players, scores, standings, sortKey, asc]);

  const clickHeader = (key: SortKey) => {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(key !== 'score');
    }
  };

  return (
    <div className="tree" onClick={() => onSelect?.(null)}>
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="sortable" onClick={(e) => { e.stopPropagation(); clickHeader(c.key); }}>
                {c.title}
                {c.key === sortKey ? (asc ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ player, score, rank }) => (
            <tr
              key={player.id}
              className={`selectable ${selectedId === player.id ? 'selected' : ''}`}
              onClick={(e) => { e.stopPropagation(); onSelect?.(player.id); }}
            >
              {standings && <td className="num">{rank}</td>}
              <td>{player.id}</td>
              <td>
                {editable ? (
                  <input type="text" value={player.name} onChange={(e) => onEdit?.({ ...player, name: e.target.value })} />
                ) : (
                  player.name
                )}
              </td>
              <td>
                {editable ? (
                  <input type="text" value={player.affiliation} onChange={(e) => onEdit?.({ ...player, affiliation: e.target.value })} />
                ) : (
                  player.affiliation
                )}
              </td>
              <td className="num">{formatScore(score, settings)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
