/* ============================================================
   📦 DEVELOPER SECTION - Package Manager (npm/pip)
   ============================================================ */

import { $ } from '../utils.js';

/** Escape HTML special chars to prevent XSS */
function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

/** Wrap query matches in a <strong> with highlight class */
function highlightText(text, query) {
  if (!query || !text) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex special chars
  const regex = new RegExp(`(${q})`, 'gi');
  return escaped.replace(regex, '<strong class="pkg-highlight">$1</strong>');
}

export let currentPkgType = 'npm';
export let npmPackages = [];
export let pipPackages = [];
let isLoadingPackages = false;
export let lastFailedAction = null;

export async function loadPackages() {
  if (isLoadingPackages) return;
  isLoadingPackages = true;
  try {
    const body = document.getElementById('pkgListBody');
    if (body) body.innerHTML = '<div class="pkg-loading">Loading packages...</div>';
    hideStatus();

    let packages = [];
    if (currentPkgType === 'npm') {
      packages = await window.electronAPI.getNpmPackages();
      npmPackages = packages;
    } else {
      packages = await window.electronAPI.getPipPackages();
      pipPackages = packages;
    }
    renderPackages(packages, '');
  } catch (err) {
    console.error('Failed to load packages:', err);
    const body = document.getElementById('pkgListBody');
    if (body) body.innerHTML = '<div class="pkg-loading">Failed to load packages. Make sure npm/pip is installed.</div>';
  } finally {
    isLoadingPackages = false;
  }
}

export function renderPackages(packages, filter) {
  const body = document.getElementById('pkgListBody');
  if (!body) return;

  body.querySelectorAll('.pkg-row').forEach(r => r.remove());
  const loading = body.querySelector('.pkg-loading');
  if (loading) loading.remove();

  if (!packages || packages.length === 0) {
    body.innerHTML = '<div class="pkg-loading">No packages found</div>';
    $('pkgTotalCount').textContent = '0';
    $('pkgShowingCount').textContent = '0';
    updatePackageCounts(packages, 0);
    return;
  }

  const filtered = filter
    ? packages.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()) || (p.description && p.description.toLowerCase().includes(filter.toLowerCase())))
    : packages;

  if (filtered.length === 0) {
    body.innerHTML = '<div class="pkg-loading">No packages match your search</div>';
    $('pkgShowingCount').textContent = '0';
    updatePackageCounts(packages, 0);
    return;
  }

  filtered.forEach(pkg => {
    const row = document.createElement('div');
    row.className = 'pkg-row';
    row.dataset.pkgName = pkg.name;
    const highlightedName = filter ? highlightText(pkg.name, filter) : escapeHtml(pkg.name);
    row.innerHTML = `
      <span class="pkg-name" title="${(pkg.description || '').replace(/"/g, '&quot;')}">
        <svg class="pkg-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="14" height="14" rx="2"/>
          <line x1="3" y1="9" x2="17" y2="9"/>
          <line x1="9" y1="3" x2="9" y2="17"/>
        </svg>
        ${highlightedName}
      </span>
      <span class="pkg-version">${pkg.version}</span>
      <span class="pkg-actions">
        <button class="pkg-action-btn update" data-action="update" data-pkg="${pkg.name}" title="Update package">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="1 4 1 10 7 10"/><polyline points="19 16 19 10 13 10"/>
            <path d="M3.5 13.5A8 8 0 0 0 16.5 7.5"/><path d="M16.5 6.5A8 8 0 0 0 3.5 12.5"/>
          </svg>
          Update
        </button>
        <button class="pkg-action-btn delete" data-action="delete" data-pkg="${pkg.name}" title="Uninstall package">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="3 6 5 6 17 6"/><path d="M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/>
            <path d="M5 6l1 10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-10"/>
          </svg>
          Delete
        </button>
      </span>
    `;
    body.appendChild(row);
  });

  $('pkgTotalCount').textContent = packages.length;
  $('pkgShowingCount').textContent = filtered.length;
  updatePackageCounts(packages, filtered.length);
}

// ──────────────────────────────────────────────
// 📋 PACKAGE DETAILS POPUP
// ──────────────────────────────────────────────

let _popupOverlay = null;

function getPopupOverlay() {
  if (!_popupOverlay) {
    _popupOverlay = document.createElement('div');
    _popupOverlay.className = 'pkg-popup-overlay';
    _popupOverlay.addEventListener('click', (e) => {
      if (e.target === _popupOverlay) hidePackagePopup();
    });
    document.addEventListener('keydown', _onPopupKeydown);
    document.body.appendChild(_popupOverlay);
  }
  return _popupOverlay;
}

function _onPopupKeydown(e) {
  if (e.key === 'Escape') hidePackagePopup();
}

