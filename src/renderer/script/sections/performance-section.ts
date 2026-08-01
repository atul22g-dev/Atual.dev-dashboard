/* ============================================================
   ⚡ PERFORMANCE SECTION - Performance metrics + Live System Metrics
   Contract: init() / update(info) / destroy() (Phase 2 → 4 TS)
   ============================================================ */

import { $, formatBytes, formatUptime, updateMetricBar, toggleMetricClass } from '../utils.js';
import { cpuRingGauge, memRingGauge, vmRingGauge } from '../charts.js';
import { formatCpuModel } from '../format.js';
import type { SystemInfo } from '../../../shared/ipc/contracts.js';

/** No persistent resources — this section only paints snapshots. */
export function init(): void {
  // nothing to set up
}

export function update(info: SystemInfo): void {
  const cpuLoad = info.cpuUsage !== undefined ? info.cpuUsage : Math.min((info.loadAvg[0] / info.cpus) * 100, 100);
  $('cpuLoadValue').textContent = `${cpuLoad.toFixed(1)}%`;
  $('cpuLoadBar').style.width = `${cpuLoad}%`;
  $('cpuCoresPerf').textContent = String(info.cpus);
  $('cpuModelPerf').textContent = info.cpuModel || 'Unknown';

  const usedMem = info.totalMemory - info.freeMemory;
  const memPercent = (usedMem / info.totalMemory) * 100;
  $('memUsageValue').textContent = `${memPercent.toFixed(1)}%`;
  $('memUsageBar').style.width = `${Math.min(memPercent, 100)}%`;
  $('memUsedDetail').textContent = formatBytes(usedMem);
  $('memFreeDetail').textContent = formatBytes(info.freeMemory);
  const memVirtual = $('memVirtualDetail');
  if (memVirtual && info.virtualMemory && info.virtualMemory.total) {
    memVirtual.textContent = `${formatBytes(info.virtualMemory.used)} / ${formatBytes(info.virtualMemory.total)}`;
  }

  // Live System Metrics
  const infoCpuLoad = info.cpuUsage !== undefined ? info.cpuUsage : 0;
  $('cpuLoadMetric').textContent = `${infoCpuLoad.toFixed(1)}%`;
  $('memUsageMetric').textContent = `${memPercent.toFixed(1)}%`;

  const load1 = info.loadAvg[0];
  const load5 = info.loadAvg[1];
  const load15 = info.loadAvg[2];
  const cpus = info.cpus || 1;
  $('load1mMetric').textContent = `${load1.toFixed(1)}%`;
  $('load5mMetric').textContent = `${load5.toFixed(1)}%`;
  $('load15mMetric').textContent = `${load15.toFixed(1)}%`;
  $('freeMemMetric').textContent = formatBytes(info.freeMemory);
  $('metricsCpuSpeed').textContent = info.cpuSpeed && info.cpuSpeed > 0 ? `Clock: ${(info.cpuSpeed / 1000).toFixed(2)} GHz` : 'Clock: --';
  $('metricsCores').textContent = `Cores: ${info.cpus}`;
  $('metricsUptime').textContent = `Uptime: ${formatUptime(info.uptime)}`;

  updateMetricBar('cpuLoadBarMetric', infoCpuLoad);
  updateMetricBar('memUsageBarMetric', memPercent);
  updateMetricBar('load1mBar', Math.min(load1, 100));
  updateMetricBar('load5mBar', Math.min(load5, 100));
  updateMetricBar('load15mBar', Math.min(load15, 100));
  const freePct = ((info.freeMemory / info.totalMemory) * 100);
  updateMetricBar('freeBarMetric', freePct);

  toggleMetricClass('metric-cpu-high', infoCpuLoad > 75, document.querySelector('[data-metric="cpu"]'));
  toggleMetricClass('metric-mem-high', memPercent > 80, document.querySelector('[data-metric="mem"]'));
  toggleMetricClass('metric-load1m-high', (load1 / cpus) * 100 > 75, document.querySelector('[data-metric="load1m"]'));
  toggleMetricClass('metric-load5m-high', (load5 / cpus) * 100 > 75, document.querySelector('[data-metric="load5m"]'));
  toggleMetricClass('metric-load15m-high', (load15 / cpus) * 100 > 75, document.querySelector('[data-metric="load15m"]'));
  toggleMetricClass('metric-free-low', freePct < 20, document.querySelector('[data-metric="free"]'));

  if (cpuRingGauge) {
    cpuRingGauge.setValue(cpuLoad);
    $('cpuGaugeValue').textContent = `${cpuLoad.toFixed(1)}%`;
    $('gaugeCpuCores').textContent = `${info.cpus}`;
    $('gaugeCpuModel').textContent = formatCpuModel(info.cpuModel);
    if (info.cpuSpeed && info.cpuSpeed > 0) {
      $('gaugeCpuSpeed').textContent = `${(info.cpuSpeed / 1000).toFixed(2)} GHz`;
    } else {
      $('gaugeCpuSpeed').textContent = '-';
    }
  }

  if (memRingGauge) {
    memRingGauge.setValue(memPercent);
    $('memGaugeValue').textContent = `${memPercent.toFixed(1)}%`;
    $('gaugeMemUsed').textContent = formatBytes(usedMem);
    $('gaugeMemFree').textContent = formatBytes(info.freeMemory);
    $('gaugeMemTotal').textContent = formatBytes(info.totalMemory);
  }

  if (vmRingGauge) {
    const vmPct = info.virtualMemory && info.virtualMemory.total > 0
      ? ((info.virtualMemory.used / info.virtualMemory.total) * 100)
      : 0;
    vmRingGauge.setValue(vmPct);
    $('vmGaugeValue').textContent = `${vmPct.toFixed(1)}%`;
    if (info.virtualMemory && info.virtualMemory.total > 0) {
      $('gaugeVmUsed').textContent = formatBytes(info.virtualMemory.used);
      $('gaugeVmFree').textContent = formatBytes(info.virtualMemory.free);
      $('gaugeVmTotal').textContent = formatBytes(info.virtualMemory.total);
    }
  }
}

/** No timers or listeners to release. */
export function destroy(): void {
  // nothing to clean up
}
