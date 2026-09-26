/**
 * ThingGeek's own REST backend (same origin, `/api`, cookie auth): bytes
 * only — photo and document uploads. Plain data goes through the gateway.
 *
 * Every state-changing call carries the double-submit CSRF header from
 * @geeksuite/auth. There is deliberately NO logout path in here (GameGeek's
 * rule): a 401 surfaces as an error to the caller, a 5xx is retryable, and
 * the shared Apollo link and getMe() own session death. A 403
 * { code: 'NOT_A_MEMBER' } flips the app to the members-only page.
 */
import { csrfHeaders } from '@geeksuite/auth';
import { NOT_A_MEMBER, reportNotMember } from '../membership';

const API = '/api';

export class ApiError extends Error {
  constructor(message, { status, body, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.code = code ?? body?.code ?? body?.error?.code ?? null;
  }
}

function errorFrom(status, data) {
  const code = data?.code ?? data?.error?.code ?? null;
  if (status === 403 && code === NOT_A_MEMBER) reportNotMember();
  const message =
    data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : null) ||
    (status === 413
      ? 'That file is too big. The limit is 25 MB.'
      : status >= 500
        ? 'The ThingGeek server is having a moment. Try again shortly.'
        : `Request failed (${status})`);
  return new ApiError(message, { status, body: data, code });
}

/** `{ success, data }` wrappers and bare payloads both come back as the payload. */
function unwrap(data) {
  if (data && typeof data === 'object' && 'data' in data && Object.keys(data).every((k) => ['success', 'data', 'message'].includes(k))) {
    return data.data;
  }
  return data;
}

export async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
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
  if (!res.ok) throw errorFrom(res.status, data);
  return unwrap(data);
}

/**
 * Upload a photo or document onto a thing:
 *   POST /api/things/:id/files  multipart `file` + kind, role, caption|title
 *   → { file, entry }
 *
 * XMLHttpRequest rather than fetch, because fetch cannot report upload
 * progress and a 12 MB phone photo on a weak signal needs a bar.
 * `onProgress(0..1)`; `signal` aborts.
 */
export function uploadThingFile(thingId, { file, kind, role, caption, title }, { onProgress, signal } = {}) {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  if (role) form.append('role', role);
  if (kind === 'photo' && caption) form.append('caption', caption);
  if (kind === 'document' && title) form.append('title', title);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/things/${encodeURIComponent(thingId)}/files`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    Object.entries(csrfHeaders('POST')).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve(unwrap(data));
      } else {
        reject(errorFrom(xhr.status, data));
      }
    };
    xhr.onerror = () => reject(new ApiError('The upload lost its connection. Try again.', { status: 0 }));
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', { status: 0, code: 'ABORTED' }));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}
