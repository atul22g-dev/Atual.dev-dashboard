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
    const desc = pkg.description || '';
    const safeDesc = desc ? escapeHtml(desc.substring(0, 120)) : '';
    row.innerHTML = `
      <span class="pkg-name" title="${desc.replace(/"/g, '&quot;')}">
        <svg class="pkg-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="14" height="14" rx="2"/>
          <line x1="3" y1="9" x2="17" y2="9"/>
          <line x1="9" y1="3" x2="9" y2="17"/>
        </svg>
        <span class="pkg-name-text">${highlightedName}</span>
      </span>
      <span class="pkg-info">
        <span class="pkg-version">${pkg.version}</span>
        ${safeDesc ? `<span class="pkg-desc">${safeDesc}</span>` : ''}
      </span>
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
  
  // Show/hide the correct install bar
  const barNpm = $('pkgInstallBarNpm');
  const barPip = $('pkgInstallBarPip');
  if (barNpm) barNpm.style.display = type === 'npm' ? '' : 'none';
  if (barPip) barPip.style.display = type === 'pip' ? '' : 'none';
  
  // Clear suggestions when switching tabs
  const sugNpm = $('pkgInstallSuggestionsNpm');
  const sugPip = $('pkgInstallSuggestionsPip');
  if (sugNpm) sugNpm.classList.remove('visible');
  if (sugPip) sugPip.classList.remove('visible');
  
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

/**
 * 🔑 Automatically retry a failed package action with elevated (admin) privileges
 * Shows the OS elevation prompt (UAC on Windows). Returns the result object.
 */
async function retryWithElevation(action, type, name) {
  let elevatedCmd;
  if (type === 'npm') {
    if (action === 'install') elevatedCmd = `npm install -g ${name}`;
    else if (action === 'update') elevatedCmd = `npm install -g ${name}@latest`;
    else if (action === 'delete') elevatedCmd = `npm uninstall -g ${name}`;
  } else if (type === 'pip') {
    const isWin = navigator.platform && navigator.platform.toLowerCase().includes('win');
    const pip = isWin ? 'pip' : 'pip3';
    if (action === 'install') elevatedCmd = `${pip} install ${name}`;
    else if (action === 'update') elevatedCmd = `${pip} install --upgrade ${name}`;
    else if (action === 'delete') elevatedCmd = `${pip} uninstall -y ${name}`;
  }
  if (!elevatedCmd) return null;
  try {
    return await window.electronAPI.runElevated(elevatedCmd, []);
  } catch (err) {
    return { success: false, message: err.message || 'Elevation failed' };
  }
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
      return;
    }
    
    // Check if the failure is a permission error
    const msg = (result.message || '').toLowerCase();
    const isPermissionError = msg.includes('eacces') ||
      msg.includes('eperm') ||
      msg.includes('access is denied') ||
      msg.includes('permission denied');
    
    if (isPermissionError) {
      // Auto-retry with elevated privileges
      showStatus(`Permission denied. Retrying with admin privileges...`);
      showActionLog(`Permission error: ${result.message}\nAttempting elevation...`);
      const elevatedResult = await retryWithElevation(action, currentPkgType, pkgName);
      if (elevatedResult && elevatedResult.success) {
        const verb = action === 'delete' ? 'Uninstalled' : action === 'update' ? 'Updated' : 'Processed';
        showStatus(`✅ ${verb} ${pkgName} with admin privileges!`);
        showActionLog(elevatedResult.message || 'Done.');
        lastFailedAction = null;
        setTimeout(() => loadPackages(), 1500);
        return;
      } else {
        // Elevation failed or declined — show the hint for manual retry
        const errMsg = elevatedResult?.message || result.message;
        showStatus(`Failed: ${errMsg}`, true);
        showActionLog(errMsg || 'Unknown error');
        lastFailedAction = { action, type: currentPkgType, name: pkgName };
        showAdminElevationHint(action, pkgName);
        return;
      }
    }
    
    // Non-permission error
    showStatus(`Failed: ${result.message}`, true);
    showActionLog(result.message || 'Unknown error');
    lastFailedAction = { action, type: currentPkgType, name: pkgName };
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
      if (note) note.textContent = 'npm/pip global directory requires admin rights. Click \"Elevate\" after a failed action to retry with admin privileges.';
      // Only show Elevate button if there's a failed action to retry
      if (elevateBtn) elevateBtn.style.display = lastFailedAction ? 'flex' : 'none';
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

// ──────────────────────────────────────────────
// 🔍 PACKAGE INSTALL WITH AUTOCOMPLETE
// ──────────────────────────────────────────────

let _searchTimers = { npm: null, pip: null };

/**
 * Get the input element for the currently active tab
 */
function getInstallInput() {
  return currentPkgType === 'npm' ? $('pkgInstallInputNpm') : $('pkgInstallInputPip');
}

/**
 * Get the suggestions container for the currently active tab
 */
function getSuggestionsContainer() {
  return currentPkgType === 'npm' ? $('pkgInstallSuggestionsNpm') : $('pkgInstallSuggestionsPip');
}

/**
 * Get the install button for the currently active tab
 */
function getInstallBtn() {
  return currentPkgType === 'npm' ? $('pkgInstallBtnNpm') : $('pkgInstallBtnPip');
}

/**
 * Show suggestions dropdown with package search results
 */
function showSuggestions(results) {
  const container = getSuggestionsContainer();
  if (!container) return;
  
  if (!results || results.length === 0) {
    container.classList.remove('visible');
    return;
  }

  // Build suggestion items as DOM elements (no innerHTML with dynamic content)
  results.forEach(pkg => {
    const item = document.createElement('div');
    item.className = 'pkg-suggestion-item';
    item.dataset.pkgName = pkg.name;

    const nameDiv = document.createElement('div');
    nameDiv.className = 'pkg-suggestion-name';
    // SVG icon
    nameDiv.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="2" width="10" height="12" rx="2"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="5" y1="8" x2="11" y2="8"/></svg>';
    // Package name as text
    nameDiv.appendChild(document.createTextNode(' ' + pkg.name));

    const versionSpan = document.createElement('span');
    versionSpan.className = 'pkg-suggestion-version';
    versionSpan.textContent = pkg.version;
    nameDiv.appendChild(versionSpan);

    item.appendChild(nameDiv);

    if (pkg.description) {
      const descDiv = document.createElement('div');
      descDiv.className = 'pkg-suggestion-desc';
      descDiv.textContent = pkg.description;
      item.appendChild(descDiv);
    }

    item.addEventListener('click', () => {
      const input = getInstallInput();
      if (input) {
        input.value = pkg.name;
        container.classList.remove('visible');
        handleInstallPackage();
      }
    });

    container.appendChild(item);
  });
  
  container.classList.add('visible');
}

/**
 * Debounced search for packages as user types
 */
export function onInstallInput(e) {
  const input = e.target;
  const query = input.value.trim();
  const type = input.id === 'pkgInstallInputNpm' ? 'npm' : 'pip';
  
  // Clear previous timer
  if (_searchTimers[type]) {
    clearTimeout(_searchTimers[type]);
    _searchTimers[type] = null;
  }
  
  // Hide suggestions if query is too short
  const container = type === 'npm' ? $('pkgInstallSuggestionsNpm') : $('pkgInstallSuggestionsPip');
  if (query.length < 2) {
    if (container) container.classList.remove('visible');
    return;
  }
  
  // Show loading state
  if (container) {
    container.innerHTML = '<div class="pkg-suggestion-loading">Searching...</div>';
    container.classList.add('visible');
  }
  
  // Debounce search
  _searchTimers[type] = setTimeout(async () => {
    try {
      const searchFn = type === 'npm'
        ? window.electronAPI.searchNpmPackages
        : window.electronAPI.searchPipPackages;
      const results = await searchFn(query);
      showSuggestions(results);
    } catch (err) {
      const c = type === 'npm' ? $('pkgInstallSuggestionsNpm') : $('pkgInstallSuggestionsPip');
      if (c) c.classList.remove('visible');
    }
  }, 350);
}

/**
 * Hide suggestions when clicking outside
 */
document.addEventListener('click', (e) => {
  const containerNpm = $('pkgInstallSuggestionsNpm');
  const containerPip = $('pkgInstallSuggestionsPip');
  const barNpm = $('pkgInstallBarNpm');
  const barPip = $('pkgInstallBarPip');
  
  if (containerNpm && !barNpm?.contains(e.target)) {
    containerNpm.classList.remove('visible');
  }
  if (containerPip && !barPip?.contains(e.target)) {
    containerPip.classList.remove('visible');
  }
});

/**
 * Install a package with the current tab's input
 */
export async function handleInstallPackage() {
  const input = getInstallInput();
  if (!input) return;
  const pkgName = input.value.trim();
  if (!pkgName) { showStatus('Please enter a package name to install', true); input.focus(); return; }
  
  const btn = getInstallBtn();
  const originalText = btn?.textContent || 'Install';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="pkg-install-spinner"></span> Installing...'; }
  input.disabled = true;
  hideStatus();
  showStatus(`Installing ${pkgName}...`);
  
  // Hide suggestions
  const container = getSuggestionsContainer();
  if (container) container.classList.remove('visible');
  
  try {
    const result = await window.electronAPI.installPackage(currentPkgType, pkgName);
    if (result.success) {
      showStatus(`${pkgName} installed successfully!`);
      showActionLog(result.message || 'Done.');
      input.value = '';
      lastFailedAction = null;
      setTimeout(() => loadPackages(), 1500);
      return;
    }
    
    // Check if the failure is a permission error
    const msg = (result.message || '').toLowerCase();
    const isPermissionError = msg.includes('eacces') ||
      msg.includes('eperm') ||
      msg.includes('access is denied') ||
      msg.includes('permission denied');
    
    if (isPermissionError) {
      // Auto-retry with elevated privileges
      showStatus(`Permission denied. Retrying with admin privileges...`);
      showActionLog(`Permission error: ${result.message}\nAttempting elevation...`);
      const elevatedResult = await retryWithElevation('install', currentPkgType, pkgName);
      if (elevatedResult && elevatedResult.success) {
        showStatus(`✅ ${pkgName} installed with admin privileges!`);
        showActionLog(elevatedResult.message || 'Done.');
        input.value = '';
        lastFailedAction = null;
        setTimeout(() => loadPackages(), 1500);
        return;
      } else {
        // Elevation failed or declined
        const errMsg = elevatedResult?.message || result.message;
        showStatus(`Failed to install ${pkgName}: ${errMsg}`, true);
        showActionLog(errMsg || 'Unknown error');
        lastFailedAction = { action: 'install', type: currentPkgType, name: pkgName };
        showAdminElevationHint('install', pkgName);
        return;
      }
    }
    
    // Non-permission error
    showStatus(`Failed to install ${pkgName}: ${result.message}`, true);
    showActionLog(result.message || 'Unknown error');
    lastFailedAction = { action: 'install', type: currentPkgType, name: pkgName };
  } catch (err) { showStatus(`Error: ${err.message}`, true); }
  finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 3v14M3 10h14"/></svg> Install'; }
    input.disabled = false; input.focus();
  }
}
