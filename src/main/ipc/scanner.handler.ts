import { ipcMain } from 'electron';
import type { Orchestrator } from '../services/orchestrator';

export function registerScannerHandlers(orchestrator: Orchestrator): void {
  ipcMain.handle('scanner:pause', () => {
    orchestrator.pause();
    return { success: true };
  });

  ipcMain.handle('scanner:resume', () => {
    orchestrator.resume();
    return { success: true };
  });

  ipcMain.handle('scanner:scan-now', async (_event, scannerName?: string) => {
    await orchestrator.scanNow(scannerName);
    return { success: true };
  });

  ipcMain.handle('scanner:get-full-state', () => {
    return orchestrator.getFullState();
  });
}
