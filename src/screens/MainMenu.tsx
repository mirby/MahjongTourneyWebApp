import { useRef, useState } from 'react';
import { versionLabel } from '../buildInfo';
import { parseSaveFile } from '../core/serialize';
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
      onLoad(parseSaveFile(await file.arrayBuffer()));
    } catch (e) {
      setError(
        e instanceof SyntaxError ? "That file isn't a readable tournament save." : (e as Error).message,
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
        <div className="version">{versionLabel()}</div>
      </div>
    </div>
  );
}
