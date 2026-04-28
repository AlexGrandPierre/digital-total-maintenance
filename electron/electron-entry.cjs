const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL('http://localhost:5173');
}

function runPythonScript(scriptPath, args = []) {
  return new Promise((resolve) => {
    const py = spawn('python3', [scriptPath, ...args]);

    let output = '';
    let errorOutput = '';

    py.stdout.on('data', (data) => {
      output += data.toString();
    });

    py.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    py.on('close', (code) => {
      resolve({
        code,
        output: output.trim(),
        errorOutput: errorOutput.trim(),
      });
    });

    py.on('error', (err) => {
      resolve({
        code: 1,
        output: '',
        errorOutput: err.message,
      });
    });
  });
}

function readActionHistory(limit = 20) {
  return new Promise((resolve) => {
    const historyScriptPath = path.join(__dirname, '..', 'modules', 'action_history.py');
    const py = spawn('python3', [
      historyScriptPath,
      '--app-data',
      getAppDataPath(),
      String(limit),
      'read',
    ]);

    let output = '';
    let errorOutput = '';

    py.stdout.on('data', (data) => {
      output += data.toString();
    });

    py.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    py.on('close', () => {
      try {
        resolve(JSON.parse(output || '[]'));
      } catch {
        resolve([]);
      }
    });

    py.on('error', () => {
      resolve([]);
    });
  });
}

