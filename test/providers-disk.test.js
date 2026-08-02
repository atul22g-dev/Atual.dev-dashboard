/* ============================================================
   🧪 PROVIDER TESTS — src/main/providers/disk.js (Phase 5)
   ============================================================
   Uses the shared fake command-service (test/_mock-command-service.js)
   so NO real shell command ever runs. os.platform() is stubbed per
   test to exercise each platform's parsing path.

   Parsers (parseWmicCsv/parsePsDisks/parseDf) are module-private, so
   they're covered end-to-end through getDiskInfo() with crafted
   command output.
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { mockCommandService, mockPlatform, loadProvider, okResult, failResult } = require('./_mock-command-service');

const ok = okResult;
const fail = failResult;

// ──────────────────────────────────────────────
// Windows — PowerShell CIM PRIMARY path (Phase 3/8: wmic is last resort)
// ──────────────────────────────────────────────

test('disk: parses PowerShell CIM output on Windows (primary)', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommandFile: async (file) => (file === 'powershell' ? ok('C:,2147483648,1073741824\r\nD:,1073741824,536870912\r\n') : fail()),
  });

  const { getDiskInfo } = loadProvider('../src/main/providers/disk.js');
  const disks = await getDiskInfo();

  assert.equal(disks.length, 2);
  assert.equal(disks[0].mount, 'C:');
  assert.equal(disks[0].total, 2147483648);
  assert.equal(disks[0].free, 1073741824);
  assert.equal(disks[0].used, 1073741824);
  assert.equal(disks[1].total, 1073741824);
  assert.equal(disks[1].used, 536870912);
});

// ──────────────────────────────────────────────
// Windows — WMIC last-resort fallback (CIM failed)
// ──────────────────────────────────────────────

test('disk: falls back to WMIC CSV when PowerShell CIM fails on Windows', async () => {
  mockPlatform('win32');
  let calls = 0;
  mockCommandService({
    runCommandFile: async (file) => {
      calls++;
      if (file === 'powershell') return fail(); // CIM primary
      return ok('Node,DeviceID,Size,FreeSpace\r\nWINPC,C:,2147483648,1073741824\r\n'); // wmic fallback
    },
  });

  const { getDiskInfo } = loadProvider('../src/main/providers/disk.js');
  const disks = await getDiskInfo();

  assert.equal(calls, 2, 'expected primary + fallback command');
  assert.equal(disks.length, 1);
  assert.equal(disks[0].mount, 'C:');
  assert.equal(disks[0].total, 2147483648);
});

test('disk: parses WMIC CSV output on Windows (last resort)', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommandFile: async (file) => (file === 'powershell' ? fail() : ok('Node,DeviceID,Size,FreeSpace\r\nWINPC,C:,2147483648,1073741824\r\n')),
  });

  const { getDiskInfo } = loadProvider('../src/main/providers/disk.js');
  const disks = await getDiskInfo();

  assert.equal(disks.length, 1);
  assert.equal(disks[0].mount, 'C:');
  assert.equal(disks[0].total, 2147483648);
  assert.equal(disks[0].used, 1073741824);
});

// ──────────────────────────────────────────────
// macOS — df -k
// ──────────────────────────────────────────────

test('disk: parses df -k output on macOS', async () => {
  mockPlatform('darwin');
  // Real command: `df -k | tail -n +2` — the header is stripped by tail, so
  // the parser only ever sees data rows.
  mockCommandService({
    runCommand: async () => ok('/dev/disk1s1 500000000 200000000 300000000 40% /\r\n'),
  });

  const { getDiskInfo } = loadProvider('../src/main/providers/disk.js');
  const disks = await getDiskInfo();

  assert.equal(disks.length, 1);
  assert.equal(disks[0].mount, '/');
  assert.equal(disks[0].total, 500000000 * 1024);
  assert.equal(disks[0].used, 200000000 * 1024);
  assert.equal(disks[0].free, 300000000 * 1024);
});

// ──────────────────────────────────────────────
// Linux — df --output
// ──────────────────────────────────────────────

test('disk: parses df --output on Linux (source,size,used,avail,target)', async () => {
  mockPlatform('linux');
  // Real command: `df -B1 --output=source,size,used,avail,target | tail -n +2` —
  // 5 whitespace columns, mount is column 5 (index 4), sizes are ALREADY
  // bytes (df -B1 → 1-byte blocks), so no 1024 scaling.
  mockCommandService({
    runCommand: async () => ok('/dev/sda1 1000000000 400000000 600000000 /\r\n'),
  });

  const { getDiskInfo } = loadProvider('../src/main/providers/disk.js');
  const disks = await getDiskInfo();

  assert.equal(disks.length, 1);
  assert.equal(disks[0].mount, '/');
  assert.equal(disks[0].total, 1000000000);
  assert.equal(disks[0].used, 400000000);
  assert.equal(disks[0].free, 600000000);
});

// ──────────────────────────────────────────────
// Failure → empty array, never throws
// ──────────────────────────────────────────────

test('disk: returns [] when every detection method fails', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommandFile: async () => fail() });

  const { getDiskInfo } = loadProvider('../src/main/providers/disk.js');
  const disks = await getDiskInfo();
  assert.deepEqual(disks, []);
});

test('disk: silently ignores garbage output (never throws)', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommandFile: async () => ok('not,a,valid,disk,row\r\n') });

  const { getDiskInfo } = loadProvider('../src/main/providers/disk.js');
  const disks = await getDiskInfo();
  assert.deepEqual(disks, []);
});
