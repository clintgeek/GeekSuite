/**
 * The comics folder (2026-11-16): Tankarr's library, indexed in place
 * (src/services/comicsFolder.js, src/comicsPaths.js, src/services/tankarrApi.js)
 * and everything that must leave that folder alone (the purge, covers, the
 * converter).
 *
 * The fixture is a temp library with a `_tankarr` folder laid out the way
 * Tankarr really writes it. The Book model is an in-memory stand-in that
 * hides a deleted row exactly as the shared schema's `hideDeletedBooks` does
 * (it asks the schema's own `mentionsDeletedAt`), so a lookup that forgets
 * `includingDeleted` fails here the way it would against Mongo. The Tankarr
 * API is a stubbed fetch; nothing here touches the network.
 */
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import bookSchemaModule from "../../../../packages/schemas/bookgeek/book.js";
import { resolveInLibrary } from "../src/libraryPaths.js";
import { comicsConfig, isComicsPath, mayUnlinkBookFile } from "../src/comicsPaths.js";
import {
  comicsFolderStatus,
  describeComicFile,
  parseSeriesFolder,
  parseVolumeFile,
  runComicsScan,
  scanComicsFolder,
  scanMinutes,
  startComicsScanSchedule,
} from "../src/services/comicsFolder.js";
import { cleanSeries, indexSeries, normalizeTitle, tagForContentKind } from "../src/services/tankarrApi.js";
import { purgeBook, purgeExpiredBooks, BOOK_TRASH_RETENTION_MS } from "../src/services/bookTrash.js";
import { resolveCoverRelativePathForBook } from "../src/services/coverFiles.js";

const { mentionsDeletedAt } = bookSchemaModule;

let tmpRoot;
let libraryDir;
let comicsDir;
let ensureFormat;
let EnsureFormatError;
const saved = {};
const ENV_KEYS = ["LIBRARY_PATH", "COMICS_PATH", "COMICS_TAG", "TANKARR_URL", "TANKARR_API_KEY", "CALIBRE_EBOOK_CONVERT_BIN"];

const OLD = Date.now() - 60 * 60 * 1000;

/** Write a file into the comics fixture, an hour old unless told otherwise. */
function comic(rel, { content = "PAGES", mtime = OLD } = {}) {
  const full = path.join(comicsDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  fs.utimesSync(full, new Date(mtime), new Date(mtime));
  return full;
}

const BANANA = "Banana Fish (Akimi Yoshida)";
const NOTE = "DEATH NOTE (Tsugumi Ooba, Takeshi Obata)";
const HIKARU = "The Summer Hikaru Died (Mokmok Len)";

function layout() {
  fs.rmSync(libraryDir, { recursive: true, force: true });
  fs.mkdirSync(comicsDir, { recursive: true });
  comic(".tankarr-library-id", { content: "id" });
  fs.mkdirSync(path.join(comicsDir, ".zzz_check"));
  comic(`${BANANA}/Banana Fish - v019 [en].cbz`);
  comic(`${BANANA}/Banana Fish - v019 [en].jpg`, { content: "JPG" });
  comic(`${BANANA}/cover.jpg`, { content: "JPG" });
  comic(`${NOTE}/DEATH NOTE - v002 [en].cbz`);
  comic(`${NOTE}/cover.jpg`, { content: "JPG" });
  comic(`${HIKARU}/The Summer Hikaru Died - v004 [en].cbz`);
  comic(`${HIKARU}/cover.jpg`, { content: "JPG" });
}

/** Every path under the comics folder with its size and mtime: proof nothing there was touched. */
function snapshot(dir = comicsDir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(`${full}/`, ...snapshot(full));
    else {
      const s = fs.statSync(full);
      out.push(`${full}|${s.size}|${s.mtimeMs}`);
    }
  }
  return out.sort();
}

/** An in-memory Book that hides deleted rows the way the shared schema's hook does. */
function fakeBook(rows = []) {
  const calls = { find: 0, create: 0, updateOne: 0 };
  let seq = 0;
  const visible = (filter) => (mentionsDeletedAt(filter) ? rows : rows.filter((r) => !r.deletedAt));
  const idOf = (filter) => filter._id ?? filter.$and?.[0]?._id;
  const Book = {
    rows,
    calls,
    find(filter) {
      calls.find += 1;
      const hit = visible(filter).filter(
        (r) => r.source === "tankarr" || (r.files || []).some((f) => String(f.path).startsWith("_tankarr/")),
      );
      return { lean: async () => structuredClone(hit) };
    },
    async create(doc) {
      calls.create += 1;
      seq += 1;
      const row = structuredClone({ _id: `new-${seq}`, ...doc });
      rows.push(row);
      return row;
    },
    async updateOne(filter, update) {
      calls.updateOne += 1;
      const row = visible(filter).find((r) => String(r._id) === String(idOf(filter)));
      if (!row) return { matchedCount: 0 };
      Object.assign(row, structuredClone(update.$set || {}));
      for (const key of Object.keys(update.$unset || {})) delete row[key];
      return { matchedCount: 1 };
    },
  };
  return Book;
}

const scan = (Book, extra = {}) => scanComicsFolder({ models: { Book }, ...extra });
const byTitle = (Book, title) => Book.rows.filter((r) => r.title === title);

