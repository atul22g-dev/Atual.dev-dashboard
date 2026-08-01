/* ============================================================
   ⚙️ CONFIG — central app constants (Phase 2 split)
   ============================================================
   Extracted from the old monolithic main.js so providers, IPC
   wiring and the entry point share one source of truth for
   window geometry, paths and safety limits.
   ============================================================ */

'use strict';

const path = require('path');

/** BrowserWindow geometry + title (used by main.js entry). */
const WINDOW = {
  width: 1280,
  height: 800,
  minWidth: 900,
  minHeight: 600,
  title: 'Atual.dev Dashboard',
  backgroundColor: '#0a0a0f',
};

/** Absolute paths for the window's icon, preload and renderer HTML. */
const ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'icon.png');
const PRELOAD_PATH = path.join(__dirname, '..', 'preload', 'preload.js');
const RENDERER_HTML = path.join(__dirname, '..', 'renderer', 'index.html');

/** Process-list safety limits (used by providers/processes.js). */
const PROCESS_SCAN_LIMIT = 50;
const PROCESS_RESULT_LIMIT = 30;

module.exports = {
  WINDOW,
  ICON_PATH,
  PRELOAD_PATH,
  RENDERER_HTML,
  PROCESS_SCAN_LIMIT,
  PROCESS_RESULT_LIMIT,
};
