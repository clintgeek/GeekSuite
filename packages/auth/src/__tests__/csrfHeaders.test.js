/**
 * csrfHeaders.test.js — the client half of basegeek's double-submit CSRF token.
 *
 * basegeek issues `geek_csrf` (not HttpOnly, `domain=.clintgeek.com`) and
 * requires it echoed in `X-CSRF-Token` on any cookie-authenticated mutation.
 * This module is the shared client every app uses to talk to basegeek, so if
 * the header goes missing here it goes missing suite-wide.
 *
 * Runs on node:test — no jsdom. `document` is stubbed to exactly what the code
 * reads (a `cookie` string), which is the whole surface `readCsrfToken` uses.
 *
 * Run with: pnpm --filter @geeksuite/auth test
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  readCsrfToken,
  csrfHeaders,
  logout,
  setupAxiosInterceptors,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from '../authClient.js';

const TOKEN = 'oO2xk5Yz1QqFbn-8LmvTz7cRk2sQeWpUvHgJdNaBcDe';

/** Point `document.cookie` at a jar string, or remove the global entirely. */
function setCookieJar(value) {
  if (value === null) {
    delete globalThis.document;
    return;
  }
  globalThis.document = { cookie: value };
}

afterEach(() => {
  delete globalThis.document;
  delete globalThis.fetch;
});

describe('readCsrfToken', () => {
  test('pulls geek_csrf out of a jar with several cookies', () => {
    setCookieJar(`geek_theme=dark; ${ CSRF_COOKIE_NAME }=${ TOKEN }; other=1`);
    assert.equal(readCsrfToken(), TOKEN);
  });

  test('handles the token being first, last, and alone', () => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }; b=2`);
    assert.equal(readCsrfToken(), TOKEN);
    setCookieJar(`a=1; ${ CSRF_COOKIE_NAME }=${ TOKEN }`);
    assert.equal(readCsrfToken(), TOKEN);
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
    assert.equal(readCsrfToken(), TOKEN);
  });

  test('does not match a cookie whose name merely ends in geek_csrf', () => {
    setCookieJar(`not_geek_csrf=${ TOKEN }`);
    assert.equal(readCsrfToken(), null);
  });

  test('returns null when the cookie is absent, empty, or the jar is empty', () => {
    setCookieJar('geek_theme=dark');
    assert.equal(readCsrfToken(), null);
    setCookieJar(`${ CSRF_COOKIE_NAME }=`);
    assert.equal(readCsrfToken(), null);
    setCookieJar('');
    assert.equal(readCsrfToken(), null);
  });

  test('returns null server-side, where there is no document at all', () => {
    setCookieJar(null);
    assert.equal(readCsrfToken(), null);
  });

  test('reads fresh each call — basegeek rotates the token on every refresh', () => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
    assert.equal(readCsrfToken(), TOKEN);
    globalThis.document.cookie = `${ CSRF_COOKIE_NAME }=rotated-value`;
    assert.equal(readCsrfToken(), 'rotated-value');
  });
});

describe('csrfHeaders', () => {
  beforeEach(() => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
  });

  test('returns the header when a token is present', () => {
    assert.deepEqual(csrfHeaders(), { [CSRF_HEADER_NAME]: TOKEN });
  });

  test('returns an empty object when there is no token, so it is always spreadable', () => {
    setCookieJar('geek_theme=dark');
    assert.deepEqual(csrfHeaders(), {});
    assert.deepEqual({ 'Content-Type': 'application/json', ...csrfHeaders() }, {
      'Content-Type': 'application/json',
    });
  });

  test('skips the header for safe methods when a method is given', () => {
    for (const method of ['GET', 'get', 'HEAD', 'options', 'TRACE']) {
      assert.deepEqual(csrfHeaders(method), {}, `expected no header for ${ method }`);
    }
  });

  test('adds it for every state-changing method', () => {
    for (const method of ['POST', 'put', 'PATCH', 'delete']) {
      assert.deepEqual(csrfHeaders(method), { [CSRF_HEADER_NAME]: TOKEN }, method);
    }
  });

  test('adds it when no method is given at all', () => {
    assert.deepEqual(csrfHeaders(undefined), { [CSRF_HEADER_NAME]: TOKEN });
  });
});

describe('logout()', () => {
  test('sends the CSRF header on its POST to basegeek', async () => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
    let seen = null;
    globalThis.fetch = async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({}) };
    };

    await logout();

    assert.match(seen.url, /\/auth\/logout$/);
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers[CSRF_HEADER_NAME], TOKEN);
    assert.equal(seen.init.credentials, 'include');
  });

  test('still posts (and still logs out) when no token has been issued yet', async () => {
    setCookieJar('geek_theme=dark');
    let seen = null;
    globalThis.fetch = async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({}) };
    };

    await logout();

    assert.ok(seen, 'logout must not be skipped just because there is no CSRF token');
    assert.equal(seen.init.headers[CSRF_HEADER_NAME], undefined);
  });
});

describe('setupAxiosInterceptors', () => {
  /** Minimal stand-in for an axios instance: captures the request interceptor. */
  function fakeAxios() {
    const instance = {
      requestInterceptor: null,
      interceptors: {
        request: { use: (fn) => { instance.requestInterceptor = fn; } },
        response: { use: () => {} },
      },
    };
    return instance;
  }

  beforeEach(() => {
    setCookieJar(`${ CSRF_COOKIE_NAME }=${ TOKEN }`);
  });

  test('adds the header to a POST', () => {
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = ax.requestInterceptor({ method: 'post', headers: {} });
    assert.equal(config.headers[CSRF_HEADER_NAME], TOKEN);
  });

  test('leaves a GET alone', () => {
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = ax.requestInterceptor({ method: 'get', headers: {} });
    assert.equal(config.headers[CSRF_HEADER_NAME], undefined);
  });

  test('does not clobber a header a call site set deliberately', () => {
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = ax.requestInterceptor({
      method: 'put',
      headers: { [CSRF_HEADER_NAME]: 'explicit-value' },
    });
    assert.equal(config.headers[CSRF_HEADER_NAME], 'explicit-value');
  });

  test('adds nothing when the session has no token yet', () => {
    setCookieJar('geek_theme=dark');
    const ax = fakeAxios();
    setupAxiosInterceptors(ax);

    const config = ax.requestInterceptor({ method: 'post', headers: {} });
    assert.equal(config.headers[CSRF_HEADER_NAME], undefined);
  });
});
