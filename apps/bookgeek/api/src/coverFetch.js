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
 *
 * And one the going-over itself introduced, found by BURN_REVIEW_2 #9:
 *
 * 4. **A leash on the redirects.** The allow-list was checked once, on the URL
 *    the client supplied, and `redirect: "follow"` then let Node chase up to
 *    twenty hops with nobody looking — so an open redirector on an allowed
 *    host was a door back into the Docker network, and the bytes on the far
 *    side of it got written into the library and served back by
 *    `GET /api/books/:id/cover`. Redirects are manual now, capped at three,
 *    and every hop is re-validated.
 */

export const OUTBOUND_TIMEOUT_MS = 15000;
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

/** How many `Location:` hops a cover fetch may follow before giving up. */
export const MAX_COVER_REDIRECTS = 3;

/**
 * The only hosts `search-covers` ever hands back, so the only hosts a
 * "download this cover" call has any business reaching. Exact hosts, not
 * suffixes:
 *
 *  - `covers.openlibrary.org` — `server.js:1813` builds every OpenLibrary
 *    candidate's `thumbUrl`/`largeUrl`, and `downloadOpenLibraryCover()`
 *    (`server.js:2406`) fetches from it directly.
 *  - `books.google.com` — the host of the Google Books `imageLinks.thumbnail`
 *    the `googlebooks` branch is handed (`server.js:1842`).
 *  - `books.googleusercontent.com` — where a `books.google.com/books/content`
 *    request redirects to. It is on the list because the redirect chain has
 *    to be able to land somewhere, not because a caller supplies it.
 *
 * Deliberately *not* on it any more: bare `google.com` and bare
 * `googleusercontent.com`, both of which the going-over left here. `google.com`
 * carries well-known open redirectors, and the suffix form let anything under
 * it through — which, once `redirect: "follow"` had done its work, was a route
 * to `169.254.169.254` or any RFC1918 service on this box. `lh3.googleusercontent.com`
 * and friends serve arbitrary user-uploaded bytes and are not cover hosts.
 *
 * No Goodreads image CDN appears here: nothing in this API fetches one. The
 * Goodreads import is a CSV of metadata (`routes/importRoutes.js`), and the
 * only two cover providers `POST /api/books/:id/cover` accepts are
 * `openlibrary` and `googlebooks`. If a Goodreads/Amazon cover host is ever
 * added as a provider, it gets added here in the same commit.
 */
export const COVER_HOSTS = [
  "books.google.com",
  "books.googleusercontent.com",
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
  return COVER_HOSTS.includes(host);
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
    let current = String(url ?? "");
    if (!isAllowedCoverHost(current)) {
      console.warn("cover image download refused: host not allowed", {
        host: hostOf(current),
      });
      return null;
    }

    // `redirect: "manual"` because "follow" checked the allow-list exactly
    // once — on the URL the client supplied — and then let Node chase up to
    // twenty hops to anywhere. Every hop is re-validated here, scheme and
    // host, and the chain is capped.
    for (let hop = 0; hop <= MAX_COVER_REDIRECTS; hop += 1) {
      const res = await fetchImpl(current, {
        signal: controller.signal,
        redirect: "manual",
      });

      if (!isRedirectStatus(res?.status)) {
        if (!res.ok) return null;

        const declared = Number(res.headers.get("content-length"));
        if (Number.isFinite(declared) && declared > MAX_COVER_BYTES) return null;

        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength === 0) return null;
        if (arrayBuffer.byteLength > MAX_COVER_BYTES) return null;
        return Buffer.from(arrayBuffer);
      }

      if (hop === MAX_COVER_REDIRECTS) {
        console.warn("cover image download refused: too many redirects", {
          host: hostOf(current),
          max: MAX_COVER_REDIRECTS,
        });
        return null;
      }

      const location = res.headers.get("location");
      if (!location) return null;

      let next;
      try {
        next = new URL(String(location), current).toString();
      } catch {
        return null;
      }
      if (!isAllowedCoverHost(next)) {
        console.warn("cover image download refused: redirect off the allow-list", {
          from: hostOf(current),
          to: hostOf(next),
        });
        return null;
      }
      current = next;
    }

    return null;
  } catch (err) {
    console.warn("cover image download failed", {
      error: err?.message || String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Hostname for a log line, or "" when the value will not parse. */
function hostOf(rawUrl) {
  try {
    return new URL(String(rawUrl)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** The five statuses that carry a `Location:` worth following. */
function isRedirectStatus(status) {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

export default {
  COVER_HOSTS,
  MAX_COVER_BYTES,
  MAX_COVER_REDIRECTS,
  OUTBOUND_TIMEOUT_MS,
  fetchImageBuffer,
  isAllowedCoverHost,
};
