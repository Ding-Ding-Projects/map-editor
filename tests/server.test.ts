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
    expect((await (await call('/api/top?dim=overworld&x=3&z=4')).json()).top).toEqual({ y: 63, block: 'minecraft:water' });
    expect((await (await call('/api/top?dim=overworld&x=-500&z=-500')).json()).top).toBeNull();
    expect((await call('/api/top?dim=overworld&x=a&z=0')).status).toBe(400);
    // Side view along x at z 3, from y 60 to 64: water at 63 over grass at 62, air above.
    const sl = await call('/api/slice?dim=overworld&axis=z&at=3&from=0&to=3&y0=60&y1=64');
    expect([sl.headers.get('x-width'), sl.headers.get('x-height')]).toEqual(['4', '5']);
    const spx = new Uint8Array(await sl.arrayBuffer());
    const alpha = (row: number) => spx[(row * 4 + 0) * 4 + 3];
    expect([alpha(0), alpha(1), alpha(2)]).toEqual([0, 255, 255]); // y 64 air, y 63 water, y 62 grass
    expect((await call('/api/slice?dim=overworld&axis=z&at=3&from=0&to=5000&y0=60&y1=64')).status).toBe(400);
    const vol = await (await call('/api/volume?dim=overworld&x1=0&y1=62&z1=0&x2=1&y2=64&z2=1')).json();
    expect(vol.size).toEqual([2, 3, 2]);
    expect(vol.palette.sort()).toEqual(['minecraft:grass_block', 'minecraft:water']);
    expect(vol.cells.length).toBe(8 * 4); // 4 grass + 4 water, air left out
    expect((await call('/api/volume?dim=overworld&x1=0&y1=0&z1=0&x2=100&y2=1&z2=1')).status).toBe(400);
    expect([...after.slice(0, 3)]).toEqual([63, 104, 201]); // water, top-down

    const { entries } = await (await call('/api/history')).json();
    expect(entries.map((e: { action: string }) => e.action)).toEqual(['filled', 'opened']);
    expect((await call('/api/history/restore', { method: 'POST', body: { sha: entries[1].sha } })).status).toBe(200);
    const restored = new Uint8Array(await (await call('/api/render?dim=overworld&cx=0&cz=0&w=1&h=1')).arrayBuffer());
    expect([...restored.slice(0, 4)]).toEqual([...before.slice(0, 4)]);

    // Per-entry stats: the fill touched one chunk in one overworld region file.
    const fill = entries[0];
    const stats = (await (await call(`/api/history/stats?sha=${fill.sha}`)).json()).stats;
    expect(stats).toEqual({ files: 1, regions: 1, chunks: 1, dimensions: ['overworld'] });
    expect((await call('/api/history/stats?sha=nope')).status).toBe(400);

    // Open as a copy: the world as it was after the fill, in a new folder next to it, original untouched.
    const copy = await (await call('/api/history/copy', { method: 'POST', body: { sha: fill.sha } })).json();
    expect(path.basename(copy.path)).toBe(`Survival at ${fill.sha.slice(0, 7)}`);
    expect(copy.name).toBe(`Survival Island (at ${fill.sha.slice(0, 7)})`);
    const again = await (await call('/api/history/copy', { method: 'POST', body: { sha: fill.sha } })).json();
    expect(path.basename(again.path)).toBe(`Survival at ${fill.sha.slice(0, 7)} (2)`);
    const names = (await (await call('/api/worlds')).json()).worlds.map((w: { name: string }) => w.name).sort();
    expect(names).toEqual(['Survival Island', `Survival Island (at ${fill.sha.slice(0, 7)})`, `Survival Island (at ${fill.sha.slice(0, 7)})`]);
    expect((await call('/api/worlds/open', { method: 'POST', body: { path: copy.path } })).status).toBe(200);
    const copied = new Uint8Array(await (await call('/api/render?dim=overworld&cx=0&cz=0&w=1&h=1')).arrayBuffer());
    expect([...copied.slice(0, 3)]).toEqual([63, 104, 201]);
    expect((await call('/api/worlds/open', { method: 'POST', body: { path: worldDir } })).status).toBe(200);
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

  it('exports the selection as a structure file and places one, recorded in history', async () => {
    expect((await call('/api/worlds/open', { method: 'POST', body: { path: worldDir } })).status).toBe(200);
    const res = await call('/api/structure?dim=overworld&x1=0&y1=62&z1=0&x2=1&y2=62&z2=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/\.nbt"/);
    const file = Buffer.from(await res.arrayBuffer());
    expect(file[0]).toBe(0x1f); // gzip
    const place = await fetch(`${base}/api/structure/place?dim=overworld&x=4&y=70&z=4`, { method: 'POST', headers: { cookie, 'x-map-editor': '1', 'x-file-name': 'patch.nbt' }, body: file });
    expect(place.status).toBe(200);
    expect((await place.json()).changed).toBe(4);
    const { entries } = await (await call('/api/history')).json();
    expect(entries[0]).toMatchObject({ action: 'placed', message: 'Placed patch.nbt (2×1×2) at 4, 70, 4' });
    expect((await fetch(`${base}/api/structure/place?dim=overworld&x=4&y=70&z=4`, { method: 'POST', headers: { cookie, 'x-map-editor': '1' }, body: 'nope' })).status).toBe(400);
    expect((await fetch(`${base}/api/structure/place?dim=overworld&x=4&y=70&z=4`, { method: 'POST', headers: { cookie }, body: file })).status).toBe(403);
  });

  it('keeps an activity record of accounts, worlds and settings', async () => {
    const { events } = await (await call('/api/activity')).json();
    const messages = events.map((e: { kind: string; message: string }) => `${e.kind}: ${e.message}`);
    expect(messages).toContain('account: Created the owner account');
    expect(messages.some((m: string) => m.startsWith('world: Made Survival at'))).toBe(true);
    expect((await call('/api/activity', { method: 'POST', body: { kind: 'settings', message: 'Dark theme on' } })).status).toBe(201);
    expect((await call('/api/activity', { method: 'POST', body: { kind: 'account', message: 'Pretend sign-in' } })).status).toBe(400);
    expect((await (await call('/api/activity')).json()).events[0]).toMatchObject({ kind: 'settings', message: 'Dark theme on' });
    expect(JSON.stringify(events)).not.toMatch(/correct horse|another long password|wrong password!!/);
  });

  it('slows sign-in guessing and refuses structure files that unpack too large', async () => {
    const { Throttle } = await import('../src/server/auth.js');
    const th = new Throttle(5, 600_000);
    for (let i = 0; i < 5; i++) { expect(th.wait('a', 1000)).toBe(0); th.fail('a', 1000); }
    expect(th.wait('a', 2000)).toBeGreaterThan(0);
    expect(th.wait('b', 2000)).toBe(0);
    expect(th.wait('a', 1000 + 600_001)).toBe(0);
    th.fail('c'); th.ok('c'); expect(th.wait('c')).toBe(0);
    const { decodeStructure } = await import('../src/core/structure.js');
    const { gzipSync } = await import('node:zlib');
    expect(() => decodeStructure(gzipSync(Buffer.alloc(300 * 1024 * 1024)))).toThrow(/256 MiB/);
  });

  it('answers clearly when the local AI helper has no Ollama to talk to', async () => {
    const r = await call('/api/ollama/models');
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/Ollama is not reachable/);
    expect((await call('/api/ollama/ask', { method: 'POST', body: { model: 'bad model!', prompt: 'hi' } })).status).toBe(400);
    expect((await call('/api/ollama/ask', { method: 'POST', body: { model: 'llama3', prompt: '' } })).status).toBe(400);
  });

  it('refuses non-JSON state-changing requests', async () => {
    const r = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    expect(r.status).toBe(415);
  });
});