before(async () => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bookgeek-comics-"));
  libraryDir = path.join(tmpRoot, "library");
  comicsDir = path.join(libraryDir, "_tankarr");
  // A converter that "works": without the guard under test it would write
  // the converted copy straight into Tankarr's folder.
  const stub = path.join(tmpRoot, "convert.sh");
  fs.writeFileSync(stub, '#!/bin/sh\ncp "$1" "$2"\n');
  fs.chmodSync(stub, 0o755);
  process.env.CALIBRE_EBOOK_CONVERT_BIN = stub;
  process.env.LIBRARY_PATH = libraryDir;
  ({ ensureFormat, EnsureFormatError } = await import("../src/ebookFormats.js"));
});

after(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.LIBRARY_PATH = libraryDir;
  process.env.COMICS_PATH = comicsDir;
  delete process.env.COMICS_TAG;
  delete process.env.TANKARR_URL;
  delete process.env.TANKARR_API_KEY;
  layout();
});

describe("names → facts (no file is opened)", () => {
  test("a series folder gives the name and its authors", () => {
    assert.deepEqual(parseSeriesFolder(NOTE), { name: "DEATH NOTE", authors: ["Tsugumi Ooba", "Takeshi Obata"] });
    assert.deepEqual(parseSeriesFolder(BANANA), { name: "Banana Fish", authors: ["Akimi Yoshida"] });
  });

  test("no parentheses, no authors; only the LAST group is the authors", () => {
    assert.deepEqual(parseSeriesFolder("One Piece"), { name: "One Piece", authors: [] });
    assert.deepEqual(parseSeriesFolder("Akira (Deluxe) (Katsuhiro Otomo)"), {
      name: "Akira (Deluxe)",
      authors: ["Katsuhiro Otomo"],
    });
  });

  test("a volume file gives the volume, the language and the format", () => {
    assert.deepEqual(parseVolumeFile("Banana Fish - v019 [en].cbz"), {
      format: "cbz",
      base: "Banana Fish - v019 [en]",
      title: "Banana Fish",
      volume: 19,
      language: "en",
    });
    assert.equal(parseVolumeFile("Monster - Vol. 3.epub").volume, 3);
    assert.equal(parseVolumeFile("Monster - Volume 12 [pt-BR].PDF").language, "pt-br");
    assert.equal(parseVolumeFile("Monster - v07.5 [en].cb7").volume, 7.5);
  });

  test("no volume number: the base name is the title and there is no index", () => {
    const parsed = parseVolumeFile("Chainsaw Man - c101 [en].cbz");
    assert.equal(parsed.volume, null);
    assert.equal(parsed.title, "Chainsaw Man - c101 [en]");
    assert.equal(parsed.language, "en");
    // A year is not a volume just because it is a number.
    assert.equal(parseVolumeFile("Akira 1988.cbr").volume, null);
  });

  test("dotfiles, images and unknown extensions are not comic files", () => {
    for (const name of [".tankarr-library-id", "cover.jpg", "Banana Fish - v019 [en].jpg", "notes.txt", "vol.zip", "x.cbz.part", ""]) {
      assert.equal(parseVolumeFile(name), null, name);
    }
    for (const ext of ["cbz", "cbr", "cb7", "cbt", "pdf", "epub"]) {
      assert.equal(parseVolumeFile(`A - v001.${ext}`).format, ext);
    }
  });

  test("a volume's title is the series name, so the card does not say the volume twice", () => {
    const facts = describeComicFile(NOTE, "DEATH NOTE - v002 [en].cbz");
    assert.equal(facts.title, "DEATH NOTE");
    assert.equal(facts.seriesName, "DEATH NOTE");
    assert.equal(facts.volume, 2);
    assert.doesNotMatch(facts.title, /2/);
  });

  test("COMICS_SCAN_MINUTES: default 15, 0 turns the timer off, junk falls back", () => {
    assert.equal(scanMinutes({}), 15);
    assert.equal(scanMinutes({ COMICS_SCAN_MINUTES: "0" }), 0);
    assert.equal(scanMinutes({ COMICS_SCAN_MINUTES: "5" }), 5);
    assert.equal(scanMinutes({ COMICS_SCAN_MINUTES: "soon" }), 15);
  });
});

