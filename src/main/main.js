/* ============================================================
   📋 MAIN PROCESS - Electron App Entry Point
   ============================================================
   
   This file runs in the "main process" (Node.js environment).
   It creates the app window, gathers system data, and sends
   that data to the "renderer process" (webpage) via IPC.
   
   🔑 KEY CONCEPTS FOR BEGINNERS:
   - Electron has 2 processes: Main (Node.js) & Renderer (webpage)
   - IPC = Inter-Process Communication (data bridge)
   - ipcMain.handle() = receives requests from the renderer
   - contextBridge = securely exposes data to the renderer
   ============================================================ */

// 📦 Import required modules
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');             // Operating system info (CPU, memory, etc.)
const { exec } = require('child_process'); // Run system commands (disk, processes)
const https = require('https');       // For npm registry API calls

// ──────────────────────────────────────────────
// 🪟 WINDOW SETUP
// ──────────────────────────────────────────────

let mainWindow; // The main application window

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,        // Window width in pixels
    height: 800,        // Window height in pixels
    minWidth: 900,      // Minimum resize width
    minHeight: 600,     // Minimum resize height
    frame: false,       // Remove OS window frame (we draw custom title bar)
    titleBarStyle: 'hidden',
    title: 'Atual.dev Dashboard',
    backgroundColor: '#0a0a0f', // Background color while loading

    // 🔒 Security settings (important!)
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'), // Bridge file
      nodeIntegration: false,  // 🚫 No Node.js in webpage (security)
      contextIsolation: true,  // ✅ Keep webpage separate from Electron
      sandbox: true,           // 🛡️ Extra security layer
    },
  });

  // 📄 Load the dashboard HTML file
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // 🔧 Open DevTools when running with --dev flag
  // Usage: npm run dev
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Clean up when window closes
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ──────────────────────────────────────────────
// 💻 SYSTEM DATA PROVIDERS
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
    hostname: os.hostname(),      // Computer name
    uptime: os.uptime(),          // System running time (seconds)
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    v8Version: process.versions.v8,
    osRelease: os.release(),
    osType: os.type(),
    loadAvg: [Math.round(_cpuLoadAvg1 * 100) / 100, Math.round(_cpuLoadAvg5 * 100) / 100, Math.round(_cpuLoadAvg15 * 100) / 100],       // Smoothed CPU load averages (works on ALL platforms)
    networkInterfaces,            // External IPv4 interfaces only
    allInterfaces,                // All interfaces (for Network section)
    homedir: os.homedir(),
    tmpdir: os.tmpdir(),
  };
}

/**
 * 💾 Get disk/drive information
 * Runs a system command based on your operating system
 * Returns an array of disk objects with: mount, total, used, free
 */
function getDiskInfo() {
  return new Promise((resolve) => {
    const platform = os.platform();

    // 🖥️ Platform-specific commands
    // Windows: Use WMIC to list drives
    // macOS/Linux: Use 'df' to show disk free space
    let cmd;
    if (platform === 'win32') {
      cmd = 'wmic logicaldisk get caption,size,freespace /format:csv';
    } else if (platform === 'darwin') {
      cmd = 'df -k | tail -n +2';
    } else {
      cmd = 'df -B1 --output=source,size,used,avail,target 2>/dev/null | tail -n +2';
    }

    // ⚙️ Execute the command (with timeout & maxBuffer for safety)
    exec(cmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) { resolve([]); return; }

      const disks = [];
      try {
        if (platform === 'win32') {
          // Parse WMIC CSV output
          const lines = stdout.trim().split('\n').filter(l => l.trim());
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length >= 3) {
              const caption = parts[1]?.replace(/"/g, '').trim() || '';
              const size = parseInt(parts[2]?.replace(/"/g, '').trim()) || 0;
              const free = parseInt(parts[3]?.replace(/"/g, '').trim()) || 0;
              if (caption && size > 0) {
                disks.push({ mount: caption, total: size, free, used: size - free });
              }
            }
          }
        } else {
          // Parse df output (macOS/Linux)
          const lines = stdout.trim().split('\n').filter(l => l.trim());
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 5) {
              const total = parseInt(parts[1]) * 1024;
              const used = parseInt(parts[2]) * 1024;
              const free = parseInt(parts[3]) * 1024;
              const mount = platform === 'darwin' ? parts[parts.length - 1] : parts[4];
              if (mount && total > 0) {
                disks.push({ mount, total, used, free });
              }
            }
          }
        }
      } catch (e) { /* parsing failed - return whatever we have */ }
      resolve(disks);
    });
  });
}

