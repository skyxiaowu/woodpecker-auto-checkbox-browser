const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  executeInAllFrames: (guestWebContentsId, script, mode = 'all') =>
    ipcRenderer.invoke('webview:execute-in-all-frames', guestWebContentsId, script, mode),
  setWebviewSize: (guestWebContentsId, width, height) =>
    ipcRenderer.invoke('webview:set-size', guestWebContentsId, width, height),
  setWebviewZoom: (guestWebContentsId, factor) =>
    ipcRenderer.invoke('webview:set-zoom', guestWebContentsId, factor)
});
