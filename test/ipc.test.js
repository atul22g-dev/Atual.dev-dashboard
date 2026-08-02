/* ============================================================
   🧪 IPC INTEGRATION TESTS — src/main/ipc.js + preload.js (Phase 5)
   ============================================================
   In plain Node, `require('electron')` returns a path string, so
   ipc.js's `const { ipcMain } = require('electron')` would crash.
   We inject a FAKE electron module into require.cache before
   requiring ipc.js — the same technique as the command-service
   mock — to observe channel registration and preload wiring.

   Two layers verified:
     1. Integration: every handler is registered, hostile inputs
        are rejected before any provider command runs, and window
        controls call the getWindow() getter.
     2. Contract: the preload API's invoke/send channels exactly
        match the ipcMain handle/on channels.
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { mockCommandService } = require('./_mock-command-service');

// ──────────────────────────────────────────────
// Fake electron module (ipcMain + contextBridge + ipcRenderer)
// ──────────────────────────────────────────────

const handlers = new Map();   // ipcMain.handle channel → fn
const onChannels = new Map(); // ipcMain.on channel → fn
const invokeChannels = [];    // preload → ipcRenderer.invoke channel
const sendChannels = [];      // preload → ipcRenderer.send channel
let exposedApi = null;

const fakeElectron = {
  ipcMain: {
    handle: (channel, fn) => handlers.set(channel, fn),
    on: (channel, fn) => onChannels.set(channel, fn),
  },
  contextBridge: {
    exposeInMainWorld: (name, api) => { exposedApi = api; },
  },
  ipcRenderer: {
    invoke: (channel, ..._args) => { invokeChannels.push(channel); return Promise.resolve({}); },
    send: (channel) => { sendChannels.push(channel); },
    on: () => {},
    removeAllListeners: () => {},
  },
};

const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: fakeElectron,
};

// Fake command-service: no provider shell call may reach the real OS.
mockCommandService({ runCommand: async () => ({ ok: true, code: 0, stdout: '', stderr: '', message: '' }) });

// The window-control handlers close over the getter passed at registration
// time, so use one mutable target the tests can swap per assertion.
let getWindowTarget = null;

const { registerIpcHandlers } = require('../src/main/ipc.js');
registerIpcHandlers(() => getWindowTarget);
require('../src/preload/preload.js'); // runs contextBridge.exposeInMainWorld at require time

// ──────────────────────────────────────────────
// Channel inventory
// ──────────────────────────────────────────────

const EXPECTED_HANDLE_CHANNELS = [
  'get-system-info',
  'get-disk-info',
  'get-battery-info',
  'get-process-list',
  'get-npm-packages',
  'get-pip-packages',
  'update-package',
  'delete-package',
  'install-package',
  'elevate-package',
  'search-npm-packages',
  'search-pip-packages',
  'check-admin',
  'check-npm-admin',
  'get-cpu-temp',
  'get-gpu-temp',
  'get-fan-info',
  'get-network-speed',
  'get-battery-details',
  'get-virtual-memory',
  'app-preferences-get',
  'app-preferences-set',
  'check-for-update',
];

const EXPECTED_ON_CHANNELS = [
  'window-minimize',
  'window-maximize',
  'window-close',
  'window-hide',
  'window-show',
  'notify',
];

// ──────────────────────────────────────────────
// Registration tests
// ──────────────────────────────────────────────

test('ipc: registers every expected handle + on channel', () => {
  assert.deepEqual([...handlers.keys()].sort(), [...EXPECTED_HANDLE_CHANNELS].sort());
  assert.deepEqual([...onChannels.keys()].sort(), [...EXPECTED_ON_CHANNELS].sort());
});

test('ipc: preload invoke/send channels exactly match ipcMain channels (contract)', () => {
  const api = exposedApi;
  assert.ok(api, 'electronAPI must be exposed by contextBridge');

  // Call every exposed method to record the channels it uses.
  for (const fn of Object.values(api)) {
    fn('npm', 'lodash', () => {});
  }

  const uniqueInvoke = [...new Set(invokeChannels)].sort();
  const uniqueSend = [...new Set(sendChannels)].sort();

  assert.deepEqual(uniqueInvoke, [...EXPECTED_HANDLE_CHANNELS].sort(),
    'every preload invoke channel must have an ipcMain.handle registration');
  assert.deepEqual(uniqueSend, [...EXPECTED_ON_CHANNELS].sort(),
    'every preload send channel must have an ipcMain.on registration');
});

// ──────────────────────────────────────────────
// Handler behavior — validation before commands
// ──────────────────────────────────────────────

test('ipc: install-package rejects hostile input with validation', async () => {
  const handler = handlers.get('install-package');
  const result = await handler(null, 'npm', 'lodash; calc');

  assert.equal(result.success, false);
  assert.match(result.message, /Invalid package name/);
  // The provider only reaches runCommand AFTER validatePackageRequest passes,
  // so a rejection here proves the validation gate fired (no shell command ran).
});

test('ipc: get-system-info handler resolves a real snapshot object', async () => {
  const handler = handlers.get('get-system-info');
  const info = await handler();

  assert.equal(typeof info.platform, 'string');
  assert.ok(Number.isInteger(info.cpus) && info.cpus > 0);
  assert.equal(typeof info.hostname, 'string');
  assert.ok(Array.isArray(info.networkInterfaces));
});

test('ipc: window-maximize handler toggles via the getWindow getter', () => {
  const calls = { maximize: 0, unmaximize: 0 };
  const fakeWindow = {
    isMaximized: () => false,
    maximize: () => { calls.maximize++; },
    unmaximize: () => { calls.unmaximize++; },
  };

  getWindowTarget = fakeWindow;
  try {
    onChannels.get('window-maximize')();
    assert.equal(calls.maximize, 1);

    fakeWindow.isMaximized = () => true;
    onChannels.get('window-maximize')();
    assert.equal(calls.unmaximize, 1);
  } finally {
    getWindowTarget = null;
  }
});

test('ipc: window-minimize and window-close call the window getter', () => {
  const closed = { minimize: 0, close: 0 };
  getWindowTarget = {
    minimize: () => { closed.minimize++; },
    close: () => { closed.close++; },
  };

  try {
    onChannels.get('window-minimize')();
    onChannels.get('window-close')();
  } finally {
    getWindowTarget = null;
  }

  assert.equal(closed.minimize, 1);
  assert.equal(closed.close, 1);
});
