/* ============================================================
   🧪 TEST HELPER — fake command-service (Phase 5)
   ============================================================
   Providers destructure `runCommand`/`runCommandUntilSuccess` at
   require-time, so the only way to intercept them is to replace
   the resolved command-service module in require.cache BEFORE
   requiring the provider. This helper does exactly that.

   Also provides `mockPlatform()` (uses node:test mock.method on
   os.platform — real os calls stay, only the platform switches)
   and `loadProvider()` (fresh-requires a provider so each test
   starts with clean module state).

   NOTE: `node --test` executes every file under test/ — this file
   only exports helpers, so it registers zero tests and passes.
   ============================================================ */

'use strict';

const os = require('os');
const { mock } = require('node:test');

const CMD_SVC_PATH = require.resolve('../src/main/command-service.js');

/** Replace command-service exports in require.cache with a fake. */
function mockCommandService({ runCommand, runCommandUntilSuccess } = {}) {
  const fake = {
    runCommand:
      runCommand ||
      (async () => ({ ok: true, code: 0, stdout: '', stderr: '', message: '' })),
    runCommandUntilSuccess:
      runCommandUntilSuccess ||
      (async () => ({ ok: true, code: 0, stdout: '', stderr: '', message: '' })),
  };
  require.cache[CMD_SVC_PATH] = {
    id: CMD_SVC_PATH,
    filename: CMD_SVC_PATH,
    loaded: true,
    exports: fake,
  };
  return fake;
}

/** Stub os.platform() for the duration of the process (restore via mock.restoreAll). */
function mockPlatform(platform) {
  mock.method(os, 'platform', () => platform);
}

/** Fresh-require a provider so per-test module state starts clean. */
function loadProvider(providerRelPath) {
  const resolved = require.resolve(providerRelPath);
  delete require.cache[resolved];
  return require(resolved);
}

/** Build an ok command-service result with stdout. */
function okResult(stdout) {
  return { ok: true, code: 0, stdout, stderr: '', message: '' };
}

/** Build a failing command-service result (optional stderr, like permission errors). */
function failResult(stderr = '') {
  return { ok: false, code: 1, stdout: '', stderr, message: 'Command failed' };
}

module.exports = { mockCommandService, mockPlatform, loadProvider, okResult, failResult };
