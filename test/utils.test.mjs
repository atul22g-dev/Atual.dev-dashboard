/* ============================================================
   🧪 UNIT TESTS — src/renderer/script/utils.ts (Phase 5)
   ============================================================
   Run:  npm test  (node --test picks up test/*.test.mjs)

   utils.ts is the Phase 4 TypeScript module. Node 22.6+ / 23.6+
   strips types natively, so the pure helpers (no DOM access) can
   be imported and unit-tested directly without a browser build.
   DOM-touching helpers ($, updateMetricBar, showSectionError …)
   are intentionally NOT tested here — they need a real DOM.
   ============================================================ */

import test from 'node:test';
import assert from 'node:assert/strict';

import { formatBytes, formatUptime, formatPlatform, hexToRgba } from '../src/renderer/script/utils.ts';

// ──────────────────────────────────────────────
// formatBytes
// ──────────────────────────────────────────────

test('formatBytes: formats across all unit boundaries', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512.0 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
  assert.equal(formatBytes(1073741824), '1.0 GB');
  assert.equal(formatBytes(1099511627776), '1.0 TB');
});

// ──────────────────────────────────────────────
// formatUptime
// ──────────────────────────────────────────────

test('formatUptime: formats seconds into d/h/m/s parts', () => {
  assert.equal(formatUptime(0), '0m 0s');
  assert.equal(formatUptime(45), '0m 45s');
  assert.equal(formatUptime(65), '1m 5s');
  assert.equal(formatUptime(3661), '1h 1m 1s');
  assert.equal(formatUptime(90061), '1d 1h 1m 1s');
  assert.equal(formatUptime(86400), '1d 0h 0m 0s');
});

// ──────────────────────────────────────────────
// formatPlatform
// ──────────────────────────────────────────────

test('formatPlatform: maps known platform codes to friendly names', () => {
  assert.equal(formatPlatform('win32'), 'Windows');
  assert.equal(formatPlatform('darwin'), 'macOS');
  assert.equal(formatPlatform('linux'), 'Linux');
});

test('formatPlatform: passes through unknown platform codes', () => {
  assert.equal(formatPlatform('freebsd'), 'freebsd');
  assert.equal(formatPlatform(''), '');
});

// ──────────────────────────────────────────────
// hexToRgba
// ──────────────────────────────────────────────

test('hexToRgba: converts hex color to rgba string with alpha', () => {
  assert.equal(hexToRgba('#6366f1', 0.5), 'rgba(99, 102, 241, 0.5)');
  assert.equal(hexToRgba('#000000', 1), 'rgba(0, 0, 0, 1)');
  assert.equal(hexToRgba('#ffffff', 0), 'rgba(255, 255, 255, 0)');
  assert.equal(hexToRgba('#0a0a0f', 0.75), 'rgba(10, 10, 15, 0.75)');
});
