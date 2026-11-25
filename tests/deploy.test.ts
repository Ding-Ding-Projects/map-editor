import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile, chmod, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { instanceAction, instanceState, saveInstances, loadInstances, flashableDisks, confirmPhrase, validateInstance, composeFile, deployDocker, deployVMware, validateSshHost, sshHostname, type Instance } from '../src/deploy/targets.js';
import http from 'node:http';

let data = '';
let callLog = '';
const inst: Instance = { id: '1', name: 'map-editor-1', target: 'docker', version: '0.1.0', port: 8420, host: '127.0.0.1', createdAt: '2026-11-25T00:00:00Z' };

beforeEach(async () => {
  data = await mkdtemp(path.join(os.tmpdir(), 'me-deploy-'));
  const bin = await mkdtemp(path.join(os.tmpdir(), 'me-bin-'));
  callLog = path.join(bin, 'calls.txt');
  // A stand-in docker that records its arguments and reports a running container.
  await writeFile(path.join(bin, 'docker'), `#!/bin/sh\n[ -n "$DOCKER_HOST" ] && echo "HOST $DOCKER_HOST" >> "${callLog}"\necho "$@" >> "${callLog}"\ncase "$*" in *" ps "*) echo running;; esac\nexit 0\n`);
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

  it('writes a Compose file that is valid YAML for any worlds folder', async () => {
    const { execFileSync } = await import('node:child_process');
    for (const worlds of ['/srv/worlds', '/srv/my worlds: "best"', 'C:\\Users\\Alex\\AppData\\Roaming\\.minecraft\\saves']) {
      const y = composeFile({ name: 'x', port: 9001, version: 'latest', worlds });
      // Parsed by a real YAML parser (Python's, present on every CI runner and here).
      const parsed = JSON.parse(execFileSync('python3', ['-c', 'import sys,json,yaml;print(json.dumps(yaml.safe_load(sys.stdin.read())))'], { input: y }).toString());
      expect(parsed.services['map-editor'].volumes[1]).toEqual({ type: 'bind', source: worlds, target: '/worlds' });
    }
  });
  it('accepts only Docker image tags as the version', async () => {
    const { validateVersion } = await import('../src/deploy/targets.js');
    expect(validateVersion('latest')).toBeUndefined();
    expect(validateVersion('0.1.30')).toBeUndefined();
    expect(validateVersion('0.1.30\n    privileged: true')).toMatch(/image tag/);
    expect(validateVersion('')).toMatch(/image tag/);
    expect(validateVersion('-x')).toMatch(/image tag/);
  });
  it('accepts only user@host[:port] SSH logins', () => {
    for (const ok of ['pi@192.168.1.50', 'me@nas.local:2222', 'server', 'a_b@host-1.example.com']) expect(validateSshHost(ok)).toBeUndefined();
    for (const bad of ['-oProxyCommand=x', 'me@host;rm -rf /', 'me@', '@host', 'me@host:port', 'me @host']) expect(validateSshHost(bad)).toMatch(/user@host/);
    expect(sshHostname('pi@192.168.1.50:2222')).toBe('192.168.1.50');
  });

  it('deploys to Docker on another computer through DOCKER_HOST=ssh and manages it there', async () => {
    const srv = http.createServer((_q, r) => { r.setHeader('content-type', 'application/json'); r.end('{"version":"0.1.30"}'); });
    await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
    const port = (srv.address() as { port: number }).port;
    try {
      await saveInstances(data, []);
      const r = await deployDocker(data, { name: 'remote-1', port, version: 'latest', worlds: '/srv/worlds', sshHost: 'tester@127.0.0.1' }, () => undefined);
      expect(r.error).toBeUndefined();
      expect(r.url).toBe(`http://127.0.0.1:${port}/`);
      expect(r.instance).toMatchObject({ target: 'docker-ssh', sshHost: 'tester@127.0.0.1', host: '127.0.0.1' });
      const log = await readFile(callLog, 'utf8');
      expect(log.match(/HOST ssh:\/\/tester@127\.0\.0\.1/g)!.length).toBeGreaterThanOrEqual(3);
      expect(log).toContain('info --format');
      expect(await readFile(path.join(data, 'instances', 'remote-1', 'compose.yaml'), 'utf8')).toContain('/srv/worlds');
      await instanceAction(data, 'remote-1', 'stop');
      expect((await readFile(callLog, 'utf8')).trim().split('\n').slice(-2)).toEqual(['HOST ssh://tester@127.0.0.1', expect.stringContaining('-p remote-1 stop')]);
      expect((await deployDocker(data, { name: 'remote-2', port, version: 'latest', worlds: 'relative/path', sshHost: 'tester@127.0.0.1' }, () => undefined)).error).toMatch(/full path/);
      expect((await deployDocker(data, { name: 'remote-3', port, version: 'latest', worlds: '/srv', sshHost: '-oProxyCommand=evil' }, () => undefined)).error).toMatch(/user@host/);
    } finally { srv.close(); }
  });
  it('imports, starts and manages a VMware VM with ovftool and vmrun', async () => {
    const bin = await mkdtemp(path.join(os.tmpdir(), 'me-vmw-'));
    const vlog = path.join(bin, 'vm.txt');
    const srv = http.createServer((_q, r) => { r.setHeader('content-type', 'application/json'); r.end('{"version":"0.1.31"}'); });
    await new Promise<void>((ok) => srv.listen(8420, '127.0.0.1', ok)).catch(() => undefined);
    // ovftool creates <dir>/<name>/<name>.vmx; vmrun reports the guest address and lists running VMs.
    await writeFile(path.join(bin, 'ovftool'), `#!/bin/sh\necho "ovftool $*" >> "${vlog}"\n[ "$1" = --version ] && echo "VMware ovftool 4.6.3" && exit 0\nfor a; do last="$a"; done\nname=$(echo "$*" | sed -n 's/.*--name=\\([^ ]*\\).*/\\1/p')\nmkdir -p "$last/$name" && touch "$last/$name/$name.vmx"\n`);
    await writeFile(path.join(bin, 'vmrun'), `#!/bin/sh\necho "vmrun $*" >> "${vlog}"\n[ -z "$1" ] && echo "vmrun version 1.17.0" && echo "Usage: vmrun ..." && exit 255\ncase "$3" in getGuestIPAddress) echo 127.0.0.1;; list) echo "Total running VMs: 1"; cat "${bin}/running" 2>/dev/null;; start) echo "$4" > "${bin}/running";; stop) rm -f "${bin}/running";; esac\nexit 0\n`);
    await chmod(path.join(bin, 'ovftool'), 0o755); await chmod(path.join(bin, 'vmrun'), 0o755);
    process.env.MAP_EDITOR_OVFTOOL = path.join(bin, 'ovftool'); process.env.MAP_EDITOR_VMRUN = path.join(bin, 'vmrun');
    try {
      await saveInstances(data, []);
      const r = await deployVMware(data, { name: 'vmw-1', ova: '/images/map-editor-appliance-x86_64.ova' }, () => undefined);
      expect(r.error).toBeUndefined();
      expect(r.instance).toMatchObject({ target: 'vmware', host: '127.0.0.1', vmPath: path.join(data, 'vms', 'vmw-1', 'vmw-1.vmx') });
      const log = await readFile(vlog, 'utf8');
      expect(log).toContain('--net:Bridged=bridged');
      expect(log).toContain(`start ${path.join(data, 'vms', 'vmw-1', 'vmw-1.vmx')} nogui`);
      const inst = (await loadInstances(data))[0];
      expect(await instanceState(data, inst)).toBe('running');
      expect((await instanceAction(data, 'vmw-1', 'stop')).ok).toBe(true);
      expect(await instanceState(data, inst)).toBe('stopped');
      expect((await instanceAction(data, 'vmw-1', 'update')).ok).toBe(false);
      expect((await instanceAction(data, 'vmw-1', 'remove')).ok).toBe(true);
      expect(await readFile(vlog, 'utf8')).not.toContain('deleteVM');
      expect((await deployVMware(data, { name: 'vmw-2', ova: '/x/not-an-image.iso' }, () => undefined)).error).toMatch(/\.ova/);
    } finally { srv.close(); delete process.env.MAP_EDITOR_OVFTOOL; delete process.env.MAP_EDITOR_VMRUN; }
  });
});
