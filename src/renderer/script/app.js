/* ============================================================
   🎯 DASHBOARD APP ORCHESTRATOR (ES Module Entry Point)
   ============================================================
   Coordinates all dashboard sections (init/update/destroy
   contract), window controls, theme toggle, navigation, and the
   auto-refresh cycle. All section logic lives in ./sections/*.js;
   this file only wires them together. (Phase 2)
   ============================================================ */

import { updateMetricBar, toggleMetricClass } from './utils.js';
import { cpuRingGauge, memRingGauge, vmRingGauge } from './charts.js';
import { initCharts, cpuLineChart, memLineChart, vmLineChart, donutChart, updateCharts } from './charts.js';
import { THEME_STORAGE_KEY, REFRESH_INTERVAL_MS, DISK_INTERVAL_MS, PROCESS_INTERVAL_MS, NET_SPEED_INTERVAL_MS } from './constants.js';
import { init as initOverview, update as updateOverview, destroy as destroyOverview } from './sections/overview-section.js';
import { init as initSystem, update as updateSystem, destroy as destroySystem } from './sections/system-section.js';
import { init as initPerformance, update as updatePerformance, destroy as destroyPerformance } from './sections/performance-section.js';
import { init as initNetwork, update as updateNetwork, destroy as destroyNetwork, loadNetworkSpeed } from './sections/network-section.js';
import { init as initDisk, update as updateDisk, destroy as destroyDisk } from './sections/disk-section.js';
import { init as initProcesses, update as updateProcesses, destroy as destroyProcesses, processCache, renderProcesses } from './sections/processes-section.js';
import { init as initBattery, update as updateBattery, destroy as destroyBattery } from './sections/battery-section.js';
import { init as initDeveloper, update as updateDeveloper, destroy as destroyDeveloper } from './sections/developer-section.js';

// ──────────────────────────────────────────────
// 🧠 Virtual Memory Cache (persists across refresh cycles)
// ──────────────────────────────────────────────
let _cachedVirtualMemory = null;

// ──────────────────────────────────────────────
// 🪟 WINDOW CONTROLS
// ──────────────────────────────────────────────

document.getElementById('minimizeBtn').addEventListener('click', () => window.electronAPI.minimize());
document.getElementById('maximizeBtn').addEventListener('click', () => window.electronAPI.maximize());
document.getElementById('closeBtn').addEventListener('click', () => window.electronAPI.close());

// ──────────────────────────────────────────────
// 🌓 THEME TOGGLE
// ──────────────────────────────────────────────

const MOON_SVG = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
const SUN_SVG = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';

function applyTheme(isLight) {
  document.body.classList.toggle('light-theme', isLight);
  document.getElementById('themeLabel').textContent = isLight ? 'Light Mode' : 'Dark Mode';
  document.getElementById('themeIcon').innerHTML = isLight ? SUN_SVG : MOON_SVG;
  localStorage.setItem(THEME_STORAGE_KEY, isLight ? 'light' : 'dark');
}

function toggleTheme() {
  // Add transition class to animate the switch
  document.body.classList.add('theme-transition');
  applyTheme(!document.body.classList.contains('light-theme'));
  // Remove transition class after animation completes
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.body.classList.remove('theme-transition');
    }, 500);
  });
}

