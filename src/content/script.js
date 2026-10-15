import defaultSelectors from "../config/selectors.json";

let activeSelectors = { ...defaultSelectors };

// User preferences
let userSettings = {
  scoringSystem: "percentage",
  scoringColour: true,
  hideLowScore: false,
  lowScoreThreshold: 20,
};

// Queue & Throttling
let elementQueue = [];
let queueIntervalId = null;
let pendingVideos = new Set();
let scanScheduled = false;

// In-memory cache
let scoreDB = {};

const DB_NAME = "RatioYT";
const DB_STORE = "scores";
const DB_VERSION = 1;
let dbInstance = null;
let observerStarted = false;

// =========================================
// 1. SELECTORS & CONFIG (Local + GitHub Remote)
// =========================================

async function initSelectors() {
  try {
    const data = await chrome.storage.local.get(["remoteSelectors", "selectorsLastFetched"]);
    if (data.remoteSelectors && typeof data.remoteSelectors === "object") {
      activeSelectors = mergeConfigs(defaultSelectors, data.remoteSelectors);
      console.log(
        "[RatioYT] Loaded remote selectors from storage cache (v" +
          (activeSelectors.version || "1.0.0") +
          ")",
      );
    } else {
      // Try local extension asset fallback if available
      try {
        const localUrl = chrome.runtime.getURL("selectors.json");
        const res = await fetch(localUrl);
        if (res.ok) {
          const localJson = await res.json();
          activeSelectors = mergeConfigs(defaultSelectors, localJson);
        }
      } catch (e) {}
    }

    // Refresh from GitHub every 6 hours
    const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
    const lastFetched = data.selectorsLastFetched || 0;
    if (Date.now() - lastFetched > REFRESH_INTERVAL_MS) {
      fetchRemoteSelectors(activeSelectors.remoteConfigUrl);
    }
  } catch (err) {
    console.warn("[RatioYT] Error loading selectors from storage:", err);
  }
}

async function fetchRemoteSelectors(url) {
  if (!url) return;
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const remoteConfig = await response.json();

    if (remoteConfig && remoteConfig.containers && remoteConfig.targetRows) {
      activeSelectors = mergeConfigs(defaultSelectors, remoteConfig);
      await chrome.storage.local.set({
        remoteSelectors: remoteConfig,
        selectorsLastFetched: Date.now(),
      });
      console.log(
        "[RatioYT] Updated selectors from GitHub successfully (v" +
          (remoteConfig.version || "remote") +
          ")",
      );
    }
  } catch (err) {
    // Graceful fallback to local JSON
    console.log("[RatioYT] Using local selectors (remote update check failed:", err.message + ")");
  }
}

function mergeConfigs(base, override) {
  if (!override) return base;
  return {
    ...base,
    ...override,
    containers: { ...base.containers, ...(override.containers || {}) },
    links: { ...base.links, ...(override.links || {}) },
    targetRows: { ...base.targetRows, ...(override.targetRows || {}) },
    classes: {
      ...base.classes,
      ...(override.classes || {}),
      delimiter: { ...base.classes?.delimiter, ...(override.classes?.delimiter || {}) },
      score: { ...base.classes?.score, ...(override.classes?.score || {}) },
    },
    css: { ...base.css, ...(override.css || {}) },
  };
}

// =========================================
// 2. USER SETTINGS & LIVE BADGE UPDATES
// =========================================

function updateRenderedBadges() {
  const badges = document.querySelectorAll(".ratioyt-badge, .thumbscore-badge");
  badges.forEach((badge) => {
    const scoreVal = parseInt(badge.dataset.ratioytValue, 10);
    if (!isNaN(scoreVal)) {
      const card = badge.closest(
        "ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytd-compact-video-renderer",
      );
      applyFinalScore(badge, scoreVal, card);
    }
  });
}

function initUserSettings() {
  chrome.storage.local.get(
    {
      scoringSystem: "percentage",
      scoringColour: true,
      hideLowScore: false,
      lowScoreThreshold: 20,
    },
    (config) => {
      userSettings = { ...userSettings, ...config };
    },
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      let settingsChanged = false;
      for (const [key, change] of Object.entries(changes)) {
        if (key in userSettings) {
          userSettings[key] = change.newValue;
          settingsChanged = true;
        }
      }
      if (changes.remoteSelectors?.newValue) {
        activeSelectors = mergeConfigs(defaultSelectors, changes.remoteSelectors.newValue);
        settingsChanged = true;
      }
      if (settingsChanged) {
        updateRenderedBadges();
      }
    }
  });
}

// =========================================
// 3. STORAGE (IndexedDB Cache for single user)
// =========================================

