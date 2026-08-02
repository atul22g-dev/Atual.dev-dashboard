/* ============================================================
   🚀 DEV RUNNER — Vite dev server + Electron HMR flow (Phase 4 completion)
   ============================================================
   `npm run dev`:
     1. Starts the Vite dev server (port 5173, strict).
     2. Waits for it to accept HTTP requests.
     3. Launches Electron with --dev-server so main.js loads the
        dev URL (live reload / HMR) instead of the built bundle.
     4. Kills BOTH processes when either exits (Ctrl+C cleans up).

   The renderer needs no `npm run build` for this flow — Vite serves
   the TypeScript source directly. `npm run start` remains the
   build-then-run production flow.
   ============================================================ */

'use strict';

const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEV_PORT = 5173;
const DEV_URL = `http://localhost:${DEV_PORT}`;

/** Resolve the platform-specific vite CLI entry. */
function viteBin() {
  const bin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!require('fs').existsSync(bin)) {
    console.error('[dev] Vite not installed — run `npm install` first.');
    process.exit(1);
  }
  return bin;
}

/** Resolve the bundled Electron binary (same strategy as smoke-test.js). */
function electronBin() {
  const exe = process.platform === 'win32' ? 'electron.exe' : 'electron';
  return path.join(ROOT, 'node_modules', 'electron', 'dist', exe);
}

/** Poll the dev server until it answers (or fail after ~20s). */
function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Vite dev server did not start within ${timeoutMs / 1000}s`));
          return;
        }
        setTimeout(attempt, 300);
      });
      req.setTimeout(2000, () => { req.destroy(); });
    };
    attempt();
  });
}

async function main() {
  const vite = spawn(process.execPath, [viteBin()], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  let electron = null;
  let shuttingDown = false;

  /** Kill Vite AND Electron (they are siblings, not parent/child). */
  function killChild(child, label) {
    if (!child) return;
    try { child.kill(); } catch (e) { /* already gone */ }
    if (process.platform === 'win32') {
      // taskkill /t also takes down any grandchildren on Windows.
      try { execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' }); } catch (e) { /* already gone */ }
    }
    console.log(`[dev] ${label} stopped.`);
  }

  function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    killChild(vite, 'Vite');
    killChild(electron, 'Electron');
    process.exit(code);
  }

  vite.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[dev] Vite exited (code ${code}) — stopping.`);
      shutdown(code ?? 1);
    }
  });

  try {
    console.log('[dev] Waiting for Vite dev server…');
    await waitForServer(DEV_URL);
  } catch (err) {
    console.error(`[dev] ${err.message}`);
    shutdown(1);
    return;
  }

  const bin = electronBin();
  if (!require('fs').existsSync(bin)) {
    console.error(`[dev] Electron binary not found at ${bin}. Run 'npm install' first.`);
    shutdown(1);
    return;
  }

  console.log(`[dev] Vite ready at ${DEV_URL} — launching Electron…`);
  // `--dev` opens DevTools (main.js), `--dev-server` loads the dev URL.
  electron = spawn(bin, ['--disable-gpu', '--dev', '--dev-server', path.join(ROOT, '.')], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  electron.on('exit', (code) => {
    console.log(`[dev] Electron exited (code ${code}) — stopping Vite.`);
    shutdown(code ?? 0);
  });

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
}

main().catch((err) => {
  console.error('[dev]', err);
  process.exit(1);
});
