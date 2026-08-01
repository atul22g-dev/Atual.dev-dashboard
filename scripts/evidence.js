/* ============================================================
   📊 PHASE 0 EVIDENCE TOOL — baseline measurement + screenshots
   ============================================================
   Combines two Phase 0 operations into ONE script:

     measure  (default)   node scripts/evidence.js measure
       Spawns the real app and measures startup time, memory
       (working set at window-ready + idle settle), and idle CPU.
       Plain Node.js — no Electron runtime needed.

     capture  (screenshots + feature pass)
       Boots the REAL app inside Electron, navigates all 8
       sections (incl. Settings), runs an automated DOM feature pass, captures
       PNGs (dark / light / small-window), and records renderer
       console errors to screenshots/evidence.json.

       ⚠️ capture mode must run INSIDE Electron. If you invoke it
       with plain `node scripts/evidence.js capture`, the script
       automatically re-launches itself via the bundled
       node_modules/electron/dist/electron.exe — so you never need
       to remember the right binary. (This fixes the old
       "Cannot read properties of undefined (reading 'commandLine')"
       error that happened when capture-screenshots.js was run with
       plain node.)

     all  (full Phase 0 pass)   node scripts/evidence.js all
       Runs measure, then capture, in sequence — the combined
       evidence command used by `npm run script:Phase0`.

   The pure helpers below are exported and unit-tested via
   test/evidence.test.js. Importing the module does NOT run
   anything — all execution is guarded by require.main === module.
   ============================================================ */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ──────────────────────────────────────────────
// 🧮 PURE HELPERS (exported for unit testing)
// ──────────────────────────────────────────────

/**
 * Parse one PowerShell sample line: "WS=<bytes>;CPU=<sec>;TITLE=<title>"
 * Returns { ws, cpu, title } or null when the output is empty/NONE/malformed.
 */
function parseElectronStats(output) {
  if (!output || output === 'NONE') return null;
  const m = String(output).trim().match(/WS=(\d+);CPU=([\d.]+);TITLE=(.*)/);
  if (!m) return null;
  return {
    ws: parseInt(m[1], 10),
    cpu: parseFloat(m[2]),
    title: (m[3] || '').trim(),
  };
}

/** Round a number to 1 decimal place (used for MB and CPU% output). */
function round1(x) {
  return Math.round(x * 10) / 10;
}

/** Convert a working-set byte count to megabytes. */
function wsToMB(wsBytes) {
  return wsBytes / 1024 / 1024;
}

/**
 * CPU idle percent = (cpuDeltaSec / elapsedSec) / numCpus * 100.
 * Returns null when inputs are invalid (negative delta, zero/negative
 * elapsed, or non-positive cpus) so the caller can skip the sample.
 */
function calcCpuIdlePct(cpuDelta, elapsedSec, cpus) {
  if (cpuDelta < 0 || elapsedSec <= 0 || !(cpus > 0)) return null;
  return (cpuDelta / elapsedSec) / cpus * 100;
}

/** Absolute path to the bundled Electron binary (Windows .exe, else bare name). */
function resolveElectronBin() {
  const exe = process.platform === 'win32' ? 'electron.exe' : 'electron';
  return path.join(__dirname, '..', 'node_modules', 'electron', 'dist', exe);
}

/**
 * capture mode must run inside Electron (it needs the real `electron`
 * module). Returns true when the current runtime has no Electron, which
 * means the CLI must re-spawn itself via the bundled binary.
 */
function shouldRespawnForCapture(versions) {
  return !versions || !versions.electron;
}

module.exports = {
  parseElectronStats,
  round1,
  wsToMB,
  calcCpuIdlePct,
  resolveElectronBin,
  shouldRespawnForCapture,
};

// ──────────────────────────────────────────────
// 📸 CAPTURE MODE CONSTANTS (no Electron needed)
// ──────────────────────────────────────────────

const OUT_DIR = path.join(__dirname, '..', 'screenshots');
const SECTIONS = ['overview', 'performance', 'developer', 'network', 'disk', 'processes', 'battery', 'settings'];

// Element IDs per section that must exist AND hold a real value (not a placeholder)
const FEATURE_CHECKS = {
  overview: ['cpuLoadOverview', 'memUsedOverview', 'deviceName', 'processor', 'installedRam', 'storage', 'systemType', 'windowsEdition', 'uptime'],
  performance: ['cpuLoadValue', 'memUsageValue', 'cpuRingGauge', 'cpuChart', 'memChart', 'vmChart', 'donutChart'],
  developer: ['pkgSearch', 'pkgTabNpm', 'pkgTabPip', 'pkgInstallInputNpm', 'pkgTotalCount'],
  network: ['netDlSpeed', 'netUlSpeed', 'netHostname'],
  disk: ['diskGrid', 'diskTotalSize', 'diskTotalPercent'],
  processes: ['processSearch', 'processTableBody', 'processTotal'],
  battery: ['batteryContent'], // battery gauge only exists when a battery is detected
  settings: ['settingsThemeMode', 'settingsAccentColor', 'settingsPerfMode', 'settingsReducedMotion', 'settingsStartWithWindows', 'settingsMinimizeToTray'],
};

