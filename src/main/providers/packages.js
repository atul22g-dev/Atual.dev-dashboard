/* ============================================================
   📦 PROVIDER — PACKAGES (Phase 2 split from main.js)
   npm/pip global package management, whitelisted elevation,
   admin checks, and registry search/autocomplete.
   Phase 3: all shell calls go through command-service.js.
   ============================================================ */

'use strict';

const os = require('os');
const https = require('https');
const { runCommand } = require('../command-service');
// 🛡️ Phase 1 — every renderer-supplied value passes through these validators
// before it can reach a shell command or registry call.
const {
  validatePackageAction,
  validatePackageRequest,
  validateSearchQuery,
} = require('../validators');

// ──────────────────────────────────────────────
// 👑 ADMIN / ELEVATION CHECK
// ──────────────────────────────────────────────

/**
 * Check if the app is running with admin/root privileges
 */
async function checkAdminStatus() {
  const platform = os.platform();

  if (platform === 'win32') {
    // Windows: 'net session' only works for administrators
    const result = await runCommand('net session', { timeout: 3000 });
    return { isAdmin: result.ok, platform };
  }
  // macOS/Linux: check UID (0 = root)
  try {
    const isRoot = process.getuid && process.getuid() === 0;
    return { isAdmin: !!isRoot, platform };
  } catch (e) {
    return { isAdmin: false, platform };
  }
}

/**
 * Check if npm/pip global directories typically need admin privileges
 * npm: /usr/local/lib/node_modules (macOS/Linux) or AppData/Roaming/npm (Windows - usually no admin)
 * pip: system Python directories often need admin
 */
async function checkNpmNeedsAdmin() {
  const platform = os.platform();
  if (platform === 'win32') {
    // On Windows, npm global packages usually go to AppData (no admin needed)
    const result = await runCommand('npm config get prefix', { timeout: 5000 });
    if (!result.ok) return true; // Can't determine, assume needed
    const prefix = result.stdout.trim().toLowerCase();
    // If npm prefix is in Program Files, admin is needed
    return prefix.includes('program files') || prefix.includes('\\nodejs');
  }
  // macOS/Linux: default npm prefix /usr/local requires sudo
  const result = await runCommand('npm config get prefix 2>/dev/null', { timeout: 5000 });
  if (!result.ok) return true;
  const prefix = result.stdout.trim();
  return prefix.startsWith('/usr') || prefix.startsWith('/opt');
}

/**
 * Run a command with elevated privileges
 * Shows OS-level elevation prompt (UAC on Windows, password prompt on macOS/Linux)
 * Returns { success, message }
 *
 * 🛡️ Phase 1 — this is INTERNAL ONLY. The renderer can never pass a command
 * string; it only requests runPackageElevated(action, type, name) which
 * validates and builds the command here from the whitelist.
 */
async function runCommandElevated(cmd) {
  const platform = os.platform();

  if (platform === 'win32') {
    // Windows: Use PowerShell Start-Process with -Verb RunAs for UAC elevation
    // Wrap the command so we can capture output
    const psScript = `powershell -NoProfile -Command "
        $proc = Start-Process -FilePath cmd.exe -ArgumentList '/c ${cmd.replace(/"/g, '\\"')}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden;
        exit $proc.ExitCode
      "`;
    const result = await runCommand(psScript, { timeout: 120000 });
    if (!result.ok) {
      // User declined UAC or elevation failed
      const msg = (result.stderr || '').includes('Access is denied')
        ? 'Elevation cancelled or access denied'
        : (result.message || 'Elevation failed');
      return { success: false, message: msg };
    }
    return { success: true, message: result.stdout || 'Command completed' };
  }

  if (platform === 'darwin') {
    // macOS: Use osascript for GUI password prompt
    const script = `osascript -e 'do shell script "${cmd.replace(/"/g, '\\"')}" with administrator privileges'`;
    const result = await runCommand(script, { timeout: 120000 });
    if (!result.ok) {
      return { success: false, message: 'Elevation cancelled or failed' };
    }
    return { success: true, message: result.stdout || 'Command completed' };
  }

  // Linux: Use pkexec (GUI password prompt) or gksudo
  const script = `pkexec ${cmd}`;
  const result = await runCommand(script, { timeout: 120000 });
  if (!result.ok) {
    return { success: false, message: 'Elevation cancelled or failed' };
  }
  return { success: true, message: result.stdout || 'Command completed' };
}

/**
 * 🛡️ Phase 1 — elevated package operation (replaces the generic
 * renderer-controlled `run-elevated(cmd)` channel).
 * Only whitelisted actions (install|update|delete) for whitelisted managers
 * (npm|pip) with a validated package name can ever be elevated.
 */
