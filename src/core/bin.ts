// The worlds bin: taking a world off the list without deleting anything. A binned world is moved,
// whole, into a ".map-editor-bin" folder inside the same worlds folder, and can be put back.
// Nothing here ever deletes a file.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { isWorldFolder } from './world.js';

export const BIN_DIR = '.map-editor-bin';
export interface BinEntry { id: string; name: string; root: string; binnedAt: string }

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const SEP = '__binned-';

/** The worlds folder a world sits directly inside, or undefined when it is not directly inside one. */
export function rootOf(roots: string[], worldDir: string): string | undefined {
  const abs = path.resolve(worldDir);
  return roots.map((r) => path.resolve(r)).find((r) => path.dirname(abs) === r && path.basename(abs) !== BIN_DIR);
}

/** Moves a world into the bin of its own worlds folder. */
export async function binWorld(roots: string[], worldDir: string, now = new Date()): Promise<BinEntry> {
  const root = rootOf(roots, worldDir);
  if (!root) throw new Error('Only a world directly inside a worlds folder can be moved to the bin.');
  if (!isWorldFolder(worldDir)) throw new Error('That folder is not a world.');
  const name = path.basename(path.resolve(worldDir));
  const bin = path.join(root, BIN_DIR);
  await fs.mkdir(bin, { recursive: true });
  let id = `${name}${SEP}${stamp(now)}`;
  for (let n = 2; await fs.stat(path.join(bin, id)).then(() => true, () => false); n++) id = `${name}${SEP}${stamp(now)}-${n}`;
  await fs.rename(path.resolve(worldDir), path.join(bin, id));
  return { id, name, root, binnedAt: now.toISOString() };
}

/** Everything in the bins of the given worlds folders, newest first. */
export async function listBin(roots: string[]): Promise<BinEntry[]> {
  const out: BinEntry[] = [];
  for (const r of roots.map((x) => path.resolve(x))) {
    for (const e of await fs.readdir(path.join(r, BIN_DIR), { withFileTypes: true }).catch(() => [])) {
      const i = e.name.lastIndexOf(SEP);
      if (!e.isDirectory() || i <= 0) continue;
      const t = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(e.name.slice(i + SEP.length));
      out.push({ id: e.name, name: e.name.slice(0, i), root: r, binnedAt: t ? `${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}.000Z` : '' });
    }
  }
  return out.sort((a, b) => b.binnedAt.localeCompare(a.binnedAt));
}

/** Puts a binned world back in its worlds folder, under its old name or the next free one. Returns the new folder. */
export async function restoreWorld(roots: string[], root: string, id: string): Promise<string> {
  const r = roots.map((x) => path.resolve(x)).find((x) => x === path.resolve(root));
  if (!r) throw new Error('That worlds folder is not one this app uses.');
  if (!id || id !== path.basename(id) || id.includes('/') || id.includes('\\') || !id.includes(SEP)) throw new Error('That is not an item in the bin.');
  const from = path.join(r, BIN_DIR, id);
  if (!await fs.stat(from).then((s) => s.isDirectory(), () => false)) throw new Error('That item is no longer in the bin.');
  const name = id.slice(0, id.lastIndexOf(SEP));
  let to = path.join(r, name);
  for (let n = 2; await fs.stat(to).then(() => true, () => false); n++) to = path.join(r, `${name} (${n})`);
  await fs.rename(from, to);
  return to;
}
