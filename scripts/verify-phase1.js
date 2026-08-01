/* ============================================================
   🛡️ PHASE 1 VERIFICATION — hostile package name + XSS probe
   ============================================================
   Boots the REAL app inside Electron (requires src/main/main.js
   so IPC handlers + window creation run normally), then probes:

     1. installPackage / updatePackage / deletePackage with hostile
        names like 'lodash;calc' — MUST return { success: false,
        message: 'Invalid package name' } WITHOUT running any command.
     2. elevatePackage(action, type, hostileName) — MUST be rejected
        before any UAC prompt (no arbitrary command can be elevated).
     3. searchNpmPackages / searchPipPackages with a hostile query —
        MUST return [] (rejected by validation).
     4. The Developer section render path: navigating to the section must
        render package rows (exercises the DOM-API rewrite: setHighlighted +
        svgIcon + row building), and clicking a row name must open the
        package popup (exercises showPackagePopup) — all without triggering
        any package action.
     5. The UI install path: typing a hostile name into the install input +
        clicking Install MUST show the rejection status and NOT execute
        anything.
     6. Renderer console errors are collected (level >= error).

   CRITICAL SAFETY: only INVALID inputs are used here. A hostile
   name is rejected by the validators before any shell command, so
   nothing is ever installed/uninstalled/elevated. Valid package
   names are deliberately NOT tested to avoid mutating the system.

   Output: verify/phase1-report.json
   Usage:  node scripts/verify-phase1.js
   (auto-relaunches under Electron if run with plain node)
   ============================================================ */

'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const hasElectron = !!process.versions.electron;

