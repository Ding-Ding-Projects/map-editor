// Bedrock Edition worlds: chunks live in a LevelDB folder, one entry per 16×16×16 sub-chunk.
// This reads them into the same Chunk and Section shapes the Java side uses, so the map, the
// side view, the 3D view and the block tools work on both. Saving adds one new log file to the
// database and leaves every existing file alone.
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { Chunk, Section, blockKey, type BlockState } from './chunk.js';
import { nbt } from './nbt.js';
import { LevelDb } from './leveldb.js';
import type { Dimension, WorldInfo } from './world.js';

const DIM_ID: Record<Dimension, number> = { overworld: 0, nether: 1, end: 2 };
const SUBCHUNK = 47;
const utf8 = new TextDecoder(), utf8e = new TextEncoder();
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** Read one little-endian NBT value. Returns plain JavaScript values and where the value ends. */
function leValue(b: Uint8Array, pos: number, type: number, depth = 0): [unknown, number] {
  const v = view(b);
  if (depth > 64) throw new Error('Bedrock block data is nested too deeply');
  const need = (n: number) => { if (pos + n > b.length) throw new Error('Bedrock block data is cut short'); };
  switch (type) {
    case 1: need(1); return [v.getInt8(pos), pos + 1];
    case 2: need(2); return [v.getInt16(pos, true), pos + 2];
    case 3: need(4); return [v.getInt32(pos, true), pos + 4];
    case 4: need(8); return [v.getBigInt64(pos, true), pos + 8];
    case 5: need(4); return [v.getFloat32(pos, true), pos + 4];
    case 6: need(8); return [v.getFloat64(pos, true), pos + 8];
    case 7: { need(4); const n = v.getInt32(pos, true); need(4 + n); return [null, pos + 4 + n]; }
    case 8: { need(2); const n = v.getUint16(pos, true); need(2 + n); return [utf8.decode(b.subarray(pos + 2, pos + 2 + n)), pos + 2 + n]; }
    case 9: { need(5); const et = b[pos], n = v.getInt32(pos + 1, true); let p = pos + 5; const out: unknown[] = []; for (let i = 0; i < n; i++) { const [x, e] = leValue(b, p, et, depth + 1); out.push(x); p = e; } return [out, p]; }
    case 10: {
      const out: Record<string, unknown> = {}; let p = pos;
      for (;;) {
        need(1); const t = b[p++]; if (t === 0) return [out, p];
        const [name, e] = leValue(b, p, 8) as [string, number];
        const [val, e2] = leValue(b, e, t, depth + 1); out[name] = val; p = e2;
      }
    }
    case 11: { need(4); const n = v.getInt32(pos, true); need(4 + n * 4); return [null, pos + 4 + n * 4]; }
    case 12: { need(4); const n = v.getInt32(pos, true); need(4 + n * 8); return [null, pos + 4 + n * 8]; }
    default: throw new Error(`Bedrock block data has an unknown part (${type})`);
  }
}

/** One palette entry: the block it names, and its exact bytes so it is written back unchanged. */
export function readPaletteEntry(b: Uint8Array, pos: number): { state: BlockState; raw: Uint8Array; version?: number; end: number } {
  if (b[pos] !== 10) throw new Error('Bedrock block palette entry is not a compound');
  const [, nameEnd] = leValue(b, pos + 1, 8);
  const [c, end] = leValue(b, nameEnd, 10) as [Record<string, unknown>, number];
  const props: Record<string, string> = {};
  const states = c.states && typeof c.states === 'object' ? c.states as Record<string, unknown> : undefined;
  if (states) for (const [k, val] of Object.entries(states)) if (typeof val === 'string' || typeof val === 'number') props[k] = String(val);
  if (!states && typeof c.val === 'number') props.val = String(c.val);
  const state: BlockState = { name: typeof c.name === 'string' ? c.name : 'minecraft:air' };
  if (Object.keys(props).length) state.properties = props;
  return { state, raw: b.slice(pos, end), version: typeof c.version === 'number' ? c.version : undefined, end };
}

