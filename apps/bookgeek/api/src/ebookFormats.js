import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const CALIBRE_EBOOK_CONVERT_BIN =
  process.env.CALIBRE_EBOOK_CONVERT_BIN || "ebook-convert";

const execFileAsync = promisify(execFile);

export const SUPPORTED_FORMATS = ["epub", "azw3", "mobi"];

export function libraryRoot() {
  return process.env.LIBRARY_PATH || "/data/library";
}

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

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const args = [inputPath, outputPath];

  const outputExt = path.extname(outputPath).toLowerCase();
  if (outputExt === ".mobi") {
    // Both old and new MOBI formats for maximum device compatibility.
    args.push("--mobi-file-type", "both", "--output-profile", "kindle");
  }

  let cover = null;
  if (coverPath) {
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
  const fileExistsOnDisk = async (relPath) => {
    try {
      const fullPath = path.join(root, relPath);
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
      ? path.join(root, book.coverPath)
      : null;

  let converted = false;
  let entry = fileEntry || null;

  // If the requested format is missing (or its on-disk file is gone),
  // generate it on demand from another available file.
  if (!fullPath) {
    const sources = (book.files || []).filter((f) => f.path);
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
    const outputPath = path.join(sourceDir, `${ sourceBase }.${ requestedFormat }`);

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
    const newEntry = {
      format: requestedFormat.toUpperCase(),
      path: path.relative(root, outputPath),
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
