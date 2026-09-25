/**
 * The optimistic rating save, as a pure function so its one subtle property
 * is testable (same shape as bookgeek's utils/rateBook.js).
 *
 * The change is applied the instant it is asked for and rolled back if the
 * save fails. Each save takes a per-game sequence number and only the latest
 * may write: tap 3, 4, 5 quickly and the replies can land in any order — a
 * late reply (or late failure) for "4" must not overwrite the "5" on screen.
 *
 * @param {{ save: (id, rating) => Promise<any>, apply: (id, rating) => void }} deps
 * @returns {(game, rating) => Promise<{ ok: boolean, previous: number|null }>}
 */
export function createRateGame({ save, apply }) {
  const seqs = new Map();

  return async function rateGame(game, rating) {
    const id = game?.id;
    if (!id) return { ok: false, previous: null };
    const current = game.me?.rating;
    const previous = typeof current === 'number' && current > 0 ? current : null;
    const seq = (seqs.get(id) || 0) + 1;
    seqs.set(id, seq);
    const isLatest = () => seqs.get(id) === seq;

    apply(id, rating);
    try {
      const saved = await save(id, rating);
      if (!saved) throw new Error('Nothing came back');
      return { ok: true, previous };
    } catch {
      if (isLatest()) apply(id, previous);
      return { ok: false, previous };
    }
  };
}

/** Fill for star `i` (1-5) at a displayed value; halves display, whole stars input. */
export function starFill(i, value) {
  const v = Number(value) || 0;
  if (v >= i) return 'full';
  if (v >= i - 0.5) return 'half';
  return 'empty';
}
