// HTTP server shared by every form: the desktop app runs it on 127.0.0.1, the Docker
// image and the appliance run it on the LAN. Same API, same UI.
import { DimSum } from './dimsum.js';
import { Extensions, PERMISSIONS, permissionKey, ReplaceNeeded } from './extensions.js';
import { ActivityLog, type ActivityKind } from './activity.js';
import { Passkeys, originFor } from './passkeys.js';
import { Authenticator } from './totp.js';
import http from 'node:http';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Accounts, Throttle } from './auth.js';
import { EditSession, type OperationRequest } from '../core/session.js';
import { decodeStructure } from '../core/structure.js';
import { discoverWorlds, isBedrockWorld, isWorldFolder, setLevelName, worldInfo, type Dimension } from '../core/world.js';
import { volume, MAX_OPERATION_BLOCKS, OPERATIONS, type Box } from '../core/ops.js';
import { importWorldZip, exportWorldZip, createFlatWorld, WORLD_PRESETS, WORLD_SIZES, type WorldPreset } from '../core/archive.js';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';

export interface ServerOptions {
  host: string;
  port: number;
  dataDir: string;
  /** Folder with the built-in extensions (defaults to dist/extensions). */
  extensionsDir?: string;
  /** For tests: replaces fetch for the dim sum catalog. */
  fetchImpl?: typeof fetch;
  /** Folders whose sub-folders are offered as worlds. */
  worldRoots: string[];
  /** Desktop only: allow opening any folder the person picked in a native dialog. */
  allowAnyPath?: boolean;
  staticDir?: string;
}

export interface BuildInfo { version: string; commit: string; builtAt: string | null; changelog?: Array<{ sha: string; date: string; subject: string }> }

// Works both as the ESM server bundle and inside the CommonJS desktop bundle.
const here = typeof __dirname === 'string' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export async function readBuildInfo(): Promise<BuildInfo> {
  for (const p of [path.join(here, '..', 'build-info.json'), path.join(here, 'build-info.json')]) {
    try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { /* next */ }
  }
  return { version: 'unavailable', commit: 'unavailable', builtAt: null };
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const DIMS: Dimension[] = ['overworld', 'nether', 'end'];

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

function cookie(req: http.IncomingMessage, name: string) {
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return decodeURIComponent(v.join('=')); }
  return undefined;
}

async function body(req: http.IncomingMessage, limit = 64 * 1024): Promise<any> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new HttpError(413, 'Request too large'); chunks.push(c as Buffer); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Body is not valid JSON'); }
}

