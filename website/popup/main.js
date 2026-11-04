const UI = {
  scoringSystem: document.getElementById("scoringSystem"),
  scoringColour: document.getElementById("scoringColour"),
  hideOnlyMode: document.getElementById("hideOnlyMode"),
  hideLowScore: document.getElementById("hideLowScore"),
  filterOptions: document.getElementById("filterOptions"),
  lowScoreThreshold: document.getElementById("lowScoreThreshold"),
  thresholdValue: document.getElementById("thresholdValue"),
  connectionBadge: document.getElementById("connectionBadge"),
};

const DEFAULTS = {
  scoringSystem: "stars",
  scoringColour: true,
  hideOnlyMode: false,
  hideLowScore: false,
  lowScoreThreshold: 25,
};

let currentSettings = { ...DEFAULTS };
let storageMode = "preview"; // "extension" | "userscript" | "preview"

function applyToUI(config) {
  currentSettings = { ...currentSettings, ...config };
  UI.scoringSystem.value = currentSettings.scoringSystem;
  UI.scoringColour.checked = currentSettings.scoringColour;
  UI.hideOnlyMode.checked = currentSettings.hideOnlyMode;
  UI.hideLowScore.checked = currentSettings.hideLowScore;
  UI.lowScoreThreshold.value = currentSettings.lowScoreThreshold;
  UI.thresholdValue.textContent = `${currentSettings.lowScoreThreshold}%`;
  UI.filterOptions.classList.toggle("hidden", !currentSettings.hideLowScore);
}

function updateBadge(mode) {
  storageMode = mode;
  if (!UI.connectionBadge) return;

  UI.connectionBadge.className = "connection-badge";
  if (mode === "extension") {
    UI.connectionBadge.textContent = "Extension";
    UI.connectionBadge.classList.add("connected-ext");
    UI.connectionBadge.title = "Connected to RatioYT browser extension";
  } else if (mode === "userscript") {
    UI.connectionBadge.textContent = "Userscript";
    UI.connectionBadge.classList.add("connected-user");
    UI.connectionBadge.title = "Connected to RatioYT userscript";
  } else {
    UI.connectionBadge.textContent = "Preview";
    UI.connectionBadge.title = "Running in interactive demo mode";
  }
}

function save(patch) {
  currentSettings = { ...currentSettings, ...patch };

  if (storageMode === "extension" && window.chrome?.storage?.local) {
    chrome.storage.local.set(patch);
    return;
  }

  // Send to content script / userscript bridge via postMessage
  window.postMessage({ type: "RATIOYT_SET_SETTINGS", settings: patch }, "*");

  // Also save to demo localStorage
  try {
    localStorage.setItem("ratioyt_demo_settings", JSON.stringify(currentSettings));
  } catch (_) {}
}

// 1. Check if running directly in WebExtension popup
if (typeof chrome !== "undefined" && chrome?.storage?.local) {
  updateBadge("extension");
  chrome.storage.local.get(DEFAULTS, applyToUI);
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    const updated = {};
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULTS) updated[key] = change.newValue;
    }
    applyToUI(updated);
  });
} else {
  // 2. Running in web page: use postMessage bridge to extension/userscript
  try {
    const savedDemo = JSON.parse(localStorage.getItem("ratioyt_demo_settings") || "{}");
    applyToUI(savedDemo);
  } catch (_) {}

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;

    if (
      event.data.type === "RATIOYT_SETTINGS_RESPONSE" ||
      event.data.type === "RATIOYT_SETTINGS_UPDATED"
    ) {
      updateBadge(event.data.target || "extension");
      if (event.data.settings) {
        applyToUI(event.data.settings);
      }
    }
  });

  // Ping for content script or userscript bridge
  window.postMessage({ type: "RATIOYT_PING" }, "*");
  setTimeout(() => window.postMessage({ type: "RATIOYT_PING" }, "*"), 150);
}

// Event listeners for user input
UI.scoringSystem.addEventListener("change", (e) => save({ scoringSystem: e.target.value }));
UI.scoringColour.addEventListener("change", (e) => save({ scoringColour: e.target.checked }));
UI.hideOnlyMode.addEventListener("change", (e) => save({ hideOnlyMode: e.target.checked }));
UI.hideLowScore.addEventListener("change", (e) => {
  UI.filterOptions.classList.toggle("hidden", !e.target.checked);
  save({ hideLowScore: e.target.checked });
});
UI.lowScoreThreshold.addEventListener("input", (e) => {
  const value = parseInt(e.target.value, 10);
  UI.thresholdValue.textContent = `${value}%`;
  save({ lowScoreThreshold: value });
});
