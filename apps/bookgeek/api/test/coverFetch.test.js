/**
 * Pins the going-over 2026-09-05 SSRF / unbounded-download fix on
 * `POST /api/books/:id/cover`.
 *
 * Before it, the googlebooks branch did `fetch(req.body.coverUrl)` behind a
 * bare `^https?://` test, with no timeout and no size cap — so any signed-in
 * household member could make the API GET an arbitrary URL from inside the
 * Docker network and buffer the whole answer into memory.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_COVER_BYTES,
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

  test("accepts a subdomain of an allowed suffix", () => {
    assert.ok(isAllowedCoverHost("https://lh3.googleusercontent.com/x.jpg"));
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
});
