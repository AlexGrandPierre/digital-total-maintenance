const { app, BrowserWindow } = require('electron');

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL('http://localhost:5173'); // Vite dev server
};

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});