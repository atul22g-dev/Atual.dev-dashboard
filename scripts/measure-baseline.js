/* ============================================================
   📊 BASELINE MEASUREMENT SCRIPT (Phase 0 - Baseline & Audit)
   ============================================================
   Measures the CURRENT app's real-world baseline on this machine:
   - Startup time (time until a window title appears)
   - Memory (working set at window-ready + idle after settle)
   - CPU (idle % while the app just sits there)

   Usage:  node scripts/measure-baseline.js
   Output: JSON baseline record printed to stdout.
   The app window will briefly appear (~10s) and then close.

   This module is also importable: the pure helpers below are
   exported and unit-tested via test/measure-baseline.test.js.
   Importing the module does NOT spawn Electron — the main run
   is guarded by require.main === module.
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

module.exports = { parseElectronStats, round1, wsToMB, calcCpuIdlePct };

// ──────────────────────────────────────────────
// 🚀 MAIN RUN (only when executed directly)
// ──────────────────────────────────────────────

if (require.main === module) {
  const projectDir = path.resolve(__dirname, '..');
  const electronBin = path.join(projectDir, 'node_modules', 'electron', 'dist', 'electron.exe');
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
