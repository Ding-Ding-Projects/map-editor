// What the page may ask of the desktop shell: a native folder picker and the update status.
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('mapEditorDesktop', {
  pickFolder: (): Promise<string | undefined> => ipcRenderer.invoke('pick-folder'),
  openDataFolder: (p: string): Promise<string> => ipcRenderer.invoke('open-data-folder', p),
  editors: (): Promise<Array<{ id: string; name: string }>> => ipcRenderer.invoke('editors'),
  openInEditor: (id: string, folder: string): Promise<string> => ipcRenderer.invoke('open-in-editor', id, folder),
  updates: {
    state: () => ipcRenderer.invoke('update-state'),
    check: () => ipcRenderer.invoke('update-check'),
    restart: () => ipcRenderer.invoke('update-restart'),
    onState: (fn: (s: unknown) => void) => { ipcRenderer.on('update-state', (_e, s) => fn(s)); },
  },
});
