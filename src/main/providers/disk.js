/* ============================================================
   💾 PROVIDER — DISK (Phase 2 split from main.js)
   ============================================================ */

'use strict';

const os = require('os');
const { exec } = require('child_process');

/**
 * 💾 Get disk/drive information
 * Runs a system command based on your operating system
 * Returns an array of disk objects with: mount, total, used, free
 */
function getDiskInfo() {
  return new Promise((resolve) => {
    const platform = os.platform();

    // 🖥️ Platform-specific commands
    // Windows: Try PowerShell first (WMIC is deprecated on newer Win11), fall back to WMIC
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
      if (error) {
        // Primary command failed — try PowerShell fallback on Windows
        if (platform === 'win32') {
          const psCmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -ErrorAction SilentlyContinue | Where-Object { $_.DriveType -eq 3 } | ForEach-Object { $_.DeviceID + \',\' + $_.Size + \',\' + $_.FreeSpace }" 2>nul';
          exec(psCmd, { timeout: 5000, maxBuffer: 1024 * 1024 }, (psErr, psOut) => {
            if (psErr || !psOut) { resolve([]); return; }
            const disks = [];
            const lines = psOut.trim().split('\n').filter(l => l.trim());
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
            resolve(disks);
          });
          return;
        }
        resolve([]);
        return;
      }

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

module.exports = { getDiskInfo };
