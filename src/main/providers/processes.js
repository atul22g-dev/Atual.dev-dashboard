/* ============================================================
   ⚙️ PROVIDER — PROCESSES (Phase 2 split from main.js)
   Running-process list (tasklist / ps aux).
   Phase 3: shell call goes through command-service.js.
   ============================================================ */

'use strict';

const os = require('os');
const { runCommand } = require('../command-service');
const { PROCESS_SCAN_LIMIT, PROCESS_RESULT_LIMIT } = require('../config');

/**
 * Split one tasklist /FO CSV line into unquoted fields.
 * Handles quoted fields that contain commas ("245,000 K") correctly.
 */
function parseTasklistCsvLine(line) {
  const fields = [];
  const re = /"([^"]*)"|([^,]+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    fields.push(m[1] !== undefined ? m[1] : (m[2] || ''));
  }
  return fields;
}

/**
 * ⚙️ Get list of running processes
 * Uses tasklist (Windows) or ps aux (macOS/Linux)
 * Returns top 30 processes sorted by memory usage
 */
async function getProcessList() {
  try {
    const platform = os.platform();

    // Platform-specific commands to list running processes
    let cmd;
    if (platform === 'win32') {
      cmd = 'tasklist /FO CSV /NH';
    } else {
      cmd = 'ps aux --no-headers 2>/dev/null || ps aux | tail -n +2';
    }

    const result = await runCommand(cmd, { timeout: 5000 });
    if (!result.ok) return [];

    const processes = [];
    const lines = result.stdout.trim().split('\n').filter(l => l.trim());

    for (const line of lines) {
      if (processes.length >= PROCESS_SCAN_LIMIT) break; // Safety limit

      if (platform === 'win32') {
        // Parse tasklist CSV: "Name","PID","Session","#","Memory"
        // NOTE: the Memory field contains a thousands separator inside quotes
        // (e.g. "245,000 K"), so a naive split(',') would break it — parse
        // the line as quoted CSV fields instead.
        const parts = parseTasklistCsvLine(line);
        if (parts.length >= 5) {
          const name = parts[0]?.trim() || 'Unknown';
          const pid = parseInt(parts[1]?.trim()) || 0;
          const memStr = parts[4]?.trim() || '0 K';
          let memBytes = 0;
          const memMatch = memStr.match(/([\d,.]+)\s*(K|M|G|B)/i);
          if (memMatch) {
            const val = parseFloat(memMatch[1].replace(/,/g, ''));
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

    // Sort by memory usage (highest first) and limit to 30
    processes.sort((a, b) => b.memory - a.memory);
    return processes.slice(0, PROCESS_RESULT_LIMIT);
  } catch (e) {
    return [];
  }
}

module.exports = { getProcessList };
