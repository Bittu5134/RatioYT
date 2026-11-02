import defaultSelectors from "../config/selectors.json";

let activeSelectors = { ...defaultSelectors };

const DEFAULTS = {
  scoringSystem: "percentage",
  scoringColour: true,
  hideOnlyMode: false,
  hideLowScore: false,
  lowScoreThreshold: 25,
};
let userSettings = { ...DEFAULTS };

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 5 * 60 * 1000;
const MIN_FETCH_GAP_MS = 300;
const SMILEY_GOOD = 70;
const SMILEY_MEH = 40;

const DB_NAME = "RatioYT";
const DB_STORE = "scores";
const DB_VERSION = 1;
let dbInstance = null;

// In-memory cache for synchronous instant lookups during DOM scans
const scoreDB = new Map();
const pendingVideos = new Set();
const failedVideos = new Map();
const taskQueue = [];
let isDraining = false;
let lastFetchTime = 0;
let scanTimeout = null;

// =========================================
// 1. STYLES & SETTINGS
// =========================================

function injectCustomStyles() {
  if (document.getElementById("ratioyt-styles")) return;
  const style = document.createElement("style");
  style.id = "ratioyt-styles";
  style.textContent = `
    .ratioyt-hide-badges .ratioyt-badge,
    .ratioyt-hide-badges .ratioyt-row,
    .ratioyt-hide-badges .ratioyt-delimiter {
      display: none !important;
    }
    .ratioyt-stars-wrap {
      display: inline-flex !important;
      align-items: center !important;
      gap: 1.5px !important;
      vertical-align: -1.5px !important;
    }
    .ratioyt-star {
      display: inline-block !important;
      flex-shrink: 0 !important;
    }
    .ratioyt-row {
      display: block !important;
      margin-top: 2px !important;
    }
    .ratioyt-badge {
      font-size: inherit;
    }
    .ratioyt-delimiter {
      opacity: 0.6;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function initUserSettings() {
  chrome.storage.local.get(DEFAULTS, (config) => {
    userSettings = { ...userSettings, ...config };
    applyGlobalBadgeVisibility();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let settingsChanged = false;

    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULTS) {
        userSettings[key] = change.newValue;
        settingsChanged = true;
      }
    }
    if (settingsChanged) {
      applyGlobalBadgeVisibility();
      updateRenderedCards();
      scheduleScan();
    }
  });
}

function updateRenderedCards() {
  document.querySelectorAll(".ratioyt-badge").forEach((badge) => {
    const score = parseInt(badge.dataset.ratioytValue, 10);
    const card = badge.closest(
      "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2, yt-shorts-lockup-view-model, ytm-shorts-lockup-view-model, yt-lockup-view-model, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, .ytp-ce-element"
    );
    if (!isNaN(score) && card) {
      applyScore(card, badge, score);
    }
  });
}

function applyGlobalBadgeVisibility() {
  document.documentElement.classList.toggle(
    "ratioyt-hide-badges",
    userSettings.hideOnlyMode,
  );
}

// =========================================
// 2. STORAGE (IndexedDB)
// =========================================

function openDatabase() {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "videoId" });
      }
    };
    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      loadCachedScores().then(resolve);
    };
    request.onerror = () => resolve();
  });
}

function loadCachedScores() {
  return new Promise((resolve) => {
    if (!dbInstance) return resolve();
    const tx = dbInstance.transaction(DB_STORE, "readwrite");
    const store = tx.objectStore(DB_STORE);
    const getAll = store.getAll();

    getAll.onsuccess = () => {
      const now = Date.now();
      for (const entry of getAll.result || []) {
        if (entry.expiresAt > now) {
          scoreDB.set(entry.videoId, entry);
        } else {
          store.delete(entry.videoId);
        }
      }
      resolve();
    };
    getAll.onerror = () => resolve();
  });
}

function saveToCache(videoId, score) {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  const record = { videoId, score, expiresAt };
  scoreDB.set(videoId, record);

  if (dbInstance) {
    try {
      dbInstance
        .transaction(DB_STORE, "readwrite")
        .objectStore(DB_STORE)
        .put(record);
    } catch (_) {}
  }
}

// =========================================
// 3. DOM HELPERS
// =========================================

function getVideoId(el) {
  const link =
    el.querySelector?.('a[href*="watch?v="], a[href*="/shorts/"]') ||
    (el.matches?.('a[href*="watch?v="], a[href*="/shorts/"]') ? el : null);
  if (!link) return null;
  const href = link.getAttribute("href") || "";
  const match = href.match(/(?:v=|shorts\/)([\w-]{11})/);
  return match ? match[1] : null;
}

function getCardContainer(card) {
  return (
    card.closest(
      "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2, yt-shorts-lockup-view-model, ytm-shorts-lockup-view-model, yt-lockup-view-model, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, .ytp-ce-element"
    ) || card
  );
}

function getTargetRow(card) {
  // If modern lockup, prefer the second metadata row (views & time), else the first
  const lockupRows = card.querySelectorAll(".ytContentMetadataViewModelMetadataRow");
  if (lockupRows.length >= 2) return lockupRows[1];
  if (lockupRows.length === 1) return lockupRows[0];

  const selectors = [
    "#metadata-line",
    ".ytLockupMetadataViewModelHost",
    ".shortsLockupViewModelHostOutsideMetadataSubhead",
    ".shortsLockupViewModelHostMetadataSubhead",
    ".shortsLockupViewModelHostOutsideMetadata",
    "yt-reel-metadatabar-view-model",
    "#video-info",
    "#metadata",
  ];
  for (const s of selectors) {
    const row = card.querySelector(s);
    if (row) return row;
  }
  return null;
}

function isElementInViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= innerHeight &&
    rect.left <= innerWidth
  );
}

// =========================================
// 4. BADGE RENDERING & CARD REMOVAL
// =========================================

const STAR_PATH =
  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
const STAR_SVG = {
  full: `<svg class="ratioyt-star" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="${STAR_PATH}"/></svg>`,
  half: `<svg class="ratioyt-star" viewBox="0 0 24 24" width="12" height="12"><path d="${STAR_PATH}" fill="currentColor" opacity="0.25"/><path d="M12 2v15.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/></svg>`,
  empty: `<svg class="ratioyt-star" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" opacity="0.25"><path d="${STAR_PATH}"/></svg>`,
};

