const { ipcRenderer, desktopCapturer } = require("electron");

const interactiveElements = document.querySelectorAll(
  "#portrait, #buttons, #text"
);

// Unofficial Google Translate TTS
function speakWithGoogle(text, lang = "en") {
  return new Promise((resolve, reject) => {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(
      text
    )}`;
    const audio = new Audio(url);
    audio.onended = () => resolve(); // Resolve when audio finishes
    // audio.onerror = () => reject(new Error("Audio playback failed"));
    audio.play();
  });
}

interactiveElements.forEach((element) => {
  element.addEventListener("mouseenter", () => {
    ipcRenderer.send("set-clickable", true);
  });
  element.addEventListener("mouseleave", () => {
    ipcRenderer.send("set-clickable", false);
  });
});

// Close button
document.getElementById("close-btn").addEventListener("click", () => {
  ipcRenderer.send("close-app");
});

// Settings button
document.getElementById("settings-btn").addEventListener("click", () => {
  alert("Settings clicked! Add your settings UI here");
});

// PROMPT STUFF
async function analyzeImage(imageDataUrl) {
  const result = await ipcRenderer.invoke("analyze-image", imageDataUrl);
  console.log(result);
  return result;
}

// Function to capture screenshot and analyze it
async function captureAndAnalyze() {
  try {
    // Request screenshot from main process
    const screenshotDataUrl = await ipcRenderer.invoke("capture-screenshot");

    // document.getElementById("text").innerHTML = "Analyzing screenshot...";
    const result = await analyzeImage(screenshotDataUrl);
    document.getElementById("text").innerHTML = result;

    // Wait for audio to finish before taking next screenshot
    await speakWithGoogle(result);
  } catch (error) {
    console.error("Error capturing/analyzing:", error);
    document.getElementById("text").innerHTML = "Error: " + error.message;
  }
}

// Start the automatic screenshot loop
let isRunning = false;

async function startAutoScreenshot() {
  if (isRunning) return; // Prevent multiple loops
  isRunning = true;

  while (isRunning) {
    await captureAndAnalyze(); // Wait for screenshot, analysis, AND audio to complete
    // Optional: add a small delay between cycles
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
}

// Stop the loop
function stopAutoScreenshot() {
  isRunning = false;
}

// Start automatically when page loads
document.getElementById("text").innerHTML = "Starting...";
startAutoScreenshot();
