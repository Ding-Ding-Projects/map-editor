// Deployment wizard: one click per target, then the verified link.
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import * as targets from './targets.js';

let win: BrowserWindow | undefined;
const dataDir = () => path.join(app.getPath('userData'), 'deploy');

app.whenReady().then(() => {
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
ipcMain.handle('deploy-docker', (_e, o) => targets.deployDocker(dataDir(), o, progress));
ipcMain.handle('deploy-virtualbox', (_e, o) => targets.deployVirtualBox(dataDir(), o, progress));
ipcMain.handle('disks', async () => targets.flashableDisks(await targets.listDisks()));
ipcMain.handle('flash', async (_e, image: string, diskId: string, typed: string) => {
  // Re-read the disk list here so the renderer can never hand us a disk we did not offer.
  const disk = targets.flashableDisks(await targets.listDisks()).find((d) => d.id === diskId);
  if (!disk) return { ok: false, message: 'That drive is no longer connected or is not removable. Nothing was written.' };
  return targets.flash(image, disk, typed, (w, t) => win?.webContents.send('flash-progress', w, t));
});
ipcMain.handle('open', (_e, url: string) => { if (/^http:\/\/[\d.]+:\d+\/$/.test(url)) shell.openExternal(url); });