/** The bytes for air, for worlds where no air entry has been read yet. */
export function airEntry(version: number): Uint8Array {
  const name = utf8e.encode('minecraft:air');
  const out = new Uint8Array(3 + 3 + 4 + 2 + name.length + 3 + 6 + 1 + 3 + 7 + 4 + 1); const v = view(out); let p = 0;
  const str = (s: string) => { const e = utf8e.encode(s); v.setUint16(p, e.length, true); out.set(e, p + 2); p += 2 + e.length; };
  out[p++] = 10; str('');
  out[p++] = 8; str('name'); str('minecraft:air');
  out[p++] = 10; str('states'); out[p++] = 0;
  out[p++] = 3; str('version'); v.setInt32(p, version, true); p += 4;
  out[p++] = 0;
  return out.subarray(0, p);
}

export interface Storage { indices: Uint16Array; palette: Uint8Array[] } // indices in (y*16+z)*16+x order

function decodeStorage(b: Uint8Array, pos: number): { storage: Storage; states: BlockState[]; versions: number[]; end: number } {
  const head = b[pos++]; const bits = head >> 1;
  if (head & 1) throw new Error('This sub-chunk uses network block ids, which are not kept on disk');
  if (![0, 1, 2, 3, 4, 5, 6, 8, 16].includes(bits)) throw new Error(`Bedrock sub-chunk uses ${bits} bits per block, which is not valid`);
  const indices = new Uint16Array(4096);
  if (bits > 0) {
    const per = Math.floor(32 / bits), words = Math.ceil(4096 / per), m = (1 << bits) - 1;
    if (pos + words * 4 > b.length) throw new Error('Bedrock sub-chunk is cut short');
    const v = view(b);
    for (let i = 0; i < 4096; i++) {
      const val = (v.getUint32(pos + Math.floor(i / per) * 4, true) >>> ((i % per) * bits)) & m;
      const x = i >> 8, z = (i >> 4) & 15, y = i & 15;
      indices[(y * 16 + z) * 16 + x] = val;
    }
    pos += words * 4;
  }
  let count = 1;
  if (!(bits === 0 && b[pos] === 10)) { count = view(b).getInt32(pos, true); pos += 4; }
  if (count < 1 || count > 4096) throw new Error('Bedrock sub-chunk palette size is not valid');
  const palette: Uint8Array[] = [], states: BlockState[] = [], versions: number[] = [];
  for (let i = 0; i < count; i++) { const e = readPaletteEntry(b, pos); palette.push(e.raw); states.push(e.state); if (e.version !== undefined) versions.push(e.version); pos = e.end; }
  return { storage: { indices, palette }, states, versions, end: pos };
}

function encodeStorage(s: Storage): Uint8Array {
  const bits = [1, 2, 3, 4, 5, 6, 8, 16].find((n) => 2 ** n >= s.palette.length)!;
  const per = Math.floor(32 / bits), words = Math.ceil(4096 / per);
  const size = s.palette.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(1 + words * 4 + 4 + size); const v = view(out);
  out[0] = bits << 1;
  const w = new Uint32Array(words);
  for (let i = 0; i < 4096; i++) {
    const x = i >> 8, z = (i >> 4) & 15, y = i & 15;
    w[Math.floor(i / per)] |= s.indices[(y * 16 + z) * 16 + x] << ((i % per) * bits);
  }
  for (let i = 0; i < words; i++) v.setUint32(1 + i * 4, w[i], true);
  v.setInt32(1 + words * 4, s.palette.length, true);
  let p = 5 + words * 4;
  for (const e of s.palette) { out.set(e, p); p += e.length; }
  return out;
}

export interface SubChunk { version: number; y: number; layers: Storage[]; states: BlockState[]; versions: number[] }

/** Decode one sub-chunk value. `keyY` is the height index from its database key. */
export function decodeSubChunk(b: Uint8Array, keyY: number): SubChunk {
  const version = b[0]; let pos = 1, count = 1, y = keyY;
  if (version === 8 || version === 9) { count = b[pos++]; if (version === 9) y = view(b).getInt8(pos++); }
  else if (version !== 1) throw new Error(`This chunk is in an older Bedrock format (sub-chunk version ${version}). Open the world in the game once to update it.`);
  const layers: Storage[] = []; let states: BlockState[] = []; let versions: number[] = [];
  for (let i = 0; i < count; i++) {
    const d = decodeStorage(b, pos); pos = d.end; layers.push(d.storage);
    if (i === 0) states = d.states;
    versions = versions.concat(d.versions);
  }
  if (!layers.length) layers.push({ indices: new Uint16Array(4096), palette: [] });
  return { version, y, layers, states, versions };
}

