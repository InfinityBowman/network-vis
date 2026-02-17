import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  scanner: {
    pause: () => ipcRenderer.invoke('scanner:pause'),
    resume: () => ipcRenderer.invoke('scanner:resume'),
    scanNow: (name?: string) => ipcRenderer.invoke('scanner:scan-now', name),
    getFullState: () => ipcRenderer.invoke('scanner:get-full-state'),
  },

  on: {
    scannerUpdate: (callback: (data: any) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('scanner:update', handler);
      return () => ipcRenderer.removeListener('scanner:update', handler);
    },
    scannerFullState: (callback: (data: any) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('scanner:full-state', handler);
      return () => ipcRenderer.removeListener('scanner:full-state', handler);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronAPI);

export type ElectronAPI = typeof electronAPI;
