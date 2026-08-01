/* ============================================================
   🧪 UNIT TESTS — src/main/command-service.js (Phase 3 reliability)
   ============================================================
   Run:  npm test  (node --test picks up test/*.test.js)

   The command service centralizes exec() so every provider gets the
   same timeout/maxBuffer/error handling. It ALWAYS resolves a
   normalized result object — never rejects.
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runCommand,
  runCommandUntilSuccess,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_BUFFER,
} = require('../src/main/command-service.js');

test('exposes documented defaults', () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 10000);
  assert.equal(DEFAULT_MAX_BUFFER, 1024 * 1024);
});

test('runCommand resolves ok:true with stdout for a successful command', async () => {
  const result = await runCommand('echo hello-command-service');
  assert.equal(result.ok, true);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /hello-command-service/);
  assert.equal(result.message, '');
});

test('runCommand resolves ok:false for a failing command (never rejects)', async () => {
  const result = await runCommand('exit 1');
  assert.equal(result.ok, false);
  assert.equal(result.code, 1);
});

test('runCommand resolves ok:false for an unknown command', async () => {
  const result = await runCommand('definitely-not-a-real-command-xyz');
  assert.equal(result.ok, false);
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
});

test('runCommand honors custom timeout (kills the command, never hangs)', async () => {
  // A 5s sleep would finish naturally only if the timeout did NOT fire — a
  // 200ms timeout must kill it early and surface a failure result.
  // Shell-agnostic command (works on Windows cmd, macOS, Linux).
  const start = Date.now();
  const result = await runCommand('node -e "setTimeout(()=>{},5000)"', { timeout: 200 });
  const elapsedMs = Date.now() - start;
  assert.equal(result.ok, false);
  assert.notEqual(result.code, 0); // killed by signal (null) or non-zero exit
  assert.ok(elapsedMs < 5000, `expected early kill, took ${elapsedMs}ms`);
});

test('runCommandUntilSuccess returns the first successful result', async () => {
  const result = await runCommandUntilSuccess([
    'exit 1',
    'exit 2',
    'echo third-wins',
  ]);
  assert.equal(result.ok, true);
  assert.match(result.stdout, /third-wins/);
});

test('runCommandUntilSuccess returns the LAST failure when all fail', async () => {
  const result = await runCommandUntilSuccess(['exit 1', 'exit 2', 'exit 3']);
  assert.equal(result.ok, false);
  assert.equal(result.code, 3); // last failure, so callers can report why
});

test('runCommandUntilSuccess with empty list returns a predictable failure', async () => {
  const result = await runCommandUntilSuccess([]);
  assert.equal(result.ok, false);
  assert.match(result.message, /All commands failed/);
});
