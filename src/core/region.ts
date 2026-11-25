// Anvil region file (.mca) reader and writer.
// Layout: 4 KiB location table, 4 KiB timestamp table, then 4 KiB sectors.
import { deflateSync, gunzipSync, inflateSync, gzipSync } from 'node:zlib';
import { readNbt, writeNbt, type NamedTag } from './nbt.js';

const SECTOR = 4096;

export enum Compression { GZip = 1, Zlib = 2, None = 3 }

export class RegionFile {
  /** Raw (still compressed) chunk payloads by local index (0..1023). */
  private payloads = new Map<number, { compression: Compression; data: Uint8Array; timestamp: number }>();
  dirty = false;

  static empty(): RegionFile { return new RegionFile(); }

  static parse(buf: Uint8Array): RegionFile {
    const r = new RegionFile();
    if (buf.byteLength === 0) return r;
    if (buf.byteLength < SECTOR * 2) throw new Error('Region file shorter than its header');
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    for (let i = 0; i < 1024; i++) {
      const loc = view.getUint32(i * 4);
      if (loc === 0) continue;
      const offset = (loc >>> 8) * SECTOR;
      const count = loc & 0xff;
      if (offset < SECTOR * 2 || offset + 5 > buf.byteLength || count === 0) continue; // corrupt entry: skip, never crash
      const length = view.getUint32(offset);
      const compression = view.getUint8(offset + 4) as Compression;
      if (length < 1 || offset + 4 + length > buf.byteLength) continue;
      if (compression & 0x80) continue; // external .mcc chunk: not supported in this pass
      const data = buf.slice(offset + 5, offset + 4 + length);
      r.payloads.set(i, { compression, data, timestamp: view.getUint32(SECTOR + i * 4) });
    }
    return r;
  }

  static index(cx: number, cz: number) { return (cx & 31) + (cz & 31) * 32; }

  has(cx: number, cz: number) { return this.payloads.has(RegionFile.index(cx, cz)); }

  /** Local chunk coordinates present in this region. */
  chunks(): Array<[number, number]> {
    return [...this.payloads.keys()].map((i) => [i & 31, i >> 5]);
  }

  read(cx: number, cz: number): NamedTag | undefined {
    const p = this.payloads.get(RegionFile.index(cx, cz));
    if (!p) return undefined;
    let raw: Uint8Array;
    switch (p.compression) {
      case Compression.GZip: raw = gunzipSync(p.data); break;
      case Compression.Zlib: raw = inflateSync(p.data); break;
      case Compression.None: raw = p.data; break;
      default: throw new Error(`Unsupported chunk compression ${p.compression}`);
    }
    return readNbt(raw);
  }

  write(cx: number, cz: number, tag: NamedTag, compression: Compression = Compression.Zlib) {
    const raw = writeNbt(tag);
    const data = compression === Compression.Zlib ? deflateSync(raw) : compression === Compression.GZip ? gzipSync(raw) : raw;
    this.payloads.set(RegionFile.index(cx, cz), { compression, data, timestamp: Math.floor(Date.now() / 1000) });
    this.dirty = true;
  }

  delete(cx: number, cz: number) {
    if (this.payloads.delete(RegionFile.index(cx, cz))) this.dirty = true;
  }

  serialize(): Uint8Array {
    const sectors: Uint8Array[] = [];
    const header = new Uint8Array(SECTOR * 2);
    const hv = new DataView(header.buffer);
    let next = 2;
    for (let i = 0; i < 1024; i++) {
      const p = this.payloads.get(i);
      if (!p) continue;
      const len = p.data.byteLength + 1;
      const count = Math.ceil((len + 4) / SECTOR);
      if (count > 255) throw new Error('Chunk too large for an inline region sector run');
      const block = new Uint8Array(count * SECTOR);
      const bv = new DataView(block.buffer);
      bv.setUint32(0, len);
      bv.setUint8(4, p.compression);
      block.set(p.data, 5);
      sectors.push(block);
      hv.setUint32(i * 4, (next << 8) | count);
      hv.setUint32(SECTOR + i * 4, p.timestamp);
      next += count;
    }
    const out = new Uint8Array(next * SECTOR);
    out.set(header, 0);
    let off = SECTOR * 2;
    for (const s of sectors) { out.set(s, off); off += s.byteLength; }
    return out;
  }
}

/** Decompressed bytes of one chunk payload, for comparing content across recompression. */
function inflatePayload(p: { compression: Compression; data: Uint8Array }): Uint8Array | undefined {
  try {
    switch (p.compression) {
      case Compression.GZip: return gunzipSync(p.data);
      case Compression.Zlib: return inflateSync(p.data);
      case Compression.None: return p.data;
      default: return undefined;
    }
  } catch { return undefined; }
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.byteLength === b.byteLength && Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));

/** Counts chunks added, removed or changed between two versions of one region file. */
export function changedChunks(before: Uint8Array | undefined, after: Uint8Array | undefined): number {
  const a = before ? RegionFile.parse(before) : RegionFile.empty();
  const b = after ? RegionFile.parse(after) : RegionFile.empty();
  const pa = (a as unknown as { payloads: Map<number, { compression: Compression; data: Uint8Array }> }).payloads;
  const pb = (b as unknown as { payloads: Map<number, { compression: Compression; data: Uint8Array }> }).payloads;
  let n = 0;
  for (const i of new Set([...pa.keys(), ...pb.keys()])) {
    const x = pa.get(i), y = pb.get(i);
    if (!x || !y) { n++; continue; }
    if (x.compression === y.compression && sameBytes(x.data, y.data)) continue;
    const rx = inflatePayload(x), ry = inflatePayload(y);
    if (!rx || !ry || !sameBytes(rx, ry)) n++;
  }
  return n;
}