export function showPackagePopup(pkgName) {
  // Find the package data from cache
  const cache = currentPkgType === 'npm' ? npmPackages : pipPackages;
  const pkg = cache.find(p => p.name === pkgName);
  if (!pkg) return;

  const overlay = getPopupOverlay();
  const desc = pkg.description || '';
  const safeName = pkg.name.replace(/"/g, '&quot;');
  const safeDesc = desc.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  overlay.innerHTML = `
    <div class="pkg-popup">
      <div class="pkg-popup-header">
        <div class="pkg-popup-title-group">
          <div class="pkg-popup-icon">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="14" height="14" rx="2"/>
              <line x1="3" y1="9" x2="17" y2="9"/>
              <line x1="9" y1="3" x2="9" y2="17"/>
            </svg>
          </div>
          <div>
            <div class="pkg-popup-name">
              ${safeName}
              <span class="pkg-popup-type-badge">${currentPkgType}</span>
            </div>
          </div>
        </div>
        <button class="pkg-popup-close" id="pkgPopupClose" title="Close">✕</button>
      </div>
      <div class="pkg-popup-body">
        <div class="pkg-popup-desc"${desc ? '' : ' data-empty="true"'}>${safeDesc}</div>
        <div class="pkg-popup-detail-grid">
          <div class="pkg-popup-detail-item">
            <span class="pkg-popup-detail-label">Version</span>
            <span class="pkg-popup-detail-value">${pkg.version}</span>
          </div>
          <div class="pkg-popup-detail-item">
            <span class="pkg-popup-detail-label">Package Manager</span>
            <span class="pkg-popup-detail-value">${currentPkgType === 'npm' ? 'npm (Node.js)' : 'pip (Python)'}</span>
          </div>
          <div class="pkg-popup-detail-item">
            <span class="pkg-popup-detail-label">Install Type</span>
            <span class="pkg-popup-detail-value">Global</span>
          </div>
          <div class="pkg-popup-detail-item">
            <span class="pkg-popup-detail-label">Status</span>
            <span class="pkg-popup-detail-value" style="color:var(--success)">Installed</span>
          </div>
        </div>
      </div>
      <div class="pkg-popup-footer">
        <button class="pkg-popup-action-btn update" data-action="updateFromPopup" data-pkg="${safeName}">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="1 4 1 10 7 10"/><polyline points="19 16 19 10 13 10"/>
            <path d="M3.5 13.5A8 8 0 0 0 16.5 7.5"/><path d="M16.5 6.5A8 8 0 0 0 3.5 12.5"/>
          </svg>
          Update
        </button>
        <button class="pkg-popup-action-btn delete" data-action="deleteFromPopup" data-pkg="${safeName}">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="3 6 5 6 17 6"/><path d="M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/>
            <path d="M5 6l1 10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-10"/>
          </svg>
          Uninstall
        </button>
      </div>
    </div>
  `;

  overlay.classList.add('visible');

  // Close button
  const closeBtn = overlay.querySelector('#pkgPopupClose');
  if (closeBtn) closeBtn.addEventListener('click', hidePackagePopup);

  // Action buttons inside popup
  overlay.querySelectorAll('.pkg-popup-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action === 'updateFromPopup' ? 'update' : 'delete';
      const name = btn.dataset.pkg;
      if (name) {
        hidePackagePopup();
        handlePackageAction(action, name);
      }
    });
  });
}

export function hidePackagePopup() {
  if (_popupOverlay) {
    _popupOverlay.classList.remove('visible');
  }
}

function updatePackageCounts(packages, showing) {
  if (currentPkgType === 'npm') $('npmCount').textContent = packages.length;
  else $('pipCount').textContent = packages.length;
}

export function switchPackageTab(type) {
  if (type === currentPkgType) return;
  currentPkgType = type;
  document.querySelectorAll('.pkg-tab').forEach(t => t.classList.remove('active'));
  const tabBtn = type === 'npm' ? $('pkgTabNpm') : $('pkgTabPip');
  if (tabBtn) tabBtn.classList.add('active');
  $('pkgSummaryType').textContent = type;
  const searchInput = $('pkgSearch');
  if (searchInput) searchInput.value = '';
  const cached = type === 'npm' ? npmPackages : pipPackages;
  if (cached.length > 0) renderPackages(cached, '');
  else loadPackages();
}

function showStatus(message, isError = false) {
  const status = $('pkgStatus');
  if (!status) return;
  status.textContent = message;
  status.className = 'pkg-status ' + (isError ? 'error' : 'success');
  status.style.display = 'block';
  clearTimeout(status._hideTimer);
  status._hideTimer = setTimeout(() => { status.style.display = 'none'; }, 5000);
}

function hideStatus() {
  const status = $('pkgStatus');
  if (status) { status.style.display = 'none'; clearTimeout(status._hideTimer); }
}

