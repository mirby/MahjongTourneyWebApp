import { useMemo, useState } from 'react';
import { HanchanList } from '../components/HanchanList';
import { PlayerList } from '../components/PlayerList';
import { computeStandings } from '../core/standings';
import { useStore } from '../store/store';

export function StandingsTab() {
  const tournament = useStore((s) => s.tournament);
  const scores = useStore((s) => s.scores);
  const cutLevels = useStore((s) => s.cutLevels);
  const playersById = useStore((s) => s.playersById);
  const [selected, setSelected] = useState<number | null>(null);
  const standings = useMemo(
    () => computeStandings(tournament.registeredPlayers, scores, tournament.tables, tournament.settings, cutLevels),
    [tournament.registeredPlayers, scores, tournament.tables, tournament.settings, cutLevels],
  );

  return (
    <div className="split">
      <div className="pane">
        <PlayerList
          players={tournament.registeredPlayers}
          scores={scores}
          settings={tournament.settings}
          selectedId={selected}
          onSelect={setSelected}
          standings={standings}
          defaultSort={{ key: 'rank', asc: true }}
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
