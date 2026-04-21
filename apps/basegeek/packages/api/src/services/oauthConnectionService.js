/**
 * oauthConnectionService.js
 *
 * Household-wide OAuth token management. See PLAN.md "Auth rework —
 * OAuth-via-Mongo" for the full contract.
 *
 * Responsibilities:
 *   - Build provider authorize URLs with HMAC-signed state
 *   - Exchange authorization codes for tokens (handleCallback)
 *   - Serve fresh access tokens to internal consumers (getFreshAccessToken)
 *   - List + disconnect connections
 *
 * Token material never leaves this module except:
 *   - back to the consumer that explicitly asked for it via getFreshAccessToken
 *   - to the provider's token endpoint during refresh
 *
 * listConnections() + every HTTP response wrapper must scrub tokens.
 */

import crypto from 'crypto';
import axios from 'axios';
import OAuthConnection from '../models/OAuthConnection.js';
import logger from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ProviderExpiredError extends Error {
  constructor(message, { provider, userId } = {}) {
    super(message);
    this.name = 'ProviderExpiredError';
    this.provider = provider;
    this.userId = userId;
  }
}

export class InvalidStateError extends Error {
  constructor(message = 'invalid oauth state') {
    super(message);
    this.name = 'InvalidStateError';
  }
}

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------

const PROVIDERS = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    scopes: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    redirectUriEnv: 'GOOGLE_REDIRECT_URI',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  },
  spotify: {
    authorizeUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    revokeUrl: null,
    scopes: [
      'user-read-playback-state',
      'user-read-currently-playing',
      'user-modify-playback-state',
      'user-read-recently-played',
    ],
    clientIdEnv: 'SPOTIFY_CLIENT_ID',
    clientSecretEnv: 'SPOTIFY_CLIENT_SECRET',
    redirectUriEnv: 'SPOTIFY_REDIRECT_URI',
    extraAuthParams: {},
  },
};

export function getProviderConfig(provider) {
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    throw new Error(`[oauthConnectionService] unknown provider "${provider}"`);
  }
  return cfg;
}

function getClientCreds(provider) {
  const cfg = getProviderConfig(provider);
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  const redirectUri = process.env[cfg.redirectUriEnv];
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      `[oauthConnectionService] missing env for ${provider}: require ` +
        `${cfg.clientIdEnv}, ${cfg.clientSecretEnv}, ${cfg.redirectUriEnv}`
    );
  }
  return { clientId, clientSecret, redirectUri };
}

// ---------------------------------------------------------------------------
// State — HMAC-signed JSON payload
// ---------------------------------------------------------------------------

function getStateSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('[oauthConnectionService] JWT_SECRET is not set');
  }
  return secret;
}

function b64urlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(normalized, 'base64');
}

export function signState(payload) {
  const json = JSON.stringify(payload);
  const body = b64urlEncode(json);
  const sig = crypto
    .createHmac('sha256', getStateSecret())
    .update(body)
    .digest();
  return `${body}.${b64urlEncode(sig)}`;
}

export function verifyState(state) {
  if (typeof state !== 'string' || !state.includes('.')) {
    throw new InvalidStateError('malformed state');
  }
  const [body, sig] = state.split('.');
  if (!body || !sig) throw new InvalidStateError('malformed state');

  const expectedSig = crypto
    .createHmac('sha256', getStateSecret())
    .update(body)
    .digest();
  const providedSig = b64urlDecode(sig);

  if (
    expectedSig.length !== providedSig.length ||
    !crypto.timingSafeEqual(expectedSig, providedSig)
  ) {
    throw new InvalidStateError('signature mismatch');
  }

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8'));
  } catch {
    throw new InvalidStateError('malformed payload');
  }
  return payload;
}

// ---------------------------------------------------------------------------
// getAuthorizeUrl
// ---------------------------------------------------------------------------

