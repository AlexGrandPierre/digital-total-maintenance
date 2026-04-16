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

app.whenReady().then(() => {
  createWindow();

  ipcMain.on('scan-desktop', (event, payload = {}) => {
    const mode = payload.mode || 'test';
    const scanPath = path.join(__dirname, '..', 'modules', 'scan.py');

    const targetPath =
      mode === 'desktop'
        ? path.join(os.homedir(), 'Desktop')
        : path.join(os.homedir(), 'Desktop', 'dtm-test-folder');

    const py = spawn('python3', [scanPath, targetPath]);

    let output = '';
    let errorOutput = '';

    py.stdout.on('data', (data) => {
      output += data.toString();
    });

    py.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    py.on('close', (code) => {
      event.sender.send('scan-finished', {
        output:
          (output + '\n' + errorOutput).trim() ||
          `Scan exited with code ${code} but produced no output.`,
      });
    });

    py.on('error', (err) => {
      event.sender.send('scan-finished', {
        output: `Failed to launch scanner: ${err.message}`,
      });
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});