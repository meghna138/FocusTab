// ============================================================
// FocusTab — content.js
// Handles Reading Mode driven by popup.js messages:
//   { type: 'TOGGLE_READER',    active, fontSize, lineHeight }
//   { type: 'UPDATE_FONT_SIZE', size }
//   { type: 'UPDATE_LINE_HEIGHT', lineHeight }
// ============================================================

'use strict';

const READING_ATTR = 'data-focustab-reading';
const THEME_ATTR   = 'data-focustab-theme';
const READER_ID    = 'focustab-reader';
const TOOLBAR_ID   = 'focustab-toolbar';

// ── Message listener ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {

    case 'TOGGLE_READER':
      if (msg.active) {
        enableReadingMode(msg.fontSize || 19, msg.lineHeight || 1.85);
      } else {
        disableReadingMode();
      }
      sendResponse({ ok: true });
      break;

    case 'UPDATE_FONT_SIZE':
      applyFontSize(msg.size);
      sendResponse({ ok: true });
      break;

    case 'UPDATE_LINE_HEIGHT':
      applyLineHeight(msg.lineHeight);
      sendResponse({ ok: true });
      break;
  }

  // Return true to allow async sendResponse if needed
  return true;
});

// ── Enable ───────────────────────────────────────────────────
function enableReadingMode(fontSize, lineHeight) {
  // Don't double-inject
  if (document.getElementById(READER_ID)) return;

  const content = extractArticle();
  if (!content) return;

  const reader = document.createElement('div');
  reader.id = READER_ID;
  reader.innerHTML = content;
  document.body.appendChild(reader);

  document.documentElement.setAttribute(READING_ATTR, 'true');

  applyFontSize(fontSize);
  applyLineHeight(lineHeight);

  injectToolbar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Disable ──────────────────────────────────────────────────
function disableReadingMode() {
  document.documentElement.removeAttribute(READING_ATTR);
  document.documentElement.removeAttribute(THEME_ATTR);
  document.getElementById(READER_ID)?.remove();
  document.getElementById(TOOLBAR_ID)?.remove();
}

// ── Article extraction ───────────────────────────────────────
function extractArticle() {
  const el =
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('main') ||
    getLargestContentBlock();

  if (!el) return null;

  const clone = el.cloneNode(true);
  clone.querySelectorAll(
    'script, style, noscript, nav, footer, aside, ' +
    'iframe, [class*="ad"], [id*="ad"], [class*="banner"]'
  ).forEach(n => n.remove());

  return clone.innerHTML;
}

function getLargestContentBlock() {
  let best = null, bestLen = 0;
  document.querySelectorAll('div, section').forEach(el => {
    const len = el.innerText?.trim().length || 0;
    if (len > bestLen) { bestLen = len; best = el; }
  });
  return best;
}

// ── Style helpers ────────────────────────────────────────────
function applyFontSize(px) {
  const reader = document.getElementById(READER_ID);
  if (!reader) return;
  reader.style.setProperty('--reader-font-size', px + 'px');
}

function applyLineHeight(lh) {
  const reader = document.getElementById(READER_ID);
  if (!reader) return;
  reader.style.setProperty('--reader-line-height', lh);
}

// ── Floating toolbar (dark mode + exit) ──────────────────────
function injectToolbar() {
  if (document.getElementById(TOOLBAR_ID)) return;

  const bar = document.createElement('div');
  bar.id = TOOLBAR_ID;
  bar.innerHTML = `
    <button id="ft-theme-toggle">🌙 Dark</button>
    <button id="ft-exit">✕ Exit</button>
  `;
  document.body.appendChild(bar);

  // Dark mode
  bar.querySelector('#ft-theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute(THEME_ATTR) === 'dark';
    document.documentElement.setAttribute(THEME_ATTR, isDark ? 'light' : 'dark');
    bar.querySelector('#ft-theme-toggle').textContent = isDark ? '🌙 Dark' : '☀️ Light';
  });

  // Exit — mirrors popup toggle so UI stays in sync
  bar.querySelector('#ft-exit').addEventListener('click', () => {
    disableReadingMode();
    // Tell background/storage that reading mode is now off for this tab
    chrome.storage.local.set({ [`reader_${chrome.runtime.id}`]: false });
  });
}