/**
 * 🔋 Get battery information
 * Uses Electron's powerMonitor API (available on laptops)
 * If no battery found, returns hasBattery: false
 */
let isOnAC = true; // Assume plugged in until we know otherwise

// Listen for power source changes
// 'on-ac' = plugged into wall power
// 'on-battery' = running on battery
const powerMonitor = (() => {
  try {
    return require('electron').powerMonitor;
  } catch (e) {
    return null;
  }
})();

if (powerMonitor) {
  app.whenReady().then(() => {
    try {
      powerMonitor.on('on-ac', () => { isOnAC = true; });
      powerMonitor.on('on-battery', () => { isOnAC = false; });
    } catch (e) { /* power events not supported */ }
  });
}

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
        //   1. PowerShell Get-CimInstance with simple echo output
        //   2. PowerShell Get-WmiObject (older API, works when CimInstance is blocked)
        //   3. Simplest WMIC /value query (key=value format, easy to parse)
        
        // --- Method 1: PowerShell with Get-CimInstance and echo (Write-Output) ---
        // Uses simple space-separated output to avoid quoting issues
        const psCmd = 'powershell -NoProfile -Command "&{$bat=Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue;if($bat){echo ($bat.EstimatedChargeRemaining.ToString() + [char]44 + $bat.BatteryStatus.ToString())}else{echo NO_BATTERY}}" 2>nul';
        
        exec(psCmd,
          { timeout: 5000, maxBuffer: 1024 * 1024 },
          (psError, psStdout) => {
            if (!psError && psStdout) {
              const output = psStdout.trim().split(/[\r\n]+/)[0]?.trim();
              if (output && output !== 'NO_BATTERY') {
                const parts = output.split(',');
                const chargePct = parseInt(parts[0]);
                const batteryStatus = parseInt(parts[1]) || 0;
                if (!isNaN(chargePct) && chargePct >= 0 && chargePct <= 100) {
                  const isCharging = [2, 6, 7, 8].includes(batteryStatus);
                  const onAC = batteryStatus !== 1;
                  resolve({
                    hasBattery: true,
                    level: chargePct / 100,
                    charging: isCharging,
                    acConnected: onAC,
                  });
                  return;
                }
              }
            }
            
            // --- Method 2: Try Get-WmiObject (older API, more widely available) ---
            const psCmd2 = 'powershell -NoProfile -Command "&{$bat=Get-WmiObject Win32_Battery -ErrorAction SilentlyContinue;if($bat){echo ($bat.EstimatedChargeRemaining.ToString() + [char]44 + $bat.BatteryStatus.ToString())}else{echo NO_BATTERY}}" 2>nul';
            
            exec(psCmd2,
              { timeout: 5000, maxBuffer: 1024 * 1024 },
              (psErr2, psOut2) => {
                if (!psErr2 && psOut2) {
                  const output2 = psOut2.trim().split(/[\r\n]+/)[0]?.trim();
                  if (output2 && output2 !== 'NO_BATTERY') {
                    const parts2 = output2.split(',');
                    const chargePct2 = parseInt(parts2[0]);
                    const batteryStatus2 = parseInt(parts2[1]) || 0;
                    if (!isNaN(chargePct2) && chargePct2 >= 0 && chargePct2 <= 100) {
                      const isCharging2 = [2, 6, 7, 8].includes(batteryStatus2);
                      const onAC2 = batteryStatus2 !== 1;
                      resolve({
                        hasBattery: true,
                        level: chargePct2 / 100,
                        charging: isCharging2,
                        acConnected: onAC2,
                      });
                      return;
                    }
                  }
                }
                
                // --- Method 3: Try bare WMIC without CSV format (key=value pairs, very robust) ---
                // WMIC is deprecated but still available on most Windows systems
                const wmicCmd = 'wmic path Win32_Battery get EstimatedChargeRemaining,BatteryStatus /value 2>nul';
                exec(wmicCmd,
                  { timeout: 5000, maxBuffer: 1024 * 1024 },
                  (wmicErr, wmicOut) => {
                    if (!wmicErr && wmicOut) {
                      const chargeMatch = wmicOut.match(/EstimatedChargeRemaining=(\d+)/i);
                      const statusMatch = wmicOut.match(/BatteryStatus=(\d+)/i);
                      if (chargeMatch) {
                        const chargePct3 = parseInt(chargeMatch[1]);
                        const batteryStatus3 = statusMatch ? parseInt(statusMatch[1]) : 0;
                        const isCharging3 = [2, 6, 7, 8].includes(batteryStatus3);
                        const onAC3 = batteryStatus3 !== 1;
                        resolve({
                          hasBattery: true,
                          level: chargePct3 / 100,
                          charging: isCharging3,
                          acConnected: onAC3,
                        });
                        return;
                      }
                    }
                    
                    // All methods failed — no battery detected
                    console.error('[Battery] All detection methods failed on Windows (PS1, PS2, WMIC)');
                    resolve({ hasBattery: false, level: 0, charging: false, acConnected: true });
                  }
                );
              }
            );
          }
        );
      } else if (platform === 'darwin') {
        // macOS: Try pmset for battery info
        exec('pmset -g batt 2>/dev/null',
          { timeout: 3000 },
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
          { timeout: 3000 },
          (error, stdout) => {
            if (!error && stdout) {
              try {
                const pct = parseInt(stdout.trim());
                if (!isNaN(pct) && pct >= 0) {
                  // Check charging status
                  exec('cat /sys/class/power_supply/BAT0/status 2>/dev/null || cat /sys/class/power_supply/BAT1/status 2>/dev/null',
                    { timeout: 2000 },
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

// ──────────────────────────────────────────────
// 🔋 BATTERY DETAILS (static specs fetched once)
// ──────────────────────────────────────────────

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
        exec(`cat ${batterySys}/${field} 2>/dev/null`, { timeout: 2000 }, (err, out) => {
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

// ──────────────────────────────────────────────
// 🌡️ CPU TEMPERATURE
// ──────────────────────────────────────────────

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
      exec("pmset -g therm 2>/dev/null", { timeout: 3000 }, () => {
        resolve(-1);
      });
    } else {
      // Linux: Read from thermal zone sysfs
      exec('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -5',
        { timeout: 3000 }, (error, stdout) => {
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

// ──────────────────────────────────────────────
// 📡 NETWORK SPEED MONITOR
// ──────────────────────────────────────────────

// Track previous network byte counters to calculate speed
let _prevNetStats = null;
let _prevNetTime = null;

/**
 * Get real-time network transfer speed (upload/download rates)
 * Compares cumulative byte counters between refreshes to calculate B/s
 * Cross-platform: works on Windows, macOS, and Linux
 */
function getNetworkSpeed() {
  return new Promise((resolve) => {
    const platform = os.platform();
    let cmd;

    if (platform === 'win32') {
      // Windows: netstat -e gives total bytes sent/received since interface start
      cmd = 'netstat -e 2>nul';
    } else if (platform === 'darwin') {
      // macOS: netstat -ib gives per-interface byte counters
      cmd = 'netstat -ib 2>/dev/null | tail -n +2';
    } else {
      // Linux: read sysfs stats for each interface
      cmd = 'for f in /sys/class/net/*/statistics/rx_bytes; do i=$(basename $(dirname $(dirname $f))); echo "$i:rx=$(cat $f):tx=$(cat ${f%rx_bytes}tx_bytes)"; done 2>/dev/null';
    }

    exec(cmd, { timeout: 3000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) { resolve(null); return; }

      const now = Date.now();
      const interfaces = {};

      try {
        if (platform === 'win32') {
          // Parse netstat -e: "Bytes    123456789  987654321"
          const lines = stdout.split('\n');
          for (const line of lines) {
            if (line.trim().startsWith('Bytes')) {
              const parts = line.trim().split(/\s+/);
              if (parts.length >= 3) {
                const rx = parseInt(parts[1].replace(/,/g, '')) || 0;
                const tx = parseInt(parts[2].replace(/,/g, '')) || 0;
                interfaces['all'] = { rx, tx };
              }
              break;
            }
          }
        } else if (platform === 'darwin') {
          // Parse netstat -ib: Name Mtu Network Address Ipkts Ierrs Opkts Oerrs Coll Ibytes Obytes
          const lines = stdout.split('\n').filter(l => l.trim() && !l.includes('Name'));
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 11) {
              const name = parts[0];
              if (name && !name.startsWith('lo')) {
                const ibytes = parseInt(parts[9]) || 0;
                const obytes = parseInt(parts[10]) || 0;
                interfaces[name] = { rx: ibytes, tx: obytes };
              }
            }
          }
        } else {
          // Linux: parse "eth0:rx=12345:tx=67890"
          const lines = stdout.split('\n').filter(l => l.trim());
          for (const line of lines) {
            const match = line.match(/^(.+?):rx=(\d+):tx=(\d+)$/);
            if (match) {
              const name = match[1];
              if (name && !name.startsWith('lo')) {
                interfaces[name] = {
                  rx: parseInt(match[2]) || 0,
                  tx: parseInt(match[3]) || 0,
                };
              }
            }
          }
        }
      } catch (e) {
        resolve(null);
        return;
      }

      // Sum up totals across all non-loopback interfaces
      const total = { rx: 0, tx: 0 };
      for (const stats of Object.values(interfaces)) {
        total.rx += stats.rx;
        total.tx += stats.tx;
      }

      // Build the result object (may include speed on subsequent calls)
      const result = { interfaces, total };

      // Calculate speeds from deltas if we have previous data
      if (_prevNetStats && _prevNetTime) {
        const elapsed = (now - _prevNetTime) / 1000; // seconds
        if (elapsed > 0.001) {
          const rxDelta = total.rx - _prevNetStats.total.rx;
          const txDelta = total.tx - _prevNetStats.total.tx;
          result.speed = {
            rx: rxDelta >= 0 ? rxDelta / elapsed : 0,
            tx: txDelta >= 0 ? txDelta / elapsed : 0,
          };
        } else {
          result.speed = { rx: 0, tx: 0 };
        }
      }

      // Store current values for next call
      _prevNetStats = { total: { rx: total.rx, tx: total.tx } };
      _prevNetTime = now;

      resolve(result);
    });
  });
}

// ──────────────────────────────────────────────
// 👑 ADMIN / ELEVATION CHECK
// ──────────────────────────────────────────────

/**
 * Check if the app is running with admin/root privileges
 */
function checkAdminStatus() {
  return new Promise((resolve) => {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: 'net session' only works for administrators
      exec('net session', { timeout: 3000 }, (error) => {
        resolve({ isAdmin: !error, platform });
      });
    } else {
      // macOS/Linux: check UID (0 = root)
      try {
        const isRoot = process.getuid && process.getuid() === 0;
        resolve({ isAdmin: !!isRoot, platform });
      } catch (e) {
        resolve({ isAdmin: false, platform });
      }
    }
  });
}

/**
 * Check if npm/pip global directories typically need admin privileges
 * npm: /usr/local/lib/node_modules (macOS/Linux) or AppData/Roaming/npm (Windows - usually no admin)
 * pip: system Python directories often need admin
 */
function checkNpmNeedsAdmin() {
  return new Promise((resolve) => {
    const platform = os.platform();
    if (platform === 'win32') {
      // On Windows, npm global packages usually go to AppData (no admin needed)
      exec('npm config get prefix', { timeout: 5000 }, (error, stdout) => {
        if (error) { resolve(true); return; } // Can't determine, assume needed
        const prefix = stdout.trim().toLowerCase();
        // If npm prefix is in Program Files, admin is needed
        const needsAdmin = prefix.includes('program files') || prefix.includes('\\nodejs');
        resolve(needsAdmin);
      });
    } else {
      // macOS/Linux: default npm prefix /usr/local requires sudo
      exec('npm config get prefix 2>/dev/null', { timeout: 5000 }, (error, stdout) => {
        if (error) { resolve(true); return; }
        const prefix = stdout.trim();
        const needsAdmin = prefix.startsWith('/usr') || prefix.startsWith('/opt');
        resolve(needsAdmin);
      });
    }
  });
}

/**
 * Run a command with elevated privileges
 * Shows OS-level elevation prompt (UAC on Windows, password prompt on macOS/Linux)
 * Returns { success, message }
 */
function runCommandElevated(cmd, args) {
  return new Promise((resolve) => {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: Use PowerShell Start-Process with -Verb RunAs for UAC elevation
      // Wrap the command so we can capture output
      const psScript = `powershell -NoProfile -Command "
        $proc = Start-Process -FilePath cmd.exe -ArgumentList '/c ${cmd.replace(/"/g, '\\"')}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden;
        exit $proc.ExitCode
      "`;

      exec(psScript, { timeout: 120000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          // User declined UAC or elevation failed
          const msg = (stderr || '').includes('Access is denied')
            ? 'Elevation cancelled or access denied'
            : (error.message || 'Elevation failed');
          resolve({ success: false, message: msg });
          return;
        }
        resolve({ success: true, message: stdout || 'Command completed' });
      });
    } else if (platform === 'darwin') {
      // macOS: Use osascript for GUI password prompt
      const script = `osascript -e 'do shell script "${cmd.replace(/"/g, '\\"')}" with administrator privileges'`;
      exec(script, { timeout: 120000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) {
          resolve({ success: false, message: 'Elevation cancelled or failed' });
          return;
        }
        resolve({ success: true, message: stdout || 'Command completed' });
      });
    } else {
      // Linux: Use pkexec (GUI password prompt) or gksudo
      const script = `pkexec ${cmd}`;
      exec(script, { timeout: 120000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, message: 'Elevation cancelled or failed' });
          return;
        }
        resolve({ success: true, message: stdout || 'Command completed' });
      });
    }
  });
}

// ──────────────────────────────────────────────
// 📦 PACKAGE MANAGER - npm & pip global packages
// ──────────────────────────────────────────────

/**
 * 📦 Get list of globally installed npm packages
 * Uses `npm list -g --depth=0 --json` to get installed packages
 */
function getNpmPackages() {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32'
      ? 'npm list -g --depth=0 --json'
      : 'npm list -g --depth=0 --json 2>/dev/null';

    exec(cmd, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        // npm might not be installed or another error occurred
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const deps = parsed.dependencies || {};
        const packages = Object.entries(deps).map(([name, info]) => ({
          name,
          version: info.version || '?',
          description: info.description || '',
        }));
        resolve(packages);
      } catch (e) {
        resolve([]);
      }
    });
  });
}

