import { useState } from 'react';
import { NumericInput } from '../components/NumericInput';
import { UmaInputs } from '../components/UmaInputs';
import {
  defaultSettings,
  GameType,
  newTournament,
  Player,
  RiichiSticksStrategy,
  Tournament,
  TiebreakStrategy,
  UmaType,
} from '../core/types';

interface Props {
  onBack: () => void;
  onPreview: (t: Tournament) => void;
}

const DEFAULT_NAME = 'Freed Jyanshi';
const DEFAULT_AFFILIATION = 'Mahjong Club';

const YONMA_UMA = {
  fixed: [30, 10, -10, -30],
  floating1: [15, 5, -5, -15],
  floating2: [15, 5, 0, -20],
  floating3: [20, 0, -5, -15],
  oka: [20, 0, 0, 0],
};
const SANMA_UMA = {
  fixed: [30, 0, -30],
  floating1: [30, 0, -30],
  floating2: [20, 10, -30],
  floating3: [20, 0, -5, -15], // unused in sanma
  oka: [20, 0, 0],
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <div className="label">{label}</div>
      <div className="value">{children}</div>
    </div>
  );
}

export function TournamentSetup({ onBack, onPreview }: Props) {
  const d = defaultSettings();
  const [name, setName] = useState('My Awesome Mahjong Tournament');
  const [gameType, setGameType] = useState<GameType>(GameType.Yonma);
  const [umaType, setUmaType] = useState<UmaType>(UmaType.Fixed);
  const [fixedUma, setFixedUma] = useState(YONMA_UMA.fixed);
  const [floating1, setFloating1] = useState(YONMA_UMA.floating1);
  const [floating2, setFloating2] = useState(YONMA_UMA.floating2);
  const [floating3, setFloating3] = useState(YONMA_UMA.floating3);
  const [tiebreak, setTiebreak] = useState<TiebreakStrategy>(TiebreakStrategy.Split);
  const [wrcTiebreaks, setWrcTiebreaks] = useState(d.wrcTiebreaks);
  const [startPoints, setStartPoints] = useState(d.startPoints);
  const [returnPoints, setReturnPoints] = useState(d.returnPoints);
  const [oka, setOka] = useState(YONMA_UMA.oka);
  const [roundTime, setRoundTime] = useState(d.timePerRoundMinutes);
  const [riichiSticks, setRiichiSticks] = useState<RiichiSticksStrategy>(d.riichiSticksStrategy);
  const [assignWinds, setAssignWinds] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [scorePerThousand, setScorePerThousand] = useState(d.scorePerThousandPoints);
  const [shuugi, setShuugi] = useState(false);
  const [shuugiStart, setShuugiStart] = useState(d.startShuugi);
  const [shuugiEnd, setShuugiEnd] = useState(d.endShuugi);
  const [scorePerShuugi, setScorePerShuugi] = useState(d.scorePerShuugi);

  const [players, setPlayers] = useState<Player[]>([]);
  const [csvMode, setCsvMode] = useState(false);
  const [csv, setCsv] = useState('');

  const umaCount = gameType === GameType.Yonma ? 4 : 3;
  const yonma = gameType === GameType.Yonma;

  const switchGameType = (next: GameType) => {
    const u = next === GameType.Yonma ? YONMA_UMA : SANMA_UMA;
    setGameType(next);
    setFixedUma(u.fixed);
    setFloating1(u.floating1);
    setFloating2(u.floating2);
    setFloating3(u.floating3);
    setOka(u.oka);
  };

  const addPlayer = () =>
    setPlayers((ps) => [...ps, { id: ps.length + 1, name: `${DEFAULT_NAME} ${ps.length + 1}`, affiliation: DEFAULT_AFFILIATION }]);

  const importCsv = () => {
    const added: Player[] = [];
    for (const line of csv.split(/\r?\n/)) {
      if (line.trim() === '') continue;
      const [playerName, ...rest] = line.split(',');
      added.push({
        id: players.length + added.length + 1,
        name: playerName.trim(),
        affiliation: rest.join(',').trim(),
      });
    }
    setPlayers([...players, ...added]);
    setCsv('');
    setCsvMode(false);
  };

  const editPlayer = (id: number, patch: Partial<Player>) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // IDs are just 1..N, so renumber after a deletion.
  const removePlayer = (id: number) =>
    setPlayers((ps) => ps.filter((p) => p.id !== id).map((p, i) => ({ ...p, id: i + 1 })));

  const start = () => {
    const t = newTournament();
    t.name = name;
    t.settings = {
      ...defaultSettings(),
      gameType,
      umaType,
      fixedUma,
      floatingUma1: floating1,
      floatingUma2: floating2,
      floatingUma3: floating3,
      tiebreakStrategy: tiebreak,
      wrcTiebreaks,
      startPoints,
      returnPoints,
      oka,
      timePerRoundMinutes: roundTime,
      assignSeatWinds: advanced && assignWinds,
      riichiSticksStrategy: riichiSticks,
      advancedSettings: advanced,
      scorePerThousandPoints: advanced ? scorePerThousand : 1,
      shuugi: advanced && shuugi,
      startShuugi: advanced && shuugi ? shuugiStart : d.startShuugi,
      endShuugi: advanced && shuugi ? shuugiEnd : d.endShuugi,
      scorePerShuugi: advanced && shuugi ? scorePerShuugi : d.scorePerShuugi,
    };
    t.registeredPlayers = players;
    onPreview(t);
  };

  return (
    <div className="screen">
      <div className="split" style={{ paddingTop: 12 }}>
        <div className="pane scroll">
          <h2>Tournament Settings</h2>

          <Row label="Tournament Name">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </Row>
          <Row label="Game Type">
            <select value={gameType} onChange={(e) => switchGameType(Number(e.target.value))}>
              <option value={GameType.Yonma}>Yonma</option>
              <option value={GameType.Sanma}>Sanma</option>
            </select>
          </Row>
          <Row label="Uma Type">
            <select value={umaType} onChange={(e) => setUmaType(Number(e.target.value))}>
              <option value={UmaType.Fixed}>Fixed</option>
              <option value={UmaType.Floating}>Floating</option>
            </select>
          </Row>

          {umaType === UmaType.Fixed ? (
            <UmaInputs title="Uma" values={fixedUma} count={umaCount} onChange={setFixedUma} />
          ) : (
            <>
              <UmaInputs
                title={yonma ? 'Uma (0 or 2 or 4 Players >= Return)' : 'Uma (0 or 1 or 3 Players >= Return)'}
                values={floating1}
                count={umaCount}
                onChange={setFloating1}
              />
              <UmaInputs
                title={yonma ? 'Uma (3 Players >= Return)' : 'Uma (2 Players >= Return)'}
                values={floating2}
                count={umaCount}
                onChange={setFloating2}
              />
              {yonma && (
                <UmaInputs title="Uma (1 Player >= Return)" values={floating3} count={umaCount} onChange={setFloating3} />
              )}
            </>
          )}

          <Row label="Single Hanchan Tiebreak Strategy">
            <select value={tiebreak} onChange={(e) => setTiebreak(Number(e.target.value))}>
              <option value={TiebreakStrategy.Split}>Split Uma</option>
              <option value={TiebreakStrategy.WindOrder}>Wind Order</option>
            </select>
          </Row>
          <Row label="Use WRC Tiebreaks for Overall Score">
            <input type="checkbox" checked={wrcTiebreaks} onChange={(e) => setWrcTiebreaks(e.target.checked)} />
          </Row>
          <div className="setting-hint">
            Players with the same total score are ranked by most 1st places, then fewest 4th places, then
            highest scoring hanchan. If left unchecked, they are ranked by score alone and share a rank. Organizers can
            use their own tiebreak strategy.
          </div>
          <Row label="Start"><NumericInput value={startPoints} onChange={setStartPoints} /></Row>
          <Row label="Return"><NumericInput value={returnPoints} onChange={setReturnPoints} /></Row>
          <UmaInputs title="Oka" values={oka} count={umaCount} onChange={setOka} />
          <Row label="Default Round Timer (Minutes)"><NumericInput value={roundTime} onChange={setRoundTime} /></Row>
          <Row label="Riichi Sticks After All Last">
            <select value={riichiSticks} onChange={(e) => setRiichiSticks(Number(e.target.value))}>
              <option value={RiichiSticksStrategy.Lost}>Lost</option>
              <option value={RiichiSticksStrategy.First}>Give to First</option>
            </select>
          </Row>
          <Row label="Advanced Settings">
            <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
          </Row>

          {advanced && (
            <>
              <Row label="Assign Seat Winds When Generating Pairings">
                <input type="checkbox" checked={assignWinds} onChange={(e) => setAssignWinds(e.target.checked)} />
              </Row>
              <Row label="Score Per 1000 Points"><NumericInput value={scorePerThousand} onChange={setScorePerThousand} /></Row>
              <Row label="Enable Shuugi">
                <input type="checkbox" checked={shuugi} onChange={(e) => setShuugi(e.target.checked)} />
              </Row>
              {shuugi && (
                <>
                  <Row label="Starting Shuugi"><NumericInput value={shuugiStart} onChange={setShuugiStart} /></Row>
                  <Row label="Return Shuugi"><NumericInput value={shuugiEnd} onChange={setShuugiEnd} /></Row>
                  <Row label="Score Per Shuugi"><NumericInput value={scorePerShuugi} onChange={setScorePerShuugi} /></Row>
                </>
              )}
            </>
          )}

          <div className="spacer" />
          <div className="btn-row" style={{ padding: '0 20px' }}>
            <button onClick={onBack}>Back</button>
            <button className="primary" onClick={start} disabled={players.length === 0} title={players.length === 0 ? 'Add at least one player first' : undefined}>
              Start Tournament
            </button>
          </div>
        </div>

        <div className="pane">
          <h2>Players</h2>

          {csvMode ? (
            <textarea
              style={{ flex: 1 }}
              autoFocus
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={
                'Paste your CSV here and click Add Players! Player IDs will get automatically assigned!\n\nExample Input:\nFreed Jyanshi, RNNYC\nUnaffiliated Player\nIchihime, Jantama Jinja'
              }
            />
          ) : (
            <div className="tree">
              <table>
                <thead>
                  <tr><th>Player ID</th><th>Player Name</th><th>Affiliation</th><th /></tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td><input type="text" value={p.name} onChange={(e) => editPlayer(p.id, { name: e.target.value })} /></td>
                      <td><input type="text" value={p.affiliation} onChange={(e) => editPlayer(p.id, { affiliation: e.target.value })} /></td>
                      <td><button className="flat" title="Remove player" onClick={() => removePlayer(p.id)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="stack" style={{ padding: '10px 0 0' }}>
            {csvMode ? (
              <>
                <button onClick={importCsv}>Add Players</button>
                <button onClick={() => { setCsvMode(false); setCsv(''); }}>Cancel</button>
              </>
            ) : (
              <>
                <button onClick={addPlayer}>Add One Player</button>
                <button onClick={() => setCsvMode(true)}>Import Player Data From CSV</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