async function runPackageElevated(action, type, name) {
  const actionResult = validatePackageAction(action);
  if (!actionResult.ok) {
    return { success: false, message: actionResult.error };
  }
  const valid = validatePackageRequest(type, name);
  if (!valid.ok) {
    return { success: false, message: valid.error };
  }
  const cmd = buildPackageCommand(actionResult.action, valid.type, valid.name);
  if (!cmd) {
    return { success: false, message: 'Unknown package type' };
  }
  return runCommandElevated(cmd);
}

// ──────────────────────────────────────────────
// 📦 GLOBAL PACKAGE LISTS
// ──────────────────────────────────────────────

/**
 * 📦 Get list of globally installed npm packages
 * Uses `npm list -g --depth=0 --json` to get installed packages
 */
async function getNpmPackages() {
  const cmd = process.platform === 'win32'
    ? 'npm list -g --depth=0 --json'
    : 'npm list -g --depth=0 --json 2>/dev/null';

  const result = await runCommand(cmd, { timeout: 10000 });
  if (!result.ok) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    const deps = parsed.dependencies || {};
    return Object.entries(deps).map(([name, info]) => ({
      name,
      version: info.version || '?',
      description: info.description || '',
    }));
  } catch (e) {
    return [];
  }
}

/**
 * 🐍 Get list of globally installed pip packages
 * Uses `pip list --format=json` (or pip3 if available)
 */
async function getPipPackages() {
  // Try pip3 first, fallback to pip
  const cmd = process.platform === 'win32'
    ? 'pip list --format=json 2>nul || pip3 list --format=json 2>nul'
    : 'pip3 list --format=json 2>/dev/null || pip list --format=json 2>/dev/null';

  const result = await runCommand(cmd, { timeout: 10000 });
  if (!result.ok) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    const packages = (parsed || []).map(pkg => ({
      name: pkg.name,
      version: pkg.version || '?',
      description: '',
    }));
    // Fetch descriptions from PyPI JSON API in batches
    return fetchPipDescriptions(packages);
  } catch (e) {
    return [];
  }
}

// ──────────────────────────────────────────────
// ⬆️ PACKAGE OPERATIONS (whitelisted + validated)
// ──────────────────────────────────────────────

/**
 * 🛡️ Build a package manager command from a WHITELISTED action + validated
 * name. The renderer never supplies the command string — only (action, type,
 * name), and those are validated before this is called.
 * Returns the command (without output redirection) or null for unknown type.
 */
function buildPackageCommand(action, type, name) {
  if (type === 'npm') {
    if (action === 'install') return `npm install -g ${name}`;
    if (action === 'update') return `npm install -g ${name}@latest`;
    if (action === 'delete') return `npm uninstall -g ${name}`;
    return null;
  }
  if (type === 'pip') {
    const pipCmd = process.platform === 'win32' ? 'pip' : 'pip3';
    if (action === 'install') return `${pipCmd} install ${name}`;
    if (action === 'update') return `${pipCmd} install --upgrade ${name}`;
    if (action === 'delete') return `${pipCmd} uninstall -y ${name}`;
    return null;
  }
  return null;
}

/** Extract the last N non-empty output lines for a user-facing message. */
function tailLines(stdout, stderr, count) {
  const source = (stderr || stdout || '').trim();
  return source.split('\n').filter(l => l.trim()).slice(-count).join('\n');
}

/**
 * ⬆️ Update a global package (npm or pip)
 * Works for both npm and Python packages
 */
async function updatePackage(type, name) {
  // 🛡️ Phase 1 — validate BEFORE building any shell command
  const valid = validatePackageRequest(type, name);
  if (!valid.ok) {
    return { success: false, message: valid.error };
  }
  const base = buildPackageCommand('update', valid.type, valid.name);
  if (!base) {
    return { success: false, message: 'Unknown package type' };
  }
  const result = await runCommand(`${base} 2>&1`, { timeout: 60000 });
  if (!result.ok) {
    const errorOutput = tailLines(result.stderr, result.stdout, 5);
    return { success: false, message: errorOutput || result.message || 'Update failed' };
  }
  return { success: true, message: tailLines(result.stdout, '', 3) };
}

/**
 * 📥 Install a new global package (npm or pip)
 */
