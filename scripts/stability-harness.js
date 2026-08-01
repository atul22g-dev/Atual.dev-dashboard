/* ============================================================
   ⏱️ PHASE 0 EVIDENCE — 30-MINUTE STABILITY TEST (Step H)
   ============================================================
   Boots the REAL app inside Electron (requires src/main/main.js
   so IPC + window creation run normally), then for the configured
   duration (default 30 min):

     1. Every 30 s: navigates to the next section in a 7-section
        cycle (overview → performance → developer → network →
        disk → processes → battery → …)
     2. Every 4th cycle: toggles dark/light theme
     3. Every 8th cycle: resizes, minimizes, restores, maximizes
     4. Samples total Electron RAM (working set) + CPU time via
        PowerShell on every tick
     5. Collects renderer console errors (level ≥ 2), plus
        'render-process-gone' and 'unresponsive' events (crashes
        and freezes)

   Output: stability/stability-report.json + stability/stability.log
   Usage:  node_modules/electron/dist/electron.exe scripts/stability-test.js [minutes]
           STABILITY_DURATION_MS=1800000 node ... (override in ms)
   The app window will stay open for the whole run, then close.

   Harness-only settings: software rendering (this machine's Intel
   GPU process crashes after many launches). The app's own
   webPreferences (contextIsolation, sandbox) are untouched.
   ============================================================ */

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

// Software rendering for the harness (see header note) — must be set
// before the app is ready.
app.disableHardwareAcceleration();

// Boot the real app (registers IPC handlers + creates the window)
require(path.join(__dirname, '..', 'src', 'main', 'main.js'));

const OUT_DIR = path.join(__dirname, '..', 'stability');
fs.mkdirSync(OUT_DIR, { recursive: true });
const REPORT_PATH = path.join(OUT_DIR, 'stability-report.json');
const LOG_PATH = path.join(OUT_DIR, 'stability.log');

// Clamped to ≥ 1 ms so a fractional/zero minutes arg can never produce a 0-length run.
// NOTE: argv[2] is unreliable — when launched as `electron.exe --disable-gpu
// --no-sandbox scripts/stability-harness.js 30` the CLI switches land before
// the script path, so argv[2] is '--no-sandbox' (parseInt → NaN → instant
// safety timeout). Scan for the first numeric positional arg AFTER the script
// path; the launcher also passes STABILITY_DURATION_MS, which takes priority.
function resolveDurationMs() {
  if (process.env.STABILITY_DURATION_MS) {
    return Math.max(1, parseInt(process.env.STABILITY_DURATION_MS, 10) || 1);
  }
  const scriptIdx = process.argv.findIndex((a) => a.includes('stability-harness'));
  const tail = process.argv.slice(scriptIdx >= 0 ? scriptIdx + 1 : 2);
  const minutesStr = tail.find((a) => /^\d+(\.\d+)?$/.test(a)) || '30';
  return Math.max(1, Math.round(parseFloat(minutesStr) * 60 * 1000));
}
const DURATION_MS = resolveDurationMs();
const SAMPLE_INTERVAL_MS = 30000;
const SECTIONS = ['overview', 'performance', 'developer', 'network', 'disk', 'processes', 'battery'];
const CPUS = os.cpus().length;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(LOG_PATH, line + '\n');
  console.error(line);
}

/** Sum working set + CPU seconds across all electron processes via PowerShell. */
function sampleApp() {
  const ps = `powershell -NoProfile -Command "$p = Get-Process electron -ErrorAction SilentlyContinue; if(-not $p){'NONE'; exit}; $ws = ($p | Measure-Object WorkingSet64 -Sum).Sum; $cpu = ($p | Measure-Object CPU -Sum).Sum; Write-Output ('WS=' + $ws + ';CPU=' + $cpu)"`;
  try {
    const out = execSync(ps, { encoding: 'utf8', timeout: 10000 }).trim();
    const m = out.match(/WS=(\d+);CPU=([\d.]+)/);
    if (m) return { ramMB: Math.round(parseInt(m[1], 10) / 1024 / 1024), cpuSec: parseFloat(m[2]) };
  } catch (e) { /* sample failed — caller handles null */ }
  return null;
}

