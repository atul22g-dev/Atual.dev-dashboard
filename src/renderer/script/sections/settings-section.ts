/* ============================================================
   ⚙️ SETTINGS SECTION - App preferences (Phase 7)
   Contract: init() / update() / destroy() (Phase 2)
   Persists via localStorage through app.ts (DashboardSettings).
   Theme mode + accent color + perf mode + reduced motion live here;
   OS-level prefs (start with Windows / minimize to tray) are
   handled in Phase 8 via window.electronAPI preferences.
   ============================================================ */

import { $, clearSectionError } from '../utils.js';
import type { AppPreferences, PartialPreferences } from '../../../shared/ipc/contracts.js';

/** Apply a preference change to the UI + localStorage (renderer settings). */
export function init(): void {
  const themeSelect = $('settingsThemeMode') as HTMLSelectElement | null;
  const accentInput = $('settingsAccentColor') as HTMLInputElement | null;
  const perfSelect = $('settingsPerfMode') as HTMLSelectElement | null;
  const motionCheck = $('settingsReducedMotion') as HTMLInputElement | null;
  const startWinCheck = $('settingsStartWithWindows') as HTMLInputElement | null;
  const trayCheck = $('settingsMinimizeToTray') as HTMLInputElement | null;

  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      const { persistSettings, applyTheme } = (window as unknown as {
        persistSettings?: (p: unknown) => void; applyTheme?: () => void;
      });
      if (persistSettings) persistSettings({ theme: themeSelect.value });
      if (applyTheme) applyTheme();
      else document.body.classList.toggle('light-theme', themeSelect.value === 'light');
    });
  }

  if (accentInput) {
    accentInput.addEventListener('input', () => {
      const { persistSettings, applyTheme } = (window as unknown as {
        persistSettings?: (p: unknown) => void; applyTheme?: () => void;
      });
      if (persistSettings) persistSettings({ accentColor: accentInput.value });
      if (applyTheme) applyTheme();
    });
  }

  if (perfSelect) {
    perfSelect.addEventListener('change', () => {
      const { persistSettings, applyPerfMode } = (window as unknown as {
        persistSettings?: (p: unknown) => void; applyPerfMode?: () => void;
      });
      if (persistSettings) persistSettings({ perfMode: perfSelect.value });
      // Re-apply the Low-End body class so canvas/CSS optimizations kick in
      // immediately instead of waiting for the next app restart (Phase 6).
      if (applyPerfMode) applyPerfMode();
    });
  }

  if (motionCheck) {
    motionCheck.addEventListener('change', () => {
      const { persistSettings } = (window as unknown as { persistSettings?: (p: unknown) => void });
      if (persistSettings) persistSettings({ reducedMotion: motionCheck.checked });
      document.body.classList.toggle('reduced-motion', motionCheck.checked);
    });
  }

  // OS-level prefs (Phase 8) — best-effort; renderer keeps working if unavailable.
  if (startWinCheck) {
    startWinCheck.addEventListener('change', () => {
      setPreference({ startWithWindows: startWinCheck.checked }).catch(() => {});
    });
  }
  if (trayCheck) {
    trayCheck.addEventListener('change', () => {
      setPreference({ minimizeToTray: trayCheck.checked }).catch(() => {});
    });
  }
}

/** Sync the controls from current settings (called on init + after changes). */
export function update(): void {
  const themeSelect = $('settingsThemeMode') as HTMLSelectElement | null;
  const accentInput = $('settingsAccentColor') as HTMLInputElement | null;
  const perfSelect = $('settingsPerfMode') as HTMLSelectElement | null;
  const motionCheck = $('settingsReducedMotion') as HTMLInputElement | null;
  const startWinCheck = $('settingsStartWithWindows') as HTMLInputElement | null;
  const trayCheck = $('settingsMinimizeToTray') as HTMLInputElement | null;

  const rendererSettings = (window as unknown as { readSettings?: () => Record<string, unknown> }).readSettings?.() || {};
  if (themeSelect && typeof rendererSettings.theme === 'string') themeSelect.value = rendererSettings.theme;
  if (accentInput && typeof rendererSettings.accentColor === 'string') accentInput.value = rendererSettings.accentColor;
  if (perfSelect && typeof rendererSettings.perfMode === 'string') perfSelect.value = rendererSettings.perfMode;
  if (motionCheck && typeof rendererSettings.reducedMotion === 'boolean') motionCheck.checked = rendererSettings.reducedMotion;

  // OS prefs load async from the main process.
  window.electronAPI.getAppPreferences().then((prefs: AppPreferences) => {
    if (startWinCheck) startWinCheck.checked = !!prefs.startWithWindows;
    if (trayCheck) trayCheck.checked = !!prefs.minimizeToTray;
  }).catch(() => {});
}

/** Persist OS-level preferences to the main process (Phase 8). */
function setPreference(patch: PartialPreferences): Promise<AppPreferences> {
  return window.electronAPI.setAppPreferences(patch);
}

/** No timers or listeners owned by this section beyond the DOM handlers. */
export function destroy(): void {
  clearSectionError('settings');
}
