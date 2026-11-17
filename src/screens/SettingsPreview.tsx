import {
  gameTypeLabel,
  riichiSticksLabel,
  tiebreakLabel,
  umaTypeLabel,
} from '../core/format';
import { GameType, Tournament, UmaType } from '../core/types';

interface Props {
  tournament: Tournament;
  onConfirm: () => void;
  onCancel: () => void;
}

function Setting({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <div className="label" style={{ paddingLeft: 0 }}>{name}</div>
      <div className="value" style={{ display: 'flex', gap: 6 }}>{children}</div>
    </div>
  );
}

const Values = ({ values }: { values: number[] }) => (
  <>
    {values.map((v, i) => (
      <span key={i} style={{ flex: 1 }}>{v}</span>
    ))}
  </>
);

export function SettingsPreview({ tournament: t, onConfirm, onCancel }: Props) {
  const s = t.settings;
  const yonma = s.gameType === GameType.Yonma;

  return (
    <div className="screen">
      <div className="preview">
        <h2 style={{ paddingTop: 20 }}>Settings Preview</h2>
        <h3>{t.name}</h3>

        <Setting name="Game Type">{gameTypeLabel(s.gameType)}</Setting>
        <Setting name="Uma Type">{umaTypeLabel(s.umaType)}</Setting>

        {s.umaType === UmaType.Fixed ? (
          <Setting name="Uma"><Values values={s.fixedUma} /></Setting>
        ) : (
          <>
            <Setting name={yonma ? 'Uma (0 or 2 or 4 Players >= Return)' : 'Uma (0 or 1 or 3 Players >= Return)'}>
              <Values values={s.floatingUma1} />
            </Setting>
            <Setting name={yonma ? 'Uma (3 Players >= Return)' : 'Uma (2 Players >= Return)'}>
              <Values values={s.floatingUma2} />
            </Setting>
            {yonma && (
              <Setting name="Uma (1 Player >= Return)"><Values values={s.floatingUma3} /></Setting>
            )}
          </>
        )}

        <Setting name="Tiebreak">{tiebreakLabel(s.tiebreakStrategy)}</Setting>
        <Setting name="Start">{s.startPoints}</Setting>
        <Setting name="Return">{s.returnPoints}</Setting>
        <Setting name="Oka"><Values values={s.oka} /></Setting>
        <Setting name="Default Round Timer (Minutes)">{s.timePerRoundMinutes}</Setting>
        <Setting name="Riichi Sticks">{riichiSticksLabel(s.riichiSticksStrategy)}</Setting>
        <Setting name="Assign Seat Winds">{s.assignSeatWinds ? 'Yes' : 'No'}</Setting>

        {s.advancedSettings && (
          <>
            <Setting name="Score Per 1000 Points">{s.scorePerThousandPoints.toFixed(2)}</Setting>
            {s.shuugi && (
              <>
                <Setting name="Starting Shuugi">{s.startShuugi}</Setting>
                <Setting name="Ending Shuugi">{s.endShuugi}</Setting>
                <Setting name="Score Per Shuugi">{s.scorePerShuugi.toFixed(2)}</Setting>
              </>
            )}
          </>
        )}

        <h3 style={{ marginTop: 20 }}>Players</h3>
        <div className="tree">
          <table>
            <thead>
              <tr><th>Player ID</th><th>Player Name</th><th>Affiliation</th></tr>
            </thead>
            <tbody>
              {t.registeredPlayers.map((p) => (
                <tr key={p.id}><td>{p.id}</td><td>{p.name}</td><td>{p.affiliation}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="btn-row">
          <button className="primary" onClick={onConfirm}>Confirm</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
