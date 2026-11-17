import { useState } from 'react';
import { HanchanList } from '../components/HanchanList';
import { PlayerList } from '../components/PlayerList';
import { useStore } from '../store/store';

export function StandingsTab() {
  const tournament = useStore((s) => s.tournament);
  const scores = useStore((s) => s.scores);
  const playersById = useStore((s) => s.playersById);
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="split">
      <div className="pane">
        <PlayerList
          players={tournament.registeredPlayers}
          scores={scores}
          settings={tournament.settings}
          selectedId={selected}
          onSelect={setSelected}
        />
      </div>
      <div className="pane">
        <HanchanList
          tables={tournament.tables}
          settings={tournament.settings}
          playersById={playersById}
          playerFilter={selected}
        />
      </div>
    </div>
  );
}
