// Edit operations, ported in behaviour from Amulet's stock operation plugins
// (fill, replace, delete, clone, waterlog) and its selection box model.
import { blockKey, type BlockState } from './chunk.js';
import type { Dimension, World } from './world.js';

export interface Box { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number }

export function normalize(b: Box): Box {
  return {
    x1: Math.min(b.x1, b.x2), y1: Math.min(b.y1, b.y2), z1: Math.min(b.z1, b.z2),
    x2: Math.max(b.x1, b.x2), y2: Math.max(b.y1, b.y2), z2: Math.max(b.z1, b.z2),
  };
}

export function volume(b: Box) {
  const n = normalize(b);
  return (n.x2 - n.x1 + 1) * (n.y2 - n.y1 + 1) * (n.z2 - n.z1 + 1);
}

/** Upper bound for one operation, so a typo cannot hang the app. */
export const MAX_OPERATION_BLOCKS = 16_777_216;

export interface OpResult { changed: number; skipped: number; chunks: number; ms: number }

function check(b: Box) {
  const v = volume(b);
  if (v > MAX_OPERATION_BLOCKS) throw new Error(`Selection is ${v.toLocaleString('en')} blocks; the limit is ${MAX_OPERATION_BLOCKS.toLocaleString('en')}.`);
}

async function forEachBlock(world: World, dim: Dimension, box: Box, fn: (x: number, y: number, z: number, current: BlockState) => BlockState | undefined): Promise<OpResult> {
  const t0 = Date.now();
  const b = normalize(box);
  check(b);
  let changed = 0, skipped = 0;
  const chunks = new Set<string>();
  for (let cx = Math.floor(b.x1 / 16); cx <= Math.floor(b.x2 / 16); cx++) {
    for (let cz = Math.floor(b.z1 / 16); cz <= Math.floor(b.z2 / 16); cz++) {
      const c = await world.chunk(dim, cx, cz);
      const x0 = Math.max(b.x1, cx * 16), x1 = Math.min(b.x2, cx * 16 + 15);
      const z0 = Math.max(b.z1, cz * 16), z1 = Math.min(b.z2, cz * 16 + 15);
      if (!c) { skipped += (x1 - x0 + 1) * (z1 - z0 + 1) * (b.y2 - b.y1 + 1); continue; }
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = b.y1; y <= b.y2; y++) {
        const cur = c.getBlock(x & 15, y, z & 15);
        const next = fn(x, y, z, cur);
        if (next && blockKey(next) !== blockKey(cur)) {
          await world.setBlock(dim, x, y, z, next);
          changed++;
          chunks.add(`${cx},${cz}`);
        }
      }
    }
  }
  return { changed, skipped, chunks: chunks.size, ms: Date.now() - t0 };
}

export function fill(world: World, dim: Dimension, box: Box, block: BlockState) {
  return forEachBlock(world, dim, box, () => block);
}

export function replace(world: World, dim: Dimension, box: Box, from: BlockState, to: BlockState, matchProperties = false) {
  const fk = blockKey(from);
  return forEachBlock(world, dim, box, (_x, _y, _z, cur) => {
    const hit = matchProperties ? blockKey(cur) === fk : cur.name === from.name;
    return hit ? to : undefined;
  });
}

export function deleteBlocks(world: World, dim: Dimension, box: Box) {
  return fill(world, dim, box, { name: 'minecraft:air' });
}

/** Set waterlogged=true on blocks in the box that already declare a waterlogged property. */
export function waterlog(world: World, dim: Dimension, box: Box, value = true) {
  return forEachBlock(world, dim, box, (_x, _y, _z, cur) => {
    if (!cur.properties || !('waterlogged' in cur.properties)) return undefined;
    return { name: cur.name, properties: { ...cur.properties, waterlogged: String(value) } };
  });
}

/** Copy a box to a new origin (the destination's minimum corner). Reads everything first so overlap is safe. */
export async function clone(world: World, dim: Dimension, box: Box, dest: { x: number; y: number; z: number }): Promise<OpResult> {
  const t0 = Date.now();
  const b = normalize(box);
  check(b);
  const buf: Array<[number, number, number, BlockState]> = [];
  for (let x = b.x1; x <= b.x2; x++) for (let z = b.z1; z <= b.z2; z++) for (let y = b.y1; y <= b.y2; y++) {
    const bl = await world.getBlock(dim, x, y, z);
    if (bl) buf.push([x - b.x1, y - b.y1, z - b.z1, bl]);
  }
  let changed = 0, skipped = 0;
  const chunks = new Set<string>();
  for (const [dx, dy, dz, bl] of buf) {
    const x = dest.x + dx, y = dest.y + dy, z = dest.z + dz;
    if (await world.setBlock(dim, x, y, z, bl)) { changed++; chunks.add(`${Math.floor(x / 16)},${Math.floor(z / 16)}`); }
    else skipped++;
  }
  return { changed, skipped, chunks: chunks.size, ms: Date.now() - t0 };
}

export const OPERATIONS = ['fill', 'replace', 'delete', 'clone', 'waterlog'] as const;
export type OperationName = typeof OPERATIONS[number];