describe('Postman collection', () => {
  it('lists every route the server answers', async () => {
    // @ts-expect-error the script is plain JavaScript with no type file
    const { routes, collection } = await import('../scripts/postman.mjs');
    const { readFileSync } = await import('node:fs');
    const saved = JSON.parse(readFileSync(new URL('../docs/postman/map-editor.postman_collection.json', import.meta.url), 'utf8'));
    expect(saved).toEqual(JSON.parse(JSON.stringify(collection())));
    const names = saved.item.flatMap((g: { item: Array<{ name: string }> }) => g.item.map((i) => i.name));
    expect(names.length).toBe(routes().length);
    for (const must of ['POST /api/auth/login', 'GET /api/worlds', 'POST /api/worlds/open', 'GET /api/render', 'GET /api/blocks']) expect(names).toContain(must);
  });
  it('keeps one collection per area on disk, together holding every route exactly once', async () => {
    // @ts-expect-error the script is plain JavaScript with no type file
    const { areaCollections, routes } = await import('../scripts/postman.mjs');
    const { readFileSync, readdirSync } = await import('node:fs');
    const areas: Map<string, { item: Array<{ name: string }> }> = areaCollections();
    const dir = new URL('../docs/postman/', import.meta.url);
    expect(readdirSync(dir).filter((f) => f.endsWith('.json')).sort()).toEqual(['map-editor.postman_collection.json', ...areas.keys()].sort());
    const names: string[] = [];
    for (const [file, c] of areas) { expect(JSON.parse(readFileSync(new URL(file, dir), 'utf8')), file).toEqual(JSON.parse(JSON.stringify(c))); names.push(...c.item.map((i) => i.name)); }
    expect(names.length).toBe(routes().length);
    expect(new Set(names).size).toBe(names.length);
  });
  it('gives every state-changing request the fields the server reads, with a real example for each', async () => {
    // @ts-expect-error the script is plain JavaScript with no type file
    const { bodyFields, collection, EXAMPLES, UPLOADS } = await import('../scripts/postman.mjs');
    const fields: Map<string, string[]> = bodyFields();
    expect(fields.get('POST /api/auth/login')).toEqual(['name', 'password', 'code']);
    expect(fields.get('POST /api/extensions/enable')).toEqual(['id', 'enabled', 'permissionKey']);
    for (const [route, list] of fields) for (const f of list) expect(EXAMPLES, `${route} reads ${f}`).toHaveProperty(f);
    const items = collection().item.flatMap((g: { item: Array<{ name: string; request: { body?: { mode: string; raw?: string }; header: Array<{ key: string }>; description?: string } }> }) => g.item);
    for (const i of items) {
      if (i.name.startsWith('GET')) { expect(i.request.body).toBeUndefined(); continue; }
      expect(i.request.description, i.name).toBeTruthy();
      if (UPLOADS.has(i.name)) { expect(i.request.body?.mode).toBe('file'); expect(i.request.header.map((h: { key: string }) => h.key)).toContain('X-Map-Editor'); continue; }
      const sent = Object.keys(JSON.parse(i.request.body?.raw ?? 'null'));
      if (i.name === 'POST /api/op') expect(sent).toEqual(['op', 'dimension', 'box', 'block']);
      else expect(sent, i.name).toEqual(fields.get(i.name));
    }
  });
});

