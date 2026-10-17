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

// Hidden videos are always blurred; hovering reveals them while hovered.
const PEEK_MS = 1000;

// A failed lookup is retried after this long, so a transient API error
// doesn't leave a "--%" placeholder stuck until the next navigation.
const RETRY_AFTER_MS = 5 * 60 * 1000;

// How long cached scores stay fresh.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// After this many consecutive API failures, lookups pause for a while.
const API_FAIL_STREAK = 5;
const API_PAUSE_MS = 30 * 1000;

// Smiley thresholds: happy above SMILEY_GOOD, neutral above SMILEY_MEH.
const SMILEY_GOOD = 70;
const SMILEY_MEH = 40;

const SELECTOR_REFRESH_MS = 6 * 60 * 60 * 1000;

// The card types a video badge can live in, used to find the card that
// gets blurred when a video is hidden.
const HOST_CARD_SELECTOR =
  "yt-shorts-lockup-view-model, ytm-shorts-lockup-view-model, ytd-reel-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer";

const TARGET_ROW_KEYS = {
  shorts: ["shortsMetadata"],
  search: ["searchMetadata"],
  playlist: ["playlistMetadata", "lockupMetadata"],
  lockup: ["searchMetadata", "lockupMetadata", "playlistMetadata"],
};

let elementQueue = [];
let queueIntervalId = null;
let pendingVideos = new Set();
let failedVideos = new Map();
let failStreak = 0;
let pauseUntil = 0;
let scanTimeout = null;
let scoreDB = {};

const DB_NAME = "RatioYT";
const DB_STORE = "scores";
const DB_VERSION = 1;
let dbInstance = null;

// =========================================
// 1. STYLES & CONFIG
// =========================================

function injectCustomStyles() {
  if (document.getElementById("ratioyt-styles")) return;
  const style = document.createElement("style");
  style.id = "ratioyt-styles";
  style.textContent = `
    .ratioyt-cover-container {
      position: relative !important;
    }
    .ratioyt-cover {
      position: absolute !important;
      inset: 0 !important;
      z-index: 100 !important;
      border-radius: 12px !important;
      background: rgba(15, 15, 15, 0.45) !important;
      backdrop-filter: blur(20px) brightness(0.45) !important;
      -webkit-backdrop-filter: blur(20px) brightness(0.45) !important;
      cursor: pointer !important;
      user-select: none !important;
      pointer-events: auto !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: opacity 0.25s ease !important;
    }
    .ratioyt-cover.ratioyt-unblurred {
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .ratioyt-cover-hint {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 34px !important;
      height: 34px !important;
      border-radius: 50% !important;
      background: rgba(0, 0, 0, 0.6) !important;
      color: rgba(255, 255, 255, 0.85) !important;
      opacity: 0 !important;
      pointer-events: none !important;
      transition: opacity 0.2s ease !important;
    }
    .ratioyt-cover:hover .ratioyt-cover-hint {
      opacity: 1 !important;
    }
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
  `;
  (document.head || document.documentElement).appendChild(style);
}

// Remote selector lists can contain invalid entries. Filter them out once,
// at load time, so the hot paths can call querySelector/matches bare.
function sanitizeSelectors(config) {
  const probe = document.createElement("div");
  const keepValid = (list) =>
    (Array.isArray(list) ? list : [list]).filter((selector) => {
      try {
        probe.querySelector(selector);
        return true;
      } catch {
        return false;
      }
    });

  for (const section of ["containers", "links", "targetRows"]) {
    if (!config[section]) continue;
    for (const key of Object.keys(config[section])) {
      config[section][key] = keepValid(config[section][key]);
    }
  }
  return config;
}

