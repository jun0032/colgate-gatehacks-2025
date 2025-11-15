require("dotenv").config(); // Add this at the very top

const { app, BrowserWindow, screen, ipcMain } = require("electron");

// Add these lines to disable GPU
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");

const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.whenReady().then(() => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const win = new BrowserWindow({
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    width: width,
    height: height,
    x: 0,
    y: 0,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  
  // In main.js
  const isLinux = process.platform === 'linux';

  if (!isLinux) {
    // Only enable click-through on Windows/Mac
    win.setIgnoreMouseEvents(true, { forward: true });
    
    ipcMain.on('set-clickable', (event, clickable) => {
      win.setIgnoreMouseEvents(!clickable, { forward: true });
    });
  }

  win.loadFile("character.html");
  // win.setIgnoreMouseEvents(true, { forward: true }); // Start with click-through enabled

  // // Listen for hover events from renderer
  // ipcMain.on("set-clickable", (event, clickable) => {
  //   win.setIgnoreMouseEvents(!clickable, { forward: true });
  // });

  // Listen for close event from renderer
  ipcMain.on("close-app", () => {
    app.quit();
  });

  // Optional: DevTools for debugging
  // win.webContents.openDevTools();
});

// PROMPT GENERATION
let previousResponse = "";

// Add this IPC handler
ipcMain.handle("analyze-image", async (event, imagePath) => {
  try {
    const prompt = `You have previously replied "${previousResponse}" Make your next response unique.
INSTRUCTIONS: You are the ultra-duper super kawaii character in the top left. Provide commentary based on the contents of this image. Keep your response minimal, and under 200 characters. Anything exceeding 200 characters will be truncated`;

    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString("base64");

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
          ],
        },
      ],
    });

    const text = response.text.substring(0, 200);
    previousResponse = text;

    return text;
  } catch (error) {
    return `Error: ${error.message}`;
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
