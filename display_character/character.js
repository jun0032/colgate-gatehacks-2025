const { ipcRenderer } = require("electron");
const Tone = require("tone");

// Hoverable elements (to enable/disable click-through)
const interactiveElements = document.querySelectorAll(
  "#portrait, #buttons, #text, #message-box, #character-window, #settings-box, #HUD, .window, .title-bar"
);

// Global variable to track the current player instance to prevent audio overlap
let activePlayer = null;

// ===============================
// 🎉 Confetti Effect
// ===============================
let lastX = 0;

function r(mi, ma) {
  return parseInt(Math.random() * (ma - mi) + mi);
}
function doConfetti(evt, hard) {
  // Check if confetti is enabled
  const confettiEnabled = document.getElementById("toggle-confetti").checked;
  if (!confettiEnabled || !window.confetti) return;

  const direction = Math.sign(lastX - evt.clientX);
  lastX = evt.clientX;
  const particleCount = hard ? r(122, 245) : r(2, 15);

  window.confetti({
    particleCount,
    angle: r(90, 90 + direction * 30),
    spread: r(45, 80),
    origin: {
      x: evt.clientX / window.innerWidth,
      y: evt.clientY / window.innerHeight,
    },
  });
}
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
        textbox.innerHTML += targetText.charAt(i);
        i++;
        setTimeout(typing, speed);
      } else {
        resolve();
      }
    }
    typing();
  });
}

// ===============================
// 🔊 Stop Active Audio (Helper Function)
// ===============================
function stopActiveAudio() {
  if (activePlayer) {
    try {
      activePlayer.stop();
      activePlayer.dispose();
    } catch (e) {
      console.error("Error stopping active player:", e);
    } finally {
      activePlayer = null;
    }
  }
}

// ===============================
// 🔊 Tone.js TTS with Pitch Shift
// ===============================
async function speakWithGoogle(text, lang = "en") {
  // Stop any previous audio
  stopActiveAudio();

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
      // Reduced timeout to 10 seconds (Google TTS is usually short)
      setTimeout(() => {
        if (activePlayer === player) {
          stopActiveAudio();
        }
        resolve();
      }, 10000);
    });
  } catch (e) {
    console.error("Google TTS playback failed:", e);
    return Promise.resolve();
  }
}

// ===============================
// 🔊 Fish Audio TTS (via backend)
// ===============================
async function speakWithFishAudio(text, characterImage) {
  // Stop any active audio
  stopActiveAudio();

  let audioBuffer = null;

  try {
    audioBuffer = await ipcRenderer.invoke(
      "generate-fish-audio",
      text,
      characterImage
    );
  } catch (error) {
    console.error("IPC call to generate-fish-audio failed:", error);
  }

  // Fallback if Fish Audio API failed
  if (!audioBuffer) {
    console.log("Fish Audio failed, falling back to Google TTS.");
    await speakWithGoogle(text);
    return;
  }

  // Play generated Fish Audio
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

      // Reduced timeout to 15 seconds
      setTimeout(() => {
        if (activePlayer === player) {
          stopActiveAudio();
        }
        resolve();
      }, 15000);
    });
  } catch (error) {
    console.error("Fish Audio Playback Error:", error);
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

// ===============================
// Capture and Analyze (FIXED)
// ===============================
async function captureAndAnalyze() {
  const portrait = document.getElementById("portrait");

  try {
    // Stop any lingering audio from previous cycle
    stopActiveAudio();

    // Start thinking effect
    portrait.classList.add("is-thinking");
    document.getElementById("text").innerHTML = "Analyzing...";

    const screenshotDataUrl = await ipcRenderer.invoke("capture-screenshot");
    const result = await analyzeImage(screenshotDataUrl);

    if (result.startsWith("Error:")) {
      portrait.classList.remove("is-thinking");
      document.getElementById("text").innerHTML =
        "⚠️ API Error - Please wait...";
      console.error("API Error:", result);
      return;
    }

    ipcRenderer.send("store-response", result);

    const currentCharacterImage = document.getElementById("portrait").src;
    const imagePath = currentCharacterImage.split("/").slice(-2).join("/");

    // Type text and wait for completion
    await typeText(result, 40);

    // Remove thinking effect
    portrait.classList.remove("is-thinking");

    // Play audio and WAIT for it to complete
    await speak(result, imagePath);
  } catch (error) {
    portrait.classList.remove("is-thinking");
    console.error("Error capturing/analyzing:", error);
    document.getElementById("text").innerHTML = "⚠️ Error - Retrying soon...";
  }
}

// ===============================
// Main Loop (FIXED)
// ===============================
let isRunning = false;

async function startAutoScreenshot() {
  if (isRunning) return;
  isRunning = true;

  while (isRunning) {
    // Complete the entire cycle (analysis + typing + audio)
    await captureAndAnalyze();

    // ONLY wait the delay after everything is done
    if (isRunning) {
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
  }
}

function stopAutoScreenshot() {
  isRunning = false;
  stopActiveAudio(); // Stop audio when pausing
}

// ===============================
// Chat Interaction Logic (FIXED)
// ===============================
async function sendMessage(text) {
  stopAutoScreenshot();
  const portrait = document.getElementById("portrait");

  if (!text.trim()) {
    startAutoScreenshot();
    return;
  }

  try {
    // Stop any lingering audio
    stopActiveAudio();

    portrait.classList.add("is-thinking");
    document.getElementById("text").innerHTML = "Thinking...";

    const result = await ipcRenderer.invoke("send-message", text);
    console.log("Response from backend:", result);

    ipcRenderer.send("store-response", result);

    const currentCharacterImage = document.getElementById("portrait").src;
    const imagePath = currentCharacterImage.split("/").slice(-2).join("/");

    // Type text and wait
    await typeText(result, 40);

    // Remove thinking effect
    portrait.classList.remove("is-thinking");

    // Play audio and WAIT for completion
    await speak(result, imagePath);
  } catch (error) {
    portrait.classList.remove("is-thinking");
    console.error("Error sending message:", error);
    document.getElementById("text").innerHTML = "Error: " + error.message;
  } finally {
    // Restart the loop after chat is complete
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

// Title bars for draggable windows
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

// ===============================
// Pause Button Functionality (FIXED)
// ===============================
let isPaused = false;
const pauseBtn = document.getElementById("pause-btn");

pauseBtn.addEventListener("click", () => {
  isPaused = !isPaused;

  if (isPaused) {
    stopAutoScreenshot(); // This now also stops audio
    pauseBtn.textContent = "▶";
    document.getElementById("text").innerHTML = "Paused";
  } else {
    pauseBtn.textContent = "⏸";
    document.getElementById("text").innerHTML = "Resuming...";
    startAutoScreenshot();
  }
});

// ===============================
// 🎉 Confetti on HUD hover/click
// ===============================
const hudElement = document.getElementById("HUD");

hudElement.addEventListener("mousemove", (evt) => {
  doConfetti(evt, false);
});

hudElement.addEventListener("click", (evt) => {
  doConfetti(evt, true);
});

// ===============================
// Start the app
// ===============================
document.getElementById("text").innerHTML = "Starting...";
startAutoScreenshot();
