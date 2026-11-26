import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentDataDir, moveDataDir, refuseTarget } from '../src/desktop/datafolder.js';

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'me-df-'));
  const userData = path.join(root, 'app'), data = path.join(userData, 'data');
  await mkdir(path.join(data, 'accounts'), { recursive: true });
  await writeFile(path.join(data, 'accounts', 'a.json'), '{"name":"alex"}'); await writeFile(path.join(data, 'activity.log'), 'hello');
  return { root, userData, data };
}

describe('desktop data folder', () => {
  it('uses the default until a choice is saved, and falls back when the chosen folder is gone', async () => {
    const { userData, data, root } = await setup();
    expect(await currentDataDir(userData)).toEqual({ dataDir: data, isDefault: true });
    await writeFile(path.join(userData, 'data-folder.json'), JSON.stringify({ dataDir: path.join(root, 'missing') }));
    expect((await currentDataDir(userData)).isDefault).toBe(true);
    await writeFile(path.join(userData, 'data-folder.json'), 'not json');
    expect((await currentDataDir(userData)).isDefault).toBe(true);
  });
  it('refuses the same folder, a folder inside or around the data, a missing folder and a folder with other files', async () => {
    const { data, root, userData } = await setup();
    expect(await refuseTarget(data, data)).toMatch(/already/); expect(await refuseTarget(data, path.join(data, 'accounts'))).toMatch(/outside/);
    expect(await refuseTarget(data, userData)).toMatch(/does not contain/); expect(await refuseTarget(data, path.join(root, 'nope'))).toMatch(/does not exist/);
    const busy = path.join(root, 'busy'); await mkdir(busy); await writeFile(path.join(busy, 'photo.png'), 'x');
    expect(await refuseTarget(data, busy)).toMatch(/empty folder/);
    const empty = path.join(root, 'empty'); await mkdir(empty); expect(await refuseTarget(data, empty)).toBe('');
  });
  it('copies everything, checks it, saves the choice and leaves the old folder alone', async () => {
    const { userData, data, root } = await setup();
    const to = path.join(root, 'new'); await mkdir(to);
    const seen: number[] = [];
    const r = await moveDataDir(userData, to, (d) => seen.push(d));
    expect(r).toMatchObject({ ok: true, files: 2 }); expect(seen).toEqual([1, 2]);
    expect(await readFile(path.join(to, 'accounts', 'a.json'), 'utf8')).toBe('{"name":"alex"}');
    expect(await readFile(path.join(data, 'activity.log'), 'utf8')).toBe('hello'); // the old folder is untouched
    expect(await currentDataDir(userData)).toEqual({ dataDir: to, isDefault: false });
    // moving back to the built-in folder is allowed (it was marked when it was left) and clears the saved choice
    await writeFile(path.join(to, 'activity.log'), 'hello again');
    expect((await moveDataDir(userData, data)).ok).toBe(true);
    expect(await currentDataDir(userData)).toEqual({ dataDir: data, isDefault: true });
    expect(await readdir(userData)).not.toContain('data-folder.json');
    expect(await readFile(path.join(data, 'activity.log'), 'utf8')).toBe('hello again'); // newer data replaced the stale copy
  });
  it('changes nothing when the move is refused', async () => {
    const { userData, data, root } = await setup();
    const r = await moveDataDir(userData, path.join(root, 'nope'));
    expect(r.ok).toBe(false); expect(await currentDataDir(userData)).toEqual({ dataDir: data, isDefault: true });
  });
});

describe('extra worlds folders', () => {
  it('adds, lists and removes folders, and forgets ones that are gone', async () => {
    const { userData, root } = await setup();
    const { changeWorldsFolders, extraWorldsFolders } = await import('../src/desktop/datafolder.js');
    const saves = path.join(root, 'saves'), a = path.join(root, 'a'); await mkdir(saves); await mkdir(a);
    expect(await extraWorldsFolders(userData, saves)).toEqual([]);
    expect((await changeWorldsFolders(userData, saves, { add: a })).folders).toEqual([a]);
    expect((await changeWorldsFolders(userData, saves, { add: a })).error).toMatch(/already/);
    expect((await changeWorldsFolders(userData, saves, { add: saves })).error).toMatch(/already/);
    expect((await changeWorldsFolders(userData, saves, { add: path.join(root, 'nope') })).error).toMatch(/does not exist/);
    await writeFile(path.join(userData, 'worlds-folders.json'), JSON.stringify({ folders: [a, path.join(root, 'gone'), 'relative', 7, a] }));
    expect(await extraWorldsFolders(userData, saves)).toEqual([a]);
    expect((await changeWorldsFolders(userData, saves, { remove: a })).folders).toEqual([]);
  });
});
