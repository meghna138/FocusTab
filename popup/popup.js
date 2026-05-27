/**
 * popup.js — FocusTab Extension
 * ─────────────────────────────────────────────────────────────────
 * Handles all interactive logic for the popup UI:
 *   1. Tab navigation (switching between Tabs / Reader / Timer panels)
 *   2. Tab Manager   (list, search, switch, close, deduplicate)
 *   3. Reading Mode  (toggle, font-size slider, line-height slider)
 *   4. Pomodoro Timer (start/pause/reset, mode switch, session count,
 *                      circular progress ring)
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

/* ══════════════════════════════════════════════════════════
   SECTION 0 — Utility helpers
   ══════════════════════════════════════════════════════════ */

/**
 * Shorthand for document.getElementById — keeps code concise.
 * @param {string} id
 * @returns {HTMLElement}
 */
const $ = id => document.getElementById(id);

/**
 * Format seconds into MM:SS  e.g. 90 → "01:30"
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ══════════════════════════════════════════════════════════
   SECTION 1 — Panel / Tab Navigation
   ══════════════════════════════════════════════════════════ */

/**
 * Each nav button carries a `data-tab` attribute that matches
 * the id of a panel:  data-tab="tabs" → #panel-tabs
 *
 * Clicking a nav button:
 *   • removes .active from all buttons/panels
 *   • adds .active to the clicked button and the matching panel
 *   • updates the body's data-tab so the CSS accent colour shifts
 */
function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      // Deactivate everything
      navBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

      // Activate the clicked tab
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById(`panel-${targetTab}`).classList.add('active');

      // Shift the accent colour via data attribute on body
      document.body.setAttribute('data-tab', targetTab);
    });
  });
}

/* ══════════════════════════════════════════════════════════
   SECTION 2 — Tab Manager
   ══════════════════════════════════════════════════════════ */

/** Stores the full list of Chrome tabs so we can re-filter without re-querying. */
let allTabs = [];

/**
 * Fetches all open tabs, updates the stats bar, and renders the list.
 * Called on popup open and after any tab is closed.
 */
async function loadTabs() {
  try {
    // Query all tabs across all windows
    const tabs = await chrome.tabs.query({});
    allTabs = tabs;

    // Count unique windows
    const windowIds = new Set(tabs.map(t => t.windowId));

    // Update stats bar
    $('total-tab-count').textContent = tabs.length;
    $('window-count').textContent    = windowIds.size;

    // Re-render with the current search term (if any)
    const query = $('tab-search').value.trim().toLowerCase();
    renderTabList(query ? allTabs.filter(t => matchesQuery(t, query)) : allTabs);

  } catch (err) {
    console.error('FocusTab: failed to load tabs', err);
  }
}

/**
 * Returns true if a tab's title or URL contains the search string.
 * @param {chrome.tabs.Tab} tab
 * @param {string} query  lowercase search string
 */
function matchesQuery(tab, query) {
  return (tab.title  || '').toLowerCase().includes(query) ||
         (tab.url    || '').toLowerCase().includes(query);
}

/**
 * Renders tab objects as <li> elements into #tab-list.
 * Animating items in one by one using animation-delay.
 * @param {chrome.tabs.Tab[]} tabs
 */
