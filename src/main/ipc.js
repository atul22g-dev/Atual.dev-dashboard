/* ============================================================
   🔌 IPC — single place that registers every main-process channel
   (Phase 2 split from main.js)
   ============================================================
   All ipcMain.handle/on registrations live here so the entry
   point stays slim. Provider functions are imported and bound
   to their channels.

   `getWindow` is a getter supplied by main.js so window-control
   channels can reach the current BrowserWindow without this
   module holding a reference.
   ============================================================ */

'use strict';

const { ipcMain } = require('electron');

const { getSystemInfo, getVirtualMemory } = require('./providers/system');
const { getDiskInfo } = require('./providers/disk');
const { getBatteryInfo, getBatteryDetails } = require('./providers/battery');
const { getCpuTemperature, getGpuTemperature } = require('./providers/temperature');
const { getNetworkSpeed } = require('./providers/network');
const { getProcessList } = require('./providers/processes');
const {
  checkAdminStatus,
  checkNpmNeedsAdmin,
  runPackageElevated,
  getNpmPackages,
  getPipPackages,
  updatePackage,
  installPackage,
  deletePackage,
  searchNpmRegistry,
  searchPipRegistry,
} = require('./providers/packages');

/**
 * Register every IPC channel the renderer can call.
 * Must be invoked after app.whenReady() so Electron's ipcMain is live.
 *
 * @param {() => import('electron').BrowserWindow | null} getWindow
 * @param {object} [services] Phase 8 services (preferences store, tray/notify hooks)
 */
function registerIpcHandlers(getWindow, services = {}) {
  const {
    getPreferences = () => ({}),
    setPreferences = (patch) => patch,
    showMainWindow = () => {},
    applyOsPreferences = () => {},
    notify = () => {},
  } = services;

  // ─── Phase 8 — App preferences ────────────
  ipcMain.handle('app-preferences-get', () => getPreferences());
  ipcMain.handle('app-preferences-set', (_event, patch) => {
    const next = setPreferences(patch || {});
    applyOsPreferences(next); // start-with-Windows etc.
    return next;
  });
  ipcMain.on('window-hide', () => getWindow()?.hide());
  ipcMain.on('window-show', () => showMainWindow());
  ipcMain.on('notify', (_event, message) => notify(String(message || '')));

  // ─── Phase 9 — safe update check (scaffolding) ───
  // Returns a structured result; auto-update is not enabled for this build
  // (no signed releases / update server yet), so this is always "no update".
  ipcMain.handle('check-for-update', () => ({
    available: false,
    message: 'Auto-update is not enabled for this build. Check the project releases manually.',
  }));
  // ─── System data handlers ───────────────
  ipcMain.handle('get-system-info', () => getSystemInfo());
  ipcMain.handle('get-disk-info', () => getDiskInfo());
  ipcMain.handle('get-battery-info', () => getBatteryInfo());
  ipcMain.handle('get-process-list', () => getProcessList());
  ipcMain.handle('get-npm-packages', () => getNpmPackages());
  ipcMain.handle('get-pip-packages', () => getPipPackages());
  // 🛡️ Phase 1 — every handler below validates its arguments before any shell
  // command or network call (see validators.js). The generic `run-elevated`
  // channel is REMOVED — only structured, validated operations can elevate.
  ipcMain.handle('update-package', (_, type, name) => updatePackage(type, name));
  ipcMain.handle('delete-package', (_, type, name) => deletePackage(type, name));
  ipcMain.handle('install-package', (_, type, name) => installPackage(type, name));
  ipcMain.handle('elevate-package', (_, action, type, name) => runPackageElevated(action, type, name));
  ipcMain.handle('search-npm-packages', (_, query) => searchNpmRegistry(query));
  ipcMain.handle('search-pip-packages', (_, query) => searchPipRegistry(query));
  ipcMain.handle('check-admin', () => checkAdminStatus());
  ipcMain.handle('check-npm-admin', () => checkNpmNeedsAdmin());
  ipcMain.handle('get-cpu-temp', () => getCpuTemperature());
  ipcMain.handle('get-gpu-temp', () => getGpuTemperature());
  ipcMain.handle('get-network-speed', () => getNetworkSpeed());
  ipcMain.handle('get-battery-details', () => getBatteryDetails());
  ipcMain.handle('get-virtual-memory', () => getVirtualMemory());

  // ─── Window Controls ────────────────────
  ipcMain.on('window-minimize', () => getWindow()?.minimize());
  ipcMain.on('window-maximize', () => {
    const win = getWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });
  ipcMain.on('window-close', () => getWindow()?.close());
}

module.exports = { registerIpcHandlers };
