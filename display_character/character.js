const { ipcRenderer } = require("electron");
const Tone = require("tone");

// Hoverable elements (to enable/disable click-through)
const interactiveElements = document.querySelectorAll(
  "#portrait, #buttons, #text, #message-box, #character-window, #settings-box"
);

// New global variable to track the current player instance to prevent audio overlap
let activePlayer = null;

// ===============================
// 🔊 Tone.js TTS with Pitch Shift
// ===============================
async function speakWithGoogle(text, lang = "en") {
  // Explicitly stop and dispose of the previous player instance to guarantee no overlap
  if (activePlayer) {
    activePlayer.stop();
    activePlayer.dispose();
    activePlayer = null;
  }

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

  // Assign the new player instance
  activePlayer = player;

  await Tone.loaded();
  player.start();

  return new Promise((resolve) => {
    // The promise resolves only when Tone.js reports the audio has stopped playing
    player.onstop = () => {
      resolve();
      // Clear the active player reference when done
      if (activePlayer === player) {
        activePlayer.dispose(); // Clean up resources after playback
        activePlayer = null;
      }
    };
  });
}

// ===============================
// UI Listeners (Click-Through, Close, Settings)
// ===============================
interactiveElements.forEach((element) => {
  element.addEventListener("mouseenter", () => {
    ipcRenderer.send("set-clickable", true);
  });
  element.addEventListener("mouseleave", () => {
    ipcRenderer.send("set-clickable", false);
  });
});

document.getElementById("close-btn").addEventListener("click", () => {
  ipcRenderer.send("close-app");
});

// ===============================
// SETTINGS BUTTON — OPEN WINDOW
// ===============================
document.getElementById("settings-btn").addEventListener("click", () => {
  const box = document.getElementById("settings-box");
  box.style.display = box.style.display === "block" ? "none" : "block";
});

// SETTINGS: Hide/Show Text Bubble
document.getElementById("toggle-textbox").addEventListener("change", (e) => {
  const textbox = document.getElementById("text");
  textbox.style.display = e.target.checked ? "block" : "none";
});

// ===============================
// Analyzer & Capture Logic
// ===============================
async function analyzeImage(imageDataUrl) {
  const result = await ipcRenderer.invoke("analyze-image", imageDataUrl);
  console.log(result);

  // Save response into main process history for context
  ipcRenderer.send("store-response", result);

  return result;
}

async function captureAndAnalyze() {
  try {
    const screenshotDataUrl = await ipcRenderer.invoke("capture-screenshot");

    const result = await analyzeImage(screenshotDataUrl);

    document.getElementById("text").innerHTML = result;

    // Wait for audio to finish before proceeding to the next loop cycle
    await speakWithGoogle(result);
  } catch (error) {
    console.error("Error capturing/analyzing:", error);
    document.getElementById("text").innerHTML = "Error: " + error.message;
  }
}

// ===============================
// Main Loop (Automatic Screen Commentary)
// ===============================
let isRunning = false;

async function startAutoScreenshot() {
  if (isRunning) return; // Prevent multiple loops
  isRunning = true;

  while (isRunning) {
    // Wait for capture, analysis, and audio to complete
    await captureAndAnalyze();

    // Delay between screenshots
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
}

function stopAutoScreenshot() {
  isRunning = false;
}

// ===============================
// Chat Interaction Logic
// ===============================
async function sendMessage(text) {
  // Immediately stop the background loop to prioritize chat
  stopAutoScreenshot();

  if (!text.trim()) {
    // If empty message, restart the loop and exit
    startAutoScreenshot();
    return;
  }

  try {
    // Display 'Thinking...'
    document.getElementById("text").innerHTML = "Thinking...";

    // Send the user's text to the backend for a text response
    const result = await ipcRenderer.invoke("send-message", text);
    console.log("Response from backend:", result);

    // Save chat response into main process history for context
    ipcRenderer.send("store-response", result);

    // Display the result
    document.getElementById("text").innerHTML = result;

    // Speak the result out loud and WAIT for it to finish
    await speakWithGoogle(result);
  } catch (error) {
    console.error("Error sending message:", error);
    document.getElementById("text").innerHTML = "Error: " + error.message;
  } finally {
    // Restart the loop after the chat message has been spoken
    setTimeout(startAutoScreenshot, 1000);
  }
}

// ===============================
// Message Box Event Listeners
// ===============================
const messageBox = document.getElementById("message-box");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("message-send-btn");

document.getElementById("message-btn").addEventListener("click", () => {
  // Toggle visibility of the message box
  messageBox.style.display =
    messageBox.style.display === "block" ? "none" : "block";
  if (messageBox.style.display === "block") {
    messageInput.focus(); // Focus on the input when it opens
  }
});

sendButton.addEventListener("click", () => {
  const text = messageInput.value;
  sendMessage(text);
  messageInput.value = ""; // Clear the input
  messageBox.style.display = "none"; // Close the box
});

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendButton.click(); // Trigger the send button on Enter press
  }
});

// ===============================
// Character Selection Window
// ===============================
document.getElementById("character-btn").addEventListener("click", () => {
  const charWindow = document.getElementById("character-window");
  if (charWindow.style.display === "none") {
    charWindow.style.display = "block";
  } else {
    charWindow.style.display = "none";
  }
});

// Close button for character window
document
  .querySelector("#character-window .title-bar-controls button")
  .addEventListener("click", () => {
    document.getElementById("character-window").style.display = "none";
  });

// ===============================
// 🔵 CHARACTER SELECTION - This is the key part that changed!
// ===============================
document.querySelectorAll(".character-option").forEach((button) => {
  button.addEventListener("click", () => {
    const characterFile = button.dataset.character;

    // Update the main portrait image
    document.getElementById("portrait").src = characterFile;

    // Update selected state visual
    document.querySelectorAll(".character-option").forEach((opt) => {
      opt.classList.remove("selected");
    });
    button.classList.add("selected");

    // 🔵 THIS IS THE NEW LINE - Send character change to backend
    // The backend will match this image path to a character object
    // and update the AI prompts with that character's personality & voice
    ipcRenderer.send("set-character", characterFile);

    // Close the window after selection
    document.getElementById("character-window").style.display = "none";
  });
});

// ===============================
// Start the app
// ===============================
document.getElementById("text").innerHTML = "Starting...";
startAutoScreenshot();
