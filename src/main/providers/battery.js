/* ============================================================
   🔋 PROVIDER — BATTERY (Phase 2 split from main.js)
   Power-source events + battery level/status + detailed specs.
   ============================================================ */

'use strict';

const os = require('os');
const { exec } = require('child_process');
const { app, powerMonitor } = require('electron');

let isOnAC = true; // Assume plugged in until we know otherwise

// Listen for power source changes
// 'on-ac' = plugged into wall power
// 'on-battery' = running on battery
if (powerMonitor) {
  app.whenReady().then(() => {
    try {
      powerMonitor.on('on-ac', () => { isOnAC = true; });
      powerMonitor.on('on-battery', () => { isOnAC = false; });
    } catch (e) { /* power events not supported */ }
  });
}

/**
 * 🔋 Get battery information
 * Uses Electron's powerMonitor API (available on laptops)
 * If no battery found, returns hasBattery: false
 */
function getBatteryInfo() {
  return new Promise((resolve) => {
    try {
      let level = null;

      // Try Electron's powerMonitor API first (works on most modern systems)
      if (powerMonitor && typeof powerMonitor.getSystemBatteryLevel === 'function') {
        level = powerMonitor.getSystemBatteryLevel();
      }

      // If Electron API gave us a valid level (0-1), use it directly
      if (level !== null && level !== undefined && level >= 0 && level <= 1) {
        resolve({
          hasBattery: true,
          level: level,
          charging: !isOnAC,
          acConnected: isOnAC,
        });
        return;
      }

      // Fallback: try platform-specific commands
      const platform = os.platform();

      if (platform === 'win32') {
        // === WINDOWS BATTERY DETECTION ===
        // Strategy (tried in order):
        //   1. PowerShell Get-CimInstance (modern, simplest syntax)
        //   2. PowerShell Get-WmiObject (older API fallback)
        //   3. WMIC /value query (last-resort on systems where WMIC still works)

        // Helper to parse battery result from comma-separated "chargePct,status"
        function resolveBattery(output) {
          if (!output || output === 'NO_BATTERY') return null;
          const parts = output.split(',');
          const chargePct = parseInt(parts[0]);
          const batteryStatus = parseInt(parts[1]) || 0;
          if (isNaN(chargePct) || chargePct < 0 || chargePct > 100) return null;
          const isCharging = [2, 6, 7, 8].includes(batteryStatus);
          const onAC = batteryStatus !== 1;
          return { hasBattery: true, level: chargePct / 100, charging: isCharging, acConnected: onAC };
        }

        // --- Method 1: PowerShell Get-CimInstance (simplified, no [char]44) ---
        const psCmd = 'powershell -NoProfile -Command "try{$b=Get-CimInstance Win32_Battery -ErrorAction Stop;echo ($b.EstimatedChargeRemaining,$b.BatteryStatus -join \',\')}catch{echo NO_BATTERY}" 2>nul';

        exec(psCmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (psErr, psOut) => {
          if (!psErr && psOut) {
            const result1 = resolveBattery(psOut.trim().split(/[\r\n]+/)[0]?.trim());
            if (result1) { resolve(result1); return; }
          }

          // --- Method 2: PowerShell Get-WmiObject (older API fallback) ---
          const psCmd2 = 'powershell -NoProfile -Command "try{$b=Get-WmiObject Win32_Battery -ErrorAction Stop;echo ($b.EstimatedChargeRemaining,$b.BatteryStatus -join \',\')}catch{echo NO_BATTERY}" 2>nul';
          exec(psCmd2, { timeout: 5000, maxBuffer: 1024 * 1024 }, (psErr2, psOut2) => {
            if (!psErr2 && psOut2) {
              const result2 = resolveBattery(psOut2.trim().split(/[\r\n]+/)[0]?.trim());
              if (result2) { resolve(result2); return; }
            }

            // --- Method 3: WMIC (deprecated but still works on most Windows) ---
            const wmicCmd = 'wmic path Win32_Battery get EstimatedChargeRemaining,BatteryStatus /value 2>nul';
            exec(wmicCmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (wmicErr, wmicOut) => {
              if (!wmicErr && wmicOut) {
                const chargeMatch = wmicOut.match(/EstimatedChargeRemaining=(\d+)/i);
                const statusMatch = wmicOut.match(/BatteryStatus=(\d+)/i);
                if (chargeMatch) {
                  const chargePct = parseInt(chargeMatch[1]);
                  const batteryStatus = statusMatch ? parseInt(statusMatch[1]) : 0;
                  const isCharging = [2, 6, 7, 8].includes(batteryStatus);
                  const onAC = batteryStatus !== 1;
                  resolve({ hasBattery: true, level: chargePct / 100, charging: isCharging, acConnected: onAC });
                  return;
                }
              }

              console.error('[Battery] All 3 Windows detection methods failed');
              resolve({ hasBattery: false, level: 0, charging: false, acConnected: true });
            });
          });
        });
      } else if (platform === 'darwin') {
        // macOS: Try pmset for battery info
        exec('pmset -g batt 2>/dev/null',
          { timeout: 3000, maxBuffer: 1024 * 1024 },
          (error, stdout) => {
            if (!error && stdout) {
              try {
                const match = stdout.match(/(\d+)%/);
                if (match) {
                  const pct = parseInt(match[1]) / 100;
                  const isCharging = stdout.includes('charging') || stdout.includes('AC');
                  const onAC = stdout.includes('AC');
                  resolve({
                    hasBattery: true,  // pmset matched = battery exists
                    level: pct,
                    charging: isCharging,
                    acConnected: onAC,
                  });
                  return;
                }
              } catch (e) { /* fall through */ }
            }
            resolve({ hasBattery: false, level: 0, charging: false, acConnected: true });
          }
        );
      } else if (platform === 'linux') {
        // Linux: Try reading power supply info from sysfs
        exec('cat /sys/class/power_supply/BAT0/capacity 2>/dev/null || cat /sys/class/power_supply/BAT1/capacity 2>/dev/null',
          { timeout: 3000, maxBuffer: 1024 * 1024 },
          (error, stdout) => {
            if (!error && stdout) {
              try {
                const pct = parseInt(stdout.trim());
                if (!isNaN(pct) && pct >= 0) {
                  // Check charging status
                  exec('cat /sys/class/power_supply/BAT0/status 2>/dev/null || cat /sys/class/power_supply/BAT1/status 2>/dev/null',
                    { timeout: 2000, maxBuffer: 1024 * 1024 },
                    (statusErr, statusOut) => {
                      const isCharging = statusOut && statusOut.trim() === 'Charging';
                      const onAC = isCharging || (statusOut && statusOut.trim() === 'Full');
                      resolve({
                        hasBattery: true,
                        level: pct / 100,
                        charging: isCharging,
                        acConnected: onAC,
                      });
                    }
                  );
                  return;
                }
              } catch (e) { /* fall through */ }
            }
            resolve({ hasBattery: false, level: 0, charging: false, acConnected: true });
          }
        );
      } else {
        // Unknown platform — can't detect battery
        resolve({ hasBattery: false, level: 0, charging: false, acConnected: true });
      }
    } catch (e) {
      // All methods failed — return safe defaults
      resolve({ hasBattery: false, level: 0, charging: false, acConnected: true });
    }
  });
}

