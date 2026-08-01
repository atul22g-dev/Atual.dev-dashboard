/* ============================================================
   📊 OVERVIEW SECTION - Dashboard Overview logic (Phase 4 TS)
   Contract: init() / update(info) / destroy() (Phase 2)
   Note: system info (Device Info + Windows Info) is painted by
   system-section.js — app.js calls both sections' update().
   ============================================================ */

import { $, formatUptime } from '../utils.js';
import type { SystemInfo } from '../../../shared/ipc/contracts.js';

/** No persistent resources — this section only paints snapshots. */
export function init(): void {
  // nothing to set up
}

export function update(info: SystemInfo): void {
  // ── Live CPU Load ──
  const cpuLoad = info.cpuUsage !== undefined
    ? info.cpuUsage
    : Math.min((info.loadAvg[0] / info.cpus) * 100, 100);
  $('cpuLoadOverview').textContent = `${cpuLoad.toFixed(1)}%`;

  // ── Live Memory Used ──
  const usedMem = info.totalMemory - info.freeMemory;
  const memPercent = (usedMem / info.totalMemory) * 100;
  $('memUsedOverview').textContent = `${memPercent.toFixed(1)}%`;

  // ── Uptime ──
  $('uptime').textContent = formatUptime(info.uptime);

  // ── GPU Temp is fetched separately via loadGpuTempInfo() in app.js ──
}

/** No timers or listeners to release. */
export function destroy(): void {
  // nothing to clean up
}