function renderTabList(tabs) {
  const list       = $('tab-list');
  const emptyState = $('empty-state');

  // Clear previous content (including loading skeletons)
  list.innerHTML = '';

  if (tabs.length === 0) {
    // Show the empty search state
    emptyState.hidden = false;
    $('empty-query').textContent = $('tab-search').value;
    return;
  }

  emptyState.hidden = true;

  tabs.forEach((tab, index) => {
    const li = document.createElement('li');
    li.className = 'tab-item' + (tab.active ? ' active-tab' : '');
    // Stagger the animation-delay so items cascade in
    li.style.animationDelay = `${index * 25}ms`;
    li.setAttribute('role', 'listitem');
    li.title = tab.url || '';

    /* ── Favicon ──────────────────────────────────────── */
    // Chrome provides favIconUrl; fall back to a letter avatar
    if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
      const img = document.createElement('img');
      img.className = 'tab-favicon';
      img.src = tab.favIconUrl;
      img.alt = '';
      // If the image fails (404, restricted), swap to letter avatar
      img.onerror = () => {
        img.replaceWith(letterFavicon(tab.title));
      };
      li.appendChild(img);
    } else {
      li.appendChild(letterFavicon(tab.title));
    }

    /* ── Title ────────────────────────────────────────── */
    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || tab.url || '(untitled)';
    li.appendChild(title);

    /* ── Close button ─────────────────────────────────── */
    const closeBtn = document.createElement('button');
    closeBtn.className    = 'tab-close-btn';
    closeBtn.textContent  = '✕';
    closeBtn.title        = 'Close tab';
    closeBtn.setAttribute('aria-label', `Close ${tab.title}`);

    closeBtn.addEventListener('click', async e => {
      e.stopPropagation();   // don't also fire the switch-to-tab handler
      try {
        await chrome.tabs.remove(tab.id);
        li.style.transform  = 'translateX(8px)';
        li.style.opacity    = '0';
        li.style.transition = 'transform 0.2s, opacity 0.2s';
        setTimeout(() => loadTabs(), 210);
      } catch (err) {
        console.error('FocusTab: failed to close tab', err);
      }
    });

    li.appendChild(closeBtn);

    /* ── Switch to tab on row click ───────────────────── */
    li.addEventListener('click', async (e) => {
      // Don't fire if the close button was clicked
      if (e.target.closest('.tab-close-btn')) return;
      try {
        await chrome.tabs.update(tab.id, { active: true });
        // NOTE: do NOT call chrome.windows.update here — it closes the popup
      } catch (err) {
        console.error('FocusTab: failed to switch tab', err);
      }
    });

    list.appendChild(li);
  });
}

/**
 * Creates a small coloured square with the first letter of the title
 * as a fallback when no favicon is available.
 * @param {string} title
 * @returns {HTMLElement}
 */
function letterFavicon(title) {
  const div = document.createElement('div');
  div.className = 'tab-favicon-fallback';
  div.textContent = (title || '?').charAt(0).toUpperCase();
  return div;
}

/**
 * Closes all duplicate tabs (same URL, keeping the first/oldest one).
 */
async function closeDuplicateTabs() {
  const btn = $('close-duplicates-btn');
  btn.disabled = true;

  try {
    // Always re-query for freshest list
    const freshTabs = await chrome.tabs.query({});
    const seen    = new Map();
    const toClose = [];

    for (const tab of freshTabs) {
      const url = tab.url || tab.pendingUrl || '';
      // Skip empty, chrome://, about:, and extension pages
      if (!url || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('chrome-extension://')) continue;

      // Normalise the URL (strip trailing slash for comparison)
      const normUrl = url.replace(/\/$/, '');
      if (seen.has(normUrl)) {
        toClose.push(tab.id);
      } else {
        seen.set(normUrl, tab.id);
      }
    }

    if (toClose.length === 0) {
      btn.textContent = '✓ No dupes';
      setTimeout(() => {
        btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M4 4h8v8H4zM2 2h8v8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 5l2 2-2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg> Close Dupes';
        btn.disabled = false;
      }, 1800);
      return;
    }

    await chrome.tabs.remove(toClose);
    btn.textContent = `✓ Closed ${toClose.length}`;
    setTimeout(() => {
      btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M4 4h8v8H4zM2 2h8v8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 5l2 2-2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg> Close Dupes';
      btn.disabled = false;
    }, 1800);
    await loadTabs();

  } catch (err) {
    console.error('FocusTab: failed to remove duplicates', err);
    btn.textContent = '⚠ Error';
    setTimeout(() => {
      btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M4 4h8v8H4zM2 2h8v8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 5l2 2-2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg> Close Dupes';
      btn.disabled = false;
    }, 1800);
  }
}

/** Wire up the Tab Manager section. */
function initTabManager() {
  // Initial load
  loadTabs();

  // Search input — filter on every keystroke
  $('tab-search').addEventListener('input', e => {
    const query = e.target.value.trim().toLowerCase();
    const clearBtn = $('search-clear');

    clearBtn.style.display = query ? 'block' : 'none';

    const filtered = query ? allTabs.filter(t => matchesQuery(t, query)) : allTabs;
    renderTabList(filtered);
  });

  // Clear search button
  $('search-clear').addEventListener('click', () => {
    $('tab-search').value = '';
    $('search-clear').style.display = 'none';
    renderTabList(allTabs);
  });

  // Close duplicates button
  $('close-duplicates-btn').addEventListener('click', closeDuplicateTabs);
}

