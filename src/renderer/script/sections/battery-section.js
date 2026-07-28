/* ============================================================
   🔋 BATTERY SECTION - Power status and battery metrics
   ============================================================ */

import { $, formatBytes, formatUptime, formatPlatform } from '../utils.js';
import { RingGauge } from '../gauges.js';

export let batteryGauge = null;
let _batteryDetails = null;
const _batteryLevelHistory = [];

function setBatteryField(id, value, alwaysShow = false) {
  const el = document.getElementById(id);
  if (!el) return;
  const hasData = value !== null && value !== undefined && value !== '' && 
                  value !== '--' && value !== 'N/A' && 
                  !(typeof value === 'string' && value.trim() === '');
  el.textContent = hasData ? String(value) : '--';
  const row = el.closest('.info-row, .battery-stat');
  if (row) row.style.display = (hasData || alwaysShow) ? '' : 'none';
}

function hideEmptyBatteryCards() {
  document.querySelectorAll('.dev-detail-card').forEach(card => {
    const visibleRows = card.querySelectorAll('.info-row');
    let anyVisible = false;
    visibleRows.forEach(row => {
      if (row.style.display !== 'none') anyVisible = true;
    });
    card.style.display = anyVisible ? '' : 'none';
  });
}

export function initBatteryGauge() {
  batteryGauge = new RingGauge('batteryGauge', {
    ringWidth: 12,
    lowThreshold: 30,
    midThreshold: 60,
    lowColor: '#ef4444',
    midColor: '#f59e0b',
    highColor: '#22c55e',
    glowIntensity: 0.3,
    animationSpeed: 0.1,
  });
}

export async function loadBatteryInfo(info) {
  try {
    const bat = await window.electronAPI.getBatteryInfo();

    if (bat && bat.hasBattery) {
      const levelPct = (bat.level * 100);
      if (batteryGauge) batteryGauge.setValue(levelPct);

      setBatteryField('batteryLevel', `${levelPct.toFixed(0)}%`, true);
      setBatteryField('batteryStatus', bat.charging ? '⚡ Charging' : '🔋 On Battery', true);
      setBatteryField('batteryStatusDetail', bat.charging ? 'Charging' : 'Discharging', true);
      setBatteryField('batteryPresent', 'Yes', true);
      setBatteryField('batteryAC', bat.acConnected ? 'Yes ✅' : 'No ❌', true);
      setBatteryField('batteryUptime', formatUptime(info.uptime), true);
      setBatteryField('batteryInstalled', 'Yes', true);
      setBatteryField('batteryChargeLevel', `${levelPct.toFixed(0)}%`, true);
      setBatteryField('batteryOnAC', bat.acConnected ? 'Yes' : 'No', true);

      // Charge/Discharge Rate
      const now = Date.now();
      _batteryLevelHistory.push({ level: levelPct, time: now });
      while (_batteryLevelHistory.length > 30) _batteryLevelHistory.shift();
      while (_batteryLevelHistory.length > 1 && _batteryLevelHistory[0].time < now - 60000) _batteryLevelHistory.shift();

      if (_batteryLevelHistory.length >= 2) {
        const first = _batteryLevelHistory[0];
        const last = _batteryLevelHistory[_batteryLevelHistory.length - 1];
        const elapsedMs = last.time - first.time;
        if (elapsedMs >= 5000) {
          const pctChange = last.level - first.level;
          const elapsedHours = elapsedMs / 3600000;
          let ratePerHour = pctChange / elapsedHours;
          if (Math.abs(ratePerHour) > 250) ratePerHour = 0;
          if (Math.abs(ratePerHour) >= 0.5) {
            const sign = ratePerHour > 0 ? '+' : '';
            setBatteryField('batteryRate', `${sign}${ratePerHour.toFixed(1)}%/h`);
            const rateEl = document.getElementById('batteryRate');
            if (rateEl) rateEl.style.color = ratePerHour > 0 ? 'var(--success)' : 'var(--warning)';
          } else {
            setBatteryField('batteryRate', 'Stable');
            const rateEl = document.getElementById('batteryRate');
            if (rateEl) rateEl.style.color = 'var(--text-muted)';
          }
        }
      } else {
        setBatteryField('batteryRate', 'Measuring...');
        const rateEl = document.getElementById('batteryRate');
        if (rateEl) rateEl.style.color = 'var(--text-muted)';
      }

      const runTimeSecs = _batteryDetails?.EstimatedRunTime || _batteryDetails?.estimatedRunTime;
      if (runTimeSecs && parseInt(runTimeSecs) > 0 && parseInt(runTimeSecs) < 100000) {
        const mins = Math.round(parseInt(runTimeSecs) / 60);
        const runtime = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
        setBatteryField('batteryEstRuntime', runtime);
        setBatteryField('batteryEstRuntimeDetail', runtime);
      } else {
        setBatteryField('batteryEstRuntime');
        setBatteryField('batteryEstRuntimeDetail');
      }

      let timeToFull = _batteryDetails?.TimeToFullCharge;
      const ttfVal = parseInt(timeToFull);
      if (!ttfVal || ttfVal <= 0 || ttfVal >= 99999) {
        timeToFull = _batteryDetails?.timeToFullCharge;
      }
      const ttfFinal = parseInt(timeToFull);
      if (ttfFinal > 0 && ttfFinal < 99999) {
        const mins = Math.round(ttfFinal);
        setBatteryField('batteryTimeFull', mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`);
      } else {
        setBatteryField('batteryTimeFull');
      }
    } else {
      const content = document.getElementById('batteryContent');
      if (content) {
        content.innerHTML = `
          <div class="no-battery-message glass">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="7" width="18" height="10" rx="1.5"/>
              <line x1="20" y1="10" x2="22" y2="10"/><line x1="20" y1="13" x2="22" y2="13"/>
              <line x1="9" y1="12" x2="15" y2="12"/>
            </svg>
            <p>No battery detected. This system appears to be running on AC power.</p>
          </div>`;
      }
    }

    setBatteryField('batteryPlatform', formatPlatform(info.platform), true);
    setBatteryField('batteryHostname', info.hostname, true);
    setBatteryField('batterySysUptime', formatUptime(info.uptime), true);
    setBatteryField('batteryOS', `${info.osType} ${info.osRelease}`, true);
    setBatteryField('batteryArch', info.arch, true);
    hideEmptyBatteryCards();
  } catch (err) {
    console.error('Battery info error:', err);
  }
}

export async function loadBatteryDetails() {
  try {
    const details = await window.electronAPI.getBatteryDetails();
    _batteryDetails = details;
  } catch (err) {
    console.error('Failed to load battery details:', err);
  }
}
