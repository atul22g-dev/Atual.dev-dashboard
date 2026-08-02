/* ============================================================
   🧪 PROVIDER TESTS — src/main/providers/battery.js (Phase 5)
   ============================================================
   battery.js requires `electron` for powerMonitor/app, but in
   plain Node `require('electron')` yields a path string, so those
   bindings are undefined and the powerMonitor branch is skipped —
   the platform command chains are what get exercised here.
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { mockCommandService, mockPlatform, loadProvider, okResult, failResult } = require('./_mock-command-service');

const ok = okResult;
const fail = failResult;

// ──────────────────────────────────────────────
// Windows detection chain
// ──────────────────────────────────────────────

test('battery: parses PowerShell probe "charge,status" on Windows', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommandUntilSuccess: async () => ok('85,2\r\n') });

  const { getBatteryInfo } = loadProvider('../src/main/providers/battery.js');
  const info = await getBatteryInfo();

  assert.deepEqual(info, { hasBattery: true, level: 0.85, charging: true, acConnected: true });
});

test('battery: status 1 (discharging) means on battery + not charging', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommandUntilSuccess: async () => ok('45,1\r\n') });

  const { getBatteryInfo } = loadProvider('../src/main/providers/battery.js');
  const info = await getBatteryInfo();

  assert.deepEqual(info, { hasBattery: true, level: 0.45, charging: false, acConnected: false });
});

test('battery: falls back to WMIC /value when the PS probe fails', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommandUntilSuccess: async () => fail(),
    runCommand: async () => ok('EstimatedChargeRemaining=70\r\nBatteryStatus=2\r\n'),
  });

  const { getBatteryInfo } = loadProvider('../src/main/providers/battery.js');
  const info = await getBatteryInfo();

  assert.deepEqual(info, { hasBattery: true, level: 0.7, charging: true, acConnected: true });
});

test('battery: returns noBattery defaults when all Windows methods fail', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommandUntilSuccess: async () => fail(), runCommand: async () => fail() });

  const { getBatteryInfo } = loadProvider('../src/main/providers/battery.js');
  const info = await getBatteryInfo();

  assert.deepEqual(info, { hasBattery: false, level: 0, charging: false, acConnected: true });
});

// ──────────────────────────────────────────────
// macOS — pmset
// ──────────────────────────────────────────────

test('battery: parses pmset output on macOS (shell-free execFile)', async () => {
  mockPlatform('darwin');
  mockCommandService({ runCommandFile: async () => ok('Now drawing from \'AC Power\'\r\n  100%; charging; 0:00 remaining\r\n') });

  const { getBatteryInfo } = loadProvider('../src/main/providers/battery.js');
  const info = await getBatteryInfo();

  assert.equal(info.hasBattery, true);
  assert.equal(info.level, 1);
  assert.equal(info.charging, true);
});

// ──────────────────────────────────────────────
// Linux — sysfs
// ──────────────────────────────────────────────

test('battery: reads capacity + status from sysfs on Linux', async () => {
  mockPlatform('linux');
  let calls = 0;
  mockCommandService({
    runCommand: async () => {
      calls++;
      return calls === 1 ? ok('75\r\n') : ok('Charging\r\n');
    },
  });

  const { getBatteryInfo } = loadProvider('../src/main/providers/battery.js');
  const info = await getBatteryInfo();

  assert.equal(info.hasBattery, true);
  assert.equal(info.level, 0.75);
  assert.equal(info.charging, true);
  assert.equal(info.acConnected, true);
});

test('battery details: CIM-first on Windows (PowerShell primary)', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => ok('DesignCapacity=5000|CycleCount=42|Voltage=11500\r\n') });

  const { getBatteryDetails } = loadProvider('../src/main/providers/battery.js');
  const details = await getBatteryDetails();

  assert.equal(details.DesignCapacity, '5000');
  assert.equal(details.CycleCount, '42');
  assert.equal(details.Voltage, '11500');
});

test('battery details: falls back to WMIC /value when CIM yields nothing', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommand: async () => ok('NO_BATTERY\r\n'), // PS CIM empty
    runCommandFile: async () => ok('DesignCapacity=5000\r\nCycleCount=42\r\nVoltage= 11500\r\n'), // wmic last resort
  });

  const { getBatteryDetails } = loadProvider('../src/main/providers/battery.js');
  const details = await getBatteryDetails();

  assert.equal(details.DesignCapacity, '5000');
  assert.equal(details.CycleCount, '42');
});

test('battery details: returns {} on total failure', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => fail(), runCommandFile: async () => fail() });

  const { getBatteryDetails } = loadProvider('../src/main/providers/battery.js');
  const details = await getBatteryDetails();
  assert.deepEqual(details, {});
});

// ──────────────────────────────────────────────
// Detailed battery specs (getBatteryDetails)
// ──────────────────────────────────────────────


