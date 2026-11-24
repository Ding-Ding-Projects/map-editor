// Named Binary Tag (NBT) reader and writer for Minecraft Java Edition (big-endian).
// Ported in behaviour from the Amulet stack (amulet-nbt), rewritten in TypeScript.

export enum TagType {
  End = 0,
  Byte = 1,
  Short = 2,
  Int = 3,
  Long = 4,
  Float = 5,
  Double = 6,
  ByteArray = 7,
  String = 8,
  List = 9,
  Compound = 10,
  IntArray = 11,
  LongArray = 12,
}

export type Tag =
  | { type: TagType.Byte; value: number }
  | { type: TagType.Short; value: number }
  | { type: TagType.Int; value: number }
  | { type: TagType.Long; value: bigint }
  | { type: TagType.Float; value: number }
  | { type: TagType.Double; value: number }
  | { type: TagType.ByteArray; value: Int8Array }
  | { type: TagType.String; value: string }
  | { type: TagType.List; elementType: TagType; value: Tag[] }
  | { type: TagType.Compound; value: Map<string, Tag> }
  | { type: TagType.IntArray; value: Int32Array }
  | { type: TagType.LongArray; value: BigInt64Array };

export type CompoundTag = Extract<Tag, { type: TagType.Compound }>;

const utf8 = new TextDecoder('utf-8');
const utf8e = new TextEncoder();