export function encodeSubChunk(version: number, y: number, layers: Storage[]): Uint8Array {
  const head = version === 9 ? [9, layers.length, y & 0xff] : version === 8 ? [8, layers.length] : [1];
  return Buffer.concat([Uint8Array.from(head), ...(version === 1 ? layers.slice(0, 1) : layers).map(encodeStorage)]);
}

function chunkKey(dim: Dimension, cx: number, cz: number, tag: number, y?: number): Uint8Array {
  const d = DIM_ID[dim], n = 8 + (d ? 4 : 0) + 1 + (y === undefined ? 0 : 1);
  const k = new Uint8Array(n); const v = view(k);
  v.setInt32(0, cx, true); v.setInt32(4, cz, true);
  let p = 8; if (d) { v.setInt32(8, d, true); p = 12; }
  k[p++] = tag; if (y !== undefined) k[p] = y & 0xff;
  return k;
}

interface Loaded { version: number; extra: Storage[]; indices: Uint16Array; keys: string[] }

export async function bedrockWorldInfo(dir: string): Promise<WorldInfo> {
  let name = path.basename(dir);
  try { name = (await fs.readFile(path.join(dir, 'levelname.txt'), 'utf8')).trim().slice(0, 80) || name; } catch { /* no name file */ }
  return { path: dir, name, versionName: 'Bedrock Edition', dimensions: ['overworld', 'nether', 'end'], edition: 'bedrock' };
}

export class BedrockWorld {
  private db: LevelDb | undefined;
  private chunks = new Map<string, Chunk>();
  private loaded = new Map<string, Map<number, Loaded>>();
  private dirty = new Set<string>();
  /** Exact bytes for every block seen in this world, so blocks are written back exactly as the game wrote them. */
  private raw = new Map<string, Uint8Array>();
  private blockVersion = 17959425; // 1.18.0, replaced by what the world itself uses
  private subVersion = 9;

  private constructor(public dir: string, public info: WorldInfo) {}

  static async open(dir: string): Promise<BedrockWorld> {
    if (!existsSync(path.join(dir, 'db', 'CURRENT'))) throw new Error(`No Bedrock database in ${dir}`);
    const w = new BedrockWorld(dir, await bedrockWorldInfo(dir));
    await w.database();
    return w;
  }

  private async database(): Promise<LevelDb> {
    this.db ??= await LevelDb.open(path.join(this.dir, 'db'));
    return this.db;
  }

  async listChunks(dim: Dimension): Promise<Array<[number, number]>> {
    const db = await this.database(); const d = DIM_ID[dim]; const seen = new Set<string>(); const out: Array<[number, number]> = [];
    for (const k of db.keys()) {
      const n = k.length;
      if (!(d === 0 ? n === 10 && k[8] === SUBCHUNK : n === 14 && k[12] === SUBCHUNK && view(k).getInt32(8, true) === d)) continue;
      const cx = view(k).getInt32(0, true), cz = view(k).getInt32(4, true), id = `${cx}:${cz}`;
      if (!seen.has(id)) { seen.add(id); out.push([cx, cz]); }
    }
    return out;
  }

  /** Chunks are read as the game left them; new chunks are never invented in a Bedrock world. */
  async chunk(dim: Dimension, cx: number, cz: number): Promise<Chunk | undefined> {
    const key = `${dim}:${cx}:${cz}`;
    const cached = this.chunks.get(key); if (cached) return cached;
    const db = await this.database();
    const c = new Chunk(cx, cz, { name: '', tag: nbt.compound({}) });
    const metas = new Map<number, Loaded>();
    for (let y = -4; y <= 31; y++) {
      const val = db.get(chunkKey(dim, cx, cz, SUBCHUNK, y)); if (!val) continue;
      const s = decodeSubChunk(val, y);
      for (let i = 0; i < s.states.length; i++) this.raw.set(blockKey(s.states[i]), s.layers[0].palette[i]);
      if (s.versions.length) this.blockVersion = s.versions[0];
      this.subVersion = s.version;
      const first = s.layers[0];
      c.sections.set(s.y, new Section(s.y, s.states.length ? s.states : undefined, first.indices));
      metas.set(s.y, { version: s.version, extra: s.layers.slice(1), indices: first.indices.slice(), keys: s.states.map(blockKey) });
    }
    if (!metas.size) return undefined;
    this.chunks.set(key, c); this.loaded.set(key, metas);
    return c;
  }