app.whenReady().then(async () => {
  log(`stability test started — duration ${Math.round(DURATION_MS / 1000)}s, sample interval ${SAMPLE_INTERVAL_MS}ms, cpus=${CPUS}`);

  // 1) Wait for the app window created by main.js
  let win = null;
  for (let i = 0; i < 30 && !win; i++) {
    win = BrowserWindow.getAllWindows()[0] || null;
    if (!win) await new Promise((r) => setTimeout(r, 500));
  }
  if (!win) {
    const report = { status: 'no-window', error: 'window never created' };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    log('FAILED: no window created');
    app.exit(1);
    return;
  }

  const wc = win.webContents;
  const t0 = Date.now();

  // Timeout wrapper so a wedged renderer (known GPU issue on this machine)
  // can never stall the whole run — each page op gives up after 8 s.
  const JS_TIMEOUT_MS = 8000;
  function execJs(js) {
    return Promise.race([
      wc.executeJavaScript(js),
      new Promise((_, reject) => setTimeout(() => reject(new Error('executeJavaScript timed out after ' + JS_TIMEOUT_MS + 'ms')), JS_TIMEOUT_MS)),
    ]);
  }

  const consoleErrors = [];
  const processGone = [];
  const unresponsiveEvents = [];

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
      consoleErrors.push({ t: Date.now() - t0, level, message: String(message).slice(0, 300) });
    }
  });

  wc.on('render-process-gone', (e, details) => {
    processGone.push({ t: Date.now() - t0, reason: details?.reason, exitCode: details?.exitCode });
    log(`⚠️ render process gone: ${details?.reason} (exit ${details?.exitCode})`);
  });

  wc.on('unresponsive', () => {
    unresponsiveEvents.push({ t: Date.now() - t0 });
    log('⚠️ renderer unresponsive (freeze detected)');
  });

  const samples = [];
  let cycles = 0;
  let themeToggles = 0;
  let windowOps = 0;
  let crashed = false;
  let finished = false;

  const startSample = sampleApp();
  samples.push({ t: 0, section: 'start', ramMB: startSample?.ramMB ?? null, cpuSec: startSample?.cpuSec ?? null });
  log(`start sample: ram=${startSample?.ramMB}MB cpu=${startSample?.cpuSec?.toFixed(1)}s`);

  async function tick() {
    if (finished) return;
    cycles++;

    // Navigate to next section
    const section = SECTIONS[(cycles - 1) % SECTIONS.length];
    try {
      await execJs(`document.querySelector('.nav-item[data-section="${section}"]').click(); true`);
    } catch (e) {
      log(`navigation to ${section} failed: ${String(e?.message || e)}`);
    }

    // Theme toggle every 4th cycle
    if (cycles % 4 === 0) {
      try { await execJs(`document.getElementById('themeToggle').click(); true`); themeToggles++; }
      catch (e) { log(`theme toggle failed: ${String(e?.message || e)}`); }
    }

    // Window ops every 8th cycle: resize, minimize, restore, maximize
    if (cycles % 8 === 0) {
      try {
        win.setSize(1152, 720);
        await new Promise((r) => setTimeout(r, 400));
        win.minimize();
        await new Promise((r) => setTimeout(r, 400));
        win.restore();
        await new Promise((r) => setTimeout(r, 400));
        win.maximize();
        await new Promise((r) => setTimeout(r, 400));
        win.setSize(1280, 800);
        windowOps++;
      } catch (e) { log(`window ops failed: ${String(e?.message || e)}`); }
    }

    // Bail if the interval's finish() already fired mid-tick (e.g. duration
    // elapsed while an execJs await was in flight) — never log/sample after
    // the report has been written.
    if (finished) return;

    const s = sampleApp();
    samples.push({ t: Date.now() - t0, section, ramMB: s?.ramMB ?? null, cpuSec: s?.cpuSec ?? null });
    log(`cycle ${cycles} section=${section} ram=${s?.ramMB}MB cpu=${s?.cpuSec?.toFixed(1)}s`);

    // Window unexpectedly gone → crash
    if (win.isDestroyed() || BrowserWindow.getAllWindows().length === 0) {
      crashed = true;
      log('⚠️ window destroyed during test — treating as crash');
      finish();
      return; // never fall through to further sampling/logging
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(tickTimer);
    const endSample = sampleApp();
    const elapsedSec = (Date.now() - t0) / 1000;
    const startCpu = startSample?.cpuSec;
    const endCpu = endSample?.cpuSec;
    let cpuIdlePct = null;
    if (startCpu != null && endCpu != null && elapsedSec > 0) {
      const delta = endCpu - startCpu;
      if (delta >= 0) cpuIdlePct = Math.round(((delta / elapsedSec) / CPUS) * 1000) / 10;
    }
    const startRam = startSample?.ramMB;
    const endRam = endSample?.ramMB;

    const report = {
      // A 0-cycle finish is never a valid pass (e.g. instant safety timeout
      // from a bad duration) — record it honestly as 'invalid'.
      status: crashed ? 'crashed' : cycles > 0 ? 'completed' : 'invalid',
      startedAt: new Date(t0).toISOString(),
      durationMs: Date.now() - t0,
      plannedDurationMs: DURATION_MS,
      sections: SECTIONS,
      cpus: CPUS,
      start: { ramMB: startRam, cpuSec: startCpu },
      end: { ramMB: endRam, cpuSec: endCpu },
      ramDeltaMB: startRam != null && endRam != null ? endRam - startRam : null,
      cpuIdlePct: cpuIdlePct,
      cycles: cycles,
      themeToggles: themeToggles,
      windowOps: windowOps,
      samples: samples,
      consoleErrors: consoleErrors,
      renderProcessGone: processGone,
      unresponsiveEvents: unresponsiveEvents,
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    log(`test finished: status=${report.status} ramDelta=${report.ramDeltaMB}MB cpuIdle=${cpuIdlePct}% cycles=${cycles} consoleErrors=${consoleErrors.length}`);
    const exitCode = report.status === 'completed' ? 0 : 1;
    try { app.exit(exitCode); } catch (e) { /* fall through */ }
    setTimeout(() => process.exit(exitCode), 500);
  }

  // Tick every 30 s until the duration elapses
  const tickTimer = setInterval(() => {
    if (Date.now() - t0 >= DURATION_MS) { finish(); }
    else { tick().catch((e) => log(`tick error: ${e.message}`)); }
  }, SAMPLE_INTERVAL_MS);

  // Safety timeout: never run more than duration + 60 s
  setTimeout(() => {
    if (!finished) {
      log('safety timeout — forcing finish');
      finish();
    }
  }, DURATION_MS + 60000);
});
