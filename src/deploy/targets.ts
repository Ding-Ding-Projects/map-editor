// One-click deployment targets. Every target ends with a verified link or an honest failure.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const IMAGE = 'ghcr.io/ding-ding-projects/map-editor';

export interface Instance {
  id: string;
  name: string;
  target: 'docker' | 'docker-ssh' | 'virtualbox' | 'vmware';
  version: string;
  port: number;
  host: string; // LAN address the link uses
  sshHost?: string;
  vmPath?: string;
  createdAt: string;
}

export interface Step { label: string; state: 'waiting' | 'running' | 'done' | 'failed'; detail?: string }
export type Progress = (steps: Step[]) => void;

export interface RunResult { code: number; stdout: string; stderr: string }

/** Run a command without a shell, so no argument is ever interpreted. */
export function run(cmd: string, args: string[], opts: { input?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true, env: opts.env ? { ...process.env, ...opts.env } : process.env });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => p.kill(), opts.timeoutMs ?? 10 * 60_000);
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: 127, stdout, stderr: stderr + String(e) }); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
    if (opts.input) p.stdin.end(opts.input); else p.stdin.end();
  });
}

export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,38}$/;

export function validateInstance(name: string, port: number, existing: Instance[]): string | undefined {
  if (!NAME_RE.test(name)) return 'Instance name must be 1 to 39 lower-case letters, digits or dashes, starting with a letter or digit.';
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return 'Port must be a whole number from 1024 to 65535.';
  if (existing.some((i) => i.name === name)) return `An instance called ${name} already exists.`;
  if (existing.some((i) => i.port === port && i.host === lanAddress())) return `Port ${port} is already used by another instance on this computer.`;
  return undefined;
}

/** Docker tag rules; anything else could change the generated Compose file. */
export function validateVersion(version: string): string | undefined {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(version) ? undefined : 'Version must be an image tag such as latest or 0.1.30 (letters, digits, dots, dashes, underscores).';
}

/**
 * Docker on another computer is reached with Docker's own SSH transport (DOCKER_HOST=ssh://...),
 * so the app never handles passwords or keys: the user's SSH agent and known_hosts are used.
 */
export const SSH_RE = /^(?:[a-z_][a-z0-9_.-]{0,31}@)?(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*|\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?$/;
export function validateSshHost(h: string): string | undefined {
  return SSH_RE.test(h) ? undefined : 'Enter the other computer as user@host or user@host:port, for example pi@192.168.1.50.';
}
export function sshHostname(h: string): string { return h.replace(/^.*@/, '').replace(/:\d+$/, ''); }
const dockerEnv = (i: { sshHost?: string }) => (i.sshHost ? { DOCKER_HOST: `ssh://${i.sshHost}` } : undefined);

export function lanAddress(): string {
  for (const list of Object.values(os.networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  return '127.0.0.1';
}

export function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '0.0.0.0', () => s.close(() => resolve(true)));
  });
}

