/* ============================================================
   🧪 UNIT TESTS — src/renderer/script/math.ts (Phase 5 completion)
   ============================================================
   Covers the extracted pure chart/gauge calculation cores that
   were previously DOM/Canvas-coupled and untestable (plan.md §5.3
   deferred item). Imported straight from math.ts via Node's native
   type-stripping — no test framework dependency.
   ============================================================ */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clamp,
  valueToPercent,
  percentToRadians,
  hexToRgb,
  lerpColor,
  gradientColor,
  donutSliceAngles,
} from '../src/renderer/script/math.ts';

test('clamp bounds a value', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(clamp(50, 0, 100), 50);
});

test('valueToPercent maps within a range', () => {
  assert.equal(valueToPercent(0, 0, 100), 0);
  assert.equal(valueToPercent(50, 0, 100), 50);
  assert.equal(valueToPercent(100, 0, 100), 100);
  assert.equal(valueToPercent(0.5, 0, 1), 50);
  // Degenerate range → 0 (no division by zero / NaN)
  assert.equal(valueToPercent(10, 10, 10), 0);
});

test('percentToRadians maps 0-100 to a full circle from 0', () => {
  assert.equal(percentToRadians(0), 0);
  assert.ok(Math.abs(percentToRadians(50) - Math.PI) < 1e-9);
  assert.ok(Math.abs(percentToRadians(100) - 2 * Math.PI) < 1e-9);
  // Clamped outside [0,100]
  assert.equal(percentToRadians(-5), 0);
  assert.ok(Math.abs(percentToRadians(150) - 2 * Math.PI) < 1e-9);
});

test('hexToRgb parses #rrggbb', () => {
  assert.deepEqual(hexToRgb('#ff0000'), [255, 0, 0]);
  assert.deepEqual(hexToRgb('#00ff00'), [0, 255, 0]);
  assert.deepEqual(hexToRgb('#0000ff'), [0, 0, 255]);
  assert.deepEqual(hexToRgb('#ffffff'), [255, 255, 255]);
  assert.deepEqual(hexToRgb('336699'), [0x33, 0x66, 0x99]);
  // Invalid → black fallback (never throws)
  assert.deepEqual(hexToRgb('nope'), [0, 0, 0]);
  assert.deepEqual(hexToRgb('#12345'), [0, 0, 0]);
});

test('lerpColor interpolates endpoints and midpoint', () => {
  assert.equal(lerpColor('#000000', '#ffffff', 0), 'rgb(0, 0, 0)');
  assert.equal(lerpColor('#000000', '#ffffff', 1), 'rgb(255, 255, 255)');
  assert.equal(lerpColor('#000000', '#ffffff', 0.5), 'rgb(128, 128, 128)');
  // Negative/over-1 t clamped
  assert.equal(lerpColor('#000000', '#ffffff', -2), 'rgb(0, 0, 0)');
  assert.equal(lerpColor('#000000', '#ffffff', 2), 'rgb(255, 255, 255)');
});

test('gradientColor picks zone colors and lerps between', () => {
  const opts = { lowThreshold: 50, midThreshold: 80, lowColor: '#22c55e', midColor: '#f59e0b', highColor: '#ef4444' };
  assert.equal(gradientColor(30, opts), '#22c55e');
  assert.equal(gradientColor(50, opts), '#22c55e');
  assert.equal(gradientColor(90, opts), '#ef4444');
  assert.equal(gradientColor(80, opts), '#ef4444');
  // Midpoint of the lerp band: t=0.5 → halfway between #22c55e and #f59e0b
  const mid = gradientColor(65, opts);
  assert.match(mid, /^rgb\(/);
});

test('donutSliceAngles sizes arcs proportionally from -π/2', () => {
  const { angles, total } = donutSliceAngles([
    { value: 75, color: '#6366f1' },
    { value: 25, color: '#22c55e' },
  ]);
  assert.equal(total, 100);
  assert.equal(angles.length, 2);
  assert.ok(Math.abs(angles[0].start - -Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(angles[0].end - (-Math.PI / 2 + Math.PI * 1.5)) < 1e-9);
  assert.ok(Math.abs(angles[1].end - angles[1].start - Math.PI * 0.5) < 1e-9);
});

test('donutSliceAngles skips invalid slices and guards empty input', () => {
  const { angles, total } = donutSliceAngles([
    { value: 0, color: '#000' },
    { value: NaN, color: '#000' },
    { value: -5, color: '#000' },
    { value: 100, color: '#fff' },
  ]);
  assert.equal(angles.length, 1);
  assert.equal(total, 100);
  assert.equal(angles[0].color, '#fff');

  const empty = donutSliceAngles([]);
  assert.equal(empty.angles.length, 0);
  assert.equal(empty.total, 0);

  const allInvalid = donutSliceAngles([{ value: 0, color: '#000' }]);
  assert.equal(allInvalid.angles.length, 0);
});
