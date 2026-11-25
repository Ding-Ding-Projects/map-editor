// Structure files (.nbt), the format of Minecraft's structure blocks and /place template:
// a gzip NBT compound with size, a block-state palette, and block positions relative to the origin.
// Block entities (chest contents and the like) and entities are not carried in this version.
import { gunzipSync, gzipSync } from 'node:zlib';
import { nbt, readNbt, writeNbt, getList, getNumber, getString, getCompound, TagType, type Tag } from './nbt.js';
import { blockKey, type BlockState } from './chunk.js';
import { normalize, volume, MAX_OPERATION_BLOCKS, type Box, type OpResult } from './ops.js';
import type { World, Dimension } from './world.js';

export const MAX_STRUCTURE_BLOCKS = 48 * 48 * 48 * 8; // vanilla structure blocks stop at 48³; files may be larger

export interface Structure { size: [number, number, number]; dataVersion: number; blocks: Array<{ pos: [number, number, number]; state: BlockState }> }

/** Read the blocks of a box (air included, so placing it clears what was there) into a structure. */
export async function captureStructure(world: World, dim: Dimension, box: Box, dataVersion: number): Promise<Structure> {
  const b = normalize(box);
  if (volume(b) > MAX_STRUCTURE_BLOCKS) throw new Error(`A structure can hold up to ${MAX_STRUCTURE_BLOCKS.toLocaleString('en')} blocks.`);
  const blocks: Structure['blocks'] = [];
  for (let x = b.x1; x <= b.x2; x++) for (let y = b.y1; y <= b.y2; y++) for (let z = b.z1; z <= b.z2; z++) {
    const state = await world.getBlock(dim, x, y, z);
    if (state) blocks.push({ pos: [x - b.x1, y - b.y1, z - b.z1], state });
  }
  return { size: [b.x2 - b.x1 + 1, b.y2 - b.y1 + 1, b.z2 - b.z1 + 1], dataVersion, blocks };
}

export function encodeStructure(s: Structure): Buffer {
  const palette: BlockState[] = [];
  const index = new Map<string, number>();
  const blocks: Tag[] = s.blocks.map(({ pos, state }) => {
    const key = blockKey(state);
    let i = index.get(key);
    if (i === undefined) { i = palette.length; palette.push(state); index.set(key, i); }
    return nbt.compound({ pos: nbt.list(TagType.Int, pos.map((v) => nbt.int(v))), state: nbt.int(i) });
  });
  const root = nbt.compound({
    DataVersion: nbt.int(s.dataVersion),
    size: nbt.list(TagType.Int, s.size.map((v) => nbt.int(v))),
    palette: nbt.list(TagType.Compound, palette.map((p) => nbt.compound({
      Name: nbt.string(p.name),
      ...(p.properties && Object.keys(p.properties).length ? { Properties: nbt.compound(Object.fromEntries(Object.entries(p.properties).map(([k, v]) => [k, nbt.string(v)]))) } : {}),
    }))),
    blocks: nbt.list(TagType.Compound, blocks),
    entities: nbt.list(TagType.Compound, []),
  });
  return gzipSync(writeNbt({ name: '', tag: root }));
}

export function decodeStructure(buf: Uint8Array): Structure {
  let raw: Uint8Array;
  try { raw = gunzipSync(buf); } catch { raw = buf; } // some tools save it uncompressed
  const root = readNbt(raw).tag;
  const ints = (list: Tag[] | undefined) => (list ?? []).map((v) => (v.type === TagType.Int ? v.value : NaN));
  const size = ints(getList(root, 'size'));
  if (size.length !== 3 || size.some((v) => !Number.isInteger(v) || v < 1 || v > 4096)) throw new Error('This is not a structure file: its size is missing or invalid.');
  if (size[0] * size[1] * size[2] > MAX_OPERATION_BLOCKS) throw new Error('This structure is larger than the operation limit.');
  // Files with several palettes (random variants) use the first one.
  const multi = getList(root, 'palettes')?.[0];
  const palettes = getList(root, 'palette') ?? (multi?.type === TagType.List ? multi.value : []);
  const palette: BlockState[] = palettes.map((p) => {
    const name = getString(p, 'Name');
    if (!name) throw new Error('A palette entry has no block name.');
    const props = getCompound(p, 'Properties');
    const properties = props ? Object.fromEntries([...props.value].map(([k, v]) => [k, v.type === TagType.String ? v.value : String((v as { value: unknown }).value)])) : undefined;
    return properties && Object.keys(properties).length ? { name, properties } : { name };
  });
  const blocks: Structure['blocks'] = (getList(root, 'blocks') ?? []).map((b) => {
    const pos = ints(getList(b, 'pos')) as [number, number, number];
    const state = palette[getNumber(b, 'state') ?? -1];
    if (pos.length !== 3 || !state) throw new Error('A block in the structure points outside its palette.');
    if (pos.some((v, i) => v < 0 || v >= size[i])) throw new Error('A block in the structure lies outside its size.');
    return { pos, state };
  });
  return { size: size as [number, number, number], dataVersion: getNumber(root, 'DataVersion') ?? 0, blocks };
}

/** Place a structure with its origin at a corner. Chunks that do not exist are skipped, never invented. */
export async function placeStructure(world: World, dim: Dimension, s: Structure, at: { x: number; y: number; z: number }): Promise<OpResult> {
  const t0 = Date.now();
  let changed = 0, skipped = 0;
  const chunks = new Set<string>();
  for (const { pos, state } of s.blocks) {
    const x = at.x + pos[0], y = at.y + pos[1], z = at.z + pos[2];
    if (y < -64 || y > 319) { skipped++; continue; }
    if (await world.setBlock(dim, x, y, z, state)) { changed++; chunks.add(`${Math.floor(x / 16)},${Math.floor(z / 16)}`); } else skipped++;
  }
  return { changed, skipped, chunks: chunks.size, ms: Date.now() - t0 };
}
