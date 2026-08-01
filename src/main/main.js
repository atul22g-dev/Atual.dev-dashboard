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
   ============================================================ */

// 📦 Import required modules
const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const { WINDOW, ICON_PATH, PRELOAD_PATH, RENDERER_HTML } = require('./config');
const { registerIpcHandlers } = require('./ipc');

// ── Static analysis entry markers ──
// The following require.resolve() calls let dead-code analysis tools (deslop)
// discover the renderer module graph. At runtime they only resolve paths
// without executing modules — the actual renderer loads via loadFile().
require.resolve('../renderer/script/app.js');

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

  // 📄 Load the dashboard HTML file
  mainWindow.loadFile(RENDERER_HTML);

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

// 'whenReady' fires after Electron has finished starting up
app.whenReady().then(() => {
  createWindow();

  // macOS: Re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // ─── IPC Handlers ───────────────────────
  // All channels are registered here in one place (see ipc.js).
  registerIpcHandlers(() => mainWindow);
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
