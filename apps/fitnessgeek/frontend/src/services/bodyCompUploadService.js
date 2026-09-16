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

import { csrfHeaders } from '@geeksuite/auth';

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
  const response = await fetch(`/api/body-comp/share-staged/${encodeURIComponent(stagedId)}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    let code = 'STAGED_UPLOAD_NOT_FOUND';
    try {
      const body = await response.json();
      code = body?.error?.code || code;
    } catch {
      // non-JSON error body — keep the default code
    }
    const error = new Error('The shared file could not be retrieved — it may have expired.');
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

  const response = await fetch('/api/body-comp/uploads', {
    method: 'POST',
    credentials: 'include',
    // Do NOT set Content-Type manually — the browser needs to add the
    // multipart boundary itself.
    headers: { ...csrfHeaders('POST') },
    body: formData,
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    // fall through to the generic error below
  }

  if (!response.ok || !body?.success) {
    const error = new Error(body?.error?.message || 'Upload failed.');
    error.code = body?.error?.code || `HTTP_${response.status}`;
    throw error;
  }

  return body.data;
}
