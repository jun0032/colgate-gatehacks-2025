const { ipcRenderer } = require("electron");
const Tone = require("tone");

// Hoverable elements (to enable/disable click-through)
const interactiveElements = document.querySelectorAll(
  "#portrait, #buttons, #text, #message-box, #character-window, #settings-box, #HUD, .window"
);

// New global variable to track the current player instance to prevent audio overlap
let activePlayer = null;

// ===============================
// 💬 Text Typing Animation Function
// ===============================
function typeText(targetText, speed = 40) {
  const textbox = document.getElementById("text");
  textbox.innerHTML = ""; // Clear the box

  let i = 0;
  return new Promise((resolve) => {
    function typing() {
      if (i < targetText.length) {
        // Append one character at a time
        textbox.innerHTML += targetText.charAt(i);
        i++;
        setTimeout(typing, speed);
      } else {
        resolve(); // Resolve the promise when done typing
      }
    }
    typing();
  });
}

// ===============================
// 🔊 Tone.js TTS with Pitch Shift (ROBUSTIFIED)
// ===============================
async function speakWithGoogle(text, lang = "en") {
  // Explicitly stop and dispose of the previous player instance
  if (activePlayer) {
    activePlayer.stop();
    activePlayer.dispose();
    activePlayer = null;
  }

  // Sanitize text
  text = String(text)
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(
      text
    )}`;

    const player = new Tone.Player(url);
    player.playbackRate = 1.0;

    const pitchShift = new Tone.PitchShift(5).toDestination();
    player.connect(pitchShift);

    activePlayer = player;

    await Tone.loaded();
    player.start();

    return new Promise((resolve) => {
      player.onstop = () => {
        if (activePlayer === player) {
          activePlayer.dispose();
          activePlayer = null;
        }
        resolve();
      };
      // Timeout fallback to unblock the loop in case onstop fails (31s is safe for 30s audio max)
      setTimeout(resolve, 31000);
    });
  } catch (e) {
    console.error("Google TTS playback failed:", e);
    // Resolve immediately so the main loop can continue, even if audio failed
    return Promise.resolve();
  }
}

// ===============================
// 🔊 Fish Audio TTS (via backend) - ROBUSTIFIED
// ===============================
async function speakWithFishAudio(text, characterImage) {
  // Stop any active audio
  if (activePlayer) {
    activePlayer.stop();
    activePlayer.dispose();
    activePlayer = null;
  }

  let audioBuffer = null;

  try {
    // 1. Attempt to get audio from backend (IPC/Network-bound)
    audioBuffer = await ipcRenderer.invoke(
      "generate-fish-audio",
      text,
      characterImage
    );
  } catch (error) {
    // This catches errors in the IPC communication itself
    console.error("IPC call to generate-fish-audio failed:", error);
    // audioBuffer remains null, leading to fallback
  }

  // 2. Fallback if Fish Audio API failed or returned null (main process handler returns null)
  if (!audioBuffer) {
    console.log(
      "Fish Audio failed or returned null, falling back to Google TTS."
    );
    await speakWithGoogle(text);
    return;
  }

  // 3. Play generated Fish Audio
  try {
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
    const audioUrl = URL.createObjectURL(audioBlob);

    if (Tone.context.state !== "running") {
      await Tone.start();
    }

    const player = new Tone.Player({
      url: audioUrl,
      onload: () => {
        player.start();
      },
    }).toDestination();

    activePlayer = player;

    return new Promise((resolve) => {
      player.onstop = () => {
        URL.revokeObjectURL(audioUrl);
        if (activePlayer === player) {
          activePlayer.dispose();
          activePlayer = null;
        }
        resolve();
      };

      // Timeout fallback
      setTimeout(() => {
        if (activePlayer === player) {
          player.stop();
        }
        resolve(); // Resolve promise on timeout
      }, 30000);
    });
  } catch (error) {
    // This catches errors during Tone.js playback setup
    console.error("Fish Audio Playback Error:", error);
    // If playback fails, fall back and await the resolution
    await speakWithGoogle(text);
  }
}

// ===============================
// 🔊 Main speak function
// ===============================
async function speak(text, characterImage) {
  if (characterImage.includes("cat.jpg")) {
    await speakWithGoogle(text);
  } else {
    await speakWithFishAudio(text, characterImage);
  }
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

document.getElementById("settings-btn").addEventListener("click", () => {
  const box = document.getElementById("settings-box");
  box.style.display = box.style.display === "block" ? "none" : "block";
});

document.getElementById("toggle-textbox").addEventListener("change", (e) => {
  const textbox = document.getElementById("text");
  textbox.style.display = e.target.checked ? "block" : "none";
});

// ===============================
// Analyzer & Capture Logic
// ===============================
async function analyzeImage(imageDataUrl) {
  const result = await ipcRenderer.invoke("analyze-image", imageDataUrl);
  return result;
}

// ===============================================
// Analyzer & Capture Logic (OPTIMIZED FOR PERCEIVED SPEED)
// ===============================================
async function captureAndAnalyze() {
  const portrait = document.getElementById("portrait");

  try {
    // 1. Start thinking effect and capture screenshot
    portrait.classList.add("is-thinking");
    document.getElementById("text").innerHTML = "Analyzing...";

    const screenshotDataUrl = await ipcRenderer.invoke("capture-screenshot");

    // 2. Await AI analysis
    const result = await analyzeImage(screenshotDataUrl);

    // Check for error after analysis is done
    if (result.startsWith("Error:")) {
      portrait.classList.remove("is-thinking");
      document.getElementById("text").innerHTML =
        "⚠️ API Error - Please wait...";
      console.error("API Error:", result);
      return;
    }

    // Save response into main process history for context after successful API call
    ipcRenderer.send("store-response", result);

    // Get current character image for voice selection
    const currentCharacterImage = document.getElementById("portrait").src;
    const imagePath = currentCharacterImage.split("/").slice(-2).join("/");

    // --- 🌟 CONCURRENT EXECUTION FIX 🌟 ---

    // 3a. Start typing and WAIT for the text to finish appearing.
    await typeText(result, 40);

    // 3b. Remove the thinking effect immediately after the text is visible.
    portrait.classList.remove("is-thinking");

    // 3c. Start the audio generation/playback task. We await it to prevent loop overlap.
    await speak(result, imagePath);
  } catch (error) {
    // Ensure the thinking state is cleaned up on any failure
    portrait.classList.remove("is-thinking");
    console.error("Error capturing/analyzing:", error);
    document.getElementById("text").innerHTML = "⚠️ Error - Retrying soon...";
  }
}

// ===============================
// Main Loop (Automatic Screen Commentary)
// ===============================
let isRunning = false;

async function startAutoScreenshot() {
  if (isRunning) return;
  isRunning = true;

  while (isRunning) {
    await captureAndAnalyze();

    await new Promise((resolve) => setTimeout(resolve, 15000)); // 15 seconds
  }
}

function stopAutoScreenshot() {
  isRunning = false;
}

// ===============================
// Chat Interaction Logic (MODIFIED FOR CONCURRENCY)
// ===============================
async function sendMessage(text) {
  stopAutoScreenshot();
  const portrait = document.getElementById("portrait");

  if (!text.trim()) {
    startAutoScreenshot();
    return;
  }

  try {
    // 1. Start thinking
    portrait.classList.add("is-thinking");
    document.getElementById("text").innerHTML = "Thinking...";

    // 2. Get AI text response
    const result = await ipcRenderer.invoke("send-message", text);
    console.log("Response from backend:", result);

    // Save chat response into main process history for context
    ipcRenderer.send("store-response", result);

    // Get current character image for voice selection
    const currentCharacterImage = document.getElementById("portrait").src;
    const imagePath = currentCharacterImage.split("/").slice(-2).join("/");

    // --- 🌟 CONCURRENT EXECUTION FIX 🌟 ---
    // 3a. Start typing and WAIT for it to finish
    await typeText(result, 40);

    // 3b. Remove the thinking effect immediately
    portrait.classList.remove("is-thinking");

    // 3c. Start the audio generation/playback task.
    await speak(result, imagePath);
  } catch (error) {
    portrait.classList.remove("is-thinking");
    console.error("Error sending message:", error);
    document.getElementById("text").innerHTML = "Error: " + error.message;
  } finally {
    // Restart the loop after the chat message has been spoken
    setTimeout(startAutoScreenshot, 1000);
  }
}

// ===============================
// Message Box Event Listeners (UNCHANGED)
// ===============================
const messageBox = document.getElementById("message-box");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("message-send-btn");

document.getElementById("message-btn").addEventListener("click", () => {
  messageBox.style.display =
    messageBox.style.display === "block" ? "none" : "block";
  if (messageBox.style.display === "block") {
    messageInput.focus();
  }
});

sendButton.addEventListener("click", () => {
  const text = messageInput.value;
  sendMessage(text);
  messageInput.value = "";
  messageBox.style.display = "none";
});

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendButton.click();
  }
});

// ===============================
// Character Selection Window (UNCHANGED)
// ===============================
document.getElementById("character-btn").addEventListener("click", () => {
  const charWindow = document.getElementById("character-window");
  if (charWindow.style.display === "none") {
    charWindow.style.display = "block";
  } else {
    charWindow.style.display = "none";
  }
});

document
  .querySelector("#character-window .title-bar-controls button")
  .addEventListener("click", () => {
    document.getElementById("character-window").style.display = "none";
  });

document.querySelectorAll(".character-option").forEach((button) => {
  button.addEventListener("click", () => {
    const characterFile = button.dataset.character;

    document.getElementById("portrait").src = characterFile;

    document.querySelectorAll(".character-option").forEach((opt) => {
      opt.classList.remove("selected");
    });
    button.classList.add("selected");

    ipcRenderer.send("set-character", characterFile);

    document.getElementById("character-window").style.display = "none";
  });
});

// New selectors for all title bars (UNCHANGED)
const titleBars = document.querySelectorAll(
  "#HUD .title-bar, #message-box .title-bar, #settings-box .title-bar, #character-window .title-bar"
);

titleBars.forEach((element) => {
  element.addEventListener("mouseenter", () => {
    ipcRenderer.send("set-clickable", true);
  });
  element.addEventListener("mouseleave", () => {
    ipcRenderer.send("set-clickable", false);
  });
});

interactiveElements.forEach((element) => {
  element.addEventListener("mouseenter", () => {
    ipcRenderer.send("set-clickable", true);
  });
  element.addEventListener("mouseleave", () => {
    ipcRenderer.send("set-clickable", false);
  });
});

// ===============================
// Start the app
// ===============================
document.getElementById("text").innerHTML = "Starting...";
startAutoScreenshot();
