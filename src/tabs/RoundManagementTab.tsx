import { useState } from 'react';
import { NumericInput } from '../components/NumericInput';
import { PlayerList } from '../components/PlayerList';
import { generatePairings, PairingResult } from '../core/pairing';
import { isComplete } from '../core/scoring';
import { tableSize, WIND_NAMES } from '../core/types';
import { getPlayerName, useStore } from '../store/store';

function Setting({ label, children, red }: { label: string; children: React.ReactNode; red?: boolean }) {
  return (
    <div className="row">
      <div className={`label ${red ? 'red' : ''}`}>{label}</div>
      <div className="value">{children}</div>
    </div>
  );
}

export function RoundManagementTab() {
  const tournament = useStore((s) => s.tournament);
  const scores = useStore((s) => s.scores);
  const playersById = useStore((s) => s.playersById);
  const addRound = useStore((s) => s.addRound);
  const startRound = useStore((s) => s.startRound);
  const settings = tournament.settings;

  const [avoidDuplicates, setAvoidDuplicates] = useState(true);
  const [assignWinds, setAssignWinds] = useState(settings.assignSeatWinds);
  const [assignSubs, setAssignSubs] = useState(true);
  const [swissBlocks, setSwissBlocks] = useState(1);
  const [roundTime, setRoundTime] = useState(settings.timePerRoundMinutes);
  const [pairings, setPairings] = useState<PairingResult | null>(null);

  const activeTables = tournament.tables.filter((t) => !isComplete(t, settings)).length;

  const create = () => {
    setPairings(
      generatePairings({
        registered: tournament.registeredPlayers,
        scores,
        existingTables: tournament.tables,
        tableSize: tableSize(settings),
        settings: {
          avoidDuplicates,
          assignSeatWinds: assignWinds,
          assignSubs,
          swissBlocks,
          timePerRoundMinutes: roundTime,
        },
      }),
    );
  };

  return (
    <div className="split">
      <div className="pane">
        {pairings ? (
          <>
            <h3>Round Pairings</h3>
            <div className="tree">
              <table>
                <thead>
                  <tr><th>Player ID</th><th>Player Name</th><th>Seat Wind</th></tr>
                </thead>
                <tbody>
                  {pairings.tables.map((table) => [
                    <tr key={`t${table.tableId}`} className="group"><td colSpan={3}>Table {table.tableId}</td></tr>,
                    ...table.playerIds.map((id, i) => (
                      <tr key={`t${table.tableId}-${i}`} className="child">
                        <td>{id}</td>
                        <td>{getPlayerName(playersById, id)}</td>
                        <td>{table.playerSeats.length ? WIND_NAMES[table.playerSeats[i]] : ''}</td>
                      </tr>
                    )),
                  ])}
                  {pairings.byes.length > 0 && [
                    <tr key="byes" className="group"><td colSpan={3}>Byes</td></tr>,
                    ...pairings.byes.map((id) => (
                      <tr key={`bye-${id}`} className="child">
                        <td>{id}</td>
                        <td>{getPlayerName(playersById, id)}</td>
                        <td />
                      </tr>
                    )),
                  ]}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <h3>Active Players</h3>
            <PlayerList players={tournament.registeredPlayers} scores={scores} settings={settings} />
          </>
        )}
      </div>

      <div className="pane">
        <div className="spacer" />

        {pairings ? (
          <>
            {pairings.duplicateCount > 0 && (
              <div className="stack" style={{ marginBottom: 12 }}>
                <div className="pad-sides">
                  There are <span className="red">{pairings.duplicateCount}</span> tables with duplicate pairings.
                </div>
                <button onClick={create}>Reshuffle</button>
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 0 }}>
              <button
                className="primary"
                onClick={() => {
                  addRound(pairings.tables);
                  setPairings(null);
                }}
              >
                Confirm Pairings
              </button>
              <button onClick={() => setPairings(null)}>Cancel</button>
            </div>
          </>
        ) : (
          <div className="stack">
            {activeTables > 0 && (
              <Setting label="Active Tables"><span className="red">{activeTables}</span></Setting>
            )}
            <Setting label="Minimize Duplicate Pairings">
              <input type="checkbox" checked={avoidDuplicates} onChange={(e) => setAvoidDuplicates(e.target.checked)} />
            </Setting>
            <Setting label="Assign Seat Winds">
              <input type="checkbox" checked={assignWinds} onChange={(e) => setAssignWinds(e.target.checked)} />
            </Setting>
            <Setting label="Assign Substitutes for Uneven Pairings">
              <input type="checkbox" checked={assignSubs} onChange={(e) => setAssignSubs(e.target.checked)} />
            </Setting>
            <Setting label="Pairing Blocks">
              <NumericInput value={swissBlocks} onChange={(v) => setSwissBlocks(Math.max(1, Math.trunc(v)))} />
            </Setting>
            <button onClick={create} disabled={tournament.registeredPlayers.length === 0}>Create Pairings</button>
            <Setting label="Round Time (Minutes)">
              <NumericInput value={roundTime} onChange={setRoundTime} />
            </Setting>
            <button onClick={() => startRound(Math.trunc(roundTime) * 60)}>Start Round</button>
          </div>
        )}

        <div className="spacer" />
      </div>
    </div>
  );
}
