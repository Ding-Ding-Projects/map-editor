// A small reader and appender for the LevelDB variant Minecraft Bedrock Edition uses
// (zlib or raw-deflate compressed table blocks). Reading takes the newest entry for each
// key from the table files and the write-ahead logs. Writing never rewrites a file: it adds
// one new log file, which LevelDB replays the next time the world is opened.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { inflateSync, inflateRawSync } from 'node:zlib';

const MAGIC = 0xdb4775248b80fb57n;
const BLOCK = 32768;
const MAX_INFLATE = 64 * 1024 * 1024;

const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1; t[i] = c >>> 0; } return t; })();
export function crc32c(parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const mask = (crc: number) => ((((crc >>> 15) | (crc << 17)) >>> 0) + 0xa282ead8) >>> 0;

class Cursor {
  pos = 0;
  constructor(public buf: Uint8Array) {}
  get left() { return this.buf.length - this.pos; }
  varint(): number {
    let v = 0, shift = 1;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.buf.length) throw new Error('LevelDB data ends inside a number');
      const b = this.buf[this.pos++];
      v += (b & 0x7f) * shift; shift *= 128;
      if (!(b & 0x80)) return v;
    }
    throw new Error('LevelDB number is too long');
  }
  bytes(n: number): Uint8Array {
    if (n < 0 || this.pos + n > this.buf.length) throw new Error('LevelDB data is cut short');
    const out = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return out;
  }
  slice(): Uint8Array { return this.bytes(this.varint()); }
}

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
export const hex = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('hex');

export interface Entry { key: Uint8Array; value: Uint8Array | null; seq: number }

function tableBlock(file: Uint8Array, offset: number, size: number): Uint8Array {
  if (offset + size + 1 > file.length) throw new Error('LevelDB table block is outside the file');
  const raw = file.subarray(offset, offset + size), type = file[offset + size];
  if (type === 0) return raw;
  if (type === 2) return inflateSync(raw, { maxOutputLength: MAX_INFLATE });
  if (type === 4) return inflateRawSync(raw, { maxOutputLength: MAX_INFLATE });
  throw new Error(`LevelDB table uses compression type ${type}, which Bedrock worlds do not use`);
}

function* blockEntries(block: Uint8Array): Generator<[Uint8Array, Uint8Array]> {
  if (block.length < 4) return;
  const restarts = view(block).getUint32(block.length - 4, true);
  const end = block.length - 4 - restarts * 4;
  if (end < 0) throw new Error('LevelDB table block is damaged');
  const c = new Cursor(block.subarray(0, end));
  let prev: Uint8Array = new Uint8Array(0);
  while (c.left > 0) {
    const shared = c.varint(), rest = c.varint(), vlen = c.varint();
    if (shared > prev.length) throw new Error('LevelDB table block is damaged');
    const key = new Uint8Array(shared + rest);
    key.set(prev.subarray(0, shared)); key.set(c.bytes(rest), shared);
    yield [key, c.bytes(vlen)];
    prev = key;
  }
}

/** Every entry of one table file, as stored (internal keys split into key, sequence and kind). */
export function readTable(file: Uint8Array): Entry[] {
  if (file.length < 48) throw new Error('LevelDB table file is too short');
  const footer = file.subarray(file.length - 48);
  if (view(footer).getBigUint64(40, true) !== MAGIC) throw new Error('Not a LevelDB table file');
  const f = new Cursor(footer); f.varint(); f.varint();
  const indexOffset = f.varint(), indexSize = f.varint();
  const out: Entry[] = [];
  for (const [, handle] of blockEntries(tableBlock(file, indexOffset, indexSize))) {
    const h = new Cursor(handle); const off = h.varint(), size = h.varint();
    for (const [ikey, value] of blockEntries(tableBlock(file, off, size))) {
      if (ikey.length < 8) continue;
      const tail = view(ikey).getBigUint64(ikey.length - 8, true);
      out.push({ key: ikey.subarray(0, ikey.length - 8), seq: Number(tail >> 8n), value: (tail & 0xffn) === 1n ? value : null });
    }
  }
  return out;
}

/** The whole records of a log-format file (write-ahead log or manifest). Stops quietly at a torn tail. */
export function readLogRecords(file: Uint8Array, checkCrc = false): Uint8Array[] {
  const out: Uint8Array[] = []; let parts: Uint8Array[] = []; let pos = 0;
  while (pos + 7 <= file.length) {
    const room = BLOCK - (pos % BLOCK);
    if (room < 7) { pos += room; continue; }
    const v = view(file), crc = v.getUint32(pos, true), len = v.getUint16(pos + 4, true), type = file[pos + 6];
    if (type === 0 && len === 0) { pos += room; continue; }
    if (pos + 7 + len > file.length || len > room - 7) break;
    const data = file.subarray(pos + 7, pos + 7 + len);
    if (checkCrc && mask(crc32c([file.subarray(pos + 6, pos + 7), data])) !== crc) throw new Error('LevelDB log record fails its checksum');
    pos += 7 + len;
    if (type === 1) { out.push(data); parts = []; }
    else if (type === 2) parts = [data];
    else if (type === 3) parts.push(data);
    else if (type === 4) { parts.push(data); out.push(Buffer.concat(parts)); parts = []; }
    else break;
  }
  return out;
}

export function readBatch(rec: Uint8Array): Entry[] {
  if (rec.length < 12) return [];
  const seq = Number(view(rec).getBigUint64(0, true)), count = view(rec).getUint32(8, true);
  const c = new Cursor(rec.subarray(12)); const out: Entry[] = [];
  for (let i = 0; i < count && c.left > 0; i++) {
    const kind = c.bytes(1)[0];
    if (kind === 1) { const key = c.slice(); out.push({ key, value: c.slice(), seq: seq + i }); }
    else if (kind === 0) out.push({ key: c.slice(), value: null, seq: seq + i });
    else throw new Error('LevelDB log batch is damaged');
  }
  return out;
}

