import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import {
  libraryRoot,
  resolveInLibrary,
  resolveStoredInLibrary,
} from "./libraryPaths.js";

const CALIBRE_EBOOK_CONVERT_BIN =
  process.env.CALIBRE_EBOOK_CONVERT_BIN || "ebook-convert";

const execFileAsync = promisify(execFile);

export const SUPPORTED_FORMATS = ["epub", "azw3", "mobi"];

/**
 * Re-exported so this module has one answer to "where is the library", not a
 * second copy of the same default. Everything here that turns a stored or
 * derived relative path into an absolute one goes through `libraryPaths.js`:
 * the going-over's `resolveInLibrary` reached every path-building site in
 * `server.js` and none of the two in this file, and this file is reachable
 * from `GET /download-basket/:slug/item/:index`, which has no auth at all.
 * A `Book.files[].path` of `../secret/private.epub` was enough to make
 * `res.download` stream a file from outside `LIBRARY_PATH`.
 */
export { libraryRoot };

/**
 * Convert an ebook file from one format to another using Calibre's
 * ebook-convert. The output format is determined by outputPath's extension.
 * If a coverPath is provided and exists on disk, it is embedded into the
 * converted output. Returns the output file's stats, or throws on failure.
 */
export async function convertEbookFile(inputPath, outputPath, coverPath = null) {
  if (!inputPath || !outputPath) {
    throw new Error("inputPath and outputPath are required");
  }

  // Belt to ensureFormat's braces: nothing gets spawned, written or embedded
  // unless it is still inside the library, whoever called.
  const root = libraryRoot();
  if (!resolveInLibrary(inputPath, root)) {
    throw new Error("inputPath resolves outside the library");
  }
  if (!resolveInLibrary(outputPath, root)) {
    throw new Error("outputPath resolves outside the library");
  }

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const args = [inputPath, outputPath];

  const outputExt = path.extname(outputPath).toLowerCase();
  if (outputExt === ".mobi") {
    // Both old and new MOBI formats for maximum device compatibility.
    args.push("--mobi-file-type", "both", "--output-profile", "kindle");
  }

  let cover = null;
  if (coverPath && resolveInLibrary(coverPath, root)) {
    try {
      const stats = await fs.promises.stat(coverPath);
      if (stats.isFile()) {
        cover = coverPath;
      }
    } catch {
      // Cover file missing; proceed without it.
    }
  }
  if (cover) {
    args.push("--cover", cover);
  }

  try {
    await execFileAsync(CALIBRE_EBOOK_CONVERT_BIN, args, {
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });
  } catch (err) {
    console.warn("ebook-convert failed", {
      inputPath,
      outputPath,
      cover,
      error: err.message,
    });
    throw err;
  }

  const stats = await fs.promises.stat(outputPath);
  if (!stats.isFile()) {
    throw new Error("Conversion did not produce a file");
  }

  return { path: outputPath, size: stats.size };
}

/**
 * Error thrown by ensureFormat carrying an HTTP-appropriate status code.
 */
export class EnsureFormatError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "EnsureFormatError";
    this.status = status;
  }
}

/**
 * Ensure the given Book has a file for the requested format on disk. If it
 * does, return its absolute path. If not, convert one on demand from another
 * available file, cache the artifact alongside the source, update Book.files[]
 * (persisted), and return the newly-created file's absolute path.
 *
 * Behavior mirrors the previous inline logic in
 * GET /api/books/:id/download/:format exactly:
 *   - format normalization is case-insensitive; stored format is uppercased
 *   - MOBI conversion uses --mobi-file-type=both --output-profile=kindle
 *   - a source with a different format is preferred over one matching the
 *     requested format, falling back to the first available source
 *   - cover (book.coverPath) is embedded when available
 *
 * @param {import("mongoose").Document} book  Book document (mutated + saved)
 * @param {string} format                     Requested format, any case
 * @param {object} [opts]
 * @param {string} [opts.logTag]              Tag used in log lines
 * @returns {Promise<{
 *   fullPath: string,
 *   filename: string,
 *   entry: object | null,
 *   converted: boolean,
 * }>}
 * @throws {EnsureFormatError}
 */
