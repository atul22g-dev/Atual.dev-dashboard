/* ============================================================
   🖥️ PROVIDER — SYSTEM (Phase 2 split from main.js)
   CPU usage, system info snapshot, OS edition/version/activation,
   GPU info, storage summary, virtual memory.
   ============================================================ */

'use strict';

const os = require('os');
const { exec } = require('child_process');
const { app } = require('electron');
const { getDiskInfo } = require('./disk');

// ──────────────────────────────────────────────
// CPU USAGE TRACKING
// ──────────────────────────────────────────────

// CPU usage tracking — stores previous CPU times to calculate actual usage
let _prevCpuTimes = null;

// Smoothed CPU load averages (1, 5, 15 min) — works on all platforms, unlike os.loadavg()
// Uses exponential moving average so values gradually smooth over time
let _cpuLoadAvg1 = 0;
let _cpuLoadAvg5 = 0;
let _cpuLoadAvg15 = 0;
const _CPU_ALPHA_1 = 1 - Math.exp(-1.5 / 60);  // ~1 min smoothing
const _CPU_ALPHA_5 = 1 - Math.exp(-1.5 / 300); // ~5 min smoothing
const _CPU_ALPHA_15 = 1 - Math.exp(-1.5 / 900); // ~15 min smoothing
let _cpuLoadInitialized = false;

/**
 * Calculate actual CPU usage percentage by comparing idle/total time deltas
 * Works on ALL platforms (unlike os.loadavg() which is 0 on Windows)
 * Returns a number 0-100 representing CPU usage percentage
 */
function calculateCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  // Sum up all cores' idle and total times
  for (const cpu of cpus) {
    const times = cpu.times;
    totalIdle += times.idle;
    totalTick += times.user + times.nice + times.sys + times.idle + times.irq;
  }

  // First call — just store values and return 0
  if (!_prevCpuTimes) {
    _prevCpuTimes = { idle: totalIdle, tick: totalTick };
    return 0;
  }

  // Calculate deltas between current and previous measurement
  const idleDelta = totalIdle - _prevCpuTimes.idle;
  const tickDelta = totalTick - _prevCpuTimes.tick;

  // Update stored values for next call
  _prevCpuTimes = { idle: totalIdle, tick: totalTick };

  // Avoid division by zero
  if (tickDelta === 0) return 0;

  // CPU usage = 1 - (idle time / total time)
  const cpuUsage = Math.min(100, Math.max(0, Math.round((1 - idleDelta / tickDelta) * 1000) / 10));

  // Update smoothed load averages (works on ALL platforms unlike os.loadavg())
  if (!_cpuLoadInitialized) {
    _cpuLoadAvg1 = cpuUsage;
    _cpuLoadAvg5 = cpuUsage;
    _cpuLoadAvg15 = cpuUsage;
    _cpuLoadInitialized = true;
  } else {
    _cpuLoadAvg1 += _CPU_ALPHA_1 * (cpuUsage - _cpuLoadAvg1);
    _cpuLoadAvg5 += _CPU_ALPHA_5 * (cpuUsage - _cpuLoadAvg5);
    _cpuLoadAvg15 += _CPU_ALPHA_15 * (cpuUsage - _cpuLoadAvg15);
  }

  return cpuUsage;
}

// ──────────────────────────────────────────────
// SYSTEM INFO SNAPSHOT
// ──────────────────────────────────────────────

/**
 * 📊 Get basic system information
 * Called every 1.5 seconds by the renderer
 */
