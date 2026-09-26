/**
 * The tag vocabulary as the api uses it (apps/bookgeek/DOCS/TAGS.md).
 *
 * The vocabulary itself lives in packages/schemas/bookgeek/tags.js, shared
 * with the gateway; it is imported by relative path for the same reason the
 * Book model is (this api does not declare @geeksuite/schemas; see
 * models/book.js).
 *
 * What is the api's here: stamping the derived fields onto whatever an import
 * path is about to write, and carrying a person's own tags (`myTags`) across
 * the destructive Calibre re-import.
 */
import tagsModule from "../../../../packages/schemas/bookgeek/tags.js";

export const { deriveTagFields, cleanMyTags, classifyRawTag, ALL_TAGS, MAX_LIBRARY_TAGS } = tagsModule;
export const tagVocabulary = tagsModule;

/**
 * `doc` with `libraryTags`/`unsortedTags` derived from its `tags`. Every api
 * path that writes `tags` goes through this (the Calibre import, the rescan's
 * new books, enrich's merged subjects).
 */
export function withDerivedTags(doc) {
  return { ...doc, ...deriveTagFields(Array.isArray(doc?.tags) ? doc.tags : []) };
}

const norm = (v) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const isbnKey = (v) => String(v ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();

/** The identities a Calibre book can be recognised by across a re-import, strongest first. */
export function bookIdentityKeys(book) {
  const keys = [];
  const isbn = isbnKey(book?.isbn);
  if (isbn) keys.push(`isbn:${isbn}`);
  const isbn13 = isbnKey(book?.isbn13);
  if (isbn13) keys.push(`isbn:${isbn13}`);
  if (book?.goodreadsId) keys.push(`gr:${book.goodreadsId}`);
  const title = norm(book?.title);
  const author = norm(Array.isArray(book?.authors) ? book.authors[0] : "");
  if (title) keys.push(`ta:${title}|${author}`);
  return keys;
}

/**
 * `POST /api/import/calibre` deletes every Calibre-imported book and inserts
 * the library again, so anything stored only on the old documents is gone.
 * For `myTags` that would break TAGS.md's rule ("an edit in BookGeek must
 * never be lost to a Calibre re-import"), so before the delete:
 *   - each new doc inherits the myTags of the old book it matches (ISBN,
 *     Goodreads id, then title + first author);
 *   - an old book with myTags that matches NOTHING in the new import is
 *     kept (`keepIds`) rather than deleted — it is no longer in Calibre, so
 *     keeping it duplicates nothing.
 * Pure: returns the docs to insert and the ids to keep.
 *
 * @param {Array<{_id, title, authors, isbn, isbn13, goodreadsId, myTags}>} existing
 * @param {object[]} docs  the new import's documents
 */
export function carryOverMyTags(existing, docs) {
  const withMine = (existing ?? []).filter((b) => Array.isArray(b.myTags) && b.myTags.length);
  const byKey = new Map();
  for (const doc of docs) for (const k of bookIdentityKeys(doc)) if (!byKey.has(k)) byKey.set(k, doc);

  const out = new Map(); // doc → myTags
  const keepIds = [];
  for (const old of withMine) {
    const target = bookIdentityKeys(old).map((k) => byKey.get(k)).find(Boolean);
    if (!target) {
      keepIds.push(old._id);
      continue;
    }
    out.set(target, cleanMyTags([...(out.get(target) ?? []), ...old.myTags]));
  }
  return {
    docs: docs.map((d) => (out.has(d) ? { ...d, myTags: out.get(d) } : d)),
    keepIds,
    carried: out.size,
  };
}
