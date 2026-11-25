import { useState } from 'react';
import { PlayerList } from '../components/PlayerList';
import { Player } from '../core/types';
import { useStore } from '../store/store';

export function PlayerManagementTab() {
  const tournament = useStore((s) => s.tournament);
  const scores = useStore((s) => s.scores);
  const playersById = useStore((s) => s.playersById);
  const activatePlayer = useStore((s) => s.activatePlayer);
  const deactivatePlayer = useStore((s) => s.deactivatePlayer);
  const updateInactivePlayers = useStore((s) => s.updateInactivePlayers);
  const addInactivePlayer = useStore((s) => s.addInactivePlayer);

  const [activeSel, setActiveSel] = useState<number | null>(null);
  const [inactiveSel, setInactiveSel] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  const editInactive = (updated: Player) =>
    updateInactivePlayers(tournament.inactivePlayers.map((p) => (p.id === updated.id ? updated : p)));

  const addPlayer = () => {
    const nextId = Math.max(0, ...Object.keys(playersById).map(Number)) + 1;
    addInactivePlayer({ id: nextId, name: `Freed Jyanshi ${nextId}`, affiliation: 'Mahjong Club' });
  };

  return (
    <div className="split">
      <div className="pane">
        <h3>Active Players</h3>
        <PlayerList
          players={tournament.registeredPlayers}
          scores={scores}
          settings={tournament.settings}
          selectedId={activeSel}
          onSelect={setActiveSel}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
        <button
          style={{ width: 50, height: 50, fontSize: 28, padding: 0 }}
          title="Make the selected inactive player active"
          disabled={inactiveSel === null}
          onClick={() => {
            if (inactiveSel !== null) {
              activatePlayer(inactiveSel);
              setInactiveSel(null);
            }
          }}
        >
          ←
        </button>
        <button
          style={{ width: 50, height: 50, fontSize: 28, padding: 0 }}
          title="Make the selected active player inactive"
          disabled={activeSel === null}
          onClick={() => {
            if (activeSel !== null) {
              deactivatePlayer(activeSel);
              setActiveSel(null);
            }
          }}
        >
          →
        </button>
      </div>

      <div className="pane">
        <h3>Inactive Players</h3>
        <PlayerList
          players={tournament.inactivePlayers}
          scores={scores}
          settings={tournament.settings}
          selectedId={inactiveSel}
          onSelect={setInactiveSel}
          editable={editing}
          onEdit={editInactive}
        />
        <div className="stack" style={{ paddingTop: 10 }}>
          {editing && <button onClick={addPlayer}>Add Player</button>}
          <button onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit Players'}</button>
        </div>
      </div>
    </div>
  );
}
