// Extensions: small programs in any language that add commands to Map Editor.
//
// Each extension is a folder with manifest.json (manifestVersion 1). It runs as its own process and
// talks one JSON object per line over stdin/stdout. Map Editor sends one request and reads one
// response; the process is stopped after 10 s or 1 MiB of output. Extensions declare permissions,
// and nothing runs until the user has allowed exactly those permissions; a manifest that asks for
// new or different permissions is switched off until allowed again. Extensions never receive
// sign-in details, session cookies, file system paths or other secrets: only world facts and the
// selection, and only when their permission covers it. World changes they propose go through the
// normal, recorded edit path, so every one can be undone from History.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { OPERATIONS, MAX_OPERATION_BLOCKS, volume, type Box } from '../core/ops.js';
import type { OperationRequest } from '../core/session.js';

export const PERMISSIONS = {
  'world-info': 'Read the open world’s name, version, spawn point and dimensions',
  'selection': 'Read the current selection box',
  'edit-world': 'Change blocks in the open world (each change is recorded in History and can be undone)',
} as const;
export type Permission = keyof typeof PERMISSIONS;

export const LIMITS = { timeoutMs: 10_000, outputBytes: 1024 * 1024, ops: 64, manifestBytes: 64 * 1024 } as const;

export interface Manifest {
  manifestVersion: 1;
  id: string;
  name: string;
  version: string;
  description?: string;
  /** Program and arguments, run inside the extension folder. "node" means the Node.js that runs Map Editor. */
  run: string[];
  permissions: Permission[];
  commands: Array<{ id: string; title: string }>;
}

export interface ExtensionInfo { manifest: Manifest; builtIn: boolean; enabled: boolean; needsConsent: boolean; error?: string }

const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

export function validateManifest(raw: unknown): Manifest {
  const m = raw as Partial<Manifest>;
  const bad = (msg: string) => { throw new Error(`manifest.json: ${msg}`); };
  if (!m || typeof m !== 'object') bad('not an object');
  if (m.manifestVersion !== 1) bad('manifestVersion must be 1');
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) bad('id must be 2 to 41 lower-case letters, digits or dashes');
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 80) bad('name is required (up to 80 characters)');
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(m.version)) bad('version must look like 1.0.0');
  if (!Array.isArray(m.run) || !m.run.length || m.run.some((a) => typeof a !== 'string' || a.length > 200) || m.run.length > 16) bad('run must be a list of program and arguments');
  if (!Array.isArray(m.permissions) || m.permissions.some((p) => !(p in PERMISSIONS))) bad(`permissions may only contain ${Object.keys(PERMISSIONS).join(', ')}`);
  if (!Array.isArray(m.commands) || !m.commands.length || m.commands.length > 20) bad('commands must list 1 to 20 commands');
  for (const c of m.commands!) if (!c || typeof c.id !== 'string' || !ID_RE.test(c.id) || typeof c.title !== 'string' || !c.title.trim() || c.title.length > 80) bad('each command needs an id and a title');
  return { manifestVersion: 1, id: m.id!, name: m.name!.trim(), version: m.version!, description: typeof m.description === 'string' ? m.description.slice(0, 300) : undefined, run: m.run!, permissions: [...new Set(m.permissions!)], commands: m.commands!.map((c) => ({ id: c.id, title: c.title.trim() })) };
}

/** Consent is tied to the exact permission set, so any change asks again. */
export const permissionKey = (m: Manifest) => createHash('sha256').update([...m.permissions].sort().join(',')).digest('hex').slice(0, 16);

export interface RunContext {
  world: { name: string; version?: string; dataVersion?: number; spawn?: { x: number; y: number; z: number }; dimensions: string[] };
  selection?: { dimension: string; box: Box };
}
export interface RunResult { message: string; ops: OperationRequest[] }

export class Extensions {
  constructor(private builtInDir: string, private dataDir: string) {}
  private get userDir() { return path.join(this.dataDir, 'extensions'); }
  private get consentFile() { return path.join(this.dataDir, 'extensions-consent.json'); }

