/* ============================================================
   ⚙️ CONSTANTS — shared renderer constants (Phase 2 → 4 TS)
   ============================================================
   Single source of truth for the auto-refresh cadence, theme
   storage keys, and performance modes (Phase 6) used by app.js.
   ============================================================ */

/** localStorage key for the dark/light/system theme preference. */
export const THEME_STORAGE_KEY = 'atual-dev-dashboard-theme';

/** localStorage key for the app settings object (Phase 7). */
export const SETTINGS_STORAGE_KEY = 'atual-dev-dashboard-settings';

/** localStorage key for the sidebar collapsed state (Phase 7). */
export const SIDEBAR_STORAGE_KEY = 'atual-dev-dashboard-sidebar';

/** Main system-info refresh cycle (ms). */
export const REFRESH_INTERVAL_MS = 1500;

/** Slow-poll intervals for expensive sections (ms). */
export const DISK_INTERVAL_MS = 8000;
export const PROCESS_INTERVAL_MS = 5000;
export const NET_SPEED_INTERVAL_MS = 1500;

/** Chart history cap (points kept per line chart). */
export const MAX_HISTORY = 60;

/**
 * Body class applied when perf mode is `lowEnd` (Phase 6). CSS and canvas
 * code use it to strip expensive effects: backdrop blur, infinite CSS
 * animations, chart glows/dots, gauge tweens, and HiDPI backing stores.
 */
export const LOW_END_MODE_CLASS = 'low-end-mode';

/**
 * Performance mode interval multipliers (Phase 6).
 * Low Power / Low-End slow down every poll by this factor and let
 * sections decide to reduce animations.
 */
export type PerfMode = 'balanced' | 'lowPower' | 'lowEnd';

export const PERF_MODE_MULTIPLIER: Record<PerfMode, number> = {
  balanced: 1,
  lowPower: 2,
  lowEnd: 4,
};

/**
 * Temp/fan probe cadence: probe every N refresh cycles (not every cycle).
 * The refresh interval is ALREADY scaled by the perf-mode multiplier
 * (1.5 s → 3 s → 6 s), so a single probe-every-2 gives the intended
 * wall-clock cadence across all modes: Balanced ~3 s, Low Power ~6 s,
 * Low-End ~12 s. These probes spawn shell commands in the main process,
 * so throttling them is a real low-end CPU win.
 */
export const TEMP_PROBE_CYCLES = 2;
