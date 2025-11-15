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

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (permission === "media") {
        callback(true);
      } else {
        callback(false);
      }
    }
  );

  const isLinux = process.platform === "linux";
  if (!isLinux) {
    win.setIgnoreMouseEvents(true, { forward: true });
    ipcMain.on("set-clickable", (event, clickable) => {
      win.setIgnoreMouseEvents(!clickable, { forward: true });
    });
  }

  win.loadFile("character.html");

  ipcMain.on("close-app", () => {
    app.quit();
  });

  // NEW: Handle screenshot capture in main process
  ipcMain.handle("capture-screenshot", async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1920, height: 1080 }, // Adjust size as needed
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
INSTRUCTIONS: You are the ultra-duper super kawaii character in the top left. Provide commentary based on the contents of this image. Keep your response minimal, and under 200 characters. Anything exceeding 200 characters will be truncated`;

    let base64Image;

    if (imagePathOrDataUrl.startsWith("data:image")) {
      base64Image = imagePathOrDataUrl.split(",")[1];
    } else {
      const imageData = fs.readFileSync(imagePathOrDataUrl);
      base64Image = imageData.toString("base64");
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
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
