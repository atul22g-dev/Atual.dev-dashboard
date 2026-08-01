/* ============================================================
   💾 PROVIDER — DISK (Phase 2 split from main.js)
   Phase 3: shell calls go through command-service.js.
   ============================================================ */

'use strict';

const os = require('os');
const { runCommand } = require('../command-service');

/** Parse WMIC CSV disk output (Windows). */
function parseWmicCsv(stdout) {
  const disks = [];
  const lines = String(stdout).trim().split('\n').filter(l => l.trim());
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
  return disks;
}

/** Parse the PowerShell Get-CimInstance Win32_LogicalDisk output. */
function parsePsDisks(stdout) {
  const disks = [];
  const lines = String(stdout).trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length >= 3) {
      const caption = parts[0]?.trim() || '';
      const size = parseInt(parts[1]) || 0;
      const free = parseInt(parts[2]) || 0;
      if (caption && size > 0) {
        disks.push({ mount: caption, total: size, free, used: size - free });
      }
    }
  }
  return disks;
}

/** Parse `df` output (macOS/Linux). */
function parseDf(stdout, platform) {
  const disks = [];
  const lines = String(stdout).trim().split('\n').filter(l => l.trim());
  // macOS runs `df -k` (blocks of 1024 bytes) → scale ×1024.
  // Linux runs `df -B1 --output=source,size,used,avail,target` → sizes are
  // ALREADY in bytes, so no scaling (the old code double-scaled Linux).
  const scale = platform === 'darwin' ? 1024 : 1;
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5) {
      const total = parseInt(parts[1]) * scale;
      const used = parseInt(parts[2]) * scale;
      const free = parseInt(parts[3]) * scale;
      const mount = platform === 'darwin' ? parts[parts.length - 1] : parts[4];
      if (mount && total > 0) {
        disks.push({ mount, total, used, free });
      }
    }
  }
  return disks;
}

/**
 * 💾 Get disk/drive information
 * Runs a system command based on your operating system
 * Returns an array of disk objects with: mount, total, used, free
 */
async function getDiskInfo() {
  try {
    const platform = os.platform();

    // 🖥️ Platform-specific commands
    // Windows: Try WMIC first, fall back to PowerShell (WMIC is deprecated on newer Win11)
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
    const result = await runCommand(cmd, { timeout: 5000 });
    if (result.ok && result.stdout) {
      if (platform === 'win32') {
        return parseWmicCsv(result.stdout);
      }
      return parseDf(result.stdout, platform);
    }

    // Primary command failed — try PowerShell fallback on Windows
    if (platform === 'win32') {
      const psCmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -ErrorAction SilentlyContinue | Where-Object { $_.DriveType -eq 3 } | ForEach-Object { $_.DeviceID + \',\' + $_.Size + \',\' + $_.FreeSpace }" 2>nul';
      const psResult = await runCommand(psCmd, { timeout: 5000 });
      if (psResult.ok && psResult.stdout) {
        return parsePsDisks(psResult.stdout);
      }
    }
    return [];
  } catch (e) {
    /* parsing failed - return whatever we have */
    return [];
  }
}

module.exports = { getDiskInfo };
