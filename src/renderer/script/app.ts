/* ============================================================
   🎯 DASHBOARD APP ORCHESTRATOR (ES Module Entry Point)
   ============================================================
   Coordinates all dashboard sections (init/update/destroy
   contract), window controls, theme toggle, navigation, and the
   auto-refresh cycle. All section logic lives in ./sections/*.ts;
   this file only wires them together. (Phase 2 → 4 TS)

   Phase 6 — Low-End Performance:
     • Perf mode multiplier slows every poll (Low Power / Low-End)
     • Hidden-section pausing: update() calls skip inactive sections
     • Developer section is lazily initialized on first open
   Phase 7 — Settings section integration (theme mode, accent,
     perf mode, reduced motion, sidebar collapse).
   ============================================================ */

import { updateMetricBar } from './utils.js';
import { initCharts, cpuLineChart, memLineChart, vmLineChart, donutChart, updateCharts, repaintCharts, setChartsActive } from './charts.js';
import {
  THEME_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  SIDEBAR_STORAGE_KEY,
  REFRESH_INTERVAL_MS,
  DISK_INTERVAL_MS,
  PROCESS_INTERVAL_MS,
  NET_SPEED_INTERVAL_MS,
  PERF_MODE_MULTIPLIER,
  TEMP_PROBE_CYCLES,
  LOW_END_MODE_CLASS,
  type PerfMode,
} from './constants.js';
import { init as initOverview, update as updateOverview, destroy as destroyOverview } from './sections/overview-section.js';
import { init as initSystem, update as updateSystem, destroy as destroySystem } from './sections/system-section.js';
import { init as initPerformance, update as updatePerformance, destroy as destroyPerformance } from './sections/performance-section.js';
import { init as initNetwork, update as updateNetwork, destroy as destroyNetwork, loadNetworkSpeed } from './sections/network-section.js';
import { init as initDisk, update as updateDisk, destroy as destroyDisk } from './sections/disk-section.js';
import { init as initProcesses, update as updateProcesses, destroy as destroyProcesses, processCache, renderProcesses } from './sections/processes-section.js';
import { init as initBattery, update as updateBattery, destroy as destroyBattery } from './sections/battery-section.js';
import { init as initDeveloper, update as updateDeveloper, destroy as destroyDeveloper } from './sections/developer-section.js';
import { init as initSettings, update as updateSettings, destroy as destroySettings } from './sections/settings-section.js';
import type { SystemInfo, VirtualMemory } from '../../shared/ipc/contracts.js';

// ──────────────────────────────────────────────
// 🧠 Virtual Memory Cache (persists across refresh cycles)
// ──────────────────────────────────────────────
let _cachedVirtualMemory: VirtualMemory | null = null;

/** Last full SystemInfo snapshot — lets charts repaint instantly on activation. */
let _lastSystemInfo: SystemInfo | null = null;

// ──────────────────────────────────────────────
// ⚙️ App settings (Phase 7) — merged defaults + localStorage
// ──────────────────────────────────────────────

interface DashboardSettings {
  theme: 'system' | 'light' | 'dark';
  accentColor: string;
  perfMode: PerfMode;
  reducedMotion: boolean;
}

const DEFAULT_SETTINGS: DashboardSettings = {
  theme: 'dark',
  accentColor: '#6366f1',
  perfMode: 'balanced',
  reducedMotion: false,
};

function loadSettings(): DashboardSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(patch: Partial<DashboardSettings>): DashboardSettings {
  const next = { ...loadSettings(), ...patch };
  try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next)); } catch (e) { /* storage unavailable */ }
  return next;
}

// ──────────────────────────────────────────────
// 🪟 WINDOW CONTROLS
// ──────────────────────────────────────────────

document.getElementById('minimizeBtn')!.addEventListener('click', () => window.electronAPI.minimize());
document.getElementById('maximizeBtn')!.addEventListener('click', () => window.electronAPI.maximize());
document.getElementById('closeBtn')!.addEventListener('click', () => window.electronAPI.close());

// ──────────────────────────────────────────────
// 🌓 THEME TOGGLE (Phase 7: system/light/dark + accent)
// ──────────────────────────────────────────────

