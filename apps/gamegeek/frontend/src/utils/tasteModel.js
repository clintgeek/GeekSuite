/**
 * Chef's own definitions for shelves and star ratings — verbatim from
 * DOCS/TASTE_MODEL.md, which is ground truth. This is the one place they
 * live in the app; the shelf picker, the Add form, the rating section and
 * the Settings disclosure all read from here so the words never drift.
 *
 * `short` is the one-line form used inline (a picker row, a live line
 * under the stars). Rating labels come from @geeksuite/collection
 * (RATING_LABELS, shared with BookGeek) and Settings shows them. A
 * rating's `full` quote is the recommender's definition
 * (DOCS/TASTE_MODEL.md); a shelf's `full` quote is what Settings shows for
 * shelves. Meanings did not change.
 */
import { RATING_LABELS, ratingLabelFor, ratingLine } from '@geeksuite/collection';

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
    short: RATING_LABELS[5],
    full: 'I love this game, you should play this game like 10 times, do you have 2 hours to talk about it?',
  },
  4: {
    short: RATING_LABELS[4],
    full: 'I really liked this game, I wouldn’t hate playing again, but probably would rather play something new.',
  },
  3: {
    short: RATING_LABELS[3],
    full: 'I didn’t hate it, not my type of game but done well, it had some good moments, you should play it if you’re into that sort of game.',
  },
  2: {
    short: RATING_LABELS[2],
    full: 'I didn’t like it but probably put more hours into it than I should have.',
  },
  1: {
    short: RATING_LABELS[1],
    full: 'I freaking hated this game, you should never play it, it’s awful, do you have an hour to discuss how awful this game is?',
  },
});

/**
 * A rating value's meaning. Halves (an import can bring a 3.5) read as the
 * LOWER whole star, with the half noted — the rule lives in
 * @geeksuite/collection's ratingLabelFor, shared with BookGeek.
 *
 * Returns null for an unrated value (0, null, undefined).
 */
export function ratingMeaningFor(value) {
  const r = ratingLabelFor(value);
  if (!r) return null;
  const meaning = RATING_MEANINGS[r.star];
  return { star: r.star, isHalf: r.isHalf, short: meaning.short, full: meaning.full };
}

/** The live line's text for a rating value, or null when there's nothing to say. */
export const ratingMeaningLine = ratingLine;
