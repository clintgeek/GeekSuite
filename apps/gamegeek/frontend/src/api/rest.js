/**
 * GameGeek's own REST backend (same origin, `/api`, cookie auth): bytes and
 * jobs only — metadata search, covers, imports. Plain data goes through the
 * gateway.
 *
 * Every state-changing call carries the double-submit CSRF header from
 * @geeksuite/auth. There is deliberately NO logout path in here: a 401 from
 * this backend surfaces as an error to the caller, and a 5xx is a retryable
 * failure, never a verdict on the session. The shared Apollo link and
 * getMe() own session death.
 */
import { csrfHeaders } from '@geeksuite/auth';

const API = '/api';

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: 'include',
    signal,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...csrfHeaders(method),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  let data = null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : null) ||
      (res.status >= 500 ? 'The GameGeek server is having a moment. Try again shortly.' : `Request failed (${res.status})`);
    throw new ApiError(message, { status: res.status, body: data });
  }
  // Some backends wrap payloads as { success, data }; accept both shapes.
  if (data && typeof data === 'object' && 'data' in data && Object.keys(data).every((k) => ['success', 'data', 'message'].includes(k))) {
    return data.data;
  }
  return data;
}

export const getProviders = () => request('/metadata/providers');

export const searchMetadata = (q, { limit = 12, signal } = {}) =>
  request(`/metadata/search?q=${encodeURIComponent(q)}&limit=${limit}`, { signal });

export const getSteamCandidate = (appId) => request(`/metadata/steam/${encodeURIComponent(appId)}`);

export function uploadCover(gameId, file) {
  const form = new FormData();
  form.append('cover', file);
  return request(`/games/${encodeURIComponent(gameId)}/cover`, { method: 'POST', body: form });
}

export const fetchCover = (gameId, url) =>
  request(`/games/${encodeURIComponent(gameId)}/cover/fetch`, { method: 'POST', body: { url } });

export const deleteCover = (gameId) =>
  request(`/games/${encodeURIComponent(gameId)}/cover`, { method: 'DELETE' });

/**
 * Playnite: upload a Playnite Library Exporter export (schema v1). Multipart
 * — field `file`, flags as form fields so the same request works whether the
 * backend reads them as query params or multipart fields.
 */
export function importPlaynite(file, { dryRun = true, includeHidden = false } = {}) {
  const form = new FormData();
  form.append('file', file);
  form.append('dryRun', String(Boolean(dryRun)));
  form.append('includeHidden', String(Boolean(includeHidden)));
  return request('/import/playnite', { method: 'POST', body: form });
}

/**
 * The Nextcloud auto-import's state for this user
 * (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md, folder import): whether it's
 * running, whether this user's folder is being watched, and the last file it
 * touched. The manual upload above stays the fallback either way.
 */
export const getPlayniteDropStatus = () => request('/import/playnite/drop/status');

/**
 * Metadata & cover enrichment (DOCS/METADATA_ENRICHMENT.md). The worker runs
 * per household in the gamegeek backend; these calls read its status, kick
 * it off, and let a person fix a game it got wrong or hasn't reached yet.
 */
export const getEnrichStatus = () => request('/metadata/enrich/status');

export const runEnrich = () => request('/metadata/enrich/run', { method: 'POST' });

export const refreshGameMetadata = (gameId) =>
  request(`/games/${encodeURIComponent(gameId)}/metadata/refresh`, { method: 'POST' });

export const getMetadataCandidates = (gameId) =>
  request(`/games/${encodeURIComponent(gameId)}/metadata/candidates`);

export const applyMetadataCandidate = (gameId, { provider, providerId }) =>
  request(`/games/${encodeURIComponent(gameId)}/metadata/apply`, { method: 'POST', body: { provider, providerId } });

export const unlinkMetadata = (gameId) =>
  request(`/games/${encodeURIComponent(gameId)}/metadata/unlink`, { method: 'POST' });