// Values that mean "not populated yet" (NOT legitimate data). Counts and
// input elements are handled separately below, so '0' is intentionally absent.
const PLACEHOLDERS = ['-', '--', '--°C', 'Detecting...', 'Checking...', 'N/A', ''];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ──────────────────────────────────────────────
// 📐 MEASURE MODE (plain Node — spawns the app)
// ──────────────────────────────────────────────

function runMeasure() {
  const projectDir = path.resolve(__dirname, '..');
  const electronBin = resolveElectronBin();
  const hasElectron = fs.existsSync(electronBin);

  const result = {
    measuredAt: new Date().toISOString(),
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    totalRamGB: round1(os.totalmem() / 1024 / 1024 / 1024),
    nodeVersion: process.version,
    hasLocalElectron: hasElectron,
    windowMs: null,       // startup time: spawn → first visible window title
    memoryAtReadyMB: null,
    memoryIdleMB: null,
    cpuIdlePct: null,
  };

  /** Sample all "electron" processes via PowerShell (sum working set, CPU, first window title) */
  function getElectronStats() {
    const ps = `powershell -NoProfile -Command "$p = Get-Process electron -ErrorAction SilentlyContinue; if(-not $p){'NONE'; exit}; $ws = ($p | Measure-Object WorkingSet64 -Sum).Sum; $cpu = ($p | Measure-Object CPU -Sum).Sum; $title = ($p | Where-Object { $_.MainWindowTitle } | Select-Object -First 1).MainWindowTitle; Write-Output ('WS=' + $ws + ';CPU=' + $cpu + ';TITLE=' + $title)"`;
    try {
      const out = execSync(ps, { encoding: 'utf8', timeout: 10000 }).trim();
      return parseElectronStats(out);
    } catch (e) {
      return null;
    }
  }

  const t0 = Date.now();
  let child;
  if (hasElectron) {
    child = spawn(electronBin, [projectDir], { stdio: 'ignore' });
  } else {
    child = spawn('npx', ['electron', '.'], { cwd: projectDir, stdio: 'ignore', shell: true });
  }

  let sawWindow = false;
  let lastCpu = null;
  let lastCpuTime = null;
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(poll);
    // Targeted kill of the spawned process tree only (never taskkill /im electron.exe)
    try { execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' }); } catch (e) { /* already gone */ }
    result.durationMs = Date.now() - t0;
    if (result.memoryAtReadyMB !== null) result.memoryAtReadyMB = round1(result.memoryAtReadyMB);
    if (result.memoryIdleMB !== null) result.memoryIdleMB = round1(result.memoryIdleMB);
    if (result.cpuIdlePct !== null) result.cpuIdlePct = round1(result.cpuIdlePct);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  const poll = setInterval(() => {
    const stats = getElectronStats();
    const now = Date.now();
    if (!stats) return;

    // 1) Startup time: first process with a visible window title
    if (!sawWindow && stats.title) {
      sawWindow = true;
      result.windowMs = now - t0;
      result.memoryAtReadyMB = wsToMB(stats.ws);
      lastCpu = stats.cpu;
      lastCpuTime = now;
    }

    // 2) Idle CPU + memory: wait ~4s after the window appears (settle), then
    //    compute the CPU/memory delta since the window was first seen (~4s span).
    //    `elapsed` self-corrects the sample window, so the effective sample is ~4s.
    if (sawWindow && result.cpuIdlePct === null && (now - (t0 + result.windowMs)) > 4000) {
      if (lastCpu === null || now - lastCpuTime >= 3000) {
        const cpuDelta = stats.cpu - (lastCpu ?? stats.cpu);
        const elapsed = (now - (lastCpuTime ?? now)) / 1000;
        const pct = calcCpuIdlePct(cpuDelta, elapsed, result.cpus);
        if (pct !== null) {
          result.cpuIdlePct = pct;
          result.memoryIdleMB = wsToMB(stats.ws);
          finish();
        }
      }
    }
  }, 500);

  // Safety timeout so the script can never hang
  setTimeout(() => {
    if (result.cpuIdlePct === null) {
      if (!sawWindow) {
        result.error = 'timeout - no window detected';
      }
      // If the window was seen, cpuIdlePct/memoryIdleMB are already null —
      // report windowMs + memoryAtReadyMB as partial data.
      finish();
    }
  }, 45000);
}

// ──────────────────────────────────────────────
// 📸 CAPTURE MODE (must run inside Electron)
// ──────────────────────────────────────────────

async function runCapture() {
  // Only reachable under Electron — safe to require here (never at module top).
  const { app, BrowserWindow } = require('electron');

  // Software rendering for the harness: this machine's Intel GPU process
  // crashes (exit_code=143) after many rapid Electron launches. For a
  // screenshot/feature-pass harness, software rendering is deterministic — and
  // matches the app's low-end target anyway. Must run before app is ready.
  app.disableHardwareAcceleration();

  // Boot the real app (registers IPC handlers + creates the window)
  require(path.join(__dirname, '..', 'src', 'main', 'main.js'));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const consoleErrors = [];

  // Safety timeout armed BEFORE whenReady so the child can never hang even if
  // the app never becomes ready (e.g. wedged GPU process). Cleared before the
  // normal app.exit(0) below; the parent watchdog is a second backstop.
  // app.exit() can fail to terminate if a renderer/GPU process is wedged, so
  // also schedule a forceful process.exit() as a backup.
  const safetyTimer = setTimeout(() => {
    console.error('[evidence] capture safety timeout (100s) — forcing exit');
    try { app.exit(1); } catch (e) { /* fall through */ }
    setTimeout(() => process.exit(1), 500);
  }, 100000);

  await new Promise((resolve) => app.whenReady().then(resolve));

  // 1) Wait for the app window created by main.js
  let win = null;
  for (let i = 0; i < 30 && !win; i++) {
    win = BrowserWindow.getAllWindows()[0] || null;
    if (!win) await wait(500);
  }
  if (!win) {
    clearTimeout(safetyTimer);
    console.log(JSON.stringify({ error: 'no window created' }, null, 2));
    app.exit(1);
    return;
  }

  const wc = win.webContents;

  // Collect renderer console errors (newer Electron passes an event object)
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
      consoleErrors.push({ level, message: String(message).slice(0, 500) });
    }
  });

  await wait(6000); // let initial system data + charts populate

  // 2) Helper: switch to a section via the sidebar and wait for it to activate
  async function gotoSection(name, extraWait = 2500) {
    await wc.executeJavaScript(`document.querySelector('.nav-item[data-section="${name}"]').click(); true`);
    await wait(extraWait);
  }

  // 3) Helper: run a DOM feature check for the active section
  async function checkSection(name) {
    return wc.executeJavaScript(`(async () => {
      const ids = ${JSON.stringify(FEATURE_CHECKS[name] || [])};
      const placeholders = ${JSON.stringify(PLACEHOLDERS)};
      const result = { sectionActive: false };
      const secEl = document.getElementById('section-${name}');
      result.sectionActive = !!(secEl && secEl.classList.contains('active'));
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) { result[id] = { ok: false, reason: 'missing' }; continue; }
        let value = '';
        let ok = true;
        if (el.tagName === 'CANVAS') {
          value = 'canvas:' + el.width + 'x' + el.height;
        } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          // Inputs hold their value in .value, not textContent — existence is the check
          value = 'input:value=' + (el.value || '').slice(0, 40);
        } else if (el.children.length > 0) {
          value = 'children:' + el.children.length;
          if (value.startsWith('children:0')) ok = false;
        } else {
          value = (el.textContent || '').trim();
          if (placeholders.includes(value)) ok = false;
        }
        result[id] = { ok, value: value.slice(0, 80) };
      }
      return result;
    })()`);
  }

  const featurePass = {};
  const screenshots = [];

  // 4) Dark theme: capture every section + run feature checks
  for (const name of SECTIONS) {
    console.error(`[evidence] capture: section ${name}…`);
    const extra = name === 'developer' ? 8000 : name === 'processes' || name === 'disk' ? 4000 : 2500;
    await gotoSection(name, extra);
    const checks = await checkSection(name);
    featurePass[name] = checks;
    const img = await wc.capturePage();
    const file = path.join(OUT_DIR, `${name}-dark.png`);
    fs.writeFileSync(file, img.toPNG());
    screenshots.push(path.relative(path.join(__dirname, '..'), file));
  }

  // 5) Global checks: window controls + theme toggle
  const globalChecks = await wc.executeJavaScript(`(() => {
    const controls = {};
    ['minimizeBtn', 'maximizeBtn', 'closeBtn'].forEach((id) => {
      const el = document.getElementById(id);
      controls[id] = !!el;
    });
    const themeBtn = document.getElementById('themeToggle');
    controls.themeToggle = !!themeBtn;
    return controls;
  })()`);
  featurePass.globalControls = globalChecks;

  // 6) Light theme: overview shot
  console.error('[evidence] capture: light theme + small window…');
  await gotoSection('overview', 2000);
  await wc.executeJavaScript(`document.getElementById('themeToggle').click(); true`);
  await wait(800);
  const lightApplied = await wc.executeJavaScript(`document.body.classList.contains('light-theme')`);
  const lightChecks = await checkSection('overview');
  lightChecks.themeApplied = !!lightApplied;
  featurePass.overviewLight = lightChecks;
  const lightImg = await wc.capturePage();
  const lightFile = path.join(OUT_DIR, 'overview-light.png');
  fs.writeFileSync(lightFile, lightImg.toPNG());
  screenshots.push(path.relative(path.join(__dirname, '..'), lightFile));

  // restore dark for the small-window shot
  await wc.executeJavaScript(`document.getElementById('themeToggle').click(); true`);
  await wait(400);

  // 7) Small window shot
  win.setSize(1024, 640);
  await wait(1200);
  const smallImg = await wc.capturePage();
  const smallFile = path.join(OUT_DIR, 'overview-small-window.png');
  fs.writeFileSync(smallFile, smallImg.toPNG());
  screenshots.push(path.relative(path.join(__dirname, '..'), smallFile));

  // 8) Write evidence report
  const evidence = {
    capturedAt: new Date().toISOString(),
    platform: process.platform,
    screenshots,
    featurePass,
    consoleErrors,
    notes: {
      sections: SECTIONS,
      windowSizes: ['1280x800', '1024x640'],
      themeCoverage: ['dark (all sections)', 'light (overview)', 'dark (small window)'],
    },
  };
  fs.writeFileSync(path.join(OUT_DIR, 'evidence.json'), JSON.stringify(evidence, null, 2));
  clearTimeout(safetyTimer);
  console.log(JSON.stringify(evidence, null, 2));
  try { app.exit(0); } catch (e) { /* fall through */ }
  // Symmetry with the timeout path: app.exit() can fail when a renderer/GPU
  // process is wedged, so back it up with a forceful exit.
  setTimeout(() => process.exit(0), 500);
}

