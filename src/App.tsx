import { useEffect, useState } from 'react';
import { Tournament } from './core/types';
import { MainMenu } from './screens/MainMenu';
import { SettingsPreview } from './screens/SettingsPreview';
import { TournamentSetup } from './screens/TournamentSetup';
import { TournamentView } from './screens/TournamentView';
import { useStore } from './store/store';

type Screen = { name: 'menu' } | { name: 'setup' } | { name: 'preview'; tournament: Tournament };

export function App() {
  const active = useStore((s) => s.active);
  const tournamentName = useStore((s) => s.tournament.name);
  const loadTournament = useStore((s) => s.loadTournament);
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });

  useEffect(() => {
    document.title = active && tournamentName ? tournamentName : 'Mahjong Tournament Tool';
  }, [active, tournamentName]);

  if (active) return <TournamentView />;

  switch (screen.name) {
    case 'menu':
      return <MainMenu onCreate={() => setScreen({ name: 'setup' })} onLoad={loadTournament} />;
    case 'setup':
      return (
        <TournamentSetup
          onBack={() => setScreen({ name: 'menu' })}
          onPreview={(tournament) => setScreen({ name: 'preview', tournament })}
        />
      );
    case 'preview':
      return (
        <SettingsPreview
          tournament={screen.tournament}
          onConfirm={() => {
            loadTournament(screen.tournament);
            // So that closing the tournament later lands on the menu, not this preview again.
            setScreen({ name: 'menu' });
          }}
          onCancel={() => setScreen({ name: 'setup' })}
        />
      );
  }
}
