/* ============================================================
   🎨 ICON GENERATOR — modern Atual.dev Dashboard icon
   ============================================================
   Pure-Node renderer (zero npm dependencies): draws a rounded
   squircle with an indigo→violet gradient and a white
   monitoring-pulse glyph, supersampled 4× for smooth edges, then
   outputs square PNGs at multiple sizes (1024 master + small
   tray/installer variants).

   Run:  node scripts/generate-icon.js
   Output: assets/icon.png (1024) · icon-256.png · icon-48.png ·
           icon-32.png · icon-16.png

   The encoder writes a minimal valid PNG (RGBA8, zlib via the
   built-in `zlib` module) — no external imaging library needed.
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ──────────────────────────────────────────────
// 🧮 Minimal PNG encoder (IHDR/IDAT/IEND + CRC32)
// ──────────────────────────────────────────────

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Encode an RGBA8 pixel buffer into a PNG file. */
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Raw scanlines, each prefixed with filter byte 0 (None).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ──────────────────────────────────────────────
// 📐 Shape math (in a virtual 0..1 coordinate space)
// ──────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** Signed distance from a point to a rounded-rect (negative = inside). */
function sdRoundRect(px, py, cx, cy, half, radius) {
  const qx = Math.abs(px - cx) - (half - radius);
  const qy = Math.abs(py - cy) - (half - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Distance from a point to a polyline (array of [x,y] in 0..1). */
function distToPolyline(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    best = Math.min(best, Math.hypot(px - projX, py - projY));
  }
  return best;
}

/** Smoothstep-based coverage for a distance field (anti-aliased edge). */
function coverage(dist, aa) {
  return clamp(0.5 - dist / aa, 0, 1);
}

// ──────────────────────────────────────────────
// 🖌️ Icon palette & glyph definition
// ──────────────────────────────────────────────

// Brand gradient — a deepened variant of the renderer's
// --accent-primary/secondary (#6366f1 → #8b5cf6). C_DEEP sits darker than
// the brand violet so the squircle keeps contrast when shrunk to 16 px.
const C_INDIGO = [0x63, 0x66, 0xf1]; // #6366f1
const C_DEEP   = [0x31, 0x2e, 0x81]; // deeper anchor for the bottom-right

// Monitoring "pulse" polyline — an ECG-style heartbeat across the squircle.
// Coordinates are in a 0..1 space (glyph centred on the squircle face).
const PULSE = [
  [0.14, 0.52], [0.30, 0.52], [0.36, 0.60], [0.43, 0.40],
  [0.49, 0.52], [0.62, 0.52], [0.69, 0.44], [0.76, 0.55],
  [0.86, 0.55],
];

/** Sample one output pixel (x,y in output px) with 4×4 supersampling. */
function samplePixel(px, py, size) {
  const SS = 4; // supersample factor
  let r = 0, g = 0, b = 0, a = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      // Continuous coords inside the virtual 0..1 square.
      const u = (px + (sx + 0.5) / SS) / size;
      const v = (py + (sy + 0.5) / SS) / size;
      const [cr, cg, cb, ca] = shade(u, v);
      r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
    }
  }
  const n = SS * SS;
  const alpha = a / n;
  if (alpha <= 0) return [0, 0, 0, 0];
  return [
    Math.round(clamp(r / a, 0, 255)),
    Math.round(clamp(g / a, 0, 255)),
    Math.round(clamp(b / a, 0, 255)),
    Math.round(alpha),
  ];
}

/** Colour of the icon at a continuous point (u,v ∈ 0..1). */
function shade(u, v) {
  // ── Squircle base (inset so the rounded corners leave a margin) ──
  const cx = 0.5, cy = 0.5, half = 0.47, radius = 0.21;
  const baseDist = sdRoundRect(u, v, cx, cy, half, radius);
  const baseCov = coverage(baseDist, 0.015);
  if (baseCov <= 0) return [0, 0, 0, 0];

  // Diagonal brand gradient with a subtle top-left highlight.
  const t = clamp((u + v) / 2, 0, 1);
  let bg = [
    lerp(C_INDIGO[0], C_DEEP[0], t),
    lerp(C_INDIGO[1], C_DEEP[1], t),
    lerp(C_INDIGO[2], C_DEEP[2], t),
  ];
  // Soft sheen from the top edge.
  const sheen = Math.max(0, 1 - (v + u) / 1.1);
  bg = [
    clamp(bg[0] + 46 * sheen, 0, 255),
    clamp(bg[1] + 52 * sheen, 0, 255),
    clamp(bg[2] + 70 * sheen, 0, 255),
  ];

  // ── White pulse glyph + soft glow ──
  const dist = distToPolyline(u, v, PULSE);
  const lineW = 0.028; // stroke half-width
  let glyph = 0;
  let glow = 0;
  if (dist < lineW * 3.2) glow = Math.pow(1 - dist / (lineW * 3.2), 2) * 0.18;
  if (dist < lineW) glyph = 1;

  // Cap dot at the pulse end.
  const end = PULSE[PULSE.length - 1];
  const dEnd = Math.hypot(u - end[0], v - end[1]);
  if (dEnd < 0.032) glyph = Math.max(glyph, coverage(dEnd - 0.018, 0.012));
  if (dEnd < 0.06) glow = Math.max(glow, Math.pow(1 - dEnd / 0.06, 2) * 0.16);

  const mix = Math.max(glyph, glow);
  const col = [
    lerp(bg[0], 255, mix),
    lerp(bg[1], 255, mix),
    lerp(bg[2], 255, mix),
  ];
  return [col[0], col[1], col[2], baseCov];
}

// ──────────────────────────────────────────────
// 🖼️ Render + write
// ──────────────────────────────────────────────

/** Render an RGBA8 buffer at `size`×`size`. */
function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = samplePixel(x, y, size);
      const i = (y * size + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    }
  }
  return buf;
}

function main() {
  const outDir = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const sizes = [
    { file: 'icon.png', size: 1024 },   // master (window, installer, renderer)
    { file: 'icon-256.png', size: 256 },
    { file: 'icon-48.png', size: 48 },
    { file: 'icon-32.png', size: 32 },
    { file: 'icon-16.png', size: 16 },  // classic tray size
  ];

  for (const { file, size } of sizes) {
    const t0 = Date.now();
    const buf = render(size);
    const png = encodePng(size, size, buf);
    const out = path.join(outDir, file);
    fs.writeFileSync(out, png);
    console.log(`✓ ${file}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} kB  (${Date.now() - t0} ms)`);
  }
  console.log('Done — modern icon written to assets/');
}

main();
