/* ============================================================
   📋 MAIN PROCESS — Electron App Entry Point (Phase 2 split)
   ============================================================
   This file runs in the "main process" (Node.js environment).
   It creates the app window and wires the IPC layer.

   🔑 KEY CONCEPTS FOR BEGINNERS:
   - Electron has 2 processes: Main (Node.js) & Renderer (webpage)
   - IPC = Inter-Process Communication (data bridge)
   - ipcMain.handle() = receives requests from the renderer
   - contextBridge = securely exposes data to the renderer

   🏗️ Phase 2 — the monolith was split:
   - providers/*  → system data collection (CPU, disk, battery, temps, …)
   - ipc.js       → every ipcMain.handle/on registration
   - config.js    → window geometry + paths + safety limits
   - validators.js → Phase 1 input validation (unchanged)

   🛡️ Phase 3 — reliability:
   - command-service.js → centralized exec (timeout/maxBuffer/errors)
   - logger.js + crash guards → uncaughtException/unhandledRejection
     are logged locally and surfaced to the renderer (never silent)
   ============================================================ */

// 📦 Import required modules
const { app, BrowserWindow, nativeImage, Tray, Menu, globalShortcut, Notification } = require('electron');
const fs = require('fs');
const { WINDOW, ICON_PATH, TRAY_ICON_PATH, PRELOAD_PATH, RENDERER_HTML, DEV_SERVER_URL } = require('./config');
const { registerIpcHandlers } = require('./ipc');
const { logError } = require('./logger');
const { getPreferences, setPreferences } = require('./preferences');



// ──────────────────────────────────────────────
// 🪟 SINGLE-INSTANCE LOCK (must be acquired first)
// ──────────────────────────────────────────────
// Acquire BEFORE any whenReady handler is registered so a second launch can
// never briefly create a window: on lock failure we quit immediately and let
// the first instance handle the second-instance event.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
}

// ──────────────────────────────────────────────
// 🔧 PHASE 8 — OS PREFERENCES (start-with-Windows, tray)
// ──────────────────────────────────────────────
// Applied once at startup and whenever the renderer changes them.
let tray = null;
let isQuitting = false;

