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

const SAVE_PICKER_ID = 'mahjong-tournament-saves';

type SaveFilePicker = (options: {
  id?: string;
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;

/**
 * Saves text to a file, always letting the user choose the file name.
 * Uses the browser's Save As dialog where available (Chrome, Edge); elsewhere asks for
 * a name first and then downloads. Resolves to the saved name, or null if the user cancelled.
 * Must be called directly from a click handler.
 *
 * All saves share one picker id, so the browser reopens the dialog in whichever folder
 * the user last saved to from this app (remembered across visits).
 */
export async function saveTextAs(
  suggestedName: string,
  text: string,
  { mime = 'text/plain', extension, description }: { mime?: string; extension: string; description: string },
): Promise<string | null> {
  const blob = new Blob([text], { type: mime });
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

  if (picker) {
    try {
      const handle = await picker({
        id: SAVE_PICKER_ID,
        suggestedName,
        types: [{ description, accept: { [mime]: [extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return (handle as unknown as { name?: string }).name ?? suggestedName;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      // Any other failure (e.g. blocked in an embedded frame): fall back to asking for a name.
    }
  }

  const entered = window.prompt('Save as:', suggestedName)?.trim();
  if (!entered) return null;
  const filename = entered.toLowerCase().endsWith(extension) ? entered : `${entered}${extension}`;
  downloadText(filename, text, mime);
  return filename;
}
