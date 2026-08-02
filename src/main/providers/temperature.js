/* ============================================================
   🌡️ PROVIDER — TEMPERATURE (Phase 2 split from main.js)
   CPU + GPU temperature detection (platform-specific).
   Phase 3: all shell calls go through command-service.js; the
   nested fallback chains are flattened with runCommand.
   ============================================================ */

'use strict';

const os = require('os');
const { runCommand, runCommandFile } = require('../command-service');

/** Parse a plain numeric temperature line, valid range 1-119 °C. */
function parseTempValue(stdout) {
  const v = parseFloat(String(stdout).trim());
  if (v > 0 && v < 120 && isFinite(v)) return Math.round(v);
  return null;
}

/** Windows CPU temperature: methods tried in order (CIM-first, Phase 3/8).
 *  ALL Windows probes run shell-free via runCommandFile (args array, no
 *  cmd.exe). The previous shell-wrapped form broke under cmd.exe quoting
 *  ("The system cannot find the path specified") on machines that DO expose
 *  a sensor, silently disabling CPU temp — fixed 2026-08-02.
 */
async function detectWindowsCpuTemp() {
  // Method 1 (BEST): PowerShell Get-Counter with Temperature counter.
  // Counter returns tenths of °C (e.g. 368 = 36.8°C), so we divide by 10.
  // The (*) wildcard matches the thermal zone instance (e.g. \_tz.thrm).
  // NOTE: the counter path uses DOUBLED backslashes — Get-Counter resolves
  // that form reliably when the script arrives as a plain argument.
  const psCmd1 = `try{$v=(Get-Counter '\\Thermal Zone Information(*)\\Temperature' -ErrorAction Stop).CounterSamples[0].CookedValue;$c=[math]::Round($v/10);if($c -gt 0 -and $c -lt 120){$c}else{-1}}catch{echo -1}`;
  const r1 = await runCommandFile('powershell', ['-NoProfile', '-Command', psCmd1], { timeout: 4000 });
  if (r1.ok && r1.stdout) {
    const v = parseTempValue(r1.stdout);
    if (v !== null) return v;
  }

  // Method 2: PowerShell Win32_PerfFormattedData (CIM, preferred over WMIC)
  const psCmd2 = `try{$t=Get-CimInstance -Namespace root/cimv2 -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction Stop|Select -First 1 -ExpandProperty Temperature;if($t -gt 0){if($t -lt 120){$t}else{[math]::Round(($t/10)-273.15)}}else{-1}}catch{echo -1}`;
  const r2 = await runCommandFile('powershell', ['-NoProfile', '-Command', psCmd2], { timeout: 3000 });
  if (r2.ok && r2.stdout) {
    const v = parseTempValue(r2.stdout);
    if (v !== null) return v;
  }

  // Method 3 (last resort): WMIC MSAcpi (deprecated; returns tenths of Kelvin).
  // Kept for older Windows where WMIC still ships; newer builds return
  // ENOENT (wmic removed in Win11 24H2+) and we fall through to -1.
  const r3 = await runCommandFile('wmic', ['/namespace:\\root\\wmi', 'PATH', 'MSAcpi_ThermalZoneTemperature', 'get', 'CurrentTemperature', '/format:csv'], { timeout: 3000 });
  if (r3.ok && r3.stdout) {
    const lines = r3.stdout.trim().split('\n').filter(l => l.trim());
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      const tempVal = parseInt(parts[1]?.replace(/"/g, '').trim());
      if (tempVal && tempVal > 0) {
        const celsius = Math.round((tempVal / 10) - 273.15);
        if (celsius > 0 && celsius < 120) return celsius;
      }
    }
  }

  return -1;
}

/**
 * Get CPU temperature (platform-specific)
 * Returns temperature in Celsius, or -1 if unavailable
 */
async function getCpuTemperature() {
  try {
    const platform = os.platform();

    if (platform === 'win32') {
      return await detectWindowsCpuTemp();
    }

    if (platform === 'darwin') {
      // macOS: no reliable CPU temperature source — report unavailable.
      return -1;
    }

    // Linux: Read from thermal zone sysfs
    const result = await runCommand(
      'cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -5',
      { timeout: 3000 }
    );
    if (!result.ok || !result.stdout) return -1;
    const lines = result.stdout.trim().split('\n').filter(l => l.trim());
    for (const line of lines) {
      const tempMilli = parseInt(line.trim());
      if (tempMilli && tempMilli > 0) {
        const celsius = Math.round(tempMilli / 1000);
        if (celsius > 0 && celsius < 120) return celsius;
      }
    }
    return -1;
  } catch (e) {
    return -1;
  }
}

/** Windows GPU temperature: nvidia-smi → PowerShell CIM. */
async function detectWindowsGpuTemp() {
  // Method 1: nvidia-smi (best for NVIDIA GPUs, very fast) — shell-free
  const r1 = await runCommandFile('nvidia-smi', ['--query-gpu=temperature.gpu', '--format=csv,noheader'], { timeout: 3000 });
  if (r1.ok && r1.stdout) {
    const v = parseInt(r1.stdout.trim());
    if (v && v > 0 && v < 120) return v;
  }

  // Method 2: PowerShell - query Win32_PerfFormattedData_GPU (AMD/Intel)
  // Note: This CIM class may not exist on all systems. Shell-free (same fix
  // as CPU temp: the old cmd.exe-wrapped form broke under quoting).
  const psCmd = `try{$g=Get-CimInstance -Namespace root\\cimv2\\drivers\\gpu -ClassName Win32_PerfFormattedData_GPU_Adapter -ErrorAction Stop;if($g -and $g.Length -gt 0){$maxTemp=0;foreach($adapter in $g){if($adapter.CurrentTemperature -gt $maxTemp){$maxTemp=$adapter.CurrentTemperature}};if($maxTemp -gt 0){echo $maxTemp}else{-1}}else{-1}}catch{echo -1}`;
  const r2 = await runCommandFile('powershell', ['-NoProfile', '-Command', psCmd], { timeout: 3000 });
  if (r2.ok && r2.stdout) {
    const v = parseInt(r2.stdout.trim());
    if (v && v > 0 && v < 120) return v;
  }
  return null;
}

/** Linux GPU temperature: nvidia-smi → lm-sensors. */
async function detectLinuxGpuTemp() {
  // nvidia-smi runs shell-free (fixed args, no shell needed)
  const r1 = await runCommandFile('nvidia-smi', ['--query-gpu=temperature.gpu', '--format=csv,noheader'], { timeout: 3000 });
  if (r1.ok && r1.stdout) {
    const v = parseInt(r1.stdout.trim());
    if (v && v > 0 && v < 120) return v;
  }

  // Try lm-sensors for AMD GPUs
  const sensCmd = 'sensors 2>/dev/null | grep -i "edge\\|junction\\|gpu" | head -1 | grep -oP "\\+\\d+\\.\\d+°C" | head -1';
  const r2 = await runCommand(sensCmd, { timeout: 3000 });
  if (r2.ok && r2.stdout) {
    const v = parseInt(r2.stdout.trim());
    if (v && v > 0 && v < 120) return v;
  }
  return null;
}

/**
 * Get GPU temperature (platform-specific)
 * Returns temperature in Celsius, or null if unavailable
 * Tries: nvidia-smi → PowerShell WMI → null
 */
async function getGpuTemperature() {
  try {
    const platform = os.platform();

    if (platform === 'win32') {
      return await detectWindowsGpuTemp();
    }

    if (platform === 'linux') {
      return await detectLinuxGpuTemp();
    }

    if (platform === 'darwin') {
      // macOS: Try system_profiler for GPU temperature (limited)
      const result = await runCommand(
        'system_profiler SPDisplaysDataType 2>/dev/null | grep -i "temperature" | head -1',
        { timeout: 3000 }
      );
      if (result.ok && result.stdout) {
        const match = result.stdout.match(/(\d+)/);
        if (match) {
          const v = parseInt(match[1]);
          if (v > 0 && v < 120) return v;
        }
      }
      return null;
    }

    return null;
  } catch (e) {
    return null;
  }
}

module.exports = { getCpuTemperature, getGpuTemperature };
