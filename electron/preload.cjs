const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onScanFinished: (callback) => ipcRenderer.on('scan-finished', (_, data) => callback(data)),
  receive: (channel, func) => {
    const validChannels = ['zip-extracted'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => func(...args));
    }
  }
});
