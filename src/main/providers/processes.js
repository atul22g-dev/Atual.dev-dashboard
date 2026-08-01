/* ============================================================
   ⚙️ PROVIDER — PROCESSES (Phase 2 split from main.js)
   Running-process list (tasklist / ps aux).
   ============================================================ */

'use strict';

const os = require('os');
const { exec } = require('child_process');
const { PROCESS_SCAN_LIMIT, PROCESS_RESULT_LIMIT } = require('../config');

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
          if (processes.length >= PROCESS_SCAN_LIMIT) break; // Safety limit

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
      resolve(processes.slice(0, PROCESS_RESULT_LIMIT));
    });
  });
}

module.exports = { getProcessList };
