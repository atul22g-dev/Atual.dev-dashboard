/* ============================================================
   🎯 DASHBOARD APP ORCHESTRATOR (ES Module Entry Point)
   ============================================================
   Coordinates all dashboard sections, handles window controls,
   theme toggle, navigation, and the auto-refresh cycle.
   ============================================================ */

import { $, updateMetricBar, toggleMetricClass } from './utils.js';
import { cpuRingGauge, memRingGauge } from './charts.js';
import { initCharts, cpuLineChart, memLineChart, donutChart, updateCharts } from './charts.js';
import { updateOverview } from './sections/overview-section.js';
import { updateSystemPage } from './sections/system-section.js';
import { updatePerformancePage } from './sections/performance-section.js';
import { updateNetworkPage, loadNetworkSpeed } from './sections/network-section.js';
import { loadDiskInfo } from './sections/disk-section.js';
import { loadProcesses, renderProcesses, processCache } from './sections/processes-section.js';
import { loadPackages, checkAdminAndElevation, handlePackageAction, handleInstallPackage, showActionLog } from './sections/developer-section.js';
import { lastFailedAction, currentPkgType, npmPackages, pipPackages } from './sections/developer-section.js';
import { switchPackageTab, renderPackages, showPackagePopup } from './sections/developer-section.js';
import { batteryGauge, initBatteryGauge, loadBatteryInfo, loadBatteryDetails } from './sections/battery-section.js';

// ──────────────────────────────────────────────
// 🪟 WINDOW CONTROLS
// ──────────────────────────────────────────────

document.getElementById('minimizeBtn').addEventListener('click', () => window.electronAPI.minimize());
document.getElementById('maximizeBtn').addEventListener('click', () => window.electronAPI.maximize());
document.getElementById('closeBtn').addEventListener('click', () => window.electronAPI.close());

// ──────────────────────────────────────────────
// 🌓 THEME TOGGLE
// ──────────────────────────────────────────────

const STORAGE_KEY = 'atual-dev-dashboard-theme';

const MOON_SVG = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
const SUN_SVG = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';

function applyTheme(isLight) {
  document.body.classList.toggle('light-theme', isLight);
  document.getElementById('themeLabel').textContent = isLight ? 'Light Mode' : 'Dark Mode';
  document.getElementById('themeIcon').innerHTML = isLight ? SUN_SVG : MOON_SVG;
  localStorage.setItem(STORAGE_KEY, isLight ? 'light' : 'dark');
}

function toggleTheme() {
  applyTheme(!document.body.classList.contains('light-theme'));
}

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  applyTheme(saved === 'light');
} catch (e) { applyTheme(false); }

document.getElementById('themeToggle').addEventListener('click', toggleTheme);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
    e.preventDefault();
    toggleTheme();
  }
});

// ──────────────────────────────────────────────
// 🧭 SIDEBAR NAVIGATION
// ──────────────────────────────────────────────

const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.dashboard-section');

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;
    if (!section) return;
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    sections.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`section-${section}`);
    if (target) target.classList.add('active');
    if (section === 'performance') {
      requestAnimationFrame(() => {
        if (cpuLineChart) cpuLineChart.resize();
        if (memLineChart) memLineChart.resize();
        if (donutChart && donutChart._lastSlices) donutChart.draw(donutChart._lastSlices);
      });
    }
  });
});

// ──────────────────────────────────────────────
// 🔄 WINDOW MAXIMIZE DETECTION
// ──────────────────────────────────────────────

function updateMaximizeIcon(isMaximized) {
  const btn = document.getElementById('maximizeBtn');
  if (isMaximized) {
    btn.innerHTML = `<svg viewBox="0 0 12 12" width="12" height="12">
      <rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
      <rect x="1" y="1" width="7" height="7" rx="1" fill="var(--bg-secondary)" stroke="currentColor" stroke-width="1"/>
    </svg>`;
    btn.title = 'Restore';
  } else {
    btn.innerHTML = `<svg viewBox="0 0 12 12" width="12" height="12">
      <rect x="2" y="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
    </svg>`;
    btn.title = 'Maximize';
  }
}

