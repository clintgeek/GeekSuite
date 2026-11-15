/**
 * Comics and manga (2026-11-15).
 *
 * A book is a comic when one of its files is a comic archive (CBZ, CBR, CB7,
 * CBT), or when it is tagged as one: plenty of manga is a PDF or an EPUB, and
 * the file alone can't say so. Which word it wears comes from the tags —
 * "Manga" when they say manga (or manhwa / manhua), "Comic" otherwise.
 *
 * The lists mirror apps/bookgeek/api/src/formats.js. Comic archives and PDF
 * are AS-IS: the server hands back the stored file and never converts to one.
 */

/** Comic-book archives: zip, rar, 7z and tar of page images. */
export const COMIC_FORMATS = ["cbz", "cbr", "cb7", "cbt"];

/** Downloaded exactly as stored; never a conversion target. */
export const AS_IS_FORMATS = [...COMIC_FORMATS, "pdf"];

/** Ebook formats the server converts between on demand. */
export const CONVERTIBLE_FORMATS = ["epub", "azw3", "mobi"];

/** What the file pickers accept. */
export const BOOK_FILE_ACCEPT = [
  "epub", "mobi", "azw3", "pdf", ...COMIC_FORMATS, "fb2", "rtf", "txt", "html",
].map((ext) => `.${ext}`).join(",");

/** A file's format, lowercased: the stored `format`, else the path's extension. */
export function fileFormat(file) {
  const stored = String(file?.format || "").toLowerCase();
  if (stored) return stored;
  const path = String(file?.path || "");
  return path.includes(".") ? path.split(".").pop().toLowerCase() : "";
}

const filesOf = (book) => (Array.isArray(book?.files) ? book.files : []);

export const isAsIsFormat = (format) => AS_IS_FORMATS.includes(String(format || "").toLowerCase());

export const hasComicFile = (book) => filesOf(book).some((f) => COMIC_FORMATS.includes(fileFormat(f)));

export const hasEbookFile = (book) => filesOf(book).some((f) => CONVERTIBLE_FORMATS.includes(fileFormat(f)));

const MANGA_TAG = /\b(manga|manhwa|manhua)\b/i;
// Not a bare "comic": "Comic fantasy" is a shelf of Pratchett, not of comics.
const COMIC_TAG = /\b(comics|comic books?|graphic novels?)\b/i;

function tagsOf(book) {
  return ["libraryTags", "unsortedTags", "myTags", "tags"]
    .flatMap((key) => (Array.isArray(book?.[key]) ? book[key] : []))
    .map((tag) => String(tag));
}

/** "Manga", "Comic", or null for an ordinary book. */
export function comicKind(book) {
  const tags = tagsOf(book);
  if (tags.some((tag) => MANGA_TAG.test(tag))) return "Manga";
  if (hasComicFile(book) || tags.some((tag) => COMIC_TAG.test(tag))) return "Comic";
  return null;
}

/** "Vol. 3" — a comic's volume, from its place in the series. Null without one. */
export function volumeLabel(book) {
  const index = Number(book?.series?.index);
  if (!Number.isFinite(index) || index <= 0) return null;
  return `Vol. ${Number.isInteger(index) ? index : index.toFixed(1)}`;
}

/**
 * The line a comic's card wears above its title: "Manga · Vol. 3". Every
 * volume of a series has the same title and often the same cover, so the
 * volume is what tells two cards apart. Null for an ordinary book.
 */
export function comicLine(book) {
  const kind = comicKind(book);
  if (!kind) return null;
  return [kind, volumeLabel(book)].filter(Boolean).join(" · ");
}

/**
 * The rows of the download sheet, in order: the files that download as they
 * are (the comic first), then the ebook formats. The ebook rows are left out
 * for a book with no ebook file at all: there is nothing sensible to convert
 * a comic archive into, and a 200 MB volume would time the converter out.
 */
export function downloadRows(book) {
  const files = filesOf(book);
  const seen = new Set();
  const asIs = [];
  for (const format of AS_IS_FORMATS) {
    const file = files.find((f) => fileFormat(f) === format);
    if (file && !seen.has(format)) {
      seen.add(format);
      asIs.push({ format, file, asIs: true });
    }
  }
  const showEbooks = hasEbookFile(book) || asIs.length === 0;
  const ebooks = showEbooks
    ? CONVERTIBLE_FORMATS.map((format) => ({
        format,
        file: files.find((f) => fileFormat(f) === format) || null,
        asIs: false,
      }))
    : [];
  return [...asIs, ...ebooks];
}

/**
 * The file a comic's Download button hands over, as it is stored: the comic
 * archive if there is one, else the PDF, else the EPUB, else whatever is
 * there. A comic is downloaded and read elsewhere, so its book page leads
 * with Download where an ordinary book has Read and Send (Chef, 2026-11-15).
 * Returns the lowercase format, or null when the book has no file.
 */
export function comicDownloadFormat(book) {
  const formats = filesOf(book).map(fileFormat).filter(Boolean);
  for (const wanted of [...COMIC_FORMATS, "pdf", "epub"]) {
    if (formats.includes(wanted)) return wanted;
  }
  return formats[0] || null;
}

/**
 * The Add-book dialog's Manga / Comic choice, and the shared tag each one
 * writes. The tag is what makes an EPUB or a PDF a comic: nothing about the
 * file says so (Chef's manga are EPUBs, 2026-11-15).
 */
export const COMIC_KIND_TAGS = { manga: "Manga", comic: "Comics" };
