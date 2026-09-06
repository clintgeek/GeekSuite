// Going-over 2026-09-05 — ownership comes from the session, never the request.
//
// BURN_REVIEW #4/#18 closed the body-sets-the-owner hole inside the
// controllers. `requireOwner` had the same hole one layer earlier and wider:
//
//   const ownerId = userOwner || headerOwner || req.body?.ownerId || req.query?.ownerId;
//
// so a session whose user object carried none of the four id shapes fell back
// to an `X-Owner-Id` header, then to the request body, then to the query
// string — and `req.ownerId` is the value every owner-scoped Mongoose filter in
// this backend is built around. Whatever the caller named would have *been*
// the owner, for reads as well as writes.
//
// These run the real middleware with `@geeksuite/user`'s `attachUser` mocked,
// which is the only seam between "a session exists" and "what its id is".

import { jest } from '@jest/globals';

const USER_MODULE = '@geeksuite/user/server';

// The session `attachUser` will attach on the next call. `null` means "no
// session at all" — the 401 path.
let sessionUser = null;

jest.unstable_mockModule(USER_MODULE, () => ({
  attachUser: () => (req, res, next) => {
    if (sessionUser) req.user = sessionUser;
    next();
  },
  meHandler: () => (req, res) => res.json({ user: req.user || null }),
  csrfGuard: () => (req, res, next) => next(),
}));

let requireOwner;

beforeAll(async () => {
  ({ requireOwner } = await import('../../middleware/authMiddleware.js'));
});

/** Drive the middleware once and report what it did. */
function run({ user = null, headers = {}, body = {}, query = {} } = {}) {
  sessionUser = user;

  const req = {
    headers,
    body,
    query,
    header: (name) => headers[name] ?? headers[String(name).toLowerCase()],
  };

  const res = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };

  let nexted = false;
  requireOwner(req, res, () => { nexted = true; });

  return { req, res, nexted };
}

describe('requireOwner', () => {
  test('derives ownerId from the session user', () => {
    const { req, nexted } = run({ user: { id: 'user-1' } });
    expect(nexted).toBe(true);
    expect(req.ownerId).toBe('user-1');
  });

  test.each(['_id', 'userId', 'ownerId'])('accepts a session user keyed by %s', (field) => {
    const { req, nexted } = run({ user: { [field]: 'user-2' } });
    expect(nexted).toBe(true);
    expect(req.ownerId).toBe('user-2');
  });

  test('an unauthenticated request is 401 and sets no ownerId', () => {
    const { req, res, nexted } = run();
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(req.ownerId).toBeUndefined();
  });

  test('an X-Owner-Id header cannot supply the owner', () => {
    const { req, res, nexted } = run({
      user: { username: 'no-id-here' },
      headers: { 'X-Owner-Id': 'victim' },
    });

    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(req.ownerId).toBeUndefined();
  });

  test('a body ownerId cannot supply the owner', () => {
    const { req, res, nexted } = run({
      user: { username: 'no-id-here' },
      body: { ownerId: 'victim' },
    });

    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(req.ownerId).toBeUndefined();
  });

  test('a query ownerId cannot supply the owner', () => {
    const { req, res, nexted } = run({
      user: { username: 'no-id-here' },
      query: { ownerId: 'victim' },
    });

    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(req.ownerId).toBeUndefined();
  });

  test('the session wins even when the request also names an owner', () => {
    const { req, nexted } = run({
      user: { id: 'me' },
      headers: { 'X-Owner-Id': 'victim' },
      body: { ownerId: 'victim' },
      query: { ownerId: 'victim' },
    });

    expect(nexted).toBe(true);
    expect(req.ownerId).toBe('me');
  });
});
