/**
 * Pins BURN_REVIEW_2 #7 — `ensureFormat()` never learned about the
 * confinement helper.
 *
 * The going-over added `src/libraryPaths.js` and routed every path-building
 * site in `server.js` through `resolveInLibrary`. It did not reach
 * `src/ebookFormats.js`, which built `path.join(root, relPath)` for the
 * source file and `path.join(root, book.coverPath)` for the `--cover` it
 * hands to the `ebook-convert` spawn. That file is reachable from
 * `GET /download-basket/:slug/item/:index` — secret-word gated, **no auth** —
 * so a `Book.files[].path` of `../secret/private.epub` made `res.download`
 * stream a file from outside `LIBRARY_PATH`. The review verified it by probe;
 * this runs that probe through the real route.
 *
 * `server.js` can't be imported (Mongo connect + listen at import time, see
 * `csrfGuard.test.js`), but `deviceBasket.js`'s router can, and it is the
 * unauthenticated consumer, so it is mounted here the way server.js mounts
 * it. Mongo is stubbed at the three things the route touches — the code under
 * test is the path handling, not mongoose.
 *
 * `ebook-convert` is a Node stub that records its argv and copies input to
 * output: enough to prove what does and does not reach the spawn, with no
 * Calibre on the box.
 */

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";

import { Book } from "../src/models/book.js";
import { DeviceBasket } from "../src/models/deviceBasket.js";

// ebookFormats.js reads CALIBRE_EBOOK_CONVERT_BIN once, at import time, so the
// module under test (and the router that pulls it in) is imported in before(),
// after the stub is on disk and the env points at it.
let ensureFormat;
let EnsureFormatError;

const BOOK_ID = "0123456789abcdef01234567";
const SLUG = "soft-apple-chair-lamp";
const SECRET = "TOP SECRET - outside the library\n";
const LEGIT = "EPUB BYTES INSIDE THE LIBRARY\n";

let tmpRoot;
let libraryDir;
let outsideDir;
let convertLog;
let server;
let baseUrl;
let prevLibraryPath;
let prevConvertBin;

/** Swapped per test; the stubbed model statics hand these back. */
let currentBook = null;
let currentBasket = null;

function makeBook(overrides = {}) {
  return {
    _id: BOOK_ID,
    files: [],
    coverPath: null,
    saved: 0,
    async save() {
      this.saved += 1;
    },
    ...overrides,
  };
}

function makeBasket(items) {
  return {
    slug: SLUG,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    items,
    async save() {},
  };
}

/** One argv array per ebook-convert run the stub recorded. */
function convertRuns() {
  if (!fs.existsSync(convertLog)) return [];
  return fs
    .readFileSync(convertLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

before(async () => {
  prevLibraryPath = process.env.LIBRARY_PATH;
  prevConvertBin = process.env.CALIBRE_EBOOK_CONVERT_BIN;

  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bookgeek-formats-"));
  libraryDir = path.join(tmpRoot, "library");
  outsideDir = path.join(tmpRoot, "secret");
  fs.mkdirSync(path.join(libraryDir, "Author", "Title"), { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
  fs.writeFileSync(path.join(outsideDir, "private.epub"), SECRET);
  fs.writeFileSync(path.join(outsideDir, "cover.jpg"), "NOT A COVER");
  fs.writeFileSync(path.join(libraryDir, "Author", "Title", "legit.epub"), LEGIT);
  fs.writeFileSync(path.join(libraryDir, "Author", "Title", "cover.jpg"), "COVER");
  process.env.LIBRARY_PATH = libraryDir;

  // A stand-in for Calibre: record argv, then produce the file the caller
  // expects. .cjs because this package is ESM and the stub is a script.
  convertLog = path.join(tmpRoot, "convert.log");
  const stub = path.join(tmpRoot, "ebook-convert-stub.cjs");
  fs.writeFileSync(
    stub,
    [
      "#!/usr/bin/env node",
      'const fs = require("fs");',
      "const argv = process.argv.slice(2);",
      'fs.appendFileSync(process.env.CONVERT_LOG, JSON.stringify(argv) + "\\n");',
      "fs.copyFileSync(argv[0], argv[1]);",
      "",
    ].join("\n")
  );
  fs.chmodSync(stub, 0o755);
  process.env.CONVERT_LOG = convertLog;
  process.env.CALIBRE_EBOOK_CONVERT_BIN = stub;

  ({ ensureFormat, EnsureFormatError } = await import("../src/ebookFormats.js"));

  // Import first, override after: mongoose compiles a model against the live
  // connection at import time, and a connection that *claims* to be open with
  // no db behind it throws there.
  const { default: basketRouter } = await import("../src/deviceBasket.js");
  Object.defineProperty(mongoose.connection, "readyState", {
    value: 1,
    configurable: true,
  });
  DeviceBasket.findOne = async () => currentBasket;
  Book.findById = async () => currentBook;

  const app = express();
  app.use(basketRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
  if (prevLibraryPath === undefined) delete process.env.LIBRARY_PATH;
  else process.env.LIBRARY_PATH = prevLibraryPath;
  if (prevConvertBin === undefined) delete process.env.CALIBRE_EBOOK_CONVERT_BIN;
  else process.env.CALIBRE_EBOOK_CONVERT_BIN = prevConvertBin;
  delete process.env.CONVERT_LOG;
});

beforeEach(() => {
  currentBook = null;
  currentBasket = null;
  if (fs.existsSync(convertLog)) fs.rmSync(convertLog);
  // Each conversion test starts from the same library contents.
  for (const stale of ["legit.mobi", "legit.azw3"]) {
    const p = path.join(libraryDir, "Author", "Title", stale);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
});

describe("GET /download-basket/:slug/item/:index — the unauthenticated route", () => {
  test("the review's probe: a stored ../ path is refused, not streamed", async () => {
    // The escape target really is on disk, so a 404 can only mean confinement.
    assert.ok(fs.existsSync(path.join(outsideDir, "private.epub")));

    currentBook = makeBook({
      files: [{ format: "EPUB", path: "../secret/private.epub" }],
    });
    currentBasket = makeBasket([{ bookId: BOOK_ID, format: "epub" }]);

    const res = await fetch(`${baseUrl}/download-basket/${SLUG}/item/0`);
    const body = await res.text();

    assert.equal(res.status, 404);
    assert.ok(
      !body.includes("TOP SECRET"),
      "the file outside the library must never reach the wire"
    );
    assert.equal(currentBook.saved, 0, "and nothing is written back to the DB");
  });

  test("an absolute stored path is refused too", async () => {
    currentBook = makeBook({
      files: [{ format: "EPUB", path: path.join(outsideDir, "private.epub") }],
    });
    currentBasket = makeBasket([{ bookId: BOOK_ID, format: "epub" }]);

    const res = await fetch(`${baseUrl}/download-basket/${SLUG}/item/0`);
    const body = await res.text();
    assert.equal(res.status, 404);
    assert.ok(!body.includes("TOP SECRET"));
  });

  test("a deep traversal buried mid-path is refused", async () => {
    currentBook = makeBook({
      files: [
        { format: "EPUB", path: "Author/Title/../../../secret/private.epub" },
      ],
    });
    currentBasket = makeBasket([{ bookId: BOOK_ID, format: "epub" }]);

    const res = await fetch(`${baseUrl}/download-basket/${SLUG}/item/0`);
    assert.equal(res.status, 404);
    assert.ok(!(await res.text()).includes("TOP SECRET"));
  });

  test("a file that really is inside the library still downloads", async () => {
    currentBook = makeBook({
      files: [{ format: "EPUB", path: "Author/Title/legit.epub" }],
    });
    currentBasket = makeBasket([{ bookId: BOOK_ID, format: "epub" }]);

    const res = await fetch(`${baseUrl}/download-basket/${SLUG}/item/0`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), LEGIT);
  });
});

describe("ensureFormat path confinement", () => {
  test("refuses an escaping source rather than converting from it", async () => {
    const book = makeBook({
      files: [{ format: "EPUB", path: "../secret/private.epub" }],
    });
    await assert.rejects(
      () => ensureFormat(book, "mobi"),
      (err) => {
        assert.ok(err instanceof EnsureFormatError);
        assert.equal(err.status, 404);
        return true;
      }
    );
    assert.deepEqual(convertRuns(), [], "ebook-convert must not be spawned");
    assert.equal(book.saved, 0);
  });

  test("never hands ebook-convert a --cover from outside the library", async () => {
    const book = makeBook({
      files: [{ format: "EPUB", path: "Author/Title/legit.epub" }],
      coverPath: "../secret/cover.jpg",
    });
    const out = await ensureFormat(book, "mobi");

    const runs = convertRuns();
    assert.equal(runs.length, 1);
    assert.ok(
      !runs[0].includes("--cover"),
      `an escaping coverPath must not reach the spawn: ${JSON.stringify(runs[0])}`
    );
    for (const arg of runs[0]) {
      assert.ok(
        !String(arg).includes(outsideDir),
        `no argument may point outside the library: ${arg}`
      );
    }
    // And the artifact it did produce stays inside the root.
    assert.equal(out.entry.path, path.join("Author", "Title", "legit.mobi"));
    assert.ok(out.fullPath.startsWith(libraryDir + path.sep));
  });

  test("passes a cover that is inside the library", async () => {
    const book = makeBook({
      files: [{ format: "EPUB", path: "Author/Title/legit.epub" }],
      coverPath: "Author/Title/cover.jpg",
    });
    await ensureFormat(book, "azw3");

    const runs = convertRuns();
    assert.equal(runs.length, 1);
    assert.ok(runs[0].includes("--cover"));
    assert.ok(
      runs[0].includes(path.join(libraryDir, "Author", "Title", "cover.jpg"))
    );
  });

  test("the converted entry it writes back to the DB is a path inside the root", async () => {
    const book = makeBook({
      files: [{ format: "EPUB", path: "Author/Title/legit.epub" }],
    });
    const out = await ensureFormat(book, "mobi");

    assert.equal(book.saved, 1);
    const stored = book.files.find((f) => f.format === "MOBI");
    assert.ok(stored);
    assert.ok(!stored.path.includes(".."), stored.path);
    assert.ok(!path.isAbsolute(stored.path));
    assert.equal(out.converted, true);
  });

  test("an escaping entry for the requested format is not served even when the file is there", async () => {
    // The requested format's own row escapes and there is no other source:
    // the answer is 404, not "close enough".
    const book = makeBook({
      files: [{ format: "MOBI", path: "../secret/private.epub" }],
    });
    await assert.rejects(() => ensureFormat(book, "mobi"), EnsureFormatError);
    assert.deepEqual(convertRuns(), []);
  });
});
