/**
 * oauthConnectionService.test.js — unit tests for the household OAuth flow.
 *
 * Coverage (per Agent A brief):
 *   - state sign/verify round-trip
 *   - getFreshAccessToken returns cached when not expired
 *   - getFreshAccessToken refreshes when expired (axios mocked)
 *   - getFreshAccessToken sets lastError + throws ProviderExpiredError on
 *     refresh 400 invalid_grant
 *   - listConnections never leaks token material
 *
 * axios is mocked via jest.unstable_mockModule before the service is imported
 * (same pattern as the redis mock in auth.test.js).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

// Required env for oauthConnectionService.getClientCreds()
process.env.GOOGLE_CLIENT_ID = 'test-google-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.GOOGLE_REDIRECT_URI = 'https://basegeek.test/api/connections/google/callback';
process.env.SPOTIFY_CLIENT_ID = 'test-spotify-id';
process.env.SPOTIFY_CLIENT_SECRET = 'test-spotify-secret';
process.env.SPOTIFY_REDIRECT_URI = 'https://basegeek.test/api/connections/spotify/callback';

// ── axios mock ───────────────────────────────────────────────────────────────
// Holds the queue of canned responses the service under test will receive.
const axiosMock = {
  post: jest.fn(),
  get: jest.fn(),
};
jest.unstable_mockModule('axios', () => ({
  default: axiosMock,
  __esModule: true,
}));

// ── Dynamic imports AFTER mock registration ──────────────────────────────────
const { default: mongoose } = await import('mongoose');
const {
  signState,
  verifyState,
  getAuthorizeUrl,
  getFreshAccessToken,
  listConnections,
  handleCallback,
  ProviderExpiredError,
  InvalidStateError,
} = await import('../services/oauthConnectionService.js');
const { default: OAuthConnection } = await import('../models/OAuthConnection.js');
const { encrypt } = await import('../lib/cryptoVault.js');

// ── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  axiosMock.post.mockReset();
  axiosMock.get.mockReset();
  await OAuthConnection.deleteMany({});
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('signState / verifyState', () => {
  it('round-trips a payload through HMAC-signed state', () => {
    const payload = {
      userId: 'u-1',
      returnTo: '/suite',
      nonce: 'abc123',
      provider: 'google',
    };
    const state = signState(payload);
    const decoded = verifyState(state);
    expect(decoded).toEqual(payload);
  });

  it('rejects tampered state', () => {
    const state = signState({ userId: 'u-1', nonce: 'n', provider: 'google' });
    const [body, sig] = state.split('.');
    // Flip a character in the body — signature will no longer match
    const tamperedBody = body.slice(0, -1) + (body.endsWith('A') ? 'B' : 'A');
    const tampered = `${tamperedBody}.${sig}`;
    expect(() => verifyState(tampered)).toThrow(InvalidStateError);
  });

  it('rejects malformed state', () => {
    expect(() => verifyState('not-a-state')).toThrow(InvalidStateError);
    expect(() => verifyState('')).toThrow(InvalidStateError);
  });

  it('getAuthorizeUrl embeds a verifiable state param', () => {
    const { url, state } = getAuthorizeUrl('google', {
      userId: 'u-42',
      returnTo: '/home',
    });
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=test-google-id');
    expect(url).toContain(`state=${encodeURIComponent(state)}`);
    const payload = verifyState(state);
    expect(payload.userId).toBe('u-42');
    expect(payload.returnTo).toBe('/home');
    expect(payload.provider).toBe('google');
  });
});

describe('getFreshAccessToken', () => {
  it('returns the cached access token when expiresAt is well in the future', async () => {
    await OAuthConnection.create({
      userId: 'u-cached',
      provider: 'google',
      accessTokenEncrypted: encrypt('cached-access'),
      refreshTokenEncrypted: encrypt('cached-refresh'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // +10 minutes
      scopes: ['openid'],
    });

    const { accessToken } = await getFreshAccessToken('u-cached', 'google');
    expect(accessToken).toBe('cached-access');
    expect(axiosMock.post).not.toHaveBeenCalled();
  });

  it('refreshes via the token endpoint when expired', async () => {
    await OAuthConnection.create({
      userId: 'u-stale',
      provider: 'google',
      accessTokenEncrypted: encrypt('stale-access'),
      refreshTokenEncrypted: encrypt('stale-refresh'),
      expiresAt: new Date(Date.now() - 60 * 1000), // expired 1 min ago
      scopes: ['openid'],
    });

    axiosMock.post.mockResolvedValueOnce({
      status: 200,
      data: {
        access_token: 'fresh-access',
        // Google often omits refresh_token on refresh — ensure we keep the old one
        expires_in: 3600,
        scope: 'openid email',
      },
    });

    const { accessToken, expiresAt } = await getFreshAccessToken('u-stale', 'google');
    expect(accessToken).toBe('fresh-access');
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 3000 * 1000);

    expect(axiosMock.post).toHaveBeenCalledTimes(1);
    const [calledUrl, calledBody] = axiosMock.post.mock.calls[0];
    expect(calledUrl).toBe('https://oauth2.googleapis.com/token');
    expect(String(calledBody)).toContain('grant_type=refresh_token');
    expect(String(calledBody)).toContain('refresh_token=stale-refresh');

    // Doc updated in-place; refresh token preserved
    const reloaded = await OAuthConnection.findOne({ userId: 'u-stale', provider: 'google' });
    expect(reloaded.getAccessToken()).toBe('fresh-access');
    expect(reloaded.getRefreshToken()).toBe('stale-refresh');
    expect(reloaded.lastError).toBeNull();
    expect(reloaded.lastRefreshedAt).toBeInstanceOf(Date);
  });

  it('sets lastError and throws ProviderExpiredError on 400 invalid_grant', async () => {
    await OAuthConnection.create({
      userId: 'u-dead',
      provider: 'google',
      accessTokenEncrypted: encrypt('dead-access'),
      refreshTokenEncrypted: encrypt('dead-refresh'),
      expiresAt: new Date(Date.now() - 60 * 1000),
      scopes: ['openid'],
    });

    axiosMock.post.mockResolvedValueOnce({
      status: 400,
      data: { error: 'invalid_grant', error_description: 'Token has been revoked' },
    });

    await expect(getFreshAccessToken('u-dead', 'google')).rejects.toBeInstanceOf(
      ProviderExpiredError
    );

    const reloaded = await OAuthConnection.findOne({ userId: 'u-dead', provider: 'google' });
    expect(reloaded.lastError).toMatch(/invalid_grant/);
    expect(reloaded.accessTokenEncrypted).toBeNull();
  });

  it('throws ProviderExpiredError when no connection exists', async () => {
    await expect(getFreshAccessToken('nobody', 'google')).rejects.toBeInstanceOf(
      ProviderExpiredError
    );
  });
});

describe('listConnections', () => {
  it('never returns token material', async () => {
    await OAuthConnection.create({
      userId: 'u-list',
      provider: 'google',
      accessTokenEncrypted: encrypt('should-not-leak-access'),
      refreshTokenEncrypted: encrypt('should-not-leak-refresh'),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: ['openid', 'email'],
    });
    await OAuthConnection.create({
      userId: 'u-list',
      provider: 'spotify',
      accessTokenEncrypted: null,
      refreshTokenEncrypted: encrypt('refresh-only'),
      expiresAt: new Date(Date.now() - 60 * 1000),
      scopes: ['user-read-playback-state'],
      lastError: 'invalid_grant',
    });

    const rows = await listConnections('u-list');
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      // Shape: provider, status, scopes, expiresAt, lastError — nothing else
      expect(Object.keys(row).sort()).toEqual(
        ['provider', 'status', 'scopes', 'expiresAt', 'lastError'].sort()
      );
      // Double-check no token-like field survived
      expect(row).not.toHaveProperty('accessToken');
      expect(row).not.toHaveProperty('refreshToken');
      expect(row).not.toHaveProperty('accessTokenEncrypted');
      expect(row).not.toHaveProperty('refreshTokenEncrypted');

      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain('should-not-leak');
      expect(serialized).not.toContain('refresh-only');
      expect(serialized).not.toContain('v1:'); // cryptoVault prefix
    }

    const google = rows.find((r) => r.provider === 'google');
    const spotify = rows.find((r) => r.provider === 'spotify');
    expect(google.status).toBe('connected');
    expect(spotify.status).toBe('error');
    expect(spotify.lastError).toBe('invalid_grant');
  });
});

describe('handleCallback', () => {
  it('upserts a connection and returns userId + returnTo', async () => {
    const state = signState({
      userId: 'u-cb',
      returnTo: '/done',
      nonce: 'n1',
      provider: 'spotify',
    });

    axiosMock.post.mockResolvedValueOnce({
      status: 200,
      data: {
        access_token: 'spotify-access',
        refresh_token: 'spotify-refresh',
        expires_in: 3600,
        scope: 'user-read-playback-state',
      },
    });

    const result = await handleCallback('spotify', { code: 'auth-code', state });
    expect(result).toEqual({ userId: 'u-cb', returnTo: '/done' });

    const doc = await OAuthConnection.findOne({ userId: 'u-cb', provider: 'spotify' });
    expect(doc).toBeTruthy();
    expect(doc.getAccessToken()).toBe('spotify-access');
    expect(doc.getRefreshToken()).toBe('spotify-refresh');
    expect(doc.scopes).toEqual(['user-read-playback-state']);
  });

  it('rejects callback when state provider mismatches URL provider', async () => {
    const state = signState({
      userId: 'u-bad',
      returnTo: null,
      nonce: 'n2',
      provider: 'google',
    });
    await expect(
      handleCallback('spotify', { code: 'c', state })
    ).rejects.toBeInstanceOf(InvalidStateError);
  });
});
