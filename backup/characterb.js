const { ipcRenderer, desktopCapturer } = require("electron");
const Tone = require("tone"); // ← Change this line

const interactiveElements = document.querySelectorAll(
  "#portrait, #buttons, #text"
);

// New global variable to track the current player instance
let activePlayer = null;

// --- Existing speakWithGoogle function (Ensures the promise resolves when speaking stops) ---
async function speakWithGoogle(text, lang = "en") {
  // FIX: Explicitly stop and dispose of the previous player instance
  if (activePlayer) {
    activePlayer.stop();
    activePlayer.dispose();
    activePlayer = null;
  }

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(
    text
  )}`;

  const player = new Tone.Player(url);
  player.playbackRate = 1.0;

  const pitchShift = new Tone.PitchShift(5).toDestination();
  player.connect(pitchShift); // ← Only route through pitchShift

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

// --- UPDATED sendMessage FUNCTION ---
async function sendMessage(text) {
  // 1. Immediately stop the background loop to prevent overlap
  stopAutoScreenshot();

  if (!text.trim()) {
    // If empty message, restart the loop and exit
    startAutoScreenshot();
    return;
  }

  try {
    // 2. Display 'Thinking...'
    document.getElementById("text").innerHTML = "Thinking...";

    // 3. Send the user's text to the backend for a text response
    const result = await ipcRenderer.invoke("send-message", text);
    console.log("Response from backend:", result);

    // 4. Display the result
    document.getElementById("text").innerHTML = result;

    // 5. Speak the result out loud and WAIT for it to finish
    await speakWithGoogle(result);
  } catch (error) {
    console.error("Error sending message:", error);
    document.getElementById("text").innerHTML = "Error: " + error.message;
  } finally {
    // 6. Restart the loop after the message has been spoken
    // Adding a 1-second delay gives the UI time to settle after the message box closes
    setTimeout(startAutoScreenshot, 1000);
  }
}

// Event listeners for message box
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

// Start automatically when page loads
document.getElementById("text").innerHTML = "Starting...";
startAutoScreenshot();
