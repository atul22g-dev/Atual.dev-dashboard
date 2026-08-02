/* ============================================================
   🌀 PROVIDER — FAN RPM
   CPU/GPU fan speeds where the OS exposes them without extra
   drivers:
     • Linux — /sys/class/hwmon/hwmonN/fanN_input (world-readable
       sysfs; chip `name` + fanN_label identify CPU vs GPU fans)
     • Windows — best-effort WMI Win32_Fan DesiredSpeed (often
       empty on modern boards; no unprivileged tachometer API)
     • macOS  — no unprivileged fan RPM path → no data
   Returns { supported, fans: [{ id, label, rpm }] }; every failure
   path degrades to { supported:false, fans:[] } so the renderer
   always gets a safe shape. (Phase 2 provider split conventions.)
   ============================================================ */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { runCommandFile } = require('../command-service');

/** Default "no fan data" result (renderer hides/degrades gracefully). */
function noFans() {
  return { supported: false, fans: [] };
}

/**
 * Classify a hwmon chip as GPU (amdgpu/nvidia) or CPU/system based on the
 * chip `name` file. GPU drivers expose their own hwmon chip, so this is the
 * reliable cross-vendor signal; anything else is treated as a CPU/system fan.
 */
function classifyFanChip(chipName) {
  const n = String(chipName || '').toLowerCase();
  if (n.includes('amdgpu') || n.includes('nvidia')) return 'gpu';
  return 'cpu';
}

/** Match a sysfs fan sensor file, e.g. "fan1_input" → idx 1. */
const FAN_INPUT_RE = /^fan(\d+)_input$/;

/**
 * Pure: build fan entries from one hwmon chip's file contents.
 * `fileContents` maps sysfs file names ("fan1_input", "fan1_label") to text.
 * Exported for unit tests (no fs, no shell).
 */
function parseLinuxFanEntries(chipName, fileContents) {
  const fans = [];
  for (const file of Object.keys(fileContents)) {
    const m = FAN_INPUT_RE.exec(file);
    if (!m) continue;
    const idx = m[1];
    const raw = parseInt(String(fileContents[file] || '').trim(), 10);
    if (!Number.isFinite(raw) || raw <= 0) continue; // 0 rpm → ignore
    const kind = classifyFanChip(chipName);
    const labelFile = `fan${idx}_label`;
    const label = (fileContents[labelFile] || '').trim();
    fans.push({
      id: `fan${idx}`,
      kind,
      label: label || (kind === 'gpu' ? 'GPU Fan' : `CPU Fan ${idx}`),
      rpm: raw,
      unit: 'rpm',
    });
  }
  return fans;
}

/**
 * Pure: parse Windows WMI output lines ("FAN1=2450") into fan entries.
 * Win32_Fan reports DesiredSpeed (target), not a true tachometer — treated
 * as best-effort. Exported for unit tests.
 */
function parseWindowsFanLines(stdout) {
  const fans = [];
  const lines = String(stdout || '').split(/[\r\n]+/);
  for (const line of lines) {
    const m = /^FAN(\d+)=(\d+)\s*$/i.exec(line.trim());
    if (!m) continue;
    const rpm = parseInt(m[2], 10);
    if (!Number.isFinite(rpm) || rpm <= 0) continue;
    fans.push({ id: `fan${m[1]}`, kind: 'cpu', label: `Fan ${m[1]}`, rpm, unit: 'rpm' });
  }
  return fans;
}

/**
 * Linux: scan every hwmon chip for fan sensors. sysfs fan*_input files are
 * world-readable, so no privileges are needed. Dynamic hwmonN numbering is
 * handled by iterating the directory (never hardcoding hwmon0).
 */
