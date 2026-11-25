// Java Edition chunk sections (1.18+ format: sections with block_states palette + packed longs).
import { getCompound, getList, getLongArray, getNumber, getString, nbt, TagType, type CompoundTag, type NamedTag, type Tag } from './nbt.js';

export interface BlockState { name: string; properties?: Record<string, string> }

export function blockKey(b: BlockState): string {
  if (!b.properties || Object.keys(b.properties).length === 0) return b.name;
  const props = Object.keys(b.properties).sort().map((k) => `${k}=${b.properties![k]}`).join(',');
  return `${b.name}[${props}]`;
}

export function parseBlock(text: string): BlockState {
  const t = text.trim();
  const m = /^([a-z0-9_.-]+:)?([a-z0-9_./-]+)(\[(.*)\])?$/.exec(t);
  if (!m) throw new Error(`Not a block id: ${text}`);
  const name = (m[1] ?? 'minecraft:') + m[2];
  const properties: Record<string, string> = {};
  if (m[4]) for (const kv of m[4].split(',')) {
    const [k, v] = kv.split('=');
    if (!k || v === undefined) throw new Error(`Bad block property in ${text}`);
    properties[k.trim()] = v.trim();
  }
  return Object.keys(properties).length ? { name, properties } : { name };
}

const AIR: BlockState = { name: 'minecraft:air' };

/** One 16x16x16 section with an expanded index array for simple editing. */
export class Section {
  palette: BlockState[];
  indices: Uint16Array; // 4096, index = (y*16 + z)*16 + x
  constructor(public y: number, palette?: BlockState[], indices?: Uint16Array) {
    this.palette = palette ?? [AIR];
    this.indices = indices ?? new Uint16Array(4096);
  }
  get(x: number, y: number, z: number): BlockState { return this.palette[this.indices[(y * 16 + z) * 16 + x]] ?? AIR; }
  set(x: number, y: number, z: number, b: BlockState) {
    const key = blockKey(b);
    let idx = this.palette.findIndex((p) => blockKey(p) === key);
    if (idx < 0) { idx = this.palette.length; this.palette.push(b); }
    this.indices[(y * 16 + z) * 16 + x] = idx;
  }
  /** Drop unused palette entries. */
  compact() {
    const used = new Set(this.indices);
    const remap = new Map<number, number>();
    const pal: BlockState[] = [];
    for (let i = 0; i < this.palette.length; i++) if (used.has(i)) { remap.set(i, pal.length); pal.push(this.palette[i]); }
    if (pal.length === 0) pal.push(AIR);
    for (let i = 0; i < 4096; i++) this.indices[i] = remap.get(this.indices[i]) ?? 0;
    this.palette = pal;
  }
}

/** Unpack 1.16+ style packed longs (entries never span two longs). */
export function unpack(data: BigInt64Array, bits: number, count: number): Uint16Array {
  const out = new Uint16Array(count);
  const perLong = Math.floor(64 / bits);
  const mask = (1n << BigInt(bits)) - 1n;
  for (let i = 0; i < count; i++) {
    const li = Math.floor(i / perLong);
    const shift = BigInt((i % perLong) * bits);
    const word = BigInt.asUintN(64, data[li] ?? 0n);
    out[i] = Number((word >> shift) & mask);
  }
  return out;
}

export function pack(values: Uint16Array, bits: number): BigInt64Array {
  const perLong = Math.floor(64 / bits);
  const out = new BigInt64Array(Math.ceil(values.length / perLong));
  for (let li = 0; li < out.length; li++) {
    let word = 0n;
    for (let j = 0; j < perLong; j++) {
      const i = li * perLong + j;
      if (i >= values.length) break;
      word |= BigInt(values[i]) << BigInt(j * bits);
    }
    out[li] = BigInt.asIntN(64, word);
  }
  return out;
}

function blockFromTag(t: Tag): BlockState {
  const name = getString(t, 'Name') ?? 'minecraft:air';
  const props = getCompound(t, 'Properties');
  if (!props) return { name };
  const properties: Record<string, string> = {};
  for (const [k, v] of props.value) if (v.type === TagType.String) properties[k] = v.value;
  return { name, properties };
}

function blockToTag(b: BlockState): CompoundTag {
  const m: Record<string, Tag> = { Name: nbt.string(b.name) };
  if (b.properties && Object.keys(b.properties).length) {
    m.Properties = nbt.compound(Object.fromEntries(Object.entries(b.properties).map(([k, v]) => [k, nbt.string(v)])));
  }
  return nbt.compound(m);
}

/** Biomes of one section: 4×4×4 cells, index = (y*4 + z)*4 + x, each naming a biome. */
export interface SectionBiomes { palette: string[]; indices: Uint8Array }

export class Chunk {
  sections = new Map<number, Section>();
  biomes = new Map<number, SectionBiomes>();
  constructor(public cx: number, public cz: number, public root: NamedTag) {}

  static fromNbt(cx: number, cz: number, root: NamedTag): Chunk {
    const c = new Chunk(cx, cz, root);
    const level = root.tag;
    const sections = getList(level, 'sections');
    if (!sections) throw new Error(`Chunk ${cx},${cz} is not in the 1.18+ format this editor reads`);
    for (const s of sections) {
      const y = getNumber(s, 'Y');
      const bs = getCompound(s, 'block_states');
      if (y === undefined || !bs) continue;
      const palette = (getList(bs, 'palette') ?? []).map(blockFromTag);
      const data = getLongArray(bs, 'data');
      let indices: Uint16Array;
      if (palette.length <= 1 || !data) indices = new Uint16Array(4096);
      else indices = unpack(data, Math.max(4, Math.ceil(Math.log2(palette.length))), 4096);
      c.sections.set(y, new Section(y, palette.length ? palette : [AIR], indices));
      const bi = getCompound(s, 'biomes');
      if (bi) {
        const bp = (getList(bi, 'palette') ?? []).map((t) => (t.type === TagType.String ? t.value : 'minecraft:plains'));
        const bd = getLongArray(bi, 'data');
        const idx = bp.length > 1 && bd ? Uint8Array.from(unpack(bd, Math.ceil(Math.log2(bp.length)), 64)) : new Uint8Array(64);
        c.biomes.set(y, { palette: bp.length ? bp : ['minecraft:plains'], indices: idx });
      }
    }
    return c;
  }

