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

  moveToReview: (filePath, mode = 'single') =>
    ipcRenderer.invoke('move-to-review', { filePath, mode }),

  moveToArchive: (filePath, mode = 'single') =>
    ipcRenderer.invoke('move-to-archive', { filePath, mode }),

  moveToTrash: (filePath, mode = 'single') =>
    ipcRenderer.invoke('move-to-trash', { filePath, mode }),

  browseForFolder: () => ipcRenderer.invoke('browse-for-folder'),
  browseForCsv: () => ipcRenderer.invoke('browse-for-csv'),
  getActionHistory: (limit = 20) => ipcRenderer.invoke('get-action-history', { limit }),
  restoreFromHistory: (entry) => ipcRenderer.invoke('restore-from-history', { entry }),
  clearActionHistory: () => ipcRenderer.invoke('clear-action-history'),
  runCsvAction: (payload) => ipcRenderer.invoke('csv-action', payload),
  openCsvExportFolder: () => ipcRenderer.invoke('open-csv-export-folder'),

  getDatasetDecisions: () => ipcRenderer.invoke('get-dataset-decisions'),

  saveDatasetDecision: (payload) => ipcRenderer.invoke('save-dataset-decision', payload),

  loadCsvReviewSession: (payload) =>
    ipcRenderer.invoke('load-csv-review-session', payload),
  
  saveCsvReviewSession: (payload) =>
    ipcRenderer.invoke('save-csv-review-session', payload),

  openDtmFolder: () => ipcRenderer.invoke('open-dtm-folder'),

  resetDatasetDecisions: (payload) =>
    ipcRenderer.invoke('reset-dataset-decisions', payload),
});