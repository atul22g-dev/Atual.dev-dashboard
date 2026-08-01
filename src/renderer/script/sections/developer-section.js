/* ============================================================
   📦 DEVELOPER SECTION - Package Manager (npm/pip)
   ============================================================ */

import { $, showSectionError, clearSectionError } from '../utils.js';
import { isPermissionError } from '../format.js';

/**
 * Set an element's text with query matches wrapped in <strong class="pkg-highlight">
 * using DOM nodes only (no innerHTML — textContent auto-escapes).
 */
function setHighlighted(el, text, query) {
  if (!query || !text) { el.textContent = text; return; }
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex special chars
  const regex = new RegExp(`(${q})`, 'gi');
  let last = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
    const strong = document.createElement('strong');
    strong.className = 'pkg-highlight';
    strong.textContent = m[0];
    el.appendChild(strong);
    last = m.index + m[0].length;
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
}

// Static SVG icon markup — built via DOMParser (not innerHTML), so no HTML sink.
const ICONS = {
  pkg: '<svg class="pkg-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="14" height="14" rx="2"/><line x1="3" y1="9" x2="17" y2="9"/><line x1="9" y1="3" x2="9" y2="17"/></svg>',
  popup: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="14" height="14" rx="2"/><line x1="3" y1="9" x2="17" y2="9"/><line x1="9" y1="3" x2="9" y2="17"/></svg>',
  update: '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1 4 1 10 7 10"/><polyline points="19 16 19 10 13 10"/><path d="M3.5 13.5A8 8 0 0 0 16.5 7.5"/><path d="M16.5 6.5A8 8 0 0 0 3.5 12.5"/></svg>',
  delete: '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 17 6"/><path d="M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/><path d="M5 6l1 10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-10"/></svg>',
};
function svgIcon(name) {
  return new DOMParser().parseFromString(ICONS[name], 'image/svg+xml').documentElement;
}

let currentPkgType = 'npm';
let npmPackages = [];
let pipPackages = [];
let isLoadingPackages = false;
let lastFailedAction = null;

async function loadPackages() {
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
    clearSectionError('developer');
  } catch (err) {
    console.error('Failed to load packages:', err);
    const body = document.getElementById('pkgListBody');
    if (body) body.innerHTML = '<div class="pkg-loading">Failed to load packages. Make sure npm/pip is installed.</div>';
    showSectionError('developer', 'Failed to load the package list. Make sure npm/pip is installed and reachable.');
  } finally {
    isLoadingPackages = false;
  }
}

