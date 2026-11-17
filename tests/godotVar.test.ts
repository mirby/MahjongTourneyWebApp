import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeGodotVar } from '../src/core/godotVar';
import { parseSaveFile, serializeTournament } from '../src/core/serialize';
import { calculateScores } from '../src/core/tournament';

// Tiny encoder for Godot's binary format, so the decoder can be tested without a real save.
function encode(value: unknown): number[] {
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];
  const body = (v: unknown): number[] => {
    if (v === null) return u32(0);
    if (typeof v === 'boolean') return [...u32(1), ...u32(v ? 1 : 0)];
    if (typeof v === 'number' && Number.isInteger(v)) return [...u32(2), ...u32(v >>> 0)];
    if (typeof v === 'number') {
      const b = new DataView(new ArrayBuffer(4));
      b.setFloat32(0, v, true);
      return [...u32(3), ...new Uint8Array(b.buffer)];
    }
    if (typeof v === 'string') {
      const bytes = [...new TextEncoder().encode(v)];
      while (bytes.length % 4) bytes.push(0);
      return [...u32(4), ...u32(new TextEncoder().encode(v).length), ...bytes];
    }
    if (Array.isArray(v)) return [...u32(28), ...u32(v.length), ...v.flatMap(body)];
    const entries = Object.entries(v as object);
    return [...u32(27), ...u32(entries.length), ...entries.flatMap(([k, x]) => [...body(k), ...body(x)])];
  };
  const data = body(value);
  return [...u32(data.length), ...data];
}

const toBuffer = (bytes: number[]) => new Uint8Array(bytes).buffer;

describe('decodeGodotVar', () => {
  it('decodes nested dictionaries, arrays, strings, numbers and bools', () => {
    const value = { name: '親子Don', ids: [1, -2, 3], f: 0.5, ok: true, nested: { empty: [] } };
    expect(decodeGodotVar(toBuffer(encode(value)))).toEqual(value);
  });

  it('rejects data with a bad length header', () => {
    const bytes = encode({ a: 1 });
    bytes[0] += 1;
    expect(() => decodeGodotVar(toBuffer(bytes))).toThrow();
  });
});

describe('parseSaveFile', () => {
  it('reads JSON saves too', () => {
    const json = JSON.stringify({
      name: 'X', registered_players: [], settings: {}, tables: [], cuts: [], next_round: 1,
    });
    expect(parseSaveFile(new TextEncoder().encode(json).buffer as ArrayBuffer).name).toBe('X');
  });

  // The real save file lives in tests/fixtures (git-ignored, since it holds real player names).
  const fixture = 'tests/fixtures/pro_2026_test.tmnt';
  it.skipIf(!existsSync(fixture))('opens a real Godot-saved tournament', () => {
    const file = readFileSync(fixture);
    const t = parseSaveFile(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

    expect(t.name).toBe('PRO2026_Test');
    expect(t.registeredPlayers.length).toBe(160);
    expect(t.registeredPlayers[0]).toEqual({ id: 1, name: 'A Light Snack', affiliation: 'Philly Mah-Jawn' });
    expect(t.registeredPlayers.at(-1)!.name).toBe('Sub2');
    expect(t.settings.startPoints).toBe(30000);
    expect(t.settings.returnPoints).toBe(30000);
    expect(t.settings.fixedUma).toEqual([30, 10, -10, -30]);
    expect(t.settings.oka).toEqual([0, 0, 0, 0]);
    expect(t.settings.tiebreakStrategy).toBe(1); // Split
    expect(t.settings.assignSeatWinds).toBe(false);
    expect(t.settings.scriptId.length).toBeGreaterThan(10);
    expect(t.tables.length).toBe(40);
    expect(t.tables.every((x) => x.roundId === 1 && x.playerIds.length === 4)).toBe(true);
    expect(t.tables[0].playerIds).toEqual([26, 159, 112, 39]);
    expect(t.tables[0].playerSeats).toEqual([]);
    expect(t.nextRound).toBe(2);

    // Everything downstream still works on the imported data, and survives a JSON round trip.
    expect(Object.keys(calculateScores(t).scores)).toEqual([]); // no scores entered yet
    const again = parseSaveFile(new TextEncoder().encode(JSON.stringify(serializeTournament(t))).buffer as ArrayBuffer);
    expect(again).toEqual(t);
  });
});