function int(v: string | null, name: string, min: number, max: number) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${name} must be a whole number from ${min} to ${max}`);
  return n;
}

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

export async function createServer(opts: ServerOptions) {
  const accounts = new Accounts(path.join(opts.dataDir, 'accounts'));
  const dimsum = new DimSum(opts.dataDir, opts.fetchImpl);
  const activity = new ActivityLog(opts.dataDir);
  const passkeys = new Passkeys(path.join(opts.dataDir, 'accounts'));
  const throttle = new Throttle();
  const ollamaBase = (process.env.MAP_EDITOR_OLLAMA || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const authenticator = new Authenticator(path.join(opts.dataDir, 'accounts'));
  // The page's origin for passkeys; MAP_EDITOR_ORIGIN fixes it when a proxy rewrites the Host header.
  const rp = (req: http.IncomingMessage) => originFor(req.headers.host, (req.headers['x-forwarded-proto'] ?? '') === 'https', process.env.MAP_EDITOR_ORIGIN || undefined);
  // Recording never blocks or fails the request it describes.
  const note = (kind: ActivityKind, who: string, message: string) => { activity.record(kind, who, message).catch(() => undefined); };
  const extensions = new Extensions(opts.extensionsDir ?? path.join(here, '..', 'extensions'), opts.dataDir);
  const build = await readBuildInfo();
  let session: EditSession | undefined;
  const staticDir = opts.staticDir ?? path.join(here, '..', 'ui');

  function worldAllowed(p: string) {
    const abs = path.resolve(p);
    if (opts.allowAnyPath) return true;
    return opts.worldRoots.some((r) => { const rel = path.relative(path.resolve(r), abs); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); });
  }

  async function api(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    const send = (status: number, data: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
    const p = url.pathname;
    if (p === '/api/health') return send(200, { ok: true, version: build.version, commit: build.commit, builtAt: build.builtAt });
    if (p === '/api/changelog') return send(200, { entries: build.changelog ?? null });

    // Same-origin JSON only for state-changing calls (blocks cross-site form posts).
    const isUpload = (p === '/api/worlds/upload' || p === '/api/extensions/upload' || p === '/api/structure/place') && req.method === 'POST';
    // Same-origin JSON only for state-changing calls (blocks cross-site form posts). Uploads instead
    // carry a custom header, which a cross-site form cannot send.
    if (req.method !== 'GET' && !isUpload && !(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Send JSON');
    if (isUpload && req.headers['x-map-editor'] !== '1') throw new HttpError(403, 'Uploads must come from the Map Editor page.');

    const token = cookie(req, 'me_session');
    const user = accounts.session(token);

    if (p === '/api/dimsum/random') {
      if (!user) throw new HttpError(401, 'Sign in first.');
      try { return send(200, await dimsum.random()); } catch (e) { throw new HttpError(503, `Dim sum catalog unavailable: ${(e as Error).message}`); }
    }
    if (p === '/api/auth/state') return send(200, { hasOwner: await accounts.hasOwner(), hasPasskeys: (await passkeys.all()).length > 0, user: user ? { name: user.name } : null });
    if (p === '/api/auth/passkey/options' && req.method === 'POST') {
      try { return send(200, await passkeys.loginOptions(rp(req))); } catch (e) { throw new HttpError(409, (e as Error).message); }
    }
    if (p === '/api/auth/passkey/verify' && req.method === 'POST') {
      const { ticket, response } = await body(req);
      const owner = await accounts.owner();
      if (!owner) throw new HttpError(409, 'Create the owner account first.');
      try {
        const key = await passkeys.login(String(ticket ?? ''), response);
        const t = accounts.startSession(owner.name);
        res.setHeader('set-cookie', `me_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1209600`);
        note('account', owner.name, `Signed in with the passkey "${key.name}"`);
        return send(200, { name: owner.name });
      } catch (e) { note('account', owner.name, 'A passkey sign-in failed'); throw new HttpError(401, (e as Error).message); }
    }
    if (p === '/api/auth/register' && req.method === 'POST') {
      const { name, password } = await body(req);
      const err = Accounts.validate(String(name ?? ''), String(password ?? ''));
      if (err) throw new HttpError(400, err);
      const result = await accounts.registerOwner(name, password);
      if (result === 'taken') throw new HttpError(409, 'This Map Editor already has an owner. Sign in instead.');
      const t = accounts.startSession(name);
      res.setHeader('set-cookie', `me_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1209600`);
      note('account', name, 'Created the owner account');
      return send(201, { name, role: 'owner' });
    }
    if (p === '/api/auth/login' && req.method === 'POST') {
      const { name, password, code } = await body(req);
      const from = req.socket.remoteAddress ?? 'unknown';
      const waitS = throttle.wait(from);
      if (waitS > 0) throw new HttpError(429, `Too many wrong sign-ins. Try again in ${Math.ceil(waitS / 60)} minutes.`);
      if (!(await accounts.verify(String(name ?? ''), String(password ?? '')))) { throttle.fail(from); note('account', String(name ?? ''), 'A sign-in failed (wrong name or password)'); throw new HttpError(401, 'Name or password is wrong.'); }
      // With an authenticator app set up, the password alone is not enough.
      if (await authenticator.enabled()) {
        if (!code) return send(401, { needCode: true, error: 'Enter the 6-digit code from your authenticator app.' });
        if (!(await authenticator.verify(String(code)))) { throttle.fail(from); note('account', String(name), 'A sign-in failed (wrong authenticator code)'); throw new HttpError(401, 'That code does not match. Use the newest code from the app.'); }
      }
      throttle.ok(from);
      const t = accounts.startSession(name);
      note('account', name, 'Signed in');
      res.setHeader('set-cookie', `me_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1209600`);
      return send(200, { name });
    }
    if (p === '/api/auth/logout' && req.method === 'POST') { if (user) note('account', user.name, 'Signed out'); accounts.endSession(token); res.setHeader('set-cookie', 'me_session=; Path=/; Max-Age=0'); return send(200, {}); }

    if (!user) throw new HttpError(401, 'Sign in first.');

    if (p === '/api/authenticator' && req.method === 'GET') return send(200, { enabled: await authenticator.enabled() });
    if (p === '/api/authenticator/begin' && req.method === 'POST') return send(200, await authenticator.begin(user.name));
    if (p === '/api/authenticator/confirm' && req.method === 'POST') {
      const { code } = await body(req);
      try { await authenticator.confirm(String(code ?? '')); } catch (e) { throw new HttpError(400, (e as Error).message); }
      note('account', user.name, 'Turned on authenticator codes for sign-in');
      return send(200, { enabled: true });
    }
    if (p === '/api/authenticator/disable' && req.method === 'POST') {
      const { code } = await body(req);
      try { await authenticator.disable(String(code ?? '')); } catch (e) { throw new HttpError(400, (e as Error).message); }
      note('account', user.name, 'Turned off authenticator codes');
      return send(200, { enabled: false });
    }
    if (p === '/api/passkeys' && req.method === 'GET') return send(200, { passkeys: await passkeys.list() });
    if (p === '/api/passkeys/options' && req.method === 'POST') {
      try { return send(200, await passkeys.registrationOptions(user.name, rp(req))); } catch (e) { throw new HttpError(409, (e as Error).message); }
    }
    if (p === '/api/passkeys/add' && req.method === 'POST') {
      const { ticket, response, name } = await body(req);
      try {
        const key = await passkeys.register(user.name, String(ticket ?? ''), response, String(name ?? ''));
        note('account', user.name, `Added the passkey "${key.name}"`);
        return send(201, { passkey: key });
      } catch (e) { throw new HttpError(400, (e as Error).message); }
    }
    if (p === '/api/passkeys/remove' && req.method === 'POST') {
      const { id } = await body(req);
      const name = (await passkeys.list()).find((k) => k.id === id)?.name;
      try { await passkeys.remove(String(id ?? '')); } catch (e) { throw new HttpError(404, (e as Error).message); }
      note('account', user.name, `Removed the passkey "${name}"`);
      return send(200, { ok: true });
    }
    if (p === '/api/passkeys/rename' && req.method === 'POST') {
      const { id, name } = await body(req);
      try { await passkeys.rename(String(id ?? ''), String(name ?? '')); } catch (e) { throw new HttpError(404, (e as Error).message); }
      return send(200, { ok: true });
    }
    // Local AI helper: the server talks to an Ollama running beside it (the page cannot reach it directly).
    if (p === '/api/ollama/models' && req.method === 'GET') {
      try {
        const r = await (opts.fetchImpl ?? fetch)(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`Ollama answered ${r.status}`);
        const j = await r.json() as { models?: Array<{ name?: string }> };
        return send(200, { models: (j.models ?? []).map((m) => String(m.name ?? '')).filter(Boolean).slice(0, 200) });
      } catch (e) { throw new HttpError(503, `Ollama is not reachable at ${ollamaBase} (${(e as Error).message}). Install it from ollama.com, start it on the computer that runs Map Editor, or set MAP_EDITOR_OLLAMA.`); }
    }
    if (p === '/api/ollama/ask' && req.method === 'POST') {
      const { model, prompt } = await body(req);
      if (typeof model !== 'string' || !/^[\w.:/-]{1,120}$/.test(model)) throw new HttpError(400, 'Choose a model.');
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) throw new HttpError(400, 'Write a question of up to 8,000 characters.');
      try {
        const r = await (opts.fetchImpl ?? fetch)(`${ollamaBase}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, stream: false }), signal: AbortSignal.timeout(180_000) });
        if (!r.ok) throw new Error(`Ollama answered ${r.status}`);
        const j = await r.json() as { response?: string };
        return send(200, { response: String(j.response ?? '').slice(0, 100_000) });
      } catch (e) { throw new HttpError(503, `Ollama could not answer (${(e as Error).message}).`); }
    }
    if (p === '/api/activity' && req.method === 'GET') return send(200, { events: await activity.list() });
    if (p === '/api/activity' && req.method === 'POST') {
      // The page reports settings changes (they live in each browser); only these kinds are accepted from it.
      const { kind, message } = await body(req);
      if (kind !== 'settings' && kind !== 'instance') throw new HttpError(400, 'Only settings and instance activity can be recorded from the page.');
      if (typeof message !== 'string' || !message.trim()) throw new HttpError(400, 'Give the activity a message.');
      return send(201, { event: await activity.record(kind, user.name, message) });
    }
    if (p === '/api/worlds' && req.method === 'GET') return send(200, { roots: opts.worldRoots, worlds: await discoverWorlds(opts.worldRoots) });
    if (p === '/api/worlds/upload' && req.method === 'POST') {
      const root = opts.worldRoots[0];
      if (!root) throw new HttpError(409, 'This server has no worlds folder to upload into.');
      const limit = 4 * 1024 ** 3;
      if (Number(req.headers['content-length'] ?? 0) > limit) throw new HttpError(413, 'That file is larger than 4 GiB.');
      const tmpDir = path.join(opts.dataDir, 'uploads');
      await fs.mkdir(tmpDir, { recursive: true });
      const tmp = path.join(tmpDir, randomBytes(8).toString('hex') + '.zip');
      let size = 0;
      req.on('data', (c: Buffer) => { size += c.length; if (size > limit) req.destroy(new Error('too large')); });
      try {
        await pipeline(req, createWriteStream(tmp));
        const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'Uploaded world'));
        const dir = await importWorldZip(tmp, root, name);
        note('world', user.name, `Uploaded world ${path.basename(dir)}`);
        return send(201, { path: dir, name: path.basename(dir) });
      } catch (e) {
        throw new HttpError(size > limit ? 413 : 400, size > limit ? 'That file is larger than 4 GiB.' : (e as Error).message);
      } finally { await fs.rm(tmp, { force: true }); }
    }
    if (p === '/api/worlds/new' && req.method === 'POST') {
      const root = opts.worldRoots[0];
      if (!root) throw new HttpError(409, 'This server has no worlds folder to create a world in.');
      const { name, preset, size } = await body(req);
      if (typeof name !== 'string' || !name.trim() || name.length > 80) throw new HttpError(400, 'Give the world a name of 1 to 80 characters.');
      const p = (preset ?? 'classic') as WorldPreset, r = Number(size ?? 4);
      if (!(p in WORLD_PRESETS)) throw new HttpError(400, 'Unknown world preset.');
      if (!WORLD_SIZES.includes(r as typeof WORLD_SIZES[number])) throw new HttpError(400, 'World size must be 2, 4, 8 or 12 chunks from the centre.');
      await fs.mkdir(root, { recursive: true });
      const dir = await createFlatWorld(root, name, r, p);
      note('world', user.name, `Created flat world ${path.basename(dir)}`);
      return send(201, { path: dir, name: path.basename(dir) });
    }
    if (p === '/api/worlds/download' && req.method === 'GET') {
      const wp = url.searchParams.get('path') ?? '';
      if (!worldAllowed(wp) || !isWorldFolder(wp)) throw new HttpError(403, 'That world is not available for download.');
      if (session && path.resolve(session.world.dir) === path.resolve(wp) && session.world.unsavedChunks) throw new HttpError(409, 'Save the world before downloading it.');
      const file = encodeURIComponent(path.basename(wp)) + '.zip';
      res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': `attachment; filename*=UTF-8''${file}`, 'cache-control': 'no-store' });
      await exportWorldZip(wp, res);
      return;
    }
    if (p === '/api/worlds/open' && req.method === 'POST') {
      const { path: wp } = await body(req);
      if (typeof wp !== 'string' || !worldAllowed(wp)) throw new HttpError(403, 'That folder is outside the worlds folder this server was set up with.');
      if (!isWorldFolder(wp)) throw new HttpError(404, 'No level.dat in that folder.');
      if (isBedrockWorld(wp)) throw new HttpError(415, 'This is a Bedrock Edition world. Map Editor edits Java Edition worlds; convert it to Java Edition first (for example with Amulet or Chunker), then upload the result.');
      session = await EditSession.open(opts.dataDir, wp);
      return send(200, { info: session.world.info });
    }
    if (p === '/api/extensions/upload' && req.method === 'POST') {
      const limit = 20 * 1024 * 1024;
      if (Number(req.headers['content-length'] ?? 0) > limit) throw new HttpError(413, 'Extension archives are limited to 20 MiB.');
      const tmpDir = path.join(opts.dataDir, 'uploads');
      await fs.mkdir(tmpDir, { recursive: true });
      const tmp = path.join(tmpDir, randomBytes(8).toString('hex') + '.zip');
      let size = 0;
      req.on('data', (c: Buffer) => { size += c.length; if (size > limit) req.destroy(new Error('too large')); });
      try {
        await pipeline(req, createWriteStream(tmp));
        const m = await extensions.installZip(tmp, req.headers['x-replace'] === '1');
        return send(201, { id: m.id, name: m.name, version: m.version });
      } catch (e) {
        if (e instanceof ReplaceNeeded) return send(409, { replace: true, id: e.id, installed: e.installed, incoming: e.incoming, error: e.message });
        throw new HttpError(size > limit ? 413 : 400, size > limit ? 'Extension archives are limited to 20 MiB.' : (e as Error).message);
      } finally { await fs.rm(tmp, { force: true }); }
    }
    if (p === '/api/extensions/add-folder' && req.method === 'POST') {
      // Only the desktop app (which runs for one person on their own computer) may read any folder.
      if (!opts.allowAnyPath) throw new HttpError(403, 'Adding from a folder is only available in the desktop app. Upload a .zip instead.');
      const { path: src, replace } = await body(req);
      try { const m = await extensions.installFolder(String(src ?? ''), replace === true); note('extension', user.name, `Installed extension ${m.id} ${m.version}`); return send(201, { id: m.id, name: m.name, version: m.version }); }
      catch (e) {
        if (e instanceof ReplaceNeeded) return send(409, { replace: true, id: e.id, installed: e.installed, incoming: e.incoming, error: e.message });
        throw new HttpError(400, (e as Error).message);
      }
    }
    if (p === '/api/extensions/add-url' && req.method === 'POST') {
      const { url: link, replace, sha256 } = await body(req);
      try { const m = await extensions.installUrl(String(link ?? ''), replace === true, opts.fetchImpl, typeof sha256 === 'string' ? sha256 : undefined); note('extension', user.name, `Installed extension ${m.id} ${m.version}`); return send(201, { id: m.id, name: m.name, version: m.version, sha256: m.sha256 }); }
      catch (e) {
        if (e instanceof ReplaceNeeded) return send(409, { replace: true, id: e.id, installed: e.installed, incoming: e.incoming, error: e.message });
        throw new HttpError(400, (e as Error).message);
      }
    }
    if (p === '/api/extensions/remove' && req.method === 'POST') {
      const { id } = await body(req);
      try { await extensions.remove(String(id ?? '')); } catch (e) { throw new HttpError(400, (e as Error).message); }
      note('extension', user.name, `Removed extension ${String(id)}`);
      return send(200, { ok: true });
    }
    if (p === '/api/extensions/master' && req.method === 'POST') {
      const { on } = await body(req);
      await extensions.setMaster(on === true);
      note('extension', user.name, on === true ? 'Turned extensions on' : 'Turned every extension off');
      return send(200, { on: on === true });
    }
    if (p === '/api/extensions/runs' && req.method === 'GET') return send(200, { runs: await extensions.recentRuns() });
    if (p === '/api/extensions' && req.method === 'GET') {
      // Folder paths stay on the server; the page gets what the manager shows.
      const list = await extensions.list();
      return send(200, { masterOn: await extensions.masterOn(), canAddFolder: !!opts.allowAnyPath, folder: opts.allowAnyPath ? extensions.folder() : undefined, permissions: PERMISSIONS, extensions: list.map((e) => ({ ...e.manifest, run: undefined, builtIn: e.builtIn, enabled: e.enabled, needsConsent: e.needsConsent, error: e.error, permissionKey: e.error ? undefined : permissionKey(e.manifest) })) });
    }
    if (p === '/api/extensions/enable' && req.method === 'POST') {
      const { id, enabled, permissionKey: key } = await body(req);
      try { await extensions.setEnabled(String(id ?? ''), enabled === true, typeof key === 'string' ? key : undefined); } catch (e) { throw new HttpError(409, (e as Error).message); }
      note('extension', user.name, `${enabled === true ? 'Allowed and switched on' : 'Switched off'} extension ${String(id)}`);
      return send(200, { ok: true });
    }
    if (!session) throw new HttpError(409, 'Open a world first.');
    if (p === '/api/extensions/run' && req.method === 'POST') {
      const { id, command, selection } = await body(req);
      const info = session.world.info;
      const sel = selection && DIMS.includes(selection.dimension) && ['x1', 'y1', 'z1', 'x2', 'y2', 'z2'].every((k) => Number.isInteger(selection.box?.[k])) ? { dimension: selection.dimension, box: selection.box } : undefined;
      let result;
      try {
        result = await extensions.run(String(id ?? ''), String(command ?? ''), { world: { name: info.name, version: info.versionName, dataVersion: info.dataVersion, spawn: info.spawn, dimensions: info.dimensions ?? ['overworld'] }, selection: sel });
      } catch (e) { throw new HttpError(422, (e as Error).message); }
      const applied = [];
      for (const op of result.ops) applied.push(await session.run(op)); // each one is a normal, recorded edit
      return send(200, { message: result.message, applied: applied.length, changed: applied.reduce((n, a) => n + (a as { changed: number }).changed, 0) });
    }

    if (p === '/api/world' && req.method === 'GET') {
      const dim = (url.searchParams.get('dim') ?? 'overworld') as Dimension;
      if (!DIMS.includes(dim)) throw new HttpError(400, 'Unknown dimension');
      return send(200, { info: session.world.info, chunks: await session.world.listChunks(dim) });
    }
    if (p === '/api/top' && req.method === 'GET') {
      const dim = (url.searchParams.get('dim') ?? 'overworld') as Dimension;
      if (!DIMS.includes(dim)) throw new HttpError(400, 'Unknown dimension');
      const q = url.searchParams;
      const top = await session.topBlock(dim, int(q.get('x'), 'x', -30_000_000, 30_000_000), int(q.get('z'), 'z', -30_000_000, 30_000_000));
      return send(200, { top: top ?? null });
    }
    if (p === '/api/volume' && req.method === 'GET') {
      const q = url.searchParams;
      const dim = (q.get('dim') ?? 'overworld') as Dimension;
      if (!DIMS.includes(dim)) throw new HttpError(400, 'Unknown dimension');
      const box = Object.fromEntries((['x1', 'y1', 'z1', 'x2', 'y2', 'z2'] as const).map((k) => [k, int(q.get(k), k, -30_000_000, 30_000_000)])) as unknown as Box;
      try { return send(200, await session.volume(dim, box)); } catch (e) { throw new HttpError(400, (e as Error).message); }
    }
    if (p === '/api/slice' && req.method === 'GET') {
      const q = url.searchParams;
      const dim = (q.get('dim') ?? 'overworld') as Dimension;
      if (!DIMS.includes(dim)) throw new HttpError(400, 'Unknown dimension');
      const axis = q.get('axis') === 'x' ? 'x' : 'z';
      const r = await session.renderSlice(dim, axis, int(q.get('at'), 'at', -30_000_000, 30_000_000), int(q.get('from'), 'from', -30_000_000, 30_000_000), int(q.get('to'), 'to', -30_000_000, 30_000_000), int(q.get('y0'), 'y0', -64, 319), int(q.get('y1'), 'y1', -64, 319)).catch((e) => { throw new HttpError(400, (e as Error).message); });
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'x-width': String(r.width), 'x-height': String(r.height), 'cache-control': 'no-store' });
      return res.end(Buffer.from(r.px.buffer, r.px.byteOffset, r.px.byteLength));
    }
    if (p === '/api/render' && req.method === 'GET') {
      const dim = (url.searchParams.get('dim') ?? 'overworld') as Dimension;
      if (!DIMS.includes(dim)) throw new HttpError(400, 'Unknown dimension');
      const q = url.searchParams;
      const px = await session.renderChunks(dim, int(q.get('cx'), 'cx', -1_875_000, 1_875_000), int(q.get('cz'), 'cz', -1_875_000, 1_875_000), int(q.get('w'), 'w', 1, 64), int(q.get('h'), 'h', 1, 64));
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' });
      return res.end(Buffer.from(px.buffer, px.byteOffset, px.byteLength));
    }
    if (p === '/api/structure' && req.method === 'GET') {
      const q = url.searchParams;
      const dim = (q.get('dim') ?? 'overworld') as Dimension;
      if (!DIMS.includes(dim)) throw new HttpError(400, 'Unknown dimension');
      const box = Object.fromEntries((['x1', 'y1', 'z1', 'x2', 'y2', 'z2'] as const).map((k) => [k, int(q.get(k), k, -30_000_000, 30_000_000)])) as unknown as Box;
      let data: Buffer;
      try { data = await session.exportStructure(dim, box); } catch (e) { throw new HttpError(400, (e as Error).message); }
      const file = `${path.basename(session.world.dir).replace(/[^\w.-]+/g, '_')}-${box.x1}_${box.y1}_${box.z1}.nbt`;
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${file}"`, 'cache-control': 'no-store' });
      return res.end(data);
    }
    if (p === '/api/structure/place' && req.method === 'POST') {
      const q = url.searchParams;
      const dim = (q.get('dim') ?? 'overworld') as Dimension;
      if (!DIMS.includes(dim)) throw new HttpError(400, 'Unknown dimension');
      const at = { x: int(q.get('x'), 'x', -30_000_000, 30_000_000), y: int(q.get('y'), 'y', -64, 319), z: int(q.get('z'), 'z', -30_000_000, 30_000_000) };
      const chunks: Buffer[] = []; let size = 0;
      for await (const c of req) { size += (c as Buffer).length; if (size > 64 * 1024 * 1024) throw new HttpError(413, 'Structure files are limited to 64 MiB.'); chunks.push(c as Buffer); }
      let s;
      try { s = decodeStructure(Buffer.concat(chunks)); } catch (e) { throw new HttpError(400, (e as Error).message); }
      const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'a structure')).replace(/[\r\n]+/g, ' ').slice(0, 80);
      return send(200, await session.placeStructure(dim, s, at, name));
    }
    if (p === '/api/op' && req.method === 'POST') {
      const r = (await body(req)) as OperationRequest;
      if (!OPERATIONS.includes(r.op)) throw new HttpError(400, 'Unknown operation');
      if (!DIMS.includes(r.dimension)) throw new HttpError(400, 'Unknown dimension');
      for (const k of ['x1', 'y1', 'z1', 'x2', 'y2', 'z2'] as const) if (!Number.isInteger(r.box?.[k])) throw new HttpError(400, `box.${k} must be a whole number`);
      if (volume(r.box) > MAX_OPERATION_BLOCKS) throw new HttpError(400, 'Selection is larger than the operation limit.');
      try { return send(200, await session.run(r)); } catch (e) { throw new HttpError(400, (e as Error).message); }
    }
    if (p === '/api/notes') {
      const file = path.join(opts.dataDir, 'notes', path.basename(session.history.gitdir).replace(/\.git$/, '') + '.html');
      if (req.method === 'GET') { let html = ''; try { html = await fs.readFile(file, 'utf8'); } catch { /* none yet */ } return send(200, { html }); }
      if (req.method === 'PUT') {
        const { html } = await body(req, 512 * 1024);
        if (typeof html !== 'string') throw new HttpError(400, 'html must be text');
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file + '.tmp', html); await fs.rename(file + '.tmp', file);
        return send(200, { saved: true });
      }
    }
    if (p === '/api/history/undo' && req.method === 'POST') {
      const entries = await session.history.list(2);
      if (entries.length < 2) throw new HttpError(409, 'Nothing to undo yet.');
      return send(200, { entry: await session.restore(entries[1].sha), undid: entries[0].message });
    }
    if (p === '/api/history' && req.method === 'GET') return send(200, { entries: await session.history.list() });
    if (p === '/api/history/restore' && req.method === 'POST') {
      const { sha } = await body(req);
      if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) throw new HttpError(400, 'sha must be a full commit id');
      return send(200, { entry: await session.restore(sha) });
    }
    if (p === '/api/history/stats' && req.method === 'GET') {
      const sha = url.searchParams.get('sha') ?? '';
      if (!/^[0-9a-f]{40}$/.test(sha)) throw new HttpError(400, 'sha must be a full commit id');
      return send(200, { stats: await session.history.stats(sha) });
    }
    if (p === '/api/history/copy' && req.method === 'POST') {
      const { sha } = await body(req);
      if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) throw new HttpError(400, 'sha must be a full commit id');
      // The copy goes next to the world, named after it and the entry, and never replaces a folder.
      const src = path.resolve(session.world.dir);
      const info = await worldInfo(src);
      const base = `${path.basename(src)} at ${sha.slice(0, 7)}`;
      let dest = path.join(path.dirname(src), base);
      for (let n = 2; existsSync(dest); n++) dest = path.join(path.dirname(src), `${base} (${n})`);
      if (!worldAllowed(dest)) throw new HttpError(403, 'A copy cannot be written outside the worlds folder.');
      await session.history.copyAt(sha, dest);
      const name = `${info.name} (at ${sha.slice(0, 7)})`;
      await setLevelName(dest, name);
      note('world', user.name, `Made ${path.basename(dest)} from ${path.basename(src)} at ${sha.slice(0, 7)}`);
      return send(201, { path: dest, name });
    }
    throw new HttpError(404, 'No such API route');
  }

  async function serveStatic(res: http.ServerResponse, pathname: string) {
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const file = path.resolve(staticDir, rel);
    if (!file.startsWith(path.resolve(staticDir) + path.sep)) { res.writeHead(403).end(); return; }
    const target = existsSync(file) ? file : path.join(staticDir, 'index.html');
    try {
      const data = await fs.readFile(target);
      res.writeHead(200, {
        'content-type': MIME[path.extname(target)] ?? 'application/octet-stream',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
      });
      res.end(data);
    } catch { res.writeHead(404).end('Not found'); }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://local');
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await serveStatic(res, url.pathname);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: status === 500 ? 'Something went wrong on the server. Check its log.' : (e as Error).message }));
    }
  });

  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(opts.port, opts.host, resolve); });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.port;
  return { server, port, build, close: () => new Promise<void>((r) => server.close(() => r())) };
}

// Entry point for the Docker image and the appliance.
if (typeof __dirname !== 'string' && process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const host = process.env.MAP_EDITOR_HOST ?? '0.0.0.0';
  const port = Number(process.env.MAP_EDITOR_PORT ?? 8420);
  const dataDir = process.env.MAP_EDITOR_DATA ?? '/data';
  const worldRoots = (process.env.MAP_EDITOR_WORLDS ?? '/worlds').split(path.delimiter).filter(Boolean);
  createServer({ host, port, dataDir, worldRoots }).then(({ port: p, build }) => {
    console.log(`Map Editor ${build.version} listening on ${host}:${p}`);
    for (const ip of lanAddresses()) console.log(`  http://${ip}:${p}/`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