/** Poll /api/health until it answers or the deadline passes. Never claims health it did not see. */
export async function waitHealthy(url: string, timeoutMs = 90_000): Promise<{ ok: boolean; version?: string; error?: string }> {
  const end = Date.now() + timeoutMs;
  let last = 'no answer yet';
  while (Date.now() < end) {
    try {
      const r = await fetch(new URL('/api/health', url), { signal: AbortSignal.timeout(4000) });
      if (r.ok) { const j = await r.json() as { version?: string }; return { ok: true, version: j.version }; }
      last = `HTTP ${r.status}`;
    } catch (e) { last = (e as Error).message; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ok: false, error: last };
}

export function composeFile(i: { name: string; port: number; version: string; worlds: string }): string {
  return [
    'services:',
    '  map-editor:',
    `    image: ${IMAGE}:${i.version}`,
    `    container_name: ${i.name}`,
    '    restart: unless-stopped',
    '    ports:',
    `      - "${i.port}:8420"`,
    '    volumes:',
    `      - ${i.name}-data:/data`,
    `      - ${JSON.stringify(i.worlds)}:/worlds`,
    'volumes:',
    `  ${i.name}-data:`,
    '',
  ].join('\n');
}

// ---------- removable disks (USB / SD) ----------
export interface Disk { id: string; name: string; sizeBytes: number; removable: boolean; system: boolean; mountpoints: string[] }

/** Only removable, non-system disks are ever offered. */
export function flashableDisks(all: Disk[]): Disk[] {
  return all.filter((d) => d.removable && !d.system && d.sizeBytes > 0);
}

export function confirmPhrase(d: Disk) {
  return `ERASE ${d.name}`;
}

export async function listDisks(): Promise<Disk[]> {
  if (process.platform === 'win32') {
    const ps = 'Get-Disk | Select-Object Number,FriendlyName,Size,BusType,IsBoot,IsSystem | ConvertTo-Json -Compress';
    const r = await run('powershell.exe', ['-NoProfile', '-Command', ps]);
    if (r.code !== 0) throw new Error(`Could not list disks: ${r.stderr.trim()}`);
    const raw = JSON.parse(r.stdout || '[]');
    return (Array.isArray(raw) ? raw : [raw]).map((d: any) => ({
      id: `\\\\.\\PhysicalDrive${d.Number}`, name: `${d.FriendlyName} (disk ${d.Number})`, sizeBytes: Number(d.Size),
      removable: ['USB', 'SD', 'MMC'].includes(String(d.BusType)), system: Boolean(d.IsBoot || d.IsSystem), mountpoints: [],
    }));
  }
  const r = await run('lsblk', ['-J', '-b', '-d', '-o', 'NAME,MODEL,SIZE,RM,TRAN,MOUNTPOINTS']);
  if (r.code !== 0) throw new Error(`Could not list disks: ${r.stderr.trim()}`);
  const root = (await run('findmnt', ['-n', '-o', 'SOURCE', '/'])).stdout.trim();
  return JSON.parse(r.stdout).blockdevices.map((d: any) => ({
    id: `/dev/${d.name}`, name: `${(d.model ?? d.name).trim()} (/dev/${d.name})`, sizeBytes: Number(d.size),
    removable: d.rm === true || d.rm === '1' || d.tran === 'usb', system: root.startsWith(`/dev/${d.name}`),
    mountpoints: (d.mountpoints ?? []).filter(Boolean),
  }));
}

export async function sha256File(file: string, limitBytes?: number): Promise<string> {
  const h = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const s = createReadStream(file, limitBytes !== undefined ? { start: 0, end: limitBytes - 1 } : {});
    s.on('data', (c) => h.update(c)); s.on('end', resolve); s.on('error', reject);
  });
  return h.digest('hex');
}

/**
 * Write a raw image to a disk, then read the same number of bytes back and compare hashes.
 * The caller must already have shown the disk name and collected the exact confirmation phrase.
 */
export async function flash(image: string, disk: Disk, typed: string, onProgress: (written: number, total: number) => void): Promise<{ ok: boolean; message: string }> {
  if (!flashableDisks([disk]).length) return { ok: false, message: 'That disk is not a removable, non-system disk. Nothing was written.' };
  if (typed !== confirmPhrase(disk)) return { ok: false, message: `Type ${confirmPhrase(disk)} exactly to confirm. Nothing was written.` };
  const { size } = await fs.stat(image);
  if (size > disk.sizeBytes) return { ok: false, message: 'The image is larger than the disk. Nothing was written.' };
  const want = await sha256File(image);
  const src = await fs.open(image, 'r');
  const dst = await fs.open(disk.id, 'r+');
  try {
    const buf = Buffer.alloc(4 * 1024 * 1024);
    let pos = 0;
    while (pos < size) {
      const { bytesRead } = await src.read(buf, 0, buf.length, pos);
      if (!bytesRead) break;
      await dst.write(buf, 0, bytesRead, pos);
      pos += bytesRead;
      onProgress(pos, size);
    }
    await dst.sync();
  } finally { await src.close(); await dst.close(); }
  const got = await sha256File(disk.id, size);
  return got === want ? { ok: true, message: `Written and verified: ${size.toLocaleString('en')} bytes, SHA-256 ${want.slice(0, 12)}…` }
    : { ok: false, message: 'Read-back did not match the image. Do not boot from this drive; flash it again.' };
}

export function instancesFile(dataDir: string) { return path.join(dataDir, 'instances.json'); }