window.electronAPI.onMaximize(() => updateMaximizeIcon(true));
window.electronAPI.onUnmaximize(() => updateMaximizeIcon(false));

// ──────────────────────────────────────────────
// 📡 DATA UPDATER
// ──────────────────────────────────────────────

async function loadSystemInfo() {
  try {
    const info = await window.electronAPI.getSystemInfo();
    updateOverview(info);
    updateSystemPage(info);
    updatePerformancePage(info);
    updateNetworkPage(info);
    loadBatteryInfo(info);
    updateCharts(info);
    loadCpuTempInfo();
  } catch (err) {
    console.error('Failed to load system info:', err);
  }
}

// ──────────────────────────────────────────────
// 🌡️ CPU TEMPERATURE
// ──────────────────────────────────────────────

async function loadCpuTempInfo() {
  try {
    const temp = await window.electronAPI.getCpuTemp();
    const badgeEl = document.getElementById('chartCpuTemp');
    const metricEl = document.getElementById('cpuTempMetric');

    if (temp > 0 && isFinite(temp)) {
      if (badgeEl) {
        badgeEl.textContent = `${temp.toFixed(0)}°C`;
        badgeEl.className = 'perf-chart-badge perf-chart-badge-temp';
        badgeEl.style.opacity = '';
        if (temp > 75) badgeEl.classList.add('hot');
        else if (temp > 55) badgeEl.classList.add('warm');
        else badgeEl.classList.add('cool');
      }
      if (metricEl) {
        metricEl.textContent = `${temp.toFixed(0)}°C`;
        metricEl.style.color = temp > 75 ? 'var(--danger)' : temp > 55 ? 'var(--warning)' : 'var(--success)';
      }
      const tempPct = Math.min(Math.max(temp, 0), 100);
      updateMetricBar('cpuTempBarMetric', tempPct);
      toggleMetricClass('metric-temp-high', temp > 75, document.querySelector('[data-metric="temp"]'));
    } else {
      if (badgeEl) { badgeEl.textContent = 'N/A'; badgeEl.className = 'perf-chart-badge perf-chart-badge-temp'; badgeEl.style.opacity = '0.5'; }
      if (metricEl) { metricEl.textContent = 'N/A'; metricEl.style.color = 'var(--text-muted)'; }
    }
  } catch (err) {
    console.error('Failed to load CPU temp:', err);
    const badgeEl = document.getElementById('chartCpuTemp');
    const metricEl = document.getElementById('cpuTempMetric');
    if (badgeEl) { badgeEl.textContent = 'N/A'; badgeEl.style.opacity = '0.5'; }
    if (metricEl) { metricEl.textContent = 'N/A'; metricEl.style.color = 'var(--text-muted)'; }
  }
}

// ──────────────────────────────────────────────
// ⏱️ AUTO-REFRESH
// ──────────────────────────────────────────────

let refreshTimer = null;
let diskInterval = null;
let processInterval = null;
let netSpeedInterval = null;

async function scheduleRefresh() {
  try { await loadSystemInfo(); }
  catch (err) { console.error('Refresh error:', err); }
  refreshTimer = setTimeout(scheduleRefresh, 1500);
}

function startAutoRefresh() { scheduleRefresh(); }

function stopAutoRefresh() {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  if (diskInterval) { clearInterval(diskInterval); diskInterval = null; }
  if (processInterval) { clearInterval(processInterval); processInterval = null; }
  if (netSpeedInterval) { clearInterval(netSpeedInterval); netSpeedInterval = null; }
  window.electronAPI.removeMaximizeListeners();
  if (cpuRingGauge) cpuRingGauge.destroy();
  if (memRingGauge) memRingGauge.destroy();
  if (batteryGauge) batteryGauge.destroy();
}

