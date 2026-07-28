/* ============================================================
   🖥️ SYSTEM SECTION - System information logic
   ============================================================ */

import { $, formatLoadAvg } from '../utils.js';

export function updateSystemPage(info) {
  $('osType').textContent = info.osType;
  $('osRelease').textContent = info.osRelease;
  $('arch').textContent = info.arch;
  $('hostnameSys').textContent = info.hostname;
  $('cpuModel').textContent = info.cpuModel || 'Unknown';
  $('cpuCoresSys').textContent = `${info.cpus} Cores`;
  $('loadAvg').textContent = `${formatLoadAvg(info.loadAvg[0])}, ${formatLoadAvg(info.loadAvg[1])}, ${formatLoadAvg(info.loadAvg[2])}`;
  $('electronVerSys').textContent = `v${info.electronVersion}`;
  $('chromeVerSys').textContent = `v${info.chromeVersion}`;
  $('nodeVerSys').textContent = `v${info.nodeVersion}`;
}