const MOON_SVG = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
const SUN_SVG = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';

function resolveThemeMode(mode: DashboardSettings['theme']): boolean {
  if (mode === 'light') return true;
  if (mode === 'dark') return false;
  // system
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

function applyTheme(): void {
  const settings = loadSettings();
  const isLight = resolveThemeMode(settings.theme);
  document.body.classList.toggle('light-theme', isLight);
  document.getElementById('themeLabel')!.textContent = isLight ? 'Light Mode' : 'Dark Mode';
  document.getElementById('themeIcon')!.innerHTML = isLight ? SUN_SVG : MOON_SVG;
  // Accent color via CSS variables (Phase 7). The secondary shade is derived
  // from the chosen accent so the gradient stays cohesive when the user picks
  // a custom color (the plain hex → rgba conversion in utils.ts would break
  // on 3-digit hex, so we only parse 6-digit/8-digit values and fall back).
  document.documentElement.style.setProperty('--accent-primary', settings.accentColor);
  document.documentElement.style.setProperty('--accent-secondary', deriveAccentSecondary(settings.accentColor));
  localStorage.setItem(THEME_STORAGE_KEY, isLight ? 'light' : 'dark');
}

/**
 * Apply the Low-End perf-mode body class (Phase 6). CSS + canvas code read
 * it to strip expensive effects (backdrop blur, infinite animations, chart
 * glows, gauge tweens, HiDPI backing stores). Exposed via the window bridge
 * so settings-section.ts can re-apply it live when the perf mode changes.
 */
function applyPerfMode(): void {
  const lowEnd = loadSettings().perfMode === 'lowEnd';
  document.body.classList.toggle(LOW_END_MODE_CLASS, lowEnd);
}

/** Derive a slightly purple-tinted secondary accent from the primary hex. */
function deriveAccentSecondary(hex: string): string {
  const m = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex || '');
  if (!m) return '#8b5cf6'; // default fallback matches :root
  const full = m[1].slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // Blend 20% of the classic #8b5cf6 secondary into the primary — the result
  // is provably < 255 for any 6-digit hex, so no clamping is needed.
  const nr = Math.round(r * 0.8 + 139 * 0.2);
  const ng = Math.round(g * 0.8 + 92 * 0.2);
  const nb = Math.round(b * 0.8 + 246 * 0.2);
  return `#${[nr, ng, nb].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function toggleTheme(): void {
  // Add transition class to animate the switch
  document.body.classList.add('theme-transition');
  const current = loadSettings().theme;
  const nextMode: DashboardSettings['theme'] = current === 'light' ? 'dark' : 'light';
  saveSettings({ theme: nextMode });
  applyTheme();
  // Remove transition class after animation completes
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.body.classList.remove('theme-transition');
    }, 500);
  });
}

try {
  // Backwards-compat: old stored value was 'light' | 'dark' only.
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') {
    if (!localStorage.getItem(SETTINGS_STORAGE_KEY)) saveSettings({ theme: saved });
  }
} catch (e) { /* ignore */ }

applyTheme();

document.getElementById('themeToggle')!.addEventListener('click', toggleTheme);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
    e.preventDefault();
    toggleTheme();
  }
});

// Follow OS theme changes in "system" mode
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (loadSettings().theme === 'system') applyTheme();
});

// ──────────────────────────────────────────────
// 🧭 SIDEBAR NAVIGATION (Phase 7: collapsible + keyboard nav)
// ──────────────────────────────────────────────

const navItems = document.querySelectorAll<HTMLElement>('.nav-item');
const sections = document.querySelectorAll('.dashboard-section');

function setActiveSection(section: string): void {
  navItems.forEach(n => n.classList.toggle('active', n.dataset.section === section));
  sections.forEach(s => s.classList.toggle('active', s.id === `section-${section}`));
  // Phase 6: pause hidden-canvas painting. Charts only live in the Performance
  // section, so its canvases stop drawing (history keeps recording) while the
  // user is elsewhere — a real CPU/GPU win on low-end hardware.
  setChartsActive(section === 'performance');
  if (section === 'performance') {
    requestAnimationFrame(() => {
      cpuLineChart?.resize();
      memLineChart?.resize();
      vmLineChart?.resize();
      if (donutChart && donutChart['_lastSlices']) donutChart.draw(donutChart['_lastSlices']);
      // Repaint with the freshest snapshot so charts are never stale when the
      // section opens (drawing was paused while hidden — updateDatasets only
      // runs while active, otherwise the user would see up to one refresh
      // interval of old data, 6 s on Low-End). repaintCharts draws from the
      // already-recorded history without pushing a duplicate data point.
      if (_lastSystemInfo) repaintCharts(_lastSystemInfo);
    });
  }
}

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;
    if (!section) return;
    setActiveSection(section);
  });
});

// Keyboard navigation: ArrowUp/Down or Home/End move between nav items.
let navFocusIndex = 0;
const sectionOrder = Array.from(navItems).map(n => n.dataset.section || '');
document.addEventListener('keydown', (e) => {
  const isNavKey = ['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '].includes(e.key);
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement?.tagName || ''));
  if (!isNavKey || typing) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    if (e.key === 'Home') navFocusIndex = 0;
    else if (e.key === 'End') navFocusIndex = sectionOrder.length - 1;
    else if (e.key === 'ArrowDown') navFocusIndex = Math.min(sectionOrder.length - 1, navFocusIndex + 1);
    else navFocusIndex = Math.max(0, navFocusIndex - 1);
    const target = sectionOrder[navFocusIndex];
    if (target) setActiveSection(target);
  }
});

// Sidebar collapse toggle (Phase 7)
const sidebarToggle = document.getElementById('sidebarCollapseBtn');
if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
  });
}
try {
  if (localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1') document.body.classList.add('sidebar-collapsed');
} catch (e) { /* ignore */ }

// ──────────────────────────────────────────────
// 🌡️ TEMP/FAN PROBE THROTTLING (Phase 6)
// ──────────────────────────────────────────────
// loadCpuTempInfo/loadGpuTempInfo/loadFanInfo spawn shell commands in the
// main process — throttling them by perf mode cuts main-process load on
// low-end machines (Balanced: ~3 s, Low Power: ~6 s, Low-End: ~12 s).

let tempProbeTick = 0;

/**
 * Probe cadence gate. Advances an internal cycle counter and returns true
 * every TEMP_PROBE_CYCLES refresh cycles. (Named for its mutation side
 * effect — it advances the counter, it doesn't just read state.)
 */
function nextTempProbeDue(): boolean {
  return tempProbeTick++ % TEMP_PROBE_CYCLES === 0;
}

// ──────────────────────────────────────────────
// 🔄 WINDOW MAXIMIZE DETECTION
// ──────────────────────────────────────────────

function updateMaximizeIcon(isMaximized: boolean): void {
  const btn = document.getElementById('maximizeBtn')!;
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
// Phase 3 completion: single banner → dismissible toast stack, so multiple
// main-process issues queue instead of overwriting each other.
// ──────────────────────────────────────────────

type ToastEl = HTMLElement & { _hideTimer?: number };

function getToastStack(): HTMLElement {
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(message: string, kind: 'error' | 'info' = 'error'): void {
  const stack = getToastStack();
  const toast = document.createElement('div') as ToastEl;
  toast.className = `toast toast-${kind}`;

  const text = document.createElement('span');
  text.className = 'toast-message';
  text.textContent = kind === 'error' ? `⚠️ ${message}` : message;
  toast.appendChild(text);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'toast-dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss notification');
  dismiss.textContent = '✕';
  dismiss.addEventListener('click', () => {
    clearTimeout(toast._hideTimer);
    toast.remove();
    // Drop the empty stack container once the last toast is gone.
    if (!stack.hasChildNodes()) stack.remove();
  });
  toast.appendChild(dismiss);

  stack.appendChild(toast);
  // Cap the queue so a burst of errors can't cover the whole UI.
  while (stack.children.length > 4) stack.firstElementChild?.remove();

  requestAnimationFrame(() => toast.classList.add('visible'));
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      toast.remove();
      if (!stack.hasChildNodes()) stack.remove();
    }, 300);
  }, 10000);
}

window.electronAPI.onMainError((payload) => {
  showToast(payload?.message || 'Unknown main-process error');
});

// ──────────────────────────────────────────────
// 📡 DATA UPDATER (Phase 6: pause hidden sections + perf mode)
// ──────────────────────────────────────────────

/** Which sections are currently visible (from sidebar state). */
let activeSection: string = 'overview';

async function loadSystemInfo(): Promise<void> {
  try {
    const info = await window.electronAPI.getSystemInfo();
    _lastSystemInfo = info;
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
    // Phase 6 — only update the section the user is looking at
    if (activeSection === 'network') updateNetwork(info);
    if (activeSection === 'battery') updateBattery(info);
    if (activeSection === 'developer') updateDeveloper();
    updateCharts(info);
    if ((activeSection === 'performance' || activeSection === 'overview') && nextTempProbeDue()) {
      loadCpuTempInfo();
      loadGpuTempInfo();
      loadFanInfo();
    }
  } catch (err) {
    console.error('Failed to load system info:', err);
  }
}

// ──────────────────────────────────────────────
// 🌡️ CPU TEMPERATURE
// ──────────────────────────────────────────────

async function loadCpuTempInfo(): Promise<void> {
  const overviewEl = document.getElementById('cpuTempOverview');
  const metricEl = document.getElementById('cpuTempMetric');
  const chartTempEl = document.getElementById('chartCpuTemp');
  const metricItemEl = document.querySelector<HTMLElement>('.metric-item[data-metric="temp"]');

  // Informative no-sensor state instead of a bare "N/A" — this machine has no
  // readable CPU thermal sensor (Windows often exposes none), so hiding behind
  // a raw placeholder would be misleading. Tooltips explain why on hover.
  const setNoSensor = (): void => {
    if (overviewEl) {
      overviewEl.textContent = 'No sensor';
      overviewEl.style.color = 'var(--text-muted)';
      overviewEl.title = 'No CPU temperature sensor detected';
    }
    if (metricEl) {
      metricEl.textContent = 'No sensor';
      metricEl.style.color = 'var(--text-muted)';
      metricEl.title = 'No CPU temperature sensor detected';
    }
    if (metricItemEl) {
      metricItemEl.classList.remove('metric-temp-warm', 'metric-temp-hot');
    }
    if (chartTempEl) {
      chartTempEl.textContent = 'Temp: No sensor';
      chartTempEl.style.color = 'var(--text-muted)';
      chartTempEl.title = 'No CPU temperature sensor detected';
    }
    updateMetricBar('cpuTempBarMetric', 0);
  };

  try {
    const temp = await window.electronAPI.getCpuTemp();
    if (temp && temp > 0 && isFinite(temp)) {
      const tempText = `${temp.toFixed(0)}°C`;
      const statusColor = temp > 75 ? 'var(--danger)' : temp > 55 ? 'var(--warning)' : 'var(--success)';

      // Overview metric card (next to GPU Temp)
      if (overviewEl) {
        overviewEl.textContent = tempText;
        overviewEl.style.color = statusColor;
        overviewEl.title = '';
      }
      // Live System Metrics row (Performance)
      if (metricEl) {
        metricEl.textContent = tempText;
        metricEl.style.color = statusColor;
        metricEl.title = '';
      }
      if (metricItemEl) {
        metricItemEl.classList.toggle('metric-temp-hot', temp > 75);
        metricItemEl.classList.toggle('metric-temp-warm', temp > 55 && temp <= 75);
      }
      // CPU Load History card chip (Performance)
      if (chartTempEl) {
        chartTempEl.textContent = `Temp: ${tempText}`;
        chartTempEl.style.color = statusColor;
        chartTempEl.title = '';
      }
      updateMetricBar('cpuTempBarMetric', Math.min(Math.max(temp, 0), 100));
    } else {
      setNoSensor();
    }
  } catch (err) {
    console.error('Failed to load CPU temp:', err);
    setNoSensor();
  }
}

// ──────────────────────────────────────────────
// 🌀 FAN SPEED (CPU/GPU fan RPM — Linux hwmon / Windows WMI best-effort)
// ──────────────────────────────────────────────

async function loadFanInfo(): Promise<void> {
  const heroEl = document.getElementById('fanRpmValue');
  const cpuEl = document.getElementById('cpuFanRpm');
  const gpuEl = document.getElementById('gpuFanRpm');

  // Format a fan reading honoring its unit (tachometer RPM vs GPU percent).
  const fmt = (f: { rpm: number; unit?: 'rpm' | 'pct' }): string =>
    f.unit === 'pct' ? `${f.rpm.toFixed(0)}%` : `${f.rpm.toFixed(0)} RPM`;
  // Bar scale: % fans map 0-100 directly; RPM fans use a ~6000 RPM full scale.
  const barPct = (f: { rpm: number; unit?: 'rpm' | 'pct' }): number =>
    f.unit === 'pct' ? Math.min(Math.max(f.rpm, 0), 100) : (f.rpm / 6000) * 100;

  const setNoSensor = (): void => {
    if (heroEl) {
      heroEl.textContent = 'No sensor';
      heroEl.classList.add('no-sensor');
      heroEl.title = 'No fan speed sensor exposed by the OS';
    }
    updateMetricBar('fanRpmBar', 0);
    if (cpuEl) { cpuEl.textContent = '--'; cpuEl.style.color = 'var(--text-muted)'; cpuEl.title = 'No fan speed sensor exposed by the OS'; }
    if (gpuEl) { gpuEl.textContent = '--'; gpuEl.style.color = 'var(--text-muted)'; gpuEl.title = 'No fan speed sensor exposed by the OS'; }
  };

  try {
    const result = await window.electronAPI.getFanInfo();
    const fans = (result && result.fans) || [];
    const cpuFan = fans.find(f => f.kind === 'cpu');
    const gpuFan = fans.find(f => f.kind === 'gpu');

    if (!result || !result.supported || fans.length === 0) {
      setNoSensor();
      return;
    }

    // Hero shows the highest-value fan. Normalize to a common RPM scale before
    // comparing so a pct fan (0-100) never loses to a low-RPM tach by raw value.
    const heroFan = [...fans].sort((a, b) =>
      (b.unit === 'pct' ? (b.rpm / 100) * 6000 : b.rpm) -
      (a.unit === 'pct' ? (a.rpm / 100) * 6000 : a.rpm)
    )[0];
    if (heroEl) {
      heroEl.textContent = fmt(heroFan);
      heroEl.classList.remove('no-sensor');
      heroEl.title = heroFan.label || 'Fan';
    }
    updateMetricBar('fanRpmBar', barPct(heroFan));

    if (cpuEl && cpuFan) {
      cpuEl.textContent = fmt(cpuFan);
      cpuEl.title = cpuFan.label || 'CPU Fan';
      cpuEl.style.color = cpuFan.unit === 'pct'
        ? (cpuFan.rpm > 80 ? 'var(--danger)' : 'var(--success)')
        : (cpuFan.rpm > 4000 ? 'var(--danger)' : 'var(--success)');
    } else if (cpuEl) {
      cpuEl.textContent = 'N/A';
      cpuEl.style.color = 'var(--text-muted)';
      cpuEl.title = '';
    }
    if (gpuEl && gpuFan) {
      gpuEl.textContent = fmt(gpuFan);
      gpuEl.title = gpuFan.label || 'GPU Fan';
      gpuEl.style.color = gpuFan.unit === 'pct'
        ? (gpuFan.rpm > 80 ? 'var(--danger)' : 'var(--success)')
        : (gpuFan.rpm > 4000 ? 'var(--danger)' : 'var(--success)');
    } else if (gpuEl) {
      gpuEl.textContent = 'N/A';
      gpuEl.style.color = 'var(--text-muted)';
      gpuEl.title = '';
    }
  } catch (err) {
    console.error('Failed to load fan info:', err);
    setNoSensor();
  }
}

// ──────────────────────────────────────────────
// 🎮 GPU TEMPERATURE (fetched separately for Overview)
// ──────────────────────────────────────────────

async function loadGpuTempInfo(): Promise<void> {
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
// ⏱️ AUTO-REFRESH (Phase 6: perf-mode multiplier + lazy developer)
// ──────────────────────────────────────────────

let refreshTimer: number | null = null;
let diskInterval: number | null = null;
let processInterval: number | null = null;
let netSpeedInterval: number | null = null;
let developerInitialized = false;

function perfMultiplier(): number {
  return PERF_MODE_MULTIPLIER[loadSettings().perfMode] || 1;
}

async function scheduleRefresh(): Promise<void> {
  try { await loadSystemInfo(); }
  catch (err) { console.error('Refresh error:', err); }
  refreshTimer = setTimeout(scheduleRefresh, REFRESH_INTERVAL_MS * perfMultiplier());
}

function startAutoRefresh(): void {
  scheduleRefresh();
  scheduleDiskPoll();
  scheduleProcessPoll();
  scheduleNetSpeedPoll();
  // Developer is lazy: only fetch packages after the section is first opened.
  // We still call init() once so listeners are wired, but package scanning
  // itself is deferred inside developer-section.init() until visible.
}

// ──────────────────────────────────────────────
// 🐢 SLOW POLLS (Phase 6 completion)
// ──────────────────────────────────────────────
// Disk / processes / network-speed used fixed setInterval()s sized once at
// startup, so changing the perf mode mid-session never re-tuned them. These
// are now self-scheduling setTimeout() chains that re-read perfMultiplier()
// every cycle — flip the setting and every poll adapts on its next tick.

async function scheduleDiskPoll(): Promise<void> {
  try { await updateDisk(); } catch (e) { console.error('Disk poll error:', e); }
  diskInterval = setTimeout(scheduleDiskPoll, DISK_INTERVAL_MS * perfMultiplier());
}

async function scheduleProcessPoll(): Promise<void> {
  try { await updateProcesses(); } catch (e) { console.error('Process poll error:', e); }
  processInterval = setTimeout(scheduleProcessPoll, PROCESS_INTERVAL_MS * perfMultiplier());
}

async function scheduleNetSpeedPoll(): Promise<void> {
  try { await loadNetworkSpeed(); } catch (e) { console.error('Network speed poll error:', e); }
  netSpeedInterval = setTimeout(scheduleNetSpeedPoll, NET_SPEED_INTERVAL_MS * perfMultiplier());
}

function stopAutoRefresh(): void {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  if (diskInterval) { clearTimeout(diskInterval); diskInterval = null; }
  if (processInterval) { clearTimeout(processInterval); processInterval = null; }
  if (netSpeedInterval) { clearTimeout(netSpeedInterval); netSpeedInterval = null; }
  window.electronAPI.removeMaximizeListeners();
  window.electronAPI.removeMainErrorListeners();
  const stack = document.getElementById('toastStack');
  if (stack) {
    stack.querySelectorAll<ToastEl>('.toast').forEach(t => clearTimeout(t._hideTimer));
    stack.remove();
  }
  cpuLineChart?.destroy();
  memLineChart?.destroy();
  vmLineChart?.destroy();
  destroySystem();
  destroyOverview();
  destroyPerformance();
  destroyNetwork();
  destroyDisk();
  destroyProcesses();
  destroyBattery();
  destroyDeveloper();
  destroySettings();
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
  initSettings();
  updateSettings();

  // Charts start in the hidden Performance section (app boots on Overview),
  // so painting is off until the user first opens Performance (Phase 6).
  setChartsActive(false);

  // Track active section (so hidden sections pause their update work).
  document.querySelectorAll<HTMLElement>('.nav-item').forEach(n => {
    n.addEventListener('click', () => {
      const section = n.dataset.section;
      if (section) {
        activeSection = section;
        if (section === 'developer' && !developerInitialized) {
          developerInitialized = true;
          initDeveloper();
        }
      }
    });
  });

  applyPerfMode();
  startAutoRefresh();

  const searchInput = document.getElementById('processSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderProcesses(processCache, (e.target as HTMLInputElement).value);
    });
  }

  window.addEventListener('beforeunload', stopAutoRefresh);
});

// The settings section reads these helpers through a window bridge to avoid a
// circular import (app → settings → app). Assign them explicitly — ES module
// exports do NOT land on window on their own (Phase 7).
Object.assign(window, { persistSettings: saveSettings, applyTheme, readSettings: loadSettings, applyPerfMode });
