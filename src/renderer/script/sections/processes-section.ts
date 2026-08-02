/* ============================================================
   ⚙️ PROCESSES SECTION - Running processes list (Phase 4 TS)
   Contract: init() / update() / destroy() (Phase 2)
   ============================================================ */

import { $, formatBytes, showSectionError, clearSectionError } from '../utils.js';
import type { ProcessInfo } from '../../../shared/ipc/contracts.js';

export let processCache: ProcessInfo[] = [];
let isLoadingProcesses = false;

/** No persistent resources — this section only paints snapshots. */
export function init(): void {
  // nothing to set up
}

export async function update(): Promise<void> {
  if (isLoadingProcesses) return;
  isLoadingProcesses = true;
  try {
    const procs = await window.electronAPI.getProcessList();
    processCache = procs;
    renderProcesses(procs, '');
    clearSectionError('processes');
  } catch (err) {
    console.error('Failed to load processes:', err);
    showSectionError('processes', 'Failed to load the process list. Retrying automatically…', () => { void update(); });
  } finally {
    isLoadingProcesses = false;
  }
}

export function renderProcesses(processes: ProcessInfo[], filter: string): void {
  const tbody = document.getElementById('processTableBody');
  if (!tbody) return;

  tbody.querySelectorAll('.process-row').forEach(r => r.remove());
  const loading = tbody.querySelector('.process-loading');
  if (loading) loading.remove();

  if (!processes || processes.length === 0) {
    tbody.innerHTML = '<div class="process-loading">No process data available</div>';
    return;
  }

  const filtered = filter
    ? processes.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()))
    : processes;

  if (filtered.length === 0) {
    tbody.innerHTML = '<div class="process-loading">No processes match your search</div>';
    return;
  }

  const maxMem = Math.max(...filtered.map(p => p.memory), 1);

  // Phase 6 completion: build all rows into a DocumentFragment and attach
  // once, so a 30-row rebuild is a single layout/reflow instead of 30.
  const fragment = document.createDocumentFragment();
  filtered.forEach(proc => {
    const row = document.createElement('div');
    row.className = 'process-row';
    const memBarWidth = (proc.memory / maxMem) * 100;

    // Build the row with DOM APIs — dynamic values via textContent (auto-escaped)
    const pid = document.createElement('span');
    pid.className = 'proc-pid';
    pid.textContent = String(proc.pid);
    const name = document.createElement('span');
    name.className = 'proc-name';
    name.textContent = proc.name;
    const cpu = document.createElement('span');
    cpu.className = 'proc-cpu';
    cpu.textContent = proc.cpu.toFixed(1) + '%';
    const mem = document.createElement('span');
    mem.className = 'proc-mem';
    mem.textContent = formatBytes(proc.memory);
    const barWrap = document.createElement('span');
    barWrap.className = 'proc-bar-container';
    const barFill = document.createElement('span');
    barFill.className = 'proc-bar-fill';
    barFill.style.width = memBarWidth + '%';
    barWrap.appendChild(barFill);

    row.append(pid, name, cpu, mem, barWrap);
    fragment.appendChild(row);
  });
  tbody.appendChild(fragment);

  $('processTotal').textContent = String(filtered.length);
  const totalMem = filtered.reduce((s, p) => s + p.memory, 0);
  $('processTotalMem').textContent = formatBytes(totalMem);
}

/** No timers or listeners to release (polling is owned by app.js). */
export function destroy(): void {
  // nothing to clean up
}
