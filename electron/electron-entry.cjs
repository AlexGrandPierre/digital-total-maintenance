const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  win.loadURL('http://localhost:5173');
}

ipcMain.handle('scan-desktop', async () => {
  const scanPath = path.join(__dirname, '..', 'modules', 'desktop-scan', 'scan.py');
  const workingDir = path.dirname(scanPath);

  return new Promise((resolve, reject) => {
    const py = spawn('python3', [scanPath], { cwd: workingDir });

    let output = '';
    py.stdout.on('data', data => output += data.toString());
    py.stderr.on('data', data => output += data.toString());

    py.on('close', code => {
      resolve({ code, output: output.trim() });
    });

    py.on('error', reject);
  });
});

app.whenReady().then(createWindow);