/**
 * Steam network calls: the keyless store search, and appdetails. Both are
 * public, unauthenticated endpoints — no API key needed for either.
 * Normalization lives in steam.js and is pure/tested-offline.
 */
const OUTBOUND_TIMEOUT_MS = 10000;

/** An Error carrying the HTTP status, so a caller can back off on 429. */
function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function searchSteamStore(query, options = {}) {
  const { fetchImpl = fetch } = options;
  const url = new URL('https://store.steampowered.com/api/storesearch/');
  url.searchParams.set('term', query);
  url.searchParams.set('l', 'english');
  url.searchParams.set('cc', 'US');

  const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS) });
  if (!res.ok) {
    throw httpError(`Steam store search failed: ${res.status}`, res.status);
  }
  return res.json();
}

export async function fetchSteamAppDetails(appId, options = {}) {
  const { fetchImpl = fetch } = options;
  const url = new URL('https://store.steampowered.com/api/appdetails');
  url.searchParams.set('appids', String(appId));
  url.searchParams.set('l', 'english');

  const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS) });
  if (!res.ok) {
    throw httpError(`Steam appdetails failed: ${res.status}`, res.status);
  }
  return res.json();
}

export default { searchSteamStore, fetchSteamAppDetails };
