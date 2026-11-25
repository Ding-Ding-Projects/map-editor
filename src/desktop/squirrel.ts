// Squirrel.Windows starts the app with these arguments while installing, updating and removing it.
// Each one must create or remove the Start menu and desktop shortcuts and quit straight away.
import { app } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export function updateExe(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const exe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  return fs.existsSync(exe) ? exe : undefined;
}

/** Returns true when this launch was a Squirrel event and the app is quitting. */
export function handleSquirrelEvent(): boolean {
  const cmd = process.argv[1];
  if (process.platform !== 'win32' || !cmd?.startsWith('--squirrel-') || cmd === '--squirrel-firstrun') return false;
  const exe = updateExe();
  const target = path.basename(process.execPath);
  const run = (args: string[]) => {
    if (!exe) { app.quit(); return; }
    spawn(exe, args, { detached: true }).on('close', () => app.quit()).on('error', () => app.quit());
  };
  switch (cmd) {
    case '--squirrel-install': case '--squirrel-updated': run(['--createShortcut', target]); return true;
    case '--squirrel-uninstall': run(['--removeShortcut', target]); return true;
    case '--squirrel-obsolete': app.quit(); return true;
    default: app.quit(); return true;
  }
}
