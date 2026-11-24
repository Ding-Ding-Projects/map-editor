// Fetches the dockview fork at one pinned commit into vendor/dockview (ignored by Git).
// The fork is private: CI passes a read-only token as DOCKVIEW_TOKEN. Nothing from it is committed here.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
const PIN = '5e496c401c0476b10f2c5ed1512032b576e8cd84';
const dest = 'vendor/dockview';
if (existsSync(`${dest}/.git`) && execFileSync('git', ['-C', dest, 'rev-parse', 'HEAD']).toString().trim() === PIN) { console.log(`dockview already at ${PIN}`); process.exit(0); }
rmSync(dest, { recursive: true, force: true });
const token = process.env.DOCKVIEW_TOKEN;
const url = token ? `https://x-access-token:${token}@github.com/Ding-Ding-Projects/dockview.git` : 'https://github.com/Ding-Ding-Projects/dockview.git';
execFileSync('git', ['init', '-q', dest]);
execFileSync('git', ['-C', dest, 'fetch', '-q', '--depth', '1', url, PIN], { stdio: ['ignore', 'inherit', 'inherit'] });
execFileSync('git', ['-C', dest, 'checkout', '-q', 'FETCH_HEAD']);
console.log(`dockview fetched at ${PIN}`);
