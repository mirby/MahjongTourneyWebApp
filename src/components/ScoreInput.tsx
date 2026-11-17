import { useMemo, useState } from 'react';
import { formatScore } from '../core/format';
import { scoreTableArr } from '../core/scoring';
import { newTable, Table, tableSize, WIND_NAMES } from '../core/types';
import { getPlayerName, useStore } from '../store/store';
import { tableLabel } from './HanchanList';
import { NumericInput } from './NumericInput';

interface Props {
  table: Table;
  onSubmit: (table: Table) => void;
  onCancel: () => void;
}

/** Score entry form for one hanchan. Also lets the organizer change who's seated where ("Modify Table"). */
export function ScoreInput({ table, onSubmit, onCancel }: Props) {
  const settings = useStore((s) => s.tournament.settings);
  const playersById = useStore((s) => s.playersById);
  const size = tableSize(settings);
  const maxId = Math.max(0, ...Object.keys(playersById).map(Number));

  const [ids, setIds] = useState<number[]>(() => Array.from({ length: size }, (_, i) => table.playerIds[i] ?? 0));
  const [seats, setSeats] = useState<number[]>(() => Array.from({ length: size }, (_, i) => table.playerSeats[i] ?? i));
  const [points, setPoints] = useState<number[]>(() =>
    Array.from({ length: size }, (_, i) => table.finalPoints[i] ?? settings.startPoints),
  );
  const [shuugi, setShuugi] = useState<number[]>(() =>
    Array.from({ length: size }, (_, i) => table.finalShuugi[i] ?? settings.startShuugi),
  );
  const [penalties, setPenalties] = useState<number[]>(() => Array.from({ length: size }, (_, i) => table.penalties[i] ?? 0));

  const set = (arr: number[], setter: (a: number[]) => void, i: number, v: number) => {
    const next = [...arr];
    next[i] = v;
    setter(next);
  };

  const missingPoints = settings.startPoints * size - points.reduce((a, b) => a + b, 0);
  const missingShuugi = settings.shuugi ? settings.startShuugi * size - shuugi.reduce((a, b) => a + b, 0) : 0;

  const draft = useMemo(
    () =>
      newTable({
        ...table,
        playerIds: ids,
        playerSeats: seats,
        finalPoints: points,
        finalShuugi: settings.shuugi ? shuugi : [],
        penalties,
        leftOverKyotaku: missingPoints,
      }),
    [table, ids, seats, points, shuugi, penalties, settings.shuugi, missingPoints],
  );
  const scores = useMemo(() => scoreTableArr(draft, settings), [draft, settings]);

  const rows = Array.from({ length: size }, (_, i) => i);

  return (
    <div>
      <div style={{ padding: '0 5px 10px' }}>{tableLabel(table)}</div>

      <div className="scorer">
        <div className="col narrow">
          <label>Player ID</label>
          {rows.map((i) => (
            <div key={i}>
              <input
                type="number"
                min={0}
                max={maxId}
                step={1}
                value={ids[i]}
                onChange={(e) => set(ids, setIds, i, Math.max(0, Math.min(maxId, Math.trunc(Number(e.target.value) || 0))))}
              />
            </div>
          ))}
        </div>
        <div className="col grow">
          <label>Name</label>
          {rows.map((i) => (
            <div key={i}>{getPlayerName(playersById, ids[i])}</div>
          ))}
        </div>
        <div className="col medium">
          <label>Seat Wind</label>
          {rows.map((i) => (
            <div key={i}>
              <select value={seats[i]} onChange={(e) => set(seats, setSeats, i, Number(e.target.value))}>
                {WIND_NAMES.map((w, wi) => (
                  <option key={w} value={wi}>{w}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="col medium">
          <label>Points</label>
          {rows.map((i) => (
            <div key={i}><NumericInput value={points[i]} onChange={(v) => set(points, setPoints, i, v)} /></div>
          ))}
        </div>
        {settings.shuugi && (
          <div className="col narrow">
            <label>Shuugi</label>
            {rows.map((i) => (
              <div key={i}><NumericInput value={shuugi[i]} onChange={(v) => set(shuugi, setShuugi, i, v)} /></div>
            ))}
          </div>
        )}
        <div className="col narrow">
          <label>Penalty</label>
          {rows.map((i) => (
            <div key={i}><NumericInput value={penalties[i]} onChange={(v) => set(penalties, setPenalties, i, v)} /></div>
          ))}
        </div>
        <div className="col medium">
          <label>Score</label>
          {rows.map((i) => (
            <div key={i}><input type="text" readOnly value={scores.length ? formatScore(scores[i], settings) : ''} /></div>
          ))}
        </div>
      </div>

      <div className="missing">
        <span>Missing Points</span>
        <span className={missingPoints !== 0 ? 'red' : ''}>{missingPoints}</span>
        {settings.shuugi && (
          <>
            <span>Missing Shuugi</span>
            <span className={missingShuugi !== 0 ? 'red' : ''}>{missingShuugi}</span>
          </>
        )}
      </div>

      <div className="btn-row">
        <button
          title="Change players or seats and clear the scores, so the hanchan can be played again."
          onClick={() =>
            onSubmit(
              newTable({ ...table, playerIds: ids, playerSeats: seats, finalPoints: [], finalShuugi: [], penalties: [], leftOverKyotaku: 0 }),
            )
          }
        >
          Modify Table
        </button>
        <button className="primary" onClick={() => onSubmit(draft)}>Submit Scores</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
