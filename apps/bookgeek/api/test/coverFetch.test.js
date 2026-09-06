/**
 * Pins the going-over 2026-09-05 SSRF / unbounded-download fix on
 * `POST /api/books/:id/cover`.
 *
 * Before it, the googlebooks branch did `fetch(req.body.coverUrl)` behind a
 * bare `^https?://` test, with no timeout and no size cap — so any signed-in
 * household member could make the API GET an arbitrary URL from inside the
 * Docker network and buffer the whole answer into memory.
 *
 * And BURN_REVIEW_2 #9 on top of it: the allow-list was checked exactly once,
 * on the URL the client supplied, while `redirect: "follow"` let Node chase
 * up to twenty further hops unchecked — so one open redirector on an allowed
 * host reached the same Docker network the allow-list was added to close off.
 * The list itself was loose enough to make that easy: bare `google.com` and
 * bare `googleusercontent.com`, both as *suffixes*. Redirects are manual and
 * capped at three now, every hop is re-validated, and the list is three exact
 * cover hosts.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  COVER_HOSTS,
  MAX_COVER_BYTES,
  MAX_COVER_REDIRECTS,
  fetchImageBuffer,
  isAllowedCoverHost,
} from "../src/coverFetch.js";

describe("isAllowedCoverHost", () => {
  test("accepts the two providers search-covers actually returns", () => {
    assert.ok(
      isAllowedCoverHost("https://covers.openlibrary.org/b/id/240727-L.jpg")
    );
    assert.ok(
      isAllowedCoverHost("https://books.google.com/books/content?id=x&img=1")
    );
    assert.ok(
      isAllowedCoverHost("https://books.googleusercontent.com/books/content?id=x")
    );
  });

  test("is exactly the three hosts the callers actually use", () => {
    // server.js:1813 (OpenLibrary thumb/large), :1842 (Google Books
    // imageLinks.thumbnail), :2406 (downloadOpenLibraryCover) — plus the host
    // a books.google.com content URL redirects to. Nothing else.
    assert.deepEqual([...COVER_HOSTS].sort(), [
      "books.google.com",
      "books.googleusercontent.com",
      "covers.openlibrary.org",
    ]);
  });

  test("refuses the loose entries the going-over left behind", () => {
    // Bare google.com carries well-known open redirectors; the *userscontent*
    // wildcard serves arbitrary user-uploaded bytes. Neither is a cover host.
    assert.ok(!isAllowedCoverHost("https://google.com/url?q=http://127.0.0.1/"));
    assert.ok(!isAllowedCoverHost("https://www.google.com/x.jpg"));
    assert.ok(!isAllowedCoverHost("https://lh3.googleusercontent.com/x.jpg"));
    assert.ok(!isAllowedCoverHost("https://googleusercontent.com/x.jpg"));
  });

  test("refuses the SSRF targets that live on this box", () => {
    assert.ok(!isAllowedCoverHost("http://192.168.1.17:27018/"));
    assert.ok(!isAllowedCoverHost("http://127.0.0.1:1800/api/health"));
    assert.ok(!isAllowedCoverHost("http://datageek_mongodb:27017/"));
    assert.ok(!isAllowedCoverHost("http://169.254.169.254/latest/meta-data/"));
  });

  test("refuses a lookalike host that only ends with the brand", () => {
    assert.ok(!isAllowedCoverHost("https://evil-google.com/x.jpg"));
    assert.ok(!isAllowedCoverHost("https://google.com.evil.test/x.jpg"));
  });

  test("refuses non-http schemes", () => {
    assert.ok(!isAllowedCoverHost("file:///etc/passwd"));
    assert.ok(!isAllowedCoverHost("gopher://google.com/"));
  });

  test("refuses garbage rather than throwing", () => {
    assert.ok(!isAllowedCoverHost("not a url"));
    assert.ok(!isAllowedCoverHost(""));
    assert.ok(!isAllowedCoverHost(null));
  });
});

describe("fetchImageBuffer", () => {
  const okResponse = (bytes, headers = {}) => ({
    ok: true,
    status: 200,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  });

  test("returns the bytes on a normal answer", async () => {
    const buf = await fetchImageBuffer("https://covers.openlibrary.org/x.jpg", {
      fetchImpl: async () => okResponse([1, 2, 3]),
    });
    assert.ok(Buffer.isBuffer(buf));
    assert.equal(buf.length, 3);
  });

  test("returns null on a non-2xx", async () => {
    const buf = await fetchImageBuffer("https://covers.openlibrary.org/x.jpg", {
      fetchImpl: async () => ({ ok: false, headers: { get: () => null } }),
    });
    assert.equal(buf, null);
  });

  test("refuses on a declared content-length over the cap without reading it", async () => {
    let read = false;
    const buf = await fetchImageBuffer("https://covers.openlibrary.org/x.jpg", {
      fetchImpl: async () => ({
        ok: true,
        headers: { get: () => String(MAX_COVER_BYTES + 1) },
        arrayBuffer: async () => {
          read = true;
          return new ArrayBuffer(0);
        },
      }),
    });
    assert.equal(buf, null);
    assert.equal(read, false, "must not buffer a body it already knows is too big");
  });

  test("refuses a body that exceeds the cap despite a lying header", async () => {
    const buf = await fetchImageBuffer("https://covers.openlibrary.org/x.jpg", {
      fetchImpl: async () =>
        okResponse(new Array(MAX_COVER_BYTES + 1).fill(0), {
          "content-length": "10",
        }),
    });
    assert.equal(buf, null);
  });

  test("returns null on an empty body", async () => {
    const buf = await fetchImageBuffer("https://covers.openlibrary.org/x.jpg", {
      fetchImpl: async () => okResponse([]),
    });
    assert.equal(buf, null);
  });

  test("returns null instead of throwing when the fetch rejects", async () => {
    const buf = await fetchImageBuffer("https://covers.openlibrary.org/x.jpg", {
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    assert.equal(buf, null);
  });

  test("passes an abort signal so a hung upstream cannot hold the handler", async () => {
    let sawSignal = false;
    await fetchImageBuffer("https://covers.openlibrary.org/x.jpg", {
      fetchImpl: async (_url, opts) => {
        sawSignal = opts?.signal instanceof AbortSignal;
        return okResponse([1]);
      },
    });
    assert.ok(sawSignal);
  });

  test("refuses a URL off the allow-list without making the request at all", async () => {
    let called = 0;
    const buf = await fetchImageBuffer("http://169.254.169.254/latest/meta-data/", {
      fetchImpl: async () => {
        called += 1;
        return okResponse([1]);
      },
    });
    assert.equal(buf, null);
    assert.equal(called, 0, "the allow-list is checked before the socket opens");
  });
});

describe("fetchImageBuffer redirects (BURN_REVIEW_2 #9)", () => {
  const okResponse = (bytes) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  });

  const redirectTo = (location, status = 302) => ({
    ok: false,
    status,
    headers: {
      get: (k) => (k.toLowerCase() === "location" ? location : null),
    },
    arrayBuffer: async () => {
      throw new Error("a redirect body must never be buffered");
    },
  });

  const START = "https://books.google.com/books/content?id=x&img=1";

  test("asks for manual redirects, not follow", async () => {
    let mode = null;
    await fetchImageBuffer(START, {
      fetchImpl: async (_url, opts) => {
        mode = opts?.redirect;
        return okResponse([1]);
      },
    });
    assert.equal(mode, "manual");
  });

  test("refuses a redirect to a host off the allow-list, and stops there", async () => {
    const seen = [];
    const buf = await fetchImageBuffer(START, {
      fetchImpl: async (url) => {
        seen.push(url);
        return redirectTo("http://169.254.169.254/latest/meta-data/");
      },
    });
    assert.equal(buf, null);
    assert.deepEqual(seen, [START], "the hop must not be taken");
  });

  test("refuses a redirect to an internal host on a plausible-looking path", async () => {
    for (const target of [
      "http://datageek_mongodb:27017/",
      "http://127.0.0.1:1800/api/health",
      "https://evil.test/cover.jpg",
      "file:///etc/passwd",
    ]) {
      const buf = await fetchImageBuffer(START, {
        fetchImpl: async () => redirectTo(target),
      });
      assert.equal(buf, null, `must refuse a redirect to ${target}`);
    }
  });

  test("follows a redirect chain that stays on the allow-list", async () => {
    // The real one: books.google.com/books/content → books.googleusercontent.com.
    const seen = [];
    const buf = await fetchImageBuffer(START, {
      fetchImpl: async (url) => {
        seen.push(url);
        if (url === START) {
          return redirectTo("https://books.googleusercontent.com/books/content?id=x");
        }
        return okResponse([1, 2, 3, 4]);
      },
    });
    assert.ok(Buffer.isBuffer(buf));
    assert.equal(buf.length, 4);
    assert.deepEqual(seen, [
      START,
      "https://books.googleusercontent.com/books/content?id=x",
    ]);
  });

  test("resolves a relative Location against the URL it came from", async () => {
    let last = null;
    const buf = await fetchImageBuffer(START, {
      fetchImpl: async (url) => {
        last = url;
        if (url === START) return redirectTo("/books/content?id=y");
        return okResponse([9]);
      },
    });
    assert.equal(buf?.length, 1);
    assert.equal(last, "https://books.google.com/books/content?id=y");
  });

  test("allows exactly MAX_COVER_REDIRECTS hops", async () => {
    let hops = 0;
    const buf = await fetchImageBuffer(START, {
      fetchImpl: async () => {
        hops += 1;
        if (hops <= MAX_COVER_REDIRECTS) {
          return redirectTo(`https://books.google.com/hop/${hops}`);
        }
        return okResponse([7]);
      },
    });
    assert.equal(buf?.length, 1);
    assert.equal(hops, MAX_COVER_REDIRECTS + 1);
  });

  test("refuses a chain longer than MAX_COVER_REDIRECTS, allow-listed or not", async () => {
    let hops = 0;
    const buf = await fetchImageBuffer(START, {
      fetchImpl: async () => {
        hops += 1;
        return redirectTo(`https://books.google.com/hop/${hops}`);
      },
    });
    assert.equal(buf, null);
    assert.equal(
      hops,
      MAX_COVER_REDIRECTS + 1,
      "one initial request plus MAX_COVER_REDIRECTS hops, then stop"
    );
  });

  test("refuses a redirect that carries no Location", async () => {
    const buf = await fetchImageBuffer(START, {
      fetchImpl: async () => ({
        ok: false,
        status: 302,
        headers: { get: () => null },
      }),
    });
    assert.equal(buf, null);
  });

  test("treats every redirect status as a hop, 301 through 308", async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      let hops = 0;
      const buf = await fetchImageBuffer(START, {
        fetchImpl: async () => {
          hops += 1;
          if (hops === 1) return redirectTo("https://evil.test/x.jpg", status);
          return okResponse([1]);
        },
      });
      assert.equal(buf, null, `status ${status} must be re-validated`);
      assert.equal(hops, 1);
    }
  });
});
