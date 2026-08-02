/* ============================================================
   ⚙️ PREFERENCES STORE (Phase 8) — persisted app preferences
   ============================================================
   Loads/saves the AppPreferences object (theme, accent color,
   perf mode, reduce-motion, sidebar, start-with-Windows,
   minimize-to-tray) to <userData>/preferences.json.

   The store is defensive about Electron: it only touches
   app.getPath('userData') when Electron's `app` is available
   (real runtime). Under plain Node (unit tests) it falls back
   to a temp dir so the module can be required safely.
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/** Defaults — must stay in sync with src/shared/ipc/contracts.ts AppPreferences. */
const DEFAULT_PREFERENCES = {
  theme: 'dark',
  accentColor: '#6366f1',
  perfMode: 'balanced',
  reducedMotion: false,
  sidebarCollapsed: false,
  startWithWindows: false,
  minimizeToTray: false,
};

let _cache = null;

/** Resolve the preferences file path (userData in Electron, temp dir otherwise). */
function preferencesFilePath() {
  let base;
  try {
    const { app } = require('electron');
    base = app?.getPath ? app.getPath('userData') : null;
  } catch (e) {
    base = null;
  }
  if (!base) base = path.join(os.tmpdir(), 'atual-dev-dashboard');
  return path.join(base, 'preferences.json');
}

/** Read preferences (cached). Never throws — falls back to defaults. */
function getPreferences() {
  if (_cache) return { ..._cache };
  try {
    const raw = fs.readFileSync(preferencesFilePath(), 'utf8');
    _cache = { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch (e) {
    _cache = { ...DEFAULT_PREFERENCES };
  }
  return { ..._cache };
}

/** Merge + persist a partial preferences patch. Returns the new full object. */
function setPreferences(patch) {
  const next = { ...getPreferences(), ...(patch || {}) };
  _cache = { ...next };
  try {
    const file = preferencesFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
  } catch (e) {
    // Persistence is best-effort; in-memory value still applies this session.
  }
  return { ...next };
}

module.exports = { getPreferences, setPreferences };