/* ══════════════════════════════════════════════════════════
   SECTION 3 — Reading Mode
   ══════════════════════════════════════════════════════════ */

/** Tracks whether reading mode is currently ON. */
let readerActive = false;

/**
 * Queries the active tab, populates the page-info mini-card at the top
 * of the Reader panel, and loads the current reading mode state from
 * chrome.storage.
 */
async function initReaderPanel() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return;

    // Populate the page info card
    $('reader-page-title').textContent = activeTab.title || 'Untitled';
    $('reader-page-url').textContent   = activeTab.url
      ? new URL(activeTab.url).hostname
      : '';

    if (activeTab.favIconUrl && !activeTab.favIconUrl.startsWith('chrome://')) {
      $('reader-favicon').src = activeTab.favIconUrl;
    }

    // Restore the reading mode toggle state for this tab from storage.
    // We store it per-tab-id so each tab has its own independent state.
    chrome.storage.local.get(`reader_${activeTab.id}`, result => {
      const isActive = !!result[`reader_${activeTab.id}`];
      setReaderState(isActive);
    });
  } catch (err) {
    console.error('FocusTab: reader panel init failed', err);
  }
}

/**
 * Updates all UI elements to reflect the given reading mode state.
 * @param {boolean} active
 */
function setReaderState(active) {
  readerActive = active;

  const btn       = $('toggle-reader-btn');
  const badge     = $('reader-badge');
  const dot       = $('reader-status-dot');
  const card      = document.querySelector('.reader-card');
  const label     = $('toggle-label');

  btn.setAttribute('aria-pressed', String(active));
  badge.textContent = active ? 'ON' : 'OFF';
  badge.classList.toggle('on', active);
  dot.classList.toggle('active', active);
  card.classList.toggle('mode-active', active);
  label.textContent = active ? 'Disable Reading Mode' : 'Enable Reading Mode';
}

/**
 * Sends a message to content.js to toggle reading mode,
 * then persists the new state.
 */
async function toggleReaderMode() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return;

    // Block chrome:// and edge:// pages — content scripts can't run there
    if (!activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://')) {
      $('toggle-label').textContent = '⚠ Not available on this page';
      setTimeout(() => setReaderState(readerActive), 2000);
      return;
    }

    const newState = !readerActive;

    // ── Step 1: force-inject content.js + reading.css in case the tab
    //   was open before the extension loaded (manifest injection missed it)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files:  ['content/content.js'],
      });
      await chrome.scripting.insertCSS({
        target: { tabId: activeTab.id },
        files:  ['content/reading.css'],
      });
    } catch (injectErr) {
      // Already injected on this tab — safe to ignore
      console.warn('FocusTab: inject skipped —', injectErr.message);
    }

    // ── Step 2: brief delay so injected script is ready to receive messages
    await new Promise(r => setTimeout(r, 80));

    // ── Step 3: ask content.js to apply / remove the reading view
    await chrome.tabs.sendMessage(activeTab.id, {
      type:       'TOGGLE_READER',
      active:     newState,
      fontSize:   parseInt($('font-slider').value),
      lineHeight: parseFloat($('line-height-slider').value),
    });

    // ── Step 4: persist state + update UI
    chrome.storage.local.set({ [`reader_${activeTab.id}`]: newState });
    setReaderState(newState);

  } catch (err) {
    console.warn('FocusTab: could not toggle reader mode on this page.', err);
    $('toggle-label').textContent = '⚠ Not available on this page';
    setTimeout(() => setReaderState(readerActive), 2000);
  }
}

/** Sends a font-size update to content.js without toggling state. */
async function updateReaderFontSize(size) {
  if (!readerActive) return;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return;
    await chrome.tabs.sendMessage(activeTab.id, { type: 'UPDATE_FONT_SIZE', size });
  } catch (_) { /* page may not support messaging */ }
}

