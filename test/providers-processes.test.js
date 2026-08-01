/* ============================================================
   🧪 PROVIDER TESTS — src/main/providers/processes.js (Phase 5)
   ============================================================
   Uses the shared fake command-service. Both the Windows tasklist
   CSV parser and the POSIX `ps aux` parser are covered through
   getProcessList() with crafted output. Sorting + result limits
   come from the real module.
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { mockCommandService, mockPlatform, loadProvider, okResult, failResult } = require('./_mock-command-service');

const ok = okResult;
const fail = failResult;

// ──────────────────────────────────────────────
// Windows — tasklist CSV
// ──────────────────────────────────────────────

test('processes: parses tasklist CSV with K/M memory units on Windows', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommand: async () => ok('"chrome.exe","1234","Console","1","245,000 K"\r\n"app.exe","5678","Console","1","15,000 M"\r\n'),
  });

  const { getProcessList } = loadProvider('../src/main/providers/processes.js');
  const list = await getProcessList();

  assert.equal(list.length, 2);
  const chrome = list.find((p) => p.name === 'chrome.exe');
  assert.equal(chrome.pid, 1234);
  assert.equal(chrome.memory, 245000 * 1024); // 245,000 K → bytes
  const app = list.find((p) => p.name === 'app.exe');
  assert.equal(app.memory, 15000 * 1024 * 1024); // 15,000 M → bytes
});

test('processes: sorts by memory descending on Windows', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommand: async () => ok('"small.exe","1","Console","1","10,000 K"\r\n"big.exe","2","Console","1","999,000 K"\r\n'),
  });

  const { getProcessList } = loadProvider('../src/main/providers/processes.js');
  const list = await getProcessList();

  assert.equal(list[0].name, 'big.exe');
  assert.equal(list[1].name, 'small.exe');
});

// ──────────────────────────────────────────────
// POSIX — ps aux
// ──────────────────────────────────────────────

test('processes: parses ps aux output on Linux (RSS KB → bytes)', async () => {
  mockPlatform('linux');
  mockCommandService({
    runCommand: async () => ok('root 1 0.1 0.2 123456 7890 ? Ss 10:00 0:00 /usr/bin/node\r\n'),
  });

  const { getProcessList } = loadProvider('../src/main/providers/processes.js');
  const list = await getProcessList();

  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'node');
  assert.equal(list[0].pid, 1);
  assert.equal(list[0].cpu, 0.1);
  assert.equal(list[0].memory, 7890 * 1024);
});

test('processes: returns [] when the command fails', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => fail() });

  const { getProcessList } = loadProvider('../src/main/providers/processes.js');
  assert.deepEqual(await getProcessList(), []);
});

test('processes: respects PROCESS_RESULT_LIMIT (top 30 by memory)', async () => {
  mockPlatform('win32');
  // 40 processes with descending memory; the 30 returned must be the largest.
  const lines = [];
  for (let i = 1; i <= 40; i++) {
    lines.push(`"p${i}","${i}","Console","1","${i},000 K"`);
  }
  mockCommandService({ runCommand: async () => ok(lines.join('\r\n')) });

  const { getProcessList } = loadProvider('../src/main/providers/processes.js');
  const list = await getProcessList();

  assert.equal(list.length, 30);
  assert.equal(list[0].name, 'p40'); // largest memory first
  assert.equal(list[list.length - 1].name, 'p11');
});
