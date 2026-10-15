import defaultSelectors from "../config/selectors.json";

let activeSelectors = { ...defaultSelectors };

let userSettings = {
  scoringSystem: "percentage",
  scoringColour: true,
  hideOnlyMode: false,
  hideLowScore: false,
  lowScoreThreshold: 25,
  hideStyle: "collapse",
};

let elementQueue = [];
let queueIntervalId = null;
let pendingVideos = new Set();
let scanTimeout = null;
let scoreDB = {};

const DB_NAME = "RatioYT";
const DB_STORE = "scores";
const DB_VERSION = 1;
let dbInstance = null;
let observerStarted = false;

// =========================================
// 1. STYLES & CONFIG
// =========================================

function injectCustomStyles() {
  if (document.getElementById("ratioyt-styles")) return;
  const style = document.createElement("style");
  style.id = "ratioyt-styles";
  style.textContent = `
    .ratioyt-blur-host {
      position: relative !important;
    }
    .ratioyt-blur-target {
      filter: blur(24px) brightness(0.2) !important;
      -webkit-filter: blur(24px) brightness(0.2) !important;
      pointer-events: none !important;
      user-select: none !important;
      transition: filter 0.25s ease !important;
    }
    .ratioyt-blur-overlay {
      position: absolute !important;
      inset: 0 !important;
      z-index: 100 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 6px !important;
      background: rgba(0, 0, 0, 0.5) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
      border-radius: 12px !important;
      cursor: pointer !important;
      user-select: none !important;
      transition: all 0.2s ease !important;
    }
    .ratioyt-blur-overlay:hover {
      background: rgba(0, 0, 0, 0.3) !important;
    }
    .ratioyt-blur-pill {
      background: rgba(255, 59, 48, 0.95) !important;
      color: #ffffff !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      padding: 3px 10px !important;
      border-radius: 20px !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    }
    .ratioyt-blur-sub {
      font-size: 10px !important;
      color: #e0e0e0 !important;
      font-weight: 500 !important;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    }
    .ratioyt-unblurred .ratioyt-blur-target {
      filter: none !important;
      -webkit-filter: none !important;
      pointer-events: auto !important;
    }
    .ratioyt-unblurred .ratioyt-blur-overlay {
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .ratioyt-hide-badges .ratioyt-badge:not(.ratioyt-force-show),
    .ratioyt-hide-badges .ratioyt-delimiter:not(.ratioyt-force-show) {
      display: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

async function initSelectors() {
  try {
    const data = await chrome.storage.local.get(["remoteSelectors", "selectorsLastFetched"]);
    if (data.remoteSelectors && typeof data.remoteSelectors === "object") {
      activeSelectors = mergeConfigs(defaultSelectors, data.remoteSelectors);
    } else {
      try {
        const localUrl = chrome.runtime.getURL("selectors.json");
        const res = await fetch(localUrl);
        if (res.ok) {
          activeSelectors = mergeConfigs(defaultSelectors, await res.json());
        }
      } catch (e) {}
    }

    const lastFetched = data.selectorsLastFetched || 0;
    if (Date.now() - lastFetched > 6 * 60 * 60 * 1000) {
      fetchRemoteSelectors(activeSelectors.remoteConfigUrl);
    }
  } catch (err) {
    console.warn("[RatioYT] Failed to load selectors:", err);
  }
}

async function fetchRemoteSelectors(url) {
  if (!url) return;
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const remoteConfig = await response.json();

    if (remoteConfig?.containers && remoteConfig?.targetRows) {
      activeSelectors = mergeConfigs(defaultSelectors, remoteConfig);
      await chrome.storage.local.set({
        remoteSelectors: remoteConfig,
        selectorsLastFetched: Date.now(),
      });
    }
  } catch (err) {
    console.log("[RatioYT] Remote selectors fetch failed, using local:", err.message);
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

function initUserSettings() {
  chrome.storage.local.get(
    {
      scoringSystem: "percentage",
      scoringColour: true,
      hideOnlyMode: false,
      hideLowScore: false,
      lowScoreThreshold: 25,
      hideStyle: "collapse",
    },
    (config) => {
      userSettings = { ...userSettings, ...config };
      applyGlobalBadgeVisibility();
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
        applyGlobalBadgeVisibility();
        updateRenderedBadges();
      }
    }
  });
}

function applyGlobalBadgeVisibility() {
  const root = document.documentElement;
  if (userSettings.hideOnlyMode) {
    root.classList.add("ratioyt-hide-badges");
  } else {
    root.classList.remove("ratioyt-hide-badges");
  }
}

function updateRenderedBadges() {
  document.querySelectorAll(".ratioyt-badge").forEach((badge) => {
    const scoreVal = parseInt(badge.dataset.ratioytValue, 10);
    if (!isNaN(scoreVal)) {
      const card = badge.closest(
        "ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytd-compact-video-renderer",
      );
      applyFinalScore(badge, scoreVal, card);
    }
  });
}

// =========================================
// 2. STORAGE (IndexedDB Cache)
// =========================================

function getStore(mode = "readonly") {
  if (!dbInstance) return null;
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

      allEntries.forEach((entry) => {
        if (entry.expiresAt > now) {
          scoreDB[entry.videoId] = { score: entry.score, expiresAt: entry.expiresAt };
        } else {
          deleteCacheRecord(entry.videoId);
        }
      });

      startObserver();
    };
  };

  request.onerror = (event) => {
    console.error("[RatioYT] IndexedDB error:", event.target.error);
    startObserver();
  };
}

function saveToIndexDB(videoId, scoreValue, expiresAt) {
  const store = getStore("readwrite");
  if (!store) return;
  scoreDB[videoId] = { score: scoreValue, expiresAt };
  store.put({ videoId, score: scoreValue, expiresAt });
}

function deleteCacheRecord(videoId) {
  delete scoreDB[videoId];
  const store = getStore("readwrite");
  if (store) store.delete(videoId);
}

// =========================================
// 3. SELECTOR & DOM HELPERS
// =========================================

function isFilterAllowedPage() {
  const path = window.location.pathname;
  return path === "/" || path === "/results";
}

function queryFirst(parent, selectors) {
  if (!parent || !selectors) return null;
  const list = Array.isArray(selectors) ? selectors : [selectors];
  let fallback = null;
  for (const selector of list) {
    try {
      const el = parent.querySelector(selector);
      if (el) {
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
    return new URLSearchParams(href.split("?")[1] || "").get("v");
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
// 4. UI INJECTION & STYLING
// =========================================

function injectPlaceholder(targetRow, category) {
  const isSearch = category === "search";

  if (isSearch && activeSelectors.targetRows.searchSeparator) {
    const sep = queryFirst(targetRow, activeSelectors.targetRows.searchSeparator);
    if (sep) sep.removeAttribute("hidden");
  } else if (!targetRow.querySelector(".ratioyt-delimiter")) {
    const delim = document.createElement("span");
    const classes = activeSelectors.classes?.delimiter?.[category] || [
      "ytContentMetadataViewModelDelimiter",
    ];
    delim.className = `${classes.join(" ")} ratioyt-delimiter`;
    delim.textContent = activeSelectors.css?.delimiterText || " • ";
    if (activeSelectors.css?.delimiterStyle) delim.style.cssText = activeSelectors.css.delimiterStyle;
    targetRow.appendChild(delim);
  }

  let badge = targetRow.querySelector(".ratioyt-badge");
  if (!badge) {
    badge = document.createElement("span");
    const classes = activeSelectors.classes?.score?.[category] || [
      "ytAttributedStringHost",
      "ytContentMetadataViewModelMetadataText",
    ];
    badge.className = `${classes.join(" ")} ratioyt-badge`;
    if (activeSelectors.css?.scoreStyle) badge.style.cssText = activeSelectors.css.scoreStyle;
    targetRow.appendChild(badge);
  }

  badge.style.color = activeSelectors.css?.placeholderColor || "#888888";
  badge.textContent = activeSelectors.css?.placeholderText || "--%";
  return badge;
}

function formatScoreText(scoreValue, format) {
  switch (format) {
    case "decimal":
      return `${Math.round(scoreValue / 10)}/10`;
    case "smiley": {
      // Smiley emoji only (no percentage)
      return scoreValue >= 70 ? "😊" : scoreValue >= 40 ? "😐" : "😞";
    }
    case "stars": {
      // Star unicodes (1 to 5 stars)
      const count = Math.max(1, Math.min(5, Math.round(scoreValue / 20)));
      return "🌟".repeat(count);
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
  placeholderElement.style.color = userSettings.scoringColour
    ? `hsl(${scoreValue * 1.2}, 100%, 45%)`
    : "";

  if (cardElement) {
    const hostCard =
      cardElement.closest(
        "ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytd-compact-video-renderer",
      ) || cardElement;

    if (hostCard) {
      applyHideEffect(hostCard, scoreValue);
    }
  }
}

function applyHideEffect(hostCard, scoreValue) {
  const isAllowedPage = isFilterAllowedPage();
  const shouldHide =
    isAllowedPage && userSettings.hideLowScore && scoreValue < userSettings.lowScoreThreshold;

  if (!shouldHide) {
    // Restore video card completely
    if (hostCard.dataset.ratioytHidden === "true") {
      hostCard.style.display = "";
      delete hostCard.dataset.ratioytHidden;
    }
    hostCard.classList.remove("ratioyt-blur-host", "ratioyt-unblurred");
    const targetContent = hostCard.querySelector(".ratioyt-blur-target");
    if (targetContent) targetContent.classList.remove("ratioyt-blur-target");
    const overlay = hostCard.querySelector(".ratioyt-blur-overlay");
    if (overlay) overlay.remove();
    return;
  }

  // Handle Hiding Style
  if (userSettings.hideStyle === "blur") {
    // 1. Remove collapse display
    if (hostCard.dataset.ratioytHidden === "true") {
      hostCard.style.display = "";
      delete hostCard.dataset.ratioytHidden;
    }

    // 2. Apply extreme blur & dim effect
    hostCard.classList.add("ratioyt-blur-host");
    const mainContent =
      hostCard.querySelector(
        "#content, .ytLockupViewModelHost, .shortsLockupViewModelHost, #dismissible",
      ) || hostCard;
    mainContent.classList.add("ratioyt-blur-target");

    // 3. Create or update blur overlay div
    let overlay = hostCard.querySelector(".ratioyt-blur-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "ratioyt-blur-overlay";
      overlay.innerHTML = `
        <span class="ratioyt-blur-pill">🛡️ Hidden (${scoreValue}%)</span>
        <span class="ratioyt-blur-sub">Click to preview</span>
      `;
      overlay.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hostCard.classList.toggle("ratioyt-unblurred");
      });
      hostCard.appendChild(overlay);
    } else {
      const pill = overlay.querySelector(".ratioyt-blur-pill");
      if (pill) pill.textContent = `🛡️ Hidden (${scoreValue}%)`;
    }
  } else {
    // Style === 'collapse' (remove video & gap all together)
    hostCard.classList.remove("ratioyt-blur-host", "ratioyt-unblurred");
    const targetContent = hostCard.querySelector(".ratioyt-blur-target");
    if (targetContent) targetContent.classList.remove("ratioyt-blur-target");
    const overlay = hostCard.querySelector(".ratioyt-blur-overlay");
    if (overlay) overlay.remove();

    hostCard.style.display = "none";
    hostCard.dataset.ratioytHidden = "true";
  }
}

// =========================================
// 5. QUEUE & NETWORK
// =========================================

async function processQueue() {
  let currentTask = null;
  while (elementQueue.length > 0) {
    const candidate = elementQueue.shift();
    if (candidate.placeholderElement && document.body.contains(candidate.placeholderElement)) {
      currentTask = candidate;
      break;
    }
    pendingVideos.delete(candidate.videoId);
  }

  if (!currentTask) {
    if (elementQueue.length === 0 && queueIntervalId) {
      clearInterval(queueIntervalId);
      queueIntervalId = null;
    }
    return;
  }

  const { videoId, placeholderElement, cardElement } = currentTask;
  pendingVideos.delete(videoId);

  const cachedRecord = scoreDB[videoId];
  if (cachedRecord !== undefined && cachedRecord.expiresAt > Date.now()) {
    applyFinalScore(placeholderElement, cachedRecord.score, cardElement);
    return;
  }

  try {
    const response = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const votes = await response.json();

    if (votes.deleted || (votes.likes === undefined && votes.dislikes === undefined)) {
      placeholderElement.textContent = "N/A";
      return;
    }

    const total = votes.likes + votes.dislikes;
    const score = total > 0 ? Math.round((votes.likes / total) * 100) : 0;
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    saveToIndexDB(videoId, score, expiresAt);
    applyFinalScore(placeholderElement, score, cardElement);
  } catch (err) {
    console.warn("[RatioYT] Failed score for", videoId, err.message);
    placeholderElement.textContent = "--%";
  }
}

// =========================================
// 6. OBSERVER & LIFECYCLE
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

    const existingBadge = targetRow.querySelector(".ratioyt-badge");
    if (el.dataset.ratioytVideoId === videoId && existingBadge) {
      return;
    }

    el.dataset.ratioytVideoId = videoId;
    const badge = injectPlaceholder(targetRow, category);
    const cachedRecord = scoreDB[videoId];

    if (cachedRecord !== undefined && cachedRecord.expiresAt > Date.now()) {
      applyFinalScore(badge, cachedRecord.score, el);
    } else {
      if (cachedRecord !== undefined) deleteCacheRecord(videoId);
      if (!pendingVideos.has(videoId)) {
        pendingVideos.add(videoId);
        const task = { videoId, placeholderElement: badge, cardElement: el };
        if (isElementInViewport(badge)) {
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

function scheduleScan() {
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => {
    scanTimeout = null;
    scanAndProcessCards();
  }, 60);
}

const observer = new MutationObserver(() => scheduleScan());

function startObserver() {
  injectCustomStyles();

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
  injectCustomStyles();
  applyGlobalBadgeVisibility();
  scheduleScan();
});

window.addEventListener("DOMContentLoaded", () => {
  injectCustomStyles();
  applyGlobalBadgeVisibility();
  scheduleScan();
});
window.addEventListener("load", () => scheduleScan());
window.addEventListener("popstate", () => scheduleScan());

initUserSettings();
initSelectors().then(() => initializeDatabase());