describe("the first scan", () => {
  test("each volume becomes one owned Manga book pointing at Tankarr's file", async () => {
    const Book = fakeBook();
    const before = snapshot();
    const result = await scan(Book);

    assert.equal(result.enabled, true);
    assert.equal(result.added, 3);
    assert.equal(result.updated, 0);
    assert.equal(result.missing, 0);
    assert.equal(Book.rows.length, 3);

    const [note] = byTitle(Book, "DEATH NOTE");
    assert.deepEqual(note.authors, ["Tsugumi Ooba", "Takeshi Obata"]);
    assert.deepEqual(note.series, { name: "DEATH NOTE", index: 2 });
    assert.equal(note.language, "en");
    assert.equal(note.owned, true);
    assert.equal(note.source, "tankarr");
    assert.deepEqual(note.tags, ["Manga"]);
    // Derived the way every tag write is (tags.js): the web's comicKind reads these.
    assert.deepEqual([...note.libraryTags, ...note.unsortedTags], ["Manga"]);
    assert.ok(note.dateAdded instanceof Date);
    assert.equal(note.files.length, 1);
    assert.equal(note.files[0].format, "CBZ");
    assert.equal(note.files[0].size, 5);
    assert.equal(note.files[0].path, path.join("_tankarr", NOTE, "DEATH NOTE - v002 [en].cbz"));

    assert.deepEqual(snapshot(), before, "nothing in the comics folder was touched");
  });

  test("the stored path resolves through resolveInLibrary to the real file", async () => {
    const Book = fakeBook();
    await scan(Book);
    for (const row of Book.rows) {
      const full = resolveInLibrary(row.files[0].path);
      assert.ok(full, `${row.files[0].path} is inside the library`);
      assert.equal(fs.readFileSync(full, "utf8"), "PAGES");
    }
  });

  test("the cover is the volume's own jpg when there is one, else the folder's cover.jpg", async () => {
    const Book = fakeBook();
    await scan(Book);
    assert.equal(byTitle(Book, "Banana Fish")[0].coverPath, path.join("_tankarr", BANANA, "Banana Fish - v019 [en].jpg"));
    assert.equal(byTitle(Book, "The Summer Hikaru Died")[0].coverPath, path.join("_tankarr", HIKARU, "cover.jpg"));
    for (const row of Book.rows) assert.ok(fs.existsSync(resolveInLibrary(row.coverPath)));
  });

  test("junk makes no rows: unknown files are counted, a no-volume file is indexed by its name", async () => {
    comic(`${NOTE}/readme.txt`);
    comic(`${NOTE}/DEATH NOTE - v003 [en].cbz.part`);
    comic(`${NOTE}/DEATH NOTE - c108 [en].cbz`);
    const Book = fakeBook();
    const result = await scan(Book);

    assert.equal(result.added, 4);
    assert.equal(result.skippedUnsupported, 2);
    assert.equal(result.skipped, 2);
    const [chapter] = byTitle(Book, "DEATH NOTE - c108 [en]");
    assert.deepEqual(chapter.series, { name: "DEATH NOTE" });
    assert.equal(chapter.series.index, undefined);
    assert.equal(Book.rows.some((r) => /readme|part|tankarr-library|zzz/.test(r.title)), false);
  });

  test("COMICS_TAG names the tag", async () => {
    process.env.COMICS_TAG = "Comics";
    const Book = fakeBook();
    await scan(Book);
    assert.deepEqual(Book.rows[0].tags, ["Comics"]);
  });

  test("a file modified in the last two minutes is left for the next scan", async () => {
    const now = Date.now();
    comic(`${NOTE}/DEATH NOTE - v003 [en].cbz`, { mtime: now - 30 * 1000 });
    const Book = fakeBook();
    const first = await scan(Book, { now });
    assert.equal(first.added, 3);
    assert.equal(first.skippedRecent, 1);
    const later = await scan(Book, { now: now + 5 * 60 * 1000 });
    assert.equal(later.added, 1);
    assert.equal(byTitle(Book, "DEATH NOTE").length, 2);
  });
});