export function showActionLog(message) {
  const panel = $('pkgLogPanel');
  const content = $('pkgLogContent');
  if (!panel || !content) return;
  content.textContent = message;
  panel.style.display = 'block';
  setTimeout(() => { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100);
}

export async function handlePackageAction(action, pkgName) {
  const body = $('pkgListBody');
  const rows = body?.querySelectorAll('.pkg-row');
  let targetRow = null;
  if (rows) {
    for (const row of rows) {
      if (row.dataset.pkgName === pkgName) { targetRow = row; break; }
    }
  }
  if (targetRow) targetRow.classList.add('pkg-row-loading');
  showStatus(`${action === 'update' ? 'Updating' : 'Uninstalling'} ${pkgName}...`);
  try {
    const result = await window.electronAPI[action === 'update' ? 'updatePackage' : 'deletePackage'](currentPkgType, pkgName);
    if (result.success) {
      showStatus(`${pkgName} ${action === 'update' ? 'updated' : 'uninstalled'} successfully!`);
      showActionLog(result.message || 'Done.');
      lastFailedAction = null;
      setTimeout(() => loadPackages(), 1500);
    } else {
      showStatus(`Failed: ${result.message}`, true);
      showActionLog(result.message || 'Unknown error');
      lastFailedAction = { action, type: currentPkgType, name: pkgName };
      const isPermissionError = result.message.toLowerCase().includes('eacces') ||
        result.message.toLowerCase().includes('eperm') ||
        result.message.toLowerCase().includes('access is denied') ||
        result.message.toLowerCase().includes('permission denied');
      if (isPermissionError) showAdminElevationHint(action, pkgName);
    }
  } catch (err) {
    showStatus(`Error: ${err.message}`, true);
  } finally {
    if (targetRow) targetRow.classList.remove('pkg-row-loading');
  }
}

export async function checkAdminAndElevation() {
  try {
    const bar = $('pkgAdminBar');
    const adminText = $('pkgAdminText');
    const indicator = $('pkgAdminIndicator');
    const elevateBtn = $('pkgElevateBtn');
    const note = $('pkgAdminNote');
    if (!bar || !adminText) return;
    const adminStatus = await window.electronAPI.checkAdmin();
    bar.style.display = 'flex';
    if (adminStatus.isAdmin) {
      adminText.textContent = 'Running as Administrator';
      indicator.className = 'pkg-admin-indicator success';
      if (note) note.textContent = 'All package commands have full system access.';
      if (elevateBtn) elevateBtn.style.display = 'none';
      return;
    }
    const npmNeedsAdmin = await window.electronAPI.checkNpmAdmin();
    if (npmNeedsAdmin) {
      adminText.textContent = '⚠️ Some commands may need administrator privileges';
      indicator.className = 'pkg-admin-indicator warning';
      if (note) note.textContent = 'npm/pip global directory requires admin rights.';
      if (elevateBtn) elevateBtn.style.display = 'flex';
    } else {
      // Admin not needed — hide the bar entirely (no issue to report)
      bar.style.display = 'none';
      return;
    }
  } catch (err) {
    console.error('Admin check failed:', err);
    const bar = $('pkgAdminBar');
    const adminText = $('pkgAdminText');
    if (bar && adminText) { adminText.textContent = 'Could not determine permission status.'; if (bar.style) bar.style.display = 'flex'; }
  }
}

function showAdminElevationHint(action, pkgName) {
  const bar = $('pkgAdminBar');
  const adminText = $('pkgAdminText');
  const indicator = $('pkgAdminIndicator');
  const elevateBtn = $('pkgElevateBtn');
  if (!bar || !adminText) return;
  bar.style.display = 'flex';
  adminText.textContent = `Permission denied for ${action} of ${pkgName}. Click Elevate to retry with admin rights.`;
  if (indicator) indicator.className = 'pkg-admin-indicator warning';
  if (elevateBtn) elevateBtn.style.display = 'flex';
}

export async function handleInstallPackage() {
  const input = $('pkgInstallInput');
  if (!input) return;
  const pkgName = input.value.trim();
  if (!pkgName) { showStatus('Please enter a package name to install', true); input.focus(); return; }
  const btn = $('pkgInstallBtn');
  const originalText = btn?.textContent || 'Install';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="pkg-install-spinner"></span> Installing...'; }
  input.disabled = true;
  hideStatus();
  showStatus(`Installing ${pkgName}...`);
  try {
    const result = await window.electronAPI.installPackage(currentPkgType, pkgName);
    if (result.success) {
      showStatus(`${pkgName} installed successfully!`);
      showActionLog(result.message || 'Done.');
      input.value = '';
      lastFailedAction = null;
      setTimeout(() => loadPackages(), 1500);
    } else {
      showStatus(`Failed to install ${pkgName}: ${result.message}`, true);
      showActionLog(result.message || 'Unknown error');
      lastFailedAction = { action: 'install', type: currentPkgType, name: pkgName };
      const isPermissionError = result.message.toLowerCase().includes('eacces') ||
        result.message.toLowerCase().includes('eperm') ||
        result.message.toLowerCase().includes('access is denied') ||
        result.message.toLowerCase().includes('permission denied');
      if (isPermissionError) showAdminElevationHint('install', pkgName);
    }
  } catch (err) { showStatus(`Error: ${err.message}`, true); }
  finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 3v14M3 10h14"/></svg> Install'; }
    input.disabled = false; input.focus();
  }
}
