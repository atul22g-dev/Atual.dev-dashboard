/* ============================================================
   🧪 PROVIDER TESTS — src/main/providers/network.js (Phase 5)
   ============================================================
   Uses the shared fake command-service. Parsers for netstat -e
   (Windows), netstat -ib (macOS) and sysfs (Linux) are covered
   through getNetworkSpeed(). Speed-delta logic is tested by
   calling twice with increasing byte counters.
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { mockCommandService, mockPlatform, loadProvider, okResult, failResult } = require('./_mock-command-service');

const ok = okResult;
const fail = failResult;

// ──────────────────────────────────────────────
// Windows — netstat -e
// ──────────────────────────────────────────────

test('network: parses netstat -e "Bytes" line on Windows', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => ok('Interface Statistics\r\n                    Received    Sent\r\nBytes    1234567890  987654321\r\n') });

  const { getNetworkSpeed } = loadProvider('../src/main/providers/network.js');
  const out = await getNetworkSpeed();

  assert.equal(out.interfaces.all.rx, 1234567890);
  assert.equal(out.interfaces.all.tx, 987654321);
  assert.equal(out.total.rx, 1234567890);
  assert.equal(out.total.tx, 987654321);
});

test('network: computes speed delta between two samples', async () => {
  mockPlatform('win32');
  let calls = 0;
  mockCommandService({
    runCommand: async () => {
      calls++;
      const rx = 1000000000 + (calls - 1) * 100000; // +100 KB per sample
      const tx = 2000000000 + (calls - 1) * 50000;
      return ok(`Bytes    ${rx}  ${tx}\r\n`);
    },
  });

  const { getNetworkSpeed } = loadProvider('../src/main/providers/network.js');
  const first = await getNetworkSpeed();
  assert.equal(first.speed, undefined, 'first sample has no speed yet');

  // Guarantee a > 1 ms gap: the provider ignores deltas when both samples land
  // in the same millisecond (elapsed <= 0.001 s → speed zeroed).
  await new Promise((r) => setTimeout(r, 15));

  const second = await getNetworkSpeed();
  assert.ok(second.speed, 'second sample computes speed');
  assert.ok(second.speed.rx > 0, `expected rx speed > 0, got ${second.speed.rx}`);
  assert.ok(second.speed.tx > 0, `expected tx speed > 0, got ${second.speed.tx}`);
});

// ──────────────────────────────────────────────
// macOS — netstat -ib
// ──────────────────────────────────────────────

test('network: parses netstat -ib on macOS (skips loopback)', async () => {
  mockPlatform('darwin');
  // Real `netstat -ib` rows: Name Mtu Network Address Ipkts Ierrs Ibytes
  // Opkts Oerrs Obytes Coll (11 columns). Ibytes = col 7 (idx 6),
  // Obytes = col 10 (idx 9).
  mockCommandService({
    runCommand: async () => ok(
      'Name  Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes Coll\n' +
      'en0   1500  <Link#4>      xx:xx:xx:xx:xx:xx   100   0     10000000   200   0     20000000   0\n' +
      'lo0   16384 <Link#1>      localhost            999   0     99999999   999   0     99999999   0\n'
    ),
  });

  const { getNetworkSpeed } = loadProvider('../src/main/providers/network.js');
  const out = await getNetworkSpeed();

  assert.equal(out.interfaces.en0.rx, 10000000);
  assert.equal(out.interfaces.en0.tx, 20000000);
  assert.equal(out.interfaces.lo0, undefined, 'loopback must be excluded');
  assert.equal(out.total.rx, 10000000);
  assert.equal(out.total.tx, 20000000);
});

// ──────────────────────────────────────────────
// Linux — sysfs
// ──────────────────────────────────────────────

test('network: parses sysfs counters on Linux (skips lo)', async () => {
  mockPlatform('linux');
  // The provider's per-interface regex is $-anchored, so rows must be
  // plain \n terminated (no \r) like real sysfs echo output.
  mockCommandService({
    runCommand: async () => ok('eth0:rx=12345:tx=67890\nlo:rx=1:tx=1\n'),
  });

  const { getNetworkSpeed } = loadProvider('../src/main/providers/network.js');
  const out = await getNetworkSpeed();

  assert.equal(out.interfaces.eth0.rx, 12345);
  assert.equal(out.interfaces.eth0.tx, 67890);
  assert.equal(out.interfaces.lo, undefined, 'loopback must be excluded');
  assert.equal(out.total.rx, 12345);
  assert.equal(out.total.tx, 67890);
});

// ──────────────────────────────────────────────
// Failure → null, never throws
// ──────────────────────────────────────────────

test('network: returns null when the command fails', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => fail() });

  const { getNetworkSpeed } = loadProvider('../src/main/providers/network.js');
  assert.equal(await getNetworkSpeed(), null);
});

test('network: returns zeroed totals on unparsable output (never throws)', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => ok('garbage that is not netstat output\r\n') });

  const { getNetworkSpeed } = loadProvider('../src/main/providers/network.js');
  const out = await getNetworkSpeed();

  assert.deepEqual(out.interfaces, {});
  assert.deepEqual(out.total, { rx: 0, tx: 0 });
});