export function getAuthorizeUrl(provider, { userId, returnTo } = {}) {
  if (!userId) throw new Error('[getAuthorizeUrl] userId required');
  const cfg = getProviderConfig(provider);
  const { clientId, redirectUri } = getClientCreds(provider);

  const nonce = crypto.randomBytes(16).toString('hex');
  const state = signState({ userId, returnTo: returnTo || null, nonce, provider });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: cfg.scopes.join(' '),
    state,
    ...cfg.extraAuthParams,
  });

  return {
    url: `${cfg.authorizeUrl}?${params.toString()}`,
    state,
  };
}

// ---------------------------------------------------------------------------
// Token exchange helpers
// ---------------------------------------------------------------------------

async function exchangeCodeForTokens(provider, code) {
  const cfg = getProviderConfig(provider);
  const { clientId, clientSecret, redirectUri } = getClientCreds(provider);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await axios.post(cfg.tokenUrl, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    validateStatus: () => true,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `[oauthConnectionService] token exchange failed: ${res.status} ${JSON.stringify(
        res.data
      )}`
    );
  }
  return res.data;
}

async function refreshTokens(provider, refreshToken) {
  const cfg = getProviderConfig(provider);
  const { clientId, clientSecret } = getClientCreds(provider);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await axios.post(cfg.tokenUrl, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    validateStatus: () => true,
  });

  return { status: res.status, data: res.data };
}

// ---------------------------------------------------------------------------
// handleCallback — upsert connection
// ---------------------------------------------------------------------------

export async function handleCallback(provider, { code, state } = {}) {
  if (!code) throw new Error('[handleCallback] code required');
  const payload = verifyState(state);

  if (payload.provider && payload.provider !== provider) {
    throw new InvalidStateError('provider mismatch');
  }

  const tokens = await exchangeCodeForTokens(provider, code);

  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;
  const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : null;
  const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/) : [];
  const providerAccountId = tokens.id_token
    ? extractSubFromIdToken(tokens.id_token)
    : null;

  if (!accessToken) {
    throw new Error('[handleCallback] provider did not return access_token');
  }

  const existing = await OAuthConnection.findOne({
    userId: payload.userId,
    provider,
  });

  const doc =
    existing ||
    new OAuthConnection({
      userId: payload.userId,
      provider,
      providerAccountId,
    });

  if (!existing && providerAccountId) {
    doc.providerAccountId = providerAccountId;
  }

  await OAuthConnection.setTokens(doc, {
    accessToken,
    refreshToken,
    expiresIn,
    scopes,
  });

  logger.info(
    { provider, userId: payload.userId },
    '[oauthConnectionService] stored tokens for user'
  );

  return { userId: payload.userId, returnTo: payload.returnTo || null };
}

