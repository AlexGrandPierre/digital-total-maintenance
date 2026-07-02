const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

function getBundledPythonPath(name) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bundled-python', name);
  }

  return path.join(__dirname, '..', 'modules', `${name}.py`);
}

function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'build', 'icon.png')
    : path.join(__dirname, '..', 'build', 'icon.png');

  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    win.loadURL('http://localhost:5173');
  }
}

function spawnPythonScript(scriptPath, args = []) {
  const command = app.isPackaged ? scriptPath : 'python3';
  const commandArgs = app.isPackaged ? args : [scriptPath, ...args];

  console.log('Launching Python helper:', {
    packaged: app.isPackaged,
    command,
    commandArgs,
  });

  return spawn(command, commandArgs);
}

function runPythonScript(scriptPath, args = []) {
  return new Promise((resolve) => {
    const command = app.isPackaged ? scriptPath : 'python3';
    const commandArgs = app.isPackaged ? args : [scriptPath, ...args];

    const py = spawn(command, commandArgs);

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
    const historyScriptPath = getBundledPythonPath('action_history');

    const py = spawnPythonScript(historyScriptPath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
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
        console.error('Failed to parse action history:', errorOutput || output);
        resolve([]);
      }
    });

    py.on('error', (err) => {
      console.error('Failed to launch action history:', err.message);
      resolve([]);
    });
  });
}

function getAppDataPath() {
  return app.getPath('userData');
}

