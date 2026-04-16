const { app, BrowserWindow, ipcMain } = require('electron');
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

  ipcMain.on('scan-desktop', async (event, payload = {}) => {
    const mode = payload.mode || 'test';
    const scanPath = path.join(__dirname, '..', 'modules', 'scan.py');

    const targetPath =
      mode === 'desktop'
        ? path.join(os.homedir(), 'Desktop')
        : path.join(os.homedir(), 'Desktop', 'dtm-test-folder');

    const result = await runPythonScript(scanPath, [targetPath]);

    event.sender.send('scan-finished', {
      output:
        [result.output, result.errorOutput]
          .filter(Boolean)
          .join('\n')
          .trim() || `Scan exited with code ${result.code} but produced no output.`,
    });
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