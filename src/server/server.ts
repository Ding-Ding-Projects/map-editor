// HTTP server shared by every form: the desktop app runs it on 127.0.0.1, the Docker
// image and the appliance run it on the LAN. Same API, same UI.
import http from 'node:http';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Accounts } from './auth.js';
import { EditSession, type OperationRequest } from '../core/session.js';
import { discoverWorlds, isWorldFolder, type Dimension } from '../core/world.js';
import { volume, MAX_OPERATION_BLOCKS, OPERATIONS } from '../core/ops.js';

export interface ServerOptions {
  host: string;
  port: number;
  dataDir: string;
  /** Folders whose sub-folders are offered as worlds. */
  worldRoots: string[];
  /** Desktop only: allow opening any folder the person picked in a native dialog. */
  allowAnyPath?: boolean;
  staticDir?: string;
}

export interface BuildInfo { version: string; commit: string; builtAt: string | null }

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
    if (p === '/api/health') return send(200, { ok: true, ...build });

    // Same-origin JSON only for state-changing calls (blocks cross-site form posts).
    if (req.method !== 'GET' && !(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Send JSON');

    const token = cookie(req, 'me_session');
    const user = accounts.session(token);

    if (p === '/api/auth/state') return send(200, { hasOwner: await accounts.hasOwner(), user: user ? { name: user.name } : null });
    if (p === '/api/auth/register' && req.method === 'POST') {
      const { name, password } = await body(req);
      const err = Accounts.validate(String(name ?? ''), String(password ?? ''));
      if (err) throw new HttpError(400, err);
      const result = await accounts.registerOwner(name, password);
      if (result === 'taken') throw new HttpError(409, 'This Map Editor already has an owner. Sign in instead.');
      const t = accounts.startSession(name);
      res.setHeader('set-cookie', `me_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1209600`);
      return send(201, { name, role: 'owner' });
    }
    if (p === '/api/auth/login' && req.method === 'POST') {
      const { name, password } = await body(req);
      if (!(await accounts.verify(String(name ?? ''), String(password ?? '')))) throw new HttpError(401, 'Name or password is wrong.');
      const t = accounts.startSession(name);
      res.setHeader('set-cookie', `me_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1209600`);
      return send(200, { name });
    }
    if (p === '/api/auth/logout' && req.method === 'POST') { accounts.endSession(token); res.setHeader('set-cookie', 'me_session=; Path=/; Max-Age=0'); return send(200, {}); }

    if (!user) throw new HttpError(401, 'Sign in first.');

    if (p === '/api/worlds' && req.method === 'GET') return send(200, { roots: opts.worldRoots, worlds: await discoverWorlds(opts.worldRoots) });
    if (p === '/api/worlds/open' && req.method === 'POST') {
      const { path: wp } = await body(req);
      if (typeof wp !== 'string' || !worldAllowed(wp)) throw new HttpError(403, 'That folder is outside the worlds folder this server was set up with.');
      if (!isWorldFolder(wp)) throw new HttpError(404, 'No level.dat in that folder.');
      session = await EditSession.open(opts.dataDir, wp);
      return send(200, { info: session.world.info });
    }
    if (!session) throw new HttpError(409, 'Open a world first.');

    if (p === '/api/world' && req.method === 'GET') {
      const dim = (url.searchParams.get('dim') ?? 'overworld') as Dimension;
      if (!DIMS.includes(dim)) throw new HttpError(400, 'Unknown dimension');
      return send(200, { info: session.world.info, chunks: await session.world.listChunks(dim) });
    }
    if (p === '/api/render' && req.method === 'GET') {
      const dim = (url.searchParams.get('dim') ?? 'overworld') as Dimension;
      if (!DIMS.includes(dim)) throw new HttpError(400, 'Unknown dimension');
      const q = url.searchParams;
      const px = await session.renderChunks(dim, int(q.get('cx'), 'cx', -1_875_000, 1_875_000), int(q.get('cz'), 'cz', -1_875_000, 1_875_000), int(q.get('w'), 'w', 1, 64), int(q.get('h'), 'h', 1, 64));
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' });
      return res.end(Buffer.from(px.buffer, px.byteOffset, px.byteLength));
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
    if (p === '/api/history' && req.method === 'GET') return send(200, { entries: await session.history.list() });
    if (p === '/api/history/restore' && req.method === 'POST') {
      const { sha } = await body(req);
      if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) throw new HttpError(400, 'sha must be a full commit id');
      return send(200, { entry: await session.restore(sha) });
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
