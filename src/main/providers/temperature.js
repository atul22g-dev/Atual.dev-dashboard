/* ============================================================
   🌡️ PROVIDER — TEMPERATURE (Phase 2 split from main.js)
   CPU + GPU temperature detection (platform-specific).
   ============================================================ */

'use strict';

const os = require('os');
const { exec } = require('child_process');

/**
 * Get CPU temperature (platform-specific)
 * Returns temperature in Celsius, or -1 if unavailable
 */
function getCpuTemperature() {
  return new Promise((resolve) => {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: Try multiple thermal detection methods

      // Method 1 (BEST): PowerShell Get-Counter with Temperature counter
      // Counter returns tenths of °C (e.g. 356 = 35.6°C), so we divide by 10
      // The (*) wildcard matches the thermal zone instance (e.g. \_tz.thrm)
      const psCmd1 = `powershell -NoProfile -Command "try{$v=(Get-Counter '\\Thermal Zone Information(*)\\Temperature' -ErrorAction Stop).CounterSamples[0].CookedValue;$c=[math]::Round($v/10);if($c -gt 0 -and $c -lt 120){$c}else{-1}}catch{echo -1}" 2>nul`;

      exec(psCmd1, { timeout: 4000, maxBuffer: 1024 * 1024 }, (err1, out1) => {
        if (!err1 && out1) {
          try {
            const v = parseFloat(out1.trim());
            if (v > 0 && v < 120 && isFinite(v)) { resolve(Math.round(v)); return; }
          } catch (e) { /* fall through */ }
        }

        // Method 2: WMIC MSAcpi (returns tenths of Kelvin → convert to Celsius)
        const wmicCmd = 'wmic /namespace:\\\\root\\wmi PATH MSAcpi_ThermalZoneTemperature get CurrentTemperature /format:csv 2>nul';
        exec(wmicCmd, { timeout: 3000, maxBuffer: 1024 * 1024 }, (wmicErr, wmicOut) => {
          if (!wmicErr && wmicOut) {
            try {
              const lines = wmicOut.trim().split('\n').filter(l => l.trim());
              for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                const tempVal = parseInt(parts[1]?.replace(/"/g, '').trim());
                if (tempVal && tempVal > 0) {
                  const celsius = Math.round((tempVal / 10) - 273.15);
                  if (celsius > 0 && celsius < 120) { resolve(celsius); return; }
                }
              }
            } catch (e) { /* fall through */ }
          }

          // Method 3: PowerShell Win32_PerfFormattedData (fallback)
          const psCmd3 = 'powershell -NoProfile -Command "try{$t=Get-CimInstance -Namespace root/cimv2 -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction Stop|Select -First 1 -ExpandProperty Temperature;if($t -gt 0){if($t -lt 120){$t}else{[math]::Round(($t/10)-273.15)}}else{-1}}catch{echo -1}" 2>nul';
          exec(psCmd3, { timeout: 3000, maxBuffer: 1024 * 1024 }, (err3, out3) => {
            if (!err3 && out3) {
              try {
                const v = parseFloat(out3.trim());
                if (v > 0 && v < 120 && isFinite(v)) { resolve(Math.round(v)); return; }
              } catch (e) { /* fall through */ }
            }
            resolve(-1);
          });
        });
      });
    } else if (platform === 'darwin') {
      // macOS: pmset doesn't give actual temp easily
      exec("pmset -g therm 2>/dev/null", { timeout: 3000, maxBuffer: 1024 * 1024 }, () => {
        resolve(-1);
      });
    } else {
      // Linux: Read from thermal zone sysfs
      exec('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -5',
        { timeout: 3000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
          if (error || !stdout) { resolve(-1); return; }
          try {
            const lines = stdout.trim().split('\n').filter(l => l.trim());
            for (const line of lines) {
              const tempMilli = parseInt(line.trim());
              if (tempMilli && tempMilli > 0) {
                const celsius = Math.round(tempMilli / 1000);
                if (celsius > 0 && celsius < 120) {
                  resolve(celsius);
                  return;
                }
              }
            }
            resolve(-1);
          } catch (e) { resolve(-1); }
        }
      );
    }
  });
}

/**
 * Get GPU temperature (platform-specific)
 * Returns temperature in Celsius, or null if unavailable
 * Tries: nvidia-smi → PowerShell WMI → null
 */
function getGpuTemperature() {
  return new Promise((resolve) => {
    const platform = os.platform();

    if (platform === 'win32') {
      // Method 1: nvidia-smi (best for NVIDIA GPUs, very fast)
      const nvidiaCmd = 'nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader 2>nul';
      exec(nvidiaCmd, { timeout: 3000, maxBuffer: 1024 * 1024 }, (err1, out1) => {
        if (!err1 && out1) {
          const v = parseInt(out1.trim());
          if (v && v > 0 && v < 120) { resolve(v); return; }
        }

        // Method 2: PowerShell - query Win32_PerfFormattedData_GPU (AMD/Intel)
        // Note: This WMI class may not exist on all systems
        const psCmd = 'powershell -NoProfile -Command "try{$g=Get-CimInstance -Namespace root\\cimv2\\drivers\\gpu -ClassName Win32_PerfFormattedData_GPU_Adapter -ErrorAction Stop;if($g -and $g.Length -gt 0){$maxTemp=0;foreach($adapter in $g){if($adapter.CurrentTemperature -gt $maxTemp){$maxTemp=$adapter.CurrentTemperature}};if($maxTemp -gt 0){echo $maxTemp}else{-1}}else{-1}}catch{echo -1}" 2>nul';
        exec(psCmd, { timeout: 3000, maxBuffer: 1024 * 1024 }, (psErr, psOut) => {
          if (!psErr && psOut) {
            const v = parseInt(psOut.trim());
            if (v && v > 0 && v < 120) { resolve(v); return; }
          }
          resolve(null);
        });
      });
    } else if (platform === 'linux') {
      // Linux: Try nvidia-smi, then sensors (AMD), then fallback
      const nvidiaCmd = 'nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader 2>/dev/null';
      exec(nvidiaCmd, { timeout: 3000, maxBuffer: 1024 * 1024 }, (err1, out1) => {
        if (!err1 && out1) {
          const v = parseInt(out1.trim());
          if (v && v > 0 && v < 120) { resolve(v); return; }
        }
        // Try lm-sensors for AMD GPUs
        exec('sensors 2>/dev/null | grep -i "edge\\|junction\\|gpu" | head -1 | grep -oP "\\+\\d+\\.\\d+°C" | head -1',
          { timeout: 3000, maxBuffer: 1024 * 1024 }, (sensErr, sensOut) => {
            if (!sensErr && sensOut) {
              const v = parseInt(sensOut.trim());
              if (v && v > 0 && v < 120) { resolve(v); return; }
            }
            resolve(null);
          }
        );
      });
    } else if (platform === 'darwin') {
      // macOS: Try system_profiler for GPU temperature (limited)
      exec('system_profiler SPDisplaysDataType 2>/dev/null | grep -i "temperature" | head -1',
        { timeout: 3000, maxBuffer: 1024 * 1024 }, (err, out) => {
          if (!err && out) {
            const match = out.match(/(\d+)/);
            if (match) { const v = parseInt(match[1]); if (v > 0 && v < 120) { resolve(v); return; } }
          }
          resolve(null);
        }
      );
    } else {
      resolve(null);
    }
  });
}

module.exports = { getCpuTemperature, getGpuTemperature };
