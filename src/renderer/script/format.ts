/* ============================================================
   🎨 FORMAT — shared renderer formatting helpers (Phase 2 → 4 TS)
   ============================================================ */

/** Format a byte/second rate into a human-readable speed string. */
export function formatSpeed(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return '--';
  if (bps < 0) return '--';
  if (bps < 1000) return `${bps.toFixed(0)} B/s`;
  if (bps < 1000000) return `${(bps / 1000).toFixed(1)} KB/s`;
  if (bps < 1000000000) return `${(bps / 1000000).toFixed(2)} MB/s`;
  return `${(bps / 1000000000).toFixed(2)} GB/s`;
}

/**
 * Shorten a CPU model name for small UI slots (gauges).
 * Strips "(R)", "CPU", clock speeds and parenthetical suffixes,
 * then truncates to ~22 chars with an ellipsis if needed.
 */
export function formatCpuModel(model?: string): string {
  const m = model || 'Unknown';
  const short = m.replace(/^\(R\)|\s*CPU|\s*@\s*[\d.]+GHz|\s*\d+\.\d+GHz|\s*\(.*?\)/gi, '').trim() || m.split('/')[0];
  return short.length > 25 ? short.substring(0, 22) + '...' : short;
}

/** True when a package-command error message indicates a permissions problem. */
export function isPermissionError(message?: string): boolean {
  const msg = (message || '').toLowerCase();
  return msg.includes('eacces') ||
    msg.includes('eperm') ||
    msg.includes('access is denied') ||
    msg.includes('permission denied');
}
