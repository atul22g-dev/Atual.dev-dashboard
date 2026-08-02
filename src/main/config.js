/* ============================================================
   ⚙️ CONFIG — central app constants (Phase 2 split, Phase 4 Vite)
   ============================================================
   Extracted from the old monolithic main.js so providers, IPC
   wiring and the entry point share one source of truth for
   window geometry, paths and safety limits.

   Phase 4: the renderer is compiled by Vite into out/renderer.
   The source HTML can no longer run directly (utils.js → utils.ts,
   browsers can't execute .ts), so RENDERER_HTML ALWAYS points at
   the built bundle. If the build is missing, main.js logs a clear
   "run npm run build" error instead of silently loading a broken
   page. Do NOT reintroduce a source fallback here.
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

// Phase 4: always load the Vite-built bundle. The source HTML cannot
// run standalone anymore (the renderer is TypeScript-compiled), so there
// is deliberately NO fallback — main.js warns loudly if this is missing.
const RENDERER_HTML = path.join(__dirname, '..', '..', 'out', 'renderer', 'index.html');

// Phase 4 completion — HMR dev flow: `npm run dev` serves the renderer from
// this URL (vite.config.mjs `server.port`) and main.js loads it instead of
// the built file when launched with --dev-server.
const DEV_SERVER_URL = 'http://localhost:5173';

/** Process-list safety limits (used by providers/processes.js). */
const PROCESS_SCAN_LIMIT = 50;
const PROCESS_RESULT_LIMIT = 30;

module.exports = {
  WINDOW,
  ICON_PATH,
  PRELOAD_PATH,
  RENDERER_HTML,
  DEV_SERVER_URL,
  PROCESS_SCAN_LIMIT,
  PROCESS_RESULT_LIMIT,
};