function getSystemInfo() {
  const cpus = os.cpus(); // Array of CPU cores with their details

  // 🌐 Gather all network interfaces (WiFi, Ethernet, etc.)
  const nets = os.networkInterfaces();
  const networkInterfaces = [];
  const allInterfaces = [];

  for (const name of Object.keys(nets)) {
    const interfaces = nets[name];
    if (interfaces) {
      for (const iface of interfaces) {
        // Store ALL interfaces (for the Network page)
        allInterfaces.push({ name, ...iface });

        // Store only external IPv4 interfaces (for the Overview page)
        if (iface.family === 'IPv4' && !iface.internal) {
          networkInterfaces.push({
            name,
            address: iface.address,
            netmask: iface.netmask,
            mac: iface.mac,
          });
        }
      }
    }
  }

  // CPU clock speed from first core (available on all platforms)
  const cpuSpeedMhz = cpus[0]?.speed || 0;

  // Return all the data as a single object
  return {
    platform: os.platform(),      // 'win32', 'darwin', 'linux'
    arch: os.arch(),              // 'x64', 'arm64', etc.
    cpus: cpus.length,            // Number of CPU cores
    cpuModel: cpus[0]?.model || 'Unknown',
    cpuUsage: calculateCpuUsage(), // Actual CPU usage % (0-100), works on all platforms
    cpuSpeed: cpuSpeedMhz,        // CPU clock speed in MHz
    totalMemory: os.totalmem(),   // Total RAM in bytes
    freeMemory: os.freemem(),     // Available RAM in bytes
    usableMemory: getUsableMemory(), // Exact usable RAM from WMI (Windows) or estimated
    hostname: os.hostname(),      // Computer name
    uptime: os.uptime(),          // System running time (seconds)
    osRelease: os.release(),
    osType: os.type(),
    loadAvg: [Math.round(_cpuLoadAvg1 * 100) / 100, Math.round(_cpuLoadAvg5 * 100) / 100, Math.round(_cpuLoadAvg15 * 100) / 100],       // Smoothed CPU load averages (works on ALL platforms)
    networkInterfaces,            // External IPv4 interfaces only
    allInterfaces,                // All interfaces (for Network section)
    // GPU info (all GPUs with VRAM)
    gpuInfo: getGpuInfo(),
    // OS Edition & Version (Windows-style)
    osEdition: getOsEdition(),
    osDisplayVersion: getOsDisplayVersion(),
    // Windows activation status
    osActivationStatus: getOsActivationStatus(),
    // Storage summary (total across all drives)
    storageSummary: getStorageSummary(),
  };
}

/**
 * 💾 Get exact usable physical memory from WMI (Windows)
 * Falls back to ~98% of total on non-Windows or if WMI fails
 */
let _cachedUsableMemory = null;
function getUsableMemory() {
  const platform = os.platform();

  // Non-Windows: estimate as 98% of total (same as before)
  if (platform !== 'win32') {
    return Math.round(os.totalmem() * 0.98);
  }

  // Return cached value
  if (_cachedUsableMemory) return _cachedUsableMemory;

  // Cache the estimate immediately to prevent re-spawning exec every refresh
  const estimate = Math.round(os.totalmem() * 0.98);
  _cachedUsableMemory = estimate;

  // Fetch TotalVisibleMemorySize from WMI (KB → bytes)
  const psCmd = 'powershell -NoProfile -Command "&{$os=Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue;if($os){echo $os.TotalVisibleMemorySize}else{echo 0}}" 2>nul';

  exec(psCmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (err, out) => {
    if (!err && out) {
      const kb = parseInt(out.trim().split(/[\r\n]+/)[0]?.trim());
      if (kb && kb > 0) {
        _cachedUsableMemory = kb * 1024; // KB → bytes (overwrites estimate)
      }
    }
    // On failure, the estimate stays cached
  });

  // Return synchronous estimate while async query runs
  return estimate;
}

// ──────────────────────────────────────────────
// OS DETAILS (Windows edition / version / activation)
// ──────────────────────────────────────────────

/**
 * ℹ️ Get Windows DisplayVersion (e.g. "25H2") from registry
 * Falls back to os.release() on non-Windows or if registry read fails
 */
let _cachedOsDisplayVersion = null;
function getOsDisplayVersion() {
  const platform = os.platform();

  // Non-Windows: use os.release() directly
  if (platform !== 'win32') {
    return os.release();
  }

  // Return cached value (even if 'Detecting...')
  if (_cachedOsDisplayVersion) return _cachedOsDisplayVersion;

  _cachedOsDisplayVersion = 'Detecting...';

  // Method 1: reg query (most reliable, no PowerShell quoting issues)
  // Output format: "    DisplayVersion    REG_SZ    24H2"
  const regCmd = 'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v DisplayVersion 2>nul';
  exec(regCmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (err, out) => {
    if (!err && out) {
      const match = out.match(/DisplayVersion\s+REG_\w+\s+(\S+)/i);
      if (match && match[1]) {
        _cachedOsDisplayVersion = match[1].trim();
        return;
      }
    }
    // Method 2: PowerShell (fallback)
    const psCmd = 'powershell -NoProfile -Command "try{$v=(Get-ItemProperty \'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\' -Name DisplayVersion -ErrorAction Stop).DisplayVersion;if($v){echo $v}else{echo (Get-ItemProperty \'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\' -Name ReleaseId -ErrorAction SilentlyContinue).ReleaseId}}catch{echo \'\'}" 2>nul';
    exec(psCmd, { timeout: 4000, maxBuffer: 1024 * 1024 }, (psErr, psOut) => {
      if (!psErr && psOut) {
        const v = psOut.trim().split(/[\r\n]+/)[0]?.trim();
        if (v) {
          _cachedOsDisplayVersion = v;
          return;
        }
      }
      // Final fallback: use os.release()
      _cachedOsDisplayVersion = os.release();
    });
  });

  return _cachedOsDisplayVersion;
}

