// What the page may ask of the desktop shell: a native folder picker and the update status.
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('mapEditorDesktop', {
  pickFolder: (): Promise<string | undefined> => ipcRenderer.invoke('pick-folder'),
  openDataFolder: (p: string): Promise<string> => ipcRenderer.invoke('open-data-folder', p),
  editors: (): Promise<Array<{ id: string; name: string }>> => ipcRenderer.invoke('editors'),
  openInEditor: (id: string, folder: string): Promise<string> => ipcRenderer.invoke('open-in-editor', id, folder),
  dataFolder: (): Promise<{ path: string; bytes: number; files: number; worlds: string; worldsFolders: string[]; isDefault: boolean; defaultPath: string }> => ipcRenderer.invoke('data-folder'),
  moveDataFolder: (toDefault: boolean): Promise<{ ok: boolean; message: string; files?: number }> => ipcRenderer.invoke('move-data-folder', toDefault),
  onDataMove: (fn: (done: number, total: number) => void) => { ipcRenderer.on('data-move-progress', (_e, done, total) => fn(done, total)); },
  worldsFolder: (remove?: string): Promise<{ folders: string[]; error?: string }> => ipcRenderer.invoke('worlds-folder', remove),
  relaunch: (): Promise<void> => ipcRenderer.invoke('relaunch'),
  rememberName: (name: string): Promise<string> => ipcRenderer.invoke('window-name', name),
  openDataRoot: (): Promise<string> => ipcRenderer.invoke('open-data-root'),
  titleBarColors: (color: string, symbolColor: string): Promise<void> => ipcRenderer.invoke('title-bar-colors', color, symbolColor),
  updates: {
    state: () => ipcRenderer.invoke('update-state'),
    check: () => ipcRenderer.invoke('update-check'),
    restart: () => ipcRenderer.invoke('update-restart'),
    onState: (fn: (s: unknown) => void) => { ipcRenderer.on('update-state', (_e, s) => fn(s)); },
  },
});