describe("scanning again", () => {
  test("a second scan changes nothing and writes nothing", async () => {
    const Book = fakeBook();
    await scan(Book);
    const rowsBefore = structuredClone(Book.rows);
    const writes = Book.calls.create + Book.calls.updateOne;

    const again = await scan(Book);
    assert.deepEqual(
      { added: again.added, updated: again.updated, unchanged: again.unchanged, missing: again.missing },
      { added: 0, updated: 0, unchanged: 3, missing: 0 },
    );
    assert.equal(Book.calls.create + Book.calls.updateOne, writes);
    assert.deepEqual(Book.rows, rowsBefore);
  });

  test("Tankarr renames or upgrades a file: the same book, pointed at the new file", async () => {
    const Book = fakeBook();
    await scan(Book);
    const [banana] = byTitle(Book, "Banana Fish");
    const id = banana._id;
    banana.description = "typed by a person";

    fs.rmSync(path.join(comicsDir, BANANA, "Banana Fish - v019 [en].cbz"));
    comic(`${BANANA}/Banana Fish - v019 (Digital) [en].epub`, { content: "BETTER PAGES" });

    const result = await scan(Book);
    assert.equal(result.added, 0);
    assert.equal(result.updated, 1);
    assert.equal(Book.rows.length, 3, "no second book for the same volume");
    const [after] = byTitle(Book, "Banana Fish");
    assert.equal(after._id, id);
    assert.equal(after.description, "typed by a person");
    assert.deepEqual(
      after.files.map((f) => [f.format, f.path]),
      [["EPUB", path.join("_tankarr", BANANA, "Banana Fish - v019 (Digital) [en].epub")]],
    );
  });

  test("a file upgraded in place under the same name: the size follows", async () => {
    const Book = fakeBook();
    await scan(Book);
    comic(`${NOTE}/DEATH NOTE - v002 [en].cbz`, { content: "MANY MORE PAGES" });
    const result = await scan(Book);
    assert.equal(result.updated, 1);
    assert.equal(byTitle(Book, "DEATH NOTE")[0].files[0].size, 15);
  });

  test("a file that vanished: the book stays (readers' history hangs off it), the dead entry goes", async () => {
    const Book = fakeBook();
    await scan(Book);
    const id = byTitle(Book, "DEATH NOTE")[0]._id;
    fs.rmSync(path.join(comicsDir, NOTE, "DEATH NOTE - v002 [en].cbz"));

    const result = await scan(Book);
    assert.equal(result.missing, 1);
    assert.equal(result.added, 0);
    assert.equal(Book.rows.length, 3);
    const [note] = byTitle(Book, "DEATH NOTE");
    assert.equal(note._id, id);
    assert.deepEqual(note.files, []);
    assert.equal(note.owned, false);

    // And when Tankarr brings the volume back, it is the same book again.
    comic(`${NOTE}/DEATH NOTE - v002 [en].cbz`);
    const back = await scan(Book);
    assert.equal(back.added, 0);
    assert.equal(byTitle(Book, "DEATH NOTE")[0]._id, id);
    assert.equal(byTitle(Book, "DEATH NOTE")[0].owned, true);
  });

  test("an empty comics folder (an unmounted disk) strips nothing", async () => {
    const Book = fakeBook();
    await scan(Book);
    for (const dir of [BANANA, NOTE, HIKARU]) fs.rmSync(path.join(comicsDir, dir), { recursive: true });

    const result = await scan(Book);
    assert.equal(result.missing, 0);
    assert.equal(result.missingHeld, 3);
    for (const row of Book.rows) assert.equal(row.files.length, 1);
  });

  test("a volume in Recently deleted is not created again", async () => {
    const Book = fakeBook();
    await scan(Book);
    byTitle(Book, "Banana Fish")[0].deletedAt = new Date();

    const result = await scan(Book);
    assert.equal(result.added, 0);
    assert.equal(Book.rows.length, 3);
    assert.equal(byTitle(Book, "Banana Fish").length, 1);
  });

  test("a trashed volume whose file Tankarr removed loses the entry while still in the trash", async () => {
    const Book = fakeBook();
    await scan(Book);
    byTitle(Book, "Banana Fish")[0].deletedAt = new Date();
    fs.rmSync(path.join(comicsDir, BANANA, "Banana Fish - v019 [en].cbz"));
    await scan(Book);
    assert.deepEqual(byTitle(Book, "Banana Fish")[0].files, []);
    assert.ok(byTitle(Book, "Banana Fish")[0].deletedAt);
  });

  test("a cover a person chose in BookGeek is never replaced", async () => {
    const Book = fakeBook();
    await scan(Book);
    byTitle(Book, "Banana Fish")[0].coverPath = "covers/abc-upload-1.jpg";
    const result = await scan(Book);
    assert.equal(result.updated, 0);
    assert.equal(byTitle(Book, "Banana Fish")[0].coverPath, "covers/abc-upload-1.jpg");
  });

  test("a scan never overlaps itself: a second caller joins the one running", async () => {
    const Book = fakeBook();
    const a = runComicsScan({ models: { Book } });
    const b = runComicsScan({ models: { Book } });
    assert.equal(a, b);
    await a;
    assert.equal(Book.calls.find, 1);
    assert.equal(Book.rows.length, 3);
  });

  test("the schedule: one boot scan, a timer every COMICS_SCAN_MINUTES, none at 0", () => {
    const made = [];
    const timers = {
      setTimeout: (fn, ms) => made.push(["timeout", ms]) && { unref() {} },
      setInterval: (fn, ms) => made.push(["interval", ms]) && { unref() {} },
      clearTimeout() {},
      clearInterval() {},
    };
    startComicsScanSchedule({ models: {}, env: { COMICS_SCAN_MINUTES: "15" }, timers, bootDelayMs: 20000 });
    assert.deepEqual(made, [["timeout", 20000], ["interval", 15 * 60 * 1000]]);
    made.length = 0;
    startComicsScanSchedule({ models: {}, env: { COMICS_SCAN_MINUTES: "0" }, timers, bootDelayMs: 20000 });
    assert.deepEqual(made, [["timeout", 20000]]);
  });
});

describe("the feature is off, quietly", () => {
  const neverCalled = () => {
    const Book = fakeBook();
    return Book;
  };

  test("COMICS_PATH unset", async () => {
    delete process.env.COMICS_PATH;
    const Book = neverCalled();
    assert.deepEqual(await scan(Book), { enabled: false, reason: "unset" });
    assert.deepEqual(Book.calls, { find: 0, create: 0, updateOne: 0 });
    assert.equal((await comicsFolderStatus()).enabled, false);
    assert.equal(isComicsPath("_tankarr/a/b.cbz"), false);
  });

  test("the folder is missing", async () => {
    process.env.COMICS_PATH = path.join(libraryDir, "_not_mounted");
    const Book = neverCalled();
    assert.deepEqual(await scan(Book), { enabled: false, reason: "missing" });
    assert.deepEqual(await comicsFolderStatus(), { enabled: false, reason: "missing" });
    // A plain file where the folder should be is not a folder either.
    fs.writeFileSync(path.join(libraryDir, "_a_file"), "x");
    process.env.COMICS_PATH = path.join(libraryDir, "_a_file");
    assert.deepEqual(await comicsFolderStatus(), { enabled: false, reason: "missing" });
    assert.deepEqual(Book.calls, { find: 0, create: 0, updateOne: 0 });
  });

  test("the folder is outside the library root: off, because no file route could serve it", async () => {
    const outside = path.join(tmpRoot, "elsewhere");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "A - v001.cbz"), "x");
    process.env.COMICS_PATH = outside;
    const Book = neverCalled();
    assert.deepEqual(await scan(Book), { enabled: false, reason: "outside-library" });
    assert.equal(Book.rows.length, 0);
    assert.equal(comicsConfig().configured, false);
    process.env.COMICS_PATH = libraryDir; // the root itself is not "under" it either
    assert.equal(comicsConfig().configured, false);
  });
});

