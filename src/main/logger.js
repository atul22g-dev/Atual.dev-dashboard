/* ============================================================
   📝 LOGGER — local crash/error log (Phase 3)
   ============================================================
   Writes uncaughtException / unhandledRejection entries to a
   rotating-friendly plain-text log under the app's userData dir
   (plan.md §7 "Add local logging"). Never throws — logging must
   not crash the app it is protecting.
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');

/** Log directory: <userData>/logs (fallback: ./logs if userData unavailable). */
function getLogDir() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'logs');
  } catch (e) {
    return path.join(__dirname, '..', '..', 'logs');
  }
}

/**
 * Append a timestamped entry to main-error.log.
 * @param {string} scope 'uncaughtException' | 'unhandledRejection' | ...
 * @param {unknown} error error object or value
 */
function logError(scope, error) {
  try {
    const dir = getLogDir();
    fs.mkdirSync(dir, { recursive: true });
    const detail = error && error.stack ? error.stack : String(error);
    const line = `${new Date().toISOString()} [${scope}] ${detail}\n`;
    fs.appendFileSync(path.join(dir, 'main-error.log'), line);
  } catch (e) {
    // Logging must never throw — swallow and keep the app alive.
  }
}

module.exports = { logError, getLogDir };
