/* ============================================================
   🧪 PROVIDER TESTS — src/main/providers/fan.js (Phase 5 pattern)
   ============================================================
   Tests the pure parsers directly (no fs/shell) and the platform
   dispatch with a mocked command-service + os.platform, so zero
   real sysfs reads or PowerShell calls ever run.
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { mockCommandService, mockPlatform, loadProvider, okResult, failResult } = require('./_mock-command-service');

const ok = okResult;
const fail = failResult;

// ──────────────────────────────────────────────
// Pure parsers
// ──────────────────────────────────────────────

test('fan: classifyFanChip identifies GPU chips vs CPU/system', async () => {
  const { classifyFanChip } = loadProvider('../src/main/providers/fan.js');
  assert.equal(classifyFanChip('amdgpu'), 'gpu');
  assert.equal(classifyFanChip('nvidia'), 'gpu');
  assert.equal(classifyFanChip('coretemp'), 'cpu');
  assert.equal(classifyFanChip('nct6775'), 'cpu');
  assert.equal(classifyFanChip(''), 'cpu');
});

test('fan: parseLinuxFanEntries builds cpu/gpu fans from sysfs contents', async () => {
  const { parseLinuxFanEntries } = loadProvider('../src/main/providers/fan.js');

  const cpuChip = parseLinuxFanEntries('nct6775', {
    'fan1_input': '1200\r\n',
    'fan1_label': 'CPU_FAN\r\n',
    'fan2_input': '0\r\n', // 0 rpm → ignored
    'fan3_input': 'not-a-number\r\n', // garbage → ignored
  });
  assert.equal(cpuChip.length, 1);
  assert.equal(cpuChip[0].id, 'fan1');
  assert.equal(cpuChip[0].kind, 'cpu');
  assert.equal(cpuChip[0].label, 'CPU_FAN');
  assert.equal(cpuChip[0].rpm, 1200);

  const gpuChip = parseLinuxFanEntries('amdgpu', { 'fan1_input': '2400\n' });
  assert.equal(gpuChip.length, 1);
  assert.equal(gpuChip[0].kind, 'gpu');
  assert.equal(gpuChip[0].label, 'GPU Fan'); // default label when none given
  assert.equal(gpuChip[0].rpm, 2400);
});

test('fan: parseWindowsFanLines parses WMI FANn=rpm output', async () => {
  const { parseWindowsFanLines } = loadProvider('../src/main/providers/fan.js');
  const fans = parseWindowsFanLines('FAN1=2450\r\nFAN2=0\r\nFAN3=1500\r\n');
  assert.equal(fans.length, 2);
  assert.equal(fans[0].id, 'fan1');
  assert.equal(fans[0].kind, 'cpu');
  assert.equal(fans[0].rpm, 2450);
  assert.equal(fans[0].unit, 'rpm');
  assert.equal(fans[1].id, 'fan3');
});

test('fan: getNvidiaGpuFan parses nvidia-smi percent (0-100) and rejects N/A', async () => {
  // mockCommandService must run BEFORE loadProvider — the provider destructures
  // runCommandFile at require-time, so re-require after each mock swap.
  mockCommandService({ runCommandFile: async () => ok('67\r\n') });
  let { getNvidiaGpuFan } = loadProvider('../src/main/providers/fan.js');
  const fans = await getNvidiaGpuFan();
  assert.equal(fans.length, 1);
  assert.equal(fans[0].kind, 'gpu');
  assert.equal(fans[0].rpm, 67);
  assert.equal(fans[0].unit, 'pct');

  mockCommandService({ runCommandFile: async () => ok('[N/A]\r\n') });
  ({ getNvidiaGpuFan } = loadProvider('../src/main/providers/fan.js'));
  assert.deepEqual(await getNvidiaGpuFan(), []);
});

// ──────────────────────────────────────────────
// Platform dispatch (no real shell / sysfs)
// ──────────────────────────────────────────────

test('fan: Linux dispatch degrades to noFans when hwmon dir is missing', async () => {
  mockPlatform('linux');
  // fan.js no longer uses runCommand (shell-free only) — pass an empty mock
  // so the helper defaults stand in for the unused runCommandFile binding.
  mockCommandService({});

  const { getFanInfo } = loadProvider('../src/main/providers/fan.js');
  const info = await getFanInfo();
  assert.deepEqual(info, { supported: false, fans: [] });
});

test('fan: Windows dispatch parses WMI fans via shell-free PowerShell', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommandFile: async (file, args) => {
      const cmd = (args || []).join(' ');
      if (file === 'powershell' && cmd.includes('Get-CimInstance Win32_Fan')) return ok('FAN1=3100\r\nFAN2=1800\r\n');
      return fail();
    },
  });

  const { getFanInfo } = loadProvider('../src/main/providers/fan.js');
  const info = await getFanInfo();
  assert.equal(info.supported, true);
  assert.equal(info.fans.length, 2);
  assert.equal(info.fans[0].rpm, 3100);
});

test('fan: Windows falls back to nvidia-smi GPU fan % when WMI is empty', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommandFile: async (file, args) => {
      const cmd = (args || []).join(' ');
      if (file === 'powershell' && cmd.includes('Get-CimInstance Win32_Fan')) return ok('FAN1=\r\nFAN2=\r\n'); // null DesiredSpeed
      if (file === 'nvidia-smi') return ok('67\r\n');
      return fail();
    },
  });

  const { getFanInfo } = loadProvider('../src/main/providers/fan.js');
  const info = await getFanInfo();
  assert.equal(info.supported, true);
  assert.equal(info.fans.length, 1);
  assert.equal(info.fans[0].kind, 'gpu');
  assert.equal(info.fans[0].unit, 'pct');
  assert.equal(info.fans[0].rpm, 67);
});

test('fan: Windows dispatch returns noFans when WMI + nvidia-smi are empty or fail', async () => {
  mockPlatform('win32');
  mockCommandService({
    runCommandFile: async (file, args) => {
      const cmd = (args || []).join(' ');
      if (file === 'powershell' && cmd.includes('Get-CimInstance Win32_Fan')) return ok('');
      if (file === 'nvidia-smi') return ok('[N/A]\r\n');
      return fail();
    },
  });

  const { getFanInfo } = loadProvider('../src/main/providers/fan.js');
  const empty = await getFanInfo();
  assert.deepEqual(empty, { supported: false, fans: [] });

  mockCommandService({
    runCommandFile: async (file, args) => {
      const cmd = (args || []).join(' ');
      if (file === 'powershell' && cmd.includes('Get-CimInstance Win32_Fan')) return fail();
      if (file === 'nvidia-smi') return fail();
      return fail();
    },
  });
  const { getFanInfo: reloaded } = loadProvider('../src/main/providers/fan.js');
  const failed = await reloaded();
  assert.deepEqual(failed, { supported: false, fans: [] });
});

test('fan: unsupported platforms (darwin/other) return noFans', async () => {
  mockPlatform('darwin');
  const { getFanInfo } = loadProvider('../src/main/providers/fan.js');
  const mac = await getFanInfo();
  assert.deepEqual(mac, { supported: false, fans: [] });

  mockPlatform('freebsd');
  const { getFanInfo: other } = loadProvider('../src/main/providers/fan.js');
  const otherResult = await other();
  assert.deepEqual(otherResult, { supported: false, fans: [] });
});