/** Sends a line-height update to content.js. */
async function updateReaderLineHeight(lineHeight) {
  if (!readerActive) return;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return;
    await chrome.tabs.sendMessage(activeTab.id, { type: 'UPDATE_LINE_HEIGHT', lineHeight });
  } catch (_) { /* ignore */ }
}

/** Wire up the Reading Mode section. */
function initReaderMode() {
  initReaderPanel();

  $('toggle-reader-btn').addEventListener('click', toggleReaderMode);

  // Font size slider
  $('font-slider').addEventListener('input', e => {
    const size = parseInt(e.target.value);
    $('font-size-display').textContent = `${size}px`;
    updateReaderFontSize(size);
  });

  // Line-height slider
  $('line-height-slider').addEventListener('input', e => {
    const lh = parseFloat(e.target.value).toFixed(1);
    $('line-height-display').textContent = lh;
    updateReaderLineHeight(parseFloat(lh));
  });
}

/* ══════════════════════════════════════════════════════════
   SECTION 4 — Pomodoro Focus Timer
   ══════════════════════════════════════════════════════════ */

/**
 * Timer durations in seconds for each mode.
 */
const TIMER_DURATIONS = {
  focus: 25 * 60,   // 1500 s
  short: 5  * 60,   //  300 s
  long:  15 * 60,   //  900 s
};

/** Radius of the SVG progress ring (must match the `r` attr in HTML). */
const RING_RADIUS      = 78;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;  // ≈ 490

/** Timer state object — the single source of truth. */
const timer = {
  mode:      'focus',          // 'focus' | 'short' | 'long'
  total:     TIMER_DURATIONS.focus,  // full duration for the current mode
  remaining: TIMER_DURATIONS.focus,  // seconds left
  running:   false,
  intervalId: null,
};

/**
 * Updates the time display, ring progress, and running animations.
 */
function updateTimerUI() {
  // Update countdown text
  $('timer-time').textContent = formatTime(timer.remaining);

  // Toggle the amber glow class on the digits
  $('timer-time').classList.toggle('running', timer.running);

  // Update circular progress ring
  //   dashoffset = circumference × (remaining / total)
  //   when full  → offset = circumference (ring looks empty)
  //   when done  → offset = 0            (ring fully filled)
  const progress = timer.remaining / timer.total;
  const offset   = RING_CIRCUMFERENCE * progress;
  $('ring-progress').style.strokeDashoffset = offset;
  $('ring-progress').style.strokeDasharray  = RING_CIRCUMFERENCE;
  $('ring-progress').classList.toggle('running', timer.running);
}

/**
 * Starts/resumes the countdown.
 */
function startTimer() {
  if (timer.running) return;
  timer.running = true;

  // Start a Chrome alarm as a reliable background timer
  // (setInterval would pause when the popup closes)
  chrome.alarms.create('focustab-tick', { periodInMinutes: 1 / 60 }); // every second

  // We also run a local interval for smooth UI updates while popup is open
  timer.intervalId = setInterval(() => {
    if (timer.remaining <= 0) {
      finishTimer();
      return;
    }
    timer.remaining--;
    updateTimerUI();
    // Save remaining to storage so background.js can also track it
    chrome.storage.local.set({ timerRemaining: timer.remaining });
  }, 1000);

  updateTimerUI();
  updateTimerControls();
}

/**
 * Pauses the countdown.
 */
function pauseTimer() {
  timer.running = false;
  clearInterval(timer.intervalId);
  chrome.alarms.clear('focustab-tick');
  updateTimerUI();
  updateTimerControls();
  chrome.storage.local.set({ timerRunning: false });
}

/**
 * Resets the timer to the full duration for the current mode.
 */
function resetTimer() {
  pauseTimer();
  timer.remaining = timer.total;
  updateTimerUI();
  updateTimerControls();
}

/**
 * Called when the countdown reaches 0.
 * Increments the session count (focus mode only) and fires a notification.
 */
