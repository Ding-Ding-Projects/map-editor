import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('deploy', {
  instances: () => ipcRenderer.invoke('instances'),
  lan: () => ipcRenderer.invoke('lan'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFile: (exts: string[]) => ipcRenderer.invoke('pick-file', exts),
  docker: (o: unknown) => ipcRenderer.invoke('deploy-docker', o),
  virtualbox: (o: unknown) => ipcRenderer.invoke('deploy-virtualbox', o),
  disks: () => ipcRenderer.invoke('disks'),
  flash: (image: string, disk: string, typed: string) => ipcRenderer.invoke('flash', image, disk, typed),
  open: (url: string) => ipcRenderer.invoke('open', url),
  state: (name: string) => ipcRenderer.invoke('state', name),
  action: (name: string, action: string, deleteData = false) => ipcRenderer.invoke('action', name, action, deleteData),
  logsStart: (name: string) => ipcRenderer.invoke('logs-start', name),
  logsStop: () => ipcRenderer.invoke('logs-stop'),
  onLog: (fn: (line: string) => void) => ipcRenderer.on('log-line', (_e, l) => fn(l)),
  onProgress: (fn: (steps: unknown) => void) => ipcRenderer.on('progress', (_e, s) => fn(s)),
  onFlash: (fn: (w: number, t: number) => void) => ipcRenderer.on('flash-progress', (_e, w, t) => fn(w, t)),
});