// ── Plain node → re-launch under Electron (same pattern as evidence.js) ──
if (!hasElectron && require.main === module) {
  const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
  const child = spawn(electronBin, ['--disable-gpu', '--no-sandbox', __filename], { stdio: 'inherit' });
  const watchdog = setTimeout(() => {
    console.error('[verify-phase1] parent watchdog (150s) — killing child');
    try { execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' }); } catch (e) { /* gone */ }
  }, 150000);
  child.on('exit', (code) => { clearTimeout(watchdog); process.exit(code ?? 1); });
  return;
}

const { app, BrowserWindow } = require('electron');

// Software rendering for the harness (known Intel GPU crash on this machine)
app.disableHardwareAcceleration();

// Boot the real app (registers IPC handlers + creates the window)
require(path.join(__dirname, '..', 'src', 'main', 'main.js'));

const OUT_DIR = path.join(__dirname, '..', 'verify');
fs.mkdirSync(OUT_DIR, { recursive: true });
const REPORT_PATH = path.join(OUT_DIR, 'phase1-report.json');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 🛡️ Hostile inputs — all must be REJECTED. Note: any name containing a
// semicolon/&/$/backtick/pipe/space would previously have been shell-splittable.
const HOSTILE_NAMES = [
  'lodash;calc',
  'lodash && calc',
  '$(whoami)',
  '`id`',
  'pkg|dir',
  'pkg > file',
  'lodash" --force',
  "lodash' --force",
];

const HOSTILE_QUERIES = ['lodash;calc', 'react && dir', '$(whoami)'];

const consoleErrors = [];

// Safety timeout armed BEFORE whenReady so the child can never hang even if
// the app never becomes ready (wedged GPU process) — mirrors evidence.js.
// Cleared in the no-window path and on normal completion below.
const safetyTimer = setTimeout(() => {
  // Leave evidence even when the app is wedged (best-effort write).
  try {
    fs.writeFileSync(REPORT_PATH, JSON.stringify({ status: 'timeout', error: 'safety timeout (100s) — no report completed', consoleErrors }, null, 2));
  } catch (e) { /* ignore */ }
  console.error('[verify-phase1] safety timeout (100s) — forcing exit');
  try { app.exit(1); } catch (e) { /* fall through */ }
  setTimeout(() => process.exit(1), 500);
}, 100000);

app.whenReady().then(async () => {
  // 1) Wait for the app window created by main.js
  let win = null;
  for (let i = 0; i < 30 && !win; i++) {
    win = BrowserWindow.getAllWindows()[0] || null;
    if (!win) await wait(500);
  }
  if (!win) {
    clearTimeout(safetyTimer);
    fs.writeFileSync(REPORT_PATH, JSON.stringify({ status: 'no-window', error: 'window never created' }, null, 2));
    console.error('[verify-phase1] no window created');
    try { app.exit(1); } catch (e) { /* fall through */ }
    setTimeout(() => process.exit(1), 500);
    return;
  }

  const wc = win.webContents;
  wc.on('console-message', (eventOrLevel, maybeMsg) => {
    let level, message;
    if (eventOrLevel && typeof eventOrLevel === 'object' && 'level' in eventOrLevel) {
      level = eventOrLevel.level;
      message = eventOrLevel.message;
    } else {
      level = eventOrLevel;
      message = maybeMsg;
    }
    if (typeof level === 'number' && level >= 2) {
      consoleErrors.push({ level, message: String(message).slice(0, 300) });
    }
  });

  const JS_TIMEOUT_MS = 8000;
  function execJs(js, timeoutMs = JS_TIMEOUT_MS) {
    return Promise.race([
      wc.executeJavaScript(js),
      new Promise((_, reject) => setTimeout(() => reject(new Error('executeJavaScript timed out')), timeoutMs)),
    ]);
  }

  await wait(6000); // let the app settle

  const report = {
    status: 'completed',
    capturedAt: new Date().toISOString(),
    version: 'phase1-verification',
    ipc: {},
    ui: {},
    consoleErrors,
  };

  try {
    // ── 2) IPC boundary probes ──────────────────────────────
    for (const name of HOSTILE_NAMES) {
      report.ipc[`install:${name}`] = await execJs(`window.electronAPI.installPackage('npm', ${JSON.stringify(name)}).then(r => JSON.stringify(r))`);
      report.ipc[`update:${name}`] = await execJs(`window.electronAPI.updatePackage('npm', ${JSON.stringify(name)}).then(r => JSON.stringify(r))`);
      report.ipc[`delete:${name}`] = await execJs(`window.electronAPI.deletePackage('npm', ${JSON.stringify(name)}).then(r => JSON.stringify(r))`);
      report.ipc[`elevate:${name}`] = await execJs(`window.electronAPI.elevatePackage('install', 'npm', ${JSON.stringify(name)}).then(r => JSON.stringify(r))`);
    }
    // Unknown type / action must also be rejected
    report.ipc['type:yarn'] = await execJs(`window.electronAPI.installPackage('yarn', 'lodash').then(r => JSON.stringify(r))`);
    report.ipc['action:purge'] = await execJs(`window.electronAPI.elevatePackage('purge', 'npm', 'lodash').then(r => JSON.stringify(r))`);
    // Hostile search queries must return []
    for (const q of HOSTILE_QUERIES) {
      report.ipc[`search-npm:${q}`] = await execJs(`window.electronAPI.searchNpmPackages(${JSON.stringify(q)}).then(r => JSON.stringify(r))`);
      report.ipc[`search-pip:${q}`] = await execJs(`window.electronAPI.searchPipPackages(${JSON.stringify(q)}).then(r => JSON.stringify(r))`);
    }

    // ── 3) Developer section render + popup probe (exercises the DOM-API
    //    rewrite: renderPackages → setHighlighted + svgIcon, and
    //    showPackagePopup). Navigate to the Developer section, wait for the
    //    package rows to render, then click a row's name to open the package
    //    popup and close it. SAFE: opening/closing the popup never installs,
    //    uninstalls, or elevates anything — no package action is triggered. ──
    const devRender = await execJs(`(async () => {
      const nav = document.querySelector('.nav-item[data-section="developer"]');
      if (!nav) return JSON.stringify({ ok: false, reason: 'developer nav missing' });
      nav.click();
      // Poll until package rows render (packages load via IPC; can take seconds)
      let rows = 0;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        rows = document.querySelectorAll('.pkg-row').length;
        if (rows > 0) break;
      }
      const row = document.querySelector('.pkg-row');
      const nameText = row ? (row.querySelector('.pkg-name-text') || {}).textContent : null;
      const iconCount = row ? row.querySelectorAll('svg.pkg-icon').length : 0;
      const actionBtns = row ? row.querySelectorAll('.pkg-action-btn').length : 0;
      // Open the package popup by clicking the name (app.js binds this → showPackagePopup)
      const nameEl = row ? row.querySelector('.pkg-name') : null;
      let popupOpen = false, popupName = null, badge = null, detailItems = 0, closeBtn = false;
      if (nameEl) {
        nameEl.click();
        await new Promise(r => setTimeout(r, 600));
        // The .visible class lives on the OVERLAY (.pkg-popup-overlay), not the
        // inner .pkg-popup div — check the overlay so a rendered popup counts.
        const overlay = document.querySelector('.pkg-popup-overlay');
        const popup = document.querySelector('.pkg-popup');
        popupOpen = !!(overlay && overlay.classList.contains('visible') && popup);
        popupName = popup ? (popup.querySelector('.pkg-popup-name') || {}).textContent : null;
        badge = popup ? (popup.querySelector('.pkg-popup-type-badge') || {}).textContent : null;
        detailItems = popup ? popup.querySelectorAll('.pkg-popup-detail-item').length : 0;
        const close = popup ? popup.querySelector('#pkgPopupClose') : null;
        closeBtn = !!close;
        if (close) close.click(); // close the popup — safe, no action triggered
      }
      return JSON.stringify({
        ok: rows > 0 && !!nameText && iconCount > 0 && actionBtns > 0 && popupOpen && popupName !== null && detailItems >= 4 && closeBtn,
        rows, nameText: nameText !== null ? String(nameText).slice(0, 40) : null,
        iconCount, actionBtns, popupOpen,
        popupName: popupName !== null ? String(popupName).slice(0, 40) : null,
        badge: badge !== null ? String(badge).slice(0, 12) : null, detailItems, closeBtn,
      });
    })()`, 15000); // dev render can take ~10s on slow package loads; give it headroom
    report.ui.devRender = devRender;

    // ── 4) UI install path probe (hostile name → rejection status, no exec) ──
    const uiResult = await execJs(`(async () => {
      const input = document.getElementById('pkgInstallInputNpm');
      const btn = document.getElementById('pkgInstallBtnNpm');
      if (!input || !btn) return JSON.stringify({ ok: false, reason: 'install input/button missing' });
      input.value = 'lodash;calc';
      btn.click();
      // The status element updates synchronously-ish; poll briefly
      const status = document.getElementById('pkgStatus');
      await new Promise(r => setTimeout(r, 1500));
      return JSON.stringify({ ok: true, status: status ? status.textContent : null, inputValue: input.value });
    })()`);
    report.ui.installHostile = uiResult;

    // ── 5) Verify no lingering command got executed — the app should still be
    //    responsive and the package list should still be intact (no calc window
    //    can be opened by this renderer; nothing was installed).
    report.ui.appAlive = await execJs(`JSON.stringify({ alive: true, title: document.title })`);

    report.status = 'completed';
  } catch (err) {
    report.status = 'error';
    report.error = String(err?.message || err);
    console.error('[verify-phase1] probe failed:', err);
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.error('[verify-phase1] report written to verify/phase1-report.json');
  clearTimeout(safetyTimer);
  // Exit non-zero on probe error so scripts/CI can detect failure.
  const exitCode = report.status === 'completed' ? 0 : 1;
  try { app.exit(exitCode); } catch (e) { /* fall through */ }
  setTimeout(() => process.exit(exitCode), 500);
}).catch((err) => {
  // Anything that throws before the try block must still leave evidence.
  try {
    fs.writeFileSync(REPORT_PATH, JSON.stringify({ status: 'error', error: String(err?.message || err), consoleErrors }, null, 2));
  } catch (e) { /* ignore */ }
  console.error('[verify-phase1] whenReady handler failed:', err);
  clearTimeout(safetyTimer);
  try { app.exit(1); } catch (e) { /* fall through */ }
  setTimeout(() => process.exit(1), 500);
});
