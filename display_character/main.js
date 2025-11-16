require("dotenv").config();
const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  session,
  desktopCapturer,
} = require("electron");

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
      enableRemoteModule: true,
      webSecurity: false,
    },
  });

  // load html
  win.loadFile("character.html");

  // Check operating system
  const isLinux = process.platform === "linux";

  if (!isLinux) {
    // Only enable click-through on Windows/Mac
    win.setIgnoreMouseEvents(true, { forward: true });

    ipcMain.on("set-clickable", (event, clickable) => {
      win.setIgnoreMouseEvents(!clickable, { forward: true });
    });
  }

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (permission === "media") {
        callback(true);
      } else {
        callback(false);
      }
    }
  );

  ipcMain.on("close-app", () => {
    app.quit();
  });

  // NEW: Handle screenshot capture in main process
  ipcMain.handle("capture-screenshot", async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: width, height: height },
      });
      return sources[0].thumbnail.toDataURL();
    } catch (error) {
      console.error("Screenshot error:", error);
      throw error;
    }
  });
});

// PROMPT GENERATION
let previousResponse = "";

ipcMain.handle("analyze-image", async (event, imagePathOrDataUrl) => {
  try {
    const prompt = `You have previously replied "${previousResponse}" Make your next response unique.
INSTRUCTIONS: Help me code. Keep your response minimal, and under 200 characters. Anything exceeding 200 characters will be truncated`;

    let base64Image;

    if (imagePathOrDataUrl.startsWith("data:image")) {
      base64Image = imagePathOrDataUrl.split(",")[1];
    } else {
      const imageData = fs.readFileSync(imagePathOrDataUrl);
      base64Image = imageData.toString("base64");
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/png",
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