// ──────────────────────────────────────────────
// 🚀 CLI ENTRY (only when executed directly)
// ──────────────────────────────────────────────

/**
 * all mode: full Phase 0 pass — measure, then capture. Each step runs as its
 * own child process so its lifecycle (app spawn + exit) stays isolated. The
 * capture step delegates to the capture branch, which handles the Electron
 * respawn + watchdog itself.
 */
function runAll() {
  console.error('[evidence] all mode: measure → capture');
  const measureChild = spawn(process.execPath, [__filename, 'measure'], { stdio: 'inherit' });
  measureChild.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[evidence] measure step failed (exit ${code}) — aborting capture`);
      process.exit(code ?? 1);
      return;
    }
    console.error('\n[evidence] measure OK — starting capture…\n');
    const captureChild = spawn(process.execPath, [__filename, 'capture'], { stdio: 'inherit' });
    captureChild.on('exit', (code2) => process.exit(code2 ?? 1));
  });
}

if (require.main === module) {
  const mode = (process.argv[2] || 'measure').toLowerCase();

  if (mode === 'all') {
    runAll();
  } else if (mode === 'capture') {
    if (shouldRespawnForCapture(process.versions)) {
      // Running under plain Node — capture needs the real Electron runtime.
      // Re-launch ourselves via the bundled binary so `node scripts/evidence.js
      // capture` always works (fixes the old commandLine/undefined error).
      const electronBin = resolveElectronBin();
      if (!fs.existsSync(electronBin)) {
        console.error(`[evidence] capture mode needs Electron, but ${electronBin} was not found. Run 'npm install' first.`);
        process.exit(1);
      }
      console.error('[evidence] capture mode requires Electron — re-launching automatically…');
      // Harness-only flags: work around the GPU/network-service crash seen on
      // this machine (Intel UHD, exit_code=143 after many launches). They do
      // NOT affect the app's own webPreferences (contextIsolation/sandbox).
      const child = spawn(electronBin, ['--disable-gpu', '--no-sandbox', __filename, 'capture'], { stdio: 'inherit' });
      // Parent-side watchdog: if the Electron child ever hangs (e.g. a stuck
      // window/driver on Windows), kill its tree so `node scripts/evidence.js
      // capture` can never block forever.
      const watchdog = setTimeout(() => {
        console.error('[evidence] capture child exceeded 150s — killing its process tree…');
        try { execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' }); } catch (e) { /* already gone */ }
      }, 150000);
      child.on('exit', (code) => {
        clearTimeout(watchdog);
        process.exit(code ?? 1);
      });
    } else {
      runCapture().catch((err) => {
        console.error('[evidence] capture failed:', err);
        process.exit(1);
      });
    }
  } else if (mode === 'measure') {
    runMeasure();
  } else {
    console.error(`[evidence] unknown mode "${process.argv[2]}". Usage: node scripts/evidence.js <measure|capture|all>`);
    process.exit(1);
  }
}