export async function loadInstances(dataDir: string): Promise<Instance[]> {
  try { return JSON.parse(await fs.readFile(instancesFile(dataDir), 'utf8')); } catch { return []; }
}
export async function saveInstances(dataDir: string, list: Instance[]) {
  await fs.mkdir(dataDir, { recursive: true });
  const tmp = instancesFile(dataDir) + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(list, null, 2));
  await fs.rename(tmp, instancesFile(dataDir));
}

/** Docker on this computer: write the instance's Compose file, pull, start, wait for health. */
export async function deployDocker(dataDir: string, opts: { name: string; port: number; version: string; worlds: string; sshHost?: string }, progress: Progress): Promise<{ instance?: Instance; url?: string; error?: string }> {
  const remote = opts.sshHost?.trim() || undefined;
  const env = remote ? { DOCKER_HOST: `ssh://${remote}` } : undefined;
  const steps: Step[] = [
    { label: remote ? `Check Docker on ${remote} over SSH` : 'Check Docker', state: 'waiting' }, { label: `Pull ${IMAGE}:${opts.version}`, state: 'waiting' },
    { label: 'Start with Docker Compose', state: 'waiting' }, { label: 'Wait for health check', state: 'waiting' },
  ];
  const step = (i: number, state: Step['state'], detail?: string) => { steps[i] = { ...steps[i], state, detail }; progress([...steps]); };
  const existing = await loadInstances(dataDir);
  const bad = validateInstance(opts.name, opts.port, existing) ?? validateVersion(opts.version) ?? (remote ? validateSshHost(remote) : undefined)
    ?? (remote && !opts.worlds.startsWith('/') ? 'On the other computer, the worlds folder must be a full path such as /srv/minecraft/worlds.' : undefined);
  if (bad) return { error: bad };
  if (!remote && !(await portFree(opts.port))) return { error: `Port ${opts.port} is already in use on this computer.` };

  step(0, 'running');
  // compose version only proves the local CLI; info reaches the daemon (over SSH when remote).
  const v = await run('docker', ['compose', 'version'], { env });
  const info = v.code === 0 ? await run('docker', ['info', '--format', '{{.ServerVersion}}'], { env, timeoutMs: 60_000 }) : v;
  if (v.code !== 0) { step(0, 'failed', v.stderr.trim()); return { error: 'Docker with Compose was not found. Install Docker Desktop, then try again.' }; }
  if (info.code !== 0) { step(0, 'failed', info.stderr.trim()); return { error: remote ? `Could not reach Docker on ${remote} over SSH. Check that you can run "ssh ${remote}" without a password prompt and that your user there can run docker.` : 'Docker is installed but not running. Start Docker Desktop, then try again.' }; }
  step(0, 'done', v.stdout.trim());

  const dir = path.join(dataDir, 'instances', opts.name);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'compose.yaml');
  await fs.writeFile(file, composeFile(opts));

  step(1, 'running');
  const pull = await run('docker', ['compose', '-f', file, '-p', opts.name, 'pull'], { env });
  if (pull.code !== 0) { step(1, 'failed', pull.stderr.trim()); return { error: `docker compose pull failed with exit code ${pull.code}.` }; }
  step(1, 'done');
  step(2, 'running');
  const up = await run('docker', ['compose', '-f', file, '-p', opts.name, 'up', '-d'], { env });
  if (up.code !== 0) { step(2, 'failed', up.stderr.trim()); return { error: `docker compose up failed with exit code ${up.code}.` }; }
  step(2, 'done');

  const host = remote ? sshHostname(remote) : lanAddress();
  const url = `http://${host}:${opts.port}/`;
  step(3, 'running');
  const h = await waitHealthy(url);
  if (!h.ok) { step(3, 'failed', h.error); return { error: `Started, but ${url} did not answer its health check (${h.error}).` }; }
  step(3, 'done', `version ${h.version}`);

  const instance: Instance = { id: `${Date.now()}`, name: opts.name, target: remote ? 'docker-ssh' : 'docker', version: opts.version, port: opts.port, host, ...(remote ? { sshHost: remote } : {}), createdAt: new Date().toISOString() };
  await saveInstances(dataDir, [...existing, instance]);
  return { instance, url };
}

