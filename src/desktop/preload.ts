// The only thing the page may ask of the desktop shell: show a native folder picker.
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('mapEditorDesktop', {
  pickFolder: (): Promise<string | undefined> => ipcRenderer.invoke('pick-folder'),
});
