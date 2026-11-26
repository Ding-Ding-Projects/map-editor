// Where the desktop app keeps its data, and moving it somewhere else. The choice lives in a small
// file beside the default folder. A move copies everything and checks the copy before the choice is
// written; the old folder is never deleted, so a failed or regretted move loses nothing.
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface FolderChoice { dataDir: string; isDefault: boolean }
const CONFIG = 'data-folder.json';
const MARK = '.map-editor-data';

const exists = (p: string) => fs.stat(p).then(() => true, () => false);

/** The folder in use: the saved choice when it still exists, otherwise the default inside the app's own folder. */
export async function currentDataDir(userData: string): Promise<FolderChoice> {
  const def = path.join(userData, 'data');
  try {
    const { dataDir } = JSON.parse(await fs.readFile(path.join(userData, CONFIG), 'utf8'));
    if (typeof dataDir === 'string' && path.isAbsolute(dataDir) && path.resolve(dataDir) !== path.resolve(def) && await fs.stat(dataDir).then((s) => s.isDirectory(), () => false)) return { dataDir: path.resolve(dataDir), isDefault: false };
  } catch { /* no choice saved, or it cannot be read: use the default */ }
  return { dataDir: def, isDefault: true };
}

async function tally(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0, bytes = 0;
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { const t = await tally(full); files += t.files; bytes += t.bytes; }
    else if (e.isFile() && e.name !== MARK) { files++; bytes += (await fs.stat(full)).size; }
  }
  return { files, bytes };
}

/** Why a folder cannot become the data folder, or '' when it can. */
export async function refuseTarget(from: string, to: string): Promise<string> {
  const a = path.resolve(from), b = path.resolve(to);
  if (!path.isAbsolute(to)) return 'Choose a full folder path.';
  if (a === b) return 'That is already the data folder.';
  if ((b + path.sep).startsWith(a + path.sep)) return 'Choose a folder outside the current data folder.';
  if ((a + path.sep).startsWith(b + path.sep)) return 'Choose a folder that does not contain the current data folder.';
  if (!await fs.stat(b).then((s) => s.isDirectory(), () => false)) return 'That folder does not exist.';
  const inside = (await fs.readdir(b)).filter((n) => n !== MARK);
  if (inside.length && !await exists(path.join(b, MARK))) return 'Choose an empty folder, or one Map Editor has used before.';
  return '';
}

export interface MoveResult { ok: boolean; message: string; files?: number; bytes?: number }

/**
 * Copies the data to `to`, checks that every file arrived with the same size, then saves the choice.
 * Nothing is deleted. On any failure the choice is left as it was.
 */
export async function moveDataDir(userData: string, to: string, onProgress?: (done: number, total: number) => void): Promise<MoveResult> {
  const { dataDir: from } = await currentDataDir(userData);
  const why = await refuseTarget(from, to);
  if (why) return { ok: false, message: why };
  const target = path.resolve(to);
  try {
    await fs.mkdir(from, { recursive: true });
    const before = await tally(from);
    let done = 0;
    const copy = async (src: string, dst: string): Promise<void> => {
      await fs.mkdir(dst, { recursive: true });
      for (const e of await fs.readdir(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dst, e.name);
        if (e.isDirectory()) await copy(s, d);
        else if (e.isFile()) { await fs.copyFile(s, d); onProgress?.(++done, before.files); }
      }
    };
    await copy(from, target);
    const after = await tally(target);
    if (after.files < before.files || after.bytes < before.bytes) return { ok: false, message: `The copy is incomplete (${after.files} of ${before.files} files). The data folder was not changed.` };
    await fs.writeFile(path.join(target, MARK), 'This folder holds Map Editor data.\n');
    const def = path.join(userData, 'data');
    if (target === path.resolve(def)) await fs.rm(path.join(userData, CONFIG), { force: true });
    else await fs.writeFile(path.join(userData, CONFIG), JSON.stringify({ dataDir: target }, null, 2));
    return { ok: true, message: `Copied ${before.files} files. The old folder was left as it is: ${from}`, files: before.files, bytes: before.bytes };
  } catch (e) { return { ok: false, message: `${(e as Error).message}. The data folder was not changed.` }; }
}