function renderStarSvgs(score) {
  const rating = Math.max(0, Math.min(5, Math.round((score / 100) * 10) / 2));
  const full = Math.floor(rating);
  const hasHalf = rating % 1 !== 0;

  let html = `<span class="ratioyt-stars-wrap" title="${rating} / 5 stars (${score}%)">`;
  html += STAR_SVG.full.repeat(full);
  if (hasHalf) html += STAR_SVG.half;
  html += STAR_SVG.empty.repeat(5 - full - (hasHalf ? 1 : 0));
  html += `</span>`;
  return html;
}

function formatScoreText(score, format) {
  switch (format) {
    case "decimal":
      return `${Math.round(score / 10)}/10`;
    case "smiley":
      return score >= SMILEY_GOOD ? "😊" : score >= SMILEY_MEH ? "😐" : "😞";
    case "percentage":
    default:
      return `${score}%`;
  }
}

function ensureBadgeFits(badge) {
  const row = badge.parentElement;
  if (!row || row.classList.contains("ratioyt-row") || row.clientWidth === 0) return;

  const rowRect = row.getBoundingClientRect();
  const badgeRect = badge.getBoundingClientRect();
  const isOverflowing =
    row.scrollWidth > row.clientWidth + 1 ||
    (rowRect.right > 0 && badgeRect.right > rowRect.right + 1);

  if (!isOverflowing) return;

  row.querySelector(".ratioyt-delimiter")?.remove();
  let ownRow = row.parentElement?.querySelector(".ratioyt-row");
  if (!ownRow) {
    ownRow = document.createElement(row.tagName);
    ownRow.className = `${row.className} ratioyt-row`;
    row.after(ownRow);
  }
  ownRow.appendChild(badge);
}

function injectBadge(targetRow) {
  let badge =
    targetRow.querySelector(".ratioyt-badge") ||
    targetRow.parentElement?.querySelector(".ratioyt-row .ratioyt-badge");

  if (!badge) {
    badge = document.createElement("span");
    badge.className = "ratioyt-badge";
    const delimiter = document.createElement("span");
    delimiter.className = "ratioyt-delimiter";
    delimiter.textContent = " • ";
    targetRow.appendChild(delimiter);
    targetRow.appendChild(badge);
  }

  badge.style.color = "#888888";
  badge.textContent = "--%";
  ensureBadgeFits(badge);
  return badge;
}

function hideCard(card) {
  const container = getCardContainer(card);
  container.querySelectorAll("video").forEach((v) => {
    try {
      v.pause();
      v.src = "";
    } catch (_) {}
  });
  container.remove();
}

