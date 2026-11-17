/**
 * Minimal decoder for Godot 4's binary Variant format, as written by FileAccess.store_var().
 * Supports what tournament saves contain: null, bool, int, float, String, Array, Dictionary.
 *
 * Layout: a uint32 byte length, then the value. Every value starts with a uint32 header
 * (low 16 bits = type, bit 16 = "64-bit" for ints/floats). Strings are a uint32 length followed by
 * UTF-8 bytes padded to a multiple of 4. Arrays/Dictionaries are a uint32 count (top bit is a
 * "shared" flag) followed by the elements / key,value pairs.
 */

const TYPE_NIL = 0;
const TYPE_BOOL = 1;
const TYPE_INT = 2;
const TYPE_FLOAT = 3;
const TYPE_STRING = 4;
const TYPE_DICTIONARY = 27;
const TYPE_ARRAY = 28;
const FLAG_64 = 1 << 16;

class Reader {
  private view: DataView;
  private bytes: Uint8Array;
  pos = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
  }

  private need(n: number) {
    if (this.pos + n > this.bytes.length) throw new Error('Unexpected end of file.');
  }

  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  /**
   * Typed Arrays (and typed Dictionaries in Godot 4.4+) put the element type(s) between the
   * header and the count. Godot 4.2 flags a typed array with bit 16; 4.4+ uses a 2-bit kind per
   * key (bits 16-17) and value (bits 18-19). Only built-in element types are supported, which
   * is all a tournament save uses; the type itself isn't needed since values are self-describing.
   */
  private skipContainerTypes(header: number, kind: 'array' | 'dictionary') {
    const flags = header >>> 16;
    const kinds = kind === 'array' ? [flags & 1 ? 1 : (flags >> 2) & 3] : [flags & 3, (flags >> 2) & 3];
    for (const k of kinds) {
      if (k === 0) continue;
      if (k !== 1) throw new Error('Unsupported typed container in save file (object types).');
      this.u32(); // built-in element type id
    }
  }

  read(): unknown {
    const header = this.u32();
    const type = header & 0xffff;

    switch (type) {
      case TYPE_NIL:
        return null;
      case TYPE_BOOL:
        return this.u32() !== 0;
      case TYPE_INT: {
        if (header & FLAG_64) {
          this.need(8);
          const v = Number(this.view.getBigInt64(this.pos, true));
          this.pos += 8;
          return v;
        }
        this.need(4);
        const v = this.view.getInt32(this.pos, true);
        this.pos += 4;
        return v;
      }
      case TYPE_FLOAT: {
        if (header & FLAG_64) {
          this.need(8);
          const v = this.view.getFloat64(this.pos, true);
          this.pos += 8;
          return v;
        }
        this.need(4);
        const v = this.view.getFloat32(this.pos, true);
        this.pos += 4;
        return v;
      }
      case TYPE_STRING: {
        const len = this.u32();
        this.need(len);
        const s = new TextDecoder().decode(this.bytes.subarray(this.pos, this.pos + len));
        this.pos += len + ((4 - (len % 4)) % 4);
        return s;
      }
      case TYPE_ARRAY: {
        this.skipContainerTypes(header, 'array');
        const count = this.u32() & 0x7fffffff;
        const out: unknown[] = [];
        for (let i = 0; i < count; i++) out.push(this.read());
        return out;
      }
      case TYPE_DICTIONARY: {
        this.skipContainerTypes(header, 'dictionary');
        const count = this.u32() & 0x7fffffff;
        const out: Record<string, unknown> = {};
        for (let i = 0; i < count; i++) {
          const key = this.read();
          out[String(key)] = this.read();
        }
        return out;
      }
      default:
        throw new Error(`Unsupported Godot data type ${type}.`);
    }
  }
}

/** Decodes a buffer written by FileAccess.store_var(). */
export function decodeGodotVar(buffer: ArrayBuffer): unknown {
  if (buffer.byteLength < 8) throw new Error('File is too short to be a tournament save.');
  const reader = new Reader(buffer);
  const declared = reader.u32();
  if (declared !== buffer.byteLength - 4) {
    throw new Error('This does not look like a Godot tournament save (length header mismatch).');
  }
  return reader.read();
}

/** True if the bytes look like JSON text rather than Godot binary. */
export function looksLikeJson(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16));
  for (const b of bytes) {
    if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0xef || b === 0xbb || b === 0xbf) continue;
    return b === 0x7b; // '{'
  }
  return false;
}
