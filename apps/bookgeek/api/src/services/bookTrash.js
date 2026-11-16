/**
 * Recently deleted, for books (SUITE_REVIEW_2026-11 S-D5, 2026-11-15).
 *
 * A delete — the gateway's `deleteBook` or `DELETE /api/books/:id` here —
 * sets `deletedAt` and leaves everything else where it is: the row, every
 * reader's `BookReading` (shelf, rating, review, progress) and the files.
 * The shared schema's `hideDeletedBooks` keeps the book out of every ordinary
 * read meanwhile. Restore is the gateway's `restoreBook`.
 *
 * The PURGE lives here, not in the gateway, because only this process can
 * reach the library folder. It removes the row and every reader's readings
 * (SUITE_REVIEW_2026-11 #4: the old REST delete left them as orphans), and
 * the book's files and cover when the delete asked for that
 * (`deleteFilesOnPurge`, the dialog's "Also delete files"). Without that
 * flag the files stay in the library, as a delete always left them.
 *
 * When: lazily, like NoteGeek's notes — on every delete through this API,
 * and when the web app opens Recently deleted (`POST
 * /api/books/trash/purge-expired`) — so there is no job to keep alive.
 * "Delete forever" purges one book at once.
 */
import fs from "fs";
import { Book } from "../models/book.js";
import { BookReading } from "../models/bookReading.js";
import { resolveInLibrary } from "../libraryPaths.js";
import { comicsConfig, mayUnlinkBookFile, TANKARR_SOURCE } from "../comicsPaths.js";
import { logger } from "../utils/logger.js";

/** Must match the gateway's BOOK_TRASH_RETENTION_MS (graphql/bookgeek/resolvers.js). */
export const BOOK_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const IN_TRASH = Object.freeze({ $ne: null });

/**
 * Move a book to Recently deleted. Resolves to "deleted" (it is in the trash
 * now), "already" (it was), or "missing".
 */
export async function softDeleteBook(bookId, { userId = "", deleteFiles = false } = {}, models = { Book }) {
  const res = await models.Book.updateOne(
    { _id: bookId, deletedAt: null },
    { $set: { deletedAt: new Date(), deletedBy: String(userId || ""), deleteFilesOnPurge: deleteFiles === true } },
    { timestamps: false },
  );
  if (res.matchedCount > 0) return "deleted";
  const inTrash = await models.Book.exists({ _id: bookId, deletedAt: IN_TRASH });
  return inTrash ? "already" : "missing";
}

/**
 * Unlink a book's files and cover, confined to the library. Counts what happened.
 *
 * Never a file in the comics folder (Tankarr owns it — comicsPaths.js), nor
 * the series artwork the comics scan shares between volumes: those are left
 * out before anything is stat'd, whatever `deleteFilesOnPurge` says.
 */
export async function unlinkBookFiles(book) {
  const candidatePaths = [];
  let filesKept = 0;
  const consider = (relPath) => {
    if (!mayUnlinkBookFile(book, relPath)) {
      filesKept += 1;
      return;
    }
    const full = resolveInLibrary(relPath);
    if (full) candidatePaths.push(full);
  };
  for (const f of Array.isArray(book.files) ? book.files : []) {
    if (f && f.path) consider(f.path);
  }
  if (book.coverPath) consider(book.coverPath);
  if (filesKept) {
    logger.info({ bookId: String(book._id), filesKept }, "[bookgeek] purge: files in the comics folder are Tankarr's; left alone");
  }

  let filesDeleted = 0;
  let filesFailed = 0;
  for (const fullPath of candidatePaths) {
    try {
      // lstat: a symlink is unlinked, never followed to its target.
      const stat = await fs.promises.lstat(fullPath);
      if (!stat.isFile() && !stat.isSymbolicLink()) continue;
      await fs.promises.unlink(fullPath);
      filesDeleted += 1;
    } catch (err) {
      if (err.code !== "ENOENT") {
        logger.warn({ bookId: String(book._id), err: err.message }, "[bookgeek] purge: file delete failed");
      }
      filesFailed += 1;
    }
  }
  return { filesDeleted, filesFailed };
}

/**
 * A Tankarr volume whose file is still in the comics folder cannot be purged:
 * the next scan would find the file, see no row, and bring the book back with
 * everyone's history gone. It stays hidden in Recently deleted until Tankarr
 * removes the file (the scan then drops the file entry and the purge goes
 * through). Also true while the folder is configured but unreadable — an
 * unmounted disk proves nothing about the file.
 */
export async function heldByComicsFolder(book) {
  if (!book || book.source !== TANKARR_SOURCE) return false;
  const cfg = comicsConfig();
  if (cfg.configured) {
    try {
      await fs.promises.access(cfg.root);
    } catch {
      return (Array.isArray(book.files) ? book.files : []).some((f) => f?.path);
    }
  }
  for (const f of Array.isArray(book.files) ? book.files : []) {
    const full = f?.path ? resolveInLibrary(f.path) : null;
    if (!full || mayUnlinkBookFile(book, f.path)) continue; // not Tankarr's file
    try {
      // eslint-disable-next-line no-await-in-loop
      if ((await fs.promises.stat(full)).isFile()) return true;
    } catch {
      // gone: nothing holds the row
    }
  }
  return false;
}

/**
 * Remove a book in Recently deleted for good. A book that is not in the
 * trash is never touched (resolves to null), so a stale "Delete forever"
 * can't take out a book someone has just restored. A Tankarr volume whose
 * file still exists resolves to `{ held: true }` and nothing is removed.
 */
export async function purgeBook(bookId, models = { Book, BookReading }) {
  const book = await models.Book.findOne({ _id: bookId, deletedAt: IN_TRASH }).lean();
  if (!book) return null;
  if (await heldByComicsFolder(book)) return { held: true, heldId: String(book._id) };
  const files = book.deleteFilesOnPurge ? await unlinkBookFiles(book) : { filesDeleted: 0, filesFailed: 0 };
  // Every reader's record of it goes with it — the orphans finding #4 was about.
  const readings = await models.BookReading.deleteMany({ bookId: book._id });
  await models.Book.deleteOne({ _id: book._id, deletedAt: IN_TRASH });
  return { purgedId: String(book._id), readingsDeleted: readings?.deletedCount ?? 0, ...files };
}

/** Purge every book deleted over 30 days ago. Never throws: a purge failure is not the caller's problem. */
export async function purgeExpiredBooks(now = Date.now(), models = { Book, BookReading }) {
  try {
    const expired = await models.Book.find(
      { deletedAt: { $ne: null, $lt: new Date(now - BOOK_TRASH_RETENTION_MS) } },
      { _id: 1 },
    ).limit(200).lean();
    let purged = 0;
    for (const { _id } of expired) {
      // eslint-disable-next-line no-await-in-loop
      const result = await purgeBook(_id, models);
      // A held Tankarr volume is not purged; it is looked at again next time.
      if (result && !result.held) purged += 1;
    }
    if (purged) logger.info({ purged }, "[bookgeek] expired deleted books purged");
    return purged;
  } catch (err) {
    logger.warn({ err: err?.message }, "[bookgeek] purge of expired deleted books failed");
    return 0;
  }
}
