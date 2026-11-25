// World import and export as .zip, plus new flat worlds.
import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { createWorld, World } from './world.js';

export const MAX_UNPACKED_BYTES = 8 * 1024 ** 3; // refuse archives that would unpack to more than 8 GiB
export const MAX_ENTRIES = 200_000;

/** A folder name that is safe on every platform, never empty, never a path. */
export function safeFolderName(name: string) {
  const cleaned = name.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/(^|\s)\.+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80).trim();
  return cleaned || 'World';
}

async function exists(p: string) { try { await fs.access(p); return true; } catch { return false; } }

export async function uniqueFolder(root: string, name: string) {
  const base = safeFolderName(name);
  let candidate = base;
  for (let i = 2; await exists(path.join(root, candidate)); i++) candidate = `${base} (${i})`;
  return path.join(root, candidate);
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true, strictFileNames: false, validateEntrySizes: true }, (e, z) => (e || !z ? reject(e ?? new Error('Could not open the .zip')) : resolve(z))));
}

async function listEntries(file: string): Promise<Array<{ name: string; size: number; dir: boolean }>> {
  const zip = await openZip(file);
  const out: Array<{ name: string; size: number; dir: boolean }> = [];
  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (e: yauzl.Entry) => {
      out.push({ name: e.fileName, size: e.uncompressedSize, dir: e.fileName.endsWith('/') });
      if (out.length > MAX_ENTRIES) { zip.close(); reject(new Error(`That .zip has more than ${MAX_ENTRIES.toLocaleString('en')} files.`)); return; }
      zip.readEntry();
    });
    zip.on('end', resolve);
    zip.on('error', reject);
    zip.readEntry();
  });
  return out;
}

function friendly(e: unknown): Error {
  const msg = (e as Error)?.message ?? '';
  if (/invalid relative path|absolute path|invalid characters in fileName/i.test(msg)) return new Error('That .zip contains a file path that points outside the world folder. Nothing was kept.');
  if (/end of central directory|not a zip|invalid signature/i.test(msg)) return new Error('That file is not a .zip archive, or it is damaged. Nothing was unpacked.');
  return e instanceof Error ? e : new Error(msg);
}

/** Where the world sits inside the archive: '' for the top, or one folder down. */
export function findWorldPrefix(names: string[]): string | undefined {
  if (names.includes('level.dat')) return '';
  const candidates = names.filter((n) => /^[^/]+\/level\.dat$/.test(n));
  return candidates.length === 1 ? candidates[0].slice(0, -'level.dat'.length) : undefined;
}

/**
 * Unpack an uploaded world archive into a new folder under root.
 * Every entry is checked so nothing can be written outside that folder.
 */
export async function importWorldZip(zipFile: string, root: string, suggestedName: string): Promise<string> {
  const entries = await listEntries(zipFile).catch((e) => { throw friendly(e); });
  const prefix = findWorldPrefix(entries.map((e) => e.name));
  if (prefix === undefined) throw new Error('That .zip has no Minecraft world in it: no level.dat at the top or one folder down. Nothing was unpacked.');
  const total = entries.reduce((a, e) => a + e.size, 0);
  if (total > MAX_UNPACKED_BYTES) throw new Error('That world would unpack to more than 8 GiB. Nothing was unpacked.');
  const name = prefix ? prefix.slice(0, -1) : suggestedName.replace(/\.zip$/i, '');
  const dest = await uniqueFolder(root, name);
  const tmp = dest + '.importing';
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.mkdir(tmp, { recursive: true });
  const zip = await openZip(zipFile);
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('entry', (e: yauzl.Entry) => {
        (async () => {
          if (!e.fileName.startsWith(prefix) || e.fileName.endsWith('/')) return;
          const rel = e.fileName.slice(prefix.length);
          const target = path.resolve(tmp, rel);
          if (!target.startsWith(path.resolve(tmp) + path.sep)) throw new Error(`Unsafe path in the .zip: ${e.fileName}. Nothing was kept.`);
          if (path.basename(rel) === 'session.lock') return;
          await fs.mkdir(path.dirname(target), { recursive: true });
          const stream = await new Promise<NodeJS.ReadableStream>((res, rej) => zip.openReadStream(e, (err, s) => (err || !s ? rej(err) : res(s))));
          await pipeline(stream, createWriteStream(target));
        })().then(() => zip.readEntry(), (err) => { zip.close(); reject(err); });
      });
      zip.on('end', resolve);
      zip.on('error', reject);
      zip.readEntry();
    });
    await World.open(tmp); // proves level.dat is readable before the world is offered
    await fs.rename(tmp, dest);
    return dest;
  } catch (e) {
    await fs.rm(tmp, { recursive: true, force: true });
    throw friendly(e);
  }
}

