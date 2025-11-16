const { ipcRenderer } = require("electron");
const Tone = require("tone");

// Hoverable elements
const interactiveElements = document.querySelectorAll(
  "#portrait, #buttons, #text"
);

// ===============================
// 🔊 Tone.js TTS with Pitch Shift
// ===============================
async function speakWithGoogle(text, lang = "en") {
  // Sanitize text to avoid breaking URL
  text = String(text)
    .replace(/[^\x00-\x7F]/g, "") // remove emojis/unicode
    .replace(/\s+/g, " ")
    .trim();

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(
    text
  )}`;

  const player = new Tone.Player(url);
  player.playbackRate = 1.0;

  const pitchShift = new Tone.PitchShift(5).toDestination();
  player.connect(pitchShift);

  await Tone.loaded();
  player.start();

  return new Promise((resolve) => {
    player.onstop = () => resolve();
  });
}

// ===============================
// Hover → enable clicks
// ===============================
interactiveElements.forEach((element) => {
  element.addEventListener("mouseenter", () => {
    ipcRenderer.send("set-clickable", true);
  });
  element.addEventListener("mouseleave", () => {
    ipcRenderer.send("set-clickable", false);
  });
});

// Close app
document.getElementById("close-btn").addEventListener("click", () => {
  ipcRenderer.send("close-app");
});

// Settings button
document.getElementById("settings-btn").addEventListener("click", () => {
  alert("Settings clicked! Add your settings UI here");
});

// ===============================
// Analyzer
// ===============================
async function analyzeImage(imageDataUrl) {
  const result = await ipcRenderer.invoke("analyze-image", imageDataUrl);
  console.log(result);

  // Save response into main process history
  ipcRenderer.send("store-response", result);

  return result;
}

// ===============================
// Capture + Analyze
// ===============================
async function captureAndAnalyze() {
  try {
    const screenshotDataUrl = await ipcRenderer.invoke("capture-screenshot");

    const result = await analyzeImage(screenshotDataUrl);

    document.getElementById("text").innerHTML = result;

    await speakWithGoogle(result);
  } catch (error) {
    console.error("Error capturing/analyzing:", error);
    document.getElementById("text").innerHTML = "Error: " + error.message;
  }
}

// ===============================
// Main Loop (8 seconds per screenshot cycle)
// ===============================
let isRunning = false;

async function startAutoScreenshot() {
  if (isRunning) return;
  isRunning = true;

  while (isRunning) {
    await captureAndAnalyze();

    // ~8 seconds between screenshots
    await new Promise((resolve) => setTimeout(resolve, 8000));
  }
}

function stopAutoScreenshot() {
  isRunning = false;
}

document.getElementById("text").innerHTML = "Starting...";
startAutoScreenshot();
