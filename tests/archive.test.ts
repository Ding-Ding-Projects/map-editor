import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, writeFile, readFile } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';
import { importWorldZip, exportWorldZip, createFlatWorld, findWorldPrefix, safeFolderName } from '../src/core/archive.js';
import { World } from '../src/core/world.js';

const tmp = (p: string) => mkdtemp(path.join(os.tmpdir(), p));

async function zipOf(entries: Array<[string, Buffer]>) {
  const file = path.join(await tmp('me-zip-'), 'w.zip');
  const z = new yazl.ZipFile();
  for (const [name, data] of entries) z.addBuffer(data, name);
  z.end();
  await pipeline(z.outputStream, createWriteStream(file));
  return file;
}

describe('world archives', () => {
  it('names folders safely', () => {
    expect(safeFolderName('../../etc/passwd')).toBe('etc passwd');
    expect(safeFolderName('   ')).toBe('World');
    expect(safeFolderName('Cherry: Valley?')).toBe('Cherry Valley');
  });

  it('finds the world at the top or one folder down only', () => {
    expect(findWorldPrefix(['level.dat', 'region/r.0.0.mca'])).toBe('');
    expect(findWorldPrefix(['My World/level.dat'])).toBe('My World/');
    expect(findWorldPrefix(['a/b/level.dat'])).toBeUndefined();
    expect(findWorldPrefix(['A/level.dat', 'B/level.dat'])).toBeUndefined();
  });

  it('round-trips a world through export and import', async () => {
    const root = await tmp('me-roots-');
    const src = await createFlatWorld(root, 'Flat Test', 1);
    const w = await World.open(src);
    expect((await w.getBlock('overworld', 3, -61, 3))!.name).toBe('minecraft:grass_block');

    const zipFile = path.join(await tmp('me-out-'), 'out.zip');
    await exportWorldZip(src, createWriteStream(zipFile));
    const dest = await importWorldZip(zipFile, root, 'ignored.zip');
    expect(path.basename(dest)).toBe('Flat Test (2)');
    const w2 = await World.open(dest);
    expect((await w2.getBlock('overworld', 3, -61, 3))!.name).toBe('minecraft:grass_block');
    expect(await readFile(path.join(dest, 'level.dat'))).toEqual(await readFile(path.join(src, 'level.dat')));
  });

  it('refuses an archive without a world and leaves nothing behind', async () => {
    const root = await tmp('me-roots-');
    const z = await zipOf([['readme.txt', Buffer.from('hi')]]);
    await expect(importWorldZip(z, root, 'x.zip')).rejects.toThrow(/no level\.dat/);
    expect(await readdir(root)).toEqual([]);
  });

  it('refuses entries that try to escape the folder', async () => {
    const root = await tmp('me-roots-');
    const level = await readFile(path.join(await createFlatWorld(await tmp('me-src-'), 'Src', 1), 'level.dat'));
    // yazl refuses ../ names itself, so write the entry name by hand after building
    const z = await zipOf([['level.dat', level], ['region/AAAAAAAAAA/evil.txt', Buffer.from('x')]]);
    const raw = await readFile(z);
    const patched = Buffer.from(raw.toString('latin1').split('region/AAAAAAAAAA/').join('../../../../../../').padEnd(0), 'latin1');
    await writeFile(z, patched);
    await expect(importWorldZip(z, root, 'evil.zip')).rejects.toThrow(/outside the world folder|Unsafe path/);
    expect(existsSync(path.join(root, '..', 'evil.txt'))).toBe(false);
    expect((await readdir(root)).filter((n) => !n.endsWith('.importing'))).toEqual([]);
  });
});

describe('flat world presets', () => {
  it('builds each preset with its surface block and refuses unknown presets or sizes', async () => {
    const { createFlatWorld } = await import('../src/core/archive.js');
    const { World } = await import('../src/core/world.js');
    const { mkdtemp } = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const root = await mkdtemp(path.join(os.tmpdir(), 'me-pre-'));
    const want: Record<string, string> = { classic: 'minecraft:grass_block', desert: 'minecraft:sand', snowy: 'minecraft:snow_block', water: 'minecraft:water', stone: 'minecraft:stone_bricks', void: 'minecraft:stone' };
    for (const [preset, block] of Object.entries(want)) {
      const dir = await createFlatWorld(root, `P ${preset}`, 2, preset as never);
      const w = await World.open(dir);
      const c = await w.chunk('overworld', 0, 0);
      expect(c?.top(0, 0)?.block.name, preset).toBe(block);
    }
    await expect(createFlatWorld(root, 'Bad', 2, 'lava' as never)).rejects.toThrow(/preset/);
    await expect(createFlatWorld(root, 'Bad', 13)).rejects.toThrow(/size/);
  });
});

describe('Bedrock worlds', () => {
  it('are listed by name as Bedrock and not treated as Java worlds', async () => {
    const { discoverWorlds, isBedrockWorld } = await import('../src/core/world.js');
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
    const os = await import('node:os'); const path = await import('node:path');
    const root = await mkdtemp(path.join(os.tmpdir(), 'me-bed-'));
    const dir = path.join(root, 'AbCdEf=');
    await mkdir(path.join(dir, 'db'), { recursive: true });
    await writeFile(path.join(dir, 'level.dat'), Buffer.from([10, 0, 0, 0, 4, 0, 0, 0]));
    await writeFile(path.join(dir, 'levelname.txt'), 'My Bedrock Base\n');
    expect(isBedrockWorld(dir)).toBe(true);
    expect(await discoverWorlds([root])).toEqual([{ path: dir, name: 'My Bedrock Base', versionName: 'Bedrock Edition', dimensions: ['overworld', 'nether', 'end'], edition: 'bedrock' }]);
  });
});