/* ------------------------------------------------------------- the trash -- */

function trashModels(books, readings = []) {
  const match = (doc, filter) =>
    Object.entries(filter).every(([k, cond]) => {
      const v = doc[k];
      if (cond && typeof cond === "object" && !(cond instanceof Date)) {
        if ("$ne" in cond && cond.$ne === null && (v === null || v === undefined)) return false;
        if ("$lt" in cond && !(v instanceof Date && v < cond.$lt)) return false;
        return true;
      }
      return String(v) === String(cond);
    });
  const lean = (value) => ({ lean: async () => value, limit: () => ({ lean: async () => value }) });
  return {
    Book: {
      findOne: (filter) => lean(books.find((b) => match(b, filter)) ?? null),
      find: (filter) => lean(books.filter((b) => match(b, filter)).map((b) => ({ _id: b._id }))),
      async deleteOne(filter) {
        const i = books.findIndex((b) => match(b, filter));
        if (i >= 0) books.splice(i, 1);
        return { deletedCount: i >= 0 ? 1 : 0 };
      },
    },
    BookReading: {
      async deleteMany(filter) {
        const before = readings.length;
        for (let i = readings.length - 1; i >= 0; i -= 1) {
          if (String(readings[i].bookId) === String(filter.bookId)) readings.splice(i, 1);
        }
        return { deletedCount: before - readings.length };
      },
    },
  };
}

describe("the purge leaves Tankarr's folder alone", () => {
  const cbzRel = path.join("_tankarr", BANANA, "Banana Fish - v019 [en].cbz");
  const jpgRel = path.join("_tankarr", BANANA, "Banana Fish - v019 [en].jpg");
  const trashed = (extra = {}) => ({
    _id: "t1",
    title: "Banana Fish",
    source: "tankarr",
    deletedAt: new Date(Date.now() - BOOK_TRASH_RETENTION_MS - 1000),
    deleteFilesOnPurge: true,
    files: [{ format: "CBZ", path: cbzRel }],
    coverPath: jpgRel,
    ...extra,
  });

  test("Delete forever on a Tankarr volume whose file exists: held, nothing removed", async () => {
    const books = [trashed()];
    const readings = [{ userId: "alice", bookId: "t1", rating: 5 }];
    const before = snapshot();
    const result = await purgeBook("t1", trashModels(books, readings));

    assert.deepEqual(result, { held: true, heldId: "t1" });
    assert.equal(books.length, 1, "the row stays hidden in the trash, or the next scan would resurrect it");
    assert.equal(readings.length, 1);
    assert.deepEqual(snapshot(), before);
  });

  test("the 30-day sweep skips it too, and does not count it as purged", async () => {
    const books = [trashed(), { _id: "b2", title: "Ordinary", deletedAt: new Date(Date.now() - BOOK_TRASH_RETENTION_MS - 1000) }];
    const purged = await purgeExpiredBooks(Date.now(), trashModels(books));
    assert.equal(purged, 1);
    assert.deepEqual(books.map((b) => b._id), ["t1"]);
  });

  test("once the file is gone the row is purged — and Tankarr's cover image is still not unlinked", async () => {
    fs.rmSync(path.join(libraryDir, cbzRel));
    const own = path.join(libraryDir, "uploads", "t1", "extra.epub");
    fs.mkdirSync(path.dirname(own), { recursive: true });
    fs.writeFileSync(own, "x");
    const books = [trashed({ files: [{ format: "CBZ", path: cbzRel }, { format: "EPUB", path: "uploads/t1/extra.epub" }] })];

    const result = await purgeBook("t1", trashModels(books));
    assert.equal(result.purgedId, "t1");
    assert.equal(books.length, 0);
    assert.ok(fs.existsSync(path.join(libraryDir, jpgRel)), "the cover in the comics folder is Tankarr's");
    assert.equal(fs.existsSync(own), false, "a file BookGeek itself stored is still deleted when asked");
    assert.equal(result.filesDeleted, 1);
  });

  test("no book of any source can unlink a file under COMICS_PATH", async () => {
    const books = [{ _id: "c1", title: "Odd", source: "manual", deletedAt: new Date(), deleteFilesOnPurge: true, files: [{ path: cbzRel }], coverPath: jpgRel }];
    const before = snapshot();
    const result = await purgeBook("c1", trashModels(books));
    assert.equal(result.purgedId, "c1");
    assert.equal(result.filesDeleted, 0);
    assert.deepEqual(snapshot(), before);
  });

  test("the folder configured but unreadable (unmounted): a Tankarr volume is held, not purged", async () => {
    process.env.COMICS_PATH = path.join(libraryDir, "_not_mounted");
    const books = [trashed({ files: [{ format: "CBZ", path: "_not_mounted/A/A - v001.cbz" }] })];
    assert.deepEqual(await purgeBook("t1", trashModels(books)), { held: true, heldId: "t1" });
    assert.equal(books.length, 1);
  });

  test("with the feature switched off a Tankarr volume's files are still never unlinked", () => {
    delete process.env.COMICS_PATH;
    assert.equal(mayUnlinkBookFile({ source: "tankarr" }, cbzRel), false);
    assert.equal(mayUnlinkBookFile({ source: "manual" }, "Herbert/Dune/dune.epub"), true);
    assert.equal(mayUnlinkBookFile({ source: "manual" }, "covers/tankarr-abc.jpg"), false);
  });
});

