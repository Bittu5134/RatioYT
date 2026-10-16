const UI = {
  scoringSystem: document.getElementById("scoringSystem"),
  scoringColour: document.getElementById("scoringColour"),
  hideOnlyMode: document.getElementById("hideOnlyMode"),
  hideLowScore: document.getElementById("hideLowScore"),
  filterOptions: document.getElementById("filterOptions"),
  lowScoreThreshold: document.getElementById("lowScoreThreshold"),
  thresholdValue: document.getElementById("thresholdValue"),
};

const DEFAULTS = {
  scoringSystem: "percentage",
  scoringColour: true,
  hideOnlyMode: false,
  hideLowScore: false,
  lowScoreThreshold: 25,
};

const save = (settings) => chrome.storage.local.set(settings);

chrome.storage.local.get(DEFAULTS, (config) => {
  UI.scoringSystem.value = config.scoringSystem;
  UI.scoringColour.checked = config.scoringColour;
  UI.hideOnlyMode.checked = config.hideOnlyMode;
  UI.hideLowScore.checked = config.hideLowScore;
  UI.lowScoreThreshold.value = config.lowScoreThreshold;
  UI.thresholdValue.textContent = `${config.lowScoreThreshold}%`;
  UI.filterOptions.classList.toggle("hidden", !config.hideLowScore);
});

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
