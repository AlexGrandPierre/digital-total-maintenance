const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendScanRequest: (payload) => ipcRenderer.send('scan-desktop', payload),

  onScanFinished: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('scan-finished', handler);
    return () => ipcRenderer.removeListener('scan-finished', handler);
  },

  onScanProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('scan-progress', handler);
    return () => ipcRenderer.removeListener('scan-progress', handler);
  },

  moveToReview: (filePath) => ipcRenderer.invoke('move-to-review', { filePath }),
  moveToArchive: (filePath) => ipcRenderer.invoke('move-to-archive', { filePath }),
  moveToTrash: (filePath) => ipcRenderer.invoke('move-to-trash', { filePath }),
  browseForFolder: () => ipcRenderer.invoke('browse-for-folder'),
});