function renderPackages(packages, filter) {
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
    const desc = pkg.description || '';

    // Name block: icon + (optionally highlighted) name text
    const nameSpan = document.createElement('span');
    nameSpan.className = 'pkg-name';
    nameSpan.title = desc;
    nameSpan.appendChild(svgIcon('pkg'));
    const nameText = document.createElement('span');
    nameText.className = 'pkg-name-text';
    setHighlighted(nameText, pkg.name, filter);
    nameSpan.appendChild(nameText);

    // Info block: version + optional description (textContent auto-escapes)
    const info = document.createElement('span');
    info.className = 'pkg-info';
    const version = document.createElement('span');
    version.className = 'pkg-version';
    version.textContent = pkg.version;
    info.appendChild(version);
    if (desc) {
      const descSpan = document.createElement('span');
      descSpan.className = 'pkg-desc';
      descSpan.textContent = desc.substring(0, 120);
      info.appendChild(descSpan);
    }

    // Action buttons
    const actions = document.createElement('span');
    actions.className = 'pkg-actions';

    const updateBtn = document.createElement('button');
    updateBtn.className = 'pkg-action-btn update';
    updateBtn.dataset.action = 'update';
    updateBtn.dataset.pkg = pkg.name;
    updateBtn.title = 'Update package';
    updateBtn.appendChild(svgIcon('update'));
    updateBtn.appendChild(document.createTextNode('Update'));
    actions.appendChild(updateBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'pkg-action-btn delete';
    deleteBtn.dataset.action = 'delete';
    deleteBtn.dataset.pkg = pkg.name;
    deleteBtn.title = 'Uninstall package';
    deleteBtn.appendChild(svgIcon('delete'));
    deleteBtn.appendChild(document.createTextNode('Delete'));
    actions.appendChild(deleteBtn);

    row.append(nameSpan, info, actions);
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

function showPackagePopup(pkgName) {
  // Find the package data from cache
  const cache = currentPkgType === 'npm' ? npmPackages : pipPackages;
  const pkg = cache.find(p => p.name === pkgName);
  if (!pkg) return;

  const overlay = getPopupOverlay();
  const desc = pkg.description || '';

  // Build the popup with DOM APIs — dynamic values go through textContent
  // (auto-escaped), never interpolated into an HTML string.
  const popup = document.createElement('div');
  popup.className = 'pkg-popup';

  // Header
  const header = document.createElement('div');
  header.className = 'pkg-popup-header';
  const titleGroup = document.createElement('div');
  titleGroup.className = 'pkg-popup-title-group';
  const iconWrap = document.createElement('div');
  iconWrap.className = 'pkg-popup-icon';
  iconWrap.appendChild(svgIcon('popup'));
  const titleCol = document.createElement('div');
  const nameLine = document.createElement('div');
  nameLine.className = 'pkg-popup-name';
  nameLine.appendChild(document.createTextNode(pkg.name));
  const badge = document.createElement('span');
  badge.className = 'pkg-popup-type-badge';
  badge.textContent = currentPkgType;
  nameLine.appendChild(badge);
  titleCol.appendChild(nameLine);
  titleGroup.append(iconWrap, titleCol);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'pkg-popup-close';
  closeBtn.id = 'pkgPopupClose';
  closeBtn.title = 'Close';
  closeBtn.textContent = '✕';
  header.append(titleGroup, closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'pkg-popup-body';
  const descEl = document.createElement('div');
  descEl.className = 'pkg-popup-desc';
  descEl.textContent = desc;
  if (!desc) descEl.setAttribute('data-empty', 'true');
  body.appendChild(descEl);

  const grid = document.createElement('div');
  grid.className = 'pkg-popup-detail-grid';
  const detailItem = (label, value, valueStyle) => {
    const item = document.createElement('div');
    item.className = 'pkg-popup-detail-item';
    const l = document.createElement('span');
    l.className = 'pkg-popup-detail-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'pkg-popup-detail-value';
    v.textContent = value;
    if (valueStyle) v.setAttribute('style', valueStyle);
    item.append(l, v);
    return item;
  };
  grid.appendChild(detailItem('Version', pkg.version));
  grid.appendChild(detailItem('Package Manager', currentPkgType === 'npm' ? 'npm (Node.js)' : 'pip (Python)'));
  grid.appendChild(detailItem('Install Type', 'Global'));
  grid.appendChild(detailItem('Status', 'Installed', 'color:var(--success)'));
  body.appendChild(grid);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'pkg-popup-footer';
  const makeFooterBtn = (action, label) => {
    const b = document.createElement('button');
    b.className = `pkg-popup-action-btn ${action}`;
    b.dataset.action = action === 'update' ? 'updateFromPopup' : 'deleteFromPopup';
    b.dataset.pkg = pkg.name;
    b.appendChild(svgIcon(action));
    b.appendChild(document.createTextNode(label));
    return b;
  };
  footer.appendChild(makeFooterBtn('update', 'Update'));
  footer.appendChild(makeFooterBtn('delete', 'Uninstall'));

  popup.append(header, body, footer);
  overlay.replaceChildren(popup);
  overlay.classList.add('visible');

  // Close button (already built above with id pkgPopupClose)
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

function hidePackagePopup() {
  if (_popupOverlay) {
    _popupOverlay.classList.remove('visible');
  }
}

function updatePackageCounts(packages, showing) {
  if (currentPkgType === 'npm') $('npmCount').textContent = packages.length;
  else $('pipCount').textContent = packages.length;
}

function switchPackageTab(type) {
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

function showActionLog(message) {
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
 *
 * 🛡️ Phase 1 — the renderer sends ONLY (action, type, name). The main process
 * validates them and builds the actual command; the renderer can never request
 * an arbitrary elevated command string.
 */
async function retryWithElevation(action, type, name) {
  try {
    return await window.electronAPI.elevatePackage(action, type, name);
  } catch (err) {
    return { success: false, message: err.message || 'Elevation failed' };
  }
}

async function handlePackageAction(action, pkgName) {
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
    
    // Check if the failure is a permission error (shared helper, format.js)
    const isPermError = isPermissionError(result.message);
    
    if (isPermError) {
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

async function checkAdminAndElevation() {
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
function onInstallInput(e) {
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
async function handleInstallPackage() {
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
    
    // Check if the failure is a permission error (shared helper, format.js)
    const isPermError = isPermissionError(result.message);
    
    if (isPermError) {
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

// ──────────────────────────────────────────────
// 🚀 SECTION LIFECYCLE (Contract: init / update / destroy — Phase 2)
// ──────────────────────────────────────────────
// The developer section is lazy: package data + admin status are only
// fetched when the section is initialized (or the user hits refresh),
// never on the global refresh cycle.

/** One-time setup: wire package DOM listeners + load data + check admin. */
export function init() {
  $('pkgElevateBtn')?.addEventListener('click', retryElevationFromBar);
  $('pkgTabNpm')?.addEventListener('click', () => switchPackageTab('npm'));
  $('pkgTabPip')?.addEventListener('click', () => switchPackageTab('pip'));

  const pkgSearch = $('pkgSearch');
  if (pkgSearch) {
    pkgSearch.addEventListener('input', (e) => {
      const cache = currentPkgType === 'npm' ? npmPackages : pipPackages;
      renderPackages(cache, e.target.value);
    });
  }

  $('pkgRefreshBtn')?.addEventListener('click', () => loadPackages());

  // Install inputs for both npm and pip tabs
  ['Npm', 'Pip'].forEach(suffix => {
    const installInput = $(`pkgInstallInput${suffix}`);
    const installBtn = $(`pkgInstallBtn${suffix}`);
    if (installInput) {
      installInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleInstallPackage(); });
      installInput.addEventListener('input', onInstallInput);
    }
    if (installBtn) installBtn.addEventListener('click', () => handleInstallPackage());
  });

  $('pkgLogClose')?.addEventListener('click', () => {
    const panel = $('pkgLogPanel');
    if (panel) panel.style.display = 'none';
  });

  document.getElementById('pkgListBody')?.addEventListener('click', (e) => {
    // Click on package name → show details popup
    const nameEl = e.target.closest('.pkg-name');
    if (nameEl) {
      const row = nameEl.closest('.pkg-row');
      const pkgName = row?.dataset?.pkgName;
      if (pkgName) { showPackagePopup(pkgName); return; }
    }
    // Click on action button → update/delete
    const btn = e.target.closest('.pkg-action-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    const pkgName = btn.dataset.pkg;
    if (action && pkgName) handlePackageAction(action, pkgName);
  });

  // Lazy-load on first paint of the developer section
  loadPackages();
  checkAdminAndElevation();
}

/** Developer data is loaded on demand (init / refresh button), never on the refresh cycle. */
export function update() {
  // no-op — packages are lazy-loaded
}

/** Release debounce timers + popup listeners owned by this section. */
export function destroy() {
  clearTimeout(_searchTimers.npm);
  clearTimeout(_searchTimers.pip);
  _searchTimers.npm = null;
  _searchTimers.pip = null;
  const status = $('pkgStatus');
  if (status) clearTimeout(status._hideTimer);
  if (_popupOverlay) {
    document.removeEventListener('keydown', _onPopupKeydown);
    _popupOverlay.remove();
    _popupOverlay = null;
  }
}

/**
 * Retry the last failed package action with elevated (admin) privileges.
 * (Moved from app.js into the section in Phase 2.)
 */
async function retryElevationFromBar() {
  if (!lastFailedAction) {
    $('pkgAdminText').textContent = '⚠️ No failed action to retry. Try installing/updating a package first.';
    return;
  }
  const btn = $('pkgElevateBtn');
  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="pkg-install-spinner"></span> Elevating...';
  $('pkgAdminText').textContent = `Retrying with admin privileges: ${lastFailedAction.action} ${lastFailedAction.name}...`;
  try {
    const { action, type, name } = lastFailedAction;
    // 🛡️ Phase 1 — send ONLY structured (action, type, name); the main process
    // validates them and builds the command itself. The renderer never
    // supplies a command string.
    const result = await window.electronAPI.elevatePackage(action, type, name);
    if (result.success) {
      $('pkgAdminText').textContent = `✅ ${action === 'delete' ? 'Uninstalled' : action === 'update' ? 'Updated' : 'Installed'} ${name} with admin privileges!`;
      $('pkgAdminIndicator').className = 'pkg-admin-indicator success';
      showActionLog(result.message || 'Done.');
      lastFailedAction = null;
      setTimeout(() => loadPackages(), 1500);
    } else {
      $('pkgAdminText').textContent = `⚠️ Failed: ${result.message}`;
      $('pkgAdminIndicator').className = 'pkg-admin-indicator warning';
      showActionLog(result.message || 'Unknown error');
    }
  } catch (err) { $('pkgAdminText').textContent = '⚠️ Elevation failed: ' + err.message; }
  finally { btn.disabled = false; btn.innerHTML = originalText; }
}
