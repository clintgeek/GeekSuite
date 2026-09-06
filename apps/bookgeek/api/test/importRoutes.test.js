/**
 * Route-level proof for three going-over 2026-09-05 fixes in
 * `src/routes/importRoutes.js`:
 *
 *  1. **P0 — `POST /api/import/calibre` was unauthenticated**, and its very
 *     first act is `Book.deleteMany({ source: "calibre-import" })`. Anyone who
 *     could reach the host could wipe every Calibre-imported book with one
 *     curl.
 *  2. **P0 — `db.query(...)` is Bun:sqlite's API, not better-sqlite3's.**
 *     Twelve call sites, all inside the per-book loop, so `POST
 *     /api/import/calibre/rescan` threw `TypeError: db.query is not a
 *     function` on the first row of every real library. The feature has a
 *     button in Settings and had never worked on Node.
 *  3. **P0 — the rescan's success payload referenced an undeclared `failed`**
 *     (ReferenceError under ESM strict mode → 500) and omitted the `rows` and
 *     `skippedNoFiles` counters `SettingsView.jsx:162` renders.
 *
 * `server.js` can't be imported (Mongo connect + listen at import time, see
 * `csrfGuard.test.js`), but the router can, so it is mounted here the way
 * server.js mounts it. Auth is satisfied by pointing `BASEGEEK_URL` at a
 * local stub rather than by faking the middleware — the gate under test is
 * the real one. The fixture library holds one book whose files are absent
 * from disk: the one path through the loop that reaches every
 * `db.prepare(...)` and still returns without touching Mongo.
 *
 * better-sqlite3 is a native addon whose binding is built for the Node the
 * workspace was installed with. The module imports fine either way — the
 * binding only resolves inside `new Database()` — so on a box whose local
 * Node differs, the two fixture-backed tests skip with a warning instead of
 * failing for a reason unrelated to the code under test. (That gap is
 * exactly how `db.query` survived: nothing local could ever run it.) The
 * auth gates and the two API tripwires never construct a Database and always
 * run.
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { Book } from "../src/models/book.js";

let basegeek;
let server;
let baseUrl;
let libraryDir;
let prevLibraryPath;
let prevBasegeekUrl;
/** Set by the Book.deleteMany stub so a test can prove it never ran. */
let deleteManyCalls = [];
/** False when better-sqlite3's native binding won't load on this Node. */
let sqliteUsable = true;

const TOKEN = "test-token";

function writeCalibreFixture(dir) {
  const db = new Database(path.join(dir, "metadata.db"));
  db.exec(`
    CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, isbn TEXT, pubdate TEXT, path TEXT, series_index REAL);
    CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE books_authors_link (book INTEGER, author INTEGER);
    CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE books_tags_link (book INTEGER, tag INTEGER);
    CREATE TABLE publishers (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE books_publishers_link (book INTEGER, publisher INTEGER);
    CREATE TABLE languages (id INTEGER PRIMARY KEY, lang_code TEXT);
    CREATE TABLE books_languages_link (book INTEGER, lang_code TEXT);
    CREATE TABLE identifiers (id INTEGER PRIMARY KEY, book INTEGER, type TEXT, val TEXT);
    CREATE TABLE data (id INTEGER PRIMARY KEY, book INTEGER, format TEXT, name TEXT, uncompressed_size INTEGER);
    CREATE TABLE comments (id INTEGER PRIMARY KEY, book INTEGER, text TEXT);

    INSERT INTO books VALUES (1, 'Dune', '9780441013593', '1965-08-01', 'Herbert, Frank/Dune (1)', 1.0);
    INSERT INTO authors VALUES (1, 'Frank Herbert');
    INSERT INTO books_authors_link VALUES (1, 1);
    INSERT INTO tags VALUES (1, 'science fiction');
    INSERT INTO books_tags_link VALUES (1, 1);
    INSERT INTO publishers VALUES (1, 'Chilton');
    INSERT INTO books_publishers_link VALUES (1, 1);
    INSERT INTO languages VALUES (1, 'eng');
    INSERT INTO books_languages_link VALUES (1, 'eng');
    INSERT INTO identifiers VALUES (1, 1, 'goodreads', '234225');
    -- A data row whose file is deliberately NOT on disk: the rescan then
    -- counts the book as skippedNoFiles and returns without a Mongo call.
    INSERT INTO data VALUES (1, 1, 'EPUB', 'Dune - Frank Herbert', 123456);
  `);
  db.close();
}