function getDtmDesktopRoot() {
  const root = path.join(app.getPath('desktop'), 'Digital Total Maintenance');
  const localHistory = path.join(root, 'Local Action History');
  const exportsDir = path.join(root, 'Exports');

  fs.mkdirSync(localHistory, { recursive: true });
  fs.mkdirSync(exportsDir, { recursive: true });

  return {
    root,
    localHistory,
    exportsDir,
  };
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.on('scan-desktop', (event, payload = {}) => {
    const preset = payload.preset || 'test';
    const customPath = (payload.customPath || '').trim();
    const scanPath = getBundledPythonPath('scan');
    const csvPath = (payload.csvPath || '').trim();
    const csvScanPath = getBundledPythonPath('csv_scan');

    let targetPath;

    if (preset === 'csv') {
      if (!csvPath || !fs.existsSync(csvPath)) {
        event.sender.send('scan-finished', {
          output: JSON.stringify({
            type: 'csv_scan',
            success: false,
            path: csvPath,
            error: csvPath
              ? `CSV file does not exist: ${csvPath}`
              : 'No CSV file path was provided.',
          }),
        });
        return;
      }

      const py = spawnPythonScript(csvScanPath, [csvPath]);

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

            if (parsed.type === 'csv_progress') {
              event.sender.send('scan-progress', parsed);
            } else {
              finalResult = parsed;
            }
          } catch {
            // ignore malformed lines
          }
        }
      });

      py.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      py.on('close', () => {
        event.sender.send('scan-finished', {
          output:
            finalResult
              ? JSON.stringify(finalResult)
              : JSON.stringify({
                  type: 'csv',
                  success: false,
                  path: csvPath,
                  error: errorOutput || 'CSV scan failed.',
                }),
        });
      });

      py.on('error', (err) => {
        event.sender.send('scan-finished', {
          output: JSON.stringify({
            type: 'csv',
            success: false,
            path: csvPath,
            error: err.message,
          }),
        });
      });

      return;
    }

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

    const py = spawnPythonScript(scanPath, [targetPath]);

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

  ipcMain.handle('browse-for-csv', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'CSV Files',
          extensions: ['csv'],
        },
      ],
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
    const filePath = payload.filePath;
    const filePaths = payload.filePaths || [];
    const mode = payload.mode || 'single';
    const actionTarget = mode === 'batch' ? JSON.stringify(filePaths) : filePath;
    
    if (mode !== 'batch' && !filePath) {
      return {
        success: false,
        message: 'No file path provided.',
      };
    }

    const result = await runPythonScript(reviewActionPath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
      actionTarget,
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
    const actionPath = getBundledPythonPath('archive_action');
  
    const filePath = payload.filePath;
    const filePaths = payload.filePaths || [];
    const mode = payload.mode || 'single';
    const actionTarget = mode === 'batch' ? JSON.stringify(filePaths) : filePath;
  
    if (mode !== 'batch' && !filePath) {
      return {
        success: false,
        message: 'No file path provided.',
      };
    }
  
    const result = await runPythonScript(actionPath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
      actionTarget,
      mode,
    ]);
  
    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message:
          result.errorOutput ||
          result.output ||
          'Failed to parse archive action result.',
      };
    }
  });

  ipcMain.handle('move-to-trash', async (_event, payload = {}) => {
    const trashActionPath = getBundledPythonPath('trash_action');
    const filePath = payload.filePath;
    const filePaths = payload.filePaths || [];
    const mode = payload.mode || 'single';
    const actionTarget = mode === 'batch' ? JSON.stringify(filePaths) : filePath;

    if (!filePath) {
      return {
        success: false,
        message: 'No file path provided.',
      };
    }

    const result = await runPythonScript(trashActionPath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
      actionTarget,
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
    const historyPath = getBundledPythonPath('action_history');

    const result = await runPythonScript(historyPath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
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
    const restoreActionPath = getBundledPythonPath('restore_action');
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
      '--dtm-root',
      getDtmDesktopRoot().root,
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
    const historyPath = path.join(
      getDtmDesktopRoot().localHistory,
      'action-history.json'
    );
  
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

  ipcMain.handle('csv-action', async (_event, payload = {}) => {
    const csvActionPath = getBundledPythonPath('csv_action');
  
    const tempDir = path.join(getAppDataPath(), 'tmp');
    fs.mkdirSync(tempDir, { recursive: true });
  
    const payloadPath = path.join(
      tempDir,
      `csv-action-payload-${Date.now()}.json`
    );
  
    fs.writeFileSync(payloadPath, JSON.stringify(payload), 'utf-8');
  
    const result = await runPythonScript(csvActionPath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
      '--payload-file',
      payloadPath,
    ]);
  
    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message:
          result.errorOutput ||
          result.output ||
          'Failed to parse CSV action result.',
      };
    } finally {
      try {
        if (fs.existsSync(payloadPath)) {
          fs.unlinkSync(payloadPath);
        }
      } catch {
        // ignore cleanup failure
      }
    }
  });

  ipcMain.handle('open-dtm-folder', async () => {
    try {
      const root = getDtmDesktopRoot().root;
  
      await shell.openPath(root);
  
      return {
        success: true,
        path: root,
        message: `Opened DTM folder: ${root}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to open DTM folder.',
      };
    }
  });

  ipcMain.handle('open-csv-export-folder', async () => {
    const { exportsDir } = getDtmDesktopRoot();
  
    try {
      await shell.openPath(exportsDir);
  
      return {
        success: true,
        message: `Opened export folder: ${exportsDir}`,
        path: exportsDir,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to open CSV export folder.',
        path: exportsDir,
      };
    }
  });

  ipcMain.handle('get-dataset-decisions', async () => {
    const decisionPath = getBundledPythonPath('dataset_decision');
  
    const result = await runPythonScript(decisionPath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
      'read',
    ]);
  
    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        decisions: {},
        message: result.errorOutput || result.output || 'Failed to read dataset decisions.',
      };
    }
  });
  
  ipcMain.handle('save-dataset-decision', async (_event, payload = {}) => {
    const decisionPath = getBundledPythonPath('dataset_decision');
  
    const result = await runPythonScript(decisionPath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
      'save',
      JSON.stringify(payload),
    ]);
  
    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message: result.errorOutput || result.output || 'Failed to save dataset decision.',
      };
    }
  });

  ipcMain.handle('load-csv-review-session', async (_event, payload = {}) => {
    const sessionPath = getBundledPythonPath('csv_review_session');
  
    const result = await runPythonScript(sessionPath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
      'load',
      JSON.stringify(payload),
    ]);
  
    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message:
          result.errorOutput ||
          result.output ||
          'Failed to load CSV review session.',
      };
    }
  });

  ipcMain.handle('reset-dataset-decisions', async (_event, payload = {}) => {
    const datasetDecisionPath = getBundledPythonPath('dataset_decision');
  
    const result = await runPythonScript(datasetDecisionPath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
      'reset_csv',
      JSON.stringify(payload),
    ]);
  
    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message:
          result.errorOutput ||
          result.output ||
          'Failed to parse dataset reset result.',
      };
    }
  });
  
  ipcMain.handle('save-csv-review-session', async (_event, payload = {}) => {
    const sessionPath = getBundledPythonPath('csv_review_session');
  
    const payloadPath = path.join(
      getAppDataPath(),
      `csv-review-session-save-${Date.now()}.json`
    );
  
    fs.writeFileSync(payloadPath, JSON.stringify(payload), 'utf-8');
  
    const result = await runPythonScript(sessionPath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
      '--payload-file',
      payloadPath,
      'save',
    ]);
  
    try {
      fs.unlinkSync(payloadPath);
    } catch {}
  
    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message:
          result.errorOutput ||
          result.output ||
          'Failed to save CSV review session.',
      };
    }
  });

  ipcMain.handle('load-more-duplicate-groups', async (_event, payload = {}) => {
    const csvReviewIndexPath = getBundledPythonPath('csv_review_index');
  
    const result = await runPythonScript(csvReviewIndexPath, [
      'duplicates',
      JSON.stringify(payload),
    ]);
  
    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message:
          result.errorOutput ||
          result.output ||
          'Failed to parse duplicate review index result.',
        items: [],
      };
    }
  });
  
  ipcMain.handle('load-more-suspicious-values', async (_event, payload = {}) => {
    const csvReviewIndexPath = getBundledPythonPath('csv_review_index');
  
    const result = await runPythonScript(csvReviewIndexPath, [
      'suspicious',
      JSON.stringify(payload),
    ]);
  
    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message:
          result.errorOutput ||
          result.output ||
          'Failed to parse suspicious review index result.',
        items: [],
      };
    }
  });

  ipcMain.handle('bulk-file-action', async (_event, payload = {}) => {
    const batchActionPath = getBundledPythonPath('batch_action');
  
    const tempDir = path.join(getAppDataPath(), 'tmp');
    fs.mkdirSync(tempDir, { recursive: true });
  
    const payloadPath = path.join(
      tempDir,
      `batch-action-payload-${Date.now()}.json`
    );
  
    fs.writeFileSync(payloadPath, JSON.stringify(payload), 'utf-8');
  
    const result = await runPythonScript(batchActionPath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
      '--payload-file',
      payloadPath,
    ]);
  
    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message:
          result.errorOutput ||
          result.output ||
          'Failed to parse batch action result.',
      };
    } finally {
      try {
        if (fs.existsSync(payloadPath)) {
          fs.unlinkSync(payloadPath);
        }
      } catch {
        // ignore cleanup failure
      }
    }
  });

  ipcMain.handle('bulk-restore-from-history', async (_event, payload = {}) => {
    const batchRestorePath = getBundledPythonPath('batch_restore');
  
    const tempDir = path.join(getAppDataPath(), 'tmp');
    fs.mkdirSync(tempDir, { recursive: true });
  
    const payloadPath = path.join(
      tempDir,
      `batch-restore-payload-${Date.now()}.json`
    );
  
    fs.writeFileSync(payloadPath, JSON.stringify(payload), 'utf-8');
  
    const result = await runPythonScript(batchRestorePath, [
      '--app-data',
      getAppDataPath(),
      '--dtm-root',
      getDtmDesktopRoot().root,
      '--payload-file',
      payloadPath,
    ]);
  
    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message:
          result.errorOutput ||
          result.output ||
          'Failed to parse batch restore result.',
      };
    } finally {
      try {
        if (fs.existsSync(payloadPath)) {
          fs.unlinkSync(payloadPath);
        }
      } catch {
        // ignore cleanup failure
      }
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});