  private async consent(): Promise<Record<string, { key: string; enabled: boolean }>> {
    try { return JSON.parse(await fs.readFile(this.consentFile, 'utf8')); } catch { return {}; }
  }
  private async saveConsent(c: Record<string, { key: string; enabled: boolean }>) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(`${this.consentFile}.tmp`, JSON.stringify(c, null, 2));
    await fs.rename(`${this.consentFile}.tmp`, this.consentFile);
  }

  private async folders(): Promise<Array<{ dir: string; builtIn: boolean }>> {
    const out: Array<{ dir: string; builtIn: boolean }> = [];
    for (const [root, builtIn] of [[this.builtInDir, true], [this.userDir, false]] as const) {
      let names: string[] = [];
      try { names = await fs.readdir(root); } catch { continue; }
      for (const n of names.sort()) out.push({ dir: path.join(root, n), builtIn });
    }
    return out;
  }

  async list(): Promise<Array<ExtensionInfo & { dir: string }>> {
    const consent = await this.consent();
    const seen = new Set<string>();
    const list: Array<ExtensionInfo & { dir: string }> = [];
    for (const { dir, builtIn } of await this.folders()) {
      try {
        const st = await fs.stat(path.join(dir, 'manifest.json'));
        if (st.size > LIMITS.manifestBytes) throw new Error('manifest.json is larger than 64 KiB');
        const m = validateManifest(JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')));
        if (seen.has(m.id)) continue; // a built-in id cannot be replaced by a user folder
        seen.add(m.id);
        const c = consent[m.id];
        const needsConsent = !c || c.key !== permissionKey(m);
        list.push({ manifest: m, builtIn, enabled: !!c?.enabled && !needsConsent, needsConsent, dir });
      } catch (e) {
        if (['ENOENT', 'ENOTDIR'].includes((e as NodeJS.ErrnoException).code ?? '')) continue; // not an extension folder
        const id = path.basename(dir);
        list.push({ manifest: { manifestVersion: 1, id, name: id, version: '0.0.0', run: [], permissions: [], commands: [] }, builtIn, enabled: false, needsConsent: false, error: (e as Error).message, dir });
      }
    }
    return list;
  }

  /** Turning an extension on records consent to its exact permissions. */
  async setEnabled(id: string, enabled: boolean, allowedKey?: string) {
    const ext = (await this.list()).find((e) => e.manifest.id === id && !e.error);
    if (!ext) throw new Error(`No extension called ${id}.`);
    const consent = await this.consent();
    if (enabled) {
      if (allowedKey !== permissionKey(ext.manifest)) throw new Error('The permissions changed. Review them and allow them again.');
      consent[id] = { key: allowedKey, enabled: true };
    } else consent[id] = { key: consent[id]?.key ?? '', enabled: false };
    await this.saveConsent(consent);
  }

  async run(id: string, command: string, ctx: RunContext): Promise<RunResult> {
    const ext = (await this.list()).find((e) => e.manifest.id === id);
    if (!ext || ext.error) throw new Error(`No working extension called ${id}.`);
    if (!ext.enabled) throw new Error(`${ext.manifest.name} is switched off. Turn it on in Settings › Extensions.`);
    if (!ext.manifest.commands.some((c) => c.id === command)) throw new Error(`${ext.manifest.name} has no command ${command}.`);
    const perms = new Set(ext.manifest.permissions);
    const request = {
      type: 'run', protocol: 1, command,
      world: perms.has('world-info') ? ctx.world : undefined,
      selection: perms.has('selection') ? ctx.selection : undefined,
      limits: { ops: LIMITS.ops, opBlocks: MAX_OPERATION_BLOCKS },
    };
    const response = await exchange(ext.dir, ext.manifest.run, request);
    return checkResponse(response, perms.has('edit-world'));
  }
}