class Reader {
  private view: DataView;
  pos = 0;
  constructor(private buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  private need(n: number) {
    if (this.pos + n > this.buf.byteLength) throw new Error(`NBT truncated at byte ${this.pos}`);
  }
  u8() { this.need(1); return this.view.getUint8(this.pos++); }
  i8() { this.need(1); return this.view.getInt8(this.pos++); }
  i16() { this.need(2); const v = this.view.getInt16(this.pos); this.pos += 2; return v; }
  u16() { this.need(2); const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
  i32() { this.need(4); const v = this.view.getInt32(this.pos); this.pos += 4; return v; }
  i64() { this.need(8); const v = this.view.getBigInt64(this.pos); this.pos += 8; return v; }
  f32() { this.need(4); const v = this.view.getFloat32(this.pos); this.pos += 4; return v; }
  f64() { this.need(8); const v = this.view.getFloat64(this.pos); this.pos += 8; return v; }
  str() {
    const len = this.u16();
    this.need(len);
    const s = utf8.decode(this.buf.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
  count() {
    const n = this.i32();
    if (n < 0) throw new Error(`NBT negative length ${n}`);
    return n;
  }
  payload(type: TagType, depth: number): Tag {
    if (depth > 512) throw new Error('NBT nesting too deep');
    switch (type) {
      case TagType.Byte: return { type, value: this.i8() };
      case TagType.Short: return { type, value: this.i16() };
      case TagType.Int: return { type, value: this.i32() };
      case TagType.Long: return { type, value: this.i64() };
      case TagType.Float: return { type, value: this.f32() };
      case TagType.Double: return { type, value: this.f64() };
      case TagType.ByteArray: {
        const n = this.count(); this.need(n);
        const v = new Int8Array(n);
        for (let i = 0; i < n; i++) v[i] = this.view.getInt8(this.pos + i);
        this.pos += n;
        return { type, value: v };
      }
      case TagType.String: return { type, value: this.str() };
      case TagType.List: {
        const elementType = this.u8() as TagType;
        const n = this.count();
        const value: Tag[] = [];
        for (let i = 0; i < n; i++) value.push(this.payload(elementType, depth + 1));
        return { type, elementType, value };
      }
      case TagType.Compound: {
        const value = new Map<string, Tag>();
        for (;;) {
          const t = this.u8() as TagType;
          if (t === TagType.End) break;
          const name = this.str();
          value.set(name, this.payload(t, depth + 1));
        }
        return { type, value };
      }
      case TagType.IntArray: {
        const n = this.count(); this.need(n * 4);
        const v = new Int32Array(n);
        for (let i = 0; i < n; i++) v[i] = this.i32();
        return { type, value: v };
      }
      case TagType.LongArray: {
        const n = this.count(); this.need(n * 8);
        const v = new BigInt64Array(n);
        for (let i = 0; i < n; i++) v[i] = this.i64();
        return { type, value: v };
      }
      default:
        throw new Error(`Unknown NBT tag type ${type} at byte ${this.pos}`);
    }
  }
}

class Writer {
  private chunks: Uint8Array[] = [];
  private cur = new Uint8Array(4096);
  private view = new DataView(this.cur.buffer);
  private pos = 0;
  private ensure(n: number) {
    if (this.pos + n <= this.cur.byteLength) return;
    const next = new Uint8Array(Math.max(this.cur.byteLength * 2, this.pos + n));
    next.set(this.cur.subarray(0, this.pos));
    this.cur = next;
    this.view = new DataView(next.buffer);
  }
  u8(v: number) { this.ensure(1); this.view.setUint8(this.pos++, v); }
  i8(v: number) { this.ensure(1); this.view.setInt8(this.pos++, v); }
  i16(v: number) { this.ensure(2); this.view.setInt16(this.pos, v); this.pos += 2; }
  u16(v: number) { this.ensure(2); this.view.setUint16(this.pos, v); this.pos += 2; }
  i32(v: number) { this.ensure(4); this.view.setInt32(this.pos, v); this.pos += 4; }
  i64(v: bigint) { this.ensure(8); this.view.setBigInt64(this.pos, v); this.pos += 8; }
  f32(v: number) { this.ensure(4); this.view.setFloat32(this.pos, v); this.pos += 4; }
  f64(v: number) { this.ensure(8); this.view.setFloat64(this.pos, v); this.pos += 8; }
  str(s: string) {
    const b = utf8e.encode(s);
    if (b.byteLength > 0xffff) throw new Error('NBT string too long');
    this.u16(b.byteLength);
    this.ensure(b.byteLength); this.cur.set(b, this.pos); this.pos += b.byteLength;
  }
  payload(tag: Tag) {
    switch (tag.type) {
      case TagType.Byte: this.i8(tag.value); break;
      case TagType.Short: this.i16(tag.value); break;
      case TagType.Int: this.i32(tag.value); break;
      case TagType.Long: this.i64(tag.value); break;
      case TagType.Float: this.f32(tag.value); break;
      case TagType.Double: this.f64(tag.value); break;
      case TagType.ByteArray: this.i32(tag.value.length); for (const b of tag.value) this.i8(b); break;
      case TagType.String: this.str(tag.value); break;
      case TagType.List: {
        const et = tag.value.length ? tag.elementType : (tag.elementType ?? TagType.End);
        this.u8(et); this.i32(tag.value.length);
        for (const t of tag.value) {
          if (t.type !== et) throw new Error('NBT list element type mismatch');
          this.payload(t);
        }
        break;
      }
      case TagType.Compound:
        for (const [k, v] of tag.value) { this.u8(v.type); this.str(k); this.payload(v); }
        this.u8(TagType.End);
        break;
      case TagType.IntArray: this.i32(tag.value.length); for (const v of tag.value) this.i32(v); break;
      case TagType.LongArray: this.i32(tag.value.length); for (const v of tag.value) this.i64(v); break;
    }
  }
  result() { return this.cur.slice(0, this.pos); }
}

export interface NamedTag { name: string; tag: Tag }

/** Read one root tag from uncompressed NBT bytes. */
export function readNbt(buf: Uint8Array): NamedTag {
  const r = new Reader(buf);
  const type = r.u8() as TagType;
  if (type !== TagType.Compound && type !== TagType.List) throw new Error(`NBT root must be a compound, got ${type}`);
  const name = r.str();
  return { name, tag: r.payload(type, 0) };
}

/** Write one root tag to uncompressed NBT bytes. */
export function writeNbt(root: NamedTag): Uint8Array {
  const w = new Writer();
  w.u8(root.tag.type);
  w.str(root.name);
  w.payload(root.tag);
  return w.result();
}

// ---- small helpers for building and reading tags ----
export const nbt = {
  byte: (value: number): Tag => ({ type: TagType.Byte, value }),
  short: (value: number): Tag => ({ type: TagType.Short, value }),
  int: (value: number): Tag => ({ type: TagType.Int, value }),
  long: (value: bigint): Tag => ({ type: TagType.Long, value }),
  float: (value: number): Tag => ({ type: TagType.Float, value }),
  double: (value: number): Tag => ({ type: TagType.Double, value }),
  string: (value: string): Tag => ({ type: TagType.String, value }),
  list: (elementType: TagType, value: Tag[]): Tag => ({ type: TagType.List, elementType, value }),
  compound: (entries: Record<string, Tag> | Map<string, Tag>): CompoundTag => ({
    type: TagType.Compound,
    value: entries instanceof Map ? entries : new Map(Object.entries(entries)),
  }),
  intArray: (value: Int32Array): Tag => ({ type: TagType.IntArray, value }),
  longArray: (value: BigInt64Array): Tag => ({ type: TagType.LongArray, value }),
};

export function getCompound(t: Tag | undefined, key: string): CompoundTag | undefined {
  if (!t || t.type !== TagType.Compound) return undefined;
  const v = t.value.get(key);
  return v && v.type === TagType.Compound ? v : undefined;
}
export function getList(t: Tag | undefined, key: string): Tag[] | undefined {
  if (!t || t.type !== TagType.Compound) return undefined;
  const v = t.value.get(key);
  return v && v.type === TagType.List ? v.value : undefined;
}
export function getString(t: Tag | undefined, key: string): string | undefined {
  if (!t || t.type !== TagType.Compound) return undefined;
  const v = t.value.get(key);
  return v && v.type === TagType.String ? v.value : undefined;
}
export function getNumber(t: Tag | undefined, key: string): number | undefined {
  if (!t || t.type !== TagType.Compound) return undefined;
  const v = t.value.get(key);
  if (!v) return undefined;
  if (v.type === TagType.Byte || v.type === TagType.Short || v.type === TagType.Int || v.type === TagType.Float || v.type === TagType.Double) return v.value;
  if (v.type === TagType.Long) return Number(v.value);
  return undefined;
}
export function getLongArray(t: Tag | undefined, key: string): BigInt64Array | undefined {
  if (!t || t.type !== TagType.Compound) return undefined;
  const v = t.value.get(key);
  return v && v.type === TagType.LongArray ? v.value : undefined;
}
