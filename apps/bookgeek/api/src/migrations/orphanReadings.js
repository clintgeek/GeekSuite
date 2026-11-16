/**
 * Orphan readings (SUITE_REVIEW_2026-11 BookGeek #4): a `bookreadings` row
 * whose book row no longer exists. The old `DELETE /api/books/:id` removed
 * the book and left every reader's reading behind. A reading of a book in
 * Recently deleted is NOT an orphan (the book row is still there, and a
 * restore needs it), so the join is against the raw collection.
 *
 * Used by scripts/sweep-orphan-readings.mjs (dry by default). Plain data, no
 * model import, so the gateway's tests can run the same pipeline.
 */

/** Aggregate on `bookreadings`: every reading whose book row is gone. */
export function orphanReadingsPipeline(booksCollection = "books") {
  return [
    { $lookup: { from: booksCollection, localField: "bookId", foreignField: "_id", as: "book" } },
    { $match: { book: { $size: 0 } } },
    { $project: { _id: 1, bookId: 1, userId: 1, shelf: 1 } },
  ];
}

/**
 * Find (and with `apply`, delete) the orphans. Returns counts only; the
 * caller decides what to print.
 */
export async function sweepOrphanReadings(BookReading, { apply = false, booksCollection = "books" } = {}) {
  const orphans = await BookReading.aggregate(orphanReadingsPipeline(booksCollection));
  const books = new Set(orphans.map((o) => String(o.bookId)));
  const readers = new Set(orphans.map((o) => String(o.userId)));
  let deleted = 0;
  if (apply && orphans.length) {
    const res = await BookReading.deleteMany({ _id: { $in: orphans.map((o) => o._id) } });
    deleted = res?.deletedCount ?? 0;
  }
  return { orphans: orphans.length, books: books.size, readers: readers.size, deleted, dryRun: !apply };
}