try {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
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
        if (vmLineChart) vmLineChart.resize();
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
// 🛡️ MAIN-PROCESS CRASH GUARD NOTIFICATIONS (Phase 3)
// ──────────────────────────────────────────────
// uncaughtException / unhandledRejection in the main process are
// logged locally AND pushed here so the user sees them instead of
// a silent failure. The banner auto-hides; the log keeps the full
// stack (userData/logs/main-error.log).

function showMainErrorBanner(message) {
  let banner = document.getElementById('mainErrorBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'mainErrorBanner';
    banner.className = 'main-error-banner';
    document.body.appendChild(banner);
  }
  banner.textContent = `⚠️ Main process issue: ${message}`;
  banner.classList.add('visible');
  clearTimeout(banner._hideTimer);
  banner._hideTimer = setTimeout(() => banner.classList.remove('visible'), 10000);
}

window.electronAPI.onMainError((payload) => {
  showMainErrorBanner(payload?.message || 'Unknown main-process error');
});

// ──────────────────────────────────────────────
// 📡 DATA UPDATER
// ──────────────────────────────────────────────

async function loadSystemInfo() {
  try {
    const info = await window.electronAPI.getSystemInfo();
    // Merge cached virtual memory (if available) to avoid flicker
    if (_cachedVirtualMemory) info.virtualMemory = _cachedVirtualMemory;
    // Fetch fresh virtual memory in background
    window.electronAPI.getVirtualMemory().then(vm => {
      if (vm) {
        _cachedVirtualMemory = vm;
        info.virtualMemory = vm;
        // Re-render sections that use virtual memory
        updateOverview(info);
        updatePerformance(info);
      }
    }).catch(() => {});
    updateSystem(info);
    updateOverview(info);
    updatePerformance(info);
    updateNetwork(info);
    updateBattery(info);
    updateDeveloper(info);
    updateCharts(info);
    loadCpuTempInfo();
    loadGpuTempInfo();
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
// 🎮 GPU TEMPERATURE (fetched separately for Overview)
// ──────────────────────────────────────────────

async function loadGpuTempInfo() {
  try {
    const temp = await window.electronAPI.getGpuTemp();
    const el = document.getElementById('gpuTempOverview');
    if (!el) return;
    if (temp !== null && temp !== undefined && temp > 0 && isFinite(temp)) {
      el.textContent = `${temp.toFixed(0)}°C`;
      el.style.color = temp > 75 ? 'var(--danger)' : temp > 55 ? 'var(--warning)' : 'var(--success)';
    } else {
      el.textContent = 'N/A';
      el.style.color = 'var(--text-muted)';
    }
  } catch (err) {
    const el = document.getElementById('gpuTempOverview');
    if (el) { el.textContent = 'N/A'; el.style.color = 'var(--text-muted)'; }
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
  refreshTimer = setTimeout(scheduleRefresh, REFRESH_INTERVAL_MS);
}

function startAutoRefresh() { scheduleRefresh(); }

function stopAutoRefresh() {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  if (diskInterval) { clearInterval(diskInterval); diskInterval = null; }
  if (processInterval) { clearInterval(processInterval); processInterval = null; }
  if (netSpeedInterval) { clearInterval(netSpeedInterval); netSpeedInterval = null; }
  window.electronAPI.removeMaximizeListeners();
  window.electronAPI.removeMainErrorListeners();
  const banner = document.getElementById('mainErrorBanner');
  if (banner) { clearTimeout(banner._hideTimer); banner.remove(); }
  if (cpuLineChart) cpuLineChart.destroy();
  if (memLineChart) memLineChart.destroy();
  if (vmLineChart) vmLineChart.destroy();
  if (cpuRingGauge) cpuRingGauge.destroy();
  if (memRingGauge) memRingGauge.destroy();
  if (vmRingGauge) vmRingGauge.destroy();
  // Section teardown (battery/developer own real resources; the rest are no-ops)
  destroySystem();
  destroyOverview();
  destroyPerformance();
  destroyNetwork();
  destroyDisk();
  destroyProcesses();
  destroyBattery();
  destroyDeveloper();
}

// ──────────────────────────────────────────────
// 🚀 STARTUP
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  initSystem();
  initOverview();
  initPerformance();
  initNetwork();
  initDisk();
  initProcesses();
  initBattery();
  initDeveloper();
  startAutoRefresh();

  updateDisk();
  updateProcesses();
  loadNetworkSpeed();
  diskInterval = setInterval(updateDisk, DISK_INTERVAL_MS);
  processInterval = setInterval(updateProcesses, PROCESS_INTERVAL_MS);
  netSpeedInterval = setInterval(loadNetworkSpeed, NET_SPEED_INTERVAL_MS);

  const searchInput = document.getElementById('processSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderProcesses(processCache, e.target.value);
    });
  }

  window.addEventListener('beforeunload', stopAutoRefresh);
});
