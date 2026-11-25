import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../src/server/server.js';
import { createWorld, World } from '../src/core/world.js';

let base = '';
let close: () => Promise<void>;
let worldDir = '';
let cookie = '';

async function call(p: string, init: { method?: string; body?: unknown; auth?: boolean } = {}) {
  const res = await fetch(base + p, {
    method: init.method ?? 'GET',
    headers: { ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(init.auth !== false && cookie ? { cookie } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc && init.auth !== false) cookie = sc.split(';')[0];
  return res;
}

beforeAll(async () => {
  const roots = await mkdtemp(path.join(os.tmpdir(), 'me-roots-'));
  worldDir = path.join(roots, 'Survival');
  await mkdir(worldDir);
  await createWorld(worldDir, 'Survival Island');
  const w = await World.open(worldDir);
  for (let cx = 0; cx < 2; cx++) for (let cz = 0; cz < 2; cz++) {
    const c = (await w.chunk('overworld', cx, cz, true))!;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) c.setBlock(x, 62, z, { name: 'minecraft:grass_block' });
    await w.setBlock('overworld', cx * 16, 62, cz * 16, { name: 'minecraft:grass_block' });
  }
  await w.save();
  const s = await createServer({ host: '127.0.0.1', port: 0, dataDir: await mkdtemp(path.join(os.tmpdir(), 'me-data-')), worldRoots: [roots] });
  base = `http://127.0.0.1:${s.port}`;
  close = s.close;
});
afterAll(() => close());

describe('server', () => {
  it('reports health with version provenance (honestly unavailable in tests)', async () => {
    const j = await (await call('/api/health')).json();
    expect(j.ok).toBe(true);
    expect(j).toHaveProperty('version');
  });

  it('lets exactly one of two simultaneous first visitors become owner', async () => {
    expect((await (await call('/api/auth/state')).json()).hasOwner).toBe(false);
    const [a, b] = await Promise.all([
      fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alex', password: 'correct horse battery' }) }),
      fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Intruder', password: 'another long password' }) }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const winner = a.status === 201 ? 'Alex' : 'Intruder';
    const pw = winner === 'Alex' ? 'correct horse battery' : 'another long password';
    expect((await call('/api/auth/login', { method: 'POST', body: { name: winner, password: 'wrong password!!' } })).status).toBe(401);
    expect((await call('/api/auth/login', { method: 'POST', body: { name: winner, password: pw } })).status).toBe(200);
  });

  it('refuses API calls without a session', async () => {
    expect((await call('/api/worlds', { auth: false })).status).toBe(401);
  });

  it('only opens worlds inside the configured roots', async () => {
    const r = await call('/api/worlds/open', { method: 'POST', body: { path: os.tmpdir() } });
    expect(r.status).toBe(403);
  });

  it('opens, edits, renders and rolls back a world', async () => {
    const list = await (await call('/api/worlds')).json();
    expect(list.worlds.map((w: { name: string }) => w.name)).toEqual(['Survival Island']);
    expect((await call('/api/worlds/open', { method: 'POST', body: { path: worldDir } })).status).toBe(200);

    const before = new Uint8Array(await (await call('/api/render?dim=overworld&cx=0&cz=0&w=1&h=1')).arrayBuffer());
    expect(before.length).toBe(16 * 16 * 4);
    expect(before[3]).toBe(255);

    const op = await (await call('/api/op', { method: 'POST', body: { op: 'fill', dimension: 'overworld', box: { x1: 0, y1: 63, z1: 0, x2: 15, y2: 63, z2: 15 }, block: 'minecraft:water' } })).json();
    expect(op.changed).toBe(256);
    expect(op.history.action).toBe('filled');

    const after = new Uint8Array(await (await call('/api/render?dim=overworld&cx=0&cz=0&w=1&h=1')).arrayBuffer());
    expect([...after.slice(0, 3)]).toEqual([63, 104, 201]); // water, top-down

    const { entries } = await (await call('/api/history')).json();
    expect(entries.map((e: { action: string }) => e.action)).toEqual(['filled', 'opened']);
    expect((await call('/api/history/restore', { method: 'POST', body: { sha: entries[1].sha } })).status).toBe(200);
    const restored = new Uint8Array(await (await call('/api/render?dim=overworld&cx=0&cz=0&w=1&h=1')).arrayBuffer());
    expect([...restored.slice(0, 4)]).toEqual([...before.slice(0, 4)]);
  });

  it('validates operation input', async () => {
    expect((await call('/api/op', { method: 'POST', body: { op: 'explode', dimension: 'overworld', box: {} } })).status).toBe(400);
    expect((await call('/api/op', { method: 'POST', body: { op: 'fill', dimension: 'overworld', box: { x1: 0, y1: 0, z1: 0, x2: 1, y2: 1, z2: 1 }, block: 'Not A Block' } })).status).toBe(400);
  });

  it('creates, downloads, re-uploads a world and undoes an edit', async () => {
    const made = await (await call('/api/worlds/new', { method: 'POST', body: { name: 'Flat One' } })).json();
    expect(made.name).toBe('Flat One');
    const dl = await call('/api/worlds/download?path=' + encodeURIComponent(made.path));
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-type')).toBe('application/zip');
    const zip = Buffer.from(await dl.arrayBuffer());
    expect(zip.subarray(0, 2).toString()).toBe('PK');

    const noHeader = await fetch(base + '/api/worlds/upload', { method: 'POST', headers: { cookie, 'content-type': 'application/zip' }, body: zip });
    expect(noHeader.status).toBe(403);
    const up = await fetch(base + '/api/worlds/upload', { method: 'POST', headers: { cookie, 'content-type': 'application/zip', 'x-map-editor': '1', 'x-file-name': 'Flat%20One.zip' }, body: zip });
    expect(up.status).toBe(201);
    expect((await up.json()).name).toBe('Flat One (2)');
    const bad = await fetch(base + '/api/worlds/upload', { method: 'POST', headers: { cookie, 'content-type': 'application/zip', 'x-map-editor': '1' }, body: Buffer.from('not a zip at all') });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/not a \.zip|damaged/);

    expect((await call('/api/worlds/open', { method: 'POST', body: { path: made.path } })).status).toBe(200);
    expect((await call('/api/history/undo', { method: 'POST', body: {} })).status).toBe(409);
    await call('/api/op', { method: 'POST', body: { op: 'fill', dimension: 'overworld', box: { x1: 0, y1: -60, z1: 0, x2: 3, y2: -60, z2: 3 }, block: 'minecraft:gold_block' } });
    const undo = await (await call('/api/history/undo', { method: 'POST', body: {} })).json();
    expect(undo.undid).toMatch(/Fill/);
    const { entries } = await (await call('/api/history')).json();
    expect(entries.map((e: { action: string }) => e.action)).toEqual(['restored', 'filled', 'opened']);
  });

  it('refuses non-JSON state-changing requests', async () => {
    const r = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    expect(r.status).toBe(415);
  });
});