/** VirtualBox: import the appliance OVA with a bridged adapter, start headless, wait for health. */
export async function deployVirtualBox(dataDir: string, opts: { name: string; ova: string; bridgeAdapter: string; port?: number }, progress: Progress): Promise<{ instance?: Instance; url?: string; error?: string }> {
  const steps: Step[] = [{ label: 'Check VirtualBox', state: 'waiting' }, { label: 'Import appliance', state: 'waiting' }, { label: 'Start VM', state: 'waiting' }, { label: 'Find its LAN address and check health', state: 'waiting' }];
  const step = (i: number, state: Step['state'], detail?: string) => { steps[i] = { ...steps[i], state, detail }; progress([...steps]); };
  const existing = await loadInstances(dataDir);
  if (!NAME_RE.test(opts.name) || existing.some((i) => i.name === opts.name)) return { error: 'Choose a new, valid instance name.' };
  const vbm = process.platform === 'win32' ? 'C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe' : 'VBoxManage';
  step(0, 'running');
  const ver = await run(vbm, ['--version']);
  if (ver.code !== 0) { step(0, 'failed'); return { error: 'VirtualBox was not found.' }; }
  step(0, 'done', ver.stdout.trim());
  step(1, 'running');
  const imp = await run(vbm, ['import', opts.ova, '--vsys', '0', '--vmname', opts.name]);
  if (imp.code !== 0) { step(1, 'failed', imp.stderr.trim()); return { error: `Import failed with exit code ${imp.code}.` }; }
  await run(vbm, ['modifyvm', opts.name, '--nic1', 'bridged', '--bridgeadapter1', opts.bridgeAdapter]);
  step(1, 'done');
  step(2, 'running');
  const start = await run(vbm, ['startvm', opts.name, '--type', 'headless']);
  if (start.code !== 0) { step(2, 'failed', start.stderr.trim()); return { error: `The VM did not start (exit code ${start.code}).` }; }
  step(2, 'done');
  step(3, 'running');
  // The appliance's guest service publishes its address; poll for it.
  let ip = '';
  for (let i = 0; i < 60 && !ip; i++) {
    const g = await run(vbm, ['guestproperty', 'get', opts.name, '/VirtualBox/GuestInfo/Net/0/V4/IP']);
    const m = /Value: ([\d.]+)/.exec(g.stdout);
    if (m) ip = m[1]; else await new Promise((r) => setTimeout(r, 3000));
  }
  if (!ip) { step(3, 'failed'); return { error: 'The VM started but did not report a LAN address within 3 minutes.' }; }
  const port = opts.port ?? 8420;
  const url = `http://${ip}:${port}/`;
  const h = await waitHealthy(url);
  if (!h.ok) { step(3, 'failed', h.error); return { error: `${url} did not answer its health check (${h.error}).` }; }
  step(3, 'done', url);
  const instance: Instance = { id: `${Date.now()}`, name: opts.name, target: 'virtualbox', version: h.version ?? 'unknown', port, host: ip, createdAt: new Date().toISOString() };
  await saveInstances(dataDir, [...existing, instance]);
  return { instance, url };
}

const VMWARE_DIR = 'C:\\Program Files (x86)\\VMware\\VMware Workstation';
export const vmrun = () => process.env.MAP_EDITOR_VMRUN || (process.platform === 'win32' ? `${VMWARE_DIR}\\vmrun.exe` : 'vmrun');
export const ovftool = () => process.env.MAP_EDITOR_OVFTOOL || (process.platform === 'win32' ? `${VMWARE_DIR}\\OVFTool\\ovftool.exe` : 'ovftool');