async function initSelectors() {
  try {
    const data = await chrome.storage.local.get(["remoteSelectors", "selectorsLastFetched"]);
    if (data.remoteSelectors && typeof data.remoteSelectors === "object") {
      activeSelectors = mergeConfigs(defaultSelectors, sanitizeSelectors(data.remoteSelectors));
    }

    if (Date.now() - (data.selectorsLastFetched || 0) > SELECTOR_REFRESH_MS) {
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
      activeSelectors = mergeConfigs(defaultSelectors, sanitizeSelectors(remoteConfig));
      chrome.storage.local.set({
        remoteSelectors: remoteConfig,
        selectorsLastFetched: Date.now(),
      });
    }
  } catch (err) {
    console.warn("[RatioYT] Remote selector fetch failed, using local:", err.message);
  }
}

function mergeConfigs(base, override) {
  if (!override) return base;
  const merged = { ...base, ...override };
  for (const key of ["containers", "links", "targetRows", "classes", "css"]) {
    merged[key] = { ...base[key], ...override[key] };
  }
  return merged;
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
    if (changes.remoteSelectors?.newValue) {
      activeSelectors = mergeConfigs(
        defaultSelectors,
        sanitizeSelectors(changes.remoteSelectors.newValue),
      );
      settingsChanged = true;
    }
    if (settingsChanged) {
      applyGlobalBadgeVisibility();
      updateRenderedBadges();
    }
  });
}

function applyGlobalBadgeVisibility() {
  document.documentElement.classList.toggle(
    "ratioyt-hide-badges",
    userSettings.hideOnlyMode,
  );
}

function updateRenderedBadges() {
  document.querySelectorAll(".ratioyt-badge").forEach((badge) => {
    const scoreValue = parseInt(badge.dataset.ratioytValue, 10);
    if (!isNaN(scoreValue)) applyFinalScore(badge, scoreValue, null);
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
    const getAllRequest = getStore().getAll();

    getAllRequest.onsuccess = () => {
      const now = Date.now();
      const expired = [];
      for (const entry of getAllRequest.result || []) {
        if (entry.expiresAt > now) {
          scoreDB[entry.videoId] = { score: entry.score, expiresAt: entry.expiresAt };
        } else {
          expired.push(entry.videoId);
        }
      }
      // Purge expired entries in a single transaction.
      if (expired.length > 0 && dbInstance) {
        const store = dbInstance.transaction(DB_STORE, "readwrite").objectStore(DB_STORE);
        for (const videoId of expired) {
          delete scoreDB[videoId];
          store.delete(videoId);
        }
      }
      startObserver();
    };

    getAllRequest.onerror = () => startObserver();
  };

  request.onerror = (event) => {
    console.warn("[RatioYT] IndexedDB error:", event.target.error);
    startObserver();
  };
}

function saveToIndexDB(videoId, scoreValue, expiresAt) {
  scoreDB[videoId] = { score: scoreValue, expiresAt };
  getStore("readwrite")?.put({ videoId, score: scoreValue, expiresAt });
}

function deleteCacheRecord(videoId) {
  delete scoreDB[videoId];
  getStore("readwrite")?.delete(videoId);
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
    const el = parent.querySelector(selector);
    if (!el) continue;
    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") {
      fallback ??= el;
    } else {
      return el;
    }
  }
  return fallback;
}

function isMatch(el, selectors) {
  if (!el || !selectors) return false;
  const list = Array.isArray(selectors) ? selectors : [selectors];
  return list.some((selector) => el.matches(selector));
}

function isElementInViewport(el) {
  const rect = el.getBoundingClientRect();
  return rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth;
}

function getCardCategory(el) {
  if (isMatch(el, activeSelectors.containers.shorts)) return "shorts";
  if (isMatch(el, activeSelectors.containers.search)) return "search";
  if (isMatch(el, activeSelectors.containers.playlist)) return "playlist";
  return "lockup";
}

