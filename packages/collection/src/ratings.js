// What the stars say, for every collection app (BookGeek, GameGeek).
//
// Chef's own wording (2026-10-04), kept generic on purpose so one set works
// for a book and a game alike. An app may keep richer, domain-specific
// meanings behind these (GameGeek's DOCS/TASTE_MODEL.md, which a recommender
// reads), but the words a person sees next to the stars come from here.

export const RATING_LABELS = Object.freeze({
  5: 'LOVED IT!',
  4: 'It was great!',
  3: 'It was ok',
  2: 'Meh',
  1: 'It actively offended me',
});

/**
 * The label for a rating value, or null when unrated (0, null, NaN).
 *
 * The data allows halves (an import can bring a 3.5) even though the star
 * controls only commit whole stars. A half reads as its LOWER whole star,
 * with `isHalf` set so the caller can show "3½".
 */
export function ratingLabelFor(value) {
  const v = Number(value);
  if (value == null || !Number.isFinite(v) || v <= 0) return null;
  const whole = Math.floor(v);
  const isHalf = v - whole === 0.5;
  const star = Math.min(5, Math.max(1, isHalf ? whole : Math.round(v)));
  return { star, isHalf, label: RATING_LABELS[star] };
}

/** "4 of 5 — It was great!" / "3½ of 5 — It was ok", or null when unrated. */
export function ratingLine(value) {
  const r = ratingLabelFor(value);
  if (!r) return null;
  return `${r.star}${r.isHalf ? '½' : ''} of 5 — ${r.label}`;
}
