/**
 * Chef's own definitions for shelves and star ratings — verbatim from
 * DOCS/TASTE_MODEL.md, which is ground truth. This is the one place they
 * live in the app; the shelf picker, the Add form, the rating section and
 * the Settings disclosure all read from here so the words never drift.
 *
 * `short` is the calm, one-line form used inline (a picker row, a live
 * line under the stars). `full` is Chef's own quote, used only in the
 * Settings disclosure where there's room for it.
 */

export const SHELF_MEANINGS = Object.freeze({
  playing: {
    short: 'Installed and ready to go',
    full: '"Installed on the laptop, ready to go." It’s a readiness state: what’s available to pick up tonight — not "currently mid-playthrough".',
  },
  finished: {
    short: 'Got what I wanted out of it — a restart would be a fresh start',
    full: 'I got everything I wanted out of it and/or actually completed the game. Any restart would be a fresh start and not continuing. It doesn’t have to be 100% or credits-rolled — a satisfied exit also counts.',
  },
  'on-hold': {
    short: 'Played it; haven’t admitted I’ve abandoned it yet',
    full: 'I’ve played it and haven’t admitted that I abandoned it yet. It’s not a pause with intent to return — treat it as soft-abandoned.',
  },
  abandoned: {
    short: 'Abandoned is abandoned',
    full: 'Abandoned is abandoned. It’s not a verdict on quality by itself — the rating carries the verdict.',
  },
  // Provisional — Chef accepted the suggestion 2026-09-25; edit freely.
  // See DOCS/TASTE_MODEL.md.
  backlog: {
    short: 'Own it, haven’t started it',
    full: 'Own it, haven’t started it.',
    provisional: true,
  },
  wishlist: {
    short: 'Don’t own it yet, want it',
    full: 'Don’t own it yet, want it.',
    provisional: true,
  },
});

/** Shelf ids in the order Chef thinks about them (matches vocab's BUILT_IN_SHELVES). */
export const BUILT_IN_SHELF_ORDER = ['playing', 'backlog', 'finished', 'on-hold', 'abandoned', 'wishlist'];

/** A built-in shelf's meaning, or null for a custom shelf (no meaning line). */
export function shelfMeaning(id) {
  return SHELF_MEANINGS[id] || null;
}

export const RATING_MEANINGS = Object.freeze({
  5: {
    short: 'Love it — play it ten times',
    full: 'I love this game, you should play this game like 10 times, do you have 2 hours to talk about it?',
  },
  4: {
    short: 'Really liked it — I’d rather play something new than replay it',
    full: 'I really liked this game, I wouldn’t hate playing again, but probably would rather play something new.',
  },
  3: {
    short: 'Well made, not my type — good if you’re into that sort of game',
    full: 'I didn’t hate it, not my type of game but done well, it had some good moments, you should play it if you’re into that sort of game.',
  },
  2: {
    short: 'Didn’t like it, but sank more hours in than I should have',
    full: 'I didn’t like it but probably put more hours into it than I should have.',
  },
  1: {
    short: 'Hated it — never play it',
    full: 'I freaking hated this game, you should never play it, it’s awful, do you have an hour to discuss how awful this game is?',
  },
});

/**
 * A rating value's meaning. `value` may be a half (3.5) because the data
 * model allows it (packages/schemas/gamegeek/constants.js: rating 0-5, no
 * step) even though StarRating's own controls (click, arrows, 1-5 keys)
 * only ever commit a whole number — a half can only arrive pre-existing,
 * e.g. from an import. Per the taste model, a half shows the meaning of
 * its LOWER whole star, with the half noted.
 *
 * Returns null for an unrated value (0, null, undefined).
 */
export function ratingMeaningFor(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return null;
  const whole = Math.floor(v);
  const isHalf = v - whole === 0.5;
  const star = Math.min(5, Math.max(1, isHalf ? whole : Math.round(v)));
  const meaning = RATING_MEANINGS[star];
  if (!meaning) return null;
  return { star, isHalf, short: meaning.short, full: meaning.full };
}

/** The live line's text for a rating value, or null when there's nothing to say. */
export function ratingMeaningLine(value) {
  const meaning = ratingMeaningFor(value);
  if (!meaning) return null;
  return `${meaning.star}${meaning.isHalf ? '½' : ''} of 5 — ${meaning.short}`;
}