/**
 * ℹ️ Get OS Edition / product name (e.g. "Windows 11 Home Single Language")
 * On Windows, fetches from WMI. On other platforms, returns platform type.
 */
let _cachedOsEdition = null;
function getOsEdition() {
  if (_cachedOsEdition) return _cachedOsEdition;
  const platform = os.platform();

  if (platform === 'win32') {
    const result = 'Detecting...';
    _cachedOsEdition = result;
    // Try WMIC first (simpler, fewer quoting issues)
    const wmicCmd = 'wmic os get Caption /value 2>nul';
    exec(wmicCmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (err, out) => {
      if (!err && out) {
        const match = out.match(/^Caption=(.+)$/im);
        if (match && match[1]) {
          _cachedOsEdition = match[1].trim();
          return;
        }
      }
      // Fallback: try PowerShell Get-CimInstance
      const psCmd = 'powershell -NoProfile -Command "&{$os=Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue;if($os){echo ($os.Caption + [char]124 + $os.Version)}else{echo Unknown}}" 2>nul';
      exec(psCmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (psErr, psOut) => {
        if (!psErr && psOut) {
          const line = psOut.trim().split(/[\r\n]+/)[0]?.trim();
          if (line && line !== 'Unknown') {
            const parts = line.split('|');
            _cachedOsEdition = parts[0]?.trim() || ('Windows ' + os.release());
            return;
          }
        }
        // Final fallback
        _cachedOsEdition = 'Windows ' + os.release();
      });
    });
    return _cachedOsEdition;
  } else if (platform === 'darwin') {
    _cachedOsEdition = 'macOS ' + os.release();
    return _cachedOsEdition;
  } else {
    _cachedOsEdition = 'Linux ' + os.release();
    return _cachedOsEdition;
  }
}/**
 * 🔑 Get Windows activation status from SoftwareLicensingProduct WMI
 * Returns 'Activated', 'Unlicensed', 'Grace Period', etc., or null on non-Windows
 */
let _cachedOsActivation = null;
function getOsActivationStatus() {
  const platform = os.platform();
  if (platform !== 'win32') return null;
  if (_cachedOsActivation) return _cachedOsActivation;

  const result = 'Detecting...';
  _cachedOsActivation = result;

  // Method 1: Try cscript + slmgr.vbs (very reliable on all Windows, though slightly slow)
  // slmgr /dli outputs licensing info; we check for 'Licensed' status
  const slmgrCmd = 'cscript //nologo "%windir%\\system32\\slmgr.vbs" /dli 2>nul';
  exec(slmgrCmd, { timeout: 10000, maxBuffer: 1024 * 1024 }, (err, out) => {
    if (!err && out) {
      if (/License Status:\s*Licensed/i.test(out)) {
        _cachedOsActivation = 'Activated';
        return;
      }
      const licenseMatch = out.match(/License Status:\s*(.+)$/im);
      if (licenseMatch && licenseMatch[1]) {
        const status = licenseMatch[1].trim();
        if (status) {
          _cachedOsActivation = status;
          return;
        }
      }
      // If slmgr ran but we couldn't parse, check for 'ERROR' or 'not activated'
      if (/not activated|error/i.test(out)) {
        _cachedOsActivation = 'Unlicensed';
        return;
      }
    }

    // Method 2: PowerShell SoftwareLicensingProduct (fallback)
    const psCmd = 'powershell -NoProfile -Command "$p=Get-CimInstance SoftwareLicensingProduct -ErrorAction SilentlyContinue | Where-Object { $_.ApplicationID -eq \'55c92734-d682-4d71-983e-d6ec3f16059f\' } | Sort-Object { [bool]$_.PartialProductKey } -Descending | Select -First 1; if($p){ @(\'Unlicensed\',\'Activated\',\'OOB Grace\',\'OOT Grace\',\'NonGenuine Grace\',\'Notification\',\'Extended Grace\')[$p.LicenseStatus] } else { echo \'Unlicensed\' }" 2>nul';
    exec(psCmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (psErr, psOut) => {
      if (!psErr && psOut) {
        const v = psOut.trim().split(/[\r\n]+/)[0]?.trim();
        if (v) {
          _cachedOsActivation = v;
          return;
        }
      }
      // Final fallback
      _cachedOsActivation = 'Unknown';
    });
  });

  return result;
}