function getVideoId(el, category) {
  if (category === "shorts") {
    const href = queryFirst(el, activeSelectors.links.shorts)?.getAttribute("href") || "";
    const shortId = href.split("/shorts/")[1];
    return shortId ? shortId.split(/[?#]/)[0] : null;
  }

  let link = queryFirst(el, activeSelectors.links.regular);
  if (!link) {
    for (const parentSelector of activeSelectors.links.lockupParents) {
      const parentHost = el.closest(parentSelector);
      if (parentHost) {
        link = queryFirst(parentHost, activeSelectors.links.regular);
        if (link) break;
      }
    }
  }

  if (!link) return null;
  return new URL(link.getAttribute("href") || "", location.origin).searchParams.get("v");
}

function getTargetRow(el, category) {
  if (category === "lockup") {
    const rows = el.querySelectorAll(
      activeSelectors.targetRows.lockupMetadataRows?.join(", ") ||
        ".ytContentMetadataViewModelMetadataRow",
    );
    if (rows.length >= 2) return rows[1];
    if (rows.length === 1) return rows[0];
  }

  for (const key of TARGET_ROW_KEYS[category]) {
    const row = queryFirst(el, activeSelectors.targetRows[key]);
    if (row) return row;
  }
  return null;
}

// =========================================
// 4. UI INJECTION & STYLING
// =========================================

function createDelimiter(category) {
  const delim = document.createElement("span");
  const classes = activeSelectors.classes?.delimiter?.[category] || [
    "ytContentMetadataViewModelDelimiter",
  ];
  delim.className = `${classes.join(" ")} ratioyt-delimiter`;
  delim.textContent = activeSelectors.css?.delimiterText || " • ";
  return delim;
}

function createBadge(category) {
  const badge = document.createElement("span");
  const classes = activeSelectors.classes?.score?.[category] || [
    "ytAttributedStringHost",
    "ytContentMetadataViewModelMetadataText",
  ];
  badge.className = `${classes.join(" ")} ratioyt-badge`;
  if (activeSelectors.css?.scoreStyle) badge.style.cssText = activeSelectors.css.scoreStyle;
  return badge;
}

// YouTube's metadata rows are nowrap + ellipsis, so an inline badge that
// doesn't fit would truncate the row's own text. When it overflows, drop
// the badge onto its own line under the row instead.
function ensureBadgeFits(badge) {
  const row = badge.parentElement;
  if (!row || row.classList.contains("ratioyt-row")) return; // already on its own line
  if (row.clientWidth === 0) return;

  const rowRect = row.getBoundingClientRect();
  const badgeRect = badge.getBoundingClientRect();
  const isOverflowing =
    row.scrollWidth > row.clientWidth + 1 ||
    (rowRect.right > 0 && badgeRect.right > rowRect.right + 1);

  if (!isOverflowing) return; // fits inline nicely!

  // Doesn't fit: move to its own line below the metadata row
  row.querySelector(".ratioyt-delimiter")?.remove();
  let ownRow = row.parentElement?.querySelector(".ratioyt-row");
  if (!ownRow) {
    ownRow = document.createElement(row.tagName);
    ownRow.className = `${row.className} ratioyt-row`;
    row.after(ownRow);
  }
  ownRow.appendChild(badge);
}

function injectPlaceholder(targetRow, category) {
  // An existing badge sits either inline in the row or on its own line below.
  let badge =
    targetRow.querySelector(".ratioyt-badge") ||
    targetRow.parentElement.querySelector(".ratioyt-row .ratioyt-badge");

  if (!badge) {
    badge = createBadge(category);
    if (!targetRow.querySelector(".ratioyt-delimiter")) {
      targetRow.appendChild(createDelimiter(category));
    }
    targetRow.appendChild(badge);
  }

  badge.style.color = activeSelectors.css?.placeholderColor || "#888888";
  badge.textContent = activeSelectors.css?.placeholderText || "--%";
  ensureBadgeFits(badge);
  return badge;
}

const STAR_PATH = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
const STAR_SVG = {
  full: `<svg class="ratioyt-star" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="${STAR_PATH}"/></svg>`,
  half: `<svg class="ratioyt-star" viewBox="0 0 24 24" width="12" height="12"><path d="${STAR_PATH}" fill="currentColor" opacity="0.25"/><path d="M12 2v15.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/></svg>`,
  empty: `<svg class="ratioyt-star" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" opacity="0.25"><path d="${STAR_PATH}"/></svg>`,
};

function renderStarSvgs(scoreValue) {
  const rating = Math.max(0, Math.min(5, Math.round((scoreValue / 100) * 10) / 2));
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 !== 0;

  let html = `<span class="ratioyt-stars-wrap" title="${rating} / 5 stars (${scoreValue}%)">`;
  html += STAR_SVG.full.repeat(fullStars);
  if (hasHalf) html += STAR_SVG.half;
  html += STAR_SVG.empty.repeat(5 - fullStars - (hasHalf ? 1 : 0));
  html += `</span>`;
  return html;
}

function formatScoreText(scoreValue, format) {
  switch (format) {
    case "decimal":
      return `${Math.round(scoreValue / 10)}/10`;
    case "smiley":
      return scoreValue >= SMILEY_GOOD ? "😊" : scoreValue >= SMILEY_MEH ? "😐" : "😞";
    case "percentage":
    default:
      return `${scoreValue}%`;
  }
}

function applyFinalScore(badge, scoreValue, cardElement) {
  badge.dataset.ratioytValue = String(scoreValue);
  const hostCard = (badge || cardElement).closest(HOST_CARD_SELECTOR);

  // Deleted/unknown videos get a neutral "N/A" and are never hidden.
  if (scoreValue < 0) {
    badge.textContent = "N/A";
    badge.style.color = "";
    if (hostCard) clearHideEffect(hostCard);
    return;
  }

  if (userSettings.scoringSystem === "stars") {
    badge.innerHTML = renderStarSvgs(scoreValue);
  } else {
    badge.textContent = formatScoreText(scoreValue, userSettings.scoringSystem);
  }

  badge.style.color = userSettings.scoringColour ? `hsl(${scoreValue * 1.2}, 100%, 45%)` : "";
  ensureBadgeFits(badge); // the real content can be wider than the placeholder
  if (hostCard) applyHideEffect(hostCard, scoreValue);
}

function clearHideEffect(hostCard) {
  const target =
    hostCard.querySelector(
      "#content, .ytLockupViewModelHost, .shortsLockupViewModelHost, .ytShortsLockupViewModelHost, [class*='ThumbnailContainer'], [class*='thumbnail-container'], ytd-thumbnail, #dismissible",
    ) || hostCard;
  target.classList.remove("ratioyt-cover-container");
  target.querySelectorAll(".ratioyt-cover").forEach((el) => el.remove());
  hostCard.classList.remove("ratioyt-cover-container");
  hostCard.querySelectorAll(".ratioyt-cover").forEach((el) => el.remove());
}

function applyHideEffect(hostCard, scoreValue) {
  const shouldHide =
    isFilterAllowedPage() &&
    userSettings.hideLowScore &&
    scoreValue < userSettings.lowScoreThreshold;

  if (!shouldHide) {
    clearHideEffect(hostCard);
    return;
  }

  // Instead of blurring the parent directly (which lets YouTube trigger hover
  // video preview autoplay), place a backdrop-filter overlay on top of the
  // visual target. The overlay intercepts pointer events so YouTube never sees
  // the hover, preventing autoplay. Clicking the overlay reveals the card.
  const target =
    hostCard.querySelector(
      "#content, .ytLockupViewModelHost, .shortsLockupViewModelHost, .ytShortsLockupViewModelHost, [class*='ThumbnailContainer'], [class*='thumbnail-container'], ytd-thumbnail, #dismissible",
    ) || hostCard;

  target.classList.add("ratioyt-cover-container");

  let cover = target.querySelector(":scope > .ratioyt-cover");
  if (!cover) {
    cover = document.createElement("div");
    cover.className = "ratioyt-cover";
    cover.innerHTML =
      '<div class="ratioyt-cover-hint">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M1.8 12S5.6 5.8 12 5.8 22.2 12 22.2 12 18.4 18.2 12 18.2 1.8 12 1.8 12Z"/>' +
      '<circle cx="12" cy="12" r="3"/></svg>' +
      '</div>';

    // Click to unblur: swallow click so video does not open, reveal video
    cover.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      cover.classList.add("ratioyt-unblurred");
    });

    // Re-blur as soon as the mouse leaves the card
    target.addEventListener("mouseleave", () => {
      cover.classList.remove("ratioyt-unblurred");
    });
    if (target !== hostCard) {
      hostCard.addEventListener("mouseleave", () => {
        cover.classList.remove("ratioyt-unblurred");
      });
    }

    target.appendChild(cover);
  }
}

