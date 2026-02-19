import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  scanner: {
    pause: () => ipcRenderer.invoke('scanner:pause'),
    resume: () => ipcRenderer.invoke('scanner:resume'),
    scanNow: (name?: string) => ipcRenderer.invoke('scanner:scan-now', name),
    getFullState: () => ipcRenderer.invoke('scanner:get-full-state'),
  },

  packet: {
    start: (options?: { interface?: string }) => ipcRenderer.invoke('packet:start', options),
    stop: () => ipcRenderer.invoke('packet:stop'),
    status: () => ipcRenderer.invoke('packet:status'),
    getEvents: () => ipcRenderer.invoke('packet:get-events'),
  },

  os: {
    nmapScan: (ip: string) => ipcRenderer.invoke('os:nmap-scan', ip),
    nmapStatus: () => ipcRenderer.invoke('os:nmap-status'),
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
    packetEvent: (callback: (data: any) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('packet:event', handler);
      return () => ipcRenderer.removeListener('packet:event', handler);
    },
    topologyUpdate: (callback: (data: any) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('topology:update', handler);
      return () => ipcRenderer.removeListener('topology:update', handler);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronAPI);

export type ElectronAPI = typeof electronAPI;
