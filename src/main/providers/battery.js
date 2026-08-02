/* ============================================================
   🔋 PROVIDER — BATTERY (Phase 2 split from main.js)
   Power-source events + battery level/status + detailed specs.
   Phase 3: all shell calls go through command-service.js; the
   Windows fallback chains are flattened with runCommandUntilSuccess.
   ============================================================ */

'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { app, powerMonitor } = require('electron');
const { runCommand, runCommandFile, runCommandUntilSuccess } = require('../command-service');

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

/** Default "no battery" result used when every detection method fails. */
function noBattery() {
  return { hasBattery: false, level: 0, charging: false, acConnected: true };
}

/** Parse a comma-separated "chargePct,status" battery probe line. */
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

/**
 * Windows battery detection (tried in order):
 *   1. PowerShell Get-CimInstance (modern, simplest syntax)
 *   2. PowerShell Get-WmiObject (older API fallback)
 *   3. WMIC /value query (last-resort on systems where WMIC still works)
 */
async function detectWindowsBattery() {
  const psCmd = 'powershell -NoProfile -Command "try{$b=Get-CimInstance Win32_Battery -ErrorAction Stop;echo ($b.EstimatedChargeRemaining,$b.BatteryStatus -join \',\')}catch{echo NO_BATTERY}" 2>nul';
  const psCmd2 = 'powershell -NoProfile -Command "try{$b=Get-WmiObject Win32_Battery -ErrorAction Stop;echo ($b.EstimatedChargeRemaining,$b.BatteryStatus -join \',\')}catch{echo NO_BATTERY}" 2>nul';
  const wmicCmd = 'wmic path Win32_Battery get EstimatedChargeRemaining,BatteryStatus /value 2>nul';

  // Method 1 + 2 share the same comma-separated parser.
  const probeResult = await runCommandUntilSuccess([psCmd, psCmd2], { timeout: 5000 });
  if (probeResult.ok) {
    const parsed = resolveBattery(probeResult.stdout.trim().split(/[\r\n]+/)[0]?.trim());
    if (parsed) return parsed;
  }

  // Method 3: WMIC /value (different output format). Deliberately via
  // runCommand (not runCommandFile) — the fallback test depends on the
  // runCommand dispatch, and WMIC is a documented last-resort here.
  const wmicResult = await runCommand(wmicCmd, { timeout: 5000 });
  if (wmicResult.ok && wmicResult.stdout) {
    const chargeMatch = wmicResult.stdout.match(/EstimatedChargeRemaining=(\d+)/i);
    const statusMatch = wmicResult.stdout.match(/BatteryStatus=(\d+)/i);
    if (chargeMatch) {
      const chargePct = parseInt(chargeMatch[1]);
      const batteryStatus = statusMatch ? parseInt(statusMatch[1]) : 0;
      const isCharging = [2, 6, 7, 8].includes(batteryStatus);
      const onAC = batteryStatus !== 1;
      return { hasBattery: true, level: chargePct / 100, charging: isCharging, acConnected: onAC };
    }
  }

  console.error('[Battery] All 3 Windows detection methods failed');
  return noBattery();
}

/** macOS battery detection via pmset (shell-free fixed args). */
async function detectMacBattery() {
  const result = await runCommandFile('pmset', ['-g', 'batt'], { timeout: 3000 });
  if (result.ok && result.stdout) {
    const match = result.stdout.match(/(\d+)%/);
    if (match) {
      const pct = parseInt(match[1]) / 100;
      const isCharging = result.stdout.includes('charging') || result.stdout.includes('AC');
      const onAC = result.stdout.includes('AC');
      return {
        hasBattery: true,  // pmset matched = battery exists
        level: pct,
        charging: isCharging,
        acConnected: onAC,
      };
    }
  }
  return noBattery();
}

