/* ============================================================
   🧪 PROVIDER TESTS — src/main/providers/packages.js (Phase 5)
   ============================================================
   Uses the shared fake command-service. Security-critical paths
   are the focus: validation must happen BEFORE any command runs,
   hostile names must never reach a shell, and the elevation path
   only ever receives whitelisted command strings.
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { mockCommandService, mockPlatform, loadProvider, okResult, failResult } = require('./_mock-command-service');

const ok = okResult;
const fail = failResult;

// ──────────────────────────────────────────────
// Admin checks
// ──────────────────────────────────────────────

test('packages: checkAdminStatus is true when `net session` succeeds (Windows)', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => ok('') });

  const { checkAdminStatus } = loadProvider('../src/main/providers/packages.js');
  assert.deepEqual(await checkAdminStatus(), { isAdmin: true, platform: 'win32' });
});

test('packages: checkAdminStatus is false when `net session` fails (Windows)', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => fail('Access is denied') });

  const { checkAdminStatus } = loadProvider('../src/main/providers/packages.js');
  assert.deepEqual(await checkAdminStatus(), { isAdmin: false, platform: 'win32' });
});

test('packages: checkNpmNeedsAdmin detects Program Files prefix (Windows)', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => ok('C:\\Program Files\\nodejs\r\n') });

  const { checkNpmNeedsAdmin } = loadProvider('../src/main/providers/packages.js');
  assert.equal(await checkNpmNeedsAdmin(), true);
});

test('packages: checkNpmNeedsAdmin is false for AppData prefix (Windows)', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => ok('C:\\Users\\me\\AppData\\Roaming\\npm\r\n') });

  const { checkNpmNeedsAdmin } = loadProvider('../src/main/providers/packages.js');
  assert.equal(await checkNpmNeedsAdmin(), false);
});

// ──────────────────────────────────────────────
// Package operations — validation BEFORE any command
// ──────────────────────────────────────────────

test('packages: update/install/delete reject hostile names WITHOUT running a command', async () => {
  mockPlatform('win32');
  let commandRan = false;
  mockCommandService({
    runCommand: async () => { commandRan = true; return ok(''); },
  });

  const { updatePackage, installPackage, deletePackage } = loadProvider('../src/main/providers/packages.js');

  for (const fn of [updatePackage, installPackage, deletePackage]) {
    const result = await fn('npm', 'lodash; rm -rf /');
    assert.equal(result.success, false);
    assert.match(result.message, /Invalid package name/);
  }
  assert.equal(commandRan, false, 'no shell command may run for hostile input');
});

test('packages: reject unknown package types before commands', async () => {
  mockPlatform('win32');
  let commandRan = false;
  mockCommandService({
    runCommand: async () => { commandRan = true; return ok(''); },
  });

  const { installPackage, deletePackage } = loadProvider('../src/main/providers/packages.js');

  const badTypeInstall = await installPackage('yarn', 'lodash');
  assert.equal(badTypeInstall.success, false);
  assert.match(badTypeInstall.message, /Unknown package type/);

  const badTypeDelete = await deletePackage('brew', 'git');
  assert.equal(badTypeDelete.success, false);
  assert.match(badTypeDelete.message, /Unknown package type/);

  assert.equal(commandRan, false, 'no shell command may run for invalid requests');
});

test('packages: successful update returns the tail of stdout', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommand: async (cmd) => {
      assert.match(cmd, /npm install -g lodash@latest/);
      return ok('line1\nline2\nadded 1 package in 1s\n');
    },
  });

  const { updatePackage } = loadProvider('../src/main/providers/packages.js');
  const result = await updatePackage('npm', 'lodash');

  assert.equal(result.success, true);
  assert.match(result.message, /added 1 package/);
});

test('packages: failed install returns a trimmed error tail', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommand: async () => fail('npm ERR! code E404\nnpm ERR! 404 Not Found - GET https://registry.npmjs.org/not-a-real-pkg\n'),
  });

  const { installPackage } = loadProvider('../src/main/providers/packages.js');
  const result = await installPackage('npm', 'not-a-real-pkg-xyz');

  assert.equal(result.success, false);
  assert.match(result.message, /404/);
});

test('packages: pip commands use the pip binary on Windows', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommand: async (cmd) => {
      assert.match(cmd, /^pip install --upgrade requests/);
      return ok('');
    },
  });

  const { updatePackage } = loadProvider('../src/main/providers/packages.js');
  const result = await updatePackage('pip', 'requests');
  assert.equal(result.success, true);
});

// ──────────────────────────────────────────────
// Package lists — npm/pip global lists
// ──────────────────────────────────────────────

test('packages: getNpmPackages parses npm list JSON output', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommand: async () => ok(JSON.stringify({ dependencies: {
      lodash: { version: '4.17.21' },
      typescript: { version: '5.4.0' },
    } })),
  });

  const { getNpmPackages } = loadProvider('../src/main/providers/packages.js');
  const list = await getNpmPackages();

  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { name: 'lodash', version: '4.17.21', description: '' });
});

test('packages: getPipPackages returns [] on JSON parse failure (never throws)', async () => {
  mockPlatform('win32');
  mockCommandService({ runCommand: async () => ok('not json at all') });

  const { getPipPackages } = loadProvider('../src/main/providers/packages.js');
  assert.deepEqual(await getPipPackages(), []);
});

// ──────────────────────────────────────────────
// Elevation — whitelisted command building
// ──────────────────────────────────────────────

test('packages: runPackageElevated rejects invalid action without elevating', async () => {
  mockPlatform('win32');
  let commandRan = false;
  mockCommandService({
    runCommand: async () => { commandRan = true; return ok(''); },
  });

  const { runPackageElevated } = loadProvider('../src/main/providers/packages.js');
  const result = await runPackageElevated('purge', 'npm', 'lodash');

  assert.equal(result.success, false);
  assert.match(result.message, /Unknown package action/);
  assert.equal(commandRan, false);
});

test('packages: runPackageElevated rejects hostile names before building a command', async () => {
  mockPlatform('win32');
  let commandRan = false;
  mockCommandService({
    runCommand: async () => { commandRan = true; return ok(''); },
  });

  const { runPackageElevated } = loadProvider('../src/main/providers/packages.js');
  const result = await runPackageElevated('install', 'npm', 'lodash;calc');

  assert.equal(result.success, false);
  assert.equal(commandRan, false);
});

test('packages: runPackageElevated runs the whitelisted command for valid input', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommand: async (cmd) => {
      assert.match(cmd, /npm install -g lodash/);
      return ok('done');
    },
  });

  const { runPackageElevated } = loadProvider('../src/main/providers/packages.js');
  const result = await runPackageElevated('install', 'npm', 'lodash');

  assert.equal(result.success, true);
});

// ──────────────────────────────────────────────
// Registry search — hostile queries rejected, no network
// ──────────────────────────────────────────────

test('packages: searchNpmRegistry rejects hostile queries with [] (no request)', async () => {
  mockPlatform('win32');

  const { searchNpmRegistry } = loadProvider('../src/main/providers/packages.js');
  const result = await searchNpmRegistry('pkg;calc');

  assert.deepEqual(result, []);
});

test('packages: searchPipRegistry rejects hostile queries with [] (no command)', async () => {
  mockPlatform('win32');
  let commandRan = false;
  mockCommandService({
    runCommand: async () => { commandRan = true; return ok(''); },
  });

  const { searchPipRegistry } = loadProvider('../src/main/providers/packages.js');
  const result = await searchPipRegistry('x; y');

  assert.deepEqual(result, []);
  assert.equal(commandRan, false);
});
