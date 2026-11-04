import { DEFAULTS } from "../core/index.js";

export function createUserscriptPlatform() {
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
      // When userscript loads on the web dashboard route, bridge settings via postMessage
      const isSettingsPage =
        typeof window !== "undefined" &&
        (window.location.hostname.includes("ratioyt.bittu.dev") ||
          window.location.pathname.includes("/popup"));

      if (isSettingsPage) {
        const broadcast = () => {
          storage.get(DEFAULTS, (settings) => {
            window.postMessage(
              {
                type: "RATIOYT_SETTINGS_RESPONSE",
                target: "userscript",
                settings,
              },
              "*"
            );
          });
        };

        window.addEventListener("message", (event) => {
          if (event.source !== window || !event.data) return;
          if (event.data.type === "RATIOYT_PING") {
            broadcast();
          } else if (event.data.type === "RATIOYT_SET_SETTINGS" && event.data.settings) {
            storage.set(event.data.settings);
          }
        });

        storage.onChange(() => broadcast());
        broadcast();
        return;
      }

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