function getStore(mode = "readonly") {
  if (!dbInstance) {
    console.warn("[RatioYT] Database connection is not ready yet.");
    return null;
  }
  return dbInstance.transaction(DB_STORE, mode).objectStore(DB_STORE);
}

function initializeDatabase() {
  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(DB_STORE)) {
      db.createObjectStore(DB_STORE, { keyPath: "videoId" });
    }
  };

  request.onsuccess = (event) => {
    dbInstance = event.target.result;

    const store = getStore();
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
      const allEntries = getAllRequest.result || [];
      const now = Date.now();
      let activeCount = 0;

      allEntries.forEach((entry) => {
        if (entry.expiresAt > now) {
          scoreDB[entry.videoId] = {
            score: entry.score,
            expiresAt: entry.expiresAt,
          };
          activeCount++;
        } else {
          // Clean up expired cache record
          deleteCacheRecord(entry.videoId);
        }
      });

      console.log("[RatioYT] Cache loaded:", activeCount, "valid entries");
      startObserver();
    };
  };

  request.onerror = (event) => {
    console.error("[RatioYT] IndexedDB initialization failed:", event.target.error);
    startObserver();
  };
}

function saveToIndexDB(videoId, scoreValue, expiresAt) {
  const store = getStore("readwrite");
  if (!store) return;

  const newEntry = {
    videoId: videoId,
    score: scoreValue,
    expiresAt: expiresAt,
  };

  scoreDB[videoId] = { score: scoreValue, expiresAt: expiresAt };
  store.put(newEntry);
}

function deleteCacheRecord(videoId) {
  delete scoreDB[videoId];
  const store = getStore("readwrite");
  if (!store) return false;
  store.delete(videoId);
  return true;
}

// =========================================
// 4. SELECTOR & DOM RESOLUTION HELPERS
// =========================================

function queryFirst(parent, selectors) {
  if (!parent || !selectors) return null;
  const list = Array.isArray(selectors) ? selectors : [selectors];
  let fallback = null;
  for (const selector of list) {
    try {
      const el = parent.querySelector(selector);
      if (el) {
        // Skip hidden elements if a visible one exists
        if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") {
          if (!fallback) fallback = el;
          continue;
        }
        return el;
      }
    } catch (e) {}
  }
  return fallback;
}

function isMatch(el, selectors) {
  if (!el || !selectors || !el.matches) return false;
  const list = Array.isArray(selectors) ? selectors : [selectors];
  return list.some((selector) => {
    try {
      return el.matches(selector);
    } catch (e) {
      return false;
    }
  });
}

