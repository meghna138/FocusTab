# FocusTab

A Chrome extension that combines Tab Management, Reading Mode, and a Pomodoro Focus Timer in a single, lightweight popup.

---

## Features

### Tab Manager
- View all open tabs across all windows with live tab and window counts
- Search tabs by title or URL in real time
- Switch to any tab with a single click
- Close individual tabs or remove all duplicates at once

### Reading Mode
- Removes ads, sidebars, navigation bars, and visual clutter from any article
- Renders content in a clean, distraction-free layout with serif typography
- Adjustable font size (12px – 28px) and line spacing via sliders
# FocusTab
- Dark mode toggle available on the floating in-page toolbar
- Exit reading mode at any time from the toolbar or the popup

### Pomodoro Focus Timer
- Three configurable modes: Focus (25 min), Short Break (5 min), Long Break (15 min)
- Animated circular progress ring with real-time countdown
- Timer continues running in the background when the popup is closed
- Desktop notifications on session completion
- Tracks and displays completed focus sessions for the current day

---

## Project Structure

```
FocusTab/
├── manifest.json
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── background/
│   └── background.js
└── content/
    ├── content.js
    └── reading.css
```

---

## Installation (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer Mode** using the toggle in the top right corner
4. Click **Load unpacked**
5. Select the `FocusTab` folder
6. The extension icon will appear in the Chrome toolbar

---

## Tech Stack

- Manifest V3
- Vanilla JavaScript — no external frameworks or dependencies
- Chrome APIs: `tabs`, `storage`, `alarms`, `notifications`, `scripting`
- Fonts: Syne and JetBrains Mono via Google Fonts

---

## License

MIT License — free to use, modify, and distribute.

---

Developed by [meghna138](https://github.com/meghna138)
