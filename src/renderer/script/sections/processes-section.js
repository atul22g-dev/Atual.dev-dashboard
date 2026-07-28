/* ============================================================
   ⚙️ PROCESSES SECTION - Running processes list
   ============================================================ */

import { $, formatBytes } from '../utils.js';

export let processCache = [];
let isLoadingProcesses = false;

export async function loadProcesses() {
  if (isLoadingProcesses) return;
  isLoadingProcesses = true;
  try {
    const procs = await window.electronAPI.getProcessList();
    processCache = procs;
    renderProcesses(procs, '');
  } catch (err) {
    console.error('Failed to load processes:', err);
  } finally {
    isLoadingProcesses = false;
  }
}

export function renderProcesses(processes, filter) {
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

  filtered.forEach(proc => {
    const row = document.createElement('div');
    row.className = 'process-row';
    const memBarWidth = (proc.memory / maxMem) * 100;
    row.innerHTML = `
      <span class="proc-pid">${proc.pid}</span>
      <span class="proc-name">${proc.name}</span>
      <span class="proc-cpu">${proc.cpu.toFixed(1)}%</span>
      <span class="proc-mem">${formatBytes(proc.memory)}</span>
      <span class="proc-bar-container">
        <span class="proc-bar-fill" style="width:${memBarWidth}%"></span>
      </span>
    `;
    tbody.appendChild(row);
  });

  $('processTotal').textContent = filtered.length;
  const totalMem = filtered.reduce((s, p) => s + p.memory, 0);
  $('processTotalMem').textContent = formatBytes(totalMem);
}
