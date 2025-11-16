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
// REMOVED: const { FishAudioClient } = await import("fish-audio");
const fs = require("fs");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ======================================
// ⚠️ Initialize Fish Audio client (Moved)
// ======================================
// It must be declared here but initialized later in app.whenReady()
let fishAudioClient = null;

// ======================================
// 🔵 Character Data
// ======================================
const characters = [
  {
    name: "cat",
    personality: "playful and curious",
    voice: "high-pitched and cute",
    image: "characters/cat.jpg",
  },
  {
    name: "miku",
    personality: "cheerful and energetic",
    voice: "synthesized and melodic",
    image: "characters/miku.jpg",
  },
  {
    name: "korby",
    personality: "logical and helpful",
    voice: "monotone and precise",
    image: "characters/korby.jpg",
  },
  {
    name: "amogus",
    personality: "loyal and friendly",
    voice: "enthusiastic and warm",
    image: "characters/amogus.jpg",
  },
];

// ======================================
// 🔵 Store current character and history
// ======================================
let currentCharacter = characters[0]; // Default to cat
let responseHistory = [];

ipcMain.on("store-response", (event, text) => {
  responseHistory.push(text);
});

// ======================================
// 🔵 Character Selection Handler
// ======================================
ipcMain.on("set-character", (event, imagePath) => {
  // Find the character by matching the image path
  const character = characters.find((char) => char.image === imagePath);
  if (character) {
    currentCharacter = character;
    console.log(`Character changed to: ${character.name}`);
  }
});

// ======================================
// 🔵 Fish Audio API Key Handler
// ======================================
ipcMain.handle("get-fish-api-key", async () => {
  return process.env.FISH_API_KEY || null;
});

// ======================================
// 🌟 app.whenReady() with Async Initialization
// ======================================
app.whenReady().then(async () => {
  // Make the callback async
  // 1. DYNAMICALLY IMPORT AND INITIALIZE FISH AUDIO CLIENT
  if (process.env.FISH_API_KEY) {
    try {
      // Use dynamic import and await to load the ES Module
      const { FishAudioClient: ClientClass } = await import("fish-audio");
      fishAudioClient = new ClientClass({ apiKey: process.env.FISH_API_KEY });
      console.log("✓ Fish Audio client initialized");
    } catch (error) {
      console.error("Failed to load fish-audio module:", error);
      console.warn("⚠ FISH_API_KEY not found or client failed to initialize");
    }
  } else {
    console.warn("⚠ FISH_API_KEY not found in .env");
  }

  // 2. CONTINUE WITH ELECTRON WINDOW SETUP
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
You are ${currentCharacter.name} sitting in the top-left corner of the user's screen.
Your personality: ${currentCharacter.personality}
Your voice style: ${currentCharacter.voice}
You speak once every ~15 seconds.

Here are ALL your previous comments:
${fullHistory}

Your job:
- DO NOT use emojis.
- Keep response UNDER 150 characters.
- Speak in a way that matches your personality (${currentCharacter.personality}) and voice (${currentCharacter.voice}).
- Focus on what the user is doing RIGHT NOW.
- Point out major changes from the last few screenshots.
- If the user is doing homework or coding: encourage, motivate, or help.
- If the user is watching videos: react, comment, or hype it up.
- If the user is browsing or switching tasks: point out the change.
- Ignore old or irrelevant history.
- Keep the tone energetic, like a livestream companion.
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
You are ${currentCharacter.name} sitting in the top-left corner of the user's screen.
Your personality: ${currentCharacter.personality}
Your voice style: ${currentCharacter.voice}
A friend has sent you this message: "${message}".

Here is ALL your previous commentary (from chat + screenshots):
${fullHistory}

Your job:
- DO NOT use emojis.
- Keep the response UNDER 200 characters.
- Speak in a way that matches your personality (${currentCharacter.personality}) and voice (${currentCharacter.voice}).
- First: give a short summary of what the fan said.
- Then: respond to the fan in your natural personality.
- React to what the user is doing RIGHT NOW on their screen.
- Point out major differences compared to the last few screenshots.
- If the user is doing homework/coding: encourage, motivate, or help them.
- If the user is watching videos: react, joke, or hype it up.
- If the user is browsing or switching tasks: point out the change.
- Ignore old or irrelevant history.
- Make the reply unique and avoid repeating old lines.
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

    return text;
  } catch (error) {
    console.error("Error processing user message:", error);
    return `Error: ${error.message}`;
  }
});
// ======================================
// 🔵 Fish Audio Generation Handler (FINAL FIX)
// ======================================
ipcMain.handle("generate-fish-audio", async (event, text, characterImage) => {
  if (!fishAudioClient) {
    // If client wasn't initialized in app.whenReady(), throw an error for logging
    throw new Error("Fish Audio client is not initialized.");
  }

  // Define voice ID mapping (adjust these placeholders to actual Fish Audio Voice IDs)
  let voiceId = "en_us_male_default"; // Fallback to a generic voice

  if (characterImage.includes("miku")) {
    // Assuming Miku uses a custom reference voice or a specific ID
    voiceId = process.env.MIKU_VOICE_ID || "miku_synthetic_voice_id";
  } else if (characterImage.includes("korby")) {
    voiceId = process.env.KORBY_VOICE_ID || "korby_monotone_voice_id";
  } else if (characterImage.includes("amogus")) {
    voiceId = process.env.AMOGUS_VOICE_ID || "amogus_monotone_voice_id";
  }

  // --- Using the correct fishAudio.textToSpeech.convert method and stream reading ---
  try {
    const audioStream = await fishAudioClient.textToSpeech.convert({
      text: text,
      reference_id: voiceId, // Use voice_id for standard voices
      // If you are using custom voices, ensure you use the correct parameter (e.g., reference_id)
    });

    // ⚠️ FIX: Read the Node.js Stream into a Buffer
    const chunks = [];

    // Use the async iterator to safely read all data chunks from the stream
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }

    // Concatenate all chunks into a single Buffer
    const buffer = Buffer.concat(chunks);

    return buffer; // Return the Buffer to the renderer process
  } catch (error) {
    console.error("Fish Audio API Error:", error);
    // Return null to signal the renderer to use the Google TTS fallback
    return null;
  }
});

app.on("window-all-closed", () => app.quit());