/**
 * Get detailed battery specifications (design capacity, cycle count, etc.)
 * Fetched once on page load since these don't change
 */
function getBatteryDetails() {
  return new Promise((resolve) => {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: Use WMIC /value to get ALL properties (easy to parse key=value pairs)
      const wmicCmd = 'wmic path Win32_Battery get /value 2>nul';

      exec(wmicCmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error || !stdout) {
          // Try PowerShell as fallback
          const psCmd = 'powershell -NoProfile -Command "&{$bat=Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue;if($bat){echo (\"DesignCapacity=\" + $bat.DesignCapacity + [char]124 + \"FullChargeCapacity=\" + $bat.FullChargeCapacity + [char]124 + \"CycleCount=\" + $bat.CycleCount + [char]124 + \"Voltage=\" + $bat.Voltage + [char]124 + \"Chemistry=\" + $bat.Chemistry + [char]124 + \"Manufacturer=\" + $bat.Manufacturer + [char]124 + \"SerialNumber=\" + $bat.SerialNumber + [char]124 + \"Name=\" + $bat.Name + [char]124 + \"DesignVoltage=\" + $bat.DesignVoltage + [char]124 + \"EstimatedRunTime=\" + $bat.EstimatedRunTime + [char]124 + \"SmartBatteryVersion=\" + $bat.SmartBatteryVersion)}else{echo NO_BATTERY}}" 2>nul';

          exec(psCmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (psErr, psOut) => {
            if (!psErr && psOut) {
              const output = psOut.trim().split(/[\r\n]+/)[0]?.trim();
              if (output && output !== 'NO_BATTERY') {
                const details = {};
                output.split('|').forEach(pair => {
                  const [key, ...vals] = pair.split('=');
                  if (key && vals.length > 0) {
                    details[key.trim()] = vals.join('=').trim();
                  }
                });
                resolve(details);
                return;
              }
            }
            resolve({});
          });
          return;
        }

        // Parse WMIC /value output (key=value pairs, one per line)
        const details = {};
        const lines = stdout.split(/[\r\n]+/).filter(l => l.trim());
        for (const line of lines) {
          const match = line.match(/^([\w\s]+?)=(.+)$/);
          if (match) {
            details[match[1].trim()] = match[2].trim();
          }
        }
        resolve(details);
      });
    } else if (platform === 'darwin') {
      // macOS: Use ioreg to get detailed battery info
      exec('ioreg -r -c AppleSmartBattery 2>/dev/null', { timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error || !stdout) { resolve({}); return; }
        const details = {};
        const lines = stdout.split(/[\r\n]+/);
        // ioreg outputs key-value pairs like "  \"DesignCapacity\" = 5000"
        const regex = /"([\w]+)"\s*=\s*(.+)$/;
        for (const line of lines) {
          const match = line.match(regex);
          if (match) {
            let val = match[2].trim();
            // Remove trailing comma if present
            if (val.endsWith(',')) val = val.slice(0, -1);
            // Remove quotes if present
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            details[match[1]] = val;
          }
        }
        resolve(details);
      });
    } else if (platform === 'linux') {
      // Linux: Read battery sysfs files
      const batterySys = '/sys/class/power_supply/BAT0';
      const fields = ['manufacturer', 'model_name', 'serial_number', 'technology',
        'charge_full_design', 'charge_full', 'cycle_count', 'voltage_now',
        'voltage_min_design', 'energy_full_design', 'energy_full'];

      let pending = fields.length;
      const details = {};

      if (pending === 0) { resolve({}); return; }

      for (const field of fields) {
        exec(`cat ${batterySys}/${field} 2>/dev/null`, { timeout: 2000, maxBuffer: 1024 * 1024 }, (err, out) => {
          if (!err && out) {
            details[field] = out.trim();
          }
          pending--;
          if (pending === 0) resolve(details);
        });
      }
    } else {
      resolve({});
    }
  });
}

module.exports = { getBatteryInfo, getBatteryDetails };
