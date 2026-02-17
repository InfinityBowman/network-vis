import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window';

// macOS packaged apps inherit a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin).
// Augment with common tool directories so system commands are found.
const extraPaths = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/local/sbin'];
const currentPath = process.env.PATH || '';
const currentParts = new Set(currentPath.split(':'));
const newParts = extraPaths.filter(p => !currentParts.has(p));
if (newParts.length > 0) {
  process.env.PATH = [...newParts, currentPath].join(':');
}

import { registerAllHandlers } from './ipc';
import { Orchestrator } from './services/orchestrator';

const orchestrator = new Orchestrator();

app.whenReady().then(() => {
  // Register IPC handlers
  registerAllHandlers({ orchestrator });

  // Create window
  const mainWindow = createMainWindow();

  // Track both conditions to avoid sending empty state before scanning completes
  let windowReady = false;
  let scannerReady = false;
  const maybeSendFullState = () => {
    if (windowReady && scannerReady) orchestrator.sendFullState();
  };

  mainWindow.webContents.on('did-finish-load', () => {
    windowReady = true;
    maybeSendFullState();
  });

  orchestrator.start().then(() => {
    scannerReady = true;
    maybeSendFullState();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createMainWindow();
      win.webContents.on('did-finish-load', () => {
        orchestrator.sendFullState();
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  orchestrator.stop();
});
