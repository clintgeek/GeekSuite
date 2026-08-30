// Minimal Mongoose-collection double used across the route tests.
//
// This is deliberately not a full Mongoose mock — it implements just enough
// query-filter semantics ($exists, $ne, $in, plain equality) that ownerId
// scoping in the controllers is exercised *for real*: if a controller ever
// forgets to include `ownerId` in a filter, this fake will happily match a
// different owner's document and the ownership assertions in the tests will
// fail, the same way a real IDOR bug would surface against a live database.
//
// Deliberately framework-agnostic where possible, but uses `jest.fn()` so
// call assertions (toHaveBeenCalledWith, not.toHaveBeenCalled, ...) work the
// same way they would against a real jest.mock'd Mongoose model.

import { jest } from '@jest/globals';

function matchesCondition(value, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, opValue]) => {
      switch (op) {
        case '$exists':
          return (value !== undefined && value !== null) === opValue;
        case '$ne':
          return String(value) !== String(opValue);
        case '$in':
          return opValue.map(String).includes(String(value));
        default:
          return true;
      }
    });
  }
  return String(value) === String(cond);
}

function matchesFilter(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => matchesCondition(doc[key], cond));
}

// A thenable that also supports the chainable Mongoose query methods used by
// the controllers under test (.populate/.select/.skip/.limit/.sort/.lean).
// Awaiting it (or calling .then directly) resolves to whatever the resolver
// produces.
function chainableQuery(resolver) {
  const chain = {
    populate: () => chain,
    select: () => chain,
    skip: () => chain,
    limit: () => chain,
    sort: () => chain,
    lean: () => chain,
    then: (onFulfilled, onRejected) => resolver().then(onFulfilled, onRejected),
    catch: (onRejected) => resolver().catch(onRejected),
  };
  return chain;
}

let fakeIdCounter = 1;
export function nextFakeId(prefix = 'fake-id') {
  return `${prefix}-${fakeIdCounter++}`;
}

/**
 * Build a fake Mongoose-model double seeded with `initialDocs`.
 *
 * Each doc is shallow-copied so tests can mutate the array returned by
 * `_docs()` without disturbing fixtures shared across tests, and so that
 * per-test seeding doesn't leak between test files.
 */
export function createFakeModel(initialDocs = []) {
  let docs = initialDocs.map((d) => ({ ...d }));

  const model = {
    _docs: () => docs,
    _reset: (nextDocs = []) => {
      docs = nextDocs.map((d) => ({ ...d }));
    },

    create: jest.fn(async (data) => {
      const doc = {
        _id: data._id || nextFakeId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      docs.push(doc);
      return doc;
    }),

    findOne: jest.fn((filter = {}) =>
      chainableQuery(async () => docs.find((d) => matchesFilter(d, filter)) ?? null)
    ),

    find: jest.fn((filter = {}) =>
      chainableQuery(async () => docs.filter((d) => matchesFilter(d, filter)))
    ),

    countDocuments: jest.fn(async (filter = {}) => docs.filter((d) => matchesFilter(d, filter)).length),

    findOneAndUpdate: jest.fn(async (filter, update = {}, options = {}) => {
      const doc = docs.find((d) => matchesFilter(d, filter));
      if (!doc) return null;
      Object.assign(doc, update);
      return options.new === false ? { ...doc } : doc;
    }),

    findOneAndDelete: jest.fn(async (filter) => {
      const idx = docs.findIndex((d) => matchesFilter(d, filter));
      if (idx === -1) return null;
      const [doc] = docs.splice(idx, 1);
      return doc;
    }),

    aggregate: jest.fn(async () => []),
  };

  return model;
}

/**
 * Build a test double for flockgeek's requireOwner middleware.
 *
 * The real middleware (src/middleware/authMiddleware.js) calls out to
 * @geeksuite/user's attachUser() and then derives req.ownerId from the
 * authenticated user. This double replaces the whole module: the caller
 * identifies via the `x-test-owner` header, or is treated as unauthenticated
 * (401, matching the real requireOwner's behavior) if the header is absent.
 */
export function buildAuthMiddlewareMock() {
  return {
    requireAuth: (req, res, next) => next(),
    requireOwner: (req, res, next) => {
      const ownerId = req.header('x-test-owner');
      if (!ownerId) {
        return res.status(401).json({ message: 'Authentication token required' });
      }
      req.ownerId = ownerId;
      next();
    },
  };
}