function extractSubFromIdToken(idToken) {
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
    return payload.sub || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// getFreshAccessToken — cache-aware, refresh if needed
// ---------------------------------------------------------------------------

const EXPIRY_BUFFER_MS = 60 * 1000; // 60s

function isInvalidGrant(data) {
  if (!data) return false;
  const err = typeof data === 'string' ? data : data.error;
  return err === 'invalid_grant';
}

export async function getFreshAccessToken(userId, provider) {
  if (!userId) throw new Error('[getFreshAccessToken] userId required');
  getProviderConfig(provider); // validates

  const doc = await OAuthConnection.findOne({ userId, provider });
  if (!doc) {
    throw new ProviderExpiredError(
      `no connection for user ${userId} / ${provider}`,
      { provider, userId }
    );
  }

  if (doc.lastError && !doc.accessTokenEncrypted) {
    throw new ProviderExpiredError(
      `connection for ${provider} is in error state: ${doc.lastError}`,
      { provider, userId }
    );
  }

  const now = Date.now();
  const expiresAtMs = doc.expiresAt ? doc.expiresAt.getTime() : 0;

  if (doc.accessTokenEncrypted && expiresAtMs > now + EXPIRY_BUFFER_MS) {
    const token = doc.getAccessToken();
    if (token) {
      return { accessToken: token, expiresAt: doc.expiresAt };
    }
    // fall through to refresh if decrypt failed
  }

  const refreshToken = doc.getRefreshToken();
  if (!refreshToken) {
    doc.lastError = 'missing_refresh_token';
    doc.accessTokenEncrypted = null;
    await doc.save();
    throw new ProviderExpiredError(
      `no refresh token available for ${provider}`,
      { provider, userId }
    );
  }

  const { status, data } = await refreshTokens(provider, refreshToken);

  if (status < 200 || status >= 300) {
    const permanent = status === 400 && isInvalidGrant(data);
    if (permanent) {
      doc.lastError = `invalid_grant: ${JSON.stringify(data)}`.slice(0, 500);
      doc.accessTokenEncrypted = null;
      await doc.save();
      logger.warn(
        { provider, userId, status },
        '[oauthConnectionService] refresh permanently failed — marked expired'
      );
      throw new ProviderExpiredError(
        `refresh failed (${status})`,
        { provider, userId }
      );
    }
    // Transient — do not clobber state
    logger.error(
      { provider, userId, status, data },
      '[oauthConnectionService] refresh transient failure'
    );
    throw new Error(`[oauthConnectionService] refresh failed: ${status}`);
  }

  const newAccess = data.access_token;
  const newRefresh = data.refresh_token; // may be undefined (Google often omits)
  const expiresIn =
    typeof data.expires_in === 'number' ? data.expires_in : null;
  const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/) : [];

  if (!newAccess) {
    throw new Error('[oauthConnectionService] refresh response missing access_token');
  }

  await OAuthConnection.setTokens(doc, {
    accessToken: newAccess,
    refreshToken: newRefresh,
    expiresIn,
    scopes: scopes.length ? scopes : undefined,
  });

  return { accessToken: newAccess, expiresAt: doc.expiresAt };
}

// ---------------------------------------------------------------------------
// listConnections — never returns token material
// ---------------------------------------------------------------------------

export async function listConnections(userId) {
  if (!userId) throw new Error('[listConnections] userId required');
  const docs = await OAuthConnection.find({ userId });

  return docs.map((doc) => {
    let status;
    if (doc.lastError) {
      status = 'error';
    } else if (
      !doc.accessTokenEncrypted ||
      (doc.expiresAt && doc.expiresAt.getTime() <= Date.now())
    ) {
      status = 'expired';
    } else {
      status = 'connected';
    }

    return {
      provider: doc.provider,
      status,
      scopes: Array.isArray(doc.scopes) ? [...doc.scopes] : [],
      expiresAt: doc.expiresAt,
      lastError: doc.lastError || null,
    };
  });
}

// ---------------------------------------------------------------------------
// disconnect — best-effort provider revoke + hard delete
// ---------------------------------------------------------------------------

export async function disconnect(userId, provider) {
  if (!userId) throw new Error('[disconnect] userId required');
  const cfg = getProviderConfig(provider);

  const doc = await OAuthConnection.findOne({ userId, provider });
  if (!doc) return { deleted: false };

  if (cfg.revokeUrl) {
    const token = doc.getRefreshToken() || doc.getAccessToken();
    if (token) {
      try {
        await axios.post(
          cfg.revokeUrl,
          new URLSearchParams({ token }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 5000,
            validateStatus: () => true,
          }
        );
      } catch (err) {
        logger.warn(
          { err, provider, userId },
          '[oauthConnectionService] provider revoke failed — continuing with hard delete'
        );
      }
    }
  }

  await OAuthConnection.deleteOne({ _id: doc._id });
  logger.info(
    { provider, userId },
    '[oauthConnectionService] disconnected + deleted connection'
  );
  return { deleted: true };
}

// Exported for tests
export const __test__ = {
  PROVIDERS,
  EXPIRY_BUFFER_MS,
};
