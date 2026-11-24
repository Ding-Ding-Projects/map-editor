import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readNbt, writeNbt, nbt, TagType, getString } from '../src/core/nbt.js';
import { RegionFile } from '../src/core/region.js';
import { Chunk, pack, unpack, parseBlock, blockKey } from '../src/core/chunk.js';
import { World, createWorld } from '../src/core/world.js';
import { fill, replace, clone, deleteBlocks, volume, MAX_OPERATION_BLOCKS } from '../src/core/ops.js';
import { WorldHistory } from '../src/core/history.js';

async function tmp(prefix: string) { return mkdtemp(path.join(os.tmpdir(), prefix)); }

async function makeWorld() {
  const dir = await tmp('me-world-');
  await createWorld(dir, 'Test World');
  const w = await World.open(dir);
  // Create a 2x2 chunk area with a stone floor at y=60.
  for (let cx = 0; cx < 2; cx++) for (let cz = 0; cz < 2; cz++) {
    const c = (await w.chunk('overworld', cx, cz, true))!;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) c.setBlock(x, 60, z, { name: 'minecraft:stone' });
    await w.setBlock('overworld', cx * 16, 60, cz * 16, { name: 'minecraft:stone' });
  }
  await w.save();
  return dir;
}

describe('nbt', () => {
  it('round-trips every tag type', () => {
    const root = { name: 'root', tag: nbt.compound({
      b: nbt.byte(-3), s: nbt.short(1234), i: nbt.int(-70000), l: nbt.long(-(2n ** 40n)),
      f: nbt.float(1.5), d: nbt.double(Math.PI), str: nbt.string('héllo 粵'),
      list: nbt.list(TagType.Int, [nbt.int(1), nbt.int(2)]),
      ia: nbt.intArray(new Int32Array([1, -2, 3])), la: nbt.longArray(new BigInt64Array([5n, -6n])),
      ba: { type: TagType.ByteArray, value: new Int8Array([1, -1]) },
    }) };
    const back = readNbt(writeNbt(root));
    expect(back.name).toBe('root');
    expect(writeNbt(back)).toEqual(writeNbt(root));
    expect(getString(back.tag, 'str')).toBe('héllo 粵');
  });
  it('rejects truncated input instead of reading past the end', () => {
    const bytes = writeNbt({ name: '', tag: nbt.compound({ s: nbt.string('abc') }) });
    expect(() => readNbt(bytes.subarray(0, bytes.length - 3))).toThrow(/truncated/);
  });
});

describe('packed block states', () => {
  it('pack and unpack agree for every bit width', () => {
    for (const bits of [4, 5, 6, 7, 8, 12]) {
      const vals = new Uint16Array(4096).map((_, i) => (i * 7) % (1 << bits));
      expect(unpack(pack(vals, bits), bits, 4096)).toEqual(vals);
    }
  });
  it('parses block ids with properties', () => {
    const b = parseBlock('oak_stairs[facing=north,waterlogged=false]');
    expect(b.name).toBe('minecraft:oak_stairs');
    expect(blockKey(b)).toBe('minecraft:oak_stairs[facing=north,waterlogged=false]');
    expect(() => parseBlock('Not A Block!')).toThrow();
  });
});

describe('region', () => {
  it('writes and reads chunks through a serialized region', () => {
    const r = RegionFile.empty();
    const c = Chunk.createEmpty(3, 4);
    c.setBlock(1, 2, 3, { name: 'minecraft:diamond_block' });
    r.write(3, 4, c.toNbt());
    const r2 = RegionFile.parse(r.serialize());
    const c2 = Chunk.fromNbt(3, 4, r2.read(3, 4)!);
    expect(c2.getBlock(1, 2, 3).name).toBe('minecraft:diamond_block');
    expect(c2.getBlock(0, 0, 0).name).toBe('minecraft:air');
    expect(r2.chunks()).toEqual([[3, 4]]);
  });
});

