import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Extensions, validateManifest, checkResponse, exchange, permissionKey, ReplaceNeeded } from '../src/server/extensions.js';
import yazl from 'yazl';
import { createWriteStream } from 'node:fs';

const builtIn = path.join(__dirname, '..', 'extensions');
const ctx = { world: { name: 'Test', spawn: { x: 10, y: 70, z: -5 }, dimensions: ['overworld'] }, selection: { dimension: 'overworld', box: { x1: 0, y1: 60, z1: 0, x2: 3, y2: 61, z2: 4 } } };

describe('extensions', () => {
  it('validates manifests strictly', () => {
    const good = { manifestVersion: 1, id: 'demo', name: 'Demo', version: '1.0.0', run: ['node', 'x.mjs'], permissions: ['selection'], commands: [{ id: 'go', title: 'Go' }] };
    expect(validateManifest(good).id).toBe('demo');
    expect(() => validateManifest({ ...good, manifestVersion: 2 })).toThrow(/manifestVersion/);
    expect(() => validateManifest({ ...good, id: '../evil' })).toThrow(/id/);
    expect(() => validateManifest({ ...good, permissions: ['network'] })).toThrow(/permissions/);
    expect(() => validateManifest({ ...good, commands: [] })).toThrow(/commands/);
  });

  it('needs consent to the exact permissions, and asks again when they change', async () => {
    const data = await mkdtemp(path.join(os.tmpdir(), 'me-ext-'));
    const ex = new Extensions(builtIn, data);
    const list = await ex.list();
    expect(list.map((e) => e.manifest.id).sort()).toEqual(['selection-report', 'spawn-platform']);
    expect(list.every((e) => !e.enabled && e.needsConsent)).toBe(true);
    await expect(ex.run('spawn-platform', 'build', ctx)).rejects.toThrow(/switched off/);
    const m = list.find((e) => e.manifest.id === 'spawn-platform')!.manifest;
    await expect(ex.setEnabled('spawn-platform', true, 'wrong')).rejects.toThrow(/permissions changed/);
    await ex.setEnabled('spawn-platform', true, permissionKey(m));
    const r = await ex.run('spawn-platform', 'build', ctx);
    expect(r.ops).toEqual([{ op: 'fill', dimension: 'overworld', box: { x1: 6, y1: 69, z1: -9, x2: 14, y2: 69, z2: -1 }, block: 'minecraft:stone_bricks' }]);
    expect(r.message).toMatch(/9 by 9/);

    // A user extension that changes its permissions is switched off until allowed again.
    const dir = path.join(data, 'extensions', 'py-demo');
    await mkdir(dir, { recursive: true });
    const man = { manifestVersion: 1, id: 'py-demo', name: 'Demo', version: '1.0.0', run: ['node', 'main.mjs'], permissions: ['selection'], commands: [{ id: 'go', title: 'Go' }] };
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(man));
    await writeFile(path.join(dir, 'main.mjs'), `process.stdin.once('data', (d) => { const r = JSON.parse(d); process.stdout.write(JSON.stringify({ type: 'result', message: JSON.stringify({ w: r.world ?? null, s: r.selection ?? null, env: Object.keys(process.env).filter((k) => !['PATH','SYSTEMROOT','MAP_EDITOR_EXTENSION','ELECTRON_RUN_AS_NODE'].includes(k) && !k.startsWith('__CF') && k !== 'LC_CTYPE') }) }) + '\\n'); });`);
    await ex.setEnabled('py-demo', true, permissionKey(validateManifest(man)));
    const seen = JSON.parse((await ex.run('py-demo', 'go', ctx)).message);
    expect(seen.w).toBeNull(); // no world-info permission, so no world facts
    expect(seen.s).toEqual(ctx.selection);
    expect(seen.env).toEqual([]); // nothing from Map Editor's environment leaks through
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ ...man, permissions: ['selection', 'edit-world'] }));
    const again = (await ex.list()).find((e) => e.manifest.id === 'py-demo')!;
    expect(again).toMatchObject({ enabled: false, needsConsent: true });
  });

  it('refuses edits without permission and bad operations', () => {
    const op = { op: 'fill', dimension: 'overworld', box: { x1: 0, y1: 0, z1: 0, x2: 1, y2: 1, z2: 1 }, block: 'minecraft:stone' };
    expect(() => checkResponse({ type: 'result', ops: [op] }, false)).toThrow(/edit-world/);
    expect(checkResponse({ type: 'result', ops: [op] }, true).ops).toHaveLength(1);
    expect(() => checkResponse({ type: 'result', ops: [{ ...op, block: 'stone; rm' }] }, true)).toThrow(/block/);
    expect(() => checkResponse({ type: 'result', ops: Array(65).fill(op) }, true)).toThrow(/At most 64/);
    expect(() => checkResponse({ message: 'hi' }, true)).toThrow(/type/);
  });

  it('stops an extension that hangs or never answers', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'me-ext-'));
    await writeFile(path.join(dir, 'hang.mjs'), 'setInterval(() => {}, 1000);');
    await expect(exchange(dir, ['node', 'hang.mjs'], {}, 500)).rejects.toThrow(/did not answer/);
    await writeFile(path.join(dir, 'quit.mjs'), 'process.exit(3);');
    await expect(exchange(dir, ['node', 'quit.mjs'], {})).rejects.toThrow(/exit code 3/);
    await expect(exchange(dir, ['definitely-not-a-program-xyz'], {})).rejects.toThrow(/could not start/);
  });
  it('runs the Node and Python samples from the author article', async () => {
    const samples = path.join(__dirname, '..', 'samples', 'extensions');
    const data = await mkdtemp(path.join(os.tmpdir(), 'me-ext-'));
    const ex = new Extensions(samples, data);
    for (const e of await ex.list()) { expect(e.error).toBeUndefined(); await ex.setEnabled(e.manifest.id, true, permissionKey(e.manifest)); }
    expect((await ex.run('hello-node', 'hello', ctx)).message).toBe('Hello, Test! You ran hello.');
    const hasPython = (await import('node:child_process')).spawnSync('python3', ['--version']).status === 0;
    if (hasPython) {
      const r = await ex.run('hello-python', 'glass-floor', ctx);
      expect(r.ops).toEqual([{ op: 'fill', dimension: 'overworld', block: 'minecraft:glass', box: { x1: 0, y1: 60, z1: 0, x2: 3, y2: 60, z2: 4 } }]);
    }
  });
  it('adds from a folder or .zip, asks before replacing, keeps built-ins, and honours the master switch', async () => {
    const data = await mkdtemp(path.join(os.tmpdir(), 'me-ext-'));
    const ex = new Extensions(builtIn, data);
    const sample = path.join(__dirname, '..', 'samples', 'extensions', 'hello-node');
    const m = await ex.installFolder(sample);
    expect(m.id).toBe('hello-node');
    await expect(ex.installFolder(sample)).rejects.toBeInstanceOf(ReplaceNeeded);
    await expect(ex.installFolder(path.join(builtIn, 'spawn-platform'))).rejects.toThrow(/built-in/);
    // A new version needs consent again.
    await ex.setEnabled('hello-node', true, permissionKey(m));
    const v2 = await mkdtemp(path.join(os.tmpdir(), 'me-v2-'));
    await writeFile(path.join(v2, 'manifest.json'), JSON.stringify({ ...JSON.parse(await (await import('node:fs/promises')).readFile(path.join(sample, 'manifest.json'), 'utf8')), version: '1.1.0' }));
    await writeFile(path.join(v2, 'main.mjs'), await (await import('node:fs/promises')).readFile(path.join(sample, 'main.mjs'), 'utf8'));
    await ex.installFolder(v2, true);
    expect((await ex.list()).find((e) => e.manifest.id === 'hello-node')).toMatchObject({ enabled: false, needsConsent: true });

    // From a .zip with the extension one folder down.
    const zip = path.join(data, 'x.zip');
    await new Promise<void>((ok) => { const z = new yazl.ZipFile(); z.addFile(path.join(__dirname, '..', 'samples', 'extensions', 'hello-python', 'manifest.json'), 'hello-python/manifest.json'); z.addFile(path.join(__dirname, '..', 'samples', 'extensions', 'hello-python', 'main.py'), 'hello-python/main.py'); z.end(); z.outputStream.pipe(createWriteStream(zip)).on('close', () => ok()); });
    expect((await ex.installZip(zip)).id).toBe('hello-python');
    await ex.remove('hello-python');
    expect((await ex.list()).some((e) => e.manifest.id === 'hello-python')).toBe(false);
    await expect(ex.remove('spawn-platform')).rejects.toThrow(/Built-in/);

    // Master switch and recent runs.
    const sp = (await ex.list()).find((e) => e.manifest.id === 'selection-report')!;
    await ex.setEnabled('selection-report', true, permissionKey(sp.manifest));
    await ex.run('selection-report', 'measure', ctx);
    await ex.setMaster(false);
    await expect(ex.run('selection-report', 'measure', ctx)).rejects.toThrow(/switched off/);
    await ex.setMaster(true);
    const runs = await ex.recentRuns();
    expect(runs[0]).toMatchObject({ id: 'selection-report', command: 'Measure the selection', ok: true });
  });
});