describe("nothing is written beside a file in the comics folder", () => {
  test("a cover chosen for a Tankarr volume goes to covers/, not into Tankarr's folder", () => {
    const book = { _id: "t1", files: [{ path: path.join("_tankarr", BANANA, "Banana Fish - v019 [en].cbz") }] };
    assert.equal(resolveCoverRelativePathForBook(book, "t1-upload-1.jpg"), path.join("covers", "t1-upload-1.jpg"));
    // An ordinary book keeps its cover beside its file, as before.
    assert.equal(
      resolveCoverRelativePathForBook({ files: [{ path: "Herbert/Dune/dune.epub" }] }, "c.jpg"),
      path.join("Herbert", "Dune", "c.jpg"),
    );
  });

  test("an EPUB in the comics folder is not converted: 409, and no file appears there", async () => {
    comic(`${BANANA}/Banana Fish - v020 [en].epub`);
    const before = snapshot();
    const book = {
      _id: "0123456789abcdef01234567",
      files: [{ format: "EPUB", path: path.join("_tankarr", BANANA, "Banana Fish - v020 [en].epub") }],
      coverPath: null,
      async save() {},
    };
    await assert.rejects(
      () => ensureFormat(book, "mobi"),
      (err) => err instanceof EnsureFormatError && err.status === 409 && /comics folder/.test(err.message),
    );
    assert.deepEqual(snapshot(), before);
    // The stored file itself is still handed over as it is.
    const asIs = await ensureFormat(book, "epub");
    assert.equal(asIs.converted, false);
  });
});

/* ------------------------------------------------------- Tankarr's API -- */

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);

const apiSeries = (over = {}) => ({
  id: "ea14ce4d-3053-43f2-9051-0c41fd5a34d0",
  title: "Death Note!",
  authors: ["Tsugumi Ohba", "Takeshi Obata"],
  description: "A notebook falls from the sky.",
  year: 2003,
  status: "ended",
  original_language: "ja",
  metadata: { content_kind: "manga" },
  library_count: { total_count: 12 },
  artwork_url: "/api/metadata/artwork/ea14ce4d/series?v=abc",
  source_url: "https://example.invalid/1",
  ...over,
});

/** A fetch that answers `/api/manga` with `list` and the artwork route with a JPEG; records every URL. */
function stubFetch(list, { artwork = JPEG } = {}) {
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(String(url));
    assert.equal(init.method, "GET");
    if (String(url).endsWith("/api/manga")) {
      if (list instanceof Error) throw list;
      return { ok: true, status: 200, text: async () => (typeof list === "string" ? list : JSON.stringify(list)) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => artwork };
  };
  fetchImpl.urls = urls;
  return fetchImpl;
}

