/* ============================================================
   ⭕ RING GAUGE - Animated circular progress rings (Phase 4 TS)
   ============================================================ */

import { hexToRgba } from './utils.js';
import { clamp, valueToPercent, percentToRadians, gradientColor } from './math.js';

interface RingGaugeOptions {
  ringWidth?: number;
  ringSpacing?: number;
  value?: number;
  animatedValue?: number;
  min?: number;
  max?: number;
  lowThreshold?: number;
  midThreshold?: number;
  lowColor?: string;
  midColor?: string;
  highColor?: string;
  glowIntensity?: number;
  animationSpeed?: number;
  trackColor?: string;
}

export class RingGauge {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private options!: Required<Omit<RingGaugeOptions, 'trackColor'>> & { trackColor?: string };
  private animFrameId: number | null = null;
  private _isAnimating = false;
  private _themeObserver: MutationObserver | null = null;

  constructor(canvasId: string, options: RingGaugeOptions = {}) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    this.options = {
      ringWidth: 14,
      ringSpacing: 4,
      value: 0,
      animatedValue: 0,
      min: 0,
      max: 100,
      lowThreshold: 50,
      midThreshold: 80,
      lowColor: '#22c55e',
      midColor: '#f59e0b',
      highColor: '#ef4444',
      glowIntensity: 0.4,
      animationSpeed: 0.08,
      ...options,
    };

    this.animFrameId = null;
    this._isAnimating = false;

    this._themeObserver = new MutationObserver(() => this.draw(true));
    this._themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  getTrackColor(): string {
    return document.body.classList.contains('light-theme')
      ? 'rgba(0, 0, 0, 0.06)'
      : 'rgba(255, 255, 255, 0.06)';
  }

  getMutedColor(): string {
    return document.body.classList.contains('light-theme') ? '#8888a0' : '#5c5c72';
  }

  getGradientColor(percentage: number): string {
    const { lowThreshold, midThreshold, lowColor, midColor, highColor } = this.options;
    return gradientColor(percentage, { lowThreshold, midThreshold, lowColor, midColor, highColor });
  }

  setValue(val: number): void {
    const clamped = clamp(val, this.options.min, this.options.max);
    this.options.value = clamped;
    if (!this._isAnimating) {
      this._isAnimating = true;
      this.animate();
    }
  }

  animate(): void {
    const opts = this.options;
    const diff = opts.value - opts.animatedValue;
    if (Math.abs(diff) < 0.1) {
      opts.animatedValue = opts.value;
      this._isAnimating = false;
      this.draw(false);
      return;
    }
    opts.animatedValue += diff * opts.animationSpeed;
    this.draw(false);
    this.animFrameId = requestAnimationFrame(() => this.animate());
  }

  draw(immediate = false): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const opts = this.options;

    ctx.clearRect(0, 0, w, h);

    const currentValue = immediate ? opts.value : opts.animatedValue;
    const percentage = valueToPercent(currentValue, opts.min, opts.max);
    const angle = percentToRadians(percentage);

    const ringWidth = opts.ringWidth;
    const spacing = opts.ringSpacing;
    const outerRadius = Math.min(cx, cy) - 10;
    const innerRadius = outerRadius - ringWidth;
    const midRadius = (outerRadius + innerRadius) / 2;

    // Outer subtle glow ring
    const glowRadius = outerRadius + spacing;
    const glowColor = this.getGradientColor(percentage);
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(glowColor, 0.08);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Background track ring
    ctx.beginPath();
    ctx.arc(cx, cy, midRadius, 0, Math.PI * 2);
    ctx.strokeStyle = opts.trackColor || this.getTrackColor();
    ctx.lineWidth = ringWidth;
    ctx.stroke();

    if (percentage <= 0) return;

    // Active arc
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + angle;

    ctx.beginPath();
    ctx.arc(cx, cy, midRadius, startAngle, endAngle);
    ctx.strokeStyle = this.getGradientColor(percentage);
    ctx.lineWidth = ringWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Glow effect on the active arc
    ctx.beginPath();
    ctx.arc(cx, cy, midRadius, startAngle, endAngle);
    ctx.strokeStyle = hexToRgba(this.getGradientColor(percentage), opts.glowIntensity);
    ctx.lineWidth = ringWidth + 4;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // White highlight dot at the end of the arc
    if (angle > 0.05) {
      const capX = cx + Math.cos(endAngle) * midRadius;
      const capY = cy + Math.sin(endAngle) * midRadius;
      ctx.beginPath();
      ctx.arc(capX, capY, ringWidth / 2 - 1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    // Tick marks around the ring
    const tickCount = 20;
    const tickStartRadius = outerRadius + spacing + 3;
    const tickEndRadius = tickStartRadius + 5;
    for (let i = 0; i < tickCount; i++) {
      const tickAngle = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
      const x1 = cx + Math.cos(tickAngle) * tickStartRadius;
      const y1 = cy + Math.sin(tickAngle) * tickStartRadius;
      const x2 = cx + Math.cos(tickAngle) * tickEndRadius;
      const y2 = cy + Math.sin(tickAngle) * tickEndRadius;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = this.getMutedColor();
      ctx.lineWidth = 1;
      ctx.globalAlpha = i / tickCount <= percentage / 100 ? 0.6 : 0.15;
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }

  destroy(): void {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this._themeObserver) this._themeObserver.disconnect();
  }
}