// ──────────────────────────────────────────────
// GPU INFO
// ──────────────────────────────────────────────

/**
 * 🎮 Get GPU / graphics card information
 * Uses Electron's built-in GPU info API, with WMI fallback on Windows for full names
 */
let _cachedGpuInfo = null;
let _wmiGpuFetched = false;
function getGpuInfo() {
  if (_cachedGpuInfo) return _cachedGpuInfo;
  try {
    const result = { allGpus: 'Detecting...' };
    _cachedGpuInfo = result;

    // Try Electron's GPU info API first
    if (app.getGPUInfo) {
      app.getGPUInfo('complete').then(info => {
        // If WMI already fetched better names, don't overwrite
        if (_wmiGpuFetched && _cachedGpuInfo?.allGpus && _cachedGpuInfo.allGpus !== 'Detecting...') return;

        if (info && info.gpuDevice && info.gpuDevice.length > 0) {
          const gpuList = info.gpuDevice.map(gpu => {
            const memMB = gpu.dedicatedMemory ? Math.round(gpu.dedicatedMemory / 1024 / 1024) : 0;
            const memStr = memMB > 0 ? ` (${memMB >= 1024 ? (memMB / 1024).toFixed(0) + ' GB' : memMB + ' MB'})` : '';
            return (gpu.deviceName || ('GPU ' + gpu.deviceId)) + memStr;
          });
          _cachedGpuInfo = { allGpus: gpuList.join(', ') };
        } else if (info && info.auxAttributes) {
          const aux = info.auxAttributes;
          const name = aux.deviceName || aux.GPUDeviceName || 'Unknown GPU';
          _cachedGpuInfo = { allGpus: name };
        }
      }).catch(() => {
        if (!_wmiGpuFetched) fetchGpuViaWmi();
      });
    }

    // On Windows, also try WMI for complete GPU names (gets full model names from driver)
    if (os.platform() === 'win32' && !_wmiGpuFetched) {
      fetchGpuViaWmi();
    }

    return _cachedGpuInfo;
  } catch (e) {
    return { allGpus: 'Unknown' };
  }
}

/**
 * Fetch GPU info via WMI on Windows (more complete names than Electron's API)
 */
function fetchGpuViaWmi() {
  if (os.platform() !== 'win32') return;
  _wmiGpuFetched = true;
  const psCmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne $null } | ForEach-Object { $_.Name + \'|\' + [math]::Max($_.AdapterRAM, 0).ToString() }" 2>nul';
  exec(psCmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (err, out) => {
    if (!err && out && out.trim()) {
      const lines = out.trim().split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        const gpuList = lines.flatMap(line => {
          const parts = line.split('|');
          const name = parts[0]?.trim() || '';
          if (!name) return [];
          const ramBytes = parseInt(parts[1]) || 0;
          const memMB = ramBytes > 0 ? Math.round(ramBytes / 1024 / 1024) : 0;
          const memStr = memMB > 0 ? ` (${memMB >= 1024 ? (memMB / 1024).toFixed(0) + ' GB' : memMB + ' MB'})` : '';
          return [name + memStr];
        });

        if (gpuList.length > 0) {
          _cachedGpuInfo = { allGpus: gpuList.join(', ') };
        }
      }
    }
  });
}

// ──────────────────────────────────────────────
// STORAGE SUMMARY
// ──────────────────────────────────────────────

/**
 * 💾 Get storage summary (total across all drives)
 * Cached to avoid running disk commands too frequently
 */
let _cachedStorageSummary = { total: 0, used: 0, free: 0 };
let _storageSummaryFetched = false;
let _storageSummaryPending = false;