  async getBlock(dim: Dimension, x: number, y: number, z: number): Promise<BlockState | undefined> {
    const c = await this.chunk(dim, Math.floor(x / 16), Math.floor(z / 16));
    return c?.getBlock(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16);
  }

  private bytesFor(b: BlockState): Uint8Array | undefined {
    const known = this.raw.get(blockKey(b)); if (known) return known;
    if (b.name === 'minecraft:air' && !b.properties) { const a = airEntry(this.blockVersion); this.raw.set('minecraft:air', a); return a; }
    return undefined;
  }

  async setBlock(dim: Dimension, x: number, y: number, z: number, b: BlockState): Promise<boolean> {
    if (!this.bytesFor(b)) throw new Error(`Bedrock worlds take blocks that are already in the world, or air. Use Pick block on the map to choose ${b.name}, then try again.`);
    if (y < -64 || y > 319) return false;
    const c = await this.chunk(dim, Math.floor(x / 16), Math.floor(z / 16));
    if (!c) return false;
    c.setBlock(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16, b);
    this.dirty.add(`${dim}:${c.cx}:${c.cz}`);
    return true;
  }

  // Parts of a Bedrock world this editor does not change.
  async getBlockEntity() { return undefined; }
  async setBlockEntity() { return false; }
  async setBiome() { return false; }
  async getBiome() { return undefined; }
  async entitiesIn() { return []; }
  async addEntity() { return false; }

  get unsavedChunks() { return this.dirty.size; }

  /** Write every changed sub-chunk as one new log file. Returns the files written. */
  async save(): Promise<string[]> {
    const db = await this.database();
    const puts: Array<[Uint8Array, Uint8Array]> = [];
    for (const key of this.dirty) {
      const [dim, cxs, czs] = key.split(':') as [Dimension, string, string];
      const c = this.chunks.get(key)!; const metas = this.loaded.get(key)!;
      for (const [sy, sec] of c.sections) {
        sec.compact();
        const keys = sec.palette.map(blockKey); const meta = metas.get(sy);
        let changed = !meta;
        if (meta) for (let i = 0; i < 4096; i++) if (keys[sec.indices[i]] !== meta.keys[meta.indices[i]]) { changed = true; break; }
        if (!changed) continue;
        if (!meta && keys.every((k) => k === 'minecraft:air')) continue; // nothing was put in a new section
        const palette = sec.palette.map((p) => this.bytesFor(p)!);
        const extra = (meta?.extra ?? []).map((layer) => {
          // A changed block loses whatever was in its second layer (the water of a waterlogged block).
          const air = this.bytesFor({ name: 'minecraft:air' })!;
          const pal = layer.palette.slice(); let airAt = pal.findIndex((p) => Buffer.compare(p, air) === 0);
          const idx = layer.indices.slice();
          for (let i = 0; i < 4096; i++) if (keys[sec.indices[i]] !== meta!.keys[meta!.indices[i]]) { if (airAt < 0) { airAt = pal.length; pal.push(air); } idx[i] = airAt; }
          return { indices: idx, palette: pal };
        });
        const version = meta?.version ?? this.subVersion;
        puts.push([chunkKey(dim, Number(cxs), Number(czs), SUBCHUNK, sy), encodeSubChunk(version, sy, [{ indices: sec.indices, palette }, ...extra])]);
        metas.set(sy, { version, extra, indices: sec.indices.slice(), keys });
      }
    }
    this.dirty.clear();
    const file = await db.write(puts);
    return file ? [file] : [];
  }

  /** Drop cached data so the next read comes from disk (after a history restore). */
  reload() {
    this.db = undefined; this.chunks.clear(); this.loaded.clear(); this.dirty.clear();
  }
}
