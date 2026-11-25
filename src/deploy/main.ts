// Deployment wizard: one click per target, then the verified link.
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import * as targets from './targets.js';
import { handleSquirrelEvent } from '../desktop/squirrel.js';
import { startUpdater } from '../desktop/updater.js';

let win: BrowserWindow | undefined;
let working = 0; // deploys and flashes in progress; an update restart waits for them
const track = async <T>(p: Promise<T>): Promise<T> => { working++; try { return await p; } finally { working--; } };
const dataDir = () => path.join(app.getPath('userData'), 'deploy');

const squirrel = handleSquirrelEvent();
if (!squirrel) app.whenReady().then(() => {
  startUpdater('MapEditorDeploy', () => win, () => working === 0);
  win = new BrowserWindow({
    width: 1280, height: 900, minWidth: 360, title: 'Map Editor Deploy', backgroundColor: '#10140F',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());

const progress = (steps: targets.Step[]) => win?.webContents.send('progress', steps);

ipcMain.handle('instances', () => targets.loadInstances(dataDir()));
ipcMain.handle('lan', () => targets.lanAddress());
ipcMain.handle('pick-folder', async () => (await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })).filePaths[0]);
ipcMain.handle('pick-file', async (_e, exts: string[]) => (await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Image', extensions: exts }] })).filePaths[0]);
ipcMain.handle('deploy-docker', (_e, o) => track(targets.deployDocker(dataDir(), o, progress)));
ipcMain.handle('deploy-virtualbox', (_e, o) => track(targets.deployVirtualBox(dataDir(), o, progress)));
ipcMain.handle('disks', async () => targets.flashableDisks(await targets.listDisks()));
ipcMain.handle('flash', async (_e, image: string, diskId: string, typed: string) => {
  // Re-read the disk list here so the renderer can never hand us a disk we did not offer.
  const disk = targets.flashableDisks(await targets.listDisks()).find((d) => d.id === diskId);
  if (!disk) return { ok: false, message: 'That drive is no longer connected or is not removable. Nothing was written.' };
  return track(targets.flash(image, disk, typed, (w, t) => win?.webContents.send('flash-progress', w, t)));
});
ipcMain.handle('state', async (_e, name: string) => {
  const i = (await targets.loadInstances(dataDir())).find((x) => x.name === name);
  return i ? targets.instanceState(dataDir(), i) : 'missing';
});
ipcMain.handle('action', (_e, name: string, action: targets.InstanceAction, deleteData: boolean) => targets.instanceAction(dataDir(), name, action, Boolean(deleteData)));
let stopLogs: (() => void) | undefined;
ipcMain.handle('logs-start', async (_e, name: string) => {
  stopLogs?.();
  const i = (await targets.loadInstances(dataDir())).find((x) => x.name === name);
  if (!i) return false;
  stopLogs = targets.followLogs(dataDir(), i, (line) => win?.webContents.send('log-line', line));
  return true;
});
ipcMain.handle('logs-stop', () => { stopLogs?.(); stopLogs = undefined; });
ipcMain.handle('open', (_e, url: string) => { if (/^http:\/\/[\d.]+:\d+\/$/.test(url)) shell.openExternal(url); });
