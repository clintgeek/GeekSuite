/**
 * Which books get stars.
 *
 * Rating is for books you have read, so the stars appear on the Read and
 * Abandoned shelves — an abandoned book is a verdict too, often the most
 * useful one. They also appear on ANY book that already carries a rating,
 * whatever its shelf: on 2026-09-22, 13 rated books sat off the Read shelf
 * (most with no shelf at all, from the import), and hiding their stars would
 * have made existing ratings look lost.
 *
 * Everything else — want-to-read, unread, on-reader — stays clean. Stars on
 * a book you have not read would be an invitation to rate a cover.
 */
export const RATEABLE_SHELVES = Object.freeze(['read', 'abandoned']);

export function canRate(book) {
  if (!book) return false;
  if (RATEABLE_SHELVES.includes(book.shelf)) return true;
  return typeof book.rating === 'number' && book.rating > 0;
}

/**
 * The fill for star `i` (1-5) at a displayed value.
 *
 * Input is whole stars only — "brainless simple" — but DISPLAY keeps halves,
 * because five books were imported with 2.5 or 3.5. Rounding those for display
 * would show a rating the person never gave.
 */
export function starFill(i, value) {
  const v = Number(value) || 0;
  if (v >= i) return 'full';
  if (v >= i - 0.5) return 'half';
  return 'empty';
}
