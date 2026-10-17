/**
 * RatioYT Product Page Interactive Previews
 * Zero dependencies, pure vanilla JS
 */

const STAR_PATH = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
const STAR_SVGS = {
  full: `<svg class="star-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="${STAR_PATH}"/></svg>`,
  half: `<svg class="star-icon" viewBox="0 0 24 24" width="12" height="12"><path d="${STAR_PATH}" fill="currentColor" opacity="0.25"/><path d="M12 2v15.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/></svg>`,
  empty: `<svg class="star-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" opacity="0.25"><path d="${STAR_PATH}"/></svg>`,
};

function renderStars(ratingOutOf5) {
  const full = Math.floor(ratingOutOf5);
  const hasHalf = ratingOutOf5 % 1 !== 0;
  const empty = 5 - full - (hasHalf ? 1 : 0);
  let html = `<span style="display:inline-flex;align-items:center;gap:1.5px;vertical-align:-1.5px">`;
  html += STAR_SVGS.full.repeat(full);
  if (hasHalf) html += STAR_SVGS.half;
  html += STAR_SVGS.empty.repeat(empty);
  html += `</span>`;
  return html;
}

function formatBadge(format, scoreValue) {
  switch (format) {
    case "decimal":
      return `${(scoreValue / 10).toFixed(1).replace(".0", "")} / 10`;
    case "smiley":
      return scoreValue >= 70 ? "😊" : scoreValue >= 40 ? "😐" : "😞";
    case "stars":
      return renderStars(Math.round((scoreValue / 100) * 10) / 2);
    case "percentage":
    default:
      return `${scoreValue}%`;
  }
}

// ── 1. Hero Preview Interactive Controls ──
const heroBadge = document.getElementById("heroBadge");
const heroBadgeNext = document.getElementById("heroBadgeNext");
const mockCover = document.getElementById("mockCover");
const heroMockCard = document.getElementById("heroMockCard");
const toggleBlurBtn = document.getElementById("toggleBlurBtn");
const formatChips = document.querySelectorAll(".format-chips .chip[data-format]");

let heroScore = 94;

formatChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    formatChips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    const fmt = chip.dataset.format;
    const content = formatBadge(fmt, heroScore);
    if (heroBadge) heroBadge.innerHTML = content;
    if (heroBadgeNext) heroBadgeNext.innerHTML = content;
  });
});

if (toggleBlurBtn && mockCover) {
  toggleBlurBtn.addEventListener("click", () => {
    const isHidden = mockCover.classList.contains("hidden");
    if (isHidden) {
      mockCover.classList.remove("hidden", "mock-unblurred");
      toggleBlurBtn.classList.add("active");
      toggleBlurBtn.textContent = "Blur filter: ON";
      heroScore = 22; // Low score
    } else {
      mockCover.classList.add("hidden");
      mockCover.classList.remove("mock-unblurred");
      toggleBlurBtn.classList.remove("active");
      toggleBlurBtn.textContent = "Test blur filter";
      heroScore = 94;
    }

    const activeFmt = document.querySelector(".format-chips .chip.active")?.dataset.format || "percentage";
    const content = formatBadge(activeFmt, heroScore);
    if (heroBadge) heroBadge.innerHTML = content;
    if (heroBadgeNext) heroBadgeNext.innerHTML = content;
    updateBadgeColor(heroBadge, heroScore, true);
    updateBadgeColor(heroBadgeNext, heroScore, true);
  });

  // Click on mock cover to unblur
  mockCover.addEventListener("click", (e) => {
    e.stopPropagation();
    mockCover.classList.add("mock-unblurred");
  });

  // Mouse leave hero card to re-blur
  if (heroMockCard) {
    heroMockCard.addEventListener("mouseleave", () => {
      if (!mockCover.classList.contains("hidden")) {
        mockCover.classList.remove("mock-unblurred");
      }
    });
  }
}

// ── 2. Demo Section Playground ──
const demoBadge = document.getElementById("demoBadge");
const demoNextBadge = document.getElementById("demoNextBadge");
const demoNextLineRow = document.getElementById("demoNextLineRow");
const demoDelim = document.getElementById("demoDelim");
const demoCover = document.getElementById("demoCover");
const demoCard = document.getElementById("demoCard");

const interactiveFormatSelect = document.getElementById("interactiveFormatSelect");
const interactiveColourToggle = document.getElementById("interactiveColourToggle");
const interactiveBlurToggle = document.getElementById("interactiveBlurToggle");
const interactiveWrapToggle = document.getElementById("interactiveWrapToggle");

let demoScore = 88;

function updateBadgeColor(el, score, enableColor) {
  if (!el) return;
  if (!enableColor) {
    el.style.color = "#a6e3a1"; // soft light default
    return;
  }
  el.style.color = `hsl(${score * 1.2}, 85%, 65%)`;
}

function syncDemo() {
  const fmt = interactiveFormatSelect?.value || "percentage";
  const colored = !!interactiveColourToggle?.checked;
  const isBlurred = !!interactiveBlurToggle?.checked;
  const isWrapped = !!interactiveWrapToggle?.checked;

  demoScore = isBlurred ? 18 : 88;

  const text = formatBadge(fmt, demoScore);
  if (demoBadge) demoBadge.innerHTML = text;
  if (demoNextBadge) demoNextBadge.innerHTML = text;

  updateBadgeColor(demoBadge, demoScore, colored);
  updateBadgeColor(demoNextBadge, demoScore, colored);

  // Blur overlay
  if (demoCover) {
    if (isBlurred) {
      demoCover.classList.remove("hidden", "demo-unblurred");
    } else {
      demoCover.classList.add("hidden");
      demoCover.classList.remove("demo-unblurred");
    }
  }

  // Wrap toggle: moves badge to its own line below metadata
  if (isWrapped) {
    if (demoDelim) demoDelim.classList.add("hidden");
    if (demoBadge) demoBadge.classList.add("hidden");
    if (demoNextLineRow) demoNextLineRow.classList.remove("hidden");
  } else {
    if (demoDelim) demoDelim.classList.remove("hidden");
    if (demoBadge) demoBadge.classList.remove("hidden");
    if (demoNextLineRow) demoNextLineRow.classList.add("hidden");
  }
}

if (interactiveFormatSelect) interactiveFormatSelect.addEventListener("change", syncDemo);
if (interactiveColourToggle) interactiveColourToggle.addEventListener("change", syncDemo);
if (interactiveBlurToggle) interactiveBlurToggle.addEventListener("change", syncDemo);
if (interactiveWrapToggle) interactiveWrapToggle.addEventListener("change", syncDemo);

if (demoCover) {
  demoCover.addEventListener("click", (e) => {
    e.stopPropagation();
    demoCover.classList.add("demo-unblurred");
  });
}

if (demoCard) {
  demoCard.addEventListener("mouseleave", () => {
    if (demoCover && !demoCover.classList.contains("hidden")) {
      demoCover.classList.remove("demo-unblurred");
    }
  });
}

// Initial sync
syncDemo();
