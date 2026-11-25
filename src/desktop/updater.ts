// Background updates through Squirrel.Windows. Installed copies check the feed at start and every
// four hours, download a newer package in the background and stage it; nothing restarts until the
// user chooses "Restart to install update". Packages are not code-signed and nothing claims they are.
import { app, autoUpdater, ipcMain, type BrowserWindow } from 'electron';
import { updateExe } from './squirrel.js';

export type UpdateState =
  | { state: 'disabled'; reason: string }
  | { state: 'idle' | 'checking' | 'none' | 'downloading'; at?: string }
  | { state: 'ready'; version: string; notes: string }
  | { state: 'error'; message: string };

const REPO = 'https://github.com/Ding-Ding-Projects/map-editor';
const EVERY = 4 * 60 * 60 * 1000;

export function startUpdater(appId: string, getWindow: () => BrowserWindow | undefined, canRestart: () => boolean = () => true) {
  let current: UpdateState = { state: 'idle' };
  const send = (s: UpdateState) => { current = s; getWindow()?.webContents.send('update-state', s); };
  ipcMain.handle('update-state', () => current);

  const feed = process.env.MAP_EDITOR_UPDATE_FEED || `https://ding-ding-projects.github.io/map-editor/updates/${appId}`;
  if (!app.isPackaged || process.platform !== 'win32' || !updateExe()) {
    current = { state: 'disabled', reason: app.isPackaged ? 'Updates are only installed by the Windows installer.' : 'Development run: updates are off.' };
    ipcMain.handle('update-check', () => current);
    ipcMain.handle('update-restart', () => false);
    return;
  }
  if (!feed.startsWith('https://')) { current = { state: 'error', message: 'The update feed must be an https address.' }; return; }
  autoUpdater.setFeedURL({ url: feed });
  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', () => send({ state: 'downloading' }));
  autoUpdater.on('update-not-available', () => send({ state: 'none', at: new Date().toISOString() }));
  autoUpdater.on('update-downloaded', (_e, _notes, name) => {
    const version = String(name || '').replace(/^\D*/, '') || 'new version';
    send({ state: 'ready', version, notes: /^\d/.test(version) ? `${REPO}/releases/tag/v${version}` : `${REPO}/releases/latest` });
  });
  // Feed offline, bad RELEASES or a package whose hash does not match: keep running this version.
  autoUpdater.on('error', (e) => { if (current.state !== 'ready') send({ state: 'error', message: e.message.split('\n')[0].slice(0, 300) }); });
  const check = () => { if (current.state === 'checking' || current.state === 'downloading' || current.state === 'ready') return; try { autoUpdater.checkForUpdates(); } catch (e) { send({ state: 'error', message: (e as Error).message }); } };
  ipcMain.handle('update-check', () => { check(); return current; });
  ipcMain.handle('update-restart', () => { if (current.state !== 'ready' || !canRestart()) return false; autoUpdater.quitAndInstall(); return true; });
  setTimeout(check, 10_000);
  setInterval(check, EVERY).unref?.();
}
