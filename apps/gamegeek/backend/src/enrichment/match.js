/**
 * The strict matcher (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Matching is
 * strict). A wrong cover is worse than a title plate, so this says no-match
 * whenever it is not sure. Pure: no network, no clock.
 *
 *   1. First pass: normalizeTitle(game) === normalizeTitle(candidate) — the
 *      Playnite import's normalizer, reused, so "DOOM™" and "DOOM" are one key
 *      while "Director's Cut" keeps its words and stays distinct.
 *   2. Second pass, only when the first finds nothing: both sides also drop
 *      ONE trailing edition word (game of the year, goty, definitive,
 *      enhanced, remastered, deluxe, complete — optionally followed by
 *      "edition").
 *   3. In either pass, when both sides have a year they must be within ±1.
 *   4. Exactly one candidate must pass. Two → ambiguous, no match.
 */
import { normalizeTitle } from '../playnite/mapping.js';

export const EDITION_WORDS = ['game of the year', 'goty', 'definitive', 'enhanced', 'remastered', 'deluxe', 'complete'];

const EDITION_SUFFIX = new RegExp(
  `[\\s:\\-–—,(\\[]*\\b(?:${EDITION_WORDS.join('|')})(?:\\s+edition)?[)\\]]?\\s*$`,
  'i'
);

/** The title with one trailing edition word removed (or unchanged when there is none). */
export function stripEditionSuffix(title) {
  const raw = String(title ?? '').replace(/[™®©]/g, '').trim();
  const stripped = raw.replace(EDITION_SUFFIX, '').trim();
  return stripped || raw;
}

/** The second-pass key: normalizeTitle of the title with its edition suffix dropped. */
export function editionKey(title) {
  const stripped = stripEditionSuffix(title);
  return normalizeTitle(stripped);
}

/** A Date / ISO string / {year} → the UTC year, or null. */
export function yearOf(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isInteger(value) && value > 1900 ? value : null;
  const d = value instanceof Date ? value : new Date(value);
  const y = d.getUTCFullYear();
  return Number.isNaN(y) ? null : y;
}

function candidateYear(c) {
  return c?.year != null ? yearOf(Number(c.year)) : yearOf(c?.releaseDate);
}

/** Both years known → within ±1; either unknown → passes. */
export function yearsCompatible(a, b) {
  if (a == null || b == null) return true;
  return Math.abs(a - b) <= 1;
}

function dedupe(candidates) {
  const seen = new Set();
  const out = [];
  for (const c of candidates ?? []) {
    if (!c || typeof c.title !== 'string') continue;
    const key = `${c.provider}:${c.providerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * @param {{title: string, releaseDate?: Date|string|null}} game
 * @param {object[]} candidates MetadataCandidate[] from ONE provider's search.
 * @returns {{status: 'matched', candidate: object, pass: 1|2}
 *   | {status: 'ambiguous', candidates: object[], pass: 1|2}
 *   | {status: 'no-match'}}
 */
export function matchCandidates(game, candidates) {
  const list = dedupe(candidates);
  const gameYear = yearOf(game?.releaseDate);
  const passes = (keyOf) => {
    const target = keyOf(game?.title);
    if (!target) return [];
    return list.filter((c) => keyOf(c.title) === target && yearsCompatible(gameYear, candidateYear(c)));
  };

  for (const [pass, keyOf] of [
    [1, normalizeTitle],
    [2, editionKey],
  ]) {
    const hits = passes(keyOf);
    if (hits.length === 1) return { status: 'matched', candidate: hits[0], pass };
    if (hits.length > 1) return { status: 'ambiguous', candidates: hits, pass };
  }
  return { status: 'no-match' };
}

export default { matchCandidates, stripEditionSuffix, editionKey, yearOf, yearsCompatible, EDITION_WORDS };
