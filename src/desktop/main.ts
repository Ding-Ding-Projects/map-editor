// Desktop app: runs the shared server on loopback and shows it in a window.
import { app, BrowserWindow, shell, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { createServer } from '../server/server.js';
import { handleSquirrelEvent } from './squirrel.js';
import { startUpdater } from './updater.js';

function defaultSaves() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? os.homedir(), '.minecraft', 'saves');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft', 'saves');
  return path.join(os.homedir(), '.minecraft', 'saves');
}

const squirrel = handleSquirrelEvent();
if (!squirrel && !app.requestSingleInstanceLock()) app.quit();
let win: BrowserWindow | undefined;

if (!squirrel) app.whenReady().then(async () => {
  startUpdater('MapEditor', () => win);
  const dataDir = path.join(app.getPath('userData'), 'data');
  const { port } = await createServer({
    host: '127.0.0.1', port: 0, dataDir, worldRoots: [defaultSaves()], allowAnyPath: true,
    staticDir: path.join(__dirname, '..', 'ui'),
  });
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 360, minHeight: 600, title: 'Map Editor', backgroundColor: '#10140F',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // Opens a folder in Explorer, but only inside this app's own data folder (the extensions folder).
  ipcMain.handle('open-data-folder', async (_e, p: string) => {
    const target = path.resolve(String(p ?? ''));
    if (!target.startsWith(path.resolve(dataDir) + path.sep)) return 'Only folders inside the app data folder can be opened.';
    await fs.mkdir(target, { recursive: true });
    return shell.openPath(target);
  });
  ipcMain.handle('pick-folder', async () => (await dialog.showOpenDialog(win!, { title: 'Open a Minecraft world folder', properties: ['openDirectory'] })).filePaths[0]);
  // Links to other sites open in the normal browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${port}/`)) e.preventDefault(); });
  await win.loadURL(`http://127.0.0.1:${port}/`);
});

app.on('window-all-closed', () => app.quit());
