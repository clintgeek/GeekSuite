/**
 * RAWG network client (https://api.rawg.io/docs). Keyed by RAWG_API_KEY,
 * queued behind a shared 1 req/s limiter
 * (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Pacing). Normalization lives in
 * rawg.js; this is the only file that reaches RAWG.
 *
 * The key travels as a query parameter (RAWG's only option), so an error
 * message here never includes the URL.
 */
import { createRateLimiter } from '../lib/rateLimiter.js';

const RAWG_BASE = 'https://api.rawg.io/api';
const OUTBOUND_TIMEOUT_MS = 10000;

const limiter = createRateLimiter({ maxPerInterval: 1, intervalMs: 1000 });

export function isRawgConfigured(env = process.env) {
  return Boolean(env.RAWG_API_KEY);
}

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function rawgGet(pathname, params, { fetchImpl = fetch, env = process.env } = {}) {
  if (!isRawgConfigured(env)) throw new Error('RAWG is not configured');
  const url = new URL(`${RAWG_BASE}${pathname}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
  url.searchParams.set('key', env.RAWG_API_KEY);

  return limiter.schedule(async () => {
    const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS) });
    if (!res.ok) throw httpError(`RAWG request failed: ${res.status}`, res.status);
    return res.json();
  });
}

/** @returns {Promise<object>} the raw `/games?search=` body (`{count, results}`). */
export function searchRawgGames(query, { pageSize = 10, ...options } = {}) {
  return rawgGet('/games', { search: query, page_size: pageSize }, options);
}

/** @returns {Promise<object|null>} the raw `/games/{id}` body, or null on 404. */
export async function fetchRawgGame(id, options = {}) {
  if (!/^\d+$/.test(String(id))) throw new Error('RAWG id must be digits');
  try {
    return await rawgGet(`/games/${id}`, {}, options);
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

export default { isRawgConfigured, searchRawgGames, fetchRawgGame };
