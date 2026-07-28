/* ============================================================
   🌐 NETWORK SECTION - Network stats, speed monitor
   ============================================================ */

import { $, formatBytes, formatPlatform } from '../utils.js';

let _netMaxSpeed = 1024 * 1024;

export function getNetBarPercent(speedBps) {
  if (!speedBps || speedBps <= 0) return 0;
  _netMaxSpeed = Math.max(_netMaxSpeed * 0.95, speedBps * 1.2);
  const pct = (speedBps / _netMaxSpeed) * 100;
  return Math.min(pct, 100);
}

export function formatSpeed(bps) {
  if (bps === null || bps === undefined) return '--';
  if (bps < 0) return '--';
  if (bps < 1000) return `${bps.toFixed(0)} B/s`;
  if (bps < 1000000) return `${(bps / 1000).toFixed(1)} KB/s`;
  if (bps < 1000000000) return `${(bps / 1000000).toFixed(2)} MB/s`;
  return `${(bps / 1000000000).toFixed(2)} GB/s`;
}

export function updateNetworkPage(info) {
  $('netHostname').textContent = info.hostname || '-';
  $('netPlatform').textContent = `${formatPlatform(info.platform)} ${info.arch}`;

  const ipCount = info.allInterfaces?.filter(i => i.family === 'IPv4').length || 0;
  $('netInterfaceCount').textContent = info.networkInterfaces?.length || 0;
  $('netIPTotal').textContent = ipCount;

  const table = document.getElementById('networkFullTable');
  if (!table || !info.allInterfaces) return;

  table.querySelectorAll('.network-row:not(.header)').forEach(r => r.remove());
  const empty = table.querySelector('.network-empty');
  if (empty) empty.remove();

  if (info.allInterfaces.length === 0) {
    const row = document.createElement('div');
    row.className = 'network-row';
    row.innerHTML = `<span style="grid-column:1/-1;text-align:center;color:var(--text-muted)">No interfaces found</span>`;
    table.appendChild(row);
    return;
  }

  info.allInterfaces.slice(0, 20).forEach(net => {
    const row = document.createElement('div');
    row.className = 'network-row';
    row.style.opacity = net.internal ? '0.5' : '1';

    const nameSpan = document.createElement('span');
    nameSpan.appendChild(document.createTextNode(net.name));
    if (net.internal) {
      const lb = document.createElement('span');
      lb.style.color = 'var(--text-muted)';
      lb.style.fontSize = '10px';
      lb.textContent = '(loopback)';
      nameSpan.appendChild(document.createTextNode(' '));
      nameSpan.appendChild(lb);
    }
    row.appendChild(nameSpan);

    const addrSpan = document.createElement('span');
    addrSpan.textContent = net.address || '-';
    row.appendChild(addrSpan);

    const familySpan = document.createElement('span');
    familySpan.textContent = net.family === 'IPv4' ? 'IPv4' : 'IPv6';
    row.appendChild(familySpan);

    const macSpan = document.createElement('span');
    macSpan.style.fontFamily = 'monospace';
    macSpan.style.fontSize = '10px';
    macSpan.textContent = net.mac || '-';
    row.appendChild(macSpan);

    const intSpan = document.createElement('span');
    intSpan.textContent = net.internal ? 'Yes' : 'No';
    row.appendChild(intSpan);

    table.appendChild(row);
  });
}

export async function loadNetworkSpeed() {
  try {
    const data = await window.electronAPI.getNetworkSpeed();
    if (!data) return;
    renderNetworkSpeed(data);
  } catch (err) {
    console.error('Failed to load network speed:', err);
  }
}

export function renderNetworkSpeed(data) {
  const dlEl = document.getElementById('netDlSpeed');
  const ulEl = document.getElementById('netUlSpeed');
  const dlBar = document.getElementById('netDlBar');
  const ulBar = document.getElementById('netUlBar');
  const totalRxEl = document.getElementById('netTotalRx');
  const totalTxEl = document.getElementById('netTotalTx');

  if (!dlEl || !ulEl) return;

  if (data.speed) {
    const dlSpeed = data.speed.rx;
    const ulSpeed = data.speed.tx;
    dlEl.textContent = formatSpeed(dlSpeed);
    ulEl.textContent = formatSpeed(ulSpeed);
    if (dlBar) dlBar.style.width = `${getNetBarPercent(dlSpeed)}%`;
    if (ulBar) ulBar.style.width = `${getNetBarPercent(ulSpeed)}%`;
    const dlClass = dlSpeed > 50000000 ? 'high' : dlSpeed > 5000000 ? 'mid' : '';
    const ulClass = ulSpeed > 10000000 ? 'high' : ulSpeed > 1000000 ? 'mid' : '';
    if (dlBar) dlBar.className = `net-speed-bar-fill net-speed-dl-fill${dlClass ? ' ' + dlClass : ''}`;
    if (ulBar) ulBar.className = `net-speed-bar-fill net-speed-ul-fill${ulClass ? ' ' + ulClass : ''}`;
  } else {
    dlEl.textContent = '--';
    ulEl.textContent = '--';
  }

  if (totalRxEl && data.total) totalRxEl.textContent = formatBytes(data.total.rx);
  if (totalTxEl && data.total) totalTxEl.textContent = formatBytes(data.total.tx);
}
