/* ============================================================
   ➗ PURE MATH — chart/gauge calculation cores (Phase 5 completion)
   ============================================================
   The DOM/Canvas-coupled render code in gauges.ts / charts.ts
   delegates its calculations here so the math is unit-testable
   without a canvas (plan.md §5.3 deferred item: "testable pure
   cores"). This module has NO imports and NO DOM access.
   ============================================================ */

/** Clamp a value into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Convert a value to a percentage (0-100) within [min, max]. */
export function valueToPercent(value: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return 0;
  return ((value - min) / range) * 100;
}

/** Convert a percentage (0-100) to a full-circle angle in radians. */
export function percentToRadians(percent: number): number {
  return (clamp(percent, 0, 100) / 100) * Math.PI * 2;
}

/** Parse a #rrggbb hex color into [r, g, b] (0-255 each). */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return [0, 0, 0];
  const full = m[1];
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Linearly interpolate between two #rrggbb colors at t ∈ [0,1]. */
export function lerpColor(a: string, b: string, t: number): string {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  const ct = clamp(t, 0, 1);
  const mix = (i: number) => Math.round(ar[i] + (br[i] - ar[i]) * ct);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

export interface GradientOptions {
  lowThreshold: number;
  midThreshold: number;
  lowColor: string;
  midColor: string;
  highColor: string;
}

/**
 * Pick a gauge color for a percentage:
 *   ≤ lowThreshold → lowColor; ≥ midThreshold → highColor;
 *   in between → smooth lerp low → mid.
 */
export function gradientColor(percent: number, opts: GradientOptions): string {
  const { lowThreshold, midThreshold, lowColor, midColor, highColor } = opts;
  if (percent <= lowThreshold) return lowColor;
  if (percent >= midThreshold) return highColor;
  const t = (percent - lowThreshold) / (midThreshold - lowThreshold);
  return lerpColor(lowColor, midColor, t);
}

export interface DonutSliceInput {
  value: number;
  color: string;
}

export interface DonutSliceAngle {
  value: number;
  color: string;
  start: number;
  end: number;
}

/**
 * Compute each donut slice's start/end angle (radians, starting at -π/2)
 * proportional to its value share of the total. Skips invalid slices.
 */
export function donutSliceAngles(
  slices: DonutSliceInput[]
): { angles: DonutSliceAngle[]; total: number } {
  const valid = slices.filter(s => s.value > 0 && isFinite(s.value));
  const total = valid.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0 || !isFinite(total)) return { angles: [], total: 0 };
  let start = -Math.PI / 2;
  const angles = valid.map(slice => {
    const angle = (slice.value / total) * Math.PI * 2;
    const entry: DonutSliceAngle = { value: slice.value, color: slice.color, start, end: start + angle };
    start += angle;
    return entry;
  });
  return { angles, total };
}