// ──────────────────────────────────────────────
// 🚀 STARTUP
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  initBatteryGauge();
  loadBatteryDetails();
  startAutoRefresh();

  loadDiskInfo();
  loadProcesses();
  loadNetworkSpeed();
  diskInterval = setInterval(loadDiskInfo, 8000);
  processInterval = setInterval(loadProcesses, 5000);
  netSpeedInterval = setInterval(loadNetworkSpeed, 1500);

  const searchInput = document.getElementById('processSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderProcesses(processCache, e.target.value);
    });
  }

  loadPackages();
  checkAdminAndElevation();

  $('pkgElevateBtn')?.addEventListener('click', async () => {
    if (!lastFailedAction) {
      $('pkgAdminText').textContent = '⚠️ No failed action to retry. Try installing/updating a package first.';
      return;
    }
    const btn = $('pkgElevateBtn');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="pkg-install-spinner"></span> Elevating...';
    $('pkgAdminText').textContent = `Retrying with admin privileges: ${lastFailedAction.action} ${lastFailedAction.name}...`;
    try {
      const { action, type, name } = lastFailedAction;
      let elevatedCmd;
      if (type === 'npm') {
        if (action === 'install') elevatedCmd = `npm install -g ${name}`;
        else if (action === 'update') elevatedCmd = `npm install -g ${name}@latest`;
        else if (action === 'delete') elevatedCmd = `npm uninstall -g ${name}`;
      } else if (type === 'pip') {
        const isWin = navigator.platform && navigator.platform.toLowerCase().includes('win');
        const pip = isWin ? 'pip' : 'pip3';
        if (action === 'install') elevatedCmd = `${pip} install ${name}`;
        else if (action === 'update') elevatedCmd = `${pip} install --upgrade ${name}`;
        else if (action === 'delete') elevatedCmd = `${pip} uninstall -y ${name}`;
      }
      if (!elevatedCmd) {
        $('pkgAdminText').textContent = '⚠️ Could not construct elevated command for this action.';
        btn.disabled = false; btn.innerHTML = originalText; return;
      }
      const result = await window.electronAPI.runElevated(elevatedCmd, []);
      if (result.success) {
        $('pkgAdminText').textContent = `✅ ${action === 'delete' ? 'Uninstalled' : action === 'update' ? 'Updated' : 'Installed'} ${name} with admin privileges!`;
        $('pkgAdminIndicator').className = 'pkg-admin-indicator success';
        showActionLog(result.message || 'Done.');
        lastFailedAction = null;
        setTimeout(() => loadPackages(), 1500);
      } else {
        $('pkgAdminText').textContent = `⚠️ Failed: ${result.message}`;
        $('pkgAdminIndicator').className = 'pkg-admin-indicator warning';
        showActionLog(result.message || 'Unknown error');
      }
    } catch (err) { $('pkgAdminText').textContent = '⚠️ Elevation failed: ' + err.message; }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
  });

  $('pkgTabNpm')?.addEventListener('click', () => switchPackageTab('npm'));
  $('pkgTabPip')?.addEventListener('click', () => switchPackageTab('pip'));

  const pkgSearch = $('pkgSearch');
  if (pkgSearch) {
    pkgSearch.addEventListener('input', (e) => {
      const cache = currentPkgType === 'npm' ? npmPackages : pipPackages;
      renderPackages(cache, e.target.value);
    });
  }

  $('pkgRefreshBtn')?.addEventListener('click', () => loadPackages());

  const installInput = $('pkgInstallInput');
  const installBtn = $('pkgInstallBtn');
  if (installInput) installInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleInstallPackage(); });
  if (installBtn) installBtn.addEventListener('click', () => handleInstallPackage());

  $('pkgLogClose')?.addEventListener('click', () => {
    const panel = $('pkgLogPanel');
    if (panel) panel.style.display = 'none';
  });

  document.getElementById('pkgListBody')?.addEventListener('click', (e) => {
    // Click on package name → show details popup
    const nameEl = e.target.closest('.pkg-name');
    if (nameEl) {
      // Find the parent row's data
      const row = nameEl.closest('.pkg-row');
      const pkgName = row?.dataset?.pkgName;
      if (pkgName) { showPackagePopup(pkgName); return; }
    }
    // Click on action button → update/delete
    const btn = e.target.closest('.pkg-action-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    const pkgName = btn.dataset.pkg;
    if (action && pkgName) handlePackageAction(action, pkgName);
  });

  window.addEventListener('beforeunload', stopAutoRefresh);
});
