/**
 * Recently deleted (S-D5) and the orphan readings (SUITE_REVIEW_2026-11 #4),
 * at the service the routes call (src/services/bookTrash.js).
 *
 * The models are in-memory stand-ins with the same call shapes (hermetic,
 * like the rest of this suite); the query middleware that hides a deleted
 * book is proven against a real Mongo on both mongooses by the gateway's
 * bookgeekSchemaParity.test.js. The files are real, in a temp library.
 */
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  BOOK_TRASH_RETENTION_MS,
  purgeBook,
  purgeExpiredBooks,
  softDeleteBook,
} from "../src/services/bookTrash.js";

let libraryDir;
let prevLibraryPath;

before(() => {
  libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), "bookgeek-trash-"));
  prevLibraryPath = process.env.LIBRARY_PATH;
  process.env.LIBRARY_PATH = libraryDir;
});
after(() => {
  if (prevLibraryPath === undefined) delete process.env.LIBRARY_PATH;
  else process.env.LIBRARY_PATH = prevLibraryPath;
  fs.rmSync(libraryDir, { recursive: true, force: true });
});

/** Just enough of a mongo filter for these calls: equality, null, $ne: null, $lt. */
function matches(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    const v = doc[k];
    if (cond === null) return v === null || v === undefined;
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("$ne" in cond && cond.$ne === null && (v === null || v === undefined)) return false;
      if ("$lt" in cond && !(v instanceof Date && v < cond.$lt)) return false;
      return true;
    }
    return String(v) === String(cond);
  });
}
const lean = (value) => ({ lean: async () => value, limit: () => ({ lean: async () => value }) });

function fakeModels(books, readings) {
  const Book = {
    async updateOne(filter, update) {
      const doc = books.find((b) => matches(b, filter));
      if (!doc) return { matchedCount: 0 };
      Object.assign(doc, update.$set);
      return { matchedCount: 1 };
    },
    async exists(filter) {
      return books.some((b) => matches(b, filter)) ? { _id: 1 } : null;
    },
    findOne(filter) {
      return lean(books.find((b) => matches(b, filter)) ?? null);
    },
    find(filter) {
      return lean(books.filter((b) => matches(b, filter)).map((b) => ({ _id: b._id })));
    },
    async deleteOne(filter) {
      const i = books.findIndex((b) => matches(b, filter));
      if (i >= 0) books.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
  };
  const BookReading = {
    async deleteMany(filter) {
      const before = readings.length;
      for (let i = readings.length - 1; i >= 0; i -= 1) {
        if (String(readings[i].bookId) === String(filter.bookId)) readings.splice(i, 1);
      }
      return { deletedCount: before - readings.length };
    },
  };
  return { Book, BookReading };
}

function writeFile(rel) {
  const full = path.join(libraryDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, "x");
  return full;
}

let books;
let readings;
let models;
beforeEach(() => {
  books = [
    { _id: "b1", title: "Dune", files: [{ format: "epub", path: "Herbert/Dune/dune.epub" }], coverPath: "Herbert/Dune/cover.jpg" },
    { _id: "b2", title: "Kept" },
  ];
  readings = [
    { userId: "alice", bookId: "b1", shelf: "reading" },
    { userId: "bob", bookId: "b1", rating: 4 },
    { userId: "alice", bookId: "b2", shelf: "read" },
  ];
  models = fakeModels(books, readings);
});

describe("softDeleteBook — a delete moves the book to Recently deleted", () => {
  test("marks it, remembers who and whether to delete files, and removes nothing", async () => {
    const epub = writeFile("Herbert/Dune/dune.epub");
    assert.equal(await softDeleteBook("b1", { userId: "bob", deleteFiles: true }, models), "deleted");
    assert.ok(books[0].deletedAt instanceof Date);
    assert.equal(books[0].deletedBy, "bob");
    assert.equal(books[0].deleteFilesOnPurge, true);
    assert.equal(books.length, 2);
    assert.equal(readings.length, 3);
    assert.ok(fs.existsSync(epub), "files stay until the purge");
  });

  test("a second delete answers 'already'; an unknown id 'missing'", async () => {
    await softDeleteBook("b1", {}, models);
    assert.equal(await softDeleteBook("b1", {}, models), "already");
    assert.equal(await softDeleteBook("nope", {}, models), "missing");
  });
});

describe("purgeBook — Delete forever", () => {
  test("removes the row and EVERY reader's readings (finding #4), and the files when asked", async () => {
    const epub = writeFile("Herbert/Dune/dune.epub");
    const cover = writeFile("Herbert/Dune/cover.jpg");
    await softDeleteBook("b1", { deleteFiles: true }, models);

    const result = await purgeBook("b1", models);
    assert.deepEqual(result, { purgedId: "b1", readingsDeleted: 2, filesDeleted: 2, filesFailed: 0 });
    assert.deepEqual(books.map((b) => b._id), ["b2"]);
    assert.deepEqual(readings.map((r) => r.bookId), ["b2"]);
    assert.ok(!fs.existsSync(epub));
    assert.ok(!fs.existsSync(cover));
  });

  test("without 'Also delete files' the files stay in the library", async () => {
    const epub = writeFile("Herbert/Dune/dune.epub");
    await softDeleteBook("b1", { deleteFiles: false }, models);
    const result = await purgeBook("b1", models);
    assert.equal(result.filesDeleted, 0);
    assert.ok(fs.existsSync(epub));
    assert.equal(readings.filter((r) => r.bookId === "b1").length, 0);
  });

  test("never touches a book that is not in the trash", async () => {
    assert.equal(await purgeBook("b2", models), null);
    assert.equal(books.length, 2);
    assert.equal(readings.length, 3);
  });

  test("a stored path outside the library is never unlinked", async () => {
    const outside = path.join(path.dirname(libraryDir), `outside-${ path.basename(libraryDir) }.epub`);
    fs.writeFileSync(outside, "x");
    try {
      books[0].files = [{ format: "epub", path: `../${ path.basename(outside) }` }];
      books[0].coverPath = null;
      await softDeleteBook("b1", { deleteFiles: true }, models);
      await purgeBook("b1", models);
      assert.ok(fs.existsSync(outside));
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });
});

describe("purgeExpiredBooks — 30 days, then gone", () => {
  test("purges only what was deleted over 30 days ago", async () => {
    const now = Date.now();
    books[0].deletedAt = new Date(now - BOOK_TRASH_RETENTION_MS - 1000);
    books[1].deletedAt = new Date(now - BOOK_TRASH_RETENTION_MS + 60_000);
    assert.equal(await purgeExpiredBooks(now, models), 1);
    assert.deepEqual(books.map((b) => b._id), ["b2"]);
    assert.deepEqual(readings.map((r) => r.bookId), ["b2"]);
  });

  test("never throws", async () => {
    const broken = { ...models, Book: { find() { throw new Error("db down"); } } };
    assert.equal(await purgeExpiredBooks(Date.now(), broken), 0);
  });
});