  static createEmpty(cx: number, cz: number, dataVersion = 4189, minY = -4, maxY = 19): Chunk {
    const root: NamedTag = {
      name: '',
      tag: nbt.compound({
        DataVersion: nbt.int(dataVersion),
        xPos: nbt.int(cx), zPos: nbt.int(cz), yPos: nbt.int(minY),
        Status: nbt.string('minecraft:full'),
        LastUpdate: nbt.long(0n),
        sections: nbt.list(TagType.Compound, []),
      }),
    };
    const c = new Chunk(cx, cz, root);
    for (let y = minY; y <= maxY; y++) c.sections.set(y, new Section(y));
    return c;
  }

  getBlock(x: number, y: number, z: number): BlockState {
    const s = this.sections.get(Math.floor(y / 16));
    return s ? s.get(x & 15, ((y % 16) + 16) % 16, z & 15) : AIR;
  }

  setBlock(x: number, y: number, z: number, b: BlockState) {
    const sy = Math.floor(y / 16);
    let s = this.sections.get(sy);
    if (!s) { s = new Section(sy); this.sections.set(sy, s); }
    s.set(x & 15, ((y % 16) + 16) % 16, z & 15, b);
  }

  getBiome(x: number, y: number, z: number): string | undefined {
    const b = this.biomes.get(Math.floor(y / 16));
    if (!b) return undefined;
    return b.palette[b.indices[((((y % 16) + 16) % 16 >> 2) * 4 + ((z & 15) >> 2)) * 4 + ((x & 15) >> 2)]];
  }

  /** Set the biome of the 4×4×4 cell holding a block (biomes are stored per cell, not per block). */
  setBiome(x: number, y: number, z: number, biome: string) {
    const sy = Math.floor(y / 16);
    let b = this.biomes.get(sy);
    if (!b) { b = { palette: ['minecraft:plains'], indices: new Uint8Array(64) }; this.biomes.set(sy, b); }
    let i = b.palette.indexOf(biome);
    if (i < 0) { i = b.palette.length; b.palette.push(biome); }
    b.indices[((((y % 16) + 16) % 16 >> 2) * 4 + ((z & 15) >> 2)) * 4 + ((x & 15) >> 2)] = i;
  }

  /** Highest non-air block in a column, or undefined. */
  top(x: number, z: number): { y: number; block: BlockState } | undefined {
    const ys = [...this.sections.keys()].sort((a, b) => b - a);
    for (const sy of ys) {
      const s = this.sections.get(sy)!;
      if (s.palette.length === 1 && s.palette[0].name.endsWith('air')) continue;
      for (let ly = 15; ly >= 0; ly--) {
        const b = s.get(x, ly, z);
        if (!b.name.endsWith(':air') && !b.name.endsWith(':cave_air') && !b.name.endsWith(':void_air')) return { y: sy * 16 + ly, block: b };
      }
    }
    return undefined;
  }

  toNbt(): NamedTag {
    const root = this.root.tag as CompoundTag;
    const existing = new Map<number, CompoundTag>();
    for (const s of getList(root, 'sections') ?? []) {
      const y = getNumber(s, 'Y');
      if (y !== undefined && s.type === TagType.Compound) existing.set(y, s);
    }
    const out: Tag[] = [];
    for (const y of [...this.sections.keys()].sort((a, b) => a - b)) {
      const s = this.sections.get(y)!;
      s.compact();
      const bs: Record<string, Tag> = { palette: nbt.list(TagType.Compound, s.palette.map(blockToTag)) };
      if (s.palette.length > 1) bs.data = nbt.longArray(pack(s.indices, Math.max(4, Math.ceil(Math.log2(s.palette.length)))));
      const prev = existing.get(y);
      const m = new Map<string, Tag>(prev ? prev.value : []);
      m.set('Y', nbt.byte(y));
      m.set('block_states', nbt.compound(bs));
      const bio = this.biomes.get(y);
      if (bio) {
        // Keep only used biomes, then pack like block states (1 bit minimum, no data for a single biome).
        const used = [...new Set(bio.indices)].sort((a, b) => a - b);
        const pal = used.map((u) => bio.palette[u]);
        const remap = new Map(used.map((u, k) => [u, k]));
        const idx = Uint16Array.from(bio.indices, (v) => remap.get(v) ?? 0);
        const t: Record<string, Tag> = { palette: nbt.list(TagType.String, pal.map((p) => nbt.string(p))) };
        if (pal.length > 1) t.data = nbt.longArray(pack(idx, Math.ceil(Math.log2(pal.length))));
        m.set('biomes', nbt.compound(t));
      }
      out.push(nbt.compound(m));
    }
    root.value.set('sections', nbt.list(TagType.Compound, out));
    // Lighting and heightmaps are stale after edits; ask the game to recompute them.
    root.value.delete('Heightmaps');
    root.value.set('isLightOn', nbt.byte(0));
    return this.root;
  }
}
