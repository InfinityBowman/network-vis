import { ipcMain } from 'electron';
import type { Orchestrator } from '../services/orchestrator';

export function registerOsHandlers(orchestrator: Orchestrator): void {
  ipcMain.handle('os:nmap-scan', async (_event, ip: string) => {
    return orchestrator.runNmapScan(ip);
  });

  ipcMain.handle('os:nmap-status', async () => {
    return orchestrator.getNmapStatus();
  });
}
