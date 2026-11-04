export const extensionPlatform = {
  type: "extension",
  dbName: "RatioYT",
  storage: {
    get(defaults, callback) {
      chrome.storage.local.get(defaults, (result) => {
        callback(result || defaults);
      });
    },
    set(values) {
      chrome.storage.local.set(values);
    },
    onChange(callback) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        const updated = {};
        for (const [key, change] of Object.entries(changes)) {
          updated[key] = change.newValue;
        }
        callback(updated);
      });
    },
  },
  async fetchVotes(videoId) {
    const response = await fetch(
      `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  onInit() {},
};
