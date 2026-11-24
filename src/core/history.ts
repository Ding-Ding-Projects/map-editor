// Local, append-only edit history for a world, kept in a Git repository that
// lives in the app's own data folder. The world folder is the work tree but never
// gets a .git of its own. Restoring adds a new commit, so a restore can be undone.
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import git from 'isomorphic-git';

export type HistoryAction = 'opened' | 'filled' | 'replaced' | 'deleted' | 'cloned' | 'waterlogged' | 'edited' | 'restored' | 'settings changed';

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

  /** Copy the history to a portable bundle folder the person chooses. */
  async exportTo(dest: string) {
    await fsp.cp(this.gitdir, dest, { recursive: true });
  }
}
