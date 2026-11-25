import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { createWorld, World } from '../src/core/world.js';
import { captureStructure, decodeStructure, encodeStructure, placeStructure } from '../src/core/structure.js';
import { readNbt, getList, TagType } from '../src/core/nbt.js';

async function world() {
  const dir = path.join(await mkdtemp(path.join(os.tmpdir(), 'me-st-')), 'W');
  await mkdir(dir);
  await createWorld(dir, 'W');
  const w = await World.open(dir);
  for (let cx = 0; cx < 2; cx++) await w.chunk('overworld', cx, 0, true);
  await w.setBlock('overworld', 1, 64, 1, { name: 'minecraft:oak_stairs', properties: { facing: 'east', half: 'bottom' } });
  await w.setBlock('overworld', 2, 64, 1, { name: 'minecraft:glass' });
  await w.setBlock('overworld', 2, 65, 2, { name: 'minecraft:glass' });
  return w;
}

describe('structure files', () => {
  it('captures, writes the vanilla layout, reads back and places blocks with their properties', async () => {
    const w = await world();
    const s = await captureStructure(w, 'overworld', { x1: 1, y1: 64, z1: 1, x2: 2, y2: 65, z2: 2 }, 4189);
    expect(s.size).toEqual([2, 2, 2]);
    expect(s.blocks).toHaveLength(8); // air included, so placing clears what was there
    const file = encodeStructure(s);
    const root = readNbt(gunzipSync(file)).tag;
    const palette = getList(root, 'palette')!;
    expect(palette.length).toBe(3); // stairs, glass, air
    expect(getList(root, 'entities')).toEqual([]);
    expect(getList(root, 'size')!.every((t) => t.type === TagType.Int)).toBe(true);
    const back = decodeStructure(file);
    expect(back.size).toEqual([2, 2, 2]);
    const r = await placeStructure(w, 'overworld', back, { x: 20, y: 70, z: 3 });
    expect(r).toMatchObject({ changed: 8, skipped: 0 });
    expect(await w.getBlock('overworld', 20, 70, 3)).toEqual({ name: 'minecraft:oak_stairs', properties: { facing: 'east', half: 'bottom' } });
    expect((await w.getBlock('overworld', 21, 71, 4))?.name).toBe('minecraft:glass');
  });
  it('carries block entities such as chest contents with their blocks', async () => {
    const w = await world();
    const { nbt } = await import('../src/core/nbt.js');
    await w.setBlock('overworld', 3, 64, 3, { name: 'minecraft:chest', properties: { facing: 'north' } });
    await w.setBlockEntity('overworld', 3, 64, 3, nbt.compound({ id: nbt.string('minecraft:chest'), CustomName: nbt.string('"Loot"') }));
    const s = await captureStructure(w, 'overworld', { x1: 3, y1: 64, z1: 3, x2: 3, y2: 64, z2: 3 }, 4189);
    const back = decodeStructure(encodeStructure(s));
    expect(back.blocks[0].nbt?.value.get('id')).toEqual({ type: TagType.String, value: 'minecraft:chest' });
    await placeStructure(w, 'overworld', back, { x: 10, y: 66, z: 10 });
    await w.save();
    const again = await World.open(w.dir);
    const be = await again.getBlockEntity('overworld', 10, 66, 10);
    expect(be?.value.get('CustomName')).toEqual({ type: TagType.String, value: '"Loot"' });
    expect(await again.getBlockEntity('overworld', 3, 64, 3)).toBeDefined(); // the original stays
  });

  it('carries entities inside the box and gives placed copies new UUIDs', async () => {
    const w = await world();
    const { nbt, getList, TagType: T } = await import('../src/core/nbt.js');
    const pig = nbt.compound({ id: nbt.string('minecraft:pig'), Pos: nbt.list(T.Double, [1.5, 64, 1.5].map((v) => nbt.double(v))), UUID: nbt.intArray(Int32Array.from([1, 2, 3, 4])), CustomName: nbt.string('"Bacon"') });
    expect(await w.addEntity('overworld', pig)).toBe(true);
    await w.save();
    const s = await captureStructure(w, 'overworld', { x1: 0, y1: 64, z1: 0, x2: 3, y2: 65, z2: 3 }, 4189);
    expect(s.entities).toHaveLength(1);
    const back = decodeStructure(encodeStructure(s));
    expect(back.entities?.[0].pos).toEqual([1.5, 0, 1.5]);
    await placeStructure(w, 'overworld', back, { x: 16, y: 70, z: 0 });
    await w.save();
    const again = await World.open(w.dir);
    const copies = await again.entitiesIn('overworld', { x1: 16, y1: 70, z1: 0, x2: 19, y2: 71, z2: 3 });
    expect(copies).toHaveLength(1);
    const pos = getList(copies[0], 'Pos')!.map((v) => (v as { value: number }).value);
    expect(pos).toEqual([17.5, 70, 1.5]);
    expect([...(copies[0].value.get('UUID') as { value: Int32Array }).value]).not.toEqual([1, 2, 3, 4]);
    expect((await again.entitiesIn('overworld', { x1: 0, y1: 64, z1: 0, x2: 3, y2: 65, z2: 3 }))).toHaveLength(1); // original stays
  });

  it('skips chunks that do not exist and refuses broken files', async () => {
    const w = await world();
    const s = await captureStructure(w, 'overworld', { x1: 1, y1: 64, z1: 1, x2: 1, y2: 64, z2: 1 }, 4189);
    expect((await placeStructure(w, 'overworld', s, { x: 900, y: 64, z: 900 })).skipped).toBe(1);
    expect(() => decodeStructure(Buffer.from('not nbt at all'))).toThrow();
    const bad = readNbt(gunzipSync(encodeStructure(s)));
    (bad.tag as { value: Map<string, unknown> }).value.delete('size');
    const { writeNbt } = await import('../src/core/nbt.js');
    expect(() => decodeStructure(writeNbt(bad))).toThrow(/size/);
  });
});
