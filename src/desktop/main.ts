// Desktop app: runs the shared server on loopback and shows it in a window.
import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { createServer } from '../server/server.js';

function defaultSaves() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? os.homedir(), '.minecraft', 'saves');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft', 'saves');
  return path.join(os.homedir(), '.minecraft', 'saves');
}

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(async () => {
  const dataDir = path.join(app.getPath('userData'), 'data');
  const { port } = await createServer({
    host: '127.0.0.1', port: 0, dataDir, worldRoots: [defaultSaves()], allowAnyPath: true,
    staticDir: path.join(__dirname, '..', 'ui'),
  });
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 360, minHeight: 600, title: 'Map Editor', backgroundColor: '#10140F',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // Links to other sites open in the normal browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${port}/`)) e.preventDefault(); });
  await win.loadURL(`http://127.0.0.1:${port}/`);
});

app.on('window-all-closed', () => app.quit());