before(async () => {
  prevLibraryPath = process.env.LIBRARY_PATH;
  prevBasegeekUrl = process.env.BASEGEEK_URL;

  libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), "bookgeek-import-"));
  try {
    writeCalibreFixture(libraryDir);
  } catch (err) {
    sqliteUsable = false;
    console.warn(
      `[importRoutes.test] better-sqlite3's binding will not load on ${process.version}; ` +
        "skipping the two fixture-backed rescan tests."
    );
  }
  process.env.LIBRARY_PATH = libraryDir;

  // Stand-in basegeek: the real attachUser() middleware runs against it.
  const bg = express();
  bg.get("/api/users/me", (req, res) => {
    if (req.headers.authorization === `Bearer ${TOKEN}`) {
      return res.json({ user: { id: "user-1", username: "chef" } });
    }
    return res.status(401).json({ message: "nope" });
  });
  basegeek = bg.listen(0, "127.0.0.1");
  await new Promise((r) => basegeek.once("listening", r));
  process.env.BASEGEEK_URL = `http://127.0.0.1:${basegeek.address().port}`;

  const { default: importRouter } = await import("../src/routes/importRoutes.js");

  const app = express();
  app.use(express.json());
  app.use("/api/import", importRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Nothing in this suite should reach Mongo; if a fix regresses and one does,
  // the stub records it rather than hanging on mongoose's buffering timeout.
  Book.deleteMany = async (filter) => {
    deleteManyCalls.push(filter);
    return { deletedCount: 0 };
  };
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (basegeek) await new Promise((r) => basegeek.close(r));
  if (libraryDir) fs.rmSync(libraryDir, { recursive: true, force: true });
  if (prevLibraryPath === undefined) delete process.env.LIBRARY_PATH;
  else process.env.LIBRARY_PATH = prevLibraryPath;
  if (prevBasegeekUrl === undefined) delete process.env.BASEGEEK_URL;
  else process.env.BASEGEEK_URL = prevBasegeekUrl;
});

describe("POST /api/import/calibre — the destructive one-time import", () => {
  test("401s an unauthenticated caller and deletes nothing", async () => {
    deleteManyCalls.length = 0;
    const res = await fetch(`${baseUrl}/api/import/calibre`, { method: "POST" });
    assert.equal(res.status, 401);
    assert.deepEqual(
      deleteManyCalls,
      [],
      "Book.deleteMany must not run for an unauthenticated caller"
    );
  });

  test("401s a caller whose token basegeek rejects, and still deletes nothing", async () => {
    deleteManyCalls.length = 0;
    const res = await fetch(`${baseUrl}/api/import/calibre`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    });
    assert.equal(res.status, 401);
    assert.deepEqual(deleteManyCalls, []);
  });
});

describe("POST /api/import/calibre/rescan", () => {
  test("401s an unauthenticated caller", async () => {
    const res = await fetch(`${baseUrl}/api/import/calibre/rescan`, {
      method: "POST",
    });
    assert.equal(res.status, 401);
  });

  test("walks the real Calibre schema and returns the counters the UI renders", async (t) => {
    if (!sqliteUsable) {
      t.skip("better-sqlite3 binding unavailable on this Node");
      return;
    }
    const res = await fetch(`${baseUrl}/api/import/calibre/rescan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const json = await res.json();

    // Before the fix this was a 500: `db.query is not a function` on row 1,
    // and — once that was fixed — a ReferenceError on the undeclared `failed`.
    assert.equal(res.status, 200, JSON.stringify(json));
    assert.equal(json.success, true);
    assert.deepEqual(json.data, {
      rows: 1,
      attachedExisting: 0,
      createdNew: 0,
      skippedNoFiles: 1,
    });
  });

  test("400s cleanly when there is no metadata.db instead of creating one", async (t) => {
    if (!sqliteUsable) {
      t.skip("better-sqlite3 binding unavailable on this Node");
      return;
    }
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "bookgeek-empty-"));
    const prev = process.env.LIBRARY_PATH;
    process.env.LIBRARY_PATH = empty;
    try {
      const res = await fetch(`${baseUrl}/api/import/calibre/rescan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      assert.equal(res.status, 400);
      assert.equal(
        fs.existsSync(path.join(empty, "metadata.db")),
        false,
        "better-sqlite3 must not create the database it was asked to read"
      );
    } finally {
      process.env.LIBRARY_PATH = prev;
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("the Bun:sqlite API must not creep back", () => {
  test("better-sqlite3 exposes prepare() and no query()", () => {
    // Pure prototype inspection — no native call, so this runs everywhere.
    assert.equal(typeof Database.prototype.prepare, "function");
    assert.equal(
      Database.prototype.query,
      undefined,
      "if better-sqlite3 ever grows query(), re-read this file's header"
    );
  });

  test("importRoutes.js calls no db.query()", () => {
    const src = fs.readFileSync(
      new URL("../src/routes/importRoutes.js", import.meta.url),
      "utf8"
    );
    assert.equal(src.includes("db.query("), false);
  });
});
