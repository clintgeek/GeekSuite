import axios from 'axios';

/**
 * The one axios instance every page in this app calls the backend through.
 *
 * Two things it gained in the 2026-09-05 going-over:
 *
 * **A deadline.** axios defaults `timeout` to `0` — wait forever. A socket
 * that hangs rather than errors left "The narrator contemplates…" and a
 * disabled composer on screen with no way out but a reload. 30s is the floor
 * for ordinary calls; the two genuinely long ones (`/continue`, which chains
 * two 45s GM calls plus extraction, and the export pipeline, which is one AI
 * call per six events) pass their own `timeout` at the call site.
 *
 * **An error envelope reader.** The backend answers a rejected request with
 * `{ success: false, error: { message, code, details:[{path,message}] } }`,
 * but `err.message` on an axios rejection is only ever
 * "Request failed with status code 400". Every caller showed that, or a
 * hardcoded string, so a zod rejection reached the player as a mystery. The
 * interceptor lifts the server's own message onto `err.message` and keeps the
 * code on `err.code`, leaving the raw response untouched for callers that
 * want it.
 */

export const LONG_REQUEST_TIMEOUT_MS = 180000;

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // `responseType: 'blob'` (the EPUB download) gives a Blob body that can't
    // be read synchronously — that call site unwraps it itself.
    const envelope = error.response?.data?.error;
    if (envelope?.message) {
      const detail = Array.isArray(envelope.details) && envelope.details.length > 0
        ? envelope.details.map((d) => `${d.path}: ${d.message}`).join('; ')
        : '';
      error.message = detail ? `${envelope.message} — ${detail}` : envelope.message;
      error.serverCode = envelope.code || null;
    } else if (typeof error.response?.data?.error === 'string') {
      error.message = error.response.data.error;
    } else if (error.code === 'ECONNABORTED') {
      error.message = 'The server took too long to answer. Try again.';
    }
    return Promise.reject(error);
  }
);

/** Read a JSON error envelope out of a Blob response body (EPUB download). */
export async function messageFromBlobError(error, fallback) {
  const body = error?.response?.data;
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    try {
      const parsed = JSON.parse(await body.text());
      const message = parsed?.error?.message || parsed?.error;
      if (typeof message === 'string' && message) return message;
    } catch {
      /* not JSON — fall through to the generic message */
    }
  }
  return error?.message || fallback;
}

export default api;
