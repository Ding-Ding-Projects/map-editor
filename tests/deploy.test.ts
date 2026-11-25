import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile, chmod, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { instanceAction, instanceState, saveInstances, loadInstances, flashableDisks, confirmPhrase, validateInstance, composeFile, deployDocker, deployVMware, duplicateInstance, duplicateSuggestion, worldsFromCompose, validateSshHost, sshHostname, type Instance } from '../src/deploy/targets.js';
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
  it('duplicates a Docker instance with a new name and port on the same computer and worlds', async () => {
    // Two stand-in web apps on neighbouring ports answer the health checks of the original and the copy.
    const servers: http.Server[] = [];
    let port = 0;
    for (let tries = 0; tries < 20 && servers.length < 2; tries++) {
      servers.splice(0).forEach((x) => x.close());
      const a = http.createServer((_q, r) => { r.setHeader('content-type', 'application/json'); r.end('{"version":"0.1.30"}'); });
      await new Promise<void>((ok) => a.listen(0, '127.0.0.1', ok));
      port = (a.address() as { port: number }).port + 1;
      const b = http.createServer((_q, r) => { r.setHeader('content-type', 'application/json'); r.end('{"version":"0.1.30"}'); });
      const bound = await new Promise<boolean>((ok) => { b.once('error', () => ok(false)); b.listen(port, '127.0.0.1', () => ok(true)); });
      servers.push(a); if (bound) servers.push(b); else a.close();
    }
    try {
      await saveInstances(data, []);
      const first = await deployDocker(data, { name: 'club', port: port - 1, version: '0.1.30', worlds: '/srv/minecraft/worlds', sshHost: 'tester@127.0.0.1' }, () => undefined);
      expect(first.error).toBeUndefined();
      const suggestion = duplicateSuggestion(first.instance!, await loadInstances(data));
      expect(suggestion).toEqual({ name: 'club-copy', port });
      const copy = await duplicateInstance(data, 'club', suggestion, () => undefined);
      expect(copy.error).toBeUndefined();
      expect(copy.instance).toMatchObject({ name: 'club-copy', port, version: '0.1.30', sshHost: 'tester@127.0.0.1', worlds: '/srv/minecraft/worlds' });
      const compose = await readFile(path.join(data, 'instances', 'club-copy', 'compose.yaml'), 'utf8');
      expect(compose).toContain('club-copy-data:/data');
      expect(worldsFromCompose(compose)).toBe('/srv/minecraft/worlds');
      expect(duplicateSuggestion(copy.instance!, await loadInstances(data)).name).toBe('club-copy-2');
      expect((await duplicateInstance(data, 'club', { name: 'club-copy', port: port + 1 }, () => undefined)).error).toMatch(/already exists/);
      expect((await duplicateInstance(data, 'nope', suggestion, () => undefined)).error).toMatch(/not in this app/);
    } finally { servers.forEach((x) => x.close()); }
  });

  it('refuses to duplicate a virtual machine and explains what to do instead', async () => {
    await saveInstances(data, [{ ...inst, name: 'vm-1', target: 'vmware' }]);
    expect((await duplicateInstance(data, 'vm-1', { name: 'vm-2', port: 8500 }, () => undefined)).error).toMatch(/Only Docker instances/);
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

describe('virtual disks (Windows)', () => {
  it('accepts only full Windows paths ending in .vhdx or .vhd', async () => {
    const { validateVdiskPath } = await import('../src/deploy/targets.js');
    expect(validateVdiskPath('C:\\Disks\\worlds.vhdx')).toBeUndefined();
    expect(validateVdiskPath('d:\\a b\\w.VHD')).toBeUndefined();
    for (const bad of ['', 'worlds.vhdx', 'C:\\x.iso', 'C:\\a"b\\w.vhdx', 'C:\\a\r\nclean\\w.vhdx', '\\\\server\\share\\w.vhdx', 'C:\\a|b.vhdx', `C:\\${'a'.repeat(250)}.vhdx`]) expect(validateVdiskPath(bad), bad).toBeTruthy();
  });
  it('writes diskpart scripts and refuses unsafe input', async () => {
    const { diskpartScript } = await import('../src/deploy/targets.js');
    expect(diskpartScript({ action: 'create', file: 'C:\\D\\w.vhdx', sizeMb: 8192, label: 'Worlds' }).split('\r\n')).toEqual(['create vdisk file="C:\\D\\w.vhdx" maximum=8192 type=expandable', 'attach vdisk', 'create partition primary', 'format fs=ntfs quick label="Worlds"', 'assign', '']);
    expect(diskpartScript({ action: 'create', file: 'C:\\D\\w.vhdx', sizeMb: 64, label: 'A', fixed: true })).toContain('type=fixed');
    expect(diskpartScript({ action: 'attach', file: 'C:\\D\\w.vhdx', readOnly: true })).toBe('select vdisk file="C:\\D\\w.vhdx"\r\nattach vdisk readonly\r\n');
    expect(diskpartScript({ action: 'detach', file: 'C:\\D\\w.vhdx' })).toBe('select vdisk file="C:\\D\\w.vhdx"\r\ndetach vdisk\r\n');
    expect(() => diskpartScript({ action: 'create', file: 'C:\\D\\w.vhdx', sizeMb: 8, label: 'Worlds' })).toThrow(/Size/);
    expect(() => diskpartScript({ action: 'create', file: 'C:\\D\\w.vhdx', sizeMb: 1024, label: 'x"\r\nclean' })).toThrow(/name/);
    expect(() => diskpartScript({ action: 'detach', file: 'C:\\D\\w.vhdx"\r\nselect disk 0' })).toThrow();
    // no script ever deletes or cleans anything
    for (const j of [{ action: 'create', file: 'C:\\w.vhdx', sizeMb: 100, label: 'W' }, { action: 'attach', file: 'C:\\w.vhdx' }, { action: 'detach', file: 'C:\\w.vhdx' }] as const) expect(diskpartScript(j)).not.toMatch(/\b(clean|delete|select disk)\b/i);
  });
  it('reads the list Windows gives back', async () => {
    const { parseVirtualDisks } = await import('../src/deploy/targets.js');
    expect(parseVirtualDisks('')).toEqual([]);
    expect(parseVirtualDisks('{"Number":3,"Name":"Msft Virtual Disk","Size":8589934592,"File":"C:\\\\D\\\\w.vhdx","ReadOnly":false,"Letters":["e"]}')).toEqual([{ number: 3, name: 'Msft Virtual Disk', sizeBytes: 8589934592, file: 'C:\\D\\w.vhdx', readOnly: false, letters: ['E'] }]);
    const two = parseVirtualDisks('[{"Number":5,"Name":"b","Size":1,"File":"C:\\\\b.vhd","ReadOnly":true,"Letters":[]},{"Number":2,"Name":"a","Size":2,"File":"C:\\\\a.vhdx","ReadOnly":false,"Letters":"F"},{"Number":9,"File":""}]');
    expect(two.map((d) => [d.number, d.readOnly, d.letters.join('')])).toEqual([[2, false, 'F'], [5, true, '']]);
  });
  it('does nothing on other systems', async () => {
    const { vdiskJob } = await import('../src/deploy/targets.js');
    if (process.platform !== 'win32') expect(await vdiskJob({ action: 'detach', file: 'C:\\w.vhdx' })).toEqual({ ok: false, message: 'Virtual disks are managed on Windows only.' });
  });
});
