// Desktop app: runs the shared server on loopback and shows it in a window.
import { app, BrowserWindow, shell, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { createServer } from '../server/server.js';
import { handleSquirrelEvent } from './squirrel.js';
import { startUpdater } from './updater.js';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { detectEditors } from './editors.js';
import { changeWorldsFolders, currentDataDir, extraWorldsFolders, moveDataDir, savedWindowName, saveWindowName } from './datafolder.js';

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
  const userData = app.getPath('userData');
  const { dataDir, isDefault } = await currentDataDir(userData);
  await fs.mkdir(dataDir, { recursive: true });
  // The server keeps this very list, so a folder added in Settings shows its worlds straight away.
  const worldRoots = [defaultSaves(), ...await extraWorldsFolders(userData, defaultSaves())];
  // No account on the desktop: a key made for this run, known only to this window, stands in for signing in.
  const key = randomBytes(32).toString('base64url');
  const { port } = await createServer({
    host: '127.0.0.1', port: 0, dataDir, worldRoots, allowAnyPath: true, localOwner: { key },
    staticDir: path.join(__dirname, '..', 'ui'),
  });
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 360, minHeight: 600, title: (await savedWindowName(userData)) || 'Map Editor', backgroundColor: '#10140F',
    icon: path.join(__dirname, '..', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // Opens a folder in Explorer, but only inside this app's own data folder (the extensions folder).
  ipcMain.handle('open-data-folder', async (_e, p: string) => {
    const target = path.resolve(String(p ?? ''));
    if (!target.startsWith(path.resolve(dataDir) + path.sep)) return 'Only folders inside the app data folder can be opened.';
    await fs.mkdir(target, { recursive: true });
    return shell.openPath(target);
  });
  // Outside editors: list the ones installed, and open a world folder in one (or in the file manager).
  const isFile = (p: string) => fs.stat(p).then((st) => st.isFile(), () => false);
  const editors = () => detectEditors(process.platform, process.env, isFile);
  ipcMain.handle('editors', async () => (await editors()).map(({ id, name }) => ({ id, name })));
  ipcMain.handle('open-in-editor', async (_e, id: string, folder: string): Promise<string> => {
    const target = path.resolve(String(folder ?? ''));
    // Only a world folder is handed over: it must be a folder that holds level.dat.
    if (!await fs.stat(target).then((st) => st.isDirectory(), () => false) || !await isFile(path.join(target, 'level.dat'))) return 'That is not a world folder.';
    if (id === 'files') return shell.openPath(target);
    const ed = (await editors()).find((x) => x.id === id);
    if (!ed) return 'That editor was not found on this computer.';
    return new Promise((resolve) => {
      // A .cmd launcher on Windows needs the command processor; the folder is passed as one quoted argument, never as shell text from the page.
      const cmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(ed.command);
      const child = cmd ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `""${ed.command}" "${target.replace(/"/g, '')}""`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true, windowsHide: true })
        : spawn(ed.command, [target], { detached: true, stdio: 'ignore' });
      child.once('error', (err) => resolve(err.message));
      child.once('spawn', () => { child.unref(); resolve(''); });
    });
  });
  // The data folder: where it is, how much it holds, and a way to open it. It is never moved or deleted from here.
  ipcMain.handle('data-folder', async () => {
    let bytes = 0, files = 0;
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 12 || files > 200_000) return;
      for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full, depth + 1);
        else if (e.isFile()) { files++; bytes += (await fs.stat(full).catch(() => ({ size: 0 }))).size; }
      }
    };
    await walk(dataDir, 0);
    return { path: dataDir, bytes, files, worlds: defaultSaves(), worldsFolders: worldRoots.slice(1), isDefault, defaultPath: path.join(userData, 'data') };
  });
  // Move the data folder: the person picks an empty folder, everything is copied and checked, and the choice takes effect at the next start.
  ipcMain.handle('move-data-folder', async (_e, toDefault: boolean) => {
    let to = path.join(userData, 'data');
    if (!toDefault) {
      const picked = (await dialog.showOpenDialog(win!, { title: 'Choose an empty folder for Map Editor data', properties: ['openDirectory', 'createDirectory'] })).filePaths[0];
      if (!picked) return { ok: false, message: '' };
      to = picked;
    }
    return moveDataDir(userData, to, (done, total) => win?.webContents.send('data-move-progress', done, total));
  });
  ipcMain.handle('worlds-folder', async (_e, remove?: string) => {
    let change: { add?: string; remove?: string };
    if (typeof remove === 'string') change = { remove };
    else {
      const picked = (await dialog.showOpenDialog(win!, { title: 'Choose a folder that holds worlds', properties: ['openDirectory'] })).filePaths[0];
      if (!picked) return { folders: worldRoots.slice(1), error: '' };
      change = { add: picked };
    }
    const r = await changeWorldsFolders(userData, defaultSaves(), change);
    worldRoots.splice(1, worldRoots.length, ...r.folders);
    return r;
  });
  ipcMain.handle('relaunch', () => { app.relaunch(); app.quit(); });
  ipcMain.handle('window-name', (_e, name: unknown) => saveWindowName(userData, name));
  ipcMain.handle('open-data-root', async () => { await fs.mkdir(dataDir, { recursive: true }); return shell.openPath(dataDir); });
  ipcMain.handle('pick-folder', async () => (await dialog.showOpenDialog(win!, { title: 'Open a Minecraft world folder', properties: ['openDirectory'] })).filePaths[0]);
  // Links to other sites open in the normal browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${port}/`)) e.preventDefault(); });
  await win.webContents.session.cookies.set({ url: `http://127.0.0.1:${port}/`, name: 'me_session', value: key, httpOnly: true, sameSite: 'strict' });
  await win.loadURL(`http://127.0.0.1:${port}/`);
});

app.on('window-all-closed', () => app.quit());
