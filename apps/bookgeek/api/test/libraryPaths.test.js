/**
 * Pins the going-over 2026-09-05 path-containment fix.
 *
 * Every file route in this API builds an absolute path by joining a relative
 * half onto LIBRARY_PATH, and at least one of those relative halves was
 * caller-controlled: `POST /api/books/:id/cover`'s `coverId` reached
 * `downloadOpenLibraryCover()` and went straight into the output filename,
 * so `coverId: "../../../../tmp/x"` walked the write out of the library root
 * once path.join normalised it. `resolveInLibrary()` is the check that join
 * never had; `safePathSegment()` is the belt to its braces.
 *
 * server.js can't be imported (it connects to Mongo and listens at import
 * time — see csrfGuard.test.js's header), so this exercises the helper
 * module the routes now call, plus the two regexes that reject a coverId
 * before it ever gets that far.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  escapeRegex,
  libraryRoot,
  resolveInLibrary,
  safePathSegment,
} from "../src/libraryPaths.js";

const ROOT = "/data/library";

describe("resolveInLibrary", () => {
  test("resolves an ordinary relative path under the root", () => {
    assert.equal(
      resolveInLibrary("Author/Title/book.epub", ROOT),
      path.join(ROOT, "Author/Title/book.epub")
    );
  });

  test("resolves a nested cover path under the root", () => {
    assert.equal(
      resolveInLibrary("covers/abc-ol-12345.jpg", ROOT),
      path.join(ROOT, "covers/abc-ol-12345.jpg")
    );
  });

  test("refuses a path that walks out of the root with ..", () => {
    assert.equal(resolveInLibrary("../../etc/passwd", ROOT), null);
  });

  test("refuses the exact shape a hostile coverId produced", () => {
    // `covers/<bookId>-ol-<coverId>.jpg` with coverId = "../../../../tmp/pwn"
    const rel = path.join(
      "covers",
      "65f0abc-ol-../../../../tmp/pwn.jpg"
    );
    assert.equal(resolveInLibrary(rel, ROOT), null);
  });

  test("refuses an absolute path outside the root", () => {
    assert.equal(resolveInLibrary("/etc/shadow", ROOT), null);
  });

  test("refuses the root itself (a directory is never a file to serve)", () => {
    assert.equal(resolveInLibrary(".", ROOT), null);
    assert.equal(resolveInLibrary("", ROOT), null);
  });

  test("refuses a sibling directory that merely shares the root's prefix", () => {
    assert.equal(resolveInLibrary("../library-backup/x.epub", ROOT), null);
  });

  test("refuses null/undefined rather than resolving to the root", () => {
    assert.equal(resolveInLibrary(null, ROOT), null);
    assert.equal(resolveInLibrary(undefined, ROOT), null);
  });

  test("allows a .. that stays inside the root", () => {
    assert.equal(
      resolveInLibrary("a/b/../c.epub", ROOT),
      path.join(ROOT, "a/c.epub")
    );
  });

  test("defaults its root to LIBRARY_PATH", () => {
    const prev = process.env.LIBRARY_PATH;
    process.env.LIBRARY_PATH = "/tmp/bookgeek-test-library";
    try {
      assert.equal(libraryRoot(), "/tmp/bookgeek-test-library");
      assert.equal(
        resolveInLibrary("x.epub"),
        "/tmp/bookgeek-test-library/x.epub"
      );
    } finally {
      if (prev === undefined) delete process.env.LIBRARY_PATH;
      else process.env.LIBRARY_PATH = prev;
    }
  });
});

describe("safePathSegment", () => {
  test("passes an ordinary id through unchanged", () => {
    assert.equal(safePathSegment("65f0abc12def"), "65f0abc12def");
  });

  test("strips separators so a segment cannot become a path", () => {
    const out = safePathSegment("../../etc/passwd");
    assert.equal(out, "_.._etc_passwd");
    assert.ok(!out.includes("/"));
    assert.ok(!out.includes("\\"));
    // The whole point: joined into a filename it stays one segment.
    assert.equal(path.dirname(path.join("covers", `x-ol-${out}.jpg`)), "covers");
  });

  test("strips leading dots so a segment cannot be `..`", () => {
    assert.equal(safePathSegment("..", "cover"), "cover");
    assert.equal(safePathSegment("...."), "file");
  });

  test("bounds the length", () => {
    assert.equal(safePathSegment("a".repeat(500)).length, 128);
  });

  test("falls back when nothing survives", () => {
    assert.equal(safePathSegment("///", "cover"), "___");
    assert.equal(safePathSegment("", "cover"), "cover");
    assert.equal(safePathSegment(null, "cover"), "cover");
  });
});

describe("escapeRegex", () => {
  test("neutralises a catastrophic-backtracking search term", () => {
    const escaped = escapeRegex("(a+)+$");
    assert.equal(escaped, "\\(a\\+\\)\\+\\$");
    // The escaped form matches the literal text and nothing else.
    assert.ok(new RegExp(escaped).test("(a+)+$"));
    assert.ok(!new RegExp(escaped).test("aaaaaaaaaaaaaaaaaaaaaaaa"));
  });

  test("leaves an ordinary title alone", () => {
    assert.equal(escapeRegex("Dune"), "Dune");
  });
});

describe("the OpenLibrary coverId gate", () => {
  // Mirrors downloadOpenLibraryCover()'s own guard in server.js: only the
  // digits OpenLibrary actually issues reach the network or the filesystem.
  const isOpenLibraryCoverId = (v) => /^[0-9]{1,20}$/.test(String(v).trim());

  test("accepts a real OpenLibrary cover id", () => {
    assert.ok(isOpenLibraryCoverId(240727));
    assert.ok(isOpenLibraryCoverId("240727"));
  });

  test("refuses a traversal payload", () => {
    assert.ok(!isOpenLibraryCoverId("../../../../tmp/pwn"));
    assert.ok(!isOpenLibraryCoverId("12345/../../x"));
    assert.ok(!isOpenLibraryCoverId("12345.jpg"));
  });
});
