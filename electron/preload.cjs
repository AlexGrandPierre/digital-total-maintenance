const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendScanRequest: (mode = 'test') => ipcRenderer.send('scan-desktop', { mode }),
  onScanFinished: (callback) => ipcRenderer.on('scan-finished', (_event, data) => callback(data)),
});