// =========================================
// 5. QUEUE & NETWORK
// =========================================

async function processQueue() {
  if (Date.now() < pauseUntil) return;

  while (elementQueue.length > 0) {
    const task = elementQueue.shift();
    pendingVideos.delete(task.videoId);

    if (!task.placeholderElement || !document.body.contains(task.placeholderElement)) continue;
    await fetchScore(task);
    return; // one lookup per interval tick
  }

  if (queueIntervalId) {
    clearInterval(queueIntervalId);
    queueIntervalId = null;
  }
}

async function fetchScore({ videoId, placeholderElement, cardElement }) {
  try {
    const response = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const votes = await response.json();

    let score;
    if (votes.deleted || (votes.likes === undefined && votes.dislikes === undefined)) {
      score = -1; // deleted/unknown: cached so it isn't refetched every navigation
    } else {
      const total = (votes.likes ?? 0) + (votes.dislikes ?? 0);
      score = total > 0 ? Math.round((votes.likes / total) * 100) : 0;
    }

    saveToIndexDB(videoId, score, Date.now() + CACHE_TTL_MS);
    applyFinalScore(placeholderElement, score, cardElement);

    failStreak = 0;
    failedVideos.delete(videoId);
  } catch (err) {
    console.warn("[RatioYT] Failed score for", videoId, err.message);
    failedVideos.set(videoId, Date.now());
    placeholderElement.textContent = "--%";

    failStreak += 1;
    if (failStreak >= API_FAIL_STREAK) {
      failStreak = 0;
      pauseUntil = Date.now() + API_PAUSE_MS;
      console.warn(
        `[RatioYT] Pausing lookups for ${API_PAUSE_MS / 1000}s after ${API_FAIL_STREAK} consecutive failures`,
      );
    }
  }
}

