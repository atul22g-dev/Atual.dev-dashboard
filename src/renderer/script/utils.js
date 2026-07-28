/* ============================================================
   🧰 SHARED UTILITIES - Helper functions used by all scripts
   ============================================================ */

/** Convert bytes to human-readable format (e.g., "1.5 GB") */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

/** Convert seconds to "Xd Xh Xm Xs" format */
export function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m ${secs}s`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

/** Convert platform code to display name */
export function formatPlatform(platform) {
  const names = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
  return names[platform] || platform;
}

/** Format load average to 2 decimal places */
export function formatLoadAvg(val) {
  return val.toFixed(2);
}

/** Convert hex color (#6366f1) to rgba with opacity */
export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Shorthand for document.getElementById() */
export const $ = (id) => document.getElementById(id);

/** Update a metric progress bar with smooth animation and threshold colors */
export function updateMetricBar(barId, percent) {
  const el = document.getElementById(barId);
  if (!el) return;
  const pct = Math.max(0, Math.min(100, percent || 0));
  el.style.width = `${pct}%`;
  el.classList.remove('bar-warning', 'bar-danger');
  if (pct > 75) el.classList.add('bar-danger');
  else if (pct > 50) el.classList.add('bar-warning');
}

/** Toggle a CSS class on a metric item element */
export function toggleMetricClass(className, condition, element) {
  if (!element) return;
  element.classList.toggle(className, !!condition);
}
