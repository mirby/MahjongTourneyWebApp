import { useRef, useState } from 'react';
import { deserializeTournament } from '../core/serialize';
import { Tournament } from '../core/types';
import { loadAutosave } from '../store/store';

interface Props {
  onCreate: () => void;
  onLoad: (t: Tournament) => void;
}

export function MainMenu({ onCreate, onLoad }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [autosave] = useState(() => loadAutosave());

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      onLoad(deserializeTournament(JSON.parse(await file.text())));
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "That file isn't readable. Tournament files saved by the old Godot version can't be opened here; only files saved from this web version."
          : (e as Error).message,
      );
    }
  };

  return (
    <div className="screen">
      <div className="center-col">
        <h1>Mahjong Tournament Tool</h1>
        <button className="primary" onClick={onCreate}>Create New Tournament</button>
        <button onClick={() => fileInput.current?.click()}>Load From File</button>
        {autosave && (
          <button onClick={() => onLoad(autosave)}>
            Continue “{autosave.name || 'Untitled'}” (autosaved in this browser)
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".tmnt,.json,application/json"
          hidden
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {error && <div className="note red">{error}</div>}
      </div>
    </div>
  );
}
