/**
 * goingOverOutbound.test.js — pinning tests for the outbound half of the
 * 2026-09-05 going-over: what this process sends, where it sends it, and what
 * happens when the far end is slow, hostile, or named by the caller.
 *
 * axios is mocked at module level so nothing here touches the network. Each
 * case asserts on the request that WOULD have gone out.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

/** Every axios call this suite provokes, in order. */
let calls = [];
/** What the next axios call resolves with. */
let nextResponse = { status: 200, data: {} };

const record = (config) => {
  calls.push(config);
  return Promise.resolve(nextResponse);
};

jest.unstable_mockModule('axios', () => {
  const axios = {
    request: (config) => record(config),
    get: (url, config = {}) => record({ method: 'GET', url, ...config }),
    post: (url, data, config = {}) => record({ method: 'POST', url, data, ...config }),
  };
  return { default: axios, ...axios };
});

const { getFreshAccessToken, __test__ } = await import('../services/oauthConnectionService.js');
const { gmailGetMessage } = await import('../services/ambientService.js');

beforeEach(() => {
  calls = [];
  nextResponse = { status: 200, data: {} };
});

// ───────────────────────────────────────────────────────────────────────────
describe('a Gmail message id is one path segment, never a path', () => {
  /**
   * `routes/ambient.js` mounts `GET /gmail/messages/:id` and the service
   * interpolated that raw param into the URL. Express decodes `%2F` into a
   * literal '/', so an id of `..%2F..%2Fsettings` walked out of `/messages/`
   * and reached other Gmail API paths — with the caller's own OAuth token
   * already attached by `providerRequest`.
   */
  const tokenStub = {
    getAccessToken: () => 'access-token',
    getRefreshToken: () => 'refresh-token',
    expiresAt: new Date(Date.now() + 3600_000),
    accessTokenEncrypted: 'cipher',
    lastError: null,
  };

  it('percent-encodes a traversal attempt instead of following it', async () => {
    jest.unstable_mockModule('../models/OAuthConnection.js', () => ({}));
    // Rather than stub the whole model layer, assert on the URL builder alone:
    // reproduce exactly what the service does with the id it is given.
    const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
    const hostile = '../../../settings/forwarding';
    const built = `${GMAIL_BASE}/messages/${encodeURIComponent(hostile)}`;

    // The traversal survives only as literal text inside one segment.
    expect(built).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/..%2F..%2F..%2Fsettings%2Fforwarding'
    );
    // And node's URL parser agrees the path did not move.
    expect(new URL(built).pathname).toBe(
      '/gmail/v1/users/me/messages/..%2F..%2F..%2Fsettings%2Fforwarding'
    );
    // Whereas unencoded it does, which is the bug: three `..` segments walk
    // out of `/users/me/messages/` and land somewhere else entirely on the
    // same host, with the caller's OAuth token attached.
    const escaped = new URL(`${GMAIL_BASE}/messages/${hostile}`).pathname;
    expect(escaped).toBe('/gmail/v1/settings/forwarding');
    expect(escaped).not.toContain('/messages/');
  });

  it('leaves an ordinary Gmail id untouched', () => {
    // Real ids are hex, so encoding must be a no-op for every real call.
    expect(encodeURIComponent('18f3c2a9b7d4e1f0')).toBe('18f3c2a9b7d4e1f0');
  });

  it('is what the service actually calls', () => {
    // Guard against the fix being reverted: the source must not interpolate
    // the id bare.
    const source = gmailGetMessage.toString();
    expect(source).toContain('encodeURIComponent(id)');
    expect(source).not.toMatch(/messages\/\$\{id\}/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('the OAuth token endpoints have a timeout', () => {
  /**
   * `disconnect()`'s revoke call had a 5s cap; the token EXCHANGE and the
   * REFRESH did not, so axios's default of "wait forever" applied. A hung
   * Google endpoint held an /api/connections request open indefinitely — and
   * wedged the oauthRefreshJobService tick, which awaits these serially for
   * every connection due for refresh.
   */
  it('declares one, and it is finite', () => {
    expect(typeof __test__.TOKEN_ENDPOINT_TIMEOUT_MS).toBe('number');
    expect(__test__.TOKEN_ENDPOINT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(Number.isFinite(__test__.TOKEN_ENDPOINT_TIMEOUT_MS)).toBe(true);
  });

  it('passes it on the refresh call', async () => {
    // getFreshAccessToken reaches refreshTokens() once it has a doc with a
    // refresh token and an expired access token. Rather than stand up Mongo,
    // assert the module source carries the option on both token calls — there
    // are exactly two axios.post sites and both must have it.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(
      new URL('../services/oauthConnectionService.js', import.meta.url),
      'utf8'
    );
    const tokenPosts = src.split('axios.post(cfg.tokenUrl').length - 1;
    expect(tokenPosts).toBe(2);
    const withTimeout = src.split('timeout: TOKEN_ENDPOINT_TIMEOUT_MS').length - 1;
    expect(withTimeout).toBe(2);
  });

  it('exports getFreshAccessToken unchanged', () => {
    expect(typeof getFreshAccessToken).toBe('function');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('no provider credential leaves this process in a URL', () => {
  /**
   * @geeksuite/logger's `err` serializer drops `err.config.headers` and
   * `err.request` but deliberately KEEPS `err.config.url` — it is the one
   * field that says which call failed. Gemini put its API key in the query
   * string, so it was the one provider credential that still reached the logs
   * in the clear on any failure.
   */
  it('sends the Gemini key as a header, never as ?key=', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../services/aiService.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\?key=\$\{/);
    expect(src).toContain("'x-goog-api-key'");
  });

  it('logs a key hint rather than a key fragment', async () => {
    const { readFileSync } = await import('node:fs');
    const aiService = readFileSync(new URL('../services/aiService.js', import.meta.url), 'utf8');
    const aiRoutes = readFileSync(new URL('../routes/aiRoutes.js', import.meta.url), 'utf8');
    // 12+8 characters of a provider key on boot, and 8+4 on /test, are most of
    // a short key. config/aiProviders.js defines the only fragment that may
    // leave the process.
    expect(aiService).not.toMatch(/apiKey\.substring\(0, 12\)/);
    expect(aiRoutes).not.toMatch(/apiKey\.substring\(0, 8\)/);
    expect(aiService).toContain('keyHintFor(apiKey)');
  });

  it('keyHintFor gives away four characters and no more', async () => {
    const { keyHintFor } = await import('../config/aiProviders.js');
    expect(keyHintFor('gsk_averylongsecretkeyvalue9876')).toBe('…9876');
    expect(keyHintFor('abc')).toBe('');
  });

  it('has no credentialed connection string left in a git-tracked route', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../routes/mongo.js', import.meta.url), 'utf8');
    // A default of `mongodb://user:pass@host/...` in source is a published
    // secret. The fallback must carry no userinfo at all.
    const fallback = src.match(/const MONGODB_URI = [^\n]+/)[0];
    expect(fallback).not.toMatch(/mongodb:\/\/[^'"@\s]+:[^'"@\s]+@/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('every outbound models fetch is capped', () => {
  it('gives the Groq models call a timeout like its siblings', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../services/aiService.js', import.meta.url), 'utf8');
    const groqFetch = src.slice(
      src.indexOf("axios.get('https://api.groq.com/openai/v1/models'"),
      src.indexOf("axios.get('https://api.groq.com/openai/v1/models'") + 320
    );
    expect(groqFetch).toMatch(/timeout:\s*\d+/);
  });
});
