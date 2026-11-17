import { useState } from 'react';
import { HanchanList } from '../components/HanchanList';
import { PlayerList } from '../components/PlayerList';
import { ScoreInput } from '../components/ScoreInput';
import { newTable, tableSize, WIND_NAMES } from '../core/types';
import { getPlayerName, useStore } from '../store/store';

/** Manually create a hanchan that isn't part of a numbered round. */
function HanchanCreation({ onDone }: { onDone: () => void }) {
  const tournament = useStore((s) => s.tournament);
  const playersById = useStore((s) => s.playersById);
  const addSingleTable = useStore((s) => s.addSingleTable);
  const size = tableSize(tournament.settings);
  const maxId = Math.max(0, ...Object.keys(playersById).map(Number));

  const tableId = Math.max(0, ...tournament.tables.filter((t) => t.roundId === 0).map((t) => t.tableId)) + 1;
  const [ids, setIds] = useState<number[]>(() => new Array(size).fill(0));
  const [seats, setSeats] = useState<number[]>(() => Array.from({ length: size }, (_, i) => i));

  const rows = Array.from({ length: size }, (_, i) => i);
  const update = (arr: number[], setter: (a: number[]) => void, i: number, v: number) => {
    const next = [...arr];
    next[i] = v;
    setter(next);
  };

  return (
    <div>
      <div style={{ padding: '0 5px 10px' }}>Table {tableId}</div>
      <div className="scorer">
        <div className="col narrow">
          <label>Player ID</label>
          {rows.map((i) => (
            <div key={i}>
              <input
                type="number"
                min={0}
                max={maxId}
                value={ids[i]}
                onChange={(e) => update(ids, setIds, i, Math.max(0, Math.min(maxId, Math.trunc(Number(e.target.value) || 0))))}
              />
            </div>
          ))}
        </div>
        <div className="col grow">
          <label>Name</label>
          {rows.map((i) => <div key={i}>{getPlayerName(playersById, ids[i])}</div>)}
        </div>
        <div className="col medium">
          <label>Seat Wind</label>
          {rows.map((i) => (
            <div key={i}>
              <select value={seats[i]} onChange={(e) => update(seats, setSeats, i, Number(e.target.value))}>
                {WIND_NAMES.map((w, wi) => <option key={w} value={wi}>{w}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
      <div className="btn-row">
        <button
          className="primary"
          onClick={() => {
            addSingleTable(newTable({ roundId: 0, tableId, playerIds: ids, playerSeats: seats }));
            onDone();
          }}
        >
          Create Hanchan
        </button>
        <button onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

export function HanchanHistoryTab() {
  const tournament = useStore((s) => s.tournament);
  const scores = useStore((s) => s.scores);
  const playersById = useStore((s) => s.playersById);
  const updateTable = useStore((s) => s.updateTable);

  const [roundFilter, setRoundFilter] = useState(-1);
  const [selected, setSelected] = useState<{ roundId: number; tableId: number } | null>(null);
  const [creating, setCreating] = useState(false);

  const maxRound = tournament.nextRound - 1;
  const selectedTable = selected
    ? tournament.tables.find((t) => t.roundId === selected.roundId && t.tableId === selected.tableId)
    : undefined;

  return (
    <div className="split">
      <div className="pane">
        <h3>Hanchan Record</h3>
        <div className="row" style={{ paddingBottom: 8 }}>
          <span>Round:</span>
          <select style={{ width: 160 }} value={roundFilter} onChange={(e) => setRoundFilter(Number(e.target.value))}>
            <option value={-1}>-</option>
            <option value={0}>None</option>
            {Array.from({ length: maxRound }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </div>

        {creating ? (
          <PlayerList players={tournament.registeredPlayers} scores={scores} settings={tournament.settings} />
        ) : (
          <HanchanList
            tables={tournament.tables}
            settings={tournament.settings}
            playersById={playersById}
            roundFilter={roundFilter}
            selected={selected}
            onSelect={(roundId, tableId) => setSelected({ roundId, tableId })}
          />
        )}

        {!creating && !selectedTable && (
          <button style={{ marginTop: 10 }} onClick={() => setCreating(true)}>Manual Hanchan Creation</button>
        )}
      </div>

      <div className="pane">
        <div className="spacer" />
        {creating && <HanchanCreation onDone={() => setCreating(false)} />}
        {selectedTable && !creating && (
          <ScoreInput
            key={`${selectedTable.roundId}-${selectedTable.tableId}`}
            table={selectedTable}
            onSubmit={(t) => {
              updateTable(t);
              setSelected(null);
            }}
            onCancel={() => setSelected(null)}
          />
        )}
        <div className="spacer" />
      </div>
    </div>
  );
}
