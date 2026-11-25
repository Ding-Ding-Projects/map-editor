import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LevelDb, encodeBatch, encodeLogRecord, readBatch, readLogRecords, crc32c } from '../src/core/leveldb.js';
import { BedrockWorld, airEntry, decodeSubChunk, encodeSubChunk, readPaletteEntry } from '../src/core/bedrock.js';
import { EditSession } from '../src/core/session.js';
import { isBedrockWorld } from '../src/core/world.js';

const enc = new TextEncoder();
/** A palette entry the way the game writes it: { name, states: { ... }, version }. */
function entry(name: string, states: Record<string, number | string> = {}): Uint8Array {
  const parts: number[] = []; const str = (s: string) => { const e = enc.encode(s); parts.push(e.length & 255, e.length >> 8, ...e); };
  parts.push(10); str('');
  parts.push(8); str('name'); str(name);
  parts.push(10); str('states');
  for (const [k, v] of Object.entries(states)) { if (typeof v === 'string') { parts.push(8); str(k); str(v); } else { parts.push(3); str(k); parts.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255); } }
  parts.push(0);
  parts.push(3); str('version'); parts.push(1, 10, 18, 1);
  parts.push(0);
  return Uint8Array.from(parts);
}
const at = (x: number, y: number, z: number) => (y * 16 + z) * 16 + x;

/** A tiny Bedrock world: one chunk at 0,0 with bedrock, dirt and grass, plus a waterlogged fence in a second layer. */
async function makeWorld(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'me-bedrock-'));
  await mkdir(path.join(dir, 'db'));
  await writeFile(path.join(dir, 'level.dat'), new Uint8Array(8));
  await writeFile(path.join(dir, 'levelname.txt'), 'Tiny Bedrock');
  const idx = new Uint16Array(4096), water = new Uint16Array(4096);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { idx[at(x, 0, z)] = 1; idx[at(x, 1, z)] = 2; idx[at(x, 2, z)] = 3; }
  idx[at(5, 3, 5)] = 4; water[at(5, 3, 5)] = 1;
  const sub = encodeSubChunk(9, 0, [
    { indices: idx, palette: [entry('minecraft:air'), entry('minecraft:bedrock', { infiniburn_bit: 0 }), entry('minecraft:dirt', { dirt_type: 'normal' }), entry('minecraft:grass'), entry('minecraft:fence', { wood_type: 'oak' })] },
    { indices: water, palette: [entry('minecraft:air'), entry('minecraft:water', { liquid_depth: 0 })] }]);
  const key = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 47, 0]);
  await writeFile(path.join(dir, 'db', '000003.log'), encodeLogRecord(encodeBatch(1, [[key, sub], [enc.encode('~local_player'), Uint8Array.from([1, 2, 3])]])));
  await writeFile(path.join(dir, 'db', 'CURRENT'), 'MANIFEST-000002\n');
  await writeFile(path.join(dir, 'db', 'MANIFEST-000002'), new Uint8Array(0));
  return dir;
}

