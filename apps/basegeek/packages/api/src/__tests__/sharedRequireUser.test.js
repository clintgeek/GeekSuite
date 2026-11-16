/**
 * sharedRequireUser.test.js — SUITE_REVIEW_2026-11 S2.
 *
 * One "not signed in" shape for the whole gateway. The client
 * (@geeksuite/api-client) matches on `extensions.code`; tabs on older bundles
 * match on the message starting "Unauthorized". Both must hold.
 */
import { describe, it, expect } from '@jest/globals';
import { GraphQLError } from 'graphql';
import { requireUser, unauthenticated, forbidden } from '../graphql/shared/auth.js';

describe('requireUser', () => {
  it('returns the id as a string', () => {
    expect(requireUser({ user: { id: 'abc' } })).toBe('abc');
    expect(requireUser({ user: { id: 42 } })).toBe('42');
  });

  it.each([[undefined], [null], [{}], [{ user: null }], [{ user: {} }], [{ user: { id: '' } }]])(
    'throws UNAUTHENTICATED for %p',
    (ctx) => {
      let err;
      try { requireUser(ctx); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(GraphQLError);
      // Code only, no `http.status`: a 401 that also carries `data` is
      // delivered twice by Apollo Client's HttpLink (next + error), and the
      // shared error link then replayed the operation twice. See shared/auth.js.
      expect(err.extensions).toEqual({ code: 'UNAUTHENTICATED' });
      // Old bundles' errorLink matched message.includes('Unauthorized').
      expect(err.message).toMatch(/^Unauthorized/);
    },
  );

  it('keeps a caller-supplied message', () => {
    expect(() => requireUser({}, 'Unauthorized: sign in to read birds')).toThrow('Unauthorized: sign in to read birds');
  });
});

describe('unauthenticated / forbidden', () => {
  it('unauthenticated is the same shape requireUser throws', () => {
    expect(unauthenticated().extensions).toEqual({ code: 'UNAUTHENTICATED' });
  });

  it('forbidden is FORBIDDEN, and never says "Unauthorized" (which old clients would refresh on)', () => {
    const err = forbidden('Not a member of this household');
    expect(err.extensions).toEqual({ code: 'FORBIDDEN' });
    expect(forbidden().message).not.toMatch(/unauthori[sz]ed/i);
  });
});
