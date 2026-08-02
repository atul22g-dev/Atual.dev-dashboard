/* ============================================================
   🔌 PRELOAD SCRIPT - Secure Bridge between Main & Renderer
   ============================================================
   
   📚 WHAT THIS FILE DOES:
   - Runs before the webpage (renderer) loads
   - Creates a safe bridge between Node.js (main) and the webpage
   - Exposes ONLY specific functions via window.electronAPI
   
   🔒 WHY THIS IS IMPORTANT (Security):
   - The renderer (index.html) runs in a sandbox - NO Node.js access
   - This file has special privileges to talk to Node.js
   - We carefully choose what functions to expose
   - The webpage can ONLY use what we list here
   
   💡 HOW IT WORKS:
   - ipcRenderer.invoke() = "Hey main process, please do this and send me the result"
   - ipcRenderer.send() = "Hey main process, please do this (fire and forget)"
   - ipcRenderer.on() = "Hey renderer, the main process sent you a message"
   
   ============================================================ */

// 📦 Import Electron's bridge modules
const { contextBridge, ipcRenderer } = require('electron');

// 🌉 Expose functions to the renderer process (webpage)
// The renderer can access these as: window.electronAPI.getSystemInfo()
contextBridge.exposeInMainWorld('electronAPI', {
  // ============================================
  // 📊 System Data (async - returns a Promise)
  // ============================================
  
  // Fetch all system info (CPU, memory, OS, etc.)
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  // Fetch disk/drive info (asynchronous)
  getDiskInfo: () => ipcRenderer.invoke('get-disk-info'),
  // Fetch battery level and status
  getBatteryInfo: () => ipcRenderer.invoke('get-battery-info'),
  // Fetch running processes list
  getProcessList: () => ipcRenderer.invoke('get-process-list'),
  // Fetch npm global packages
  getNpmPackages: () => ipcRenderer.invoke('get-npm-packages'),
  // Fetch pip global packages
  getPipPackages: () => ipcRenderer.invoke('get-pip-packages'),
  // Update a package (npm or pip)
  updatePackage: (type, name) => ipcRenderer.invoke('update-package', type, name),
  // Delete/uninstall a package (npm or pip)
  deletePackage: (type, name) => ipcRenderer.invoke('delete-package', type, name),
  // Install a new package (npm or pip)
  installPackage: (type, name) => ipcRenderer.invoke('install-package', type, name),
  // Check if app has admin/root privileges
  checkAdmin: () => ipcRenderer.invoke('check-admin'),
  // Check if npm prefix typically needs admin
  checkNpmAdmin: () => ipcRenderer.invoke('check-npm-admin'),
  // Run a WHITELISTED package operation with elevated privileges (UAC / sudo prompt)
  // Phase 1: renderer supplies (action, type, name) only — never a command string.
  // The main process validates everything and builds the command itself.
  elevatePackage: (action, type, name) => ipcRenderer.invoke('elevate-package', action, type, name),
  // Fetch CPU temperature
  getCpuTemp: () => ipcRenderer.invoke('get-cpu-temp'),
  // Fetch GPU temperature
  getGpuTemp: () => ipcRenderer.invoke('get-gpu-temp'),
  // Fetch fan speeds (Linux hwmon / Windows WMI best-effort)
  getFanInfo: () => ipcRenderer.invoke('get-fan-info'),
  // Search npm/pip registries for package suggestions
  searchNpmPackages: (query) => ipcRenderer.invoke('search-npm-packages', query),
  searchPipPackages: (query) => ipcRenderer.invoke('search-pip-packages', query),
  // Virtual memory information
  getVirtualMemory: () => ipcRenderer.invoke('get-virtual-memory'),
  // Fetch real-time network transfer speeds
  getNetworkSpeed: () => ipcRenderer.invoke('get-network-speed'),
  // Fetch detailed battery specs (design capacity, cycle count, etc.)
  getBatteryDetails: () => ipcRenderer.invoke('get-battery-details'),

  // ============================================
  // 🪟 Window Controls (fire-and-forget)
  // ============================================
  
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // ============================================
  // ⚙️ Preferences & Tray (Phase 8)
  // ============================================

  // Read/write the persisted AppPreferences object (main-process store)
  getAppPreferences: () => ipcRenderer.invoke('app-preferences-get'),
  setAppPreferences: (prefs) => ipcRenderer.invoke('app-preferences-set', prefs),
  // Hide to tray / restore from tray
  hideWindow: () => ipcRenderer.send('window-hide'),
  showWindow: () => ipcRenderer.send('window-show'),
  // Fire a native Windows notification from the renderer
  notify: (message) => ipcRenderer.send('notify', message),
  // Safe update check (Phase 9 scaffolding — returns not-available by default)
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),

  // ============================================
  // 🔔 Event Listeners (main → renderer)
  // ============================================
  
  // Listen for window maximize/restore events
  onMaximize: (callback) => ipcRenderer.on('window-maximized', () => callback()),
  onUnmaximize: (callback) => ipcRenderer.on('window-unmaximized', () => callback()),
  
  // Phase 3 — main-process crash guard notifications (uncaughtException /
  // unhandledRejection). The renderer can surface these to the user instead
  // of letting a main-process failure pass silently.
  onMainError: (callback) => ipcRenderer.on('main-error', (_event, payload) => callback(payload)),
  
  // Clean up event listeners (prevent memory leaks)
  removeMaximizeListeners: () => {
    ipcRenderer.removeAllListeners('window-maximized');
    ipcRenderer.removeAllListeners('window-unmaximized');
  },
  removeMainErrorListeners: () => {
    ipcRenderer.removeAllListeners('main-error');
  },
});