/** VMware Workstation or Player: convert the appliance OVA to a VM on a bridged network, start it without a window, wait for health. */
export async function deployVMware(dataDir: string, opts: { name: string; ova: string; port?: number }, progress: Progress): Promise<{ instance?: Instance; url?: string; error?: string }> {
  const steps: Step[] = [{ label: 'Check VMware', state: 'waiting' }, { label: 'Import appliance', state: 'waiting' }, { label: 'Start VM', state: 'waiting' }, { label: 'Find its LAN address and check health', state: 'waiting' }];
  const step = (i: number, state: Step['state'], detail?: string) => { steps[i] = { ...steps[i], state, detail }; progress([...steps]); };
  const existing = await loadInstances(dataDir);
  if (!NAME_RE.test(opts.name) || existing.some((i) => i.name === opts.name)) return { error: 'Choose a new, valid instance name.' };
  if (!/\.ova$/i.test(opts.ova)) return { error: 'Choose the appliance .ova file.' };
  step(0, 'running');
  const tool = await run(ovftool(), ['--version']);
  const vr = tool.code === 0 ? await run(vmrun(), []) : tool; // vmrun with no arguments prints its help and exits non-zero
  if (tool.code !== 0 || !/vmrun|Usage/i.test(vr.stdout + vr.stderr)) { step(0, 'failed', (tool.stderr || vr.stderr).trim()); return { error: 'VMware Workstation or Player with OVF Tool was not found.' }; }
  step(0, 'done', tool.stdout.trim());
  const dir = path.join(dataDir, 'vms');
  await fs.mkdir(dir, { recursive: true });
  const vmx = path.join(dir, opts.name, `${opts.name}.vmx`);
  step(1, 'running');
  const imp = await run(ovftool(), ['--acceptAllEulas', '--noSSLVerify', `--name=${opts.name}`, '--net:Bridged=bridged', opts.ova, dir], { timeoutMs: 30 * 60_000 });
  if (imp.code !== 0) { step(1, 'failed', (imp.stderr || imp.stdout).trim()); return { error: `Import failed with exit code ${imp.code}.` }; }
  step(1, 'done', vmx);
  step(2, 'running');
  const start = await run(vmrun(), ['-T', 'ws', 'start', vmx, 'nogui']);
  if (start.code !== 0) { step(2, 'failed', (start.stderr || start.stdout).trim()); return { error: `The VM did not start (exit code ${start.code}).` }; }
  step(2, 'done');
  step(3, 'running');
  // The appliance runs open-vm-tools, which reports the guest address to vmrun.
  const g = await run(vmrun(), ['-T', 'ws', 'getGuestIPAddress', vmx, '-wait'], { timeoutMs: 5 * 60_000 });
  const ip = /^(\d{1,3}(?:\.\d{1,3}){3})\s*$/.exec(g.stdout.trim())?.[1];
  if (!ip) { step(3, 'failed', (g.stderr || g.stdout).trim()); return { error: 'The VM started but did not report a LAN address within 5 minutes.' }; }
  const port = opts.port ?? 8420;
  const url = `http://${ip}:${port}/`;
  const h = await waitHealthy(url);
  if (!h.ok) { step(3, 'failed', h.error); return { error: `${url} did not answer its health check (${h.error}).` }; }
  step(3, 'done', url);
  const instance: Instance = { id: `${Date.now()}`, name: opts.name, target: 'vmware', version: h.version ?? 'unknown', port, host: ip, vmPath: vmx, createdAt: new Date().toISOString() };
  await saveInstances(dataDir, [...existing, instance]);
  return { instance, url };
}

// ---------- instance management ----------
export type InstanceAction = 'start' | 'stop' | 'restart' | 'update' | 'remove';

function composeArgs(dataDir: string, name: string) {
  return ['compose', '-f', path.join(dataDir, 'instances', name, 'compose.yaml'), '-p', name];
}
const vboxManage = () => (process.platform === 'win32' ? 'C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe' : 'VBoxManage');

/** Current state of an instance this app created, read from Docker or VirtualBox, never assumed. */
export async function instanceState(dataDir: string, i: Instance): Promise<'running' | 'stopped' | 'missing' | 'unknown'> {
  if (i.target === 'docker' || i.target === 'docker-ssh') {
    const r = await run('docker', [...composeArgs(dataDir, i.name), 'ps', '--all', '--format', '{{.State}}'], { env: dockerEnv(i), timeoutMs: 60_000 });
    if (r.code !== 0) return 'unknown';
    const s = r.stdout.trim();
    return !s ? 'missing' : /running/.test(s) ? 'running' : 'stopped';
  }
  if (i.target === 'virtualbox') {
    const r = await run(vboxManage(), ['showvminfo', i.name, '--machinereadable']);
    if (r.code !== 0) return 'missing';
    return /VMState="running"/.test(r.stdout) ? 'running' : 'stopped';
  }
  if (i.target === 'vmware' && i.vmPath) {
    try { await fs.access(i.vmPath); } catch { return 'missing'; }
    const r = await run(vmrun(), ['-T', 'ws', 'list']);
    if (r.code !== 0) return 'unknown';
    return r.stdout.split(/\r?\n/).some((l) => path.normalize(l.trim()) === path.normalize(i.vmPath!)) ? 'running' : 'stopped';
  }
  return 'unknown';
}

