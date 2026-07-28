/* ============================================================
   🖥️ SYSTEM SECTION - System information logic
   ============================================================ */

import { $ } from '../utils.js';

export function updateSystemPage(info) {
  // ── Device Info (Windows System Information format) ──
  $('deviceName').textContent = info.hostname || 'Unknown';
  
  // Processor: "Intel(R) Core(TM) i5-10300H CPU @ 2.50GHz (2.50 GHz)"
  const cpuModel = info.cpuModel || 'Unknown';
  const cpuSpeed = info.cpuSpeed || 0;
  const speedStr = cpuSpeed > 0 ? ` (${(cpuSpeed / 1000).toFixed(2)} GHz)` : '';
  $('processor').textContent = cpuModel + speedStr;
  
  // Installed RAM: "16.0 GB (15.8 GB usable)"
  const totalRamGB = info.totalMemory ? (info.totalMemory / (1024*1024*1024)).toFixed(1) : '?';
  // Usable memory from WMI (exact) or estimated on first call
  const usableBytes = info.usableMemory || Math.round(info.totalMemory * 0.98);
  const usableRamGB = info.totalMemory ? (usableBytes / (1024*1024*1024)).toFixed(1) : '?';
  $('installedRam').textContent = `${totalRamGB} GB (${usableRamGB} GB usable)`;
  
  // Graphics Card: "NVIDIA GeForce GTX 1650 (4 GB), Intel(R) UHD Graphics (128 MB)"
  $('graphicsCard').textContent = info.gpuInfo?.allGpus || 'Unknown';
  
  // Storage: "131 GB of 477 GB used"
  const storageFetched = info.storageSummary?.storageFetched;
  const totalStorage = info.storageSummary?.total || 0;
  const usedStorage = info.storageSummary?.used || 0;
  if (storageFetched) {
    if (totalStorage > 0) {
      const usedGB = (usedStorage / (1024*1024*1024)).toFixed(0);
      const totalGB = (totalStorage / (1024*1024*1024)).toFixed(0);
      $('storage').textContent = `${usedGB} GB of ${totalGB} GB used`;
    } else {
      $('storage').textContent = 'No storage data';
    }
  } else {
    $('storage').textContent = 'Detecting...';
  }
  
  // System Type: "64-bit operating system, x64-based processor"
  const arch = info.arch || '';
  const is64bit = arch.includes('64');
  const archName = arch.includes('arm') ? (arch.includes('64') ? 'ARM64' : 'ARM') : (is64bit ? 'x64' : 'x86');
  $('systemType').textContent = `${is64bit ? '64' : '32'}-bit operating system, ${archName}-based processor`;
  
  // ── Windows Info (Edition & Version) ──
  $('windowsEdition').textContent = info.osEdition || 'Detecting...';
  $('windowsVersion').textContent = info.osDisplayVersion || info.osRelease || 'Unknown';
  $('windowsActivation').textContent = info.osActivationStatus || '-';


}
