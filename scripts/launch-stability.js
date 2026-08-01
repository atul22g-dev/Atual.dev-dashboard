/* ============================================================
   🚀 STABILITY TEST LAUNCHER (detached)
   ============================================================
   Spawns the 30-minute stability harness (scripts/stability-test.js)
   as a DETACHED process so it keeps running independently of this
   script's lifecycle, then prints the PID and exits immediately.

   Usage:  node scripts/launch-stability.js [minutes]
   Output: stability/launch.pid, stability/launch.out, stability/launch.err
   Check progress:  stability/stability.log
   Final result:    stability/stability-report.json
   ============================================================ */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const electronBin = path.join(projectDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const minutes = process.argv[2] || '30';
const stabilityScript = path.join(projectDir, 'scripts', 'stability-harness.js');
const outDir = path.join(projectDir, 'stability');
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(electronBin)) {
  console.error(`Electron not found at ${electronBin} — run 'npm install' first.`);
  process.exit(1);
}

// Clear stale markers + previous report/log from any prior run so a poller
// never reads old data while the new 30-min run is still in flight.
for (const f of ['launch.pid', 'launch.exit', 'stability-report.json', 'stability.log']) {
  try { fs.rmSync(path.join(outDir, f), { force: true }); } catch (e) { /* ignore */ }
}

const out = fs.openSync(path.join(outDir, 'launch.out'), 'w');
const err = fs.openSync(path.join(outDir, 'launch.err'), 'w');

const child = spawn(
  electronBin,
  ['--disable-gpu', '--no-sandbox', stabilityScript, minutes],
  { stdio: ['ignore', out, err], detached: true, env: { ...process.env, STABILITY_DURATION_MS: String(Math.round(parseFloat(minutes) * 60 * 1000)) } }
);

child.on('exit', (code) => {
  // Marker file so the caller can detect early failure (e.g. syntax error)
  // even though the child is detached and unref'd.
  fs.writeFileSync(path.join(outDir, 'launch.exit'), String(code ?? 'null'));
});
child.unref();
fs.writeFileSync(path.join(outDir, 'launch.pid'), String(child.pid));
console.log(`STABILITY_LAUNCHED pid=${child.pid} minutes=${minutes}`);
console.log(`log:   stability/stability.log`);
console.log(`report: stability/stability-report.json (when done)`);
