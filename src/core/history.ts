// Local, append-only edit history for a world, kept in a Git repository that
// lives in the app's own data folder. The world folder is the work tree but never
// gets a .git of its own. Restoring adds a new commit, so a restore can be undone.
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import git from 'isomorphic-git';
import { changedChunks } from './region.js';

export type HistoryAction = 'opened' | 'filled' | 'replaced' | 'deleted' | 'cloned' | 'waterlogged' | 'edited' | 'restored' | 'settings changed' | 'placed';

export interface HistoryEntry {
  sha: string;
  message: string;
  action: HistoryAction;
  time: number; // unix seconds
  files: number;
}

const IGNORED = new Set(['session.lock']);
const AUTHOR = { name: 'Map Editor', email: 'history@map-editor.local' };

function trackable(rel: string) {
  const base = path.basename(rel);
  return !IGNORED.has(base) && !rel.endsWith('.tmp') && !rel.split(/[\\/]/).includes('.git');
}

export function historyDirFor(dataDir: string, worldPath: string) {
  const id = createHash('sha256').update(path.resolve(worldPath)).digest('hex').slice(0, 16);
  return path.join(dataDir, 'history', `${id}.git`);
}

export interface EntryStats {
  files: number; // files added, removed or changed by this entry
  regions: number; // region files among them
  chunks: number; // chunks added, removed or changed inside those regions
  dimensions: string[]; // overworld, nether, end with changes
}

/** Which dimension a region path belongs to. */
function dimensionOf(rel: string): string | undefined {
  if (!rel.endsWith('.mca')) return undefined;
  if (rel.startsWith('DIM-1/')) return 'nether';
  if (rel.startsWith('DIM1/')) return 'end';
  if (rel.startsWith('region/')) return 'overworld';
  return undefined;
}

export class WorldHistory {
  constructor(public worldPath: string, public gitdir: string) {}

  private opts() { return { fs, dir: this.worldPath, gitdir: this.gitdir }; }

  static async open(dataDir: string, worldPath: string): Promise<WorldHistory> {
    if (fs.existsSync(path.join(worldPath, '.git'))) {
      // Never adopt or write into a repository the person keeps in their own world folder.
      throw new Error('This world folder already has its own .git; Map Editor keeps history elsewhere and will not touch it.');
    }
    const h = new WorldHistory(worldPath, historyDirFor(dataDir, worldPath));
    if (!fs.existsSync(path.join(h.gitdir, 'HEAD'))) {
      await fsp.mkdir(h.gitdir, { recursive: true });
      await git.init({ ...h.opts(), defaultBranch: 'main' });
      await h.record('opened', 'World opened · baseline');
    }
    return h;
  }

  private async stageAll(): Promise<number> {
    const matrix = await git.statusMatrix({ ...this.opts(), filter: trackable });
    let n = 0;
    for (const [file, head, workdir, stage] of matrix) {
      if (head === workdir && workdir === stage) continue;
      if (workdir === 0) await git.remove({ ...this.opts(), filepath: file });
      else await git.add({ ...this.opts(), filepath: file });
      n++;
    }
    return n;
  }

  /** Commit the world's current files. Returns undefined when nothing changed (no empty entries). */
  async record(action: HistoryAction, message: string): Promise<HistoryEntry | undefined> {
    const files = await this.stageAll();
    const hasHead = await git.resolveRef({ ...this.opts(), ref: 'HEAD' }).then(() => true, () => false);
    if (files === 0 && hasHead) return undefined;
    const sha = await git.commit({ ...this.opts(), author: AUTHOR, message: `${action}: ${message}` });
    return { sha, message, action, time: Math.floor(Date.now() / 1000), files };
  }

  async list(limit = 500): Promise<HistoryEntry[]> {
    let log: Awaited<ReturnType<typeof git.log>> = [];
    try { log = await git.log({ ...this.opts(), depth: limit }); } catch { return []; }
    return log.map((c) => {
      const m = /^([a-z ]+): ([\s\S]*)$/.exec(c.commit.message.trim());
      return {
        sha: c.oid,
        action: (m?.[1] ?? 'edited') as HistoryAction,
        message: (m?.[2] ?? c.commit.message).trim(),
        time: c.commit.author.timestamp,
        files: 0,
      };
    });
  }

  /** Make the world match an earlier entry, then record that as a new entry. */
  async restore(sha: string): Promise<HistoryEntry | undefined> {
    const target = await git.listFiles({ ...this.opts(), ref: sha });
    const current = await git.listFiles({ ...this.opts(), ref: 'HEAD' });
    const targetSet = new Set(target);
    for (const f of target) {
      const { blob } = await git.readBlob({ ...this.opts(), oid: sha, filepath: f });
      const p = path.join(this.worldPath, f);
      await fsp.mkdir(path.dirname(p), { recursive: true });
      await fsp.writeFile(p + '.tmp', blob);
      await fsp.rename(p + '.tmp', p);
    }
    for (const f of current) if (!targetSet.has(f)) await fsp.rm(path.join(this.worldPath, f), { force: true });
    return this.record('restored', `Restored to ${sha.slice(0, 7)}`);
  }

  private async treeMap(ref: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    await git.walk({ ...this.opts(), trees: [git.TREE({ ref })], map: async (filepath, [entry]) => {
      if (!entry || filepath === '.') return true;
      if ((await entry.type()) === 'blob') map.set(filepath, await entry.oid());
      return true;
    } });
    return map;
  }

  /** What one entry changed compared with the entry before it: files, region files, chunks and dimensions. */
  async stats(sha: string): Promise<EntryStats> {
    const { commit } = await git.readCommit({ ...this.opts(), oid: sha });
    const after = await this.treeMap(sha);
    const before = commit.parent[0] ? await this.treeMap(commit.parent[0]) : new Map<string, string>();
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((f) => before.get(f) !== after.get(f));
    let regions = 0, chunks = 0;
    const dims = new Set<string>();
    for (const f of changed) {
      const dim = dimensionOf(f);
      if (!dim) continue;
      regions++;
      const read = async (ref: string | undefined, has: boolean) => (ref && has ? (await git.readBlob({ ...this.opts(), oid: ref, filepath: f })).blob : undefined);
      const n = changedChunks(await read(commit.parent[0], before.has(f)), await read(sha, after.has(f)));
      if (n > 0) dims.add(dim);
      chunks += n;
    }
    return { files: changed.length, regions, chunks, dimensions: ['overworld', 'nether', 'end'].filter((d) => dims.has(d)) };
  }

  /** Write the world as it was at an entry into a new folder, leaving this world and its history untouched. */
  async copyAt(sha: string, dest: string): Promise<void> {
    if (fs.existsSync(dest)) throw new Error('A folder with that name already exists.');
    const files = await git.listFiles({ ...this.opts(), ref: sha });
    const tmp = `${dest}.partial-${process.pid}`;
    await fsp.mkdir(tmp, { recursive: true });
    try {
      for (const f of files) {
        const { blob } = await git.readBlob({ ...this.opts(), oid: sha, filepath: f });
        const p = path.join(tmp, f);
        await fsp.mkdir(path.dirname(p), { recursive: true });
        await fsp.writeFile(p, blob);
      }
      await fsp.rename(tmp, dest);
    } catch (e) {
      await fsp.rm(tmp, { recursive: true, force: true });
      throw e;
    }
  }

  /** Copy the history to a portable bundle folder the person chooses. */
  async exportTo(dest: string) {
    await fsp.cp(this.gitdir, dest, { recursive: true });
  }
}
