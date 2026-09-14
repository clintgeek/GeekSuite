/**
 * foodRanker — one scorer, used on every search path.
 *
 * Before this there were three half-scorers (`basicLexicalSort`,
 * `scoreRelevance`, and the trick of prepending the user's own foods) and one
 * path — the commonest one, any query of three words or fewer — that applied
 * none of them. `searchAPIs` concatenated local + FatSecret + external results
 * in source order and returned them, and the frontend's sort keyed on fields
 * that path never sets, so a stable sort preserved arrival order all the way
 * to the screen. "Best Matches" meant "whichever API answered first".
 *
 * This module replaces all of it. The rules, in order of weight:
 *
 *   1. Does the name say what the person said? Exact > prefix > every query
 *      word present > some of them.
 *   2. Does it say things they did NOT say? "Pancake SYRUP" for "pancakes"
 *      loses to "Pancakes, chocolate chip" because of what it adds.
 *   3. Is it food they have actually eaten? Favourites, recents and their own
 *      custom foods carry real weight — this is a personal log, not a search
 *      engine.
 *   4. Does it agree on preparation? "grilled" should find the grilled one.
 *   5. Can it be logged at all? An entry with no calories is not an answer.
 *
 * Everything here is pure and deterministic, so the golden-set test in
 * `foodRanker.test.js` is the contract. See DOCS/THE_FOOD_SEARCH_PLAN.md §3.
 */

import { normalizeQuery, tokenize } from './foodQueryParser.js';

/** How much we trust each source to be a real, loggable food. */
const SOURCE_TRUST = {
  custom: 70,
  local: 60,
  fatsecret: 45,
  usda: 40,
  nutritionix: 30,
  openfoodfacts: 22,
  calorieninjas: 12,
  ai: 4
};

const WEIGHTS = {
  exactName: 1000,
  prefixName: 520,
  allTokens: 380,
  coverage: 260,      // × fraction of query tokens matched
  extraToken: -26,    // per word the name adds that the query never said
  brandToken: 45,     // per query token found in the brand
  preparation: 60,
  favorite: 170,
  recent: 130,        // × recency decay
  custom: 90,
  noCalories: -320,
  longName: -70,
  // A dish query is ABOUT its head noun. "Chocolate chips" matches two words
  // of "chocolate chip pancakes" and is still not pancakes.
  missingHeadNoun: -300
};

/** How much of the query a name must carry to count as the dish they meant. */
const MIN_CONFIDENT_COVERAGE = 0.5;

const emptyPersonal = { favorites: new Set(), recent: new Map(), custom: new Set(), chosenForQuery: new Set() };

/** The identity used to look a result up in the personal index. */
export const resultKey = (item) => {
  if (!item) return '';
  if (item.id) return String(item.id);
  if (item._id) return String(item._id);
  return `${(item.name || '').toLowerCase()}-${(item.brand || '').toLowerCase()}`;
};