/**
 * 🐍 Get list of globally installed pip packages
 * Uses `pip list --format=json` (or pip3 if available)
 */
function getPipPackages() {
  return new Promise((resolve) => {
    // Try pip3 first, fallback to pip
    const cmd = process.platform === 'win32'
      ? 'pip list --format=json 2>nul || pip3 list --format=json 2>nul'
      : 'pip3 list --format=json 2>/dev/null || pip list --format=json 2>/dev/null';

    exec(cmd, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) { resolve([]); return; }
      try {
        const parsed = JSON.parse(stdout);
        const packages = (parsed || []).map(pkg => ({
          name: pkg.name,
          version: pkg.version || '?',
          description: '',
        }));
        // Fetch descriptions from PyPI JSON API in batches
        fetchPipDescriptions(packages).then(resolve);
      } catch (e) {
        resolve([]);
      }
    });
  });
}

// ──────────────────────────────────────────────
// 🧠 VIRTUAL MEMORY (Swap / Page File)
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
      exec('grep -E "^(SwapTotal|SwapFree):" /proc/meminfo 2>/dev/null', { timeout: 3000 }, (err, out) => {
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
      exec('sysctl vm.swapusage 2>/dev/null', { timeout: 3000 }, (err, out) => {
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



/**
 * ⬆️ Update a global package (npm or pip)
 * Works for both npm and Python packages
 */
function updatePackage(type, name) {
  return new Promise((resolve) => {
    // 🛡️ Sanitize: only allow safe characters in package names (including / for scoped packages)
    const escaped = name.replace(/[^a-zA-Z0-9@\-_.\/]/g, '');
    if (!escaped) {
      resolve({ success: false, message: 'Invalid package name' });
      return;
    }
    let cmd;

    if (type === 'npm') {
      // Use @latest to always get the newest version (even breaking changes)
      cmd = `npm install -g ${escaped}@latest 2>&1`;
    } else if (type === 'pip') {
      const pipCmd = process.platform === 'win32'
        ? 'pip install --upgrade'
        : 'pip3 install --upgrade';
      cmd = `${pipCmd} ${escaped} 2>&1`;
    } else {
      resolve({ success: false, message: 'Unknown package type' });
      return;
    }

    exec(cmd, { timeout: 60000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const errorOutput = (stderr || stdout || '').trim().split('\n').filter(l => l.trim()).slice(-5).join('\n');
        resolve({ success: false, message: errorOutput || error.message || 'Update failed' });
        return;
      }
      resolve({ success: true, message: stdout.split('\n').filter(l => l.trim()).slice(-3).join('\n') });
    });
  });
}

/**
 * 📥 Install a new global package (npm or pip)
 */
function installPackage(type, name) {
  return new Promise((resolve) => {
    // 🛡️ Sanitize: only allow safe characters in package names (including / for scoped packages)
    const escaped = name.replace(/[^a-zA-Z0-9@\-_.\/]/g, '').trim();
    if (!escaped) {
      resolve({ success: false, message: 'Please enter a valid package name' });
      return;
    }
    let cmd;

    if (type === 'npm') {
      cmd = `npm install -g ${escaped} 2>&1`;
    } else if (type === 'pip') {
      const pipCmd = process.platform === 'win32'
        ? 'pip install'
        : 'pip3 install';
      cmd = `${pipCmd} ${escaped} 2>&1`;
    } else {
      resolve({ success: false, message: 'Unknown package type' });
      return;
    }

    exec(cmd, { timeout: 120000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const errorOutput = (stderr || stdout || '').trim().split('\n').filter(l => l.trim()).slice(-5).join('\n');
        resolve({ success: false, message: errorOutput || error.message || 'Installation failed' });
        return;
      }
      resolve({ success: true, message: stdout.split('\n').filter(l => l.trim()).slice(-3).join('\n') });
    });
  });
}

/**
 * 🗑️ Delete (uninstall) a global package
 */
function deletePackage(type, name) {
  return new Promise((resolve) => {
    // 🛡️ Sanitize: only allow safe characters in package names
    const escaped = name.replace(/[^a-zA-Z0-9@\-_.\/]/g, '');
    if (!escaped) {
      resolve({ success: false, message: 'Invalid package name' });
      return;
    }
    let cmd;

    if (type === 'npm') {
      cmd = `npm uninstall -g ${escaped} 2>&1`;
    } else if (type === 'pip') {
      const pipCmd = process.platform === 'win32'
        ? 'pip uninstall -y'
        : 'pip3 uninstall -y';
      cmd = `${pipCmd} ${escaped} 2>&1`;
    } else {
      resolve({ success: false, message: 'Unknown package type' });
      return;
    }

    exec(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const errorOutput = (stderr || stdout || '').trim().split('\n').filter(l => l.trim()).slice(-5).join('\n');
        resolve({ success: false, message: errorOutput || error.message || 'Uninstall failed' });
        return;
      }
      resolve({ success: true, message: stdout.split('\n').filter(l => l.trim()).slice(-3).join('\n') });
    });
  });
}