function isElementInViewport(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return (
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.left <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

function getCardCategory(el) {
  if (isMatch(el, activeSelectors.containers.shorts)) return "shorts";
  if (isMatch(el, activeSelectors.containers.search)) return "search";
  if (isMatch(el, activeSelectors.containers.playlist)) return "playlist";
  return "lockup";
}

function getVideoId(el, category) {
  try {
    if (category === "shorts") {
      const link = queryFirst(el, activeSelectors.links.shorts);
      if (!link) return null;
      const href = link.getAttribute("href") || "";
      const shortPart = href.split("/shorts/")[1];
      return shortPart ? shortPart.split("?")[0] : null;
    }

    let link = queryFirst(el, activeSelectors.links.regular);

    // If not found in the element itself, search ancestor lockup container
    if (!link && activeSelectors.links.lockupParents) {
      for (const parentSelector of activeSelectors.links.lockupParents) {
        const parentHost = el.closest(parentSelector);
        if (parentHost) {
          link = queryFirst(parentHost, activeSelectors.links.regular);
          if (link) break;
        }
      }
    }

    if (!link) return null;
    const href = link.getAttribute("href") || "";
    const params = new URLSearchParams(href.split("?")[1] || "");
    return params.get("v");
  } catch (err) {
    return null;
  }
}

function getTargetRow(el, category) {
  if (category === "shorts") {
    return queryFirst(el, activeSelectors.targetRows.shortsMetadata);
  }
  if (category === "search") {
    return queryFirst(el, activeSelectors.targetRows.searchMetadata);
  }
  if (category === "playlist") {
    return (
      queryFirst(el, activeSelectors.targetRows.playlistMetadata) ||
      queryFirst(el, activeSelectors.targetRows.lockupMetadata)
    );
  }

  // Lockup / Content Metadata
  const rows = el.querySelectorAll(
    activeSelectors.targetRows.lockupMetadataRows?.join(", ") ||
      ".ytContentMetadataViewModelMetadataRow",
  );
  if (rows && rows.length > 0) {
    return rows.length >= 2 ? rows[1] : rows[0];
  }

  return (
    queryFirst(el, activeSelectors.targetRows.searchMetadata) ||
    queryFirst(el, activeSelectors.targetRows.lockupMetadata) ||
    queryFirst(el, activeSelectors.targetRows.playlistMetadata)
  );
}

// =========================================
// 5. UI INJECTION & STYLING
// =========================================

function injectPlaceholder(targetRow, category) {
  const isSearch = category === "search";
  let nativeSeparator = null;

  if (isSearch && activeSelectors.targetRows.searchSeparator) {
    nativeSeparator = queryFirst(targetRow, activeSelectors.targetRows.searchSeparator);
    if (nativeSeparator) {
      nativeSeparator.removeAttribute("hidden");
    }
  }

  // Delimiter (ensure only one delimiter exists in this row)
  if (!nativeSeparator) {
    const existingDelims = targetRow.querySelectorAll(".ratioyt-delimiter, .thumbscore-delimiter");
    for (let i = 1; i < existingDelims.length; i++) {
      existingDelims[i].remove();
    }

    let delimiter = existingDelims[0] || null;
    if (!delimiter) {
      delimiter = document.createElement("span");
      const delimClasses = [
        ...(activeSelectors.classes?.delimiter?.[category] || [
          "ytContentMetadataViewModelDelimiter",
        ]),
        "ratioyt-delimiter",
      ];
      delimiter.className = delimClasses.join(" ");
      delimiter.textContent = activeSelectors.css?.delimiterText || " • ";
      if (activeSelectors.css?.delimiterStyle) {
        delimiter.style.cssText = activeSelectors.css.delimiterStyle;
      }
      targetRow.appendChild(delimiter);
    }
  }

  // Score badge (re-use if already present, clean up any duplicates)
  const existingBadges = targetRow.querySelectorAll(".ratioyt-badge, .thumbscore-badge");
  for (let i = 1; i < existingBadges.length; i++) {
    existingBadges[i].remove();
  }

  let scoreSpan = existingBadges[0] || null;
  if (!scoreSpan) {
    scoreSpan = document.createElement("span");
    const scoreClasses = [
      ...(activeSelectors.classes?.score?.[category] || [
        "ytAttributedStringHost",
        "ytContentMetadataViewModelMetadataText",
      ]),
      ...(activeSelectors.classes?.badgeCustom || ["ratioyt-badge"]),
    ];
    scoreSpan.className = scoreClasses.join(" ");
    scoreSpan.classList.add("ratioyt-badge");
    scoreSpan.style.color = activeSelectors.css?.placeholderColor || "#888888";
    scoreSpan.textContent = activeSelectors.css?.placeholderText || "--%";

    if (activeSelectors.css?.scoreStyle) {
      scoreSpan.style.cssText += activeSelectors.css.scoreStyle;
    }

    targetRow.appendChild(scoreSpan);
  } else {
    scoreSpan.classList.add("ratioyt-badge");
    // Reset to placeholder if refreshed
    scoreSpan.style.color = activeSelectors.css?.placeholderColor || "#888888";
    scoreSpan.textContent = activeSelectors.css?.placeholderText || "--%";
  }

  return scoreSpan;
}

function formatScoreText(scoreValue, format) {
  switch (format) {
    case "decimal":
      return `${(scoreValue / 10).toFixed(1)}/10`;
    case "point":
      return `${Math.round(scoreValue / 10)}/10`;
    case "star":
      return `★ ${(scoreValue / 20).toFixed(1)}/5`;
    case "smiley": {
      const emoji = scoreValue >= 70 ? "😊" : scoreValue >= 40 ? "😐" : "😞";
      return `${emoji} ${scoreValue}%`;
    }
    case "percentage":
    default:
      return `${scoreValue}%`;
  }
}

function applyFinalScore(placeholderElement, scoreValue, cardElement) {
  if (!placeholderElement) return;

  placeholderElement.dataset.ratioytValue = String(scoreValue);
  placeholderElement.textContent = formatScoreText(scoreValue, userSettings.scoringSystem);

  if (userSettings.scoringColour) {
    placeholderElement.style.color = `hsl(${scoreValue * 1.2}, 100%, 45%)`;
  } else {
    placeholderElement.style.color = "";
  }

  // Non-destructive low score visibility management
  if (cardElement) {
    const hostCard =
      cardElement.closest(
        "ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytd-compact-video-renderer",
      ) || cardElement;
    if (hostCard) {
      if (userSettings.hideLowScore && scoreValue < userSettings.lowScoreThreshold) {
        hostCard.style.display = "none";
        hostCard.dataset.ratioytHidden = "true";
      } else if (!userSettings.hideLowScore && hostCard.dataset.ratioytHidden === "true") {
        hostCard.style.display = "";
        delete hostCard.dataset.ratioytHidden;
      }
    }
  }
}

// =========================================
// 6. QUEUE & NETWORK REQUESTS
// =========================================

async function processQueue() {
  // Purge any detached or orphaned tasks from queue immediately
  let currentTask = null;
  while (elementQueue.length > 0) {
    const candidate = elementQueue.shift();
    if (candidate.placeholderElement && document.body.contains(candidate.placeholderElement)) {
      currentTask = candidate;
      break;
    } else {
      pendingVideos.delete(candidate.videoId);
    }
  }

  if (!currentTask) {
    if (elementQueue.length === 0 && queueIntervalId) {
      clearInterval(queueIntervalId);
      queueIntervalId = null;
    }
    return;
  }

  const videoID = currentTask.videoId;
  const placeholderElement = currentTask.placeholderElement;
  const cardElement = currentTask.cardElement;

  pendingVideos.delete(videoID);

  // Check if cache was populated while waiting in queue
  const cachedRecord = scoreDB[videoID];
  if (cachedRecord !== undefined && cachedRecord.expiresAt > Date.now()) {
    applyFinalScore(placeholderElement, cachedRecord.score, cardElement);
    return;
  }

  try {
    const response = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoID}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const votes = await response.json();

    if (votes.deleted || (votes.likes === undefined && votes.dislikes === undefined)) {
      placeholderElement.textContent = "N/A";
      return;
    }

    const total = votes.likes + votes.dislikes;
    const fetchedScore = total > 0 ? Math.round((votes.likes / total) * 100) : 0;

    // Cache for 7 days
    const expirationTimestamp = Date.now() + 7 * 24 * 60 * 60 * 1000;
    saveToIndexDB(videoID, fetchedScore, expirationTimestamp);

    applyFinalScore(placeholderElement, fetchedScore, cardElement);
  } catch (err) {
    console.warn("[RatioYT] API fetch failed for", videoID, err.message);
    placeholderElement.textContent = "--%";
  }
}

// =========================================
// 7. OBSERVER & LIFECYCLE
// =========================================

function scanAndProcessCards() {
  const selectorList = activeSelectors.containers?.observe || [];
  if (selectorList.length === 0) return;

  const elements = document.querySelectorAll(selectorList.join(", "));

  elements.forEach((el) => {
    const category = getCardCategory(el);
    const videoId = getVideoId(el, category);
    if (!videoId) return;

    const targetRow = getTargetRow(el, category);
    if (!targetRow) return;

    // Skip if already processed for this specific video ID and badge exists
    const existingBadge = targetRow.querySelector(".ratioyt-badge, .thumbscore-badge");
    if (el.dataset.ratioytVideoId === videoId && existingBadge) {
      return;
    }

    el.dataset.ratioytVideoId = videoId;
    const placeholderElement = injectPlaceholder(targetRow, category);
    const cachedRecord = scoreDB[videoId];

    if (cachedRecord !== undefined && cachedRecord.expiresAt > Date.now()) {
      applyFinalScore(placeholderElement, cachedRecord.score, el);
    } else {
      if (cachedRecord !== undefined) deleteCacheRecord(videoId);
      if (!pendingVideos.has(videoId)) {
        pendingVideos.add(videoId);
        const task = {
          videoId: videoId,
          placeholderElement: placeholderElement,
          cardElement: el,
        };

        // Prioritize cards currently visible in viewport
        if (isElementInViewport(placeholderElement)) {
          elementQueue.unshift(task);
        } else {
          elementQueue.push(task);
        }
      }
    }
  });

  if (elementQueue.length > 0 && !queueIntervalId) {
    queueIntervalId = setInterval(processQueue, 500);
  }
}

// Debounce DOM scanning to prevent UI lag while ensuring execution in all tab states
let scanTimeout = null;
function scheduleScan() {
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => {
    scanTimeout = null;
    scanAndProcessCards();
  }, 60);
}

const observer = new MutationObserver(() => {
  scheduleScan();
});

function startObserver() {
  const target = document.body || document.documentElement;
  if (!target) {
    window.addEventListener("DOMContentLoaded", () => startObserver(), { once: true });
    return;
  }

  if (observerStarted) {
    scheduleScan();
    return;
  }
  observerStarted = true;

  scanAndProcessCards();
  observer.observe(target, { childList: true, subtree: true });
}

window.addEventListener("yt-navigate-start", () => {
  elementQueue = [];
  pendingVideos.clear();
  if (queueIntervalId) {
    clearInterval(queueIntervalId);
    queueIntervalId = null;
  }
});

window.addEventListener("yt-navigate-finish", () => {
  scheduleScan();
});

window.addEventListener("DOMContentLoaded", () => scheduleScan());
window.addEventListener("load", () => scheduleScan());
window.addEventListener("popstate", () => scheduleScan());

// Initialization
initUserSettings();
initSelectors().then(() => {
  initializeDatabase();
});
