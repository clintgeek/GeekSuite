// Upload plumbing for a body-composition scan (Arboleaf PDF/PNG export).
//
// This deliberately does NOT go through `apiService` — that module is a
// shim that translates REST-shaped calls into GraphQL operations against
// basegeek's gateway (see routeRequest() in apiService.js), and there is no
// multipart-upload equivalent on that gateway to translate to. The upload
// endpoints here are plain REST routes on THIS app's own Express backend
// (apps/fitnessgeek/backend/src/routes/bodyCompRoutes.js), so a direct
// same-origin fetch is the right tool, not a workaround.
//
// `csrfHeaders()` comes straight from `@geeksuite/auth` — the same helper
// `setupAxiosInterceptors()` uses internally — so this call is protected by
// the identical double-submit header every other mutation in the suite
// sends, and keeps working unchanged if/when `CSRF_TOKEN=enforce` ever
// extends beyond basegeek (DOCS/THE_PLAN.md §2.1).

// A 401 here gets ONE refresh-and-retry, then a plain "Please sign in again"
// (review P2: raw fetch never refreshed, and the raw text reached the screen).
// The auth package is read as a namespace so a build without `refreshSession`
// still loads; it then simply doesn't retry.

import * as auth from '@geeksuite/auth';
import { SIGNED_OUT_MESSAGE } from '../utils/errorMessage.js';

const { csrfHeaders } = auth;

/**
 * An Error carrying the HTTP status and body, Axios-shaped, so
 * `errorMessage()` can tell a restart (502) from friendly server text.
 */
function httpError(response, body, fallback) {
  const signedOut = response?.status === 401;
  const error = new Error(signedOut ? SIGNED_OUT_MESSAGE : body?.error?.message || fallback);
  error.code = body?.error?.code || `HTTP_${response?.status}`;
  error.status = response?.status;
  error.response = { status: response?.status, data: body };
  return error;
}

/**
 * Send a request; on a 401, refresh the session once and send it again.
 * `send` builds the request fresh each time (headers carry the CSRF token,
 * which a refresh may rotate).
 */
export async function fetchWithRefresh(send) {
  const response = await send();
  if (response.status !== 401 || typeof auth.refreshSession !== 'function') return response;
  try {
    await auth.refreshSession();
  } catch {
    return response;
  }
  return send();
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Parse a filename out of a Content-Disposition header, if present.
 */
function filenameFromContentDisposition(header) {
  if (!header) return null;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Claim a file staged by the Web Share Target POST. Single-use server-side:
 * calling this twice for the same id returns a 404 on the second call.
 *
 * @param {string} stagedId
 * @returns {Promise<File>}
 */
export async function fetchStagedShareFile(stagedId) {
  const response = await fetchWithRefresh(() => fetch(`/api/body-comp/share-staged/${encodeURIComponent(stagedId)}`, {
    method: 'GET',
    credentials: 'include',
  }));

  if (response.status === 401) throw httpError(response, null, SIGNED_OUT_MESSAGE);
  if (!response.ok) {
    let code = 'STAGED_UPLOAD_NOT_FOUND';
    try {
      const body = await response.json();
      code = body?.error?.code || code;
    } catch {
      // non-JSON error body — keep the default code
    }
    const error = new Error('Couldn’t open the shared file — it may have expired. Share it again.');
    error.code = code;
    throw error;
  }

  const blob = await response.blob();
  const mimeType = response.headers.get('content-type') || blob.type || 'application/octet-stream';
  const filename = filenameFromContentDisposition(response.headers.get('content-disposition')) || 'shared-scan';
  return new File([blob], filename, { type: mimeType });
}

/**
 * Upload a scan file through the real, authenticated, validated endpoint.
 * Used for both intake paths: the share-target re-post and the plain
 * <input type="file"> fallback.
 *
 * @param {File} file
 * @returns {Promise<{id: string, mimeType: string, size: number, originalName: string|null, storedAt: string}>}
 */
export async function uploadBodyCompFile(file) {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetchWithRefresh(() => fetch('/api/body-comp/uploads', {
    method: 'POST',
    credentials: 'include',
    // Do NOT set Content-Type manually — the browser needs to add the
    // multipart boundary itself.
    headers: { ...csrfHeaders('POST') },
    body: formData,
  }));

  const body = await readJson(response);
  if (!response.ok || !body?.success) throw httpError(response, body, 'Couldn’t upload that file. Try again.');

  return body.data;
}

/**
 * Run AI extraction against a previously stored upload: transcribe the
 * report, check it against the arithmetic gate
 * (DOCS/BODY_COMPOSITION_INTAKE.md §6), and save it server-side if it
 * verifies clean.
 *
 * Every OUTCOME of this — a clean save, a mismatch, a duplicate, an
 * unavailable model — is a 200 carrying `data.status`, matching this app's
 * "no route 500s because a model was busy" convention
 * (see bodyCompExtractController.js). This function only throws for a
 * genuine transport/server failure, never for "the scan didn't verify."
 *
 * @param {string} uploadId
 * @returns {Promise<{status: string, [key: string]: any}>}
 */
export async function extractBodyCompUpload(uploadId) {
  const response = await fetchWithRefresh(() => fetch(`/api/body-comp/uploads/${encodeURIComponent(uploadId)}/extract`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...csrfHeaders('POST') },
  }));

  const body = await readJson(response);
  if (!response.ok || !body?.success) throw httpError(response, body, 'Couldn’t read that scan. Try again.');

  return body.data;
}