/** Linux battery detection via sysfs. */
async function detectLinuxBattery() {
  const capResult = await runCommand(
    'cat /sys/class/power_supply/BAT0/capacity 2>/dev/null || cat /sys/class/power_supply/BAT1/capacity 2>/dev/null',
    { timeout: 3000 }
  );
  if (capResult.ok && capResult.stdout) {
    const pct = parseInt(capResult.stdout.trim());
    if (!isNaN(pct) && pct >= 0) {
      const statusResult = await runCommand(
        'cat /sys/class/power_supply/BAT0/status 2>/dev/null || cat /sys/class/power_supply/BAT1/status 2>/dev/null',
        { timeout: 2000 }
      );
      const status = statusResult.ok ? statusResult.stdout.trim() : '';
      const isCharging = status === 'Charging';
      const onAC = isCharging || status === 'Full';
      return {
        hasBattery: true,
        level: pct / 100,
        charging: isCharging,
        acConnected: onAC,
      };
    }
  }
  return noBattery();
}

/**
 * 🔋 Get battery information
 * Uses Electron's powerMonitor API (available on laptops)
 * If no battery found, returns hasBattery: false
 */
async function getBatteryInfo() {
  try {
    let level = null;

    // Try Electron's powerMonitor API first (works on most modern systems)
    if (powerMonitor && typeof powerMonitor.getSystemBatteryLevel === 'function') {
      level = powerMonitor.getSystemBatteryLevel();
    }

    // If Electron API gave us a valid level (0-1), use it directly
    if (level !== null && level !== undefined && level >= 0 && level <= 1) {
      return {
        hasBattery: true,
        level: level,
        charging: !isOnAC,
        acConnected: isOnAC,
      };
    }

    // Fallback: try platform-specific commands
    const platform = os.platform();
    if (platform === 'win32') return await detectWindowsBattery();
    if (platform === 'darwin') return await detectMacBattery();
    if (platform === 'linux') return await detectLinuxBattery();
    return noBattery(); // Unknown platform — can't detect battery
  } catch (e) {
    // All methods failed — return safe defaults
    return noBattery();
  }
}

/** Parse WMIC /value output (key=value pairs, one per line). */
function parseWmicKeyValues(stdout) {
  const details = {};
  const lines = String(stdout).split(/[\r\n]+/).filter(l => l.trim());
  for (const line of lines) {
    const match = line.match(/^([\w\s]+?)=(.+)$/);
    if (match) {
      details[match[1].trim()] = match[2].trim();
    }
  }
  return details;
}

/** Parse the PowerShell pipe-separated battery spec string. */
function parsePsBatteryDetails(output) {
  const details = {};
  output.split('|').forEach(pair => {
    const [key, ...vals] = pair.split('=');
    if (key && vals.length > 0) {
      details[key.trim()] = vals.join('=').trim();
    }
  });
  return details;
}

/**
 * Windows detailed battery specs: CIM-first (Phase 3/8), powercfg capacity
 * fallback, WMIC last resort. All probes run shell-free via runCommandFile —
 * the old shell-wrapped PowerShell form broke under cmd.exe quoting (same
 * defect as the CPU temp probes; fixed 2026-08-02), so details never loaded.
 */