describe("Tankarr's API adds what a filename cannot say", () => {
  beforeEach(() => {
    process.env.TANKARR_URL = "http://tankarr.test:8787";
  });

  test("titles match whatever the case or punctuation", () => {
    assert.equal(normalizeTitle("DEATH NOTE"), normalizeTitle("Death Note!"));
    assert.equal(normalizeTitle("Pokémon: Adventures"), "pokemonadventures");
    assert.notEqual(normalizeTitle("Monster"), normalizeTitle("Monsters"));
  });

  test("a matched series gives authors, description, year and tag; one list request per scan", async () => {
    const fetchImpl = stubFetch([apiSeries(), apiSeries({ id: "x", title: "Unrelated", description: "no" })]);
    const Book = fakeBook();
    const result = await scan(Book, { fetchImpl });

    assert.equal(result.tankarrApi, "used");
    const [note] = byTitle(Book, "DEATH NOTE");
    assert.deepEqual(note.authors, ["Tsugumi Ohba", "Takeshi Obata"]);
    assert.equal(note.description, "A notebook falls from the sky.");
    assert.equal(note.publishedDate.toISOString(), "2003-01-01T00:00:00.000Z");
    assert.deepEqual(note.tags, ["Manga"]);
    // Unmatched folders are exactly as the filename-only scan makes them.
    assert.deepEqual(byTitle(Book, "Banana Fish")[0].authors, ["Akimi Yoshida"]);
    assert.equal(byTitle(Book, "Banana Fish")[0].description, undefined);
    // The files and the title still come from the folder, never the API.
    assert.equal(note.title, "DEATH NOTE");
    assert.equal(note.files[0].path, path.join("_tankarr", NOTE, "DEATH NOTE - v002 [en].cbz"));
    assert.deepEqual(fetchImpl.urls, ["http://tankarr.test:8787/api/manga"]);

    const again = await scan(Book, { fetchImpl });
    assert.equal(again.updated, 0, "enrichment is idempotent");
  });

  test("the kind names the tag: manga → Manga, a comic kind → Comics, unknown → COMICS_TAG", async () => {
    assert.equal(tagForContentKind("manga"), "Manga");
    assert.equal(tagForContentKind("Comic"), "Comics");
    assert.equal(tagForContentKind("graphic_novel"), "Comics");
    assert.equal(tagForContentKind("light_novel"), null);
    assert.equal(tagForContentKind(7), null);

    const fetchImpl = stubFetch([
      apiSeries({ metadata: { content_kind: "comic" } }),
      apiSeries({ id: "b", title: "Banana Fish", metadata: { content_kind: "something-new" } }),
    ]);
    const Book = fakeBook();
    await scan(Book, { fetchImpl });
    const [note] = byTitle(Book, "DEATH NOTE");
    assert.deepEqual(note.tags, ["Comics"]);
    assert.deepEqual(note.libraryTags, ["Graphic Novel"]);
    assert.deepEqual(byTitle(Book, "Banana Fish")[0].tags, ["Manga"]);
  });

  test("Tankarr down: the scan finishes and the result is the filename-only one, exactly", async () => {
    delete process.env.TANKARR_URL;
    const plain = fakeBook();
    const plainResult = await scan(plain);

    process.env.TANKARR_URL = "http://tankarr.test:8787";
    const warned = [];
    const logger = { warn: (obj, msg) => warned.push(msg), info() {}, debug() {} };
    for (const failure of [new Error("ECONNREFUSED"), new DOMException("timed out", "TimeoutError")]) {
      const down = fakeBook();
      warned.length = 0;
      // eslint-disable-next-line no-await-in-loop
      const result = await scan(down, { fetchImpl: stubFetch(failure), logger });
      assert.equal(result.tankarrApi, "unavailable");
      assert.deepEqual({ ...result, tankarrApi: null }, { ...plainResult, tankarrApi: null });
      assert.deepEqual(down.rows, plain.rows);
      assert.equal(warned.filter((m) => /Tankarr API unavailable/.test(m)).length, 1, "logged once per scan");
    }
  });

  test("a malformed answer is ignored, whole or in part", async () => {
    delete process.env.TANKARR_URL;
    const plain = fakeBook();
    await scan(plain);
    process.env.TANKARR_URL = "http://tankarr.test:8787";

    for (const payload of ["<html>502</html>", { items: [apiSeries()] }, "null", [null, 7, "x", { title: 42 }, { title: "" }]]) {
      const Book = fakeBook();
      // eslint-disable-next-line no-await-in-loop
      await scan(Book, { fetchImpl: stubFetch(payload) });
      assert.deepEqual(Book.rows, plain.rows, JSON.stringify(payload).slice(0, 40));
    }

    // A usable title with rubbish around it: each bad field is dropped alone.
    const Book = fakeBook();
    await scan(Book, {
      fetchImpl: stubFetch([
        apiSeries({ authors: "Ohba", description: { html: "<b>x</b>" }, year: "2003", metadata: "manga", artwork_url: 9 }),
      ]),
    });
    const [note] = byTitle(Book, "DEATH NOTE");
    assert.deepEqual(note.authors, ["Tsugumi Ooba", "Takeshi Obata"]);
    assert.equal(note.description, undefined);
    assert.equal(note.publishedDate, undefined);
    assert.deepEqual(note.tags, ["Manga"]);
  });

  test("strings are capped and two series with one title match neither", () => {
    const index = indexSeries([
      apiSeries({ title: "Solo", description: "d".repeat(9000), authors: Array.from({ length: 40 }, (_, i) => `A${i}`) }),
      apiSeries({ id: "1", title: "Twin" }),
      apiSeries({ id: "2", title: "TWIN" }),
    ]);
    assert.equal(index.get("solo").description.length, 5000);
    assert.equal(index.get("solo").authors.length, 10);
    assert.equal(index.has("twin"), false);
    assert.equal(indexSeries({ not: "a list" }), null);
    // One bad field costs that field, not the series.
    const odd = cleanSeries(apiSeries({ authors: "Ohba", year: 2003.5, description: 7 }));
    assert.deepEqual([odd.title, odd.authors, odd.year, odd.description], ["Death Note!", [], null, ""]);
    assert.equal(cleanSeries(["Death Note"]), null);
  });

  test("on a later scan: blanks are filled and the scan's own values bettered — a person's edits stay", async () => {
    delete process.env.TANKARR_URL;
    const Book = fakeBook();
    await scan(Book); // filename-only rows, as they were before the API was switched on
    process.env.TANKARR_URL = "http://tankarr.test:8787";

    const [note] = byTitle(Book, "DEATH NOTE");
    const fetchImpl = stubFetch([apiSeries(), apiSeries({ id: "b", title: "Banana Fish", authors: ["Akimi Yoshida (API)"], description: "From Tankarr", year: 1985, metadata: { content_kind: "comic" } })]);

    // A person edited Banana Fish: authors, description, the date and the tags.
    const [banana] = byTitle(Book, "Banana Fish");
    const edited = { authors: ["Yoshida Akimi"], description: "My own note", publishedDate: new Date("1986-05-01"), tags: ["Manga", "Favourites"] };
    Object.assign(banana, structuredClone(edited));

    const result = await scan(Book, { fetchImpl });
    assert.equal(result.updated, 1, "only the untouched row changes");

    // DEATH NOTE was untouched: its folder-made authors are bettered, its blanks filled.
    assert.deepEqual(note.authors, ["Tsugumi Ohba", "Takeshi Obata"]);
    assert.equal(note.description, "A notebook falls from the sky.");
    assert.equal(note.publishedDate.toISOString(), "2003-01-01T00:00:00.000Z");

    assert.deepEqual(
      { authors: banana.authors, description: banana.description, publishedDate: banana.publishedDate, tags: banana.tags },
      edited,
    );
  });

  test("the scan's own default tag follows the kind once Tankarr says what it is", async () => {
    delete process.env.TANKARR_URL;
    const Book = fakeBook();
    await scan(Book);
    process.env.TANKARR_URL = "http://tankarr.test:8787";
    await scan(Book, { fetchImpl: stubFetch([apiSeries({ metadata: { content_kind: "comic" } })]) });
    const [note] = byTitle(Book, "DEATH NOTE");
    assert.deepEqual(note.tags, ["Comics"]);
    assert.deepEqual(note.libraryTags, ["Graphic Novel"]);
    assert.deepEqual(note.unsortedTags, []);
  });

  test("artwork: a local image wins; Tankarr's is fetched only for a folder with none", async () => {
    fs.rmSync(path.join(comicsDir, NOTE, "cover.jpg"));
    comic(`${NOTE}/DEATH NOTE - v003 [en].cbz`);
    const fetchImpl = stubFetch([apiSeries(), apiSeries({ id: "b", title: "Banana Fish" })]);
    const Book = fakeBook();
    const before = snapshot();
    await scan(Book, { fetchImpl });

    // One list request, one artwork request for the one series lacking an image — not one per volume.
    assert.deepEqual(fetchImpl.urls, [
      "http://tankarr.test:8787/api/manga",
      "http://tankarr.test:8787/api/metadata/artwork/ea14ce4d/series?v=abc",
    ]);
    const notes = byTitle(Book, "DEATH NOTE");
    assert.equal(notes.length, 2);
    assert.match(notes[0].coverPath, /^covers\/tankarr-[0-9a-f]{20}\.jpg$/);
    assert.equal(notes[1].coverPath, notes[0].coverPath);
    assert.deepEqual(fs.readFileSync(resolveInLibrary(notes[0].coverPath)), JPEG);
    assert.match(byTitle(Book, "Banana Fish")[0].coverPath, /^_tankarr\//);
    assert.deepEqual(snapshot(), before, "the artwork is saved in covers/, never in Tankarr's folder");

    // Next scan: the saved file is reused, no second download.
    fetchImpl.urls.length = 0;
    await scan(Book, { fetchImpl });
    assert.deepEqual(fetchImpl.urls, ["http://tankarr.test:8787/api/manga"]);
  });

  test("an artwork URL that is not Tankarr's own artwork route is never fetched; bytes that are not an image are not saved", async () => {
    fs.rmSync(path.join(comicsDir, NOTE, "cover.jpg"));
    for (const artwork_url of ["http://evil.test/x.jpg", "//evil.test/x.jpg", "/api/metadata/artwork/../../../etc/passwd", "/api/manga/1/delete"]) {
      const fetchImpl = stubFetch([apiSeries({ artwork_url })]);
      const Book = fakeBook();
      // eslint-disable-next-line no-await-in-loop
      await scan(Book, { fetchImpl });
      assert.deepEqual(fetchImpl.urls, ["http://tankarr.test:8787/api/manga"], artwork_url);
      assert.equal(byTitle(Book, "DEATH NOTE")[0].coverPath, undefined);
    }
    const fetchImpl = stubFetch([apiSeries()], { artwork: Buffer.from("<html>not an image at all</html>") });
    const Book = fakeBook();
    await scan(Book, { fetchImpl });
    assert.equal(byTitle(Book, "DEATH NOTE")[0].coverPath, undefined);
    assert.equal(fs.existsSync(path.join(libraryDir, "covers")) && fs.readdirSync(path.join(libraryDir, "covers")).length > 0, false);
  });

  test("TANKARR_API_KEY, when set, rides in X-Api-Key and nowhere else", async () => {
    process.env.TANKARR_API_KEY = "k-test";
    let seen;
    const fetchImpl = async (url, init) => {
      seen = { url: String(url), headers: init.headers };
      return { ok: true, status: 200, text: async () => "[]" };
    };
    await scan(fakeBook(), { fetchImpl });
    assert.equal(seen.headers["X-Api-Key"], "k-test");
    assert.doesNotMatch(seen.url, /k-test/);
  });
});