describe('LevelDB log files', () => {
  it('matches the CRC-32C check value', () => {
    expect(crc32c([enc.encode('123456789')])).toBe(0xe3069283);
  });
  it('writes records that read back, across block boundaries, and notices damage', () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    const batch = encodeBatch(7, [[enc.encode('a'), big], [enc.encode('gone'), null], [enc.encode('b'), enc.encode('two')]]);
    const file = Buffer.concat([encodeLogRecord(enc.encode('first')), encodeLogRecord(batch, 12)]);
    const recs = readLogRecords(file, true);
    expect(recs.length).toBe(2);
    const entries = readBatch(recs[1]);
    expect(entries.map((e) => [Buffer.from(e.key).toString(), e.seq, e.value?.length ?? null])).toEqual([['a', 7, 100_000], ['gone', 8, null], ['b', 9, 3]]);
    expect(Buffer.compare(entries[0].value!, big)).toBe(0);
    const bad = Uint8Array.from(file); bad[40_000] ^= 1;
    expect(() => readLogRecords(bad, true)).toThrow(/checksum/);
  });
  it('keeps the newest value of each key and adds, never rewrites, files', async () => {
    const dir = await makeWorld(); const dbDir = path.join(dir, 'db');
    const before = await readFile(path.join(dbDir, '000003.log'));
    const db = await LevelDb.open(dbDir);
    expect(Array.from(db.get(enc.encode('~local_player'))!)).toEqual([1, 2, 3]);
    const file = await db.write([[enc.encode('~local_player'), Uint8Array.from([9])], [enc.encode('new'), enc.encode('x')]]);
    expect(path.basename(file!)).toBe('000004.log');
    expect(Buffer.compare(await readFile(path.join(dbDir, '000003.log')), before)).toBe(0);
    const again = await LevelDb.open(dbDir);
    expect(Array.from(again.get(enc.encode('~local_player'))!)).toEqual([9]);
    expect(Buffer.from(again.get(enc.encode('new'))!).toString()).toBe('x');
    await again.write([[enc.encode('new'), null]]);
    expect((await LevelDb.open(dbDir)).get(enc.encode('new'))).toBeUndefined();
    expect((await readdir(dbDir)).sort()).toEqual(['000003.log', '000004.log', '000005.log', 'CURRENT', 'MANIFEST-000002']);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('Bedrock sub-chunks', () => {
  it('reads a palette entry and keeps its exact bytes', () => {
    const raw = entry('minecraft:stone', { stone_type: 'granite' });
    const e = readPaletteEntry(raw, 0);
    expect(e.state).toEqual({ name: 'minecraft:stone', properties: { stone_type: 'granite' } });
    expect(e.end).toBe(raw.length); expect(e.version).toBe(0x01120a01);
    expect(readPaletteEntry(airEntry(17959425), 0).state).toEqual({ name: 'minecraft:air' });
  });
  it('round-trips every palette size and both layers', () => {
    for (const n of [1, 2, 3, 5, 9, 17, 33, 65, 300]) {
      const palette = Array.from({ length: n }, (_, i) => entry(`minecraft:b${i}`));
      const indices = new Uint16Array(4096).map((_, i) => (i * 7) % n);
      for (const version of [8, 9]) {
        const d = decodeSubChunk(encodeSubChunk(version, -3, [{ indices, palette }, { indices: new Uint16Array(4096), palette: [entry('minecraft:air')] }]), -3);
        expect(d.version).toBe(version); expect(d.y).toBe(-3); expect(d.layers.length).toBe(2);
        expect(d.layers[0].indices).toEqual(indices);
        expect(d.states.map((s) => s.name)).toEqual(palette.map((_, i) => `minecraft:b${i}`));
      }
    }
  });
  it('refuses the pre-palette format with a clear message', () => {
    expect(() => decodeSubChunk(new Uint8Array(6145), 0)).toThrow(/older Bedrock format/);
  });
});

describe('Bedrock worlds', () => {
  it('opens, edits through the session, and is undone by history', async () => {
    const dir = await makeWorld(); const data = await mkdtemp(path.join(os.tmpdir(), 'me-bedrock-data-'));
    expect(isBedrockWorld(dir)).toBe(true);
    const s = await EditSession.open(data, dir);
    expect(s.world.info.edition).toBe('bedrock');
    expect(await s.world.listChunks('overworld')).toEqual([[0, 0]]);
    expect(await s.world.listChunks('nether')).toEqual([]);
    expect((await s.world.getBlock('overworld', 3, 2, 3))?.name).toBe('minecraft:grass');
    expect(await s.topBlock('overworld', 5, 5)).toEqual({ y: 3, block: 'minecraft:fence[wood_type=oak]' });
    // a block the world has never held is refused, and nothing is written
    await expect(s.run({ op: 'fill', dimension: 'overworld', box: { x1: 0, y1: 4, z1: 0, x2: 1, y2: 4, z2: 1 }, block: 'minecraft:diamond_block' })).rejects.toThrow(/Pick block/);
    s.world.reload();
    await expect(s.run({ op: 'waterlog', dimension: 'overworld', box: { x1: 0, y1: 0, z1: 0, x2: 1, y2: 1, z2: 1 } })).rejects.toThrow(/Bedrock/);
    expect(() => s.exportStructure('overworld', { x1: 0, y1: 0, z1: 0, x2: 1, y2: 1, z2: 1 })).toThrow(/Java Edition/);
    // fill with a block from the world, over the fence, and into a section that did not exist (y 16..17)
    await s.world.getBlock('overworld', 0, 0, 0);
    const r = await s.run({ op: 'fill', dimension: 'overworld', box: { x1: 4, y1: 3, z1: 4, x2: 6, y2: 17, z2: 6 }, block: 'minecraft:dirt[dirt_type=normal]' });
    expect(r.changed).toBe(3 * 15 * 3);
    // outside the chunks on disk nothing is invented
    const far = await s.run({ op: 'fill', dimension: 'overworld', box: { x1: 100, y1: 3, z1: 100, x2: 101, y2: 3, z2: 101 }, block: 'minecraft:air' });
    expect(far.changed).toBe(0);
    const fresh = await BedrockWorld.open(dir);
    expect((await fresh.getBlock('overworld', 5, 3, 5))?.name).toBe('minecraft:dirt');
    expect((await fresh.getBlock('overworld', 5, 17, 5))?.name).toBe('minecraft:dirt');
    expect((await fresh.getBlock('overworld', 7, 3, 7))?.name).toBe('minecraft:air');
    expect((await fresh.getBlock('overworld', 0, 0, 0))).toEqual({ name: 'minecraft:bedrock', properties: { infiniburn_bit: '0' } });
    // the water that sat with the fence went with it; the other entries were not touched
    const db = await LevelDb.open(path.join(dir, 'db'));
    const sub = decodeSubChunk(db.get(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 47, 0]))!, 0);
    expect(sub.layers.length).toBe(2);
    expect(readPaletteEntry(sub.layers[1].palette[sub.layers[1].indices[at(5, 3, 5)]], 0).state.name).toBe('minecraft:air');
    expect(Array.from(db.get(enc.encode('~local_player'))!)).toEqual([1, 2, 3]);
    expect(decodeSubChunk(db.get(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 47, 1]))!, 1).version).toBe(9);
    // delete, then undo everything through history
    await s.run({ op: 'delete', dimension: 'overworld', box: { x1: 0, y1: 2, z1: 0, x2: 15, y2: 2, z2: 15 } });
    expect((await s.world.getBlock('overworld', 3, 2, 3))?.name).toBe('minecraft:air');
    const list = await s.history.list();
    await s.restore(list[list.length - 1].sha);
    expect((await s.world.getBlock('overworld', 3, 2, 3))?.name).toBe('minecraft:grass');
    expect((await s.world.getBlock('overworld', 5, 3, 5))?.name).toBe('minecraft:fence');
    expect((await readdir(path.join(dir, 'db'))).filter((f) => f.endsWith('.log'))).toEqual(['000003.log']);
    await rm(dir, { recursive: true, force: true }); await rm(data, { recursive: true, force: true });
  });
});
