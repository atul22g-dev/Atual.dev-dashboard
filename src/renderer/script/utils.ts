/* ============================================================
   🧰 SHARED UTILITIES - Helper functions used by all scripts
   Phase 4: first module converted to TypeScript (utils.js → utils.ts)
   ============================================================ */

/** Convert bytes to human-readable format (e.g., "1.5 GB") */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

/** Convert seconds to "Xd Xh Xm Xs" format */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m ${secs}s`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

/** Convert platform code to display name */
export function formatPlatform(platform: string): string {
  const names: Record<string, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
  return names[platform] || platform;
}

/** Convert hex color (#6366f1) to rgba with opacity */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Shorthand for document.getElementById() — returns a non-null element.
 * Every call site targets an id that exists in index.html, so we assert
 * non-null to keep the hot paths free of `!` noise (Phase 4).
 */
export const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

/** Update a metric progress bar with smooth animation and threshold colors */
export function updateMetricBar(barId: string, percent: number): void {
  const el = document.getElementById(barId);
  if (!el) return;
  const pct = Math.max(0, Math.min(100, percent || 0));
  el.style.width = `${pct}%`;
  el.classList.remove('bar-warning', 'bar-danger');
  if (pct > 75) el.classList.add('bar-danger');
  else if (pct > 50) el.classList.add('bar-warning');
}

/** Toggle a CSS class on a metric item element */
export function toggleMetricClass(className: string, condition: unknown, element: HTMLElement | null): void {
  if (!element) return;
  element.classList.toggle(className, !!condition);
}

/**
 * Show a user-visible error banner at the top of a dashboard section.
 * (Phase 3 — no important failure should only appear in console.error.)
 * Phase 3 completion: the banner carries an optional Retry button so the
 * user can immediately re-trigger the failed fetch (Loading → Success →
 * Error → Retry state machine) instead of waiting for the auto-refresh.
 * @param sectionId e.g. 'disk', 'network', 'processes', 'battery'
 * @param message human-readable failure text
 * @param onRetry optional zero-arg callback wired to the Retry button
 */
export function showSectionError(sectionId: string, message: string, onRetry?: () => void): void {
  const section = document.getElementById(`section-${sectionId}`);
  if (!section) return;
  let banner = section.querySelector<HTMLElement>('.section-error');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'section-error';
    section.prepend(banner);
  }
  banner.replaceChildren();
  const text = document.createElement('span');
  text.textContent = message;
  banner.appendChild(text);
  if (onRetry) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'section-error-retry';
    btn.textContent = '↻ Retry';
    btn.setAttribute('aria-label', 'Retry loading this section');
    btn.addEventListener('click', () => {
      clearSectionError(sectionId);
      onRetry();
    });
    banner.appendChild(btn);
  }
  banner.style.display = 'flex';
}

/** Hide the section error banner (called on a successful refresh). */
export function clearSectionError(sectionId: string): void {
  const section = document.getElementById(`section-${sectionId}`);
  const banner = section?.querySelector<HTMLElement>('.section-error');
  if (banner) banner.style.display = 'none';
}
