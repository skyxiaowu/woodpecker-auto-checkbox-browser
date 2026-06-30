const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  executeInAllFrames: (guestWebContentsId, script, mode = 'all') =>
    ipcRenderer.invoke('webview:execute-in-all-frames', guestWebContentsId, script, mode)
});
