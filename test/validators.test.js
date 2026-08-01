/* ============================================================
   🧪 UNIT TESTS — src/main/validators.js (Phase 1 security)
   ============================================================
   Run:  npm test  (node --test picks up test/*.test.js)
   ============================================================ */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PACKAGE_TYPES,
  PACKAGE_ACTIONS,
  PACKAGE_NAME_RE,
  validatePackageType,
  validatePackageAction,
  validatePackageName,
  validatePackageRequest,
  validateSearchQuery,
} = require('../src/main/validators.js');

test('whitelists are exactly npm/pip and install/update/delete', () => {
  assert.deepEqual(PACKAGE_TYPES, ['npm', 'pip']);
  assert.deepEqual(PACKAGE_ACTIONS, ['install', 'update', 'delete']);
});

test('PACKAGE_NAME_RE allows safe names and scoped packages', () => {
  for (const good of ['lodash', '@types/node', 'my-pkg', 'my_pkg', 'pkg.v2', 'a+b', 'cafe']) {
    assert.ok(PACKAGE_NAME_RE.test(good), `should allow ${good}`);
  }
});

test('PACKAGE_NAME_RE rejects shell metacharacters', () => {
  for (const bad of ['pkg;rm -rf /', 'pkg && calc', '$(whoami)', '`id`', 'pkg|cat', 'pkg>file', 'a b', 'pkg"x', "pkg'x", 'pkg\\x', '']) {
    assert.ok(!PACKAGE_NAME_RE.test(bad), `should reject ${bad}`);
  }
});

test('validatePackageType', () => {
  assert.deepEqual(validatePackageType('npm'), { ok: true, type: 'npm' });
  assert.deepEqual(validatePackageType('pip'), { ok: true, type: 'pip' });
  assert.equal(validatePackageType('yarn').ok, false);
  assert.equal(validatePackageType(42).ok, false);
  assert.equal(validatePackageType(undefined).ok, false);
  assert.equal(validatePackageType(null).ok, false);
});

test('validatePackageAction', () => {
  assert.deepEqual(validatePackageAction('install'), { ok: true, action: 'install' });
  assert.deepEqual(validatePackageAction('update'), { ok: true, action: 'update' });
  assert.deepEqual(validatePackageAction('delete'), { ok: true, action: 'delete' });
  assert.equal(validatePackageAction('purge').ok, false);
  assert.equal(validatePackageAction('').ok, false);
});

test('validatePackageName', () => {
  assert.deepEqual(validatePackageName('lodash'), { ok: true, name: 'lodash' });
  assert.deepEqual(validatePackageName(' @types/node '), { ok: true, name: '@types/node' });
  assert.equal(validatePackageName('').ok, false);
  assert.equal(validatePackageName('  ').ok, false);
  assert.equal(validatePackageName('pkg; rm -rf /').ok, false);
  assert.equal(validatePackageName('pkg && calc').ok, false);
  assert.equal(validatePackageName(123).ok, false);
  assert.equal(validatePackageName(null).ok, false);
  assert.equal(validatePackageName('x'.repeat(300)).ok, false);
});

test('validatePackageRequest combines type + name', () => {
  assert.deepEqual(validatePackageRequest('npm', 'lodash'), { ok: true, type: 'npm', name: 'lodash' });
  assert.deepEqual(validatePackageRequest('pip', 'requests'), { ok: true, type: 'pip', name: 'requests' });
  assert.equal(validatePackageRequest('npm', 'a;b').ok, false);
  assert.equal(validatePackageRequest('yarn', 'lodash').ok, false);
  assert.equal(validatePackageRequest(undefined, undefined).ok, false);
});

test('validateSearchQuery', () => {
  assert.deepEqual(validateSearchQuery('react'), { ok: true, query: 'react' });
  assert.deepEqual(validateSearchQuery('  lodash  '), { ok: true, query: 'lodash' });
  assert.equal(validateSearchQuery('a').ok, false);           // too short
  assert.equal(validateSearchQuery('').ok, false);
  assert.equal(validateSearchQuery('pkg;calc').ok, false);    // metachar
  assert.equal(validateSearchQuery('pkg && rm').ok, false);
  assert.equal(validateSearchQuery(5).ok, false);
  assert.equal(validateSearchQuery('x'.repeat(300)).ok, false);
});
