const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendScanRequest: (payload) => ipcRenderer.send('scan-desktop', payload),
  onScanFinished: (callback) =>
    ipcRenderer.on('scan-finished', (_event, data) => callback(data)),

  moveToReview: (filePath) => ipcRenderer.invoke('move-to-review', { filePath }),
  moveToArchive: (filePath) => ipcRenderer.invoke('move-to-archive', { filePath }),
  moveToTrash: (filePath) => ipcRenderer.invoke('move-to-trash', { filePath }),
});