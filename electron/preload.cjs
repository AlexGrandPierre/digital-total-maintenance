/**
 * preload.cjs
 *
 * Secure renderer bridge for Digital Total Maintenance.
 *
 * Responsibilities:
 * - Expose approved Electron IPC actions to the renderer
 * - Forward renderer requests to the Electron main process
 * - Subscribe to scan progress and completion events
 * - Keep Node/Electron internals isolated from frontend code
 *
 * This module DOES NOT:
 * - Execute filesystem actions directly
 * - Run Python modules
 * - Contain application business logic
 * - Manage renderer state
 *
 * Used by:
 * React frontend through window.electronAPI
 *
 * Outputs:
 * A constrained electronAPI interface exposed through contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  
  // ===========================================================================
  // Filesystem Scan
  // ===========================================================================

  sendScanRequest: (payload) =>
    ipcRenderer.send('scan-desktop', payload),

  onScanFinished: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('scan-finished', handler);

    return () =>
      ipcRenderer.removeListener('scan-finished', handler);
  },

  onScanProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('scan-progress', handler);

    return () =>
      ipcRenderer.removeListener('scan-progress', handler);
  },

  // ===========================================================================
  // Filesystem Actions
  // ===========================================================================

  moveToReview: (filePath, mode = 'single') =>
    ipcRenderer.invoke('move-to-review', { filePath, mode }),

  moveToArchive: (filePath, mode = 'single') =>
    ipcRenderer.invoke('move-to-archive', { filePath, mode }),

  moveToTrash: (filePath, mode = 'single') =>
    ipcRenderer.invoke('move-to-trash', { filePath, mode }),

  bulkFileAction: (payload) =>
    ipcRenderer.invoke('bulk-file-action', payload),

  // ===========================================================================
  // Browsing and Workspace Access
  // ===========================================================================

  browseForFolder: () =>
    ipcRenderer.invoke('browse-for-folder'),

  browseForCsv: () =>
    ipcRenderer.invoke('browse-for-csv'),

  openDtmFolder: () =>
    ipcRenderer.invoke('open-dtm-folder'),

  openCsvExportFolder: () =>
    ipcRenderer.invoke('open-csv-export-folder'),

  // ===========================================================================
  // Action History and Restore
  // ===========================================================================

  getActionHistory: (limit = 20) =>
    ipcRenderer.invoke('get-action-history', { limit }),

  restoreFromHistory: (entry) =>
    ipcRenderer.invoke('restore-from-history', { entry }),

  bulkRestoreFromHistory: (payload) =>
    ipcRenderer.invoke('bulk-restore-from-history', payload),

  clearActionHistory: () =>
    ipcRenderer.invoke('clear-action-history'),

  // ===========================================================================
  // CSV Actions and Review Persistence
  // ===========================================================================

  runCsvAction: (payload) =>
    ipcRenderer.invoke('csv-action', payload),

  getDatasetDecisions: () =>
    ipcRenderer.invoke('get-dataset-decisions'),

  saveDatasetDecision: (payload) =>
    ipcRenderer.invoke('save-dataset-decision', payload),

  resetDatasetDecisions: (payload) =>
    ipcRenderer.invoke('reset-dataset-decisions', payload),

  loadCsvReviewSession: (payload) =>
    ipcRenderer.invoke('load-csv-review-session', payload),

  saveCsvReviewSession: (payload) =>
    ipcRenderer.invoke('save-csv-review-session', payload),

  // ===========================================================================
  // CSV Review Pagination
  // ===========================================================================

  loadMoreDuplicateGroups: (payload) =>
    ipcRenderer.invoke('load-more-duplicate-groups', payload),

  loadMoreSuspiciousValues: (payload) =>
    ipcRenderer.invoke('load-more-suspicious-values', payload),
});