async function finishTimer() {
  pauseTimer();
  timer.remaining = 0;
  updateTimerUI();

  // Fire a Chrome notification
  const isBreak = timer.mode !== 'focus';
  chrome.notifications.create(`focustab-done-${Date.now()}`, {
    type:    'basic',
    iconUrl: '../icons/icon48.png',
    title:   isBreak ? '☀ Break over!' : '🍅 Focus session complete!',
    message: isBreak
      ? 'Time to get back to work. Start a new focus session!'
      : 'Great work! Take a short or long break.',
  });

  // Increment session count only after a focus session
  if (!isBreak) {
    chrome.storage.local.get('sessionsToday', result => {
      const today   = new Date().toDateString();
      const stored  = result.sessionsToday || { date: today, count: 0 };
      const count   = stored.date === today ? stored.count + 1 : 1;
      chrome.storage.local.set({ sessionsToday: { date: today, count } });
      renderSessionCount(count);
    });
  }
}

/**
 * Switches the timer mode (Focus / Short Break / Long Break).
 * Resets the timer to the new mode's duration.
 * @param {string} mode
 */
function switchTimerMode(mode) {
  // Deactivate all mode buttons, activate the clicked one
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Reset timer to the new duration
  timer.mode      = mode;
  timer.total     = TIMER_DURATIONS[mode];
  timer.remaining = timer.total;

  // Update the label
  const labels = { focus: 'Focus Session', short: 'Short Break', long: 'Long Break' };
  $('timer-mode-label').textContent = labels[mode];

  // Update accent colour for the ring (green for breaks, amber for focus)
  const ring = $('ring-progress');
  ring.style.stroke = mode === 'focus' ? '' : 'var(--success)';

  pauseTimer();
  updateTimerUI();
}

/**
 * Updates the disabled/enabled state of Start/Pause/Reset buttons.
 */
function updateTimerControls() {
  $('start-btn').disabled = timer.running || timer.remaining === 0;
  $('pause-btn').disabled = !timer.running;
}

/**
 * Renders the session count number and tomato dots.
 * @param {number} count
 */
function renderSessionCount(count) {
  $('session-count').textContent = count;

  const dotsContainer = $('session-dots');
  dotsContainer.innerHTML = '';

  // Show up to 8 tomato icons
  const shown = Math.min(count, 8);
  for (let i = 0; i < shown; i++) {
    const dot = document.createElement('span');
    dot.className = 'session-dot';
    dot.textContent = '🍅';
    dot.style.animationDelay = `${i * 60}ms`;
    dotsContainer.appendChild(dot);
  }

  // If more than 8, add a +N label
  if (count > 8) {
    const extra = document.createElement('span');
    extra.className = 'session-dot';
    extra.style.fontSize = '11px';
    extra.style.color    = 'var(--text-muted)';
    extra.style.fontWeight = '700';
    extra.textContent = `+${count - 8}`;
    dotsContainer.appendChild(extra);
  }
}

/**
 * Loads saved timer and session state from chrome.storage on popup open.
 * This lets the timer survive popup close/reopen.
 */
function restoreTimerState() {
  chrome.storage.local.get(
    ['timerRemaining', 'timerMode', 'timerRunning', 'sessionsToday'],
    result => {
      // Restore mode
      if (result.timerMode) {
        switchTimerMode(result.timerMode);
      }

      // Restore remaining time
      if (typeof result.timerRemaining === 'number') {
        timer.remaining = result.timerRemaining;
      }

      updateTimerUI();
      updateTimerControls();

      // Restore session count for today
      const today   = new Date().toDateString();
      const stored  = result.sessionsToday;
      const count   = (stored && stored.date === today) ? stored.count : 0;
      renderSessionCount(count);

      // If the timer was running when the popup was closed, resume it
      if (result.timerRunning) startTimer();
    }
  );
}

/** Wire up the Timer section. */
function initTimer() {
  restoreTimerState();

  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      switchTimerMode(btn.dataset.mode);
    });
  });

  // Control buttons
  $('start-btn').addEventListener('click', () => {
    startTimer();
    chrome.storage.local.set({ timerMode: timer.mode, timerRunning: true });
  });

  $('pause-btn').addEventListener('click', pauseTimer);
  $('reset-btn').addEventListener('click', resetTimer);
}

/* ══════════════════════════════════════════════════════════
   ENTRY POINT — initialise everything when the popup opens
   ══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initTabManager();
  initReaderMode();
  initTimer();
});
