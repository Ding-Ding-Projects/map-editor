// Runs the deploy app's real Docker code paths against a real Docker daemon, locally and over SSH,
// and the USB flashing code against a loop device. Used by the "Real-world checks" workflow.
// Usage (after bundling with esbuild): node verify-deploy.mjs docker|ssh <sshHost>|flash <device>
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as t from '../src/deploy/targets.js';

const mode = process.argv[2];
const version = process.env.MAP_EDITOR_VERSION || 'latest';
const fail = (msg: string): never => { console.error(`FAIL: ${msg}`); process.exit(1); };
const log = (s: t.Step[]) => { const last = s.filter((x) => x.state !== 'waiting').slice(-1)[0]; if (last) console.log(`  ${last.state.padEnd(7)} ${last.label}${last.detail ? ` (${last.detail.split('\n')[0].slice(0, 100)})` : ''}`); };

async function dockerFlow(sshHost?: string) {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'me-verify-'));
  const worlds = sshHost ? '/tmp/me-remote-worlds' : await fs.mkdtemp(path.join(os.tmpdir(), 'me-worlds-'));
  if (sshHost) await fs.mkdir(worlds, { recursive: true }); // same machine in CI; on a real remote it must exist there
  const name = sshHost ? 'verify-ssh' : 'verify-local';
  const port = sshHost ? 18422 : 18421;
  console.log(`Deploying ${name} (${version}) ${sshHost ? `over SSH to ${sshHost}` : 'to local Docker'}`);
  const r = await t.deployDocker(data, { name, port, version, worlds, sshHost }, log);
  if (r.error || !r.url) fail(r.error ?? 'no link');
  console.log(`  live at ${r.url}`);
  const health = await (await fetch(`${r.url}api/health`)).json() as { version: string };
  console.log(`  health check answered version ${health.version}`);
  for (const action of ['stop', 'start', 'restart', 'update'] as const) {
    const a = await t.instanceAction(data, name, action);
    if (!a.ok) fail(`${action}: ${a.message}`);
    const st = await t.instanceState(data, r.instance!);
    console.log(`  ${action} → ${st}`);
    if (action === 'stop' && st !== 'stopped') fail(`expected stopped after stop, got ${st}`);
    if (action !== 'stop' && st !== 'running') fail(`expected running after ${action}, got ${st}`);
  }
  if (!(await t.waitHealthy(r.url!)).ok) fail('not healthy after update');
  // The live log follows docker compose logs.
  const lines: string[] = [];
  const stop = t.followLogs(data, r.instance!, (l) => lines.push(l));
  await new Promise((ok) => setTimeout(ok, 4000)); stop();
  if (!lines.some((l) => /listening/i.test(l))) fail(`live log did not show the server starting: ${lines.slice(-3).join(' | ')}`);
  console.log(`  live log: ${lines.length} lines, including "${lines.find((l) => /listening/i.test(l))!.trim().slice(0, 80)}"`);
  const rm = await t.instanceAction(data, name, 'remove', true);
  if (!rm.ok) fail(`remove: ${rm.message}`);
  if ((await t.loadInstances(data)).length) fail('instance still listed after remove');
  console.log(`PASS: ${name}`);
}

async function flashFlow(device: string) {
  // A loop device stands in for the USB drive; flash() writes, syncs and reads back the SHA-256.
  const img = path.join(os.tmpdir(), 'me-flash.img');
  const buf = Buffer.alloc(8 * 1024 * 1024); for (let i = 0; i < buf.length; i++) buf[i] = (i * 31) % 251;
  await fs.writeFile(img, buf);
  const disk: t.Disk = { id: device, name: 'Loop test drive', sizeBytes: 16 * 1024 * 1024, removable: true, system: false, mountpoints: [] };
  const phrase = t.confirmPhrase(disk);
  const bad = await t.flash(img, disk, 'wrong', () => undefined);
  if (bad.ok) fail('flash accepted a wrong confirmation');
  const r = await t.flash(img, disk, phrase, () => undefined);
  if (!r.ok) fail(r.message);
  console.log(`PASS: flash → ${r.message}`);
}

if (mode === 'docker') await dockerFlow();
else if (mode === 'ssh') await dockerFlow(process.argv[3] ?? fail('ssh host needed'));
else if (mode === 'flash') await flashFlow(process.argv[3] ?? fail('device needed'));
else fail('mode must be docker, ssh or flash');
