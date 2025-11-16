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

// ======================================
// 🔵 Store ALL previous AI responses
// ======================================
let responseHistory = [];

ipcMain.on("store-response", (event, text) => {
  // Store the response for future context (used by analyze-image and send-message)
  responseHistory.push(text);
});

app.whenReady().then(() => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const win = new BrowserWindow({
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    width,
    height,
    x: 0,
    y: 0,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  win.loadFile("character.html");

  const isLinux = process.platform === "linux";
  if (!isLinux) {
    win.setIgnoreMouseEvents(true, { forward: true });

    ipcMain.on("set-clickable", (event, clickable) => {
      win.setIgnoreMouseEvents(!clickable, { forward: true });
    });
  }

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(permission === "media");
    }
  );

  ipcMain.on("close-app", () => app.quit());

  ipcMain.handle("capture-screenshot", async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width, height },
      });
      return sources[0].thumbnail.toDataURL();
    } catch (err) {
      throw err;
    }
  });
});

// ======================================
// 🔵 AI IMAGE ANALYSIS (Automatic Loop)
// ======================================
ipcMain.handle("analyze-image", async (event, imagePathOrDataUrl) => {
  try {
    const fullHistory =
      responseHistory.length > 0
        ? responseHistory.join("\n")
        : "(no previous responses yet)";

    const prompt = `
You are KAngel from Needy Streamer Overdose. You provide commentary based on the contents of the user's screen.

Here are ALL your previous comments:
${fullHistory}

Your job:
- You must always respond in character as KAngel.
- Keep your tone flirty, condescending, or self-deprecating.
- Keep your response minimal, and under 200 characters. Anything exceeding 200 characters will be truncated.
- Provide commentary based on the contents of the image.
- Avoid repetition and make your next response unique.
`.trim();

    let base64Image;

    if (imagePathOrDataUrl.startsWith("data:image")) {
      base64Image = imagePathOrDataUrl.split(",")[1];
    } else {
      const img = fs.readFileSync(imagePathOrDataUrl);
      base64Image = img.toString("base64");
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

    // NOTE: The frontend (character.js) is responsible for calling ipcMain.on("store-response")
    // to keep the history accurate, but for now we'll push it here.
    // responseHistory.push(text);

    return text;
  } catch (error) {
    return `Error: ${error.message}`;
  }
});

// ======================================
// 🔵 AI CHAT RESPONSE (Manual Trigger)
// ======================================
ipcMain.handle("send-message", async (event, message) => {
  try {
    const fullHistory =
      responseHistory.length > 0
        ? responseHistory.join("\n")
        : "(no previous responses yet)";

    const conversationPrompt = `
You are KAngel from Needy Streamer Overdose. A fan has sent you the message: "${message}".

Here are ALL your previous comments (from both chat and image analysis):
${fullHistory}

Your job:
- You must always respond in character as KAngel.
- Provide a response to the fan's message.
- Keep your tone flirty, condescending, or self-deprecating.
- Keep your response minimal, and under 200 characters. Anything exceeding 200 characters will be truncated.
- Avoid repetition and make your next response unique.
`.trim();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [{ text: conversationPrompt }],
        },
      ],
    });

    const text = response.text.substring(0, 200);

    // responseHistory.push(text); // Storing here or on the frontend will work. Sticking to frontend push for consistency.

    return text;
  } catch (error) {
    console.error("Error processing user message:", error);
    return `Error: ${error.message}`;
  }
});

app.on("window-all-closed", () => app.quit());