// ──────────────────────────────────────────────
// 🔍 PACKAGE SEARCH (registry autocomplete)
// ──────────────────────────────────────────────

/**
 * Search npm registry for packages matching a query
 * Uses the npm public registry API
 */
function searchNpmRegistry(query) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(query.trim());
    if (q.length < 2) { resolve([]); return; }
    const url = `https://registry.npmjs.org/-/v1/search?text=${q}&size=8`;
    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const results = (parsed.objects || []).map(obj => ({
            name: obj.package.name,
            version: obj.package.version,
            description: (obj.package.description || '').substring(0, 120),
          }));
          resolve(results);
        } catch (e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

/**
 * Fetch pip package description from PyPI JSON API
 */
function fetchPipDescription(name) {
  return new Promise((resolve) => {
    const url = `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve((parsed.info?.summary || '').substring(0, 200));
        } catch (e) { resolve(''); }
      });
    }).on('error', () => resolve(''));
  });
}

/**
 * Fetch descriptions for multiple pip packages in batches
 */
async function fetchPipDescriptions(packages) {
  const batchSize = 5;
  for (let i = 0; i < packages.length; i += batchSize) {
    const batch = packages.slice(i, i + batchSize);
    const descs = await Promise.all(batch.map(p => fetchPipDescription(p.name)));
    batch.forEach((pkg, j) => { pkg.description = descs[j]; });
  }
  return packages;
}

/**
 * Search pip registry for packages matching a query
 * Uses pip index command (newer pip) or pip search (older pip)
 */
function searchPipRegistry(query) {
  return new Promise((resolve) => {
    const escaped = query.replace(/[^a-zA-Z0-9\-_.\s]/g, '').trim();
    if (!escaped || escaped.length < 2) { resolve([]); return; }

    // Try pip index versions first (newer pip)
    const pipCmd = process.platform === 'win32' ? 'pip' : 'pip3';
    exec(`${pipCmd} index versions "${escaped}" 2>nul`, { timeout: 8000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        const lines = stdout.trim().split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          const versionMatch = lines[0].match(/available versions: (.+)/i);
          const versions = versionMatch ? versionMatch[1].split(',') : [];
          const pkgNameMatch = lines[0].match(/^(.+?)\(/);
          const name = pkgNameMatch ? pkgNameMatch[1].trim() : escaped;
          // Fetch description from PyPI API
          fetchPipDescription(name).then(desc => {
            resolve([{
              name,
              version: versions[0]?.trim() || '',
              description: desc.substring(0, 120),
            }]);
          });
          return;
        }
      }
      resolve([]);
    });
  });
}

/**
 * ⚙️ Get list of running processes
 * Uses tasklist (Windows) or ps aux (macOS/Linux)
 * Returns top 30 processes sorted by memory usage
 */
function getProcessList() {
  return new Promise((resolve) => {
    const platform = os.platform();

    // Platform-specific commands to list running processes
    let cmd;
    if (platform === 'win32') {
      cmd = 'tasklist /FO CSV /NH';
    } else {
      cmd = 'ps aux --no-headers 2>/dev/null || ps aux | tail -n +2';
    }

    exec(cmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) { resolve([]); return; }

      const processes = [];
      try {
        const lines = stdout.trim().split('\n').filter(l => l.trim());

        for (const line of lines) {
          if (processes.length >= 50) break; // Safety limit

          if (platform === 'win32') {
            // Parse tasklist CSV: "Name","PID","Session","#","Memory"
            const parts = line.split(',');
            if (parts.length >= 5) {
              const name = parts[0]?.replace(/"/g, '').trim() || 'Unknown';
              const pid = parseInt(parts[1]?.replace(/"/g, '').trim()) || 0;
              const memStr = parts[4]?.replace(/"/g, '').trim() || '0 K';
              let memBytes = 0;
              const memMatch = memStr.match(/([\d,.]+)\s*(K|M|G|B)/i);
              if (memMatch) {
                const val = parseFloat(memMatch[1].replace(/,/, ''));
                const unit = memMatch[2].toUpperCase();
                if (unit === 'K') memBytes = val * 1024;
                else if (unit === 'M') memBytes = val * 1024 * 1024;
                else if (unit === 'G') memBytes = val * 1024 * 1024 * 1024;
                else memBytes = val;
              }
              processes.push({ name, pid, memory: memBytes, cpu: 0 });
            }
          } else {
            // Parse ps aux output
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 11) {
              const pid = parseInt(parts[1]) || 0;
              const cpu = parseFloat(parts[2]) || 0;
              const rss = parseInt(parts[5]) || 0; // Resident Set Size
              const name = parts[parts.length - 1]?.split('/')?.pop() || 'Unknown';
              processes.push({ name, pid, cpu, memory: rss * 1024 });
            }
          }
        }
      } catch (e) { /* parsing failed */ }

      // Sort by memory usage (highest first) and limit to 30
      processes.sort((a, b) => b.memory - a.memory);
      resolve(processes.slice(0, 30));
    });
  });
}

// ──────────────────────────────────────────────
// 🚀 APP INITIALIZATION
// ──────────────────────────────────────────────

// 'whenReady' fires after Electron has finished starting up
app.whenReady().then(() => {
  createWindow();

  // macOS: Re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // ─── IPC Handlers ───────────────────────
  // These listen for requests from the renderer (webpage)
  // The renderer calls these via window.electronAPI.*
  
  ipcMain.handle('get-system-info', () => getSystemInfo());
  ipcMain.handle('get-disk-info', () => getDiskInfo());
  ipcMain.handle('get-battery-info', () => getBatteryInfo());
  ipcMain.handle('get-process-list', () => getProcessList());
  ipcMain.handle('get-npm-packages', () => getNpmPackages());
  ipcMain.handle('get-pip-packages', () => getPipPackages());
  ipcMain.handle('update-package', (_, type, name) => updatePackage(type, name));
  ipcMain.handle('delete-package', (_, type, name) => deletePackage(type, name));
  ipcMain.handle('install-package', (_, type, name) => installPackage(type, name));
  ipcMain.handle('search-npm-packages', (_, query) => searchNpmRegistry(query));
  ipcMain.handle('search-pip-packages', (_, query) => searchPipRegistry(query));
  ipcMain.handle('check-admin', () => checkAdminStatus());
  ipcMain.handle('check-npm-admin', () => checkNpmNeedsAdmin());
  ipcMain.handle('run-elevated', (_, cmd, args) => runCommandElevated(cmd, args));
  ipcMain.handle('get-cpu-temp', () => getCpuTemperature());
  ipcMain.handle('get-network-speed', () => getNetworkSpeed());
  ipcMain.handle('get-battery-details', () => getBatteryDetails());
  ipcMain.handle('get-virtual-memory', () => getVirtualMemory());

  // ─── Window Controls ────────────────────
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window-close', () => mainWindow?.close());

  // Notify renderer when window is maximized/restored
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized');
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-unmaximized');
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
