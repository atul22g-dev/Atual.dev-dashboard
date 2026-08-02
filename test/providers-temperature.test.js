/* ============================================================
   🧪 PROVIDER TESTS — src/main/providers/temperature.js (Phase 5)
   ============================================================
   Uses the shared fake command-service. runCommand is stubbed to
   dispatch on the command string so each fallback method can be
   exercised independently.
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { mockCommandService, mockPlatform, loadProvider, okResult, failResult } = require('./_mock-command-service');

const ok = okResult;
const fail = failResult;

// ──────────────────────────────────────────────
// CPU temperature
// ──────────────────────────────────────────────

test('cpu temp: Method 1 — PowerShell Get-Counter (tenths already divided by PS)', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommand: async (cmd) => (cmd.includes('Get-Counter') ? ok('36\r\n') : fail()),
  });

  const { getCpuTemperature } = loadProvider('../src/main/providers/temperature.js');
  assert.equal(await getCpuTemperature(), 36);
});

test('cpu temp: Method 3 (last resort) — WMIC MSAcpi (tenths of Kelvin converted to Celsius)', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommand: async (cmd) => {
      if (cmd.includes('Get-Counter')) return fail();
      if (cmd.includes('MSAcpi')) return ok('Node,CurrentTemperature\r\nPC,3560\r\n');
      return fail();
    },
  });

  const { getCpuTemperature } = loadProvider('../src/main/providers/temperature.js');
  // 3560 tenths of Kelvin → 356 K → 356 - 273.15 ≈ 83 °C
  assert.equal(await getCpuTemperature(), 83);
});

test('cpu temp: Method 3 — PowerShell PerfFormattedData fallback', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommand: async (cmd) => {
      if (cmd.includes('Get-Counter') || cmd.includes('MSAcpi')) return fail();
      return ok('52\r\n');
    },
  });

  const { getCpuTemperature } = loadProvider('../src/main/providers/temperature.js');
  assert.equal(await getCpuTemperature(), 52);
});

test('cpu temp: returns -1 when all Windows methods fail', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => fail() });

  const { getCpuTemperature } = loadProvider('../src/main/providers/temperature.js');
  assert.equal(await getCpuTemperature(), -1);
});

test('cpu temp: macOS reports unavailable (-1) without running commands', async () => {
  mockPlatform('darwin');
  let ran = 0;
  mockCommandService({ runCommand: async () => { ran++; return ok(''); } });

  const { getCpuTemperature } = loadProvider('../src/main/providers/temperature.js');
  assert.equal(await getCpuTemperature(), -1);
  assert.equal(ran, 0, 'macOS CPU temp must not run any command');
});

test('cpu temp: Linux converts millidegrees from sysfs', async () => {
  mockPlatform('linux');
  mockCommandService({ runCommand: async () => ok('52000\r\n68000\r\n') });

  const { getCpuTemperature } = loadProvider('../src/main/providers/temperature.js');
  assert.equal(await getCpuTemperature(), 52);
});

// ──────────────────────────────────────────────
// GPU temperature
// ──────────────────────────────────────────────

test('gpu temp: nvidia-smi path on Windows (shell-free execFile)', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommandFile: async (file) => (file === 'nvidia-smi' ? ok('55\r\n') : fail()),
  });

  const { getGpuTemperature } = loadProvider('../src/main/providers/temperature.js');
  assert.equal(await getGpuTemperature(), 55);
});

test('gpu temp: PowerShell WMI fallback when nvidia-smi is missing', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommandFile: async (file) => (file === 'nvidia-smi' ? fail() : ok('')),
    runCommand: async () => ok('45\r\n'),
  });

  const { getGpuTemperature } = loadProvider('../src/main/providers/temperature.js');
  assert.equal(await getGpuTemperature(), 45);
});

test('gpu temp: returns null when every method fails', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommandFile: async () => fail(), runCommand: async () => fail() });

  const { getGpuTemperature } = loadProvider('../src/main/providers/temperature.js');
  assert.equal(await getGpuTemperature(), null);
});

test('gpu temp: nvidia-smi path on Linux (shell-free execFile)', async () => {
  mockPlatform('linux');
  mockCommandService({
    runCommandFile: async (file) => (file === 'nvidia-smi' ? ok('61\r\n') : fail()),
    runCommand: async () => fail(),
  });

  const { getGpuTemperature } = loadProvider('../src/main/providers/temperature.js');
  assert.equal(await getGpuTemperature(), 61);
});
