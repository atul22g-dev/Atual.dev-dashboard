/* ============================================================
   🧪 Unit tests for scripts/evidence.js (Phase 0 tool)
   ============================================================
   Covers the pure helpers of the combined evidence tool:
   measure-mode parsing/math + the capture-mode Electron
   respawn decision. Uses Node's built-in `node:test` runner —
   zero dependencies. Run:  node --test test/
   ============================================================ */

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const child_process = require('child_process');

const {
  parseElectronStats,
  round1,
  wsToMB,
  calcCpuIdlePct,
  resolveElectronBin,
  shouldRespawnForCapture,
} = require('../scripts/evidence.js');

// ──────────────────────────────────────────────
// parseElectronStats
// ──────────────────────────────────────────────

test('parseElectronStats: parses a valid PowerShell sample line', () => {
  const out = parseElectronStats('WS=382545920;CPU=12.5;TITLE=Atual.dev Dashboard');
  assert.deepEqual(out, { ws: 382545920, cpu: 12.5, title: 'Atual.dev Dashboard' });
});

test('parseElectronStats: trims surrounding whitespace and the title', () => {
  const out = parseElectronStats('  WS=1000;CPU=0.25;TITLE=  My Window  ');
  assert.deepEqual(out, { ws: 1000, cpu: 0.25, title: 'My Window' });
});

test('parseElectronStats: returns null for "NONE" (no electron processes)', () => {
  assert.equal(parseElectronStats('NONE'), null);
});

test('parseElectronStats: returns null for empty/undefined input', () => {
  assert.equal(parseElectronStats(''), null);
  assert.equal(parseElectronStats(undefined), null);
  assert.equal(parseElectronStats(null), null);
});

test('parseElectronStats: returns null for malformed output', () => {
  assert.equal(parseElectronStats('garbage line'), null);
  assert.equal(parseElectronStats('WS=abc;CPU=x;TITLE=nope'), null);
  assert.equal(parseElectronStats('CPU=1.5;TITLE=x'), null); // missing WS
});

test('parseElectronStats: handles zero and fractional CPU values', () => {
  const out = parseElectronStats('WS=0;CPU=0;TITLE=');
  assert.deepEqual(out, { ws: 0, cpu: 0, title: '' });
});

test('parseElectronStats: large working-set values parse without precision loss', () => {
  const out = parseElectronStats('WS=214748364800;CPU=42.75;TITLE=Big');
  assert.equal(out.ws, 214748364800);
  assert.equal(out.cpu, 42.75);
});

// ──────────────────────────────────────────────
// round1
// ──────────────────────────────────────────────

test('round1: rounds to one decimal place', () => {
  assert.equal(round1(364.82), 364.8);
  assert.equal(round1(323.83), 323.8);
  assert.equal(round1(1.44), 1.4);
  assert.equal(round1(1.45), 1.5);
});

test('round1: handles integers, zero, and negatives', () => {
  assert.equal(round1(5), 5);
  assert.equal(round1(0), 0);
  assert.equal(round1(-2.34), -2.3);
});

// ──────────────────────────────────────────────
// wsToMB
// ──────────────────────────────────────────────

test('wsToMB: converts bytes to megabytes', () => {
  // 382545920 / 1024 / 1024 = 364.82421875 (matches the real baseline run)
  assert.equal(wsToMB(382545920), 364.82421875);
  assert.equal(wsToMB(1048576), 1);
  assert.equal(wsToMB(0), 0);
});

// ──────────────────────────────────────────────
// calcCpuIdlePct
// ──────────────────────────────────────────────

test('calcCpuIdlePct: computes idle CPU percentage correctly', () => {
  // 0.5s of CPU over 10s on 8 cores = (0.5/10)/8*100 = 0.625%
  assert.equal(calcCpuIdlePct(0.5, 10, 8), 0.625);
  // Full idle → 0%
  assert.equal(calcCpuIdlePct(0, 10, 8), 0);
  // 1 core fully busy → 100%
  assert.equal(calcCpuIdlePct(1, 1, 1), 100);
});

test('calcCpuIdlePct: returns null for invalid inputs (negative delta, bad elapsed/cpus)', () => {
  assert.equal(calcCpuIdlePct(-1, 10, 8), null);
  assert.equal(calcCpuIdlePct(0.5, 0, 8), null);
  assert.equal(calcCpuIdlePct(0.5, -1, 8), null);
  assert.equal(calcCpuIdlePct(0.5, 10, 0), null);
  assert.equal(calcCpuIdlePct(0.5, 10, -2), null);
});

// ──────────────────────────────────────────────
// shouldRespawnForCapture (new — the fix for the
// "Cannot read properties of undefined" error)
// ──────────────────────────────────────────────

test('shouldRespawnForCapture: true when not running under Electron (plain node)', () => {
  // Plain `node scripts/evidence.js capture` — no process.versions.electron
  assert.equal(shouldRespawnForCapture({}), true);
  assert.equal(shouldRespawnForCapture({ node: '22.0.0' }), true);
  assert.equal(shouldRespawnForCapture(undefined), true);
  assert.equal(shouldRespawnForCapture(null), true);
});

test('shouldRespawnForCapture: false when running inside Electron', () => {
  assert.equal(shouldRespawnForCapture({ electron: '43.2.0', node: '22.0.0' }), false);
});

// ──────────────────────────────────────────────
// resolveElectronBin
// ──────────────────────────────────────────────

test('resolveElectronBin: returns the bundled Electron binary path', () => {
  const bin = resolveElectronBin();
  assert.equal(typeof bin, 'string');
  assert.ok(bin.length > 0, 'path must not be empty');
  assert.ok(bin.includes('node_modules'), 'must point into node_modules');
  assert.ok(bin.includes('electron'), 'must reference the electron package');
  if (process.platform === 'win32') {
    assert.ok(bin.endsWith('.exe'), 'must end with .exe on Windows');
  }
});

// ──────────────────────────────────────────────
// Import-safety: requiring the module must NOT run the CLI
// ──────────────────────────────────────────────

test('module import does not start measuring or spawn anything (require.main guard works)', () => {
  const modulePath = require.resolve('../scripts/evidence.js');
  // Force a fresh module evaluation so the guard is exercised.
  delete require.cache[modulePath];
  // Any spawn() call on import would mean the CLI body ran — fail loudly.
  const spawnMock = mock.method(child_process, 'spawn', () => {
    throw new Error('spawn() must never be called on module import');
  });
  try {
    const mod = require('../scripts/evidence.js');
    assert.equal(spawnMock.mock.calls.length, 0, 'spawn must not be called');
    assert.equal(typeof mod.parseElectronStats, 'function');
    assert.equal(typeof mod.round1, 'function');
    assert.equal(typeof mod.wsToMB, 'function');
    assert.equal(typeof mod.calcCpuIdlePct, 'function');
    assert.equal(typeof mod.shouldRespawnForCapture, 'function');
    assert.equal(typeof mod.resolveElectronBin, 'function');
  } finally {
    spawnMock.mock.restore();
    delete require.cache[modulePath];
  }
});
