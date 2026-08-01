/* ============================================================
   🧪 UNIT TESTS — src/renderer/script/format.js (Phase 5)
   ============================================================
   Run:  npm test  (node --test picks up test/*.test.mjs)

   format.js is a pure ESM renderer module (no DOM access), so it
   can be imported directly by Node and unit-tested without a
   browser. Covered: formatSpeed, formatCpuModel, isPermissionError.
   ============================================================ */

import test from 'node:test';
import assert from 'node:assert/strict';

import { formatSpeed, formatCpuModel, isPermissionError } from '../src/renderer/script/format.ts';

// ──────────────────────────────────────────────
// formatSpeed
// ──────────────────────────────────────────────

test('formatSpeed: returns "--" for null / undefined / negative', () => {
  assert.equal(formatSpeed(null), '--');
  assert.equal(formatSpeed(undefined), '--');
  assert.equal(formatSpeed(-1), '--');
});

test('formatSpeed: formats bytes-per-second across unit boundaries', () => {
  assert.equal(formatSpeed(0), '0 B/s');
  assert.equal(formatSpeed(999), '999 B/s');
  assert.equal(formatSpeed(1000), '1.0 KB/s');
  assert.equal(formatSpeed(1500), '1.5 KB/s');
  assert.equal(formatSpeed(999999), '1000.0 KB/s'); // 1e6-1 still KB/s (boundary at 1e6)
  assert.equal(formatSpeed(1000000), '1.00 MB/s');
  assert.equal(formatSpeed(2500000), '2.50 MB/s');
  assert.equal(formatSpeed(1000000000), '1.00 GB/s');
  assert.equal(formatSpeed(2000000000), '2.00 GB/s');
});

// ──────────────────────────────────────────────
// formatCpuModel
// ──────────────────────────────────────────────

test('formatCpuModel: strips (R), (TM), CPU and clock speed', () => {
  const out = formatCpuModel('Intel(R) Core(TM) i5-10300H CPU @ 2.50GHz');
  assert.equal(out, 'Intel Core i5-10300H');
});

test('formatCpuModel: handles AMD-style models with parenthetical suffixes', () => {
  const out = formatCpuModel('AMD Ryzen 9 5950X (Radeon Graphics)');
  assert.equal(out, 'AMD Ryzen 9 5950X');
});

test('formatCpuModel: truncates long models to 22 chars + ellipsis', () => {
  const long = 'A Very Long Processor Model Name That Exceeds Twenty Five Characters';
  const out = formatCpuModel(long);
  assert.ok(out.length <= 25, `expected <= 25 chars, got ${out.length}: ${out}`);
  assert.ok(out.endsWith('...'));
});

test('formatCpuModel: falls back to "Unknown" for empty input', () => {
  assert.equal(formatCpuModel(null), 'Unknown');
  assert.equal(formatCpuModel(undefined), 'Unknown');
  assert.equal(formatCpuModel(''), 'Unknown');
});

// ──────────────────────────────────────────────
// isPermissionError
// ──────────────────────────────────────────────

test('isPermissionError: detects common permission errors (case-insensitive)', () => {
  assert.equal(isPermissionError('npm ERR! code EACCES'), true);
  assert.equal(isPermissionError('EPERM: operation not permitted'), true);
  assert.equal(isPermissionError('Access is denied.'), true);
  assert.equal(isPermissionError('Permission denied (publickey)'), true);
  assert.equal(isPermissionError('Error: EACCES: permission denied, mkdir'), true);
});

test('isPermissionError: returns false for other errors', () => {
  assert.equal(isPermissionError('npm ERR! code ETARGET'), false);
  assert.equal(isPermissionError('Module not found'), false);
  assert.equal(isPermissionError(''), false);
  assert.equal(isPermissionError(null), false);
  assert.equal(isPermissionError(undefined), false);
});
