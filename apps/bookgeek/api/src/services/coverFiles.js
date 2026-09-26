/** Where a book's cover lives on disk, and the OpenLibrary cover download. */
import fs from "fs";
import path from "path";
import { Book } from "../models/book.js";
import { resolveInLibrary, safePathSegment } from "../libraryPaths.js";
import { fetchImageBuffer } from "../coverFetch.js";

export function resolveCoverRelativePathForBook(book, filename) {
  const defaultDir = "covers";
  if (!book || typeof book !== "object") {
    return path.join(defaultDir, filename);
  }

  let baseDirRel = null;

  if (Array.isArray(book.files) && book.files.length > 0) {
    const firstPath = book.files[0]?.path;
    if (typeof firstPath === "string" && firstPath.trim()) {
      baseDirRel = path.dirname(firstPath);
    }
  }

  if (!baseDirRel && typeof book.coverPath === "string" && book.coverPath.trim()) {
    baseDirRel = path.dirname(book.coverPath);
  }

  if (!baseDirRel) {
    baseDirRel = defaultDir;
  }

  return path.join(baseDirRel, filename);
}

export async function downloadOpenLibraryCover(coverId, bookOrId) {
  if (!coverId || !bookOrId) return null;
  // Only the digits OpenLibrary actually issues — anything else is both a
  // pointless upstream request and (before safePathSegment below) a way to
  // steer the local filename.
  const safeCoverId = String(coverId).trim();
  if (!/^[0-9]{1,20}$/.test(safeCoverId)) return null;

  const url = `https://covers.openlibrary.org/b/id/${ encodeURIComponent(
    safeCoverId
  ) }-L.jpg`;
  const buffer = await fetchImageBuffer(url);
  if (!buffer) return null;

  const libraryRoot = process.env.LIBRARY_PATH || "/data/library";

  let book = bookOrId;
  if (!book || typeof book !== "object" || !book._id) {
    try {
      book = await Book.findById(bookOrId).lean();
    } catch {
      book = null;
    }
  }

  const idForName = safePathSegment(
    (book && book._id && String(book._id)) || String(bookOrId),
    "book"
  );
  // `coverId` reaches here straight off POST /api/books/:id/cover's body, so
  // it must not be able to steer the write: `../../..` in a filename walks
  // out of the library root once path.join normalises it.
  const filename = `${ idForName }-ol-${ safePathSegment(safeCoverId, "cover") }.jpg`;
  const relPath = resolveCoverRelativePathForBook(book, filename);
  const destPath = resolveInLibrary(relPath, libraryRoot);
  if (!destPath) return null;

  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await fs.promises.writeFile(destPath, buffer);

  const finalRel = path.relative(libraryRoot, destPath);
  return finalRel;
}

export async function moveFileSafe(src, dest) {
  if (!src || !dest) {
    throw new Error("moveFileSafe requires src and dest");
  }
  try {
    await fs.promises.rename(src, dest);
    return;
  } catch (err) {
    if (err && err.code === "EXDEV") {
      await new Promise((resolve, reject) => {
        const read = fs.createReadStream(src);
        const write = fs.createWriteStream(dest);

        const onError = (e) => {
          read.destroy();
          write.destroy();
          reject(e);
        };

        read.on("error", onError);
        write.on("error", onError);
        write.on("close", resolve);

        read.pipe(write);
      });

      await fs.promises.unlink(src).catch(() => { });
      return;
    }
    throw err;
  }
}
