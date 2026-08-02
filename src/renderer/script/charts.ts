/* ============================================================
   📈 CHART ENGINE - Canvas-based charts (Phase 4 TS, Phase 6 DPR)
   ============================================================ */

import { formatBytes, hexToRgba } from './utils.js';
import { RingGauge } from './gauges.js';
import { clamp, donutSliceAngles, resolveCpuLoad, memoryUsedPercent } from './math.js';
import type { SystemInfo } from '../../shared/ipc/contracts.js';
import { MAX_HISTORY, LOW_END_MODE_CLASS } from './constants.js';

/** True while the Low-End perf mode class is applied to <body>. */
function isLowEndMode(): boolean {
  return document.body.classList.contains(LOW_END_MODE_CLASS);
}

/**
 * Whether canvas drawing is currently enabled (Phase 6). Set false while the
 * Performance section is hidden so hidden-canvas repaints stop costing CPU;
 * history recording still runs so charts are populated on return.
 */
let chartsActive = true;
export function setChartsActive(active: boolean): void {
  chartsActive = active;
}

// ──────────────────────────────────────────────
// 📈 LINE CHART ENGINE
// ──────────────────────────────────────────────

interface ChartDataset {
  color?: string;
  data: Array<number | null | undefined>;
}

interface ChartOptions {
  padding?: { top: number; right: number; bottom: number; left: number };
  lineWidth?: number;
  fillOpacity?: number;
  yTicks?: number;
  ySuffix?: string;
  yMin?: number;
  yMax?: number;
  smooth?: boolean;
  datasets?: ChartDataset[];
}

class ChartEngine {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private options!: Required<Omit<ChartOptions, 'padding' | 'datasets'>> & {
    padding: { top: number; right: number; bottom: number; left: number };
    datasets: ChartDataset[];
  };
  private resizeObserver: ResizeObserver | null = null;
  private _resizeQueued = false;
  private _tooltip: HTMLElement | null = null;
  private _boundMouseMove!: (e: MouseEvent) => void;
  private _boundMouseLeave!: () => void;
  private _hoveredPoint: { x: number; y: number; color: string; index: number } | null = null;

  constructor(canvasId: string, options: ChartOptions = {}) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    this.width = canvas.width;
    this.height = canvas.height;

    this.options = {
      padding: { top: 16, right: 16, bottom: 26, left: 56 },
      lineWidth: 2,
      fillOpacity: 0.15,
      yTicks: 4,
      ySuffix: '%',
      yMin: 0,
      yMax: 100,
      smooth: true,
      datasets: [],
      ...options,
    } as ChartEngine['options'];

