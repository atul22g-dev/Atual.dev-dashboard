/* ============================================================
   📊 OVERVIEW SECTION - Dashboard Overview logic
   Combined with System info (Device Info + Windows Info)
   ============================================================ */

import { $, formatUptime } from '../utils.js';
import { updateSystemPage } from './system-section.js';

export function updateOverview(info) {
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

  // ── System Details (merged from previously separate System section) ──
  updateSystemPage(info);
}
