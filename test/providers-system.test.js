/* ============================================================
   🧪 PROVIDER TESTS — src/main/providers/system.js (Phase 5)
   ============================================================
   system.js requires `electron` for app — in plain Node that
   resolves to a path string, so `app` is undefined and the
   GPU-info branch falls back gracefully (try/catch → Unknown).
   All shell calls go through the shared fake command-service.
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { mockCommandService, mockPlatform, loadProvider, okResult, failResult } = require('./_mock-command-service');

const ok = okResult;
const fail = failResult;

// ──────────────────────────────────────────────
// getSystemInfo — snapshot builder
// ──────────────────────────────────────────────

test('system: getSystemInfo returns the full snapshot shape', () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => ok('') });

  const { getSystemInfo } = loadProvider('../src/main/providers/system.js');
  const info = getSystemInfo();

  assert.equal(typeof info.platform, 'string');
  assert.equal(info.platform, 'win32');
  assert.equal(typeof info.arch, 'string');
  assert.ok(Number.isInteger(info.cpus) && info.cpus > 0, 'cpus must be a positive int');
  assert.equal(typeof info.cpuModel, 'string');
  assert.ok(typeof info.cpuUsage === 'number' && info.cpuUsage >= 0 && info.cpuUsage <= 100, 'cpuUsage in 0-100');
  assert.ok(typeof info.totalMemory === 'number' && info.totalMemory > 0);
  assert.equal(typeof info.hostname, 'string');
  assert.equal(typeof info.uptime, 'number');
  assert.equal(typeof info.osRelease, 'string');
  assert.ok(Array.isArray(info.loadAvg) && info.loadAvg.length === 3, 'loadAvg is a 3-tuple');
  assert.ok(Array.isArray(info.networkInterfaces), 'networkInterfaces is an array');
  assert.ok(Array.isArray(info.allInterfaces), 'allInterfaces is an array');
  assert.ok(info.gpuInfo && typeof info.gpuInfo.allGpus === 'string', 'gpuInfo object present');
  assert.equal(typeof info.osEdition, 'string');
  assert.equal(typeof info.osDisplayVersion, 'string');
  assert.ok(info.storageSummary && typeof info.storageSummary.total === 'number', 'storageSummary object present');
});

test('system: getSystemInfo CPU usage increases between snapshots (second call)', () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => ok('') });

  const { getSystemInfo } = loadProvider('../src/main/providers/system.js');
  getSystemInfo(); // first call seeds the baseline (returns 0)
  const second = getSystemInfo();
  assert.ok(second.cpuUsage >= 0 && second.cpuUsage <= 100);
});

// ──────────────────────────────────────────────
// getVirtualMemory
// ──────────────────────────────────────────────

test('system: getVirtualMemory parses Windows WMI KB output', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => ok('8388608,4194304\r\n') });

  const { getVirtualMemory } = loadProvider('../src/main/providers/system.js');
  const vm = await getVirtualMemory();

  assert.equal(vm.total, 8388608 * 1024);
  assert.equal(vm.free, 4194304 * 1024);
  assert.equal(vm.used, (8388608 - 4194304) * 1024);
});

test('system: getVirtualMemory parses Linux /proc/meminfo swap lines', async () => {
  mockPlatform('linux');
  mockCommandService({ runCommand: async () => ok('SwapTotal: 8388608 kB\nSwapFree: 4194304 kB\n') });

  const { getVirtualMemory } = loadProvider('../src/main/providers/system.js');
  const vm = await getVirtualMemory();

  assert.equal(vm.total, 8388608 * 1024);
  assert.equal(vm.free, 4194304 * 1024);
  assert.equal(vm.used, (8388608 - 4194304) * 1024);
});

test('system: getVirtualMemory parses macOS sysctl swapusage (G units)', async () => {
  mockPlatform('darwin');
  mockCommandService({ runCommand: async () => ok('total = 8.00G  used = 2.00G  free = 6.00G  (encrypted)') });

  const { getVirtualMemory } = loadProvider('../src/main/providers/system.js');
  const vm = await getVirtualMemory();

  const g = 1024 * 1024 * 1024;
  assert.equal(vm.total, 8 * g);
  assert.equal(vm.used, 2 * g);
  assert.equal(vm.free, 6 * g);
});

test('system: getVirtualMemory returns null when the command fails', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => fail() });

  const { getVirtualMemory } = loadProvider('../src/main/providers/system.js');
  assert.equal(await getVirtualMemory(), null);
});