/** Run one action on an instance. Remove keeps worlds and data unless deleteData is true. */
export async function instanceAction(dataDir: string, name: string, action: InstanceAction, deleteData = false): Promise<{ ok: boolean; message: string }> {
  const list = await loadInstances(dataDir);
  const i = list.find((x) => x.name === name);
  if (!i) return { ok: false, message: `${name} is not an instance this app created.` };
  let r: RunResult;
  if (i.target === 'docker' || i.target === 'docker-ssh') {
    const base = composeArgs(dataDir, name);
    const env = dockerEnv(i);
    if (action === 'update') {
      r = await run('docker', [...base, 'pull'], { env });
      if (r.code === 0) r = await run('docker', [...base, 'up', '-d'], { env });
    } else if (action === 'remove') {
      r = await run('docker', [...base, 'down', ...(deleteData ? ['--volumes'] : [])], { env });
    } else {
      r = await run('docker', [...base, action], { env });
    }
  } else if (i.target === 'virtualbox') {
    const vbm = vboxManage();
    const map: Record<InstanceAction, string[][]> = {
      start: [['startvm', name, '--type', 'headless']],
      stop: [['controlvm', name, 'acpipowerbutton']],
      restart: [['controlvm', name, 'reset']],
      update: [],
      remove: [['controlvm', name, 'poweroff'], ['unregistervm', name, ...(deleteData ? ['--delete'] : [])]],
    };
    if (action === 'update') return { ok: false, message: 'Update a VirtualBox instance by importing the new appliance image. In-place updates are on the roadmap.' };
    r = { code: 0, stdout: '', stderr: '' };
    for (const args of map[action]) {
      r = await run(vbm, args);
      if (r.code !== 0 && !(action === 'remove' && args[0] === 'controlvm')) break; // poweroff fails harmlessly when already off
    }
  } else if (i.target === 'vmware' && i.vmPath) {
    const vmx = i.vmPath;
    if (action === 'update') return { ok: false, message: 'Update a VMware instance by importing the new appliance image. In-place updates are on the roadmap.' };
    const map: Record<Exclude<InstanceAction, 'update'>, string[][]> = {
      start: [['-T', 'ws', 'start', vmx, 'nogui']],
      stop: [['-T', 'ws', 'stop', vmx, 'soft']],
      restart: [['-T', 'ws', 'reset', vmx, 'soft']],
      remove: [['-T', 'ws', 'stop', vmx, 'hard'], ...(deleteData ? [['-T', 'ws', 'deleteVM', vmx]] : [])],
    };
    r = { code: 0, stdout: '', stderr: '' };
    for (const args of map[action]) {
      r = await run(vmrun(), args);
      if (r.code !== 0 && !(action === 'remove' && args[2] === 'stop')) break; // stopping an already stopped VM fails harmlessly
    }
  } else {
    return { ok: false, message: `Managing ${i.target} instances is not available yet.` };
  }
  if (r.code !== 0) return { ok: false, message: `${action} failed with exit code ${r.code}: ${r.stderr.trim().split('\n').slice(-2).join(' ')}` };
  if (action === 'remove') await saveInstances(dataDir, list.filter((x) => x.name !== name));
  return { ok: true, message: `${name}: ${action} finished.` };
}

/** Follow an instance's log. Returns a function that stops following. */
export function followLogs(dataDir: string, i: Instance, onLine: (line: string) => void): () => void {
  if (i.target !== 'docker' && i.target !== 'docker-ssh') { onLine('Live logs are available for Docker instances. For a VM, open its console in VirtualBox.'); return () => undefined; }
  const env = dockerEnv(i);
  const p = spawn('docker', [...composeArgs(dataDir, i.name), 'logs', '--follow', '--tail', '200', '--no-color'], { windowsHide: true, env: env ? { ...process.env, ...env } : process.env });
  let buf = '';
  const feed = (d: Buffer) => { buf += d.toString(); const lines = buf.split(/\r?\n/); buf = lines.pop() ?? ''; for (const l of lines) onLine(l); };
  p.stdout.on('data', feed); p.stderr.on('data', feed);
  p.on('error', (e) => onLine(`Could not read the log: ${e.message}`));
  return () => p.kill();
}
