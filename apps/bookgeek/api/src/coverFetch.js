/**
 * Outbound cover fetching — the one place this API reaches the public
 * internet for image bytes, and therefore the one place that needs a leash.
 *
 * Three things were missing before the 2026-09-05 going-over:
 *
 * 1. **A host allow-list.** `POST /api/books/:id/cover` with
 *    `provider: "googlebooks"` took an arbitrary `coverUrl` and fetched it
 *    server-side after nothing more than an `^https?://` test — a
 *    server-side request forgery lever into the Docker network (Mongo on
 *    27017, Redis, the other apps' unauthenticated internal ports) for any
 *    authenticated household member.
 * 2. **A timeout.** Node's `fetch` has no overall deadline, so a hung
 *    upstream held an Express handler and its socket open indefinitely.
 * 3. **A size cap.** `arrayBuffer()` buffers whatever the far end sends,
 *    with no ceiling, straight into the process's heap.
 */

export const OUTBOUND_TIMEOUT_MS = 15000;
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

/**
 * The only hosts `search-covers` ever hands back, so the only hosts a
 * "download this cover" call has any business reaching.
 */
export const COVER_HOST_SUFFIXES = [
  "books.google.com",
  "books.googleusercontent.com",
  "googleusercontent.com",
  "google.com",
  "covers.openlibrary.org",
];

export function isAllowedCoverHost(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return COVER_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

/**
 * Fetch an image with a deadline and a hard size cap. Returns a Buffer, or
 * null when the upstream failed, answered empty, or was too large. Never
 * throws — the callers all treat null as "no cover".
 */
export async function fetchImageBuffer(url, { fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OUTBOUND_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;

    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_COVER_BYTES) return null;

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;
    if (arrayBuffer.byteLength > MAX_COVER_BYTES) return null;
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.warn("cover image download failed", {
      error: err?.message || String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default {
  COVER_HOST_SUFFIXES,
  MAX_COVER_BYTES,
  OUTBOUND_TIMEOUT_MS,
  fetchImageBuffer,
  isAllowedCoverHost,
};
