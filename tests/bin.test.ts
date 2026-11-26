import { mkdtemp, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BIN_DIR, binWorld, listBin, restoreWorld, rootOf } from '../src/core/bin.js';

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'me-bin-'));
  const world = path.join(root, 'My World');
  await mkdir(path.join(world, 'region'), { recursive: true });
  await writeFile(path.join(world, 'level.dat'), 'x'); await writeFile(path.join(world, 'region', 'r.0.0.mca'), 'chunks');
  return { root, world };
}

describe('worlds bin', () => {
  it('moves a world into the bin of its own folder and lists it', async () => {
    const { root, world } = await setup();
    const e = await binWorld([root], world, new Date('2026-11-25T10:00:00Z'));
    expect(e).toMatchObject({ name: 'My World', root, binnedAt: '2026-11-25T10:00:00.000Z' });
    expect(await readdir(root)).toEqual([BIN_DIR]);
    expect(await readFile(path.join(root, BIN_DIR, e.id, 'region', 'r.0.0.mca'), 'utf8')).toBe('chunks'); // moved whole, nothing deleted
    expect(await listBin([root])).toEqual([e]);
  });
  it('puts a world back, under the next free name when the old one is taken', async () => {
    const { root, world } = await setup();
    const e = await binWorld([root], world);
    await mkdir(world); await writeFile(path.join(world, 'level.dat'), 'new');
    const back = await restoreWorld([root], root, e.id);
    expect(path.basename(back)).toBe('My World (2)'); expect(await readFile(path.join(back, 'level.dat'), 'utf8')).toBe('x');
    expect(await listBin([root])).toEqual([]);
  });
  it('refuses anything that is not a world directly inside a worlds folder', async () => {
    const { root, world } = await setup();
    await expect(binWorld([root], path.join(world, 'region'))).rejects.toThrow(/directly inside/);
    await expect(binWorld([root], root)).rejects.toThrow(/directly inside/);
    await mkdir(path.join(root, 'notes')); await expect(binWorld([root], path.join(root, 'notes'))).rejects.toThrow(/not a world/);
    expect(rootOf([root], path.join(root, BIN_DIR))).toBeUndefined();
  });
  it('refuses made-up bin items and folders it does not use', async () => {
    const { root, world } = await setup();
    const e = await binWorld([root], world);
    await expect(restoreWorld([root], root, '../My World')).rejects.toThrow(/not an item/);
    await expect(restoreWorld([root], root, 'nope__binned-20260101T000000Z')).rejects.toThrow(/no longer/);
    await expect(restoreWorld([root], os.tmpdir(), e.id)).rejects.toThrow(/not one this app uses/);
    expect((await listBin([root])).length).toBe(1);
  });
});
