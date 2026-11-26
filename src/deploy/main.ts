// Deployment wizard: one click per target, then the verified link.
import { promises as fsp } from 'node:fs';
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import os from 'node:os';
import * as targets from './targets.js';
import { handleSquirrelEvent } from '../desktop/squirrel.js';
import { startUpdater } from '../desktop/updater.js';
import { ActivityLog } from '../server/activity.js';

let win: BrowserWindow | undefined;
let working = 0; // deploys and flashes in progress; an update restart waits for them
const track = async <T>(p: Promise<T>): Promise<T> => { working++; try { return await p; } finally { working--; } };
const dataDir = () => path.join(app.getPath('userData'), 'deploy');
// Instance records: every deploy, duplicate, flash and action is kept in a local Git history beside instances.json.
let activityLog: ActivityLog | undefined;
const activity = () => (activityLog ??= new ActivityLog(dataDir()));
const who = () => { try { return os.userInfo().username; } catch { return 'this computer'; } };
const record = <T extends { error?: string; ok?: boolean; message?: string; instance?: { name: string; target: string; version: string; port: number } }>(what: string, r: T): T => {
  const failed = Boolean(r.error) || r.ok === false;
  const detail = r.instance ? `${r.instance.name} (${r.instance.target}, ${r.instance.version}, port ${r.instance.port})` : '';
  activity().record('instance', who(), `${what}${detail ? ` ${detail}` : ''}${failed ? ` failed: ${r.error ?? r.message ?? ''}` : ''}`).catch(() => undefined);
  return r;
};

const squirrel = handleSquirrelEvent();
if (!squirrel) app.whenReady().then(() => {
  startUpdater('MapEditorDeploy', () => win, () => working === 0);
  win = new BrowserWindow({
    width: 1280, height: 900, minWidth: 360, title: 'Map Editor Deploy', backgroundColor: '#10140F', icon: path.join(__dirname, '..', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());

const progress = (steps: targets.Step[]) => win?.webContents.send('progress', steps);

// Version, commit and build time of this app, read from the file the build writes beside it.
ipcMain.handle('build-info', async () => {
  for (const f of [path.join(__dirname, '..', 'build-info.json'), path.join(__dirname, 'build-info.json')]) {
    try { const b = JSON.parse(await fsp.readFile(f, 'utf8')); return { version: String(b.version ?? ''), commit: String(b.commit ?? ''), builtAt: b.builtAt ?? null, codeName: b.codeName && typeof b.codeName.en === 'string' ? { en: String(b.codeName.en).slice(0, 120), yue: String(b.codeName.yue ?? '').slice(0, 120) } : null }; } catch { /* try the next place */ }
  }
  return { version: 'unavailable', commit: 'unavailable', builtAt: null };
});
ipcMain.handle('instances', () => targets.loadInstances(dataDir()));
ipcMain.handle('lan', () => targets.lanAddress());
ipcMain.handle('preflight', () => targets.preflight());
ipcMain.handle('pick-folder', async () => (await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })).filePaths[0]);
ipcMain.handle('pick-file', async (_e, exts: string[]) => (await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Image', extensions: exts }] })).filePaths[0]);
ipcMain.handle('deploy-docker', async (_e, o) => record(o?.sshHost ? 'Deployed to Docker over SSH' : 'Deployed to Docker', await track(targets.deployDocker(dataDir(), o, progress))));
ipcMain.handle('deploy-virtualbox', async (_e, o) => record('Deployed to VirtualBox', await track(targets.deployVirtualBox(dataDir(), o, progress))));
ipcMain.handle('deploy-vmware', async (_e, o) => record('Deployed to VMware', await track(targets.deployVMware(dataDir(), o, progress))));
ipcMain.handle('duplicate-suggest', async (_e, name: string) => {
  const list = await targets.loadInstances(dataDir());
  const i = list.find((x) => x.name === name);
  return i ? targets.duplicateSuggestion(i, list) : undefined;
});
ipcMain.handle('duplicate', async (_e, name: string, o: { name: string; port: number }) => record(`Duplicated ${name} as`, await track(targets.duplicateInstance(dataDir(), name, { name: String(o?.name ?? ''), port: Number(o?.port) }, progress))));
ipcMain.handle('vdisks', () => targets.listVirtualDisks());
ipcMain.handle('save-file', async (_e, name: string, exts: string[]) => (await dialog.showSaveDialog(win!, { defaultPath: name, filters: [{ name: 'Files', extensions: exts }] })).filePath);
ipcMain.handle('vdisk-job', async (_e, job: targets.VdiskJob) => {
  const what = job?.action === 'create' ? 'Created virtual disk' : job?.action === 'attach' ? 'Attached virtual disk' : 'Detached virtual disk';
  return record(`${what} ${path.basename(String(job?.file))}`, await targets.vdiskJob(job));
});
ipcMain.handle('disks', async () => targets.flashableDisks(await targets.listDisks()));
ipcMain.handle('flash', async (_e, image: string, diskId: string, typed: string) => {
  // Re-read the disk list here so the renderer can never hand us a disk we did not offer.
  const disk = targets.flashableDisks(await targets.listDisks()).find((d) => d.id === diskId);
  if (!disk) return { ok: false, message: 'That drive is no longer connected or is not removable. Nothing was written.' };
  return record(`Wrote ${path.basename(image)} to ${disk.name}`, await track(targets.flash(image, disk, typed, (w, t) => win?.webContents.send('flash-progress', w, t))));
});
ipcMain.handle('state', async (_e, name: string) => {
  const i = (await targets.loadInstances(dataDir())).find((x) => x.name === name);
  return i ? targets.instanceState(dataDir(), i) : 'missing';
});
ipcMain.handle('action', async (_e, name: string, action: targets.InstanceAction, deleteData: boolean) => record(`${action[0].toUpperCase()}${action.slice(1)} ${name}${action === 'remove' && deleteData ? ' with its data' : ''}`, await targets.instanceAction(dataDir(), name, action, Boolean(deleteData))));
ipcMain.handle('activity', () => activity().list(100));
let stopLogs: (() => void) | undefined;
ipcMain.handle('logs-start', async (_e, name: string) => {
  stopLogs?.();
  const i = (await targets.loadInstances(dataDir())).find((x) => x.name === name);
  if (!i) return false;
  stopLogs = targets.followLogs(dataDir(), i, (line) => win?.webContents.send('log-line', line));
  return true;
});
ipcMain.handle('logs-stop', () => { stopLogs?.(); stopLogs = undefined; });
ipcMain.handle('open', (_e, url: string) => { if (/^http:\/\/[A-Za-z0-9.-]+:\d+\/$/.test(url)) shell.openExternal(url); });
