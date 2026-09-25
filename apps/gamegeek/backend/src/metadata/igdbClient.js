/**
 * IGDB network client: Twitch client-credentials OAuth (cached until
 * expiry) + the apicalypse `/games` search call, queued behind a 4 req/s
 * limiter (DOCS/GameGeekPlan.md §4.2). Normalization lives in igdb.js and is
 * pure/tested-offline; this file is the only place that reaches the network
 * and is deliberately thin so the fixture tests never need to touch it.
 */
import { createRateLimiter } from '../lib/rateLimiter.js';
import { IGDB_GAME_FIELDS } from './igdb.js';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_GAMES_URL = 'https://api.igdb.com/v4/games';
const OUTBOUND_TIMEOUT_MS = 10000;

// 4 requests/second, shared across every caller of this module.
const limiter = createRateLimiter({ maxPerInterval: 4, intervalMs: 1000 });

let cachedToken = null; // { accessToken, expiresAt } — expiresAt is epoch ms.

export function isIgdbConfigured(env = process.env) {
  return Boolean(env.IGDB_CLIENT_ID && env.IGDB_CLIENT_SECRET);
}

/** Exposed for tests: clears the cached app token. */
export function resetIgdbTokenCache() {
  cachedToken = null;
}

async function fetchAppToken({ fetchImpl = fetch, env = process.env } = {}) {
  const url = new URL(TWITCH_TOKEN_URL);
  url.searchParams.set('client_id', env.IGDB_CLIENT_ID);
  url.searchParams.set('client_secret', env.IGDB_CLIENT_SECRET);
  url.searchParams.set('grant_type', 'client_credentials');

  const res = await fetchImpl(url.toString(), {
    method: 'POST',
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`IGDB token request failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data?.access_token) {
    throw new Error('IGDB token response missing access_token');
  }
  // Refresh a little early rather than racing the exact expiry instant.
  const safetyMarginMs = 30_000;
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(0, (data.expires_in || 0) * 1000 - safetyMarginMs),
  };
  return cachedToken.accessToken;
}

async function getAppToken(options) {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }
  return fetchAppToken(options);
}

/** Escape a search term for an apicalypse double-quoted string literal. */
function escapeApicalypse(term) {
  return String(term).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * @param {string} query
 * @param {number} limit
 * @param {object} [options]
 * @returns {Promise<object[]>} raw IGDB `/games` response array (not yet normalized).
 */
export async function searchIgdbGames(query, limit, options = {}) {
  const { fetchImpl = fetch, env = process.env } = options;
  if (!isIgdbConfigured(env)) {
    throw new Error('IGDB is not configured');
  }

  return limiter.schedule(async () => {
    const token = await getAppToken({ fetchImpl, env });
    const body = `search "${escapeApicalypse(query)}"; fields ${IGDB_GAME_FIELDS}; limit ${limit};`;

    const res = await fetchImpl(IGDB_GAMES_URL, {
      method: 'POST',
      headers: {
        'Client-ID': env.IGDB_CLIENT_ID,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body,
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`IGDB search failed: ${res.status}`);
    }
    return res.json();
  });
}

export default { isIgdbConfigured, resetIgdbTokenCache, searchIgdbGames };
