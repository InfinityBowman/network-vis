import { ipcMain } from 'electron';
import type { Orchestrator } from '../services/orchestrator';

export function registerPacketHandlers(orchestrator: Orchestrator): void {
  ipcMain.handle('packet:start', async (_event, options?: { interface?: string }) => {
    return orchestrator.startPacketCapture(options?.interface);
  });

  ipcMain.handle('packet:stop', async () => {
    return orchestrator.stopPacketCapture();
  });

  ipcMain.handle('packet:status', async () => {
    return orchestrator.getPacketStatus();
  });

  ipcMain.handle('packet:get-events', () => {
    return orchestrator.getPacketEvents();
  });
}