/**
 * Run the spreadsheet import path against a previously stored upload — the
 * Arboleaf app's own ".xlsx" history export (DOCS/BODY_COMPOSITION_INTAKE.md).
 * No AI extraction and no confirm screen: every row runs the same arithmetic
 * gate as `.../extract`, using the export's own derived columns as the
 * witness, and the whole file's outcome comes back as one aggregate
 * `{imported, skipped, failed}` rather than a single scan's status.
 *
 * Like `extractBodyCompUpload`, this only throws for a genuine transport/
 * server failure — an unreadable workbook or a gate mismatch on some rows
 * are still a 200 with counts a caller renders, not an exception.
 *
 * @param {string} uploadId
 * @returns {Promise<{status: string, imported: number, skipped: number, failed: number, results: Array}>}
 */
export async function importBodyCompXlsx(uploadId) {
  const response = await fetchWithRefresh(() => fetch(`/api/body-comp/uploads/${encodeURIComponent(uploadId)}/import-xlsx`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...csrfHeaders('POST') },
  }));

  const body = await readJson(response);
  if (!response.ok || !body?.success) throw httpError(response, body, 'Couldn’t import that scan. Try again.');

  return body.data;
}

/**
 * The partial-accept path (DOCS/BODY_COMPOSITION_INTAKE.md §6): called from
 * the confirm screen only when a `.../extract` mismatch came back with
 * `classification.safeToAccept === true` — the printed witness disagreed but
 * every stored number it touches was independently confirmed.
 *
 * This sends back exactly the `candidate`/`printed`/`measuredAt` the
 * `.../extract` call handed to the UI a moment ago. The server does NOT take
 * this call's word for it that the scan is safe — it re-runs the gate and
 * the classifier itself on these numbers (bodyCompExtractController.js's
 * `acceptBodyCompUpload`) and refuses to save if that comes back any other
 * way, so there is nothing this function needs to pre-check.
 *
 * @param {string} uploadId
 * @param {{candidate: object, printed: object, measuredAt: string|null}} payload
 * @returns {Promise<{status: string, [key: string]: any}>}
 */
export async function acceptBodyCompUpload(uploadId, payload) {
  const response = await fetchWithRefresh(() => fetch(`/api/body-comp/uploads/${encodeURIComponent(uploadId)}/accept`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
    body: JSON.stringify(payload),
  }));

  const body = await readJson(response);
  if (!response.ok || !body?.success) throw httpError(response, body, 'Couldn’t save the scan. Try again.');

  return body.data;
}
