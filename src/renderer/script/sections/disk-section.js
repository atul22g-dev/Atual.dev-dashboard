/* ============================================================
   💾 DISK SECTION - Storage device info
   Contract: init() / update() / destroy() (Phase 2)
   ============================================================ */

import { $, formatBytes } from '../utils.js';

let diskInfoCache = [];

/** No persistent resources — this section only paints snapshots. */
export function init() {
  // nothing to set up
}

export async function update() {
  try {
    const disks = await window.electronAPI.getDiskInfo();
    diskInfoCache = disks;
    renderDiskInfo(disks);
  } catch (err) {
    console.error('Failed to load disk info:', err);
  }
}

function renderDiskInfo(disks) {
  const grid = document.getElementById('diskGrid');
  if (!grid) return;

  grid.querySelectorAll('.disk-card').forEach(c => c.remove());
  const loading = grid.querySelector('.disk-loading');
  if (loading) loading.remove();

  if (!disks || disks.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'disk-loading';
    msg.textContent = 'No disk information available';
    grid.appendChild(msg);
    return;
  }

  let totalSize = 0, totalUsed = 0, totalFree = 0;

  for (const disk of disks) {
    if (disk.total <= 0) continue;
    totalSize += disk.total;
    totalUsed += disk.used;
    totalFree += disk.free;

    const card = document.createElement('div');
    card.className = 'disk-card glass';
    const percent = (disk.used / disk.total) * 100;
    const barClass = percent > 90 ? 'danger' : percent > 70 ? 'warning' : '';

    // Build the card with DOM APIs — dynamic values via textContent (auto-escaped)
    const h3 = document.createElement('h3');
    h3.appendChild(document.createTextNode(disk.mount));
    const sizeSpan = document.createElement('span');
    sizeSpan.textContent = formatBytes(disk.total);
    h3.appendChild(sizeSpan);
    card.appendChild(h3);

    const barContainer = document.createElement('div');
    barContainer.className = 'disk-bar-container';
    const barFill = document.createElement('div');
    barFill.className = 'disk-bar-fill' + (barClass ? ' ' + barClass : '');
    barFill.style.width = Math.min(percent, 100) + '%';
    barContainer.appendChild(barFill);
    card.appendChild(barContainer);

    const stats = document.createElement('div');
    stats.className = 'disk-stats';
    const stat = (label, value) => {
      const s = document.createElement('span');
      s.appendChild(document.createTextNode(label + ' '));
      const strong = document.createElement('strong');
      strong.textContent = value;
      s.appendChild(strong);
      return s;
    };
    stats.appendChild(stat('Used:', formatBytes(disk.used)));
    stats.appendChild(stat('Free:', formatBytes(disk.free)));
    const pct = document.createElement('span');
    pct.textContent = percent.toFixed(1) + '%';
    stats.appendChild(pct);
    card.appendChild(stats);

    grid.appendChild(card);
  }

  const totalPct = totalSize > 0 ? (totalUsed / totalSize) * 100 : 0;
  $('diskTotalSize').textContent = formatBytes(totalSize);
  $('diskTotalUsed').textContent = formatBytes(totalUsed);
  $('diskTotalFree').textContent = formatBytes(totalFree);
  $('diskTotalPercent').textContent = `${totalPct.toFixed(1)}% used`;
}

/** No timers or listeners to release. */
export function destroy() {
  // nothing to clean up
}
