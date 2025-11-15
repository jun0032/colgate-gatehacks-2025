const { app, BrowserWindow, screen, ipcMain } = require('electron');

app.whenReady().then(() => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  const win = new BrowserWindow({
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    width: Math.floor(width * 0.15),   // 15% of screen width
    height: Math.floor(height * 0.25), // 25% of screen height
    x: 0,
    y: 0,
    resizable: false,
    webPreferences: { 
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  win.loadFile('character.html');
  win.setIgnoreMouseEvents(true, { forward: true }); // Start with click-through enabled
  
  // Listen for hover events from renderer
  ipcMain.on('set-clickable', (event, clickable) => {
    win.setIgnoreMouseEvents(!clickable, { forward: true });
  });

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