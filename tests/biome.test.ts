import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorld, World } from '../src/core/world.js';
import { setBiome } from '../src/core/ops.js';

describe('biome editing', () => {
  it('sets biomes per 4×4×4 cell, saves them packed and reads them back', async () => {
    const dir = path.join(await mkdtemp(path.join(os.tmpdir(), 'me-bio-')), 'W');
    await mkdir(dir); await createWorld(dir, 'W');
    let w = await World.open(dir);
    await w.chunk('overworld', 0, 0, true);
    const r = await setBiome(w, 'overworld', { x1: 0, y1: 64, z1: 0, x2: 5, y2: 67, z2: 3 }, 'minecraft:cherry_grove');
    expect(r).toMatchObject({ changed: 2, skipped: 0 }); // x cells 0 and 4, one z cell, one y cell
    await w.save();
    w = await World.open(dir);
    expect(await w.getBiome('overworld', 5, 66, 2)).toBe('minecraft:cherry_grove');
    expect(await w.getBiome('overworld', 8, 66, 2)).toBe('minecraft:plains');
    await expect(setBiome(w, 'overworld', { x1: 0, y1: 0, z1: 0, x2: 1, y2: 1, z2: 1 }, 'Not A Biome')).rejects.toThrow(/biome id/);
  });
});
