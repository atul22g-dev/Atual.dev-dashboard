/* ============================================================
   ⚡ VITE — renderer build (Phase 4)
   ============================================================
   Bundles src/renderer (index.html + ES modules + CSS) into
   out/renderer. main.js loads out/renderer/index.html via
   loadFile(), so:

     - root   → src/renderer  (index.html lands at out/renderer/
                index.html, not a nested path)
     - base   → './'          (relative asset URLs, file:// safe)
     - outDir → out/renderer  (avoids electron-builder's dist/)
     - target → Electron 43's Chromium (chrome120 baseline)
     - modulePreload.polyfill → false. The app CSP is `script-src
                'self'` (no 'unsafe-inline'); Vite would inject an
                inline polyfill script if the bundle ever gained a
                dynamic import() — this prevents that CSP breakage.

   A `vite dev` server + HMR flow (Phase 4 completion) is available via
   `npm run dev` (scripts/dev-runner.js spawns Vite then Electron pointing
   at the dev URL). CommonJS main/preload are NOT built here — they stay
   plain .js (converted last in Phase 4).
   ============================================================ */

import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(__dirname, 'src', 'renderer'),
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.join(__dirname, 'out', 'renderer'),
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: false,
    assetsDir: 'assets',
    modulePreload: { polyfill: false },
  },
});