function varint(n: number): number[] { const out: number[] = []; while (n >= 128) { out.push((n % 128) | 0x80); n = Math.floor(n / 128); } out.push(n); return out; }

export function encodeBatch(seq: number, puts: Array<[Uint8Array, Uint8Array | null]>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const head = new Uint8Array(12); view(head).setBigUint64(0, BigInt(seq), true); view(head).setUint32(8, puts.length, true); chunks.push(head);
  for (const [k, v] of puts) {
    chunks.push(Uint8Array.from([v ? 1 : 0, ...varint(k.length)]), k);
    if (v) chunks.push(Uint8Array.from(varint(v.length)), v);
  }
  return Buffer.concat(chunks);
}

/** One record laid out as log-file bytes, split across 32 KiB blocks. `at` is where in the file it starts. */
export function encodeLogRecord(payload: Uint8Array, at = 0): Uint8Array {
  const out: Uint8Array[] = []; let pos = at, off = 0, first = true;
  do {
    const room = BLOCK - (pos % BLOCK);
    if (room < 7) { out.push(new Uint8Array(room)); pos += room; continue; }
    const n = Math.min(payload.length - off, room - 7), last = off + n === payload.length;
    const type = first && last ? 1 : first ? 2 : last ? 4 : 3;
    const data = payload.subarray(off, off + n);
    const head = new Uint8Array(7); head[6] = type;
    view(head).setUint32(0, mask(crc32c([head.subarray(6, 7), data])), true); view(head).setUint16(4, n, true);
    out.push(head, data); pos += 7 + n; off += n; first = false;
  } while (off < payload.length);
  return Buffer.concat(out);
}

interface Manifest { logNumber: number; lastSequence: number; nextFile: number; tables: Set<number> }
function readManifest(file: Uint8Array): Manifest {
  const m: Manifest = { logNumber: 0, lastSequence: 0, nextFile: 0, tables: new Set() };
  for (const rec of readLogRecords(file)) {
    const c = new Cursor(rec);
    while (c.left > 0) {
      const tag = c.varint();
      if (tag === 1) c.slice();
      else if (tag === 2) m.logNumber = c.varint();
      else if (tag === 3) m.nextFile = c.varint();
      else if (tag === 4) m.lastSequence = c.varint();
      else if (tag === 5) { c.varint(); c.slice(); }
      else if (tag === 6) { c.varint(); m.tables.delete(c.varint()); }
      else if (tag === 7) { c.varint(); m.tables.add(c.varint()); c.varint(); c.slice(); c.slice(); }
      else if (tag === 9) c.varint();
      else throw new Error('LevelDB manifest has a part this reader does not know');
    }
  }
  return m;
}

/** A Bedrock world's database, read into memory. */
export class LevelDb {
  private data = new Map<string, Entry>();
  private lastSeq = 0;
  private lastFile = 0;
  private constructor(public dir: string) {}

  static async open(dir: string): Promise<LevelDb> {
    const db = new LevelDb(dir);
    const names = await fs.readdir(dir);
    let manifest: Manifest | undefined;
    try {
      const current = (await fs.readFile(path.join(dir, 'CURRENT'), 'utf8')).trim();
      if (/^MANIFEST-\d+$/.test(current)) manifest = readManifest(await fs.readFile(path.join(dir, current)));
    } catch { /* fall back to reading every file */ }
    const take = (e: Entry) => { const k = hex(e.key); const old = db.data.get(k); if (!old || e.seq >= old.seq) db.data.set(k, e); if (e.seq > db.lastSeq) db.lastSeq = e.seq; };
    for (const name of names.sort()) {
      const m = /^(\d+)\.(ldb|sst|log)$/.exec(name) ?? /^MANIFEST-(\d+)()$/.exec(name);
      if (!m) continue;
      const num = Number(m[1]); if (num > db.lastFile) db.lastFile = num;
      if (m[2] === 'ldb' || m[2] === 'sst') {
        if (manifest && manifest.tables.size && !manifest.tables.has(num)) continue; // an old table waiting to be removed
        for (const e of readTable(await fs.readFile(path.join(dir, name)))) take(e);
      } else if (m[2] === 'log') {
        if (manifest && num < manifest.logNumber) continue; // already folded into the tables
        for (const rec of readLogRecords(await fs.readFile(path.join(dir, name)))) for (const e of readBatch(rec)) take(e);
      }
    }
    if (manifest) { db.lastSeq = Math.max(db.lastSeq, manifest.lastSequence); db.lastFile = Math.max(db.lastFile, manifest.nextFile - 1); }
    return db;
  }

  get(key: Uint8Array): Uint8Array | undefined { return this.data.get(hex(key))?.value ?? undefined; }
  *keys(): Generator<Uint8Array> { for (const e of this.data.values()) if (e.value) yield e.key; }
  get size() { return this.data.size; }

  /** Add one new log file holding these changes. Returns its path. Existing files are left alone. */
  async write(puts: Array<[Uint8Array, Uint8Array | null]>): Promise<string | undefined> {
    if (!puts.length) return undefined;
    const seq = this.lastSeq + 1, num = this.lastFile + 1;
    const file = path.join(this.dir, `${String(num).padStart(6, '0')}.log`);
    await fs.writeFile(file + '.tmp', encodeLogRecord(encodeBatch(seq, puts)));
    await fs.rename(file + '.tmp', file);
    puts.forEach(([key, value], i) => this.data.set(hex(key), { key, value, seq: seq + i }));
    this.lastSeq = seq + puts.length - 1; this.lastFile = num;
    return file;
  }
}
