/* ============================================================
   🛡️ PHASE 1 — INPUT VALIDATORS (pure, testable)
   ============================================================
   Single source of truth for every renderer-supplied value that
   can reach a shell command or an IPC handler.

   Rules (from plan.md §5.2 / §5.3):
   - Package managers whitelisted: npm | pip
   - Package actions whitelisted: install | update | delete
   - Package names validated against /^[a-zA-Z0-9@_./+-]+$/
   - Search queries limited to safe chars + a max length
   - Renderer-supplied command strings are NEVER accepted

   This module imports nothing from Electron (or anything else),
   so it can be unit-tested with plain `node --test`.
   ============================================================ */

'use strict';

/** Whitelisted package managers. */
const PACKAGE_TYPES = ['npm', 'pip'];

/** Whitelisted package actions. */
const PACKAGE_ACTIONS = ['install', 'update', 'delete'];

/**
 * Strict package-name rule. Allows scoped names (@scope/pkg), dots,
 * dashes, underscores, plus signs (npm supports + in names) and
 * slashes (for scoped packages). Anything else is rejected so a
 * hostile name can never smuggle shell metacharacters.
 */
const PACKAGE_NAME_RE = /^[a-zA-Z0-9@_./+-]+$/;

/** Max length guards against absurdly long renderer inputs. */
const MAX_NAME_LENGTH = 200;
const MAX_QUERY_LENGTH = 120;

/** Safe characters for registry search queries (letters, digits, space, - _ . @ / +). */
const SEARCH_QUERY_RE = /^[a-zA-Z0-9@_./+\-\s]+$/;

/** True when value is a non-empty string. */
function isString(value) {
  return typeof value === 'string';
}

/**
 * Validate a package type (npm | pip).
 * @returns {{ ok: true, type: string } | { ok: false, error: string }}
 */
function validatePackageType(type) {
  if (!isString(type) || !PACKAGE_TYPES.includes(type)) {
    return { ok: false, error: 'Unknown package type' };
  }
  return { ok: true, type };
}

/**
 * Validate a package action (install | update | delete).
 * @returns {{ ok: true, action: string } | { ok: false, error: string }}
 */
function validatePackageAction(action) {
  if (!isString(action) || !PACKAGE_ACTIONS.includes(action)) {
    return { ok: false, error: 'Unknown package action' };
  }
  return { ok: true, action };
}

/**
 * Validate a package name. Rejects anything that is not a string,
 * empty, too long, or containing characters outside the safe set.
 * @returns {{ ok: true, name: string } | { ok: false, error: string }}
 */
function validatePackageName(name) {
  if (!isString(name)) {
    return { ok: false, error: 'Invalid package name' };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: 'Invalid package name' };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { ok: false, error: 'Package name too long' };
  }
  if (!PACKAGE_NAME_RE.test(trimmed)) {
    return { ok: false, error: 'Invalid package name' };
  }
  return { ok: true, name: trimmed };
}

/**
 * Validate a full package request (type + name). Convenience used by
 * IPC handlers before ANY shell command involving a package.
 * @returns {{ ok: true, type: string, name: string } | { ok: false, error: string }}
 */
function validatePackageRequest(type, name) {
  const typeResult = validatePackageType(type);
  if (!typeResult.ok) return typeResult;
  const nameResult = validatePackageName(name);
  if (!nameResult.ok) return nameResult;
  return { ok: true, type: typeResult.type, name: nameResult.name };
}

/**
 * Validate a registry search query (npm / pip autocomplete).
 * @returns {{ ok: true, query: string } | { ok: false, error: string }}
 */
function validateSearchQuery(query) {
  if (!isString(query)) {
    return { ok: false, error: 'Invalid search query' };
  }
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {
    return { ok: false, error: 'Search query too short' };
  }
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: 'Search query too long' };
  }
  if (!SEARCH_QUERY_RE.test(trimmed)) {
    return { ok: false, error: 'Invalid search query' };
  }
  return { ok: true, query: trimmed };
}

module.exports = {
  PACKAGE_TYPES,
  PACKAGE_ACTIONS,
  PACKAGE_NAME_RE,
  MAX_NAME_LENGTH,
  MAX_QUERY_LENGTH,
  validatePackageType,
  validatePackageAction,
  validatePackageName,
  validatePackageRequest,
  validateSearchQuery,
};