function applyOsPreferences(prefs) {
  // Start with Windows (only meaningful on Windows; harmless elsewhere)
  try {
    app.setLoginItemSettings({ openAtLogin: !!prefs.startWithWindows });
  } catch (e) {
    logError('set-login-item', e);
  }
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  let icon = null;
  try {
    // Dedicated small tray render (16×16) — crisp on Windows/macOS tray bars.
    icon = nativeImage.createFromPath(TRAY_ICON_PATH);
  } catch (e) {
    try { icon = nativeImage.createFromPath(ICON_PATH); } catch (e2) { /* fall back to empty tray icon */ }
  }
  tray = new Tray(icon || nativeImage.createEmpty());
  tray.setToolTip('Atual.dev Dashboard');
  const menu = Menu.buildFromTemplate([
    { label: 'Show Dashboard', click: showMainWindow },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function notify(message, title = 'Atual.dev Dashboard') {
  try {
    if (!Notification.isSupported()) return;
    new Notification({ title, body: message }).show();
  } catch (e) {
    logError('notification', e);
  }
}

// ──────────────────────────────────────────────
// 🛡️ CRASH GUARDS (Phase 3)
// ──────────────────────────────────────────────
// Log uncaught exceptions / unhandled rejections locally and forward them
// to the renderer so no important failure only appears in a console.
// We never swallow silently — logError() writes to <userData>/logs.
process.on('uncaughtException', (error) => {
  logError('uncaughtException', error);
  console.error('[crash-guard] uncaughtException:', error);
  mainWindow?.webContents.send('main-error', {
    scope: 'uncaughtException',
    message: (error && error.message) || String(error),
  });
  // Node docs: after an uncaughtException the process is in an unknown state —
  // log + notify, then exit after a short delay so the IPC message flushes.
  setTimeout(() => app.exit(1), 500);
});

process.on('unhandledRejection', (reason) => {
  logError('unhandledRejection', reason);
  console.error('[crash-guard] unhandledRejection:', reason);
  mainWindow?.webContents.send('main-error', {
    scope: 'unhandledRejection',
    message: (reason && reason.message) || String(reason),
  });
});

// ── Static analysis entry markers ──
// The following require.resolve() calls let dead-code analysis tools (deslop)
// discover the renderer module graph. At runtime they only resolve paths
// without executing modules — the actual renderer loads via loadFile().
require.resolve('../renderer/script/app.ts');

// ──────────────────────────────────────────────
// 🪟 WINDOW SETUP
// ──────────────────────────────────────────────

let mainWindow; // The main application window

function createWindow() {
  // 🎨 Load app icon from PNG
  let appIcon = null;
  try {
    appIcon = nativeImage.createFromPath(ICON_PATH);
  } catch (e) { /* icon loading failed — fall back to default */ }

  mainWindow = new BrowserWindow({
    width: WINDOW.width,          // Window width in pixels
    height: WINDOW.height,        // Window height in pixels
    minWidth: WINDOW.minWidth,    // Minimum resize width
    minHeight: WINDOW.minHeight,  // Minimum resize height
    frame: false,                 // Remove OS window frame (we draw custom title bar)
    titleBarStyle: 'hidden',
    title: WINDOW.title,
    icon: appIcon,                // Custom app icon from assets/icon.png
    backgroundColor: WINDOW.backgroundColor, // Background color while loading

    // 🔒 Security settings (important!)
    webPreferences: {
      preload: PRELOAD_PATH,      // Bridge file
      nodeIntegration: false,     // 🚫 No Node.js in webpage (security)
      contextIsolation: true,     // ✅ Keep webpage separate from Electron
      sandbox: true,              // 🛡️ Extra security layer
    },
  });

  // Phase 8 — minimize-to-tray: intercept the close button when enabled so
  // the app keeps running in the tray instead of quitting.
  mainWindow.on('close', (event) => {
    if (!isQuitting && getPreferences().minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      notify('Atual.dev Dashboard is still running in the system tray.');
    }
  });

  // 📄 Load the dashboard renderer (Phase 4: Vite-built bundle; Phase 4
  // completion: `--dev-server` loads the Vite dev server for HMR instead).
  if (process.argv.includes('--dev-server')) {
    console.log('[main] Loading renderer from Vite dev server:', DEV_SERVER_URL);
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    if (!fs.existsSync(RENDERER_HTML)) {
      // Loud, actionable failure instead of a blank/broken window: the renderer
      // is TypeScript-compiled now, so the source HTML cannot run standalone.
      console.error('[main] Renderer build not found at:', RENDERER_HTML);
      console.error('[main] Run `npm run build` (Vite) before starting the app.');
      logError('missing-renderer-build', `Run 'npm run build' — expected ${RENDERER_HTML}`);
    }
    mainWindow.loadFile(RENDERER_HTML);
  }

  // 🔧 Open DevTools when running with --dev flag
  // Usage: npm run dev
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Notify renderer when window is maximized/restored
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized');
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-unmaximized');
  });

  // Clean up when window closes
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ──────────────────────────────────────────────
// 🚀 APP INITIALIZATION
// ──────────────────────────────────────────────

// Disable disk cache to suppress "Unable to move cache" / "Gpu Cache Creation failed" errors
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');

// Phase 6 — Low-End mode: force software rendering. Weak/unsupported GPUs
// spend more time fighting the GPU process (crashes, stalls, compositor
// jank) than they save; SwiftShader keeps the dashboard fluid instead. Must
// run before app.whenReady().
if (getPreferences().perfMode === 'lowEnd') {
  app.disableHardwareAcceleration();
}

// 'whenReady' fires after Electron has finished starting up
app.whenReady().then(() => {
  const prefs = getPreferences();
  applyOsPreferences(prefs);
  createWindow();
  createTray();

  // Phase 8 — native shortcut: Ctrl+Shift+D shows the dashboard from anywhere.
  globalShortcut.register('CommandOrControl+Shift+D', showMainWindow);

  // macOS: Re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // ─── IPC Handlers ───────────────────────
  // All channels are registered here in one place (see ipc.js).
  registerIpcHandlers(() => mainWindow, { getPreferences, setPreferences, showMainWindow, applyOsPreferences, notify });
});

// Quit when all windows are closed (except on macOS, and unless the user
// chose minimize-to-tray — in that case the app keeps running in the tray).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !getPreferences().minimizeToTray) {
    app.quit();
  }
});

// Phase 8 — release tray + shortcuts on a clean quit
app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  if (tray) { tray.destroy(); tray = null; }
});


