#!/usr/bin/env node
// One-command setup for the Docker-hosted web app. Asks only what it cannot work out,
// shows a review screen, writes .env, starts Compose, waits for health and prints the link.
// Non-interactive: node scripts/setup.mjs --yes --port 8420 --worlds /path/to/saves [--version 0.1.0]
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, platform, env, exit } from 'node:process';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
const args = Object.fromEntries(argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter((x) => x.length));
const yes = Boolean(args.yes || env.CI);

function readEnv() {
  if (!existsSync(envFile)) return {};
  return Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}
const free = (port) => new Promise((r) => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(port, '0.0.0.0', () => s.close(() => r(true))); });
async function firstFreePort(start) { for (let p = start; p < start + 50; p++) if (await free(p)) return p; return start; }
function lan() { for (const l of Object.values(os.networkInterfaces())) for (const a of l ?? []) if (a.family === 'IPv4' && !a.internal) return a.address; return '127.0.0.1'; }
function defaultSaves() {
  if (platform === 'win32') return path.join(env.APPDATA ?? os.homedir(), '.minecraft', 'saves');
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft', 'saves');
  return path.join(os.homedir(), '.minecraft', 'saves');
}
const checks = {
  port: (v) => (Number.isInteger(+v) && +v >= 1024 && +v <= 65535) ? null : 'Enter a whole number from 1024 to 65535.',
  worlds: (v) => { try { return statSync(v).isDirectory() ? null : 'That is not a folder.'; } catch { return 'That folder does not exist.'; } },
  version: (v) => /^\d+\.\d+\.\d+$/.test(v) ? null : 'Use a version like 0.1.0.',
};

const prev = readEnv();
const values = {
  port: String(args.port ?? prev.MAP_EDITOR_PORT ?? await firstFreePort(8420)),
  worlds: String(args.worlds ?? prev.MAP_EDITOR_WORLDS_DIR ?? defaultSaves()),
  version: String(args.version ?? prev.MAP_EDITOR_VERSION ?? JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version),
};
const labels = { port: 'Port on this computer', worlds: 'Minecraft worlds folder', version: 'Map Editor version' };

if (!yes) {
  const rl = createInterface({ input: stdin, output: stdout });
  console.log('\nMap Editor setup. Press Enter to keep the value in brackets. Type "back" to go back.\n');
  const keys = Object.keys(values);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const a = (await rl.question(`${labels[k]} [${values[k]}]: `)).trim();
    if (a === 'back') { i = Math.max(-1, i - 2); continue; }
    const v = a || values[k];
    const err = checks[k](v);
    if (err) { console.log(`  ${err}`); i--; continue; }
    values[k] = v;
  }
  console.log('\nReview:');
  for (const k of keys) console.log(`  ${labels[k].padEnd(26)} ${values[k]}`);
  const ok = (await rl.question('\nWrite .env and start? [Y/n]: ')).trim().toLowerCase();
  rl.close();
  if (ok === 'n' || ok === 'no') { console.log('Nothing was written.'); exit(1); }
} else {
  for (const k of Object.keys(values)) { const err = checks[k](values[k]); if (err) { console.error(`${labels[k]}: ${err}`); exit(2); } }
}

writeFileSync(envFile, `# Written by scripts/setup.mjs\nMAP_EDITOR_PORT=${values.port}\nMAP_EDITOR_WORLDS_DIR=${values.worlds}\nMAP_EDITOR_VERSION=${values.version}\n`, { mode: 0o600 });
console.log(`Wrote ${envFile}`);
if (args['no-start']) exit(0);

const dc = (a) => spawnSync('docker', ['compose', '--project-directory', root, ...a], { stdio: 'inherit' });
if (spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' }).status !== 0) { console.error('Docker with Compose was not found. Install Docker Desktop, then run this again.'); exit(3); }
let r = dc(['pull']); if (r.status !== 0) { console.error(`docker compose pull failed (exit code ${r.status}).`); exit(r.status ?? 1); }
r = dc(['up', '-d']); if (r.status !== 0) { console.error(`docker compose up failed (exit code ${r.status}).`); exit(r.status ?? 1); }

const url = `http://${lan()}:${values.port}/`;
const end = Date.now() + 90_000;
while (Date.now() < end) {
  try { const res = await fetch(`http://127.0.0.1:${values.port}/api/health`); if (res.ok) { const j = await res.json();
    console.log(`\n  ✔ Map Editor ${j.version} is running.\n\n  Open: ${url}\n  The first person to open it becomes the owner.\n`); exit(0); } } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 2000));
}
console.error(`Started, but ${url} did not pass its health check within 90 seconds. Run: docker compose logs`);
exit(4);