    // Phase 6 completion: ResizeObserver on the canvas parent replaces the
    // window-level resize listener (fires for container/layout changes too),
    // and scheduleResize() coalesces bursts into a single rAF draw.
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.scheduleResize());
      this.resizeObserver.observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', this._boundWindowResize);
    }

    this._createTooltip();

    this._boundMouseMove = (e) => this._onMouseMove(e);
    this._boundMouseLeave = () => this._onMouseLeave();
    this.canvas.addEventListener('mousemove', this._boundMouseMove);
    this.canvas.addEventListener('mouseleave', this._boundMouseLeave);

    this.scheduleResize();
  }

  /** Coalesce resize requests into a single rAF-framed resize+draw. */
  scheduleResize(): void {
    if (this._resizeQueued) return;
    this._resizeQueued = true;
    requestAnimationFrame(() => {
      this._resizeQueued = false;
      this.resize();
    });
  }

  private _boundWindowResize = () => this.scheduleResize();

  _createTooltip(): void {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const old = parent.querySelector('.chart-tooltip');
    if (old) old.remove();
    const tip = document.createElement('div');
    tip.className = 'chart-tooltip';
    tip.innerHTML = `
      <div class="chart-tooltip-indicator"></div>
      <div class="chart-tooltip-content">
        <span class="chart-tooltip-value"></span>
        <span class="chart-tooltip-time"></span>
      </div>
    `;
    parent.style.position = 'relative';
    parent.appendChild(tip);
    this._tooltip = tip;
    this._tooltip.style.display = 'none';
  }

  _onMouseMove(e: MouseEvent): void {
    if (!this._tooltip || !this.options.datasets.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const da = this.getDrawArea();

    if (mouseX < da.x || mouseX > da.x + da.w || mouseY < da.y || mouseY > da.y + da.h) {
      this._tooltip.style.display = 'none';
      return;
    }

    let bestData: Array<number | null | undefined> = [];
    let bestColor = '';
    for (const ds of this.options.datasets) {
      if (ds.data && ds.data.length > 0) {
        bestData = ds.data;
        bestColor = ds.color || '#6366f1';
        break;
      }
    }
    if (bestData.length < 2) {
      this._tooltip.style.display = 'none';
      return;
    }

    const opts = this.options;
    const step = da.w / Math.max(bestData.length - 1, 1);
    const relX = mouseX - da.x;
    const rawIndex = (relX / step);
    const index = Math.round(rawIndex);
    const clampedIndex = Math.max(0, Math.min(bestData.length - 1, index));

    const value = bestData[clampedIndex];
    if (value === null || value === undefined || !isFinite(value)) {
      this._tooltip.style.display = 'none';
      return;
    }

    const yRange = Math.max(opts.yMax - opts.yMin, 0.01);
    const ratio = (value - opts.yMin) / yRange;
    const pointY = da.y + da.h - Math.max(0, Math.min(1, ratio)) * da.h;
    const pointX = da.x + da.w - (bestData.length - 1 - clampedIndex) * step;

    const valueEl = this._tooltip.querySelector('.chart-tooltip-value');
    const timeEl = this._tooltip.querySelector('.chart-tooltip-time');
    const indicatorEl = this._tooltip.querySelector('.chart-tooltip-indicator');

    if (valueEl) valueEl.textContent = `${value.toFixed(1)}${opts.ySuffix}`;
    if (indicatorEl) (indicatorEl as HTMLElement).style.background = bestColor;

    if (timeEl) {
      const totalPoints = bestData.length;
      const secondsAgo = Math.round((totalPoints - 1 - clampedIndex) * (60 / Math.max(totalPoints - 1, 1)));
      if (secondsAgo === 0) {
        timeEl.textContent = 'now';
      } else if (secondsAgo < 60) {
        timeEl.textContent = `${secondsAgo}s ago`;
      } else {
        timeEl.textContent = `-${Math.floor(secondsAgo / 60)}m ${secondsAgo % 60}s`;
      }
    }

    const tooltipWidth = 120;
    const tooltipHeight = 48;
    let tipX = pointX - tooltipWidth / 2;
    let tipY = pointY - tooltipHeight - 14;

    if (tipY < 4) tipY = pointY + 14;
    if (tipX < 4) tipX = 4;
    if (tipX + tooltipWidth > rect.width - 4) tipX = rect.width - tooltipWidth - 4;

    this._tooltip.style.left = `${tipX}px`;
    this._tooltip.style.top = `${tipY}px`;
    this._tooltip.style.display = 'block';

    this._hoveredPoint = { x: pointX, y: pointY, color: bestColor, index: clampedIndex };
    this.draw();
  }

  _onMouseLeave(): void {
    if (this._tooltip) this._tooltip.style.display = 'none';
    if (this._hoveredPoint) {
      this._hoveredPoint = null;
      this.draw();
    }
  }

  getThemeColors(): { grid: string; text: string; bg: string } {
    const isLight = document.body.classList.contains('light-theme');
    return {
      grid: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
      text: isLight ? '#8888a0' : '#5c5c72',
      bg: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.2)',
    };
  }

  resize(): void {
    if (!this.canvas.parentElement) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const w = rect.width || this.canvas.width;
    // Phase 6: HiDPI-aware backing store (design coordinates stay in CSS px).
    // Low-End caps the backing store at 1× so weak iGPUs paint ¼–½ the pixels.
    const dpr = isLowEndMode() ? 1 : (window.devicePixelRatio || 1);
    const h = this.height ? this.canvas.height / (this.canvas.width / w) : w * 0.4;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = w;
    this.height = h;
    this.draw();
  }

  getDrawArea(): { x: number; y: number; w: number; h: number } {
    const p = this.options.padding;
    return {
      x: p.left, y: p.top,
      w: this.width - p.left - p.right,
      h: this.height - p.top - p.bottom,
    };
  }

  drawGrid(da: { x: number; y: number; w: number; h: number }): void {
    const ctx = this.ctx;
    const colors = this.getThemeColors();
    const opts = this.options;

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (let i = 0; i <= opts.yTicks; i++) {
      const y = da.y + (da.h / opts.yTicks) * i;
      ctx.beginPath();
      ctx.moveTo(da.x, y);
      ctx.lineTo(da.x + da.w, y);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // ── Y-axis labels ──
    ctx.fillStyle = colors.text;
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yRange = opts.yMax - opts.yMin;
    for (let i = 0; i <= opts.yTicks; i++) {
      const val = opts.yMax - (yRange / opts.yTicks) * i;
      const y = da.y + (da.h / opts.yTicks) * i;
      const label = val % 1 === 0 ? val.toFixed(0) + opts.ySuffix : val.toFixed(1) + opts.ySuffix;
      ctx.fillText(label, da.x - 6, y);
    }

    // ── X-axis time labels ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '8px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = hexToRgba(colors.text, 0.55);
    ctx.fillText('← 60s', da.x + da.w * 0.18, da.y + da.h + 4);
    ctx.fillText('now →', da.x + da.w * 0.88, da.y + da.h + 4);

    // ── Bottom border line ──
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(da.x, da.y + da.h);
    ctx.lineTo(da.x + da.w, da.y + da.h);
    ctx.stroke();
  }

  drawLine(da: { x: number; y: number; w: number; h: number }, dataset: ChartDataset): void {
    const ctx = this.ctx;
    const data = dataset.data;
    if (data.length < 2) return;

    const opts = this.options;
    const yRange = Math.max(opts.yMax - opts.yMin, 0.01);
    const step = da.w / Math.max(data.length - 1, 1);

    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i] === null || data[i] === undefined) continue;
      const x = da.x + da.w - (data.length - 1 - i) * step;
      const ratio = (data[i]! - opts.yMin) / yRange;
      const y = da.y + da.h - Math.max(0, Math.min(1, ratio)) * da.h;
      points.push({ x, y });
    }

    if (points.length < 2) return;

    const color = dataset.color || '#6366f1';
    const tension = 0.3;
    // Phase 5: use the tested pure clamp(v, min, max) from math.ts
    const clampY = (v: number) => clamp(v, da.y, da.y + da.h);

    // Glow behind line (skipped in Low-End mode — extra overdraw on weak GPUs)
    if (!isLowEndMode()) {
      ctx.save();
      ctx.beginPath();
      if (opts.smooth && points.length > 2) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[Math.max(i - 1, 0)];
          const p1 = points[i];
          const p2 = points[Math.min(i + 1, points.length - 1)];
          const p3 = points[Math.min(i + 2, points.length - 1)];
          ctx.bezierCurveTo(
            p1.x + (p2.x - p0.x) * tension,
            clampY(p1.y + (p2.y - p0.y) * tension),
            p2.x - (p3.x - p1.x) * tension,
            clampY(p2.y - (p3.y - p1.y) * tension),
            p2.x, p2.y
          );
        }
      } else {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = hexToRgba(color, 0.25);
      ctx.lineWidth = opts.lineWidth * 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // Fill under line
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, da.y + da.h);

    if (opts.smooth && points.length > 2) {
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)];
        const p1 = points[i];
        const p2 = points[Math.min(i + 1, points.length - 1)];
        const p3 = points[Math.min(i + 2, points.length - 1)];
        ctx.bezierCurveTo(
          p1.x + (p2.x - p0.x) * tension,
          clampY(p1.y + (p2.y - p0.y) * tension),
          p2.x - (p3.x - p1.x) * tension,
          clampY(p2.y - (p3.y - p1.y) * tension),
          p2.x, p2.y
        );
      }
    } else {
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.lineTo(points[points.length - 1].x, da.y + da.h);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, da.y, 0, da.y + da.h);
    gradient.addColorStop(0, hexToRgba(color, opts.fillOpacity + 0.05));
    gradient.addColorStop(0.5, hexToRgba(color, opts.fillOpacity * 0.5));
    gradient.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();

    // Main line
    ctx.save();
    ctx.beginPath();
    if (opts.smooth && points.length > 2) {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)];
        const p1 = points[i];
        const p2 = points[Math.min(i + 1, points.length - 1)];
        const p3 = points[Math.min(i + 2, points.length - 1)];
        ctx.bezierCurveTo(
          p1.x + (p2.x - p0.x) * tension,
          clampY(p1.y + (p2.y - p0.y) * tension),
          p2.x - (p3.x - p1.x) * tension,
          clampY(p2.y - (p3.y - p1.y) * tension),
          p2.x, p2.y
        );
      }
    } else {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = opts.lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // Dot markers + latest-point highlight (skipped in Low-End mode)
    if (!isLowEndMode()) {
      ctx.save();
      for (let i = 0; i < points.length; i++) {
        if (i % 5 !== 0 && i !== points.length - 1) continue;
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, 4, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, 0.15);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      const last = points[points.length - 1];
      if (last) {
        const grad = ctx.createRadialGradient(last.x, last.y, 0, last.x, last.y, 12);
        grad.addColorStop(0, hexToRgba(color, 0.4));
        grad.addColorStop(1, hexToRgba(color, 0));
        ctx.beginPath();
        ctx.arc(last.x, last.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(last.x, last.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      ctx.restore();
    }
  }

  draw(): void {
    const ctx = this.ctx;
    const colors = this.getThemeColors();
    const opts = this.options;

    ctx.clearRect(0, 0, this.width, this.height);

    const da = this.getDrawArea();

    // ── Canvas background with subtle gradient ──
    const accentColor = this._getAccentColor();
    const bgGrad = ctx.createLinearGradient(0, da.y - 8, 0, da.y + da.h + 8);
    bgGrad.addColorStop(0, accentColor);
    bgGrad.addColorStop(1, colors.bg);
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(da.x - 8, da.y - 8, da.w + 16, da.h + 16, 4);
    } else {
      ctx.rect(da.x - 8, da.y - 8, da.w + 16, da.h + 16);
    }
    ctx.fill();

    // ── Subtle horizontal guide label at 50% ──
    ctx.save();
    ctx.fillStyle = hexToRgba(colors.text, 0.12);
    ctx.font = '7px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const midY = da.y + da.h / 2;
    ctx.fillText('50%', da.x - 4, midY);
    ctx.restore();

    this.drawGrid(da);

    let hasData = false;
    opts.datasets.forEach(ds => {
      if (ds.data && ds.data.length > 1) {
        this.drawLine(da, ds);
        hasData = true;
      }
    });

    // ── "Collecting data..." placeholder ──
    if (!hasData) {
      const hasPoints = opts.datasets.some(ds => ds.data && ds.data.length === 1);
      ctx.save();
      ctx.fillStyle = hexToRgba(colors.text, hasPoints ? 0.35 : 0.2);
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hasPoints ? 'Collecting data…' : 'Waiting for data…', da.x + da.w / 2, da.y + da.h / 2);
      ctx.restore();
    }

    // Draw hover crosshair
    if (this._hoveredPoint) {
      const p = this._hoveredPoint;
      ctx.save();

      ctx.beginPath();
      ctx.moveTo(p.x, da.y);
      ctx.lineTo(p.x, da.y + da.h);
      ctx.strokeStyle = hexToRgba(p.color, 0.35);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(da.x, p.y);
      ctx.lineTo(da.x + da.w, p.y);
      ctx.strokeStyle = hexToRgba(p.color, 0.2);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(p.color, 0.2);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(p.color, 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      ctx.restore();
    }
  }

  _getAccentColor(): string {
    const ds = this.options.datasets;
    if (ds && ds.length > 0 && ds[0].color) {
      return hexToRgba(ds[0].color, 0.04);
    }
    return 'transparent';
  }

  updateDatasets(datasets: ChartDataset[]): void {
    this.options.datasets = datasets;
    this.draw();
  }

  destroy(): void {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    else window.removeEventListener('resize', this._boundWindowResize);
    this.canvas.removeEventListener('mousemove', this._boundMouseMove);
    this.canvas.removeEventListener('mouseleave', this._boundMouseLeave);
    if (this._tooltip) this._tooltip.remove();
  }
}

// ──────────────────────────────────────────────
// 🍩 DONUT CHART (Memory Distribution)
// ──────────────────────────────────────────────

interface DonutSlice {
  value: number;
  color: string;
}

class DonutChart {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private radius = 80;
  private lineWidth = 20;
  /** Last drawn slices — kept public for redraw-on-resize (app.ts). */
  _lastSlices: DonutSlice[] | null = null;

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.radius = 80;
    this.lineWidth = 20;
  }

  draw(slices: DonutSlice[]): void {
    this._lastSlices = slices;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    if (!slices || slices.length === 0) return;
    // Phase 5 completion: slice-angle math delegates to the tested pure core.
    const { angles, total } = donutSliceAngles(slices);
    if (total <= 0 || angles.length === 0) return;

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(cx, cy, this.radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba('#6366f1', 0.06);
    ctx.lineWidth = 2;
    ctx.stroke();

    for (const slice of angles) {
      const angle = slice.end - slice.start;
      // Main arc
      ctx.beginPath();
      ctx.arc(cx, cy, this.radius, slice.start, slice.end);
      ctx.strokeStyle = slice.color;
      ctx.lineWidth = this.lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Inner highlight arc
      if (angle > 0.1) {
        ctx.beginPath();
        ctx.arc(cx, cy, this.radius - 2, slice.start, slice.end);
        ctx.strokeStyle = hexToRgba(slice.color, 0.25);
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }

    // Background track ring: from the end of the last slice back to top.
    // (angles is guaranteed non-empty by the early return above.)
    const trackStart = angles[angles.length - 1].end;
    ctx.beginPath();
    ctx.arc(cx, cy, this.radius, trackStart, -Math.PI / 2);
    ctx.strokeStyle = this.getTrackColor();
    ctx.lineWidth = this.lineWidth - 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  getTrackColor(): string {
    return document.body.classList.contains('light-theme')
      ? 'rgba(0, 0, 0, 0.05)'
      : 'rgba(255, 255, 255, 0.05)';
  }
}

// ──────────────────────────────────────────────
// 📊 CHART DATA HISTORY & INITIALIZATION
// ──────────────────────────────────────────────

const cpuHistory: number[] = [0];
const memHistory: number[] = [0];
const vmHistory: number[] = [0];

export let cpuLineChart: ChartEngine | null = null;
export let memLineChart: ChartEngine | null = null;
export let vmLineChart: ChartEngine | null = null;
export let donutChart: DonutChart | null = null;
export let cpuRingGauge: RingGauge | null = null;
export let memRingGauge: RingGauge | null = null;
export let vmRingGauge: RingGauge | null = null;

export function initCharts(): void {
  cpuRingGauge = new RingGauge('cpuRingGauge');
  memRingGauge = new RingGauge('memRingGauge');
  vmRingGauge = new RingGauge('vmRingGauge', {
    lowColor: '#22c55e',
    midColor: '#f59e0b',
    highColor: '#ef4444',
  });

  cpuLineChart = new ChartEngine('cpuChart', {
    ySuffix: '%',
    yMax: 100,
    yMin: 0,
    fillOpacity: 0.12,
    lineWidth: 2.5,
    datasets: [{ color: '#6366f1', data: [] }],
  });

  memLineChart = new ChartEngine('memChart', {
    ySuffix: '%',
    yMax: 100,
    yMin: 0,
    fillOpacity: 0.12,
    lineWidth: 2.5,
    datasets: [{ color: '#22c55e', data: [] }],
  });

  vmLineChart = new ChartEngine('vmChart', {
    ySuffix: '%',
    yMax: 100,
    yMin: 0,
    fillOpacity: 0.12,
    lineWidth: 2.5,
    datasets: [{ color: '#f59e0b', data: [] }],
  });

  donutChart = new DonutChart('donutChart');
}

export function updateCharts(info: SystemInfo): void {
  // History recording ALWAYS runs (cheap array pushes) so the charts are
  // populated when the user returns to the Performance section.
  const cpuLoadPercent = resolveCpuLoad(info.cpuUsage, info.loadAvg[0]);
  cpuHistory.push(cpuLoadPercent);
  if (cpuHistory.length > MAX_HISTORY) cpuHistory.shift();

  const memPercent = memoryUsedPercent(info.totalMemory, info.freeMemory);
  memHistory.push(memPercent);
  if (memHistory.length > MAX_HISTORY) memHistory.shift();

  // Virtual Memory percentage
  let vmPercent = 0;
  if (info.virtualMemory && info.virtualMemory.total > 0) {
    vmPercent = ((info.virtualMemory.used / info.virtualMemory.total) * 100);
  }
  vmHistory.push(vmPercent);
  if (vmHistory.length > MAX_HISTORY) vmHistory.shift();

  paintCharts(info);
}

/**
 * Repaint all charts from the recorded history WITHOUT pushing a new point.
 * Called when the Performance section reopens — history was already recording
 * while hidden, so a repaint shows the full window instantly (Phase 6).
 */
export function repaintCharts(info: SystemInfo): void {
  paintCharts(info);
}

/**
 * Canvas painting + DOM writes. Skipped entirely while the Performance
 * section is hidden — hidden canvases have zero visual value (Phase 6).
 */
function paintCharts(info: SystemInfo): void {
  if (!chartsActive) return;
  if (!cpuLineChart || !memLineChart || !vmLineChart || !donutChart) return;

  const cpuLoadPercent = resolveCpuLoad(info.cpuUsage, info.loadAvg[0]);
  const memPercent = memoryUsedPercent(info.totalMemory, info.freeMemory);
  let vmPercent = 0;
  if (info.virtualMemory && info.virtualMemory.total > 0) {
    vmPercent = ((info.virtualMemory.used / info.virtualMemory.total) * 100);
  }

  cpuLineChart.updateDatasets([{ color: '#6366f1', data: [...cpuHistory] }]);
  const cpuCurrent = document.getElementById('chartCpuCurrent');
  if (cpuCurrent) cpuCurrent.textContent = `${cpuLoadPercent.toFixed(1)}%`;

  const avg = cpuHistory.reduce((s, v) => s + v, 0) / cpuHistory.length;
  const peak = Math.max(...cpuHistory);
  const cpuAvgEl = document.getElementById('chartCpuAvg');
  const cpuPeakEl = document.getElementById('chartCpuPeak');
  if (cpuAvgEl) cpuAvgEl.textContent = `Avg: ${avg.toFixed(1)}%`;
  if (cpuPeakEl) cpuPeakEl.textContent = `Peak: ${peak.toFixed(1)}%`;

  memLineChart.updateDatasets([{ color: '#22c55e', data: [...memHistory] }]);
  const memCurrent = document.getElementById('chartMemCurrent');
  if (memCurrent) memCurrent.textContent = `${memPercent.toFixed(1)}%`;

  vmLineChart.updateDatasets([{ color: '#f59e0b', data: [...vmHistory] }]);
  const vmCurrent = document.getElementById('chartVmCurrent');
  if (vmCurrent) vmCurrent.textContent = `${vmPercent.toFixed(1)}%`;
  const vmUsedEl = document.getElementById('chartVmUsed');
  const vmTotalEl = document.getElementById('chartVmTotal');
  if (vmUsedEl && info.virtualMemory && info.virtualMemory.total) {
    vmUsedEl.textContent = `Used: ${formatBytes(info.virtualMemory.used)}`;
  }
  if (vmTotalEl && info.virtualMemory && info.virtualMemory.total) {
    vmTotalEl.textContent = `Total: ${formatBytes(info.virtualMemory.total)}`;
  }

  const usedMem = info.totalMemory - info.freeMemory;
  const memUsedEl = document.getElementById('chartMemUsed');
  const memFreeEl = document.getElementById('chartMemFree');
  const memTotalEl = document.getElementById('chartMemTotal');
  if (memUsedEl) memUsedEl.textContent = `Used: ${formatBytes(usedMem)}`;
  if (memFreeEl) memFreeEl.textContent = `Free: ${formatBytes(info.freeMemory)}`;
  if (memTotalEl) memTotalEl.textContent = `Total: ${formatBytes(info.totalMemory)}`;

  const totalMem = info.totalMemory || 1;
  const usedPct = ((usedMem / totalMem) * 100).toFixed(1);
  donutChart.draw([
    { value: Math.max(0, usedMem), color: '#6366f1' },
    { value: Math.max(0, info.freeMemory || 0), color: '#22c55e' },
  ]);

  const distribLabel = document.getElementById('chartDistribLabel');
  if (distribLabel) distribLabel.textContent = `${usedPct}%`;
}
