/* ============================================================
   📊 OVERVIEW SECTION - Dashboard Overview logic
   ============================================================ */

import { $, formatBytes, formatPlatform, formatUptime } from '../utils.js';

export function updateOverview(info) {
  $('cpuCores').textContent = `${info.cpus} Cores`;
  $('totalMemory').textContent = formatBytes(info.totalMemory);
  $('platform').textContent = formatPlatform(info.platform);
  $('uptime').textContent = formatUptime(info.uptime);
  $('electronVersion').textContent = `v${info.electronVersion}`;
  $('chromeVersion').textContent = `v${info.chromeVersion}`;
  $('nodeVersion').textContent = `v${info.nodeVersion}`;
  $('hostname').textContent = info.hostname;

  const usedMem = info.totalMemory - info.freeMemory;
  const memPercent = (usedMem / info.totalMemory) * 100;
  $('memoryBar').style.width = `${Math.min(memPercent, 100)}%`;
  $('usedMemory').textContent = formatBytes(usedMem);
  $('freeMemory').textContent = formatBytes(info.freeMemory);
  $('memoryTotal').textContent = formatBytes(info.totalMemory);
  // Virtual memory (may not be available if info doesn't have it yet)
  const vmTotal = $('virtualMemoryTotal');
  if (vmTotal && info.virtualMemory && info.virtualMemory.total) {
    vmTotal.textContent = formatBytes(info.virtualMemory.total);
  }
}
