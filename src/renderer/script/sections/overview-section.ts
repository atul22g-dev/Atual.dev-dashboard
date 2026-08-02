/* ============================================================
   📊 OVERVIEW SECTION - Dashboard Overview logic (Phase 4 TS)
   Contract: init() / update(info) / destroy() (Phase 2)
   Note: system info (Device Info + Windows Info) is painted by
   system-section.js — app.js calls both sections' update().
   ============================================================ */

import { $, formatUptime } from '../utils.js';
import { resolveCpuLoad, memoryUsedPercent } from '../math.js';
import type { SystemInfo } from '../../../shared/ipc/contracts.js';

/** No persistent resources — this section only paints snapshots. */
export function init(): void {
  // nothing to set up
}

export function update(info: SystemInfo): void {
  // ── Live CPU Load (shared source of truth — matches every other widget) ──
  const cpuLoad = resolveCpuLoad(info.cpuUsage, info.loadAvg[0]);
  $('cpuLoadOverview').textContent = `${cpuLoad.toFixed(1)}%`;

  // ── Live Memory Used (shared source of truth) ──
  const memPercent = memoryUsedPercent(info.totalMemory, info.freeMemory);
  $('memUsedOverview').textContent = `${memPercent.toFixed(1)}%`;

  // ── Uptime ──
  $('uptime').textContent = formatUptime(info.uptime);

  // ── GPU Temp is fetched separately via loadGpuTempInfo() in app.js ──
}

/** No timers or listeners to release. */
export function destroy(): void {
  // nothing to clean up
}
