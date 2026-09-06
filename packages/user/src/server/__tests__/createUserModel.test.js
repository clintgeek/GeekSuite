'use strict';

/**
 * createUserModel.test.js
 *
 * The one property worth pinning here is that the base schema declares each
 * index **once**.
 *
 * `userId` and `email` both carry `unique: true, sparse: true` on the path,
 * which is itself an index declaration. The factory *also* called
 * `schema.index({ userId: 1 })` and `schema.index({ email: 1 })`, producing a
 * second spec for the same key, with different options, under the same
 * default name (`userId_1`). Mongoose warns about it; MongoDB refuses the
 * second `createIndex` outright with `IndexOptionsConflict`, and mongoose
 * raises that on the model's `index` event — which nothing in the suite
 * listens for, so it would land as a silent boot-time failure on the first app
 * to adopt this factory. Nothing has adopted it yet, which is exactly why the
 * trap is worth taking out before somebody steps in it.
 *
 * No connection is opened: `schema.indexes()` is a pure read of the
 * declaration, and `mongoose.deleteModel` keeps the model registry clean
 * between cases.
 *
 * Run with: pnpm --filter @geeksuite/user test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { createUserModel } = require('../createUserModel.js');

let counter = 0;
/** A unique model name per case — mongoose's registry is process-global. */
function uniqueName(prefix) {
  counter += 1;
  return `${prefix}${counter}`;
}

function withModel(prefix, fields, options, fn) {
  const name = uniqueName(prefix);
  const model = createUserModel(name, fields, options);
  try {
    return fn(model);
  } finally {
    mongoose.deleteModel(name);
  }
}

/** All index specs declared for `key`, path-level and explicit alike. */
function specsFor(schema, key) {
  return schema.indexes().filter(([spec]) => Object.keys(spec).join(',') === key);
}

test('userId is declared exactly once, and it is the unique sparse one', () => {
  withModel('IdxUser', {}, {}, (model) => {
    const specs = specsFor(model.schema, 'userId');
    assert.equal(specs.length, 1, `expected one userId index, got ${specs.length}`);
    const [spec, options] = specs[0];
    assert.deepEqual(spec, { userId: 1 });
    assert.equal(options.unique, true);
    assert.equal(options.sparse, true);
  });
});

test('email is declared exactly once, and it is the unique sparse one', () => {
  withModel('IdxUser', {}, {}, (model) => {
    const specs = specsFor(model.schema, 'email');
    assert.equal(specs.length, 1, `expected one email index, got ${specs.length}`);
    const [spec, options] = specs[0];
    assert.deepEqual(spec, { email: 1 });
    assert.equal(options.unique, true);
    assert.equal(options.sparse, true);
  });
});

test('no two declared indexes share a key, so none can collide on a default name', () => {
  withModel('IdxUser', {}, {}, (model) => {
    const keys = model.schema.indexes().map(([spec]) => Object.keys(spec).join(','));
    assert.equal(new Set(keys).size, keys.length, `duplicate index keys: ${keys.join(' | ')}`);
  });
});

test('the base field set survives — the fix removed indexes, not paths', () => {
  withModel('IdxUser', {}, {}, (model) => {
    for (const path of ['userId', 'email', 'displayName', 'avatarUrl', 'createdAt', 'updatedAt']) {
      assert.ok(model.schema.path(path), `${path} missing from the base schema`);
    }
    assert.equal(model.schema.path('email').options.lowercase, true);
    assert.equal(model.schema.path('displayName').options.default, '');
  });
});

test('extension fields merge in, and configureSchema still gets the schema', () => {
  let sawSchema = null;
  withModel(
    'IdxUser',
    { nickname: { type: String } },
    {
      collection: 'custom_users',
      configureSchema: (schema) => {
        sawSchema = schema;
        schema.index({ nickname: 1 });
      },
    },
    (model) => {
      assert.ok(model.schema.path('nickname'));
      assert.equal(model.collection.name, 'custom_users');
      assert.equal(sawSchema, model.schema);
      assert.equal(specsFor(model.schema, 'nickname').length, 1);
    },
  );
});
