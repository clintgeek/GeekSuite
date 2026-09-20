/**
 * exportBooksCsv — turn the library rows currently on screen into a CSV file.
 *
 * WHAT "ON SCREEN" MEANS HERE
 * ---------------------------
 * The grid is paginated (50 at a time, load-more sentinel), so the rows React
 * has rendered are usually a prefix of what the active filters actually match.
 * Exporting only those would hand back 50 of 200 matching books with nothing
 * saying so, which is the kind of quiet wrongness this suite keeps getting
 * bitten by. So the caller re-runs the SAME query with the SAME filters and
 * sort and walks every page; this module only formats what it is given.
 *
 * ESCAPING IS THE WHOLE JOB
 * -------------------------
 * Book metadata is the worst case for naive CSV: titles contain commas
 * ("Eats, Shoots & Leaves"), reviews contain newlines and quotation marks,
 * and author lists are themselves comma-separated. RFC 4180 says a field
 * containing a comma, a double quote or a line break is wrapped in double
 * quotes, and an inner double quote is doubled. That is what `csvField` does,
 * and every value goes through it — there is no "this one is safe" shortcut,
 * because the one field nobody escapes is the one that eventually holds a
 * comma.
 *
 * TWO THINGS THAT ARE NOT OBVIOUS
 * -------------------------------
 * 1. FORMULA INJECTION. A spreadsheet treats a cell beginning `=`, `+`, `-`
 *    or `@` as a formula, so a book titled `=1+1` or a review pasted from
 *    somewhere hostile becomes executable on open. Prefixing a single quote
 *    is the standard defence and is invisible in the cell. This matters more
 *    than usual here: much of this library was imported from Goodreads and
 *    Calibre, so the text is not all self-authored.
 * 2. THE BOM. Excel reads a UTF-8 CSV as the local 8-bit codepage unless the
 *    file opens with a byte-order mark, which turns every accented author
 *    name into mojibake. LibreOffice and Sheets cope either way, so the BOM
 *    costs nothing and fixes the common case.
 *
 * Line endings are CRLF, per the same RFC — Excel is the fussy consumer and
 * everything else accepts either.
 */

/** Cells that a spreadsheet would otherwise execute. */
const FORMULA_LEADERS = ['=', '+', '-', '@', '\t', '\r'];

/** Excel needs this to read the file as UTF-8. */
export const UTF8_BOM = '﻿';

/**
 * The columns, in order. `key` is looked up on the book, `label` is the
 * header. Deliberately NOT every field the query returns:
 *
 *   - `description` is a full blurb — it would dominate the file and is not
 *     something anyone scans in a spreadsheet.
 *   - `coverPath` / `files` are server-side paths, meaningless outside the app.
 *   - `id` IS included, because without a stable key a round-trip back into
 *     BookGeek (or a diff against a later export) has nothing to match on.
 */
export const BOOK_CSV_COLUMNS = [
  { key: 'title', label: 'Title' },
  { key: 'authors', label: 'Authors' },
  { key: 'seriesName', label: 'Series' },
  { key: 'seriesIndex', label: 'Series Index' },
  { key: 'isbn', label: 'ISBN' },
  { key: 'isbn13', label: 'ISBN13' },
  { key: 'publisher', label: 'Publisher' },
  { key: 'publishedDate', label: 'Published' },
  { key: 'pageCount', label: 'Pages' },
  { key: 'language', label: 'Language' },
  { key: 'tags', label: 'Tags' },
  { key: 'shelf', label: 'Shelf' },
  { key: 'owned', label: 'Owned' },
  { key: 'rating', label: 'Rating' },
  { key: 'readCount', label: 'Read Count' },
  { key: 'readingProgress', label: 'Progress' },
  { key: 'dateAdded', label: 'Date Added' },
  { key: 'dateStarted', label: 'Date Started' },
  { key: 'dateFinished', label: 'Date Finished' },
  { key: 'review', label: 'Review' },
  { key: 'id', label: 'BookGeek ID' },
];

/**
 * One value, rendered for a cell — before quoting.
 *
 * `null`/`undefined` become an empty cell rather than the strings "null" or
 * "undefined", which is what `String(value)` would produce and what a naive
 * export ships. A `false` must survive, so this cannot test falsiness.
 */
export function csvValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined).join('; ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/**
 * One cell, escaped per RFC 4180 and defused for spreadsheets.
 */
export function csvField(value) {
  let text = csvValue(value);

  // Defuse before quoting: the guard has to be inside the quoted field, and
  // it must be applied to the rendered text, not the raw value.
  if (text.length > 0 && FORMULA_LEADERS.includes(text[0])) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Flatten a book into the shape `BOOK_CSV_COLUMNS` expects.
 *
 * `series` arrives as `{ name, index }`, so it is spread into two columns —
 * a series index is a number people sort by, and gluing it to the name
 * ("Discworld #5") makes that impossible.
 */
export function bookToRow(book = {}) {
  return {
    ...book,
    seriesName: book?.series?.name ?? '',
    seriesIndex: book?.series?.index ?? '',
  };
}

/**
 * The whole file, as a string.
 *
 * @param {Array<Object>} books rows in the order they should appear — the
 *   caller is responsible for that order matching what is on screen.
 * @param {Object} [options]
 * @param {Array} [options.columns] override the column set (tests use this)
 * @returns {string} CSV including the header row; CRLF line endings; no BOM
 *   (that belongs to the Blob, so the string stays comparable in tests).
 */
export function buildBooksCsv(books, { columns = BOOK_CSV_COLUMNS } = {}) {
  const list = Array.isArray(books) ? books : [];
  const header = columns.map((c) => csvField(c.label)).join(',');
  const rows = list.map((book) => {
    const row = bookToRow(book);
    return columns.map((c) => csvField(row[c.key])).join(',');
  });
  // A header with no rows is a valid, useful file: it tells the user the
  // export ran and the filter matched nothing.
  return [header, ...rows].join('\r\n');
}

/**
 * A filename that says what the file contains.
 *
 * Filters are folded into the name so two exports taken minutes apart do not
 * overwrite each other in the downloads folder and cannot be told apart. The
 * date is the LOCAL day — this is a filename a person reads, not a stored
 * instant (DOCS/THE_CONTEXT.md §3.1).
 */
export function booksCsvFilename(filters = {}, now = new Date()) {
  const parts = ['bookgeek'];
  const { shelf, author, tag, q } = filters;
  if (shelf && shelf !== 'all') parts.push(String(shelf));
  if (author) parts.push(`by-${author}`);
  if (tag) parts.push(`tag-${tag}`);
  if (q) parts.push(`search-${q}`);

  const pad = (n) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const slug = parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return `${slug}-${day}.csv`;
}
