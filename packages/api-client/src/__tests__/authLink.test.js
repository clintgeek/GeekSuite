/**
 * authLink.test.js — the shared Apollo authLink's half of basegeek's
 * double-submit CSRF token.
 *
 * `authLink` (packages/api-client/src/index.js) is the one `setContext` link
 * every consumer app's Apollo client goes through — basegeek-ui, bujogeek,
 * notegeek, storygeek, bookgeek, fitnessgeek, flockgeek. GraphQL is POST-only,
 * so if this link forgets the header, every mutation to basegeek does too.
 * See DOCS/CONTEXT.md "CSRF: the double-submit token".
 *
 * Runs on vitest (node environment, no jsdom) — plain `node --test` cannot
 * import this module: @apollo/client ships some subpaths (e.g.
 * `@apollo/client/link/context`) without an "exports" map entry, which
 * Node's strict ESM resolver rejects as a directory import. Vite/Vitest's
 * resolver tolerates it, matching how every app actually consumes this
 * package. `document` and `localStorage` are stubbed to exactly what
 * authLink reads.
 *
 * Run with: pnpm --filter @geeksuite/api-client test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { authLink } from '../index.js';

const TOKEN = 'oO2xk5Yz1QqFbn-8LmvTz7cRk2sQeWpUvHgJdNaBcDe';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_COOKIE_NAME = 'geek_csrf';

function setCookieJar(value) {
  if (value === null) {
    delete globalThis.document;
    return;
  }
  globalThis.document = { cookie: value };
}

function setLocalStorage(values = {}) {
  globalThis.localStorage = {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null),
  };
}

beforeEach(() => {
  setLocalStorage({});
});

afterEach(() => {
  delete globalThis.document;
  delete globalThis.localStorage;
});

/** Minimal stand-in for an Apollo Operation: just getContext/setContext. */
function makeOperation(initialContext = {}) {
  let context = { headers: {}, ...initialContext };
  return {
    getContext: () => context,
    setContext: (next) => {
      context = { ...context, ...(typeof next === 'function' ? next(context) : next) };
      return context;
    },
  };
}

/** Runs authLink and resolves with the headers it left on the context. */
function runAuthLink(operation) {
  return new Promise((resolve, reject) => {
    const forward = (op) => ({
      subscribe: (observer) => {
        observer.next(op.getContext().headers);
        observer.complete();
        return { unsubscribe() {} };
      },
    });
    authLink.request(operation, forward).subscribe({
      next: resolve,
      error: reject,
    });
  });
}

describe('authLink CSRF header', () => {
  it('attaches X-CSRF-Token from the geek_csrf cookie', async () => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
    const headers = await runAuthLink(makeOperation());
    expect(headers[CSRF_HEADER_NAME]).toBe(TOKEN);
  });

  it('adds no header when there is no geek_csrf cookie yet', async () => {
    setCookieJar('geek_theme=dark');
    const headers = await runAuthLink(makeOperation());
    expect(headers[CSRF_HEADER_NAME]).toBeUndefined();
  });

  it('attaches it alongside the Authorization bearer token', async () => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
    setLocalStorage({ geek_token: 'jwt-value' });
    const headers = await runAuthLink(makeOperation());
    expect(headers[CSRF_HEADER_NAME]).toBe(TOKEN);
    expect(headers.authorization).toBe('Bearer jwt-value');
  });

  it('preserves headers already on the operation context', async () => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
    const headers = await runAuthLink(makeOperation({ headers: { 'x-app': 'notegeek' } }));
    expect(headers['x-app']).toBe('notegeek');
    expect(headers[CSRF_HEADER_NAME]).toBe(TOKEN);
  });
});
