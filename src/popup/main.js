const UI = {
  scoringSystem: document.getElementById('scoringSystem'),
  scoringColour: document.getElementById('scoringColour'),
  hideLowScore: document.getElementById('hideLowScore'),
  thresholdWrapper: document.getElementById('thresholdWrapper'),
  lowScoreThreshold: document.getElementById('lowScoreThreshold'),
  thresholdValue: document.getElementById('thresholdValue')
};

// 1. Load configuration on startup + execute visibility rules
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get({
    scoringSystem: 'percentage',
    scoringColour: true,
    hideLowScore: false,
    lowScoreThreshold: 20
  }, (config) => {
    // Populate elements
    UI.scoringSystem.value = config.scoringSystem;
    UI.scoringColour.checked = config.scoringColour;
    UI.hideLowScore.checked = config.hideLowScore;
    UI.lowScoreThreshold.value = config.lowScoreThreshold;
    UI.thresholdValue.textContent = `${config.lowScoreThreshold}%`;

    // Process initial dynamic views
    toggleVisibility(UI.thresholdWrapper, config.hideLowScore);
  });
});

// Helper function to manage hidden states cleanly
function toggleVisibility(element, shouldShow) {
  if (shouldShow) {
    element.classList.remove('hidden');
  } else {
    element.classList.add('hidden');
  }
}

// 2. Storage Mutation Listeners
UI.scoringSystem.addEventListener('change', (e) => {
  chrome.storage.local.set({ scoringSystem: e.target.value });
});

UI.scoringColour.addEventListener('change', (e) => {
  chrome.storage.local.set({ scoringColour: e.target.checked });
});

UI.hideLowScore.addEventListener('change', (e) => {
  toggleVisibility(UI.thresholdWrapper, e.target.checked);
  chrome.storage.local.set({ hideLowScore: e.target.checked });
});

UI.lowScoreThreshold.addEventListener('input', (e) => {
  const value = e.target.value;
  UI.thresholdValue.textContent = `${value}%`;
  chrome.storage.local.set({ lowScoreThreshold: parseInt(value, 10) });
});