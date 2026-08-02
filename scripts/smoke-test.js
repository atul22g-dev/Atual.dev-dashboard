/* ============================================================
   🧪 SMOKE TEST — boots the REAL app inside Electron (Phase 5)
   ============================================================
   Verifies the full stack end-to-end without a manual launch:

     1. The Vite-built renderer (out/renderer/index.html) exists.
     2. main.js boots and creates a BrowserWindow.
     3. The renderer loads the electronAPI bridge.
     4. All 8 sections render (incl. Settings, Phase 7) and overview metrics populate.
     5. Theme toggle E2E: clicking the toggle applies/removes `light-theme`.
     6. Developer section E2E: opening the tab activates it and renders its UI
        (lazy-init path from Phase 6).
     7. Zero renderer console errors (level >= 2).

   Run:  node scripts/smoke-test.js
     (auto-respawns under the bundled Electron binary, like
      scripts/evidence.js capture mode. Must be run after a build:
      npm run test:smoke handles build + smoke in one step.)

   ⚠️  Do NOT run this concurrently with `scripts/evidence.js capture` (or any
   other Electron instance) — two Electron processes contend on this machine
   and can starve the developer-section npm scan, causing a false failure.

   Exit code: 0 = smoke passed, 1 = failed/timeout.
   ============================================================ */

'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/** Absolute path to the bundled Electron binary. */
function resolveElectronBin() {
  const exe = process.platform === 'win32' ? 'electron.exe' : 'electron';
  return path.join(__dirname, '..', 'node_modules', 'electron', 'dist', exe);
}

const inElectron = !!process.versions.electron;

if (!inElectron) {
  // ── Plain Node → respawn under Electron (like evidence.js) ──
  const bin = resolveElectronBin();
  if (!fs.existsSync(bin)) {
    console.error(`[smoke] Electron binary not found at ${bin}. Run 'npm install' first.`);
    process.exit(1);
  }
  console.error('[smoke] Respawning under Electron…');
  const child = spawn(bin, ['--disable-gpu', '--no-sandbox', __filename], { stdio: 'inherit' });
  const watchdog = setTimeout(() => {
    console.error('[smoke] child exceeded 120s — killing its process tree…');
    try { execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' }); } catch (e) { /* already gone */ }
  }, 120000);
  child.on('exit', (code) => {
    clearTimeout(watchdog);
    process.exit(code ?? 1);
  });
} else {
  runSmoke().catch((err) => {
    console.error('[smoke] failed:', err);
    process.exit(1);
  });
}

/** Boot the real app and run DOM checks. Only runs inside Electron. */
async function runSmoke() {
  const { app, BrowserWindow } = require('electron');

  // Harness-only software rendering (same as evidence.js capture) — the
  // app's own webPreferences (sandbox/contextIsolation) are untouched.
  app.disableHardwareAcceleration();

  const RENDERER_HTML = require('../src/main/config.js').RENDERER_HTML;
  if (!fs.existsSync(RENDERER_HTML)) {
    console.error(`[smoke] Renderer build missing at ${RENDERER_HTML}. Run 'npm run build' first.`);
    process.exit(1);
  }

  // Boot the real app (registers IPC + creates the window).
  require(path.join(__dirname, '..', 'src', 'main', 'main.js'));

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const consoleErrors = [];

  // Safety timeout so the smoke child can never hang.
  const safetyTimer = setTimeout(() => {
    console.error('[smoke] safety timeout (60s) — forcing exit');
    try { app.exit(1); } catch (e) { /* fall through */ }
    setTimeout(() => process.exit(1), 500);
  }, 60000);

  await new Promise((resolve) => app.whenReady().then(resolve));

  // 1) Wait for the app window created by main.js
  let win = null;
  for (let i = 0; i < 40 && !win; i++) {
    win = BrowserWindow.getAllWindows()[0] || null;
    if (!win) await wait(500);
  }
  if (!win) {
    clearTimeout(safetyTimer);
    console.error('[smoke] FAIL: no window created');
    app.exit(1);
    return;
  }

  const wc = win.webContents;

  // 2) Collect renderer console errors (newer Electron passes an event object)
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

  // 3) Wait for page load + initial data settle (8s — async metrics like
  //    storage/installedRam can lag on slow CI runners)
  await new Promise((resolve) => {
    if (!wc.isLoading()) resolve();
    else wc.once('did-finish-load', resolve);
  });
  await wait(8000);

  // 4) DOM + interaction checks. Phase 5 completion: theme-toggle and
  //    developer-section E2E (previously deferred to a manual visual pass).
  const checks = await wc.executeJavaScript(`(async () => {
    const out = { bridge: false, sections: [], overview: {}, controls: false, themeToggle: false, developerSection: false };
    out.bridge = !!(window.electronAPI && typeof window.electronAPI.getSystemInfo === 'function');
    document.querySelectorAll('.nav-item[data-section]').forEach((n) => {
      out.sections.push(n.getAttribute('data-section'));
    });
    for (const id of ['cpuLoadOverview','memUsedOverview','deviceName','processor','installedRam','storage']) {
      const el = document.getElementById(id);
      out.overview[id] = el ? (el.textContent || '').trim() : null;
    }
    out.controls = ['minimizeBtn','maximizeBtn','closeBtn'].every((id) => !!document.getElementById(id));

    // Theme toggle E2E: clicking must CHANGE the theme and the second click
    // must REVERT it — relative to whatever state the app booted in, so the
    // gate never assumes a specific starting theme (persisted localStorage
    // may hold 'light' from an earlier run).
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
      const before = document.body.classList.contains('light-theme');
      themeBtn.click();
      const mid = document.body.classList.contains('light-theme');
      themeBtn.click();
      const after = document.body.classList.contains('light-theme');
      out.themeToggle = mid !== before && after === before;
    }

    // Developer section E2E (lazy-init): opening the tab must activate the
    // section and render its core UI. Poll until the async package scan
    // settles (the "Loading packages..." placeholder is replaced by rows or
    // an empty/error state) instead of a fixed wait.
    const devNav = document.querySelector('.nav-item[data-section="developer"]');
    if (devNav) {
      devNav.click();
      const section = document.getElementById('section-developer');
      const body = document.getElementById('pkgListBody');
      let settled = false;
      for (let i = 0; i < 60 && !settled; i++) {
        const loading = body && body.querySelector('.pkg-loading');
        settled = !body || !loading || !/loading packages/i.test(loading.textContent || '');
        if (!settled) await new Promise((r) => setTimeout(r, 250));
      }
      out.developerSection = !!(section && section.classList.contains('active')
        && body
        && document.getElementById('pkgSearch')
        && settled
        && (body.querySelector('.pkg-row') || /no packages|failed/i.test(body.textContent || '')));
      // Diagnostic aid: capture the list body state when the gate fails so a
      // red smoke run can be triaged (loading stuck? scan error? empty list?).
      if (!out.developerSection) {
        out.developerDiagnostic = {
          active: !!(section && section.classList.contains('active')),
          bodyExists: !!body,
          searchExists: !!document.getElementById('pkgSearch'),
          settled,
          bodyText: body ? (body.textContent || '').slice(0, 120) : null,
        };
      }
    }
    return out;
  })()`);

  clearTimeout(safetyTimer);

  const placeholders = ['-', '--', '--°C', 'Detecting...', 'Checking...', 'N/A', ''];
  const populated = Object.values(checks.overview).filter((v) => v && !placeholders.includes(v)).length;

  const report = {
    smoke: 'phase5',
    at: new Date().toISOString(),
    bridge: checks.bridge,
    sections: checks.sections,
    sectionsOk: checks.sections.length >= 8,
    overviewPopulated: populated,
    overviewOk: populated >= 4,
    controls: checks.controls,
    themeToggle: checks.themeToggle,
    developerSection: checks.developerSection,
    consoleErrors,
  };

  const ok = report.bridge && report.sectionsOk && report.overviewOk && report.controls
    && report.themeToggle && report.developerSection
    && report.consoleErrors.length === 0;

  console.log(JSON.stringify(report, null, 2));
  try { app.exit(ok ? 0 : 1); } catch (e) { /* fall through */ }
  setTimeout(() => process.exit(ok ? 0 : 1), 500);
}
