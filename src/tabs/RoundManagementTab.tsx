import { useState } from 'react';
import { NumericInput } from '../components/NumericInput';
import { toast } from '../components/Toaster';
import { PlayerList } from '../components/PlayerList';
import { generatePairings, PairingResult } from '../core/pairing';
import { isComplete } from '../core/scoring';
import { roundDeleteBlocker } from '../core/tournament';
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
  const cutLevels = useStore((s) => s.cutLevels);
  const playersById = useStore((s) => s.playersById);
  const addRound = useStore((s) => s.addRound);
  const startRound = useStore((s) => s.startRound);
  const deleteRound = useStore((s) => s.deleteRound);
  const settings = tournament.settings;

  const [avoidDuplicates, setAvoidDuplicates] = useState(true);
  const [assignWinds, setAssignWinds] = useState(settings.assignSeatWinds);
  const [assignSubs, setAssignSubs] = useState(true);
  // Survives tab switches via the store; otherwise starts from the most recent round's value.
  const storedBlocks = useStore((s) => s.pairingBlocks);
  const setSwissBlocks = useStore((s) => s.setPairingBlocks);
  const lastRoundBlocks = tournament.roundPairingBlocks[tournament.nextRound - 1];
  const swissBlocks = storedBlocks ?? lastRoundBlocks ?? 1;
  const [roundTime, setRoundTime] = useState(settings.timePerRoundMinutes);
  const [pairings, setPairings] = useState<PairingResult | null>(null);

  const activeTables = tournament.tables.filter((t) => !isComplete(t, settings)).length;

  const rounds = Array.from({ length: tournament.nextRound - 1 }, (_, i) => {
    const round = i + 1;
    const tables = tournament.tables.filter((t) => t.roundId === round);
    return {
      round,
      blocks: tournament.roundPairingBlocks[round],
      complete: tables.every((t) => isComplete(t, settings)),
      scoredTables: tables.filter((t) => t.finalPoints.length > 0).length,
      deleteBlocker: roundDeleteBlocker(tournament, round),
    };
  });

  const confirmDelete = (r: (typeof rounds)[number]) => {
    const scoredWarning =
      r.scoredTables > 0
        ? `

${r.scoredTables} table${r.scoredTables === 1 ? ' has' : 's have'} scores entered, which will also be deleted.`
        : '';
    if (!window.confirm(`Delete Round ${r.round}'s pairings? This can't be undone.${scoredWarning}`)) return;
    const error = deleteRound(r.round);
    if (error) toast(error, { error: true });
    else toast(`Round ${r.round} pairings deleted. Create new pairings to replace it.`);
  };

  const create = () => {
    setPairings(
      generatePairings({
        registered: tournament.registeredPlayers,
        scores,
        cutLevels,
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
                  addRound(pairings.tables, swissBlocks);
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
            {rounds.length > 0 && (
              <>
                <hr className="divider" />
                <div className="round-summary pad-sides">
                  {rounds.map((r) => (
                    <div key={r.round} className="round-line">
                      <span>
                        Round {r.round}: Pairing Blocks ({r.blocks ?? '?'}) -{' '}
                        <span className={r.complete ? 'muted' : 'active-round'}>{r.complete ? 'Complete' : 'Active'}</span>
                      </span>
                      {!r.complete && (
                        <button
                          className="small danger"
                          disabled={r.deleteBlocker !== null}
                          title={r.deleteBlocker ?? `Delete Round ${r.round}'s pairings`}
                          onClick={() => confirmDelete(r)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="spacer" />
      </div>
    </div>
  );
}