/**
 * Unpack the files under `prefix` of a .zip into `dest` (which must not exist yet), refusing any
 * path that would land outside it and archives that would unpack to more than `maxBytes`.
 */
export async function extractZip(zipFile: string, dest: string, opts: { prefix?: string; maxBytes: number }): Promise<void> {
  const entries = await listEntries(zipFile).catch((e) => { throw friendly(e); });
  const prefix = opts.prefix ?? '';
  if (entries.reduce((a, e) => a + (e.name.startsWith(prefix) ? e.size : 0), 0) > opts.maxBytes) throw new Error(`That .zip would unpack to more than ${Math.round(opts.maxBytes / 1024 / 1024)} MiB. Nothing was unpacked.`);
  await fs.mkdir(dest, { recursive: true });
  const zip = await openZip(zipFile);
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('entry', (e: yauzl.Entry) => {
        (async () => {
          if (!e.fileName.startsWith(prefix) || e.fileName.endsWith('/')) return;
          const target = path.resolve(dest, e.fileName.slice(prefix.length));
          if (!target.startsWith(path.resolve(dest) + path.sep)) throw new Error(`Unsafe path in the .zip: ${e.fileName}. Nothing was kept.`);
          await fs.mkdir(path.dirname(target), { recursive: true });
          const stream = await new Promise<NodeJS.ReadableStream>((res, rej) => zip.openReadStream(e, (err, st) => (err || !st ? rej(err) : res(st))));
          await pipeline(stream, createWriteStream(target));
        })().then(() => zip.readEntry(), (err) => { zip.close(); reject(err); });
      });
      zip.on('end', resolve);
      zip.on('error', reject);
      zip.readEntry();
    });
  } catch (e) { await fs.rm(dest, { recursive: true, force: true }); throw friendly(e); }
}

/** Names of the entries in a .zip (for finding where a manifest or world sits). */
export async function zipEntryNames(zipFile: string): Promise<string[]> {
  return (await listEntries(zipFile).catch((e) => { throw friendly(e); })).map((e) => e.name);
}

/** Stream a world folder as a .zip, with the world in a top folder of its own name. */
export async function exportWorldZip(worldDir: string, out: NodeJS.WritableStream): Promise<void> {
  const zip = new yazl.ZipFile();
  const top = path.basename(worldDir);
  async function walk(dir: string, rel: string) {
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      if (ent.name === 'session.lock' || ent.name === '.git' || ent.name.endsWith('.tmp')) continue;
      const abs = path.join(dir, ent.name);
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) await walk(abs, r);
      else if (ent.isFile()) zip.addFile(abs, `${top}/${r}`);
    }
  }
  await walk(worldDir, '');
  zip.end();
  await pipeline(zip.outputStream, out);
}

/** A small flat world (bedrock, two dirt, grass) around spawn, ready to edit. */
export async function createFlatWorld(root: string, name: string, radiusChunks = 4): Promise<string> {
  const dir = await uniqueFolder(root, name);
  await createWorld(dir, safeFolderName(name), 4189, -60);
  const w = await World.open(dir);
  for (let cx = -radiusChunks; cx < radiusChunks; cx++) for (let cz = -radiusChunks; cz < radiusChunks; cz++) {
    const c = (await w.chunk('overworld', cx, cz, true))!;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      c.setBlock(x, -64, z, { name: 'minecraft:bedrock' });
      c.setBlock(x, -63, z, { name: 'minecraft:dirt' });
      c.setBlock(x, -62, z, { name: 'minecraft:dirt' });
      c.setBlock(x, -61, z, { name: 'minecraft:grass_block', properties: { snowy: 'false' } });
    }
    await w.setBlock('overworld', cx * 16, -64, cz * 16, { name: 'minecraft:bedrock' });
  }
  await w.save();
  return dir;
}
