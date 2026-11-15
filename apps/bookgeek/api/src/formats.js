/**
 * Which file formats BookGeek knows, and what it may do with each.
 *
 * Two kinds (2026-11-15, comics and manga):
 *   - CONVERTIBLE: ebooks. A missing one is made on demand by Calibre's
 *     ebook-convert (ebookFormats.js `ensureFormat`).
 *   - AS-IS: comic archives and PDF. Pages are images; converting TO one of
 *     these makes no sense, so the download hands back the file that was
 *     uploaded or a 404, and never spawns a conversion.
 *
 * One list, read by the route, its zod schema, `ensureFormat` and the Calibre
 * rescan, which each used to carry their own copy of ["epub","azw3","mobi"].
 * No imports here on purpose: the validation schemas load this file.
 */

/** Ebook formats Calibre converts between on demand. */
export const CONVERTIBLE_FORMATS = ["epub", "azw3", "mobi"];

/** Comic-book archives: zip, rar, 7z and tar of page images. */
export const COMIC_FORMATS = ["cbz", "cbr", "cb7", "cbt"];

/** Served exactly as stored; never a conversion target. */
export const AS_IS_FORMATS = [...COMIC_FORMATS, "pdf"];

/** Everything GET /api/books/:id/download/:format accepts. */
export const DOWNLOAD_FORMATS = [...CONVERTIBLE_FORMATS, ...AS_IS_FORMATS];

const lower = (format) => String(format || "").toLowerCase();

export const isComicFormat = (format) => COMIC_FORMATS.includes(lower(format));
export const isAsIsFormat = (format) => AS_IS_FORMATS.includes(lower(format));