/** Starts the extension, sends one request line, and reads one response line within the limits. */
export function exchange(dir: string, run: string[], request: unknown, timeoutMs: number = LIMITS.timeoutMs): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = run;
    // "node" is the runtime Map Editor itself runs on, so Node extensions work without installing Node.
    const program = cmd === 'node' ? process.execPath : cmd;
    // A clean environment: nothing from Map Editor's own environment (tokens, proxies, paths) is passed on.
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '', MAP_EDITOR_EXTENSION: '1' };
    if (cmd === 'node') env.ELECTRON_RUN_AS_NODE = '1';
    let child;
    try { child = spawn(program, args, { cwd: dir, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { reject(e); return; }
    let out = '', err = '', done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; clearTimeout(timer); child.kill(); fn(); };
    const timer = setTimeout(() => finish(() => reject(new Error(`The extension did not answer within ${timeoutMs / 1000} s and was stopped.`))), timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
      if (out.length > LIMITS.outputBytes) return finish(() => reject(new Error('The extension sent more than 1 MiB and was stopped.')));
      const nl = out.indexOf('\n');
      if (nl >= 0) finish(() => { try { resolve(JSON.parse(out.slice(0, nl))); } catch { reject(new Error('The extension did not answer with one line of JSON.')); } });
    });
    child.stderr.on('data', (d: Buffer) => { if (err.length < 4000) err += d.toString(); });
    child.on('error', (e) => finish(() => reject(new Error(`The extension could not start: ${e.message}`))));
    child.on('close', (code) => finish(() => {
      if (out.trim()) { try { resolve(JSON.parse(out.trim())); return; } catch { /* fall through */ } }
      reject(new Error(`The extension stopped (exit code ${code}) without an answer.${err ? ` ${err.trim().split('\n').slice(-1)[0].slice(0, 300)}` : ''}`));
    }));
    child.stdin.on('error', () => undefined);
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

/** Accepts only a message and well-formed operations the extension is allowed to make. */
export function checkResponse(raw: unknown, mayEdit: boolean): RunResult {
  const r = raw as { type?: string; message?: unknown; ops?: unknown };
  if (!r || typeof r !== 'object' || r.type !== 'result') throw new Error('The extension answered without "type": "result".');
  const message = typeof r.message === 'string' ? r.message.slice(0, 2000) : '';
  const list = r.ops === undefined ? [] : r.ops;
  if (!Array.isArray(list)) throw new Error('"ops" must be a list.');
  if (list.length && !mayEdit) throw new Error('The extension tried to change the world without the edit-world permission. Nothing was changed.');
  if (list.length > LIMITS.ops) throw new Error(`At most ${LIMITS.ops} operations are accepted from one command. Nothing was changed.`);
  const ops: OperationRequest[] = list.map((o: any, i: number) => {
    const where = `Operation ${i + 1}`;
    if (!OPERATIONS.includes(o?.op)) throw new Error(`${where}: unknown op.`);
    if (!['overworld', 'nether', 'end'].includes(o?.dimension)) throw new Error(`${where}: unknown dimension.`);
    for (const k of ['x1', 'y1', 'z1', 'x2', 'y2', 'z2'] as const) if (!Number.isInteger(o?.box?.[k])) throw new Error(`${where}: box.${k} must be a whole number.`);
    if (volume(o.box) > MAX_OPERATION_BLOCKS) throw new Error(`${where}: selection is larger than the operation limit.`);
    const blk = (v: unknown) => (typeof v === 'string' && /^[a-z0-9_.-]+:[a-z0-9_/.-]+(\[[a-z0-9_=,]*\])?$/.test(v) ? v : undefined);
    const req: OperationRequest = { op: o.op, dimension: o.dimension, box: { x1: o.box.x1, y1: o.box.y1, z1: o.box.z1, x2: o.box.x2, y2: o.box.y2, z2: o.box.z2 } };
    if (o.op === 'fill') { req.block = blk(o.block); if (!req.block) throw new Error(`${where}: block must look like minecraft:stone.`); }
    if (o.op === 'replace') { req.from = blk(o.from); req.to = blk(o.to); if (!req.from || !req.to) throw new Error(`${where}: from and to must look like minecraft:stone.`); }
    if (o.op === 'clone') { if (!['x', 'y', 'z'].every((k) => Number.isInteger(o?.dest?.[k]))) throw new Error(`${where}: dest needs whole x, y and z.`); req.dest = { x: o.dest.x, y: o.dest.y, z: o.dest.z }; }
    return req;
  });
  return { message, ops };
}
