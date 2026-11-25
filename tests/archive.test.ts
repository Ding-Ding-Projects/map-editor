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