function getStorageSummary() {
  if (_storageSummaryFetched || _storageSummaryPending) return _cachedStorageSummary;
  _storageSummaryPending = true;

  // Trigger async fetch of disk info which will update the cache
  getDiskInfo().then(disks => {
    let total = 0, used = 0, free = 0;
    for (const d of disks) {
      if (d.total > 0) {
        total += d.total;
        used += d.used;
        free += d.free;
      }
    }
    _cachedStorageSummary = { total, used, free, storageFetched: true };
    _storageSummaryFetched = true;
  }).catch(() => {
    _cachedStorageSummary = { total: 0, used: 0, free: 0, storageFetched: true };
    _storageSummaryFetched = true;
  });

  return _cachedStorageSummary;
}

// ──────────────────────────────────────────────
// VIRTUAL MEMORY (Swap / Page File)
// ──────────────────────────────────────────────

/**
 * Get virtual memory (swap/page file) usage
 * Returns { total, used, free } in bytes, or null if unavailable
 */
function getVirtualMemory() {
  return new Promise((resolve) => {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: Get TotalVirtualMemorySize & FreeVirtualMemory from WMI
      // TotalVirtualMemorySize = physical RAM + page file total (in KB)
      const psCmd = 'powershell -NoProfile -Command "&{$vm=Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue;if($vm){echo ($vm.TotalVirtualMemorySize.ToString() + [char]44 + $vm.FreeVirtualMemory.ToString())}else{echo 0,0}}" 2>nul';
      exec(psCmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (err, out) => {
        if (!err && out) {
          const output = out.trim().split(/[\r\n]+/)[0]?.trim();
          if (output && !output.includes('0,0')) {
            const parts = output.split(',');
            const totalKB = parseInt(parts[0]);
            const freeKB = parseInt(parts[1]);
            if (totalKB && totalKB > 0) {
              const total = totalKB * 1024;
              const free = freeKB * 1024;
              const used = total - free;
              resolve({ total, used, free });
              return;
            }
          }
        }
        resolve(null);
      });
    } else if (platform === 'linux') {
      // Linux: Read swap from /proc/meminfo
      exec('grep -E "^(SwapTotal|SwapFree):" /proc/meminfo 2>/dev/null', { timeout: 3000, maxBuffer: 1024 * 1024 }, (err, out) => {
        if (!err && out) {
          const totalMatch = out.match(/SwapTotal:\s+(\d+)\s+kB/i);
          const freeMatch = out.match(/SwapFree:\s+(\d+)\s+kB/i);
          if (totalMatch && freeMatch) {
            const totalKB = parseInt(totalMatch[1]);
            const freeKB = parseInt(freeMatch[1]);
            if (totalKB > 0) {
              const total = totalKB * 1024;
              const free = freeKB * 1024;
              const used = total - free;
              resolve({ total, used, free });
              return;
            }
          }
        }
        resolve(null);
      });
    } else if (platform === 'darwin') {
      // macOS: Get swap usage from sysctl
      exec('sysctl vm.swapusage 2>/dev/null', { timeout: 3000, maxBuffer: 1024 * 1024 }, (err, out) => {
        if (!err && out) {
          const totalMatch = out.match(/total\s*=\s*([\d.]+)\s*([KMGT]?)/i);
          const usedMatch = out.match(/used\s*=\s*([\d.]+)\s*([KMGT]?)/i);
          if (totalMatch && usedMatch) {
            const parseSize = (val, unit) => {
              const num = parseFloat(val);
              const u = (unit || 'K').toUpperCase();
              if (u === 'K') return num * 1024;
              if (u === 'M') return num * 1024 * 1024;
              if (u === 'G') return num * 1024 * 1024 * 1024;
              if (u === 'T') return num * 1024 * 1024 * 1024 * 1024;
              return num;
            };
            const total = parseSize(totalMatch[1], totalMatch[2]);
            const used = parseSize(usedMatch[1], usedMatch[2]);
            const free = total - used;
            if (total > 0) {
              resolve({ total, used, free });
              return;
            }
          }
        }
        resolve(null);
      });
    } else {
      resolve(null);
    }
  });
}

// Only the surface consumed by ipc.js is exported; the rest (calculateCpuUsage,
// getUsableMemory, OS/GPU/storage helpers) are module-private internals of the
// getSystemInfo() snapshot builder.
module.exports = {
  getSystemInfo,
  getVirtualMemory,
};
