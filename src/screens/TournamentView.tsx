import { useState } from 'react';
import { CountdownTimer } from '../components/CountdownTimer';
import { useStore } from '../store/store';
import { HanchanHistoryTab } from '../tabs/HanchanHistoryTab';
import { PlayerManagementTab } from '../tabs/PlayerManagementTab';
import { RoundManagementTab } from '../tabs/RoundManagementTab';
import { StandingsTab } from '../tabs/StandingsTab';
import { TournamentManagementTab } from '../tabs/TournamentManagementTab';

const TABS = [
  { title: 'Standings', render: () => <StandingsTab /> },
  { title: 'Hanchan History', render: () => <HanchanHistoryTab /> },
  { title: 'Round Management', render: () => <RoundManagementTab /> },
  { title: 'Player Management', render: () => <PlayerManagementTab /> },
  { title: 'Tournament Management', render: () => <TournamentManagementTab /> },
];

export function TournamentView() {
  const name = useStore((s) => s.tournament.name);
  const close = useStore((s) => s.closeTournament);
  const [tab, setTab] = useState(0);

  return (
    <div className="screen">
      <div className="header">
        <div className="title">{name}</div>
        <span className="muted">Time Until Round End:</span>
        <CountdownTimer />
        <button
          onClick={() => {
            if (confirm('Return to the main menu? Your tournament is autosaved in this browser, but use "Save Tournament Data to File" for a backup.')) close();
          }}
        >
          Main Menu
        </button>
      </div>

      <div className="tabs">
        {TABS.map((t, i) => (
          <button key={t.title} className={`tab ${i === tab ? 'active' : ''}`} onClick={() => setTab(i)}>
            {t.title}
          </button>
        ))}
      </div>

      <div className="tab-body">{TABS[tab].render()}</div>
    </div>
  );
}
