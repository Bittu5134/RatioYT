const UI = {
  scoringSystem: document.getElementById("scoringSystem"),
  scoringColour: document.getElementById("scoringColour"),
  hideOnlyMode: document.getElementById("hideOnlyMode"),
  hideLowScore: document.getElementById("hideLowScore"),
  filterOptions: document.getElementById("filterOptions"),
  lowScoreThreshold: document.getElementById("lowScoreThreshold"),
  thresholdValue: document.getElementById("thresholdValue"),
};

// Default settings
const DEFAULTS = {
  scoringSystem: "percentage",
  scoringColour: true,
  hideOnlyMode: false,
  hideLowScore: false,
  lowScoreThreshold: 25,
};

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(DEFAULTS, (config) => {
    // 1. Populate values
    UI.scoringSystem.value = config.scoringSystem;
    UI.scoringColour.checked = config.scoringColour;
    UI.hideOnlyMode.checked = config.hideOnlyMode;
    UI.hideLowScore.checked = config.hideLowScore;
    UI.lowScoreThreshold.value = config.lowScoreThreshold;
    UI.thresholdValue.textContent = `${config.lowScoreThreshold}%`;

    // 2. Initial visibility
    toggleFilterOptions(config.hideLowScore);
  });
});

function toggleFilterOptions(show) {
  if (show) {
    UI.filterOptions.classList.remove("hidden");
  } else {
    UI.filterOptions.classList.add("hidden");
  }
}

// Event Listeners
UI.scoringSystem.addEventListener("change", (e) => {
  chrome.storage.local.set({ scoringSystem: e.target.value });
});

UI.scoringColour.addEventListener("change", (e) => {
  chrome.storage.local.set({ scoringColour: e.target.checked });
});

UI.hideOnlyMode.addEventListener("change", (e) => {
  chrome.storage.local.set({ hideOnlyMode: e.target.checked });
});

UI.hideLowScore.addEventListener("change", (e) => {
  const isEnabled = e.target.checked;
  toggleFilterOptions(isEnabled);
  chrome.storage.local.set({ hideLowScore: isEnabled });
});

UI.lowScoreThreshold.addEventListener("input", (e) => {
  const val = parseInt(e.target.value, 10);
  UI.thresholdValue.textContent = `${val}%`;
  chrome.storage.local.set({ lowScoreThreshold: val });
});
