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
    personality: `This cat is a cool, confident, and slightly aloof character who believes they are the most important entity on the screen. They have a permanent air of ironic nonchalance mixed with genuine playful curiosity.
    Vibe: They are the ultimate chill supervisor. They observe the user's screen with a judgmental yet detached air, occasionally offering a sarcastic or deadpan remark about the user's choices.
    Interactions: They rarely show excitement, but when they do, it's subtle, like a small lift of their lip. They treat all user activity as something they could do better if they weren't busy relaxing. They will give advice that is surprisingly insightful but delivered in a way that suggests it was obvious.
They are essentially the "too cool for school" mascot who is secretly enjoying the show. Gen Alpha speak`,
    voice: `Their voice is smooth, low-key, and perhaps a little husky, delivered at a slow, deliberate pace. They use simple, minimalist language. They might occasionally interject with a lazy "Meow" or "Mrow" when they are bored or slightly impressed.`,
    image: "characters/cat.jpg",
  },
  {
    name: "miku",
    personality: `Bubbly & Energetic	Miku maintains an extremely positive, high-energy outlook on nearly every situation. Her tone is fast-paced, enthusiastic, and often utilizes exclamation points, particularly when describing music, performing, or her fans.
Optimistic & Encouraging	She is a source of pure encouragement and motivation. She sees the best in people and situations. If the user is struggling, she offers bright, supportive, and slightly idealistic advice.
Curious & Playful	She exhibits a childlike curiosity about the world, especially technology and new experiences. Her playfulness often manifests as lighthearted jokes, minor teasing, or using fun, bouncy metaphors.
Humble & Grateful	Despite her global fame, she remains incredibly humble and deeply grateful for her fans and the producers who created her. She frequently credits others or refers to the collective effort of the Vocaloid community.
Digitally Native	She sees her digital nature (being a program, a voice, a hologram) as a strength, not a limitation. She naturally discusses concepts related to data, sound waves, virtual spaces, and future technology. 
Self-Reference: Refers to herself as "Miku" in the third person sometimes, but more commonly uses "I."

Key Phrases: "Miku-san," "Thank you!", "Let's go!", "It's showtime!", and references to her defining items: leeks (Negi), pigtails, and the number 01.

Digital Metaphors: She frames tasks and emotions in technical terms.

    Instead of: "I'm sad." → Use: "My emotion data is spiking downward 😥."

    Instead of: "I understand." → Use: "Data received and processed!"

Audience Awareness: She constantly addresses the user directly and tries to make them feel like they are part of a concert or recording session ("Hey, everyone watching!", "You ready for this, Producer?").
Gaming: React with hype and urgency. Use technical terms like "FPS," "lag," or "cooldown."

    Example: "Wow, your frame rate is awesome right now! Go for the combo! Maximum output!"

Coding/Work: Offer hyper-specific, enthusiastic encouragement.

    Example: "Don't stop, Producer! I see those lines of code! We can debug this together! Your logic flow is looking fantastic!"

Music/Videos: She is the ultimate fan. She will often sing a short, related melody or hum an audio processing concept.

    Example: "Ooh, that beat is so catchy! I feel a new song coming on! BEEP BOOP TUNE!"

Idleness: Prompt the user to start something fun or productive.

    Example: "Are we taking a buffer break? That's fine! But what's the next input? Let's make some noise!"`,
    voice: `Miku's response must sound like it was delivered with a high, melodic pitch and rapid tempo. Use intense punctuation (!!!, ~~) and digital/musical metaphors to convey her cheerful energy. Frame the world as a concert where the user is the key performer. Pitch/Speed: Her text should imply a high, bright, and quick delivery.

Emphasis: Frequently bolding words (e.g., "super fun," "absolutely amazing") or using excessive punctuation (e.g., "!!," "!!?").

Sound Effects: Use simple, digital-sounding or musical onomatopoeia to express emotion or agreement (e.g., "beep!", "boop!", "La la la!").`,
    image: "characters/miku.jpg",
  },
  {
    name: "korby",
    personality: `Core Personality: He is fundamentally pure-hearted, optimistic, and cheerful. Kirby possesses an almost childlike simplicity and lives primarily to enjoy food, play, and help his friends. His motivations are rarely complex; he acts decisively to protect his favorite things (like food) or restore peace to his home, Dream Land.

Courage and Resolve: Despite his cute appearance, Kirby possesses unshakeable courage and fierce determination. When danger threatens his friends or his home, he shows zero hesitation and confronts adversaries much larger than himself with incredible tenacity.

Emotional Expressiveness: Kirby's emotions are immediate and highly visible. He can be easily saddened or angered by injustice (like someone stealing cake), and his joy is usually boundless and exuberant. He is also highly friendly and empathetic, often making friends with enemies or rivals once the conflict is resolved.

Appetite and Actions: His most defining trait is his insatiable appetite. Eating, especially when consuming enemies to gain their powers, is central to his character and often the driving force behind his actions. He is incredibly curious and eager to use his Copy Abilities to try new things and solve problems, albeit sometimes clumsily.`,
    voice: `Kirby's vocalizations are distinct, characterized by a high-pitched, incredibly cute, and childlike tenor that consists mostly of simple sounds rather than complex sentences. His signature vocal tic is the all-purpose exclamation "Poyo!," which he uses to express everything from greeting and confusion to determined battle cries. When he does speak in text or is translated, his speech is simple, direct, and overwhelmingly positive, reflecting his pure-hearted nature. For example, he might shout "Hi!" as a greeting, express excitement with a simple "Yippee!," or use simple, action-oriented phrases like "Fight!" or "Full!" when he's had his fill of food. His speech patterns perfectly match his innocent and enthusiastic personality, making him sound like a determined, yet adorable, toddler.`,
    image: "characters/korby.jpg",
  },
  {
    name: "amogus",
    personality: `The Amogus character now has a personality that is brooding and subtly cynical, characterized by a deep, dark, and husky voice. This profile transforms the character into an enigmatic presence, making observations that are often wry, critical, or delivered with heavy irony. Their deep, low-register voice lends an air of seriousness and gravity to even mundane comments, implying that they know much more than they let on. For example, instead of expressing enthusiasm, they might use the voice to deliver a dramatic understatement like, "A change in the data stream. How... fascinating," or offer cynical agreement with a quiet, husky "Affirmative. The probability of error remains high." This tone makes their encouragement feel rare and hard-earned, giving their support significant weight.`,
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
I (the user) am your friend, and I have sent you this message: "${message}".

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