describe('world and operations', () => {
  it('fills, replaces, clones and deletes, then persists to disk', async () => {
    const dir = await makeWorld();
    const w = await World.open(dir);
    expect(w.info.name).toBe('Test World');
    expect((await w.listChunks('overworld')).length).toBe(4);

    const box = { x1: 2, y1: 61, z1: 2, x2: 20, y2: 63, z2: 20 };
    const f = await fill(w, 'overworld', box, { name: 'minecraft:oak_planks' });
    expect(f.changed).toBe(volume(box));
    const r = await replace(w, 'overworld', box, { name: 'minecraft:oak_planks' }, { name: 'minecraft:glass' });
    expect(r.changed).toBe(volume(box));
    const c = await clone(w, 'overworld', { x1: 2, y1: 61, z1: 2, x2: 3, y2: 61, z2: 3 }, { x: 25, y: 70, z: 25 });
    expect(c.changed).toBe(4);
    await w.save();

    const w2 = await World.open(dir);
    expect((await w2.getBlock('overworld', 10, 62, 10))!.name).toBe('minecraft:glass');
    expect((await w2.getBlock('overworld', 26, 70, 26))!.name).toBe('minecraft:glass');
    expect((await w2.getBlock('overworld', 10, 60, 10))!.name).toBe('minecraft:stone');

    const d = await deleteBlocks(w2, 'overworld', { x1: 0, y1: 60, z1: 0, x2: 0, y2: 60, z2: 0 });
    expect(d.changed).toBe(1);
  });
  it('skips blocks in chunks that do not exist instead of inventing terrain', async () => {
    const dir = await makeWorld();
    const w = await World.open(dir);
    const res = await fill(w, 'overworld', { x1: 100, y1: 0, z1: 100, x2: 101, y2: 0, z2: 101 }, { name: 'minecraft:stone' });
    expect(res.changed).toBe(0);
    expect(res.skipped).toBe(4);
  });
  it('refuses selections above the safety limit', async () => {
    const dir = await makeWorld();
    const w = await World.open(dir);
    const side = Math.ceil(Math.cbrt(MAX_OPERATION_BLOCKS)) + 1;
    await expect(fill(w, 'overworld', { x1: 0, y1: 0, z1: 0, x2: side, y2: side, z2: side }, { name: 'minecraft:air' })).rejects.toThrow(/limit/);
  });
});

describe('local history', () => {
  it('keeps the repository outside the world and restores append-only', async () => {
    const dir = await makeWorld();
    const data = await tmp('me-data-');
    const h = await WorldHistory.open(data, dir);
    expect(existsSync(path.join(dir, '.git'))).toBe(false);
    expect(h.gitdir.startsWith(data)).toBe(true);

    const w = await World.open(dir);
    await fill(w, 'overworld', { x1: 0, y1: 61, z1: 0, x2: 3, y2: 61, z2: 3 }, { name: 'minecraft:gold_block' });
    await w.save();
    const e1 = await h.record('filled', 'Filled 4×1×4 with gold_block');
    expect(e1).toBeDefined();
    expect(await h.record('edited', 'nothing changed')).toBeUndefined();

    const list = await h.list();
    expect(list.map((e: { action: string }) => e.action)).toEqual(['filled', 'opened']);

    const baseline = list[1].sha;
    const regionBefore = await readFile(path.join(dir, 'region', 'r.0.0.mca'));
    await h.restore(baseline);
    const w2 = await World.open(dir);
    expect((await w2.getBlock('overworld', 1, 61, 1))!.name).toBe('minecraft:air');

    const after = await h.list();
    expect(after.map((e: { action: string }) => e.action)).toEqual(['restored', 'filled', 'opened']);
    // The restore itself can be undone.
    await h.restore(after[1].sha);
    expect(await readFile(path.join(dir, 'region', 'r.0.0.mca'))).toEqual(regionBefore);
  });
  it('refuses to touch a world that has its own .git', async () => {
    const dir = await makeWorld();
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.join(dir, '.git'));
    await expect(WorldHistory.open(await tmp('me-data-'), dir)).rejects.toThrow(/own \.git/);
  });
});
