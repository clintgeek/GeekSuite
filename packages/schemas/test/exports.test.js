/**
 * exports.test.js — every subpath @geeksuite/schemas exports loads under
 * plain Node (SUITE_REVIEW_2026-11 C1).
 *
 * The schemas are exercised by basegeek's jest suite and the app backends,
 * but only through the files each of them happens to import. A schema file
 * that throws at require time (a typo, a missing require, a bad path in
 * `exports`) crash-loops whichever container imports it first, and nothing
 * here ran on its own. This is that tripwire: no Mongo, no app code, just
 * "does every advertised entry point load, and is the root index complete".
 *
 * Run with: node --test packages/schemas/test/
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

test('package.json exports at least the root entry', () => {
  assert.ok(pkg.exports && pkg.exports['.'], 'exports["."] is set');
});

for (const [subpath, target] of Object.entries(pkg.exports)) {
  test(`${ subpath } → ${ target } loads`, () => {
    const file = path.join(root, target);
    let mod;
    assert.doesNotThrow(() => { mod = require(file); }, `${ target } threw on require`);
    assert.ok(mod !== undefined && mod !== null, `${ target } exported nothing`);
    for (const [name, value] of Object.entries(mod)) {
      if (/^create.*Schema$/.test(name)) {
        assert.equal(typeof value, 'function', `${ target }: ${ name } is not a function`);
      }
    }
  });
}

test('the root index loads every app group it names', () => {
  const index = require(path.join(root, pkg.exports['.']));
  for (const [app, group] of Object.entries(index)) {
    assert.equal(typeof group, 'object', `${ app } is not a group`);
    for (const [name, mod] of Object.entries(group)) {
      assert.ok(mod, `${ app }.${ name } is empty`);
    }
  }
});