function applyScore(card, badge, score) {
  // If video is below minimum score threshold, completely delete the card from the DOM tree
  if (userSettings.hideLowScore && score >= 0 && score < userSettings.lowScoreThreshold) {
    hideCard(card);
    return;
  }

  badge.dataset.ratioytValue = String(score);

  if (score < 0) {
    badge.textContent = "N/A";
    badge.style.color = "";
    return;
  }

  if (userSettings.scoringSystem === "stars") {
    badge.innerHTML = renderStarSvgs(score);
  } else {
    badge.textContent = formatScoreText(score, userSettings.scoringSystem);
  }

  badge.style.color = userSettings.scoringColour
    ? `hsl(${score * 1.2}, 100%, 45%)`
    : "";
  ensureBadgeFits(badge);
}

// =========================================
// 5. QUEUE & NETWORK
// =========================================

// Real Return YouTube Dislike API fetch (kept for future activation):
// async function fetchScore({ videoId }) {
//   const response = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`);
//   if (!response.ok) throw new Error(`HTTP ${response.status}`);
//   const votes = await response.json();
//   if (votes.deleted || (votes.likes === undefined && votes.dislikes === undefined)) return -1;
//   const total = (votes.likes ?? 0) + (votes.dislikes ?? 0);
//   return total > 0 ? Math.round((votes.likes / total) * 100) : 0;
// }

async function fetchScore({ videoId }) {
  return Math.floor(Math.random() * 101);
}

async function drainQueue() {
  if (isDraining) return;
  isDraining = true;

  try {
    while (taskQueue.length > 0) {
      const task = taskQueue.shift();
      pendingVideos.delete(task.videoId);

      if (!task.card || !document.body.contains(task.card)) continue;

      const cached = scoreDB.get(task.videoId);
      if (cached && cached.expiresAt > Date.now()) {
        applyScore(task.card, task.badge, cached.score);
        continue;
      }

      const elapsed = Date.now() - lastFetchTime;
      if (elapsed < MIN_FETCH_GAP_MS) {
        await new Promise((r) => setTimeout(r, MIN_FETCH_GAP_MS - elapsed));
      }

      lastFetchTime = Date.now();
      try {
        const score = await fetchScore(task);
        saveToCache(task.videoId, score);
        failedVideos.delete(task.videoId);
        if (document.body.contains(task.card)) {
          applyScore(task.card, task.badge, score);
        }
      } catch (err) {
        console.warn("[RatioYT] Failed score lookup:", task.videoId, err.message);
        failedVideos.set(task.videoId, Date.now());
        task.badge.textContent = "--%";
      }
    }
  } finally {
    isDraining = false;
  }
}

function enqueueTask(task) {
  if (pendingVideos.has(task.videoId)) return;
  pendingVideos.add(task.videoId);

  if (isElementInViewport(task.card)) {
    taskQueue.unshift(task);
  } else {
    taskQueue.push(task);
  }
  drainQueue();
}

// =========================================
// 6. CARD SCANNING & OBSERVER
// =========================================

function scanCards() {
  const cardSelectors = activeSelectors.containers?.observe || [];
  if (cardSelectors.length === 0) return;

  document.querySelectorAll(cardSelectors.join(", ")).forEach((card) => {
    const videoId = getVideoId(card);
    if (!videoId) return;

    // Check if card has already been scored or is currently pending
    const existingBadge = card.querySelector(".ratioyt-badge");
    if (card.dataset.ratioytVideoId === videoId && existingBadge) {
      if (existingBadge.dataset.ratioytValue) return;
      if (pendingVideos.has(videoId)) return;
      if (Date.now() - (failedVideos.get(videoId) || 0) < RETRY_AFTER_MS) return;
    }

    const targetRow = getTargetRow(card);
    if (!targetRow) return;

    card.dataset.ratioytVideoId = videoId;
    const badge = injectBadge(targetRow);
    const cached = scoreDB.get(videoId);

    if (cached && cached.expiresAt > Date.now()) {
      applyScore(card, badge, cached.score);
    } else {
      enqueueTask({ videoId, card, badge });
    }
  });
}

function scheduleScan() {
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => {
    scanTimeout = null;
    scanCards();
  }, 60);
}

const observer = new MutationObserver(() => scheduleScan());

function startObserver() {
  injectCustomStyles();
  scanCards();
  observer.observe(document.body, { childList: true, subtree: true });
}

window.addEventListener("yt-navigate-start", () => {
  taskQueue.length = 0;
  pendingVideos.clear();
});

window.addEventListener("yt-navigate-finish", () => scheduleScan());

initUserSettings();
openDatabase().then(() => startObserver());