async function getWindowsBatteryDetails() {
  // Method 1 (primary): PowerShell CIM — design/full-charge capacity, cycle
  // count, voltage, runtime. Some machines (e.g. ASUS A32-K55) report the
  // capacities as null through WMI even though the data exists elsewhere.
  const psScript = `&{$bat=Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue;if($bat){echo ('DesignCapacity=' + $bat.DesignCapacity + [char]124 + 'FullChargeCapacity=' + $bat.FullChargeCapacity + [char]124 + 'CycleCount=' + $bat.CycleCount + [char]124 + 'Voltage=' + $bat.Voltage + [char]124 + 'Chemistry=' + $bat.Chemistry + [char]124 + 'Manufacturer=' + $bat.Manufacturer + [char]124 + 'SerialNumber=' + $bat.SerialNumber + [char]124 + 'Name=' + $bat.Name + [char]124 + 'DesignVoltage=' + $bat.DesignVoltage + [char]124 + 'EstimatedRunTime=' + $bat.EstimatedRunTime + [char]124 + 'SmartBatteryVersion=' + $bat.SmartBatteryVersion)}else{echo NO_BATTERY}}`;
  const psResult = await runCommandFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 5000 });
  const details = {};
  if (psResult.ok && psResult.stdout) {
    const output = psResult.stdout.trim().split(/[\r\n]+/)[0]?.trim();
    if (output && output !== 'NO_BATTERY') {
      Object.assign(details, parsePsBatteryDetails(output));
    }
  }

  // Method 2 (capacity fallback): powercfg /batteryreport — its battery-info
  // section always lists DESIGN CAPACITY + FULL CHARGE CAPACITY (mWh), even on
  // machines where Win32_Battery exposes them as null. Generate, read, parse.
  // The report is read with fs (not `cat`): cat doesn't ship on stock Windows,
  // so a shell call would silently defeat this fallback in the packaged app.
  if (!details.DesignCapacity || !details.FullChargeCapacity) {
    const reportPath = path.join(os.tmpdir(), `atual-battery-report-${process.pid}.html`);
    const gen = await runCommandFile('powercfg', ['/batteryreport', '/output', reportPath], { timeout: 8000 });
    if (gen.ok) {
      try {
        const html = fs.readFileSync(reportPath, 'utf8');
        // Strip HTML tags first — the labels and values sit in separate <td>
        // cells, so the raw markup would defeat a label→value regex.
        const text = html.replace(/<[^>]*>/g, ' ');
        const design = text.match(/DESIGN\s+CAPACITY\s*([\d,]+)\s*mWh/i);
        const full = text.match(/FULL\s+CHARGE\s+CAPACITY\s*([\d,]+)\s*mWh/i);
        if (design && !details.DesignCapacity) details.DesignCapacity = design[1].replace(/,/g, '');
        if (full && !details.FullChargeCapacity) details.FullChargeCapacity = full[1].replace(/,/g, '');
      } catch (e) { /* unreadable report → fall through */ }
      try { fs.unlinkSync(reportPath); } catch (e) { /* temp report cleanup is best-effort */ }
    }
  }

  // Method 3 (last resort): WMIC /value (deprecated — kept for older systems).
  // Gated on missing capacities (not empty details) so partial CIM results —
  // e.g. only EstimatedRunTime — still get a WMIC capacity attempt.
  if (!details.DesignCapacity || !details.FullChargeCapacity) {
    const wmicResult = await runCommandFile('wmic', ['path', 'Win32_Battery', 'get', '/value'], { timeout: 5000 });
    if (wmicResult.ok && wmicResult.stdout) {
      // Merge, don't replace — preserves any partial CIM fields (e.g. runtime).
      Object.assign(details, parseWmicKeyValues(wmicResult.stdout));
    }
  }
  return details;
}

/** macOS detailed battery specs via ioreg (shell-free fixed args). */
async function getMacBatteryDetails() {
  const result = await runCommandFile('ioreg', ['-r', '-c', 'AppleSmartBattery'], { timeout: 5000 });
  if (!result.ok || !result.stdout) return {};
  const details = {};
  const regex = /"([\w]+)"\s*=\s*(.+)$/;
  const lines = result.stdout.split(/[\r\n]+/);
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
  return details;
}

/** Linux detailed battery specs from sysfs (parallel reads, shell-free). */
async function getLinuxBatteryDetails() {
  const batterySys = '/sys/class/power_supply/BAT0';
  const fields = ['manufacturer', 'model_name', 'serial_number', 'technology',
    'charge_full_design', 'charge_full', 'cycle_count', 'voltage_now',
    'voltage_min_design', 'energy_full_design', 'energy_full'];

  const results = await Promise.all(
    fields.map(field =>
      runCommandFile('cat', [path.join(batterySys, field)], { timeout: 2000 })
    )
  );

  const details = {};
  results.forEach((result, i) => {
    if (result.ok && result.stdout) {
      details[fields[i]] = result.stdout.trim();
    }
  });
  return details;
}

/**
 * Get detailed battery specifications (design capacity, cycle count, etc.)
 * Fetched once on page load since these don't change
 */
async function getBatteryDetails() {
  try {
    const platform = os.platform();
    if (platform === 'win32') return await getWindowsBatteryDetails();
    if (platform === 'darwin') return await getMacBatteryDetails();
    if (platform === 'linux') return await getLinuxBatteryDetails();
    return {};
  } catch (e) {
    return {};
  }
}

module.exports = { getBatteryInfo, getBatteryDetails };