describe('notes are cleaned before they are stored', () => {
  it('keeps ordinary formatting and drops anything that can run', async () => {
    const { sanitizeNotes } = await import('../src/server/sanitize.js');
    expect(sanitizeNotes('<p>Hello <b>there</b><br><a href="https://example.org/a?b=1&amp;c=2" title="t">link</a></p>')).toBe('<p>Hello <b>there</b><br><a href="https://example.org/a?b=1&amp;c=2" title="t" rel="noopener noreferrer">link</a></p>');
    const dirty = '<p onclick="x()">a</p><script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">j</a><a href=" JaVa\tScript:alert(1)">k</a><iframe src="https://e.org"></iframe><svg><script>1</script></svg><style>p{}</style><!-- c --><form><input></form><img src="data:text/html;base64,AAAA"><div style="background:url(javascript:1)">d</div><scr<script>ipt>alert(2)</script>';
    const clean = sanitizeNotes(dirty);
    expect(clean).not.toMatch(/script|onerror|onclick|javascript|iframe|style|<form|<input|<svg|data:text/i);
    expect(clean).toContain('<p>a</p>'); expect(clean).toContain('<div>d</div>');
    expect(sanitizeNotes('<img src="data:image/png;base64,iVBORw0KGgo=" alt="a" width="20" height="9999999">')).toBe('<img src="data:image/png;base64,iVBORw0KGgo=" alt="a" width="20">');
    expect(sanitizeNotes('<script>alert(1)')).toBe('');
    expect(sanitizeNotes(sanitizeNotes(dirty))).toBe(clean); // cleaning twice changes nothing
  });
});
