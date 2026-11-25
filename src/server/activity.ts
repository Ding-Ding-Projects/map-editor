// Activity record: accounts, settings, extensions and worlds, kept like world edits in a local Git
// history in the data folder. Append-only: each event is one JSON line and one commit, nothing is
// ever rewritten, and no password, token or file content is recorded.
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import git from 'isomorphic-git';

export type ActivityKind = 'account' | 'settings' | 'extension' | 'world' | 'instance';
export interface ActivityEvent { time: number; kind: ActivityKind; who: string; message: string; sha?: string }

const AUTHOR = { name: 'Map Editor', email: 'history@map-editor.local' };
const FILE = 'activity.jsonl';
const KINDS: ActivityKind[] = ['account', 'settings', 'extension', 'world', 'instance'];

export class ActivityLog {
  private dir: string;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(dataDir: string) { this.dir = path.join(dataDir, 'history', 'activity'); }

  private opts() { return { fs, dir: this.dir }; }

  private async ensure() {
    if (fs.existsSync(path.join(this.dir, '.git', 'HEAD'))) return;
    await fsp.mkdir(this.dir, { recursive: true });
    await git.init({ ...this.opts(), defaultBranch: 'main' });
  }

  /** Record one event. Messages are trimmed to one line of at most 300 characters. */
  record(kind: ActivityKind, who: string, message: string): Promise<ActivityEvent> {
    if (!KINDS.includes(kind)) return Promise.reject(new Error('Unknown activity kind'));
    const clean = (s: string, n: number) => String(s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);
    const ev: ActivityEvent = { time: Math.floor(Date.now() / 1000), kind, who: clean(who, 40) || 'someone', message: clean(message, 300) };
    if (!ev.message) return Promise.reject(new Error('An activity needs a message'));
    // One writer at a time, so two requests never commit over each other.
    const next = this.chain.then(async () => {
      await this.ensure();
      await fsp.appendFile(path.join(this.dir, FILE), JSON.stringify(ev) + '\n');
      await git.add({ ...this.opts(), filepath: FILE });
      ev.sha = await git.commit({ ...this.opts(), author: AUTHOR, message: `${kind}: ${ev.message}` });
      return ev;
    });
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Newest first. */
  async list(limit = 500): Promise<ActivityEvent[]> {
    let log: Awaited<ReturnType<typeof git.log>> = [];
    try { log = await git.log({ ...this.opts(), depth: limit }); } catch { return []; }
    let lines: string[] = [];
    try { lines = (await fsp.readFile(path.join(this.dir, FILE), 'utf8')).trim().split('\n'); } catch { return []; }
    const events = lines.map((l) => { try { return JSON.parse(l) as ActivityEvent; } catch { return undefined; } }).filter((e): e is ActivityEvent => Boolean(e));
    // Line n was added by the commit n from the start of the history.
    const shas = log.map((c) => c.oid).reverse();
    return events.map((e, i) => ({ ...e, sha: shas[i] })).reverse().slice(0, limit);
  }
}
