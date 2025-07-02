const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanDesktop: () => ipcRenderer.invoke('scan-desktop')
});

