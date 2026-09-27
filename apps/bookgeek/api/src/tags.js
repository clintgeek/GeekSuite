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
 * path that writes `tags` goes through this (the rescan's new books and
 * enrich's merged subjects).
 */
export function withDerivedTags(doc) {
  return { ...doc, ...deriveTagFields(Array.isArray(doc?.tags) ? doc.tags : []) };
}