async function installPackage(type, name) {
  // 🛡️ Phase 1 — validate BEFORE building any shell command
  const valid = validatePackageRequest(type, name);
  if (!valid.ok) {
    return { success: false, message: valid.error };
  }
  const base = buildPackageCommand('install', valid.type, valid.name);
  if (!base) {
    return { success: false, message: 'Unknown package type' };
  }
  const result = await runCommand(`${base} 2>&1`, { timeout: 120000 });
  if (!result.ok) {
    const errorOutput = tailLines(result.stderr, result.stdout, 5);
    return { success: false, message: errorOutput || result.message || 'Installation failed' };
  }
  return { success: true, message: tailLines(result.stdout, '', 3) };
}

/**
 * 🗑️ Delete (uninstall) a global package
 */
async function deletePackage(type, name) {
  // 🛡️ Phase 1 — validate BEFORE building any shell command
  const valid = validatePackageRequest(type, name);
  if (!valid.ok) {
    return { success: false, message: valid.error };
  }
  const base = buildPackageCommand('delete', valid.type, valid.name);
  if (!base) {
    return { success: false, message: 'Unknown package type' };
  }
  const result = await runCommand(`${base} 2>&1`, { timeout: 30000 });
  if (!result.ok) {
    const errorOutput = tailLines(result.stderr, result.stdout, 5);
    return { success: false, message: errorOutput || result.message || 'Uninstall failed' };
  }
  return { success: true, message: tailLines(result.stdout, '', 3) };
}

// ──────────────────────────────────────────────
// 🔍 PACKAGE SEARCH (registry autocomplete)
// ──────────────────────────────────────────────

/**
 * Search npm registry for packages matching a query
 * Uses the npm public registry API
 */
function searchNpmRegistry(query) {
  return new Promise((resolve) => {
    // 🛡️ Phase 1 — validate the renderer-supplied query before any network call
    const valid = validateSearchQuery(query);
    if (!valid.ok) { resolve([]); return; }
    const q = encodeURIComponent(valid.query);
    const url = `https://registry.npmjs.org/-/v1/search?text=${q}&size=8`;
    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const results = (parsed.objects || []).map(obj => ({
            name: obj.package.name,
            version: obj.package.version,
            description: (obj.package.description || '').substring(0, 120),
          }));
          resolve(results);
        } catch (e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

/**
 * Fetch pip package description from PyPI JSON API
 */
function fetchPipDescription(name) {
  return new Promise((resolve) => {
    const url = `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve((parsed.info?.summary || '').substring(0, 200));
        } catch (e) { resolve(''); }
      });
    }).on('error', () => resolve(''));
  });
}

/**
 * Fetch descriptions for multiple pip packages in batches
 */
async function fetchPipDescriptions(packages) {
  const batchSize = 5;
  for (let i = 0; i < packages.length; i += batchSize) {
    const batch = packages.slice(i, i + batchSize);
    const descs = await Promise.all(batch.map(p => fetchPipDescription(p.name)));
    batch.forEach((pkg, j) => { pkg.description = descs[j]; });
  }
  return packages;
}

/**
 * Search pip registry for packages matching a query
 * Uses pip index command (newer pip) or pip search (older pip)
 */
async function searchPipRegistry(query) {
  // 🛡️ Phase 1 — validate the renderer-supplied query before any shell command
  const valid = validateSearchQuery(query);
  if (!valid.ok) return [];
  const escaped = valid.query;

  // Try pip index versions first (newer pip)
  const pipCmd = process.platform === 'win32' ? 'pip' : 'pip3';
  const result = await runCommand(`${pipCmd} index versions "${escaped}" 2>nul`, { timeout: 8000 });
  if (result.ok && result.stdout && result.stdout.trim()) {
    const lines = result.stdout.trim().split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      const versionMatch = lines[0].match(/available versions: (.+)/i);
      const versions = versionMatch ? versionMatch[1].split(',') : [];
      const pkgNameMatch = lines[0].match(/^(.+?)\(/);
      const name = pkgNameMatch ? pkgNameMatch[1].trim() : escaped;
      // Fetch description from PyPI API
      const desc = await fetchPipDescription(name);
      return [{
        name,
        version: versions[0]?.trim() || '',
        description: desc.substring(0, 120),
      }];
    }
  }
  return [];
}

// Only the surface consumed by ipc.js (and cross-provider callers) is exported;
// the rest (runCommandElevated, buildPackageCommand, fetchPipDescription(s)) are
// module-private implementation details of this provider.
module.exports = {
  checkAdminStatus,
  checkNpmNeedsAdmin,
  runPackageElevated,
  getNpmPackages,
  getPipPackages,
  updatePackage,
  installPackage,
  deletePackage,
  searchNpmRegistry,
  searchPipRegistry,
};
