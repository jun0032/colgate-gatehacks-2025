const { app, BrowserWindow, screen, ipcMain } = require('electron');

app.whenReady().then(() => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  const win = new BrowserWindow({
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    width: 500,
    height: 500,
    x: 0,
    y: 0,
    resizable: false,
    webPreferences: { 
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  win.loadFile('character.html');
  
  // Listen for close event from renderer
  ipcMain.on('close-app', () => {
    app.quit();
  });
  
  // Optional: DevTools for debugging
  // win.webContents.openDevTools();
});

app.on('window-all-closed', () => {
  app.quit();
});