/**
 * Comics and manga (2026-11-15).
 *
 * A comic archive (CBZ, CBR, CB7, CBT) or a PDF is pages of images: BookGeek
 * hands back the file that was uploaded, and must never ask Calibre to make
 * one. Before this, GET /api/books/:id/download/cbz was a 400 at the schema,
 * so a manga volume could be attached to a book and never taken back out.
 *
 * `ebook-convert` is the same recording stub ebookFormats.test.js uses, so
 * "no conversion" is checked by what did and did not reach the spawn.
 */

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  AS_IS_FORMATS,
  COMIC_FORMATS,
  CONVERTIBLE_FORMATS,
  DOWNLOAD_FORMATS,
  isAsIsFormat,
  isComicFormat,
} from "../src/formats.js";
import { downloadParamsSchema } from "../src/validation/schemas/kindle.js";

let ensureFormat;
let EnsureFormatError;
let tmpRoot;
let libraryDir;
let convertLog;
let prevLibraryPath;
let prevConvertBin;

const PAGES = "CBZ BYTES: forty pages of somebody's hard work\n";

function makeBook(files) {
  return {
    _id: "0123456789abcdef01234567",
    files,
    coverPath: null,
    saved: 0,
    async save() {
      this.saved += 1;
    },
  };
}

const convertRuns = () =>
  fs.existsSync(convertLog)
    ? fs.readFileSync(convertLog, "utf8").split("\n").filter(Boolean)
    : [];

before(async () => {
  prevLibraryPath = process.env.LIBRARY_PATH;
  prevConvertBin = process.env.CALIBRE_EBOOK_CONVERT_BIN;

  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bookgeek-comics-"));
  libraryDir = path.join(tmpRoot, "library");
  fs.mkdirSync(path.join(libraryDir, "uploads", "b1"), { recursive: true });
  fs.writeFileSync(path.join(libraryDir, "uploads", "b1", "vol-01.cbz"), PAGES);
  fs.writeFileSync(path.join(libraryDir, "uploads", "b1", "novel.epub"), "EPUB\n");
  process.env.LIBRARY_PATH = libraryDir;

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
});

after(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
  if (prevLibraryPath === undefined) delete process.env.LIBRARY_PATH;
  else process.env.LIBRARY_PATH = prevLibraryPath;
  if (prevConvertBin === undefined) delete process.env.CALIBRE_EBOOK_CONVERT_BIN;
  else process.env.CALIBRE_EBOOK_CONVERT_BIN = prevConvertBin;
  delete process.env.CONVERT_LOG;
});

beforeEach(() => {
  if (fs.existsSync(convertLog)) fs.rmSync(convertLog);
});

describe("the format lists", () => {
  test("the common comic archives are all downloadable", () => {
    for (const format of ["cbz", "cbr", "cb7", "cbt"]) {
      assert.ok(COMIC_FORMATS.includes(format), `${format} is a comic format`);
      assert.ok(DOWNLOAD_FORMATS.includes(format), `${format} can be downloaded`);
      assert.equal(isComicFormat(format.toUpperCase()), true);
    }
  });

  test("PDF is served as stored but is not a comic", () => {
    assert.equal(isAsIsFormat("PDF"), true);
    assert.equal(isComicFormat("pdf"), false);
  });

  test("no format is both converted to and served as-is", () => {
    for (const format of AS_IS_FORMATS) {
      assert.equal(CONVERTIBLE_FORMATS.includes(format), false, format);
    }
  });

  test("the download route's schema accepts every one of them, any case", () => {
    for (const format of DOWNLOAD_FORMATS) {
      const result = downloadParamsSchema.safeParse({ id: "abc", format: format.toUpperCase() });
      assert.equal(result.success, true, `expected ${format} to pass`);
      assert.equal(result.data.format, format);
    }
  });
});

describe("ensureFormat with a comic", () => {
  test("hands back the stored CBZ, byte for byte, without converting", async () => {
    const book = makeBook([{ format: "CBZ", path: "uploads/b1/vol-01.cbz" }]);
    const result = await ensureFormat(book, "cbz");

    assert.equal(result.converted, false);
    assert.equal(result.filename, "vol-01.cbz");
    assert.equal(fs.readFileSync(result.fullPath, "utf8"), PAGES);
    assert.deepEqual(convertRuns(), []);
    assert.equal(book.saved, 0);
  });

  test("never makes a CBZ out of an ebook: 404, nothing spawned, nothing written", async () => {
    const book = makeBook([{ format: "EPUB", path: "uploads/b1/novel.epub" }]);

    await assert.rejects(
      () => ensureFormat(book, "cbz"),
      (err) => err instanceof EnsureFormatError && err.status === 404
    );
    assert.deepEqual(convertRuns(), []);
    assert.equal(book.saved, 0);
    assert.equal(fs.existsSync(path.join(libraryDir, "uploads", "b1", "novel.cbz")), false);
  });

  test("the same holds for PDF and the other archives", async () => {
    const book = makeBook([{ format: "EPUB", path: "uploads/b1/novel.epub" }]);
    for (const format of ["pdf", "cbr", "cb7", "cbt"]) {
      await assert.rejects(
        () => ensureFormat(book, format),
        (err) => err instanceof EnsureFormatError && err.status === 404,
        format
      );
    }
    assert.deepEqual(convertRuns(), []);
  });

  test("a stored comic path that escapes the library is still refused", async () => {
    fs.writeFileSync(path.join(tmpRoot, "outside.cbz"), "NOT YOURS\n");
    const book = makeBook([{ format: "CBZ", path: "../outside.cbz" }]);
    await assert.rejects(
      () => ensureFormat(book, "cbz"),
      (err) => err instanceof EnsureFormatError && err.status === 404
    );
  });

  test("an ebook format is still converted on demand", async () => {
    const book = makeBook([{ format: "EPUB", path: "uploads/b1/novel.epub" }]);
    const result = await ensureFormat(book, "mobi");
    assert.equal(result.converted, true);
    assert.equal(convertRuns().length, 1);
    fs.rmSync(result.fullPath);
  });
});