export async function ensureFormat(book, format, opts = {}) {
  if (!book) {
    throw new EnsureFormatError("Book not found", 404);
  }
  const requestedFormat = String(format || "").toLowerCase();
  if (!requestedFormat || !SUPPORTED_FORMATS.includes(requestedFormat)) {
    throw new EnsureFormatError("Invalid format", 400);
  }

  const root = libraryRoot();
  const logTag = opts.logTag || "ensureFormat";
  const normalizeFormat = (f) => String(f.format || "").toLowerCase();
  /**
   * Resolve a path this book already carries. A stored path that lands
   * outside the library is refused outright — never stat'd, never read —
   * and the caller sees the same "no such file" it sees for a missing one.
   */
  const resolveStored = (relPath, what) =>
    resolveStoredInLibrary(relPath, { root, what, logTag });

  const fileExistsOnDisk = async (relPath) => {
    const fullPath = resolveStored(relPath, "Book.files[].path");
    if (!fullPath) return null;
    try {
      const stats = await fs.promises.stat(fullPath);
      return stats.isFile() ? fullPath : null;
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.warn(`${logTag} stat error`, {
          bookId: String(book._id),
          relPath,
          error: err.message,
        });
      }
      return null;
    }
  };

  // Look for an existing file matching the requested format.
  let fileEntry = (book.files || []).find(
    (f) => normalizeFormat(f) === requestedFormat
  );
  let fullPath = fileEntry ? await fileExistsOnDisk(fileEntry.path) : null;

  const coverFullPath =
    book.coverPath && typeof book.coverPath === "string"
      ? resolveStored(book.coverPath, "Book.coverPath")
      : null;

  let converted = false;
  let entry = fileEntry || null;

  // If the requested format is missing (or its on-disk file is gone),
  // generate it on demand from another available file.
  if (!fullPath) {
    // Only files still inside the library are candidate sources; an escaping
    // row is dropped here rather than being converted from (which would also
    // have written the converted artifact next to it, outside the root).
    const sources = (book.files || []).filter(
      (f) => f.path && resolveStored(f.path, "Book.files[].path")
    );
    if (sources.length === 0) {
      throw new EnsureFormatError("No source files available", 404);
    }

    // Prefer a source whose format is not the requested one.
    const source =
      sources.find((f) => normalizeFormat(f) !== requestedFormat) || sources[0];
    const sourcePath = await fileExistsOnDisk(source.path);
    if (!sourcePath) {
      throw new EnsureFormatError("Source file not found", 404);
    }

    const sourceDir = path.dirname(sourcePath);
    const sourceBase = path.basename(sourcePath, path.extname(sourcePath));
    const outputPath = resolveInLibrary(
      path.join(sourceDir, `${ sourceBase }.${ requestedFormat }`),
      root
    );
    if (!outputPath) {
      // Unreachable while sourcePath is confined; kept so the write side can
      // never drift away from the read side again.
      throw new EnsureFormatError("Source file not found", 404);
    }

    try {
      await convertEbookFile(sourcePath, outputPath, coverFullPath);
    } catch (convertErr) {
      console.error(`${logTag} conversion failed`, {
        bookId: String(book._id),
        requestedFormat,
        sourcePath,
        error: convertErr.message,
      });
      throw new EnsureFormatError("Failed to convert file", 500);
    }

    const stats = await fs.promises.stat(outputPath);
    if (!stats.isFile()) {
      throw new EnsureFormatError("Conversion did not produce a file", 500);
    }

    // Save the new file entry if it is not already tracked.
    const outputRel = path.relative(root, outputPath);
    if (!resolveInLibrary(outputRel, root)) {
      throw new EnsureFormatError("Converted file resolves outside the library", 500);
    }

    const newEntry = {
      format: requestedFormat.toUpperCase(),
      path: outputRel,
      size: stats.size,
      addedAt: new Date(),
    };

    book.files = (book.files || []).filter(
      (f) => normalizeFormat(f) !== requestedFormat
    );
    book.files.push(newEntry);
    await book.save();

    fullPath = outputPath;
    entry = newEntry;
    converted = true;
  }

  return {
    fullPath,
    filename: path.basename(fullPath),
    entry,
    converted,
  };
}
