// ==UserScript==
// @name         RatioYT - YouTube Like/Dislike Ratio
// @namespace    https://ratioyt.bittu.dev/
// @version      1.0.0
// @description  Cross-browser extension that shows like/dislike ratio scores on YouTube video cards.
// @author       Bittu
// @homepageURL  https://ratioyt.bittu.dev
// @supportURL   https://github.com/Bittu5134/RatioYT/issues
// @match        https://*.youtube.com/*
// @match        https://ratioyt.bittu.dev/popup/*
// @match        https://ratioyt.bittu.dev/popup
// @match        http://localhost:*/popup/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @connect      returnyoutubedislikeapi.com
// @run-at       document-idle
// @license      GPL-3.0-or-later
// @icon         https://ratioyt.bittu.dev/logo.png
// @updateURL    https://raw.githubusercontent.com/Bittu5134/RatioYT/main/website/ratioyt.user.js
// @downloadURL  https://raw.githubusercontent.com/Bittu5134/RatioYT/main/website/ratioyt.user.js
// ==/UserScript==

(function () {
  "use strict";

  const defaultSelectors = {
  "remoteConfigUrl": "https://raw.githubusercontent.com/Bittu5134/RatioYT/main/src/config/selectors.json",
  "containers": {
    "observe": [
      "yt-lockup-view-model",
      "ytd-rich-item-renderer",
      "yt-shorts-lockup-view-model",
      "ytm-shorts-lockup-view-model",
      "ytm-shorts-lockup-view-model-v2",
      "ytd-reel-item-renderer",
      "ytd-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-playlist-video-renderer",
      "ytd-playlist-panel-video-renderer",
      "ytd-grid-video-renderer",
      "yt-content-metadata-view-model",
      ".ytp-ce-element.ytp-ce-video"
    ],
    "shorts": [
      "yt-shorts-lockup-view-model",
      "ytm-shorts-lockup-view-model",
      "ytd-reel-item-renderer"
    ],
    "search": [
      "ytd-video-renderer"
    ],
    "playlist": [
      "ytd-playlist-panel-video-renderer",
      "ytd-playlist-video-renderer",
      "ytd-playlist-video-list-renderer"
    ],
    "lockup": [
      "yt-content-metadata-view-model",
      "yt-lockup-view-model"
    ]
  },
  "links": {
    "regular": [
      "a#thumbnail[href*='watch?v=']",
      "a#wc-endpoint[href*='watch?v=']",
      "a#video-title-link[href*='watch?v=']",
      "a#video-title[href*='watch?v=']",
      "a[href*='watch?v=']",
      "a#thumbnail"
    ],
    "shorts": [
      "a[href*='/shorts/']",
      ".ytShortsLockupViewModelHostEndpoint",
      ".shortsLockupViewModelHostEndpoint",
      "a.reel-item-endpoint"
    ],
    "lockupParents": [
      ".ytLockupViewModelHost",
      "yt-lockup-view-model",
      "ytd-rich-item-renderer",
      "ytd-compact-video-renderer",
      "ytd-playlist-video-renderer"
    ]
  },
  "targetRows": {
    "lockupMetadata": [
      "yt-content-metadata-view-model",
      ".ytLockupViewModelHostMetadata",
      ".ytLockupMetadataViewModelHost"
    ],
    "lockupMetadataRows": [
      ".ytContentMetadataViewModelMetadataRow"
    ],
    "searchMetadata": [
      "#metadata-line",
      "#details #metadata",
      "#meta"
    ],
    "shortsMetadata": [
      ".shortsLockupViewModelHostOutsideMetadataSubhead",
      ".shortsLockupViewModelHostMetadataSubhead",
      ".shortsLockupViewModelHostOutsideMetadata",
      ".ytShortsLockupViewModelHostOutsideMetadataSubhead",
      ".ytShortsLockupViewModelHostMetadataSubhead",
      ".ytShortsLockupViewModelHostOutsideMetadata",
      "yt-reel-metadatabar-view-model",
      "#metadata"
    ],
    "playlistMetadata": [
      "span#byline:not([hidden])",
      "span#byline",
      "#video-info:not([hidden])",
      "#byline-container:not([hidden])",
      "#byline-container",
      "#meta",
      "#metadata"
    ]
  },
  "classes": {
    "delimiter": {
      "lockup": [
        "ytContentMetadataViewModelDelimiter"
      ],
      "playlist": [
        "style-scope",
        "yt-formatted-string"
      ],
      "search": [
        "style-scope",
        "ytd-video-meta-block"
      ],
      "shorts": [
        "ytContentMetadataViewModelDelimiter"
      ]
    },
    "score": {
      "lockup": [
        "ytAttributedStringHost",
        "ytContentMetadataViewModelMetadataText",
        "ytContentMetadataViewModelMetadataTextLastPart"
      ],
      "search": [
        "inline-metadata-item",
        "style-scope",
        "ytd-video-meta-block"
      ],
      "playlist": [
        "style-scope",
        "yt-formatted-string"
      ],
      "shorts": [
        "ytAttributedStringHost",
        "ytAttributedStringWhiteSpacePreWrap"
      ]
    }
  },
  "css": {
    "delimiterText": " • ",
    "placeholderText": "--%",
    "placeholderColor": "#888888",
    "scoreStyle": ""
  }
};

  // =========================================
  // USERSCRIPT PLATFORM ADAPTER
  // =========================================


function createUserscriptPlatform() {
  const listeners = new Set();

  const storage = {
    get(defaults, callback) {
      const result = { ...defaults };
      for (const key of Object.keys(defaults)) {
        if (typeof GM_getValue === "function") {
          const val = GM_getValue(key, undefined);
          if (val !== undefined) result[key] = val;
        } else {
          try {
            const raw = localStorage.getItem(`ratioyt_${key}`);
            if (raw !== null) result[key] = JSON.parse(raw);
          } catch (_) {}
        }
      }
      callback(result);
    },
    set(values) {
      for (const [key, val] of Object.entries(values)) {
        if (typeof GM_setValue === "function") {
          GM_setValue(key, val);
        } else {
          try {
            localStorage.setItem(`ratioyt_${key}`, JSON.stringify(val));
          } catch (_) {}
        }
      }
      for (const cb of listeners) {
        cb(values);
      }
    },
    onChange(callback) {
      listeners.add(callback);
    },
  };

  return {
    type: "userscript",
    dbName: "RatioYT_Userscript",
    storage,
    async fetchVotes(videoId) {
      if (typeof GM_xmlhttpRequest === "function") {
        return new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: "GET",
            url: `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`,
            onload: (res) => {
              if (res.status >= 200 && res.status < 300) {
                try {
                  resolve(JSON.parse(res.responseText));
                } catch (err) {
                  reject(err);
                }
              } else {
                reject(new Error(`HTTP ${res.status}`));
              }
            },
            onerror: (err) => reject(err),
          });
        });
      }
      const response = await fetch(
        `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    onInit() {
      if (typeof GM_registerMenuCommand === "function") {
        const openSettings = () => {
          const url = "https://ratioyt.bittu.dev/popup/";
          if (typeof GM_openInTab === "function") {
            GM_openInTab(url, { active: true, insert: true });
          } else {
            window.open(url, "_blank");
          }
        };

        GM_registerMenuCommand("⚙️ Settings (Open Web Dashboard)", openSettings);
        GM_registerMenuCommand("Format: Cycle Score Style", () => {
          storage.get(DEFAULTS, (cfg) => {
            const styles = ["percentage", "decimal", "smiley", "stars"];
            const next = styles[(styles.indexOf(cfg.scoringSystem) + 1) % styles.length];
            storage.set({ scoringSystem: next });
          });
        });
        GM_registerMenuCommand("Filter: Toggle Hide Clickbait", () => {
          storage.get(DEFAULTS, (cfg) => {
            storage.set({ hideLowScore: !cfg.hideLowScore });
          });
        });
        GM_registerMenuCommand("Filter: Toggle Filter Only Mode", () => {
          storage.get(DEFAULTS, (cfg) => {
            storage.set({ hideOnlyMode: !cfg.hideOnlyMode });
          });
        });
      }
    },
  };
}


  // =========================================
  // CORE ENGINE
  // =========================================
const DEFAULTS = {
  scoringSystem: "percentage",
  scoringColour: true,
  hideOnlyMode: false,
  hideLowScore: false,
  lowScoreThreshold: 25,
};

function initRatioYT({ platform, selectors }) {
  const isSettingsPage =
    window.location.hostname.includes("ratioyt.bittu.dev") ||
    window.location.pathname.includes("/popup");

  // =========================================
  // SETTINGS BRIDGE (for /popup/ web route)
  // =========================================
  if (isSettingsPage) {
    const targetType = platform.type || (typeof chrome !== "undefined" && chrome?.storage?.local ? "extension" : "userscript");

    const broadcastSettings = () => {
      platform.storage.get(DEFAULTS, (settings) => {
        window.postMessage({
          type: "RATIOYT_SETTINGS_RESPONSE",
          target: targetType,
          settings,
        }, "*");
      });
    };

    window.addEventListener("message", (event) => {
      if (event.source !== window || !event.data) return;

      if (event.data.type === "RATIOYT_PING") {
        broadcastSettings();
      } else if (event.data.type === "RATIOYT_SET_SETTINGS" && event.data.settings) {
        platform.storage.set(event.data.settings);
      }
    });

    platform.storage.onChange?.((changes) => {
      platform.storage.get(DEFAULTS, (settings) => {
        window.postMessage({
          type: "RATIOYT_SETTINGS_UPDATED",
          target: targetType,
          settings,
        }, "*");
      });
    });

    // Announce availability to the page
    broadcastSettings();
    platform.onInit?.();
    return;
  }

  // =========================================
  // YOUTUBE DOM ENGINE
  // =========================================
  let activeSelectors = { ...selectors };
  let userSettings = { ...DEFAULTS };

  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const RETRY_AFTER_MS = 5 * 60 * 1000;
  const MIN_FETCH_GAP_MS = 300;
  const SMILEY_GOOD = 70;
  const SMILEY_MEH = 40;

  const DB_NAME = platform.dbName || "RatioYT";
  const DB_STORE = "scores";
  const DB_VERSION = 2;
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
      .ratioyt-quiet-mode .ratioyt-badge,
      .ratioyt-quiet-mode .ratioyt-row,
      .ratioyt-quiet-mode .ratioyt-delimiter,
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

  function reloadSettings() {
    platform.storage.get(DEFAULTS, (config) => {
      userSettings = { ...userSettings, ...config };
      applyGlobalBadgeVisibility();
      updateRenderedCards();
      scheduleScan();
    });
  }

  function initUserSettings() {
    platform.storage.get(DEFAULTS, (config) => {
      userSettings = { ...userSettings, ...config };
      applyGlobalBadgeVisibility();
    });

    platform.storage.onChange((changes) => {
      let settingsChanged = false;

      for (const [key, val] of Object.entries(changes)) {
        if (key in DEFAULTS) {
          userSettings[key] = val;
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
      "ratioyt-quiet-mode",
      Boolean(userSettings.hideOnlyMode)
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
        if (db.objectStoreNames.contains(DB_STORE)) {
          db.deleteObjectStore(DB_STORE);
        }
        db.createObjectStore(DB_STORE, { keyPath: "videoId" });
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

  function createPlaceholder(card) {
    const isShort =
      card.matches?.("yt-shorts-lockup-view-model, ytm-shorts-lockup-view-model, ytd-reel-item-renderer") ||
      Boolean(card.querySelector?.("a[href*='/shorts/']"));

    const rect = card.getBoundingClientRect();
    const ph = document.createElement("div");
    ph.className = "ratioyt-placeholder";

    let aspectStyle = "aspect-ratio: 16 / 9; width: 100%;";
    let minHeightStyle = "min-height: 180px;";
    let marginStyle = "margin-bottom: 24px;";

    if (isShort) {
      aspectStyle = "aspect-ratio: 9 / 16; width: 100%; height: 100%;";
      minHeightStyle = "min-height: 320px;";
      marginStyle = "";
    } else if (rect.height > 0 && rect.height < 140) {
      aspectStyle = `height: ${rect.height}px; width: 100%;`;
      minHeightStyle = "min-height: 80px;";
      marginStyle = "margin-bottom: 8px;";
    }

    ph.style.cssText = `
      ${aspectStyle}
      ${minHeightStyle}
      ${marginStyle}
      border-radius: 12px;
      position: relative;
      overflow: hidden;
      background: linear-gradient(145deg, #0d0d11 0%, #050507 100%);
      border: 1px solid rgba(255, 255, 255, 0.04);
      box-sizing: border-box;
      user-select: none;
      pointer-events: none;
    `;

    const blob = document.createElement("div");
    blob.style.cssText =
      "position: absolute; inset: -20px; filter: blur(40px); background: radial-gradient(circle at 25% 25%, rgba(180, 30, 50, 0.12), transparent 50%), radial-gradient(circle at 75% 75%, rgba(90, 40, 140, 0.08), transparent 50%); pointer-events: none;";
    ph.appendChild(blob);

    return ph;
  }

  function hideCard(card) {
    const container = getCardContainer(card);
    container.querySelectorAll("video").forEach((v) => {
      try {
        v.pause();
        v.src = "";
      } catch (_) {}
    });

    const placeholder = createPlaceholder(card);
    container.replaceChildren(placeholder);
  }

  function applyScore(card, badge, score) {
    // If video is below minimum score threshold, replace it with a dark gradient blur placeholder
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

  async function fetchScore({ videoId }) {
    const votes = await platform.fetchVotes(videoId);
    if (!votes || votes.deleted || (votes.likes === undefined && votes.dislikes === undefined)) {
      return -1;
    }
    const total = (votes.likes ?? 0) + (votes.dislikes ?? 0);
    return total > 0 ? Math.round((votes.likes / total) * 100) : 0;
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

  // Re-sync settings automatically when switching back to the YouTube tab
  window.addEventListener("focus", reloadSettings);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) reloadSettings();
  });

  initUserSettings();
  openDatabase().then(() => {
    startObserver();
    platform.onInit?.();
  });
}


  // Bootstrapping
  const userscriptPlatform = createUserscriptPlatform();
  initRatioYT({
    platform: userscriptPlatform,
    selectors: defaultSelectors,
  });
})();

