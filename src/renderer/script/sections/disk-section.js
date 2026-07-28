/* ============================================================
   💾 DISK SECTION - Storage device info
   ============================================================ */

import { $, formatBytes } from '../utils.js';

export let diskInfoCache = [];

export async function loadDiskInfo() {
  try {
    const disks = await window.electronAPI.getDiskInfo();
    diskInfoCache = disks;
    renderDiskInfo(disks);
  } catch (err) {
    console.error('Failed to load disk info:', err);
  }
}

export function renderDiskInfo(disks) {
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

  disks.filter(d => d.total > 0).forEach(disk => {
    totalSize += disk.total;
    totalUsed += disk.used;
    totalFree += disk.free;

    const card = document.createElement('div');
    card.className = 'disk-card glass';
    const percent = (disk.used / disk.total) * 100;
    const barClass = percent > 90 ? 'danger' : percent > 70 ? 'warning' : '';

    card.innerHTML = `
      <h3>${disk.mount} <span>${formatBytes(disk.total)}</span></h3>
      <div class="disk-bar-container">
        <div class="disk-bar-fill ${barClass}" style="width:${Math.min(percent, 100)}%"></div>
      </div>
      <div class="disk-stats">
        <span>Used: <strong>${formatBytes(disk.used)}</strong></span>
        <span>Free: <strong>${formatBytes(disk.free)}</strong></span>
        <span>${percent.toFixed(1)}%</span>
      </div>
    `;
    grid.appendChild(card);
  });

  const totalPct = totalSize > 0 ? (totalUsed / totalSize) * 100 : 0;
  $('diskTotalSize').textContent = formatBytes(totalSize);
  $('diskTotalUsed').textContent = formatBytes(totalUsed);
  $('diskTotalFree').textContent = formatBytes(totalFree);
  $('diskTotalPercent').textContent = `${totalPct.toFixed(1)}% used`;
}
