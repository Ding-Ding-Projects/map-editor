import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile, chmod, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { instanceAction, instanceState, saveInstances, loadInstances, flashableDisks, confirmPhrase, validateInstance, composeFile, type Instance } from '../src/deploy/targets.js';

let data = '';
let callLog = '';
const inst: Instance = { id: '1', name: 'map-editor-1', target: 'docker', version: '0.1.0', port: 8420, host: '127.0.0.1', createdAt: '2026-11-25T00:00:00Z' };

beforeEach(async () => {
  data = await mkdtemp(path.join(os.tmpdir(), 'me-deploy-'));
  const bin = await mkdtemp(path.join(os.tmpdir(), 'me-bin-'));
  callLog = path.join(bin, 'calls.txt');
  // A stand-in docker that records its arguments and reports a running container.
  await writeFile(path.join(bin, 'docker'), `#!/bin/sh\necho "$@" >> "${callLog}"\ncase "$*" in *" ps "*) echo running;; esac\nexit 0\n`);
  await chmod(path.join(bin, 'docker'), 0o755);
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
  await mkdir(path.join(data, 'instances', inst.name), { recursive: true });
  await saveInstances(data, [inst]);
});

describe('deploy targets', () => {
  it('reads the state from docker instead of assuming it', async () => {
    expect(await instanceState(data, inst)).toBe('running');
    expect(await readFile(callLog, 'utf8')).toContain(`-p ${inst.name} ps --all`);
  });

  it('runs the exact compose commands for each action', async () => {
    for (const a of ['stop', 'start', 'restart', 'update'] as const) expect((await instanceAction(data, inst.name, a)).ok).toBe(true);
    const calls = (await readFile(callLog, 'utf8')).trim().split('\n');
    expect(calls.map((c) => c.split(' ').slice(-2).join(' '))).toEqual([`${inst.name} stop`, `${inst.name} start`, `${inst.name} restart`, `${inst.name} pull`, 'up -d']);
  });

  it('keeps data on remove unless asked, and forgets the instance', async () => {
    expect((await instanceAction(data, inst.name, 'remove')).ok).toBe(true);
    expect(await readFile(callLog, 'utf8')).not.toContain('--volumes');
    expect(await loadInstances(data)).toEqual([]);
    await saveInstances(data, [inst]);
    await instanceAction(data, inst.name, 'remove', true);
    expect(await readFile(callLog, 'utf8')).toContain('down --volumes');
  });

  it('refuses instances it did not create', async () => {
    const r = await instanceAction(data, 'someone-elses', 'stop');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not an instance this app created/);
  });

  it('only offers removable, non-system disks and needs the exact phrase', () => {
    const disks = [
      { id: '/dev/sda', name: 'System SSD (/dev/sda)', sizeBytes: 512e9, removable: false, system: true, mountpoints: ['/'] },
      { id: '/dev/sdb', name: 'SanDisk (/dev/sdb)', sizeBytes: 64e9, removable: true, system: false, mountpoints: [] },
      { id: '/dev/sdc', name: 'Card reader (/dev/sdc)', sizeBytes: 0, removable: true, system: false, mountpoints: [] },
    ];
    expect(flashableDisks(disks).map((d) => d.id)).toEqual(['/dev/sdb']);
    expect(confirmPhrase(disks[1])).toBe('ERASE SanDisk (/dev/sdb)');
  });

  it('validates names and ports and writes a compose file with the chosen values', () => {
    expect(validateInstance('Bad Name', 8420, [])).toMatch(/lower-case/);
    expect(validateInstance('ok-name', 80, [])).toMatch(/1024/);
    expect(validateInstance('map-editor-1', 9000, [inst])).toMatch(/already exists/);
    const y = composeFile({ name: 'x', port: 9001, version: '0.1.0', worlds: '/srv/worlds' });
    expect(y).toContain('"9001:8420"');
    expect(y).toContain('ghcr.io/ding-ding-projects/map-editor:0.1.0');
  });
});
