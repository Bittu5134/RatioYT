#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const selectors = JSON.parse(fs.readFileSync(path.join(ROOT, "src/config/selectors.json"), "utf8"));
const coreJs = fs.readFileSync(path.join(ROOT, "src/core/index.js"), "utf8");
const userscriptPlatformJs = fs.readFileSync(path.join(ROOT, "src/platform/userscript.js"), "utf8");

const authorName = typeof pkg.author === "object" ? pkg.author.name : pkg.author || "Bittu";

const metadataHeader = `// ==UserScript==
// @name         RatioYT - YouTube Like/Dislike Ratio
// @namespace    https://ratioyt.bittu.dev/
// @version      ${pkg.version}
// @description  ${pkg.description || "Shows like/dislike ratio scores on YouTube video cards and filters low-rated videos."}
// @author       ${authorName}
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
`;

// Strip ES module imports and exports for IIFE bundling
const bundledPlatformJs = userscriptPlatformJs
  .replace(/^import\s+[\s\S]*?;/m, "")
  .replace(/^export\s+function\s+createUserscriptPlatform/m, "function createUserscriptPlatform");

const bundledCoreJs = coreJs
  .replace(/^export\s+const\s+DEFAULTS/m, "const DEFAULTS")
  .replace(/^export\s+function\s+initRatioYT/m, "function initRatioYT");

const userscriptBody = `(function () {
  "use strict";

  const defaultSelectors = ${JSON.stringify(selectors, null, 2)};

  // =========================================
  // USERSCRIPT PLATFORM ADAPTER
  // =========================================
${bundledPlatformJs}

  // =========================================
  // CORE ENGINE
  // =========================================
${bundledCoreJs}

  // Bootstrapping
  const userscriptPlatform = createUserscriptPlatform();
  initRatioYT({
    platform: userscriptPlatform,
    selectors: defaultSelectors,
  });
})();
`;

const finalUserscript = `${metadataHeader}\n${userscriptBody}\n`;

const distDir = path.join(ROOT, "dist");
const websiteDir = path.join(ROOT, "website");

fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(websiteDir, { recursive: true });

const distPath = path.join(distDir, "ratioyt.user.js");
const websitePath = path.join(websiteDir, "ratioyt.user.js");

fs.writeFileSync(distPath, finalUserscript, "utf8");
fs.writeFileSync(websitePath, finalUserscript, "utf8");

const sizeKb = (Buffer.byteLength(finalUserscript, "utf8") / 1024).toFixed(2);
console.log(`\x1b[32m✔\x1b[0m Userscript v${pkg.version} built successfully!`);
console.log(`  └─ dist/ratioyt.user.js (${sizeKb} KB)`);
console.log(`  └─ website/ratioyt.user.js (${sizeKb} KB)`);
