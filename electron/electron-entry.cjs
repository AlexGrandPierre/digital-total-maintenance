const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

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

app.whenReady().then(() => {
  createWindow();

  ipcMain.on('scan-desktop', (event, payload = {}) => {
    const preset = payload.preset || 'test';
    const customPath = (payload.customPath || '').trim();
    const scanPath = path.join(__dirname, '..', 'modules', 'scan.py');

    let targetPath;

    switch (preset) {
      case 'desktop':
        targetPath = path.join(os.homedir(), 'Desktop');
        break;
      case 'downloads':
        targetPath = path.join(os.homedir(), 'Downloads');
        break;
      case 'documents':
        targetPath = path.join(os.homedir(), 'Documents');
        break;
      case 'custom':
        targetPath = customPath;
        break;
      case 'test':
      default:
        targetPath = path.join(os.homedir(), 'Desktop', 'dtm-test-folder');
        break;
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

    if (!filePath) {
      return {
        success: false,
        message: 'No file path provided.',
      };
    }

    const result = await runPythonScript(reviewActionPath, [filePath]);

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

    if (!filePath) {
      return {
        success: false,
        message: 'No file path provided.',
      };
    }

    const result = await runPythonScript(archiveActionPath, [filePath]);

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

    if (!filePath) {
      return {
        success: false,
        message: 'No file path provided.',
      };
    }

    const result = await runPythonScript(trashActionPath, [filePath]);

    try {
      return JSON.parse(result.output || '{}');
    } catch {
      return {
        success: false,
        message: result.errorOutput || result.output || 'Failed to parse trash action result.',
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