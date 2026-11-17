import {
  GameType,
  PairingSystem,
  RiichiSticksStrategy,
  TiebreakStrategy,
  TournamentSettings,
  UmaType,
} from './types';

const isInt = (v: number) => Math.abs(v - Math.round(v)) < 1e-9;

export function formatScore(score: number, settings: TournamentSettings): string {
  const nonInteger = !isInt(settings.scorePerThousandPoints) || (settings.shuugi && !isInt(settings.scorePerShuugi));
  const decimals = nonInteger ? 2 : 1;
  return score >= 0 ? score.toFixed(decimals) : `(${Math.abs(score).toFixed(decimals)})`;
}

export function formatTimer(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s - hours * 3600) / 60);
  const secs = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(hours)}:${p(mins)}:${p(secs)}`;
}

export const gameTypeLabel = (g: GameType) => (g === GameType.Yonma ? 'Yonma' : 'Sanma');
export const umaTypeLabel = (u: UmaType) => (u === UmaType.Fixed ? 'Fixed' : 'Floating');
export const tiebreakLabel = (t: TiebreakStrategy) => (t === TiebreakStrategy.WindOrder ? 'Wind Order' : 'Split');
export const pairingSystemLabel = (p: PairingSystem) => (p === PairingSystem.Random ? 'Random' : 'Progressive Swiss');
export const riichiSticksLabel = (r: RiichiSticksStrategy) => (r === RiichiSticksStrategy.Lost ? 'Lost' : 'First');

export function snakeCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
