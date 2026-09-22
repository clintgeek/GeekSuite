/**
 * The rating save, lifted out of App so its one subtle property is testable.
 *
 * Optimistic: the change is applied to the list (and the open book) the
 * instant it is asked for, and rolled back if the save fails. Resolves to
 * whether it saved.
 *
 * THE SUBTLE PART. Each save takes a per-book sequence number and only the
 * latest one may write. Tap 3, 4, 5 quickly and the three responses can come
 * back in any order; without the check, a late reply for "4" lands after the
 * "5" already on screen and quietly puts it back to 4 — or a late FAILURE
 * rolls back to a value that stopped being current two taps ago.
 *
 * @param {object} deps
 * @param {(id: string, rating: number|null) => Promise<object|null>} deps.save
 *        persists and resolves to the saved book (null/throw = failed)
 * @param {(id: string, patch: object) => void} deps.apply
 *        writes a patch into every place the book is shown
 * @returns {(book: object, rating: number|null) => Promise<boolean>}
 */
export function createRateBook({ save, apply }) {
  const seqs = new Map();

  return async function rateBook(book, rating) {
    const id = book?.id || book?._id;
    if (!id) return false;
    const previous = typeof book.rating === 'number' && book.rating > 0 ? book.rating : null;
    const seq = (seqs.get(id) || 0) + 1;
    seqs.set(id, seq);
    const isLatest = () => seqs.get(id) === seq;

    apply(id, { rating });
    try {
      const saved = await save(id, rating);
      if (!saved) throw new Error('No book came back');
      if (isLatest()) apply(id, saved);
      return true;
    } catch {
      if (isLatest()) apply(id, { rating: previous });
      return false;
    }
  };
}