async function getLinuxFanInfo() {
  const hwmonDir = '/sys/class/hwmon';
  let entries;
  try {
    entries = fs.readdirSync(hwmonDir, { withFileTypes: true });
  } catch (e) {
    return noFans(); // not Linux, or no hwmon support
  }

  const fans = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const chipPath = path.join(hwmonDir, entry.name);
    let files;
    try {
      files = fs.readdirSync(chipPath);
    } catch (e) {
      continue;
    }
    const fanInputs = files.filter(f => FAN_INPUT_RE.test(f));
    if (fanInputs.length === 0) continue;

    let chipName = '';
    try { chipName = fs.readFileSync(path.join(chipPath, 'name'), 'utf8').trim(); } catch (e) { /* no name */ }

    const fileContents = {};
    for (const f of fanInputs) {
      try { fileContents[f] = fs.readFileSync(path.join(chipPath, f), 'utf8'); } catch (e) { /* skip unreadable */ }
      const labelFile = `fan${FAN_INPUT_RE.exec(f)[1]}_label`;
      if (files.includes(labelFile)) {
        try { fileContents[labelFile] = fs.readFileSync(path.join(chipPath, labelFile), 'utf8'); } catch (e) { /* skip */ }
      }
    }
    fans.push(...parseLinuxFanEntries(chipName, fileContents));
  }
  return fans.length > 0 ? { supported: true, fans } : noFans();
}

/**
 * Windows: fan detection tries, in order:
 *   1. WMI Win32_Fan DesiredSpeed via PowerShell CIM (shell-free — the old
 *      shell-wrapped form broke under cmd.exe quoting, same defect as the CPU
 *      temp / battery probes; fixed 2026-08-02). Often empty on modern boards.
 *   2. nvidia-smi GPU fan speed (0–100 %) — real data on NVIDIA desktop cards;
 *      mobile GPUs usually report [N/A] and fall through.
 * Every failure degrades to { supported:false } so the renderer shows an
 * honest "No sensor" instead of fabricating readings.
 */
async function getWindowsFanInfo() {
  // Method 1: WMI Win32_Fan (shell-free, args array).
  const psScript = `&{$fans=Get-CimInstance Win32_Fan -ErrorAction SilentlyContinue;if($fans){$i=1;foreach($f in $fans){echo ('FAN' + $i + '=' + $f.DesiredSpeed);$i++}}}`;
  const result = await runCommandFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 5000 });
  if (result.ok && result.stdout) {
    const fans = parseWindowsFanLines(result.stdout);
    if (fans.length > 0) return { supported: true, fans };
  }

  // Method 2: nvidia-smi GPU fan percentage (best-effort; often [N/A] on
  // laptops, real on desktops).
  const nvidiaFans = await getNvidiaGpuFan();
  if (nvidiaFans.length > 0) return { supported: true, fans: nvidiaFans };
  return noFans();
}

/**
 * NVIDIA GPU fan speed via nvidia-smi (0–100 %). Returns [] when the GPU
 * reports no tachometer (mobile GPUs expose [N/A]). Exported for unit tests.
 */
async function getNvidiaGpuFan() {
  const result = await runCommandFile('nvidia-smi', ['--query-gpu=fan.speed', '--format=csv,noheader'], { timeout: 5000 });
  if (!result.ok || !result.stdout) return [];
  const val = parseInt(result.stdout.trim().split(/[\r\n]+/)[0]?.trim(), 10);
  if (!Number.isFinite(val) || val <= 0 || val > 100) return [];
  return [{ id: 'gpu0', kind: 'gpu', label: 'GPU Fan', rpm: val, unit: 'pct' }];
}

/** macOS has no unprivileged fan RPM API — gracefully report no data. */
function getMacFanInfo() {
  return noFans();
}

/** 🌀 Get fan RPM where the platform exposes it (Linux native, Windows best-effort). */
async function getFanInfo() {
  try {
    const platform = os.platform();
    if (platform === 'linux') return await getLinuxFanInfo();
    if (platform === 'win32') return await getWindowsFanInfo();
    if (platform === 'darwin') return getMacFanInfo();
    return noFans();
  } catch (e) {
    return noFans();
  }
}

module.exports = {
  getFanInfo,
  parseLinuxFanEntries,
  parseWindowsFanLines,
  classifyFanChip,
  getNvidiaGpuFan,
};