// =========================================
// 6. OBSERVER & LIFECYCLE
// =========================================

function scanAndProcessCards() {
  const selectorList = activeSelectors.containers?.observe || [];
  if (selectorList.length === 0) return;

  document.querySelectorAll(selectorList.join(", ")).forEach((el) => {
    const category = getCardCategory(el);
    const videoId = getVideoId(el, category);
    if (!videoId) return;

    const targetRow = getTargetRow(el, category);
    if (!targetRow) return;

    const existingBadge = el.querySelector(".ratioyt-badge");
    if (el.dataset.ratioytVideoId === videoId && existingBadge) {
      // Scored, in flight, or recently failed - nothing to do yet.
      if (existingBadge.dataset.ratioytValue) return;
      if (pendingVideos.has(videoId)) return;
      if (Date.now() - (failedVideos.get(videoId) || 0) < RETRY_AFTER_MS) return;
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
        if (isElementInViewport(badge)) elementQueue.unshift(task);
        else elementQueue.push(task);
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
  scanAndProcessCards();
  observer.observe(document.body, { childList: true, subtree: true });
}

window.addEventListener("yt-navigate-start", () => {
  elementQueue = [];
  pendingVideos.clear();
  if (queueIntervalId) {
    clearInterval(queueIntervalId);
    queueIntervalId = null;
  }
});

window.addEventListener("yt-navigate-finish", () => scheduleScan());

initUserSettings();
initSelectors().then(() => initializeDatabase());
