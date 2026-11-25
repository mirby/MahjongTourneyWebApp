import { useMemo, useState } from 'react';
import { HanchanList } from '../components/HanchanList';
import { PlayerList } from '../components/PlayerList';
import { computeStandings, standingScores, standingsPlayers } from '../core/standings';
import { useStore } from '../store/store';

export function StandingsTab() {
  const tournament = useStore((s) => s.tournament);
  const scores = useStore((s) => s.scores);
  const cutLevels = useStore((s) => s.cutLevels);
  const cutOut = useStore((s) => s.cutOut);
  const playersById = useStore((s) => s.playersById);
  const [selected, setSelected] = useState<number | null>(null);
  // Players removed by a cut stay on the standings, frozen at their score from that cut.
  const players = useMemo(() => standingsPlayers(tournament, cutOut), [tournament, cutOut]);
  const shownScores = useMemo(() => standingScores(scores, cutOut), [scores, cutOut]);
  const standings = useMemo(
    () => computeStandings(players, scores, tournament.tables, tournament.settings, cutLevels, cutOut),
    [players, scores, tournament.tables, tournament.settings, cutLevels, cutOut],
  );

  return (
    <div className="split">
      <div className="pane">
        <PlayerList
          players={players}
          scores={shownScores}
          settings={tournament.settings}
          selectedId={selected}
          onSelect={setSelected}
          standings={standings}
          defaultSort={{ key: 'rank', asc: true }}
          mutedIds={cutOut}
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