function getAppDataPath() {
  return app.getPath('userData');
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.on('scan-desktop', (event, payload = {}) => {
    const preset = payload.preset || 'test';
    const customPath = (payload.customPath || '').trim();
    const scanPath = path.join(__dirname, '..', 'modules', 'scan.py');

    let targetPath;

    switch (preset) {
      case 'desktop':
        targetPath = app.getPath('desktop');
        break;
      case 'downloads':
        targetPath = app.getPath('downloads');
        break;
      case 'documents':
        targetPath = app.getPath('documents');
        break;
      case 'custom':
        targetPath = customPath;
        break;
      case 'test':
      default:
        targetPath = path.join(app.getPath('desktop'), 'dtm-test-folder');
        break;
    }

    if (!targetPath || typeof targetPath !== 'string') {
      event.sender.send('scan-finished', {
        output: JSON.stringify({
          scanned_at: new Date().toISOString(),
          folder: targetPath || '',
          mode: 'error',
          scan_warnings: ['No valid scan target was provided.'],
          total_files: 0,
          review_files: [],
          review_total: 0,
          system_files: [],
          system_total: 0,
          archive_candidates: [],
          archive_total: 0,
          remove_candidates: [],
          remove_total: 0,
          duplicates: [],
          duplicates_total: 0,
          age_buckets: { '<30d': 0, '30-180d': 0, '>180d': 0 },
          by_ext: {},
          errors: [
            {
              name: '',
              path: targetPath || '',
              error_type: 'invalid_scan_target',
              error: 'No valid scan target was provided.',
            },
          ],
          errors_total: 1,
          excluded_dirs_count: 0,
          detail_caps: {},
          scan_insights: {
            queue_summary: [],
            review_context_summary: [],
            archive_context_summary: [],
            remove_context_summary: [],
            top_review_reasons: [],
            pattern_previews: {},
          },
        }),
      });
      return;
    }

    if (!fs.existsSync(targetPath)) {
      event.sender.send('scan-finished', {
        output: JSON.stringify({
          scanned_at: new Date().toISOString(),
          folder: targetPath,
          mode: 'error',
          scan_warnings: [`Scan target does not exist: ${targetPath}`],
          total_files: 0,
          review_files: [],
          review_total: 0,
          system_files: [],
          system_total: 0,
          archive_candidates: [],
          archive_total: 0,
          remove_candidates: [],
          remove_total: 0,
          duplicates: [],
          duplicates_total: 0,
          age_buckets: { '<30d': 0, '30-180d': 0, '>180d': 0 },
          by_ext: {},
          errors: [
            {
              name: '',
              path: targetPath,
              error_type: 'invalid_scan_target',
              error: `Scan target does not exist: ${targetPath}`,
            },
          ],
          errors_total: 1,
          excluded_dirs_count: 0,
          detail_caps: {},
          scan_insights: {
            queue_summary: [],
            review_context_summary: [],
            archive_context_summary: [],
            remove_context_summary: [],
            top_review_reasons: [],
            pattern_previews: {},
          },
        }),
      });
      return;
    }

    const py = spawn('python3', [scanPath, targetPath]);

    let buffer = '';
    let errorOutput = '';
    let finalResult = null;

    py.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed);

          if (parsed.type === 'progress') {
            event.sender.send('scan-progress', parsed);
          } else if (parsed.type === 'final') {
            finalResult = parsed.result;
          }
        } catch {
          // ignore malformed progress lines
        }
      }
    });

    py.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    py.on('close', (code) => {
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim());
          if (parsed.type === 'final') {
            finalResult = parsed.result;
          }
        } catch {
          // ignore trailing malformed data
        }
      }

      event.sender.send('scan-finished', {
        output:
          finalResult
            ? JSON.stringify(finalResult)
            : [errorOutput]
                .filter(Boolean)
                .join('\n')
                .trim() || `Scan exited with code ${code} but produced no output.`,
      });
    });

    py.on('error', (err) => {
      event.sender.send('scan-finished', {
        output: `Failed to launch scanner: ${err.message}`,
      });
    });
  });

  ipcMain.handle('browse-for-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });

    if (result.canceled || !result.filePaths.length) {
      return {
        success: false,
        path: '',
      };
    }

    return {
      success: true,
      path: result.filePaths[0],
    };
  });

  ipcMain.handle('move-to-review', async (_event, payload = {}) => {
    const reviewActionPath = path.join(__dirname, '..', 'modules', 'review_action.py');
    const filePath = payload.filePath;
    const mode = payload.mode || 'single';

    if (!filePath) {
      return {
        success: false,
        message: 'No file path provided.',
      };
    }

    const result = await runPythonScript(reviewActionPath, [
      '--app-data',
      getAppDataPath(),
      filePath,
      mode,
    ]);

    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message: result.errorOutput || result.output || 'Failed to parse action result.',
      };
    }
  });

  ipcMain.handle('move-to-archive', async (_event, payload = {}) => {
    const archiveActionPath = path.join(__dirname, '..', 'modules', 'archive_action.py');
    const filePath = payload.filePath;
    const mode = payload.mode || 'single';

    if (!filePath) {
      return {
        success: false,
        message: 'No file path provided.',
      };
    }

    const result = await runPythonScript(archiveActionPath, [
      '--app-data',
      getAppDataPath(),
      filePath,
      mode,
    ]);

    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message: result.errorOutput || result.output || 'Failed to parse archive action result.',
      };
    }
  });

  ipcMain.handle('move-to-trash', async (_event, payload = {}) => {
    const trashActionPath = path.join(__dirname, '..', 'modules', 'trash_action.py');
    const filePath = payload.filePath;
    const mode = payload.mode || 'single';

    if (!filePath) {
      return {
        success: false,
        message: 'No file path provided.',
      };
    }

    const result = await runPythonScript(trashActionPath, [
      '--app-data',
      getAppDataPath(),
      filePath,
      mode,
    ]);

    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message: result.errorOutput || result.output || 'Failed to parse trash action result.',
      };
    }
  });

  ipcMain.handle('get-action-history', async (_event, payload = {}) => {
    const limit = Number(payload.limit || 20);
    const historyPath = path.join(__dirname, '..', 'modules', 'action_history.py');

    const result = await runPythonScript(historyPath, [
      '--app-data',
      getAppDataPath(),
      String(limit),
      'read',
    ]);

    try {
      return JSON.parse(result.output || '[]');
    } catch {
      return [];
    }
  });

  ipcMain.handle('restore-from-history', async (_event, payload = {}) => {
    const restoreActionPath = path.join(__dirname, '..', 'modules', 'restore_action.py');
    const entry = payload.entry;

    if (!entry) {
      return {
        success: false,
        message: 'No history entry provided.',
      };
    }

    const result = await runPythonScript(restoreActionPath, [
      '--app-data',
      getAppDataPath(),
      JSON.stringify(entry),
    ]);

    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message: result.errorOutput || result.output || 'Failed to parse restore action result.',
      };
    }
  });

  ipcMain.handle('clear-action-history', async () => {
    const fs = require('fs');
    const historyPath = path.join(app.getPath('userData'), 'action-history.json');
  
    try {
      if (fs.existsSync(historyPath)) {
        fs.unlinkSync(historyPath);
      }
  
      return {
        success: true,
        message: `Cleared local action history at: ${historyPath}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to clear action history.',
      };
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});