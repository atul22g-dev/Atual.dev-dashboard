/* ============================================================
   ⚙️ CONSTANTS — shared renderer constants (Phase 2)
   ============================================================
   Single source of truth for the auto-refresh cadence and the
   theme storage key used by app.js.
   ============================================================ */

/** localStorage key for the dark/light theme preference. */
export const THEME_STORAGE_KEY = 'atual-dev-dashboard-theme';

/** Main system-info refresh cycle (ms). */
export const REFRESH_INTERVAL_MS = 1500;

/** Slow-poll intervals for expensive sections (ms). */
export const DISK_INTERVAL_MS = 8000;
export const PROCESS_INTERVAL_MS = 5000;
export const NET_SPEED_INTERVAL_MS = 1500;
