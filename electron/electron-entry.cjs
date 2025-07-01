const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const unzipper = require('unzipper');
const { spawn } = require('child_process');

const ZIP_DIR = path.join(__dirname, '..', 'zips');
const EXTRACT_DIR = path.join(__dirname, '..', 'extracted');

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

  watchForZipDrops(win);
}

function watchForZipDrops(win) {
  if (!fs.existsSync(ZIP_DIR)) fs.mkdirSync(ZIP_DIR);
  if (!fs.existsSync(EXTRACT_DIR)) fs.mkdirSync(EXTRACT_DIR);

  chokidar.watch(ZIP_DIR, { ignoreInitial: true }).on('add', async filePath => {
    if (path.extname(filePath) !== '.zip') return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = path.basename(filePath, '.zip');
    const targetDir = path.join(EXTRACT_DIR, `${baseName}_${timestamp}`);

    fs.mkdirSync(targetDir);
    fs.createReadStream(filePath)
      .pipe(unzipper.Extract({ path: targetDir }))
      .on('close', () => {
        win.webContents.send('zip-extracted', {
          original: path.basename(filePath),
          extractedTo: targetDir,
          timestamp
        });

        runScanScript(targetDir, win);
      });
  });
}

function runScanScript(dir, win) {
  const scanPath = path.join(dir, 'scan.py');
  if (fs.existsSync(scanPath)) {
    const py = spawn('python3', [scanPath], { cwd: dir });

    let output = '';
    py.stdout.on('data', (data) => { output += data.toString(); });
    py.stderr.on('data', (data) => { output += data.toString(); });

    py.on('close', (code) => {
      win.webContents.send('scan-finished', {
        dir,
        code,
        output: output.trim()
      });
    });
  }
}

app.whenReady().then(createWindow);