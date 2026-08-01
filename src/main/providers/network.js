/* ============================================================
   📡 PROVIDER — NETWORK (Phase 2 split from main.js)
   Real-time network transfer speed monitor.
   Phase 3: shell call goes through command-service.js.
   ============================================================ */

'use strict';

const os = require('os');
const { runCommand } = require('../command-service');

// Track previous network byte counters to calculate speed
let _prevNetStats = null;
let _prevNetTime = null;

/**
 * Get real-time network transfer speed (upload/download rates)
 * Compares cumulative byte counters between refreshes to calculate B/s
 * Cross-platform: works on Windows, macOS, and Linux
 */
async function getNetworkSpeed() {
  try {
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

    const result = await runCommand(cmd, { timeout: 3000 });
    if (!result.ok) return null;
    const stdout = result.stdout;

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
        // Parse netstat -ib: Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
        // (11 columns; Ibytes = col 7 / idx 6, Obytes = col 10 / idx 9)
        const lines = stdout.split('\n').filter(l => l.trim() && !l.includes('Name'));
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 11) {
            const name = parts[0];
            if (name && !name.startsWith('lo')) {
              const ibytes = parseInt(parts[6]) || 0;
              const obytes = parseInt(parts[9]) || 0;
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
      return null;
    }

    // Sum up totals across all non-loopback interfaces
    const total = { rx: 0, tx: 0 };
    for (const stats of Object.values(interfaces)) {
      total.rx += stats.rx;
      total.tx += stats.tx;
    }

    // Build the result object (may include speed on subsequent calls)
    const output = { interfaces, total };

    // Calculate speeds from deltas if we have previous data
    if (_prevNetStats && _prevNetTime) {
      const elapsed = (now - _prevNetTime) / 1000; // seconds
      if (elapsed > 0.001) {
        const rxDelta = total.rx - _prevNetStats.total.rx;
        const txDelta = total.tx - _prevNetStats.total.tx;
        output.speed = {
          rx: rxDelta >= 0 ? rxDelta / elapsed : 0,
          tx: txDelta >= 0 ? txDelta / elapsed : 0,
        };
      } else {
        output.speed = { rx: 0, tx: 0 };
      }
    }

    // Store current values for next call
    _prevNetStats = { total: { rx: total.rx, tx: total.tx } };
    _prevNetTime = now;

    return output;
  } catch (e) {
    return null;
  }
}

module.exports = { getNetworkSpeed };
