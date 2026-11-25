import { useState } from 'react';
import { versionLabel } from '../buildInfo';
import { NumericInput } from '../components/NumericInput';
import { toast } from '../components/Toaster';
import { playersCsv, tablesCsv } from '../core/csv';
import { saveTextAs, snakeCase } from '../core/format';
import { serializeTournament } from '../core/serialize';
import { applySheetScores, buildExportPayload, exportToSheets, fetchSheetScores } from '../core/sheets';
import { Cut, ScoreModification } from '../core/types';
import { useStore } from '../store/store';

type Panel = 'none' | 'cutCreate' | 'cutManage' | 'sheets' | 'csv';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <div className="label" style={{ paddingLeft: 0 }}>{label}</div>
      <div className="value">{children}</div>
    </div>
  );
}

function CutCreation({ onDone }: { onDone: () => void }) {
  const tournament = useStore((s) => s.tournament);
  const createCut = useStore((s) => s.createCut);

  const maxRoundPresent = tournament.nextRound - 1;
  const maxCutRound = Math.max(0, ...tournament.cuts.map((c) => c.endRound));

  const [playerCount, setPlayerCount] = useState(8);
  const [modification, setModification] = useState<ScoreModification>(ScoreModification.None);
  const [remainingContinue, setRemainingContinue] = useState(false);
  const [tieError, setTieError] = useState(false);

  if (maxCutRound >= maxRoundPresent) {
    return (
      <div className="error-box">
        <div>Not enough rounds to create a cut!</div>
        <button onClick={onDone}>I Understand</button>
      </div>
    );
  }

  if (tieError) {
    return (
      <div className="error-box">
        <div>
          Due to ties, too many players were added to the cut.
          <br />
          Manually resolve tiebreaks via the Player Management tab before continuing.
        </div>
        <button onClick={onDone}>I Understand</button>
      </div>
    );
  }

  return (
    <div className="stack">
      <Row label="Cut Start Round"><NumericInput value={maxCutRound + 1} onChange={() => {}} readOnly /></Row>
      <Row label="Cut End Round"><NumericInput value={maxRoundPresent} onChange={() => {}} readOnly /></Row>
      <Row label="Player Count"><NumericInput value={playerCount} onChange={(v) => setPlayerCount(Math.trunc(v))} /></Row>
      <Row label="Score Modification">
        <select value={modification} onChange={(e) => setModification(Number(e.target.value))}>
          <option value={ScoreModification.None}>None</option>
          <option value={ScoreModification.Halved}>Halved</option>
          <option value={ScoreModification.Zero}>Zeroed</option>
        </select>
      </Row>
      <Row label="Remaining Players Continue">
        <input
          type="checkbox"
          checked={remainingContinue}
          onChange={(e) => setRemainingContinue(e.target.checked)}
          title="Players who miss the cut keep playing, with their scores unchanged. Players who make the cut always rank above them."
        />
      </Row>
      <div className="btn-row">
        <button
          className="primary"
          onClick={() => {
            const cut: Cut = {
              playerCount,
              scoreModification: modification,
              startRound: maxCutRound + 1,
              endRound: maxRoundPresent,
              tiebreakPriority: [],
              remainingContinue,
            };
            if (createCut(cut)) setTieError(true);
            else onDone();
          }}
        >
          Confirm
        </button>
        <button onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

const MODIFICATION_LABEL = { [ScoreModification.None]: 'None', [ScoreModification.Halved]: 'Halved', [ScoreModification.Zero]: 'Zero' };

function CutManagement({ onDone }: { onDone: () => void }) {
  const cuts = useStore((s) => s.tournament.cuts);
  const deleteCut = useStore((s) => s.deleteCut);
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="tree">
        <table>
          <thead>
            <tr><th>Player Count</th><th>Score Modification</th><th>Rounds</th><th>Remaining Continue</th></tr>
          </thead>
          <tbody>
            {cuts.map((cut, i) => (
              <tr key={i} className={`selectable ${selected === i ? 'selected' : ''}`} onClick={() => setSelected(i)}>
                <td>{cut.playerCount}</td>
                <td>{MODIFICATION_LABEL[cut.scoreModification]}</td>
                <td>{cut.startRound}-{cut.endRound}</td>
                <td>{cut.remainingContinue ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="stack" style={{ paddingTop: 10 }}>
        <button
          disabled={selected === null}
          onClick={() => {
            if (selected !== null) {
              deleteCut(selected);
              setSelected(null);
            }
          }}
        >
          Delete Cut
        </button>
        <button onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

/** Asks for a file name and saves, confirming or reporting errors with a toast. */
async function saveWithToast(...args: Parameters<typeof saveTextAs>) {
  try {
    const name = await saveTextAs(...args);
    if (name) toast(`Saved ${name}.`);
  } catch (e) {
    toast(`Could not save the file: ${(e as Error).message}`, { error: true });
  }
}

function CsvExport({ onDone }: { onDone: () => void }) {
  const tournament = useStore((s) => s.tournament);
  const [view, setView] = useState<'players' | 'tables'>('players');
  const text = view === 'players' ? playersCsv(tournament) : tablesCsv(tournament);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 8 }}>
      <select value={view} onChange={(e) => setView(e.target.value as 'players' | 'tables')}>
        <option value="players">Players</option>
        <option value="tables">Tables</option>
      </select>
      <textarea style={{ flex: 1 }} readOnly value={text} />
      <div className="btn-row" style={{ marginTop: 0 }}>
        <button onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
        <button
          onClick={() =>
            saveWithToast(`${snakeCase(tournament.name) || 'tournament'}_${view}.csv`, text, {
              mime: 'text/csv',
              extension: '.csv',
              description: 'CSV file',
            })
          }
        >
          Download .csv
        </button>
        <button onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

function GoogleSheets({ onDone }: { onDone: () => void }) {
  const tournament = useStore((s) => s.tournament);
  const scores = useStore((s) => s.scores);
  const cutLevels = useStore((s) => s.cutLevels);
  const cutOut = useStore((s) => s.cutOut);
  const playersById = useStore((s) => s.playersById);
  const setScriptId = useStore((s) => s.setScriptId);
  const replaceTables = useStore((s) => s.replaceTables);

  const [busy, setBusy] = useState(false);
  const scriptId = tournament.settings.scriptId;

  const run = async (job: () => Promise<string>) => {
    setBusy(true);
    try {
      toast(await job());
    } catch (e) {
      toast(
        e instanceof TypeError
          ? 'The request failed or was blocked by the browser. Check the deployment ID and that the web app is deployed with access set to "Anyone". If you were exporting, the data may or may not have arrived.'
          : (e as Error).message,
        { error: true },
      );
    } finally {
      setBusy(false);
    }
  };

  const doExport = () =>
    run(() => exportToSheets(scriptId, buildExportPayload(tournament, scores, playersById, cutLevels, cutOut)));

  const doImport = () =>
    run(async () => {
      const data = await fetchSheetScores(scriptId, tournament);
      const result = applySheetScores(data, tournament);
      if (!result.ok) throw new Error(result.error);
      replaceTables(result.tables);
      return 'Scores successfully imported from spreadsheet.';
    });

  return (
    <div className="stack">
      <Row label="Google Apps Deployment ID">
        <input type="text" value={scriptId} onChange={(e) => setScriptId(e.target.value)} />
      </Row>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <button onClick={doExport} disabled={busy || !scriptId.trim()}>Export Standings and Pairings</button>
        <button onClick={doImport} disabled={busy || !scriptId.trim()}>Import Scores</button>
      </div>
      <button onClick={onDone}>Cancel</button>
    </div>
  );
}

export function TournamentManagementTab() {
  const tournament = useStore((s) => s.tournament);
  const [panel, setPanel] = useState<Panel>('none');
  const close = () => setPanel('none');

  const save = () =>
    saveWithToast(
      `${snakeCase(tournament.name) || 'tournament'}.tmnt`,
      JSON.stringify(serializeTournament(tournament), null, 2),
      { mime: 'application/json', extension: '.tmnt', description: 'Tournament save file' },
    );

  return (
    <div className="split">
      <div className="pane">
        <div className="spacer" />
        <div className="stack">
          <button onClick={() => setPanel('cutCreate')}>Cut to Top Players</button>
          <button onClick={() => setPanel('cutManage')}>Manage Cuts</button>
          <button onClick={() => setPanel('sheets')}>Import/Export From Google Sheets</button>
          <button onClick={save}>Save Tournament Data to File</button>
          <button onClick={() => setPanel('csv')}>Export Tournament Data to CSV</button>
        </div>
        <div className="spacer" />
        <div className="version">{versionLabel()}</div>
      </div>

      <div className="pane" style={{ justifyContent: panel === 'csv' || panel === 'cutManage' ? 'flex-start' : 'center' }}>
        {panel === 'cutCreate' && <CutCreation onDone={close} />}
        {panel === 'cutManage' && <CutManagement onDone={close} />}
        {panel === 'sheets' && <GoogleSheets onDone={close} />}
        {panel === 'csv' && <CsvExport onDone={close} />}
      </div>
    </div>
  );
}