/** 1 for something logged today, decaying to 0 across ~60 days. */
export function recencyDecay(lastUsed, now = Date.now()) {
  if (!lastUsed) return 0;
  const days = (now - new Date(lastUsed).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return 1;
  return Math.max(0, 1 - days / 60);
}

/**
 * Score one result against one parsed fragment.
 *
 * @param {object} food      a result in the standard shape
 * @param {object} fragment  a fragment from `parseFoodQuery`
 * @param {object} [options] `{ personal, now }`
 * @returns {{score: number, reasons: object}} the score, and why — the
 *          breakdown is what makes a disappointing search debuggable.
 */
export function scoreFoodResult(food, fragment, options = {}) {
  const personal = { ...emptyPersonal, ...(options.personal || {}) };
  const now = options.now || Date.now();

  const name = normalizeQuery(food?.name);
  const brand = normalizeQuery(food?.brand);
  const query = normalizeQuery(fragment?.searchText);
  const queryTokens = fragment?.tokens?.length ? fragment.tokens : tokenize(query);
  const nameTokens = tokenize(name);
  const brandTokens = tokenize(brand);

  const reasons = {};
  let score = 0;

  // ── 1. What the name says ────────────────────────────────────────────
  if (name && name === query) {
    score += WEIGHTS.exactName;
    reasons.exactName = WEIGHTS.exactName;
  } else if (name && query && name.startsWith(query)) {
    score += WEIGHTS.prefixName;
    reasons.prefixName = WEIGHTS.prefixName;
  }

  const nameTokenSet = new Set(nameTokens);
  const matched = queryTokens.filter((t) => nameTokenSet.has(t));
  const coverage = queryTokens.length ? matched.length / queryTokens.length : 0;

  if (queryTokens.length > 0 && matched.length === queryTokens.length && !reasons.exactName) {
    score += WEIGHTS.allTokens;
    reasons.allTokens = WEIGHTS.allTokens;
  }
  reasons.coverageRatio = coverage;
  if (coverage > 0) {
    const points = Math.round(WEIGHTS.coverage * coverage);
    score += points;
    reasons.coverage = points;
  }

  // ── 2. What the name adds that nobody asked for ──────────────────────
  // This is the rule that sinks "pancake syrup" for "chocolate chip pancakes".
  const queryTokenSet = new Set(queryTokens);
  const extraTokens = nameTokens.filter((t) => !queryTokenSet.has(t));
  if (extraTokens.length > 0) {
    const points = WEIGHTS.extraToken * extraTokens.length;
    score += points;
    reasons.extraTokens = points;
  }

  // ── 3. Brand ─────────────────────────────────────────────────────────
  const brandTokenSet = new Set(brandTokens);
  const brandMatches = queryTokens.filter((t) => brandTokenSet.has(t)).length;
  if (brandMatches > 0) {
    const points = WEIGHTS.brandToken * brandMatches;
    score += points;
    reasons.brand = points;
  }

  // ── 4. Preparation agreement ─────────────────────────────────────────
  const preparation = fragment?.preparation || [];
  if (preparation.length > 0 && preparation.some((p) => nameTokenSet.has(normalizeQuery(p)))) {
    score += WEIGHTS.preparation;
    reasons.preparation = WEIGHTS.preparation;
  }

  // ── 5. Source trust ──────────────────────────────────────────────────
  const trust = SOURCE_TRUST[String(food?.source || '').toLowerCase()] ?? 10;
  score += trust;
  reasons.source = trust;

  // ── 6. Food they actually eat ────────────────────────────────────────
  const key = resultKey(food);
  if (personal.chosenForQuery.has(key)) {
    // Not scored — pinned. See `rankFoodResults`: an answer they already gave
    // to this exact question should not have to out-argue the lexical scorer.
    reasons.chosenBefore = true;
  }
  if (personal.favorites.has(key) || food?.isFavorite) {
    score += WEIGHTS.favorite;
    reasons.favorite = WEIGHTS.favorite;
  }
  if (personal.recent.has(key)) {
    const decay = recencyDecay(personal.recent.get(key)?.lastUsed, now);
    const points = Math.round(WEIGHTS.recent * decay);
    if (points > 0) {
      score += points;
      reasons.recent = points;
    }
  }
  if (personal.custom.has(key) || String(food?.source).toLowerCase() === 'custom') {
    score += WEIGHTS.custom;
    reasons.custom = WEIGHTS.custom;
  }

  // ── 7. Can it be logged at all? ──────────────────────────────────────
  const nutrition = food?.nutrition || {};
  const calories = Number(nutrition.calories_per_serving) || 0;
  const hasMacros = ['protein_grams', 'carbs_grams', 'fat_grams']
    .some((k) => Number(nutrition[k]) > 0);
  if (calories <= 0 && !hasMacros) {
    score += WEIGHTS.noCalories;
    reasons.noCalories = WEIGHTS.noCalories;
  }

  // ── 8. The head noun ─────────────────────────────────────────────────
  // Only for dish queries: elsewhere a partial match is often the right
  // answer, but "chocolate chip pancakes" without "pancake" never is.
  if (fragment?.isDish && fragment.headNoun && !nameTokenSet.has(fragment.headNoun)) {
    score += WEIGHTS.missingHeadNoun;
    reasons.missingHeadNoun = WEIGHTS.missingHeadNoun;
  }

  // ── 9. Rambling names ────────────────────────────────────────────────
  if (query && nameTokens.length > queryTokens.length * 3 + 2) {
    score += WEIGHTS.longName;
    reasons.longName = WEIGHTS.longName;
  }

  return { score, reasons };
}

/**
 * Rank a result set for one fragment. Stable: equal scores keep their original
 * order, so an upstream's own ordering still breaks ties.
 *
 * @param {object[]} results
 * @param {object} fragment
 * @param {object} [options] `{ personal, now, limit }`
 * @returns {object[]} the same objects, `relevanceScore`/`relevanceReasons`
 *          attached, best first.
 */
export function rankFoodResults(results, fragment, options = {}) {
  const list = Array.isArray(results) ? results : [];
  const scored = list.map((food, index) => {
    const { score, reasons } = scoreFoodResult(food, fragment, options);
    return { food, score, reasons, index };
  });

  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));

  // The pin: whatever they chose for this exact query before goes first. It is
  // their own answer to the question they are asking again, and it should not
  // have to beat the lexical scorer to be offered.
  const pinnedAt = scored.findIndex(({ reasons }) => reasons.chosenBefore);
  if (pinnedAt > 0) {
    const [pinned] = scored.splice(pinnedAt, 1);
    scored.unshift(pinned);
  }

  const ranked = scored.map(({ food, score, reasons }) => ({
    ...food,
    relevanceScore: score,
    relevanceReasons: reasons
  }));

  return options.limit ? ranked.slice(0, options.limit) : ranked;
}

/**
 * Is this result good enough to BE the dish, or should we offer ingredients?
 *
 * Deliberately structural rather than a score threshold. Real catalog names
 * drop words: USDA answers "chocolate chip pancakes" with "Pancakes,
 * chocolate" — plainly the right food, but two query tokens out of three, and
 * a raw score (213) well under any floor calibrated on a full-token match
 * (640+). A points floor would have sent that query off to be decomposed into
 * chocolate chips, which is the exact failure this whole change exists to fix.
 *
 * What actually matters: it names the thing (head noun present), it covers
 * most of what was asked, and it is loggable.
 *
 * @param {object} result   a ranked result, carrying `relevanceReasons`
 * @param {object} fragment the parsed fragment it was ranked against
 */
export function isConfidentMatch(result, fragment) {
  if (!result) return false;
  const reasons = result.relevanceReasons || {};

  // A dish query whose winner never mentions the dish is not an answer.
  if (fragment?.isDish && reasons.missingHeadNoun) return false;

  // Nothing worth logging.
  if (reasons.noCalories) return false;

  // Exact and prefix matches speak for themselves.
  if (reasons.exactName || reasons.prefixName || reasons.allTokens) return true;

  // Otherwise: most of what they typed has to be in the name.
  return (reasons.coverageRatio || 0) >= MIN_CONFIDENT_COVERAGE;
}

export default {
  rankFoodResults,
  scoreFoodResult,
  isConfidentMatch,
  resultKey,
  recencyDecay,
  SOURCE_TRUST,
  WEIGHTS
};
