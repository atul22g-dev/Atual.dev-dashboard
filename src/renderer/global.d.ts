/* ============================================================
   🌉 RENDERER GLOBAL TYPES — window.electronAPI (Phase 4)
   ============================================================
   The preload bridge exposes `window.electronAPI`; this ambient
   declaration gives every renderer module full typing from the
   shared IPC contract (src/shared/ipc/contracts.ts).
   ============================================================ */

import type { ElectronAPI } from '../shared/ipc/contracts.js';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
