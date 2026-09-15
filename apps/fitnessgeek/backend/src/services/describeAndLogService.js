/**
 * describeAndLogService — a sentence in, log rows out.
 *
 * The whole point is that Chef never searches, never picks and never confirms:
 * he says what he ate and it is written. See DOCS/THE_DESCRIBE_AND_LOG_PLAN.md.
 *
 * Resolution order per dish, cheapest and most trustworthy first:
 *
 *   1. HISTORY   — he has logged this before. Reuse his own numbers exactly.
 *                  No model call, no latency, no cost, and his log stays
 *                  internally consistent instead of drifting every time a
 *                  model is asked to guess again. Most people rotate about
 *                  thirty meals, so within weeks this is the common path and
 *                  the AI becomes scaffolding.
 *   2. CATALOG   — it names a brand. Published facts beat estimates whenever
 *                  they exist, so this runs the existing search and takes a
 *                  confident match.
 *   3. ESTIMATE  — nobody publishes the nachos at the place he eats. One
 *                  batched model call judges the whole description at once.
 *
 * Then the rails (`foodSanityRails`) catch arithmetic nonsense, and anything
 * that survives is written immediately. Nothing blocks on a second opinion.
 */

import FoodItem from '../models/FoodItem.js';
import FoodLog from '../models/FoodLog.js';
import DailySummary from '../models/DailySummary.js';
import logger from '../config/logger.js';
import aiFoodService from './aiFoodService.js';
import unifiedFoodService from './unifiedFoodService.js';
import { checkEntry } from './foodSanityRails.js';
import { rankFoodResults, isConfidentMatch } from './foodRanker.js';
import { parseMealDescription } from './mealDescriptionParser.js';
import { parseFoodQuery, normalizeQuery, tokenize } from './foodQueryParser.js';

/**
 * How wide the model's own calorie range must be before it is worth asking
 * Chef a question. Restaurant nachos (~1,200) versus a small home plate (~400)
 * moves a day meaningfully; regular versus large fries does not. Absolute, not
 * a percentage, because 20% of a snack is noise and 20% of a feast is not.
 */
const QUESTION_SPREAD_CALORIES = 400;

/**
 * How far the judge must disagree before its number replaces the estimate.
 *
 * Deliberately blunt. Chef's standard is that a nacho plate at 960 or 1,220 is
 * noise at the week level — that is 27% apart and must NOT trigger a rewrite,
 * or the log churns for no benefit. 40% catches the factor-of-two errors that
 * actually matter, and nothing else.
 */
const JUDGE_MATERIAL_RATIO = 0.4;

/** How many of his own foods to consider when looking for a repeat. */
const HISTORY_CANDIDATES = 200;

const tokenKey = (text) => tokenize(text).slice().sort().join(' ');

/**
 * The name a described dish is filed under, and therefore the key his history
 * is matched on. The quantity belongs IN it: "12 nachos with cheese" and
 * "6 nachos with cheese" are different amounts of food and must not collide.
 */
export function entryKey(entry) {
  const servings = Number(entry?.servings) || 1;
  const base = entry?.description || entry?.dish || '';
  return servings > 1 ? `${servings} ${base}` : base;
}

/**
 * Has he logged this dish before? Exact description first, then the same words
 * in a different order, so "nachos with beef and cheese" finds the plate he
 * described as "nachos with cheese and beef" last Tuesday.
 */
export async function findInHistory(userId, description) {
  if (!userId || !description) return null;
  const normalized = normalizeQuery(description);

  try {
    const exact = await FoodItem.findOne({
      user_id: userId,
      is_deleted: false,
      name: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    }).lean();
    if (exact) return { food: exact, match: 'exact' };

    const wanted = tokenKey(normalized);
    if (!wanted) return null;

    const candidates = await FoodItem.find({ user_id: userId, is_deleted: false })
      .sort({ updated_at: -1 })
      .limit(HISTORY_CANDIDATES)
      .lean();

    const hit = candidates.find((food) => tokenKey(food.name) === wanted);
    return hit ? { food: hit, match: 'tokens' } : null;

  } catch (error) {
    logger.warn({ err: error, userId }, 'History lookup failed');
    return null;
  }
}

/** Does this description name a brand? Synchronous — no model call. */
export function detectBrand(description) {
  try {
    const context = aiFoodService.prepareClassificationInput(description);
    return context?.detectedBrands?.length ? context.detectedBrands[0] : null;
  } catch {
    return null;
  }
}

/** A branded description resolves against published facts, not a guess. */
async function findInCatalog(entry, userId) {
  try {
    const results = await unifiedFoodService.search(entry.description, {
      userId,
      limit: 10,
      includeAI: false
    });
    if (!results?.length) return null;

    const [fragment] = parseFoodQuery(entry.dish).fragments;
    if (!fragment) return null;

    const [best] = rankFoodResults(results, fragment, { limit: 1 });
    return best && isConfidentMatch(best, fragment) ? best : null;

  } catch (error) {
    logger.warn({ err: error, dish: entry.dish }, 'Catalog lookup failed');
    return null;
  }
}

/**
 * Work out what each described dish actually was.
 *
 * @returns {Promise<Array<{entry: object, source: string, name: string,
 *          nutrition: object, foodId: string|null, spread: number|null}>>}
 */
export async function resolveEntries(entries, { userId } = {}) {
  const resolved = new Array(entries.length).fill(null);
  const needsEstimate = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];

    const history = await findInHistory(userId, entryKey(entry));
    if (history) {
      resolved[i] = {
        entry,
        source: 'history',
        // Matched on `entryKey`, which carries the quantity — so the stored
        // row IS the full amount already, exactly as the estimate that minted
        // it was. Multiplying by the quantity a second time is the same
        // double-count that turned one plate of nachos into 13,200 calories.
        servingsOverride: 1,
        name: history.food.name,
        nutrition: history.food.nutrition || {},
        serving: history.food.serving,
        foodId: String(history.food._id),
        spread: null
      };
      continue;
    }

    if (detectBrand(entry.description)) {
      const branded = await findInCatalog(entry, userId);
      if (branded) {
        resolved[i] = {
          entry,
          source: 'catalog',
          name: branded.name,
          nutrition: branded.nutrition || {},
          serving: branded.serving,
          foodId: branded.id || branded._id || null,
          spread: null
        };
        continue;
      }
    }

    needsEstimate.push(i);
  }

  if (needsEstimate.length > 0) {
    const estimate = await aiFoodService.estimateDishes(
      needsEstimate.map((i) => entries[i]),
      { userId }
    );

    if (estimate.ok) {
      for (const dish of estimate.dishes) {
        const target = needsEstimate[dish.index];
        if (target == null) continue;
        const spread =
          dish.lowCalories != null && dish.highCalories != null
            ? Math.max(0, dish.highCalories - dish.lowCalories)
            : null;

        resolved[target] = {
          entry: entries[target],
          source: 'estimate',
          // The model was asked for the TOTAL for the described amount, so this
          // is already twelve nachos' worth. Multiplying by twelve again is how
          // one plate became 13,800 calories in testing.
          servingsOverride: 1,
          name: dish.name || entryKey(entries[target]),
          nutrition: dish.nutrition,
          serving: { size: 1, unit: dish.servingDescription || 'serving' },
          foodId: null,
          spread,
          provenance: estimate.provenance
        };
      }
    }
  }

  return resolved.filter(Boolean);
}

/**
 * Second-guess the estimates, after they are already logged.
 *
 * Runs detached from the request: Chef sees his food logged immediately and
 * this catches up behind him. Only entries that were ESTIMATED are reviewed —
 * a history hit is a number he already accepted and a catalog hit is published
 * fact, and spending a model call to doubt either would be worse than useless.
 *
 * When the judge disagrees materially it REWRITES the entry rather than
 * flagging it, and says so in `notes`. A flag would be work handed back to
 * him; his whole requirement is not having to think about this.
 *
 * @param {object[]} logged rows from `logDescription`
 * @param {{userId: string, date: any}} options
 * @returns {Promise<{reviewed: number, corrected: number}>}
 */
export async function reviewLoggedEntries(logged, { userId, date } = {}) {
  const estimates = (logged || []).filter((row) => row.source === 'estimate' && row.logId);
  if (estimates.length === 0) return { reviewed: 0, corrected: 0 };

  const verdicts = await aiFoodService.judgeEntries(
    estimates.map((row) => ({
      name: row.name,
      servings: row.servings,
      calories: row.calories,
      nutrition: row.nutrition || {}
    })),
    { userId }
  );
  if (!verdicts.ok) return { reviewed: 0, corrected: 0 };

  let corrected = 0;

  for (const verdict of verdicts.verdicts) {
    const row = estimates[verdict.index];
    if (!row || verdict.reasonable || !verdict.betterCalories) continue;

    const was = Number(row.calories) || 0;
    if (was <= 0) continue;
    const drift = Math.abs(verdict.betterCalories - was) / was;
    if (drift <= JUDGE_MATERIAL_RATIO) continue;

    try {
      const log = await FoodLog.findOne({ _id: row.logId, user_id: userId });
      if (!log) continue;

      // Scale the macros by the same factor. If the total was twice what it
      // should be, the macros were too — and leaving them would fail the very
      // rails that let this entry through.
      const factor = verdict.betterCalories / was;
      const n = log.nutrition || {};
      log.nutrition = {
        ...n,
        calories_per_serving: Math.round((Number(n.calories_per_serving) || 0) * factor),
        protein_grams: Math.round(((Number(n.protein_grams) || 0) * factor) * 10) / 10,
        carbs_grams: Math.round(((Number(n.carbs_grams) || 0) * factor) * 10) / 10,
        fat_grams: Math.round(((Number(n.fat_grams) || 0) * factor) * 10) / 10
      };
      const note = `Adjusted ${was} → ${verdict.betterCalories} cal on review${verdict.why ? `: ${verdict.why}` : ''}`;
      log.notes = log.notes ? `${log.notes} · ${note}`.slice(0, 500) : note.slice(0, 500);
      await log.save();
      corrected += 1;

      logger.info({
        logId: row.logId, name: row.name, was, now: verdict.betterCalories, why: verdict.why
      }, 'Judge corrected a logged estimate');

    } catch (error) {
      logger.warn({ err: error, logId: row.logId }, 'Could not apply judge correction');
    }
  }

  if (corrected > 0 && date) {
    await DailySummary.updateFromLogs(userId, date);
  }

  return { reviewed: estimates.length, corrected };
}

/** Mint (or reuse) the catalog row this log points at. */
async function ensureFoodItem(resolution, userId) {
  if (resolution.foodId) return resolution.foodId;

  const created = await FoodItem.create({
    name: resolution.name,
    user_id: userId,
    source: 'custom',
    nutrition: resolution.nutrition,
    serving: {
      size: Number(resolution.serving?.size) || 1,
      unit: resolution.serving?.unit || 'serving'
    }
  });
  return String(created._id);
}

/**
 * The whole job: a sentence about food becomes rows in the log.
 *
 * @param {string} text
 * @param {{userId: string, date: string, hour?: number}} options
 */
export async function logDescription(text, { userId, date, hour, ...options } = {}) {
  const parsed = parseMealDescription(text, { hour });
  if (parsed.entries.length === 0) {
    return { logged: [], skipped: [], logIds: [], questions: [], parsed };
  }

  const resolutions = await resolveEntries(parsed.entries, { userId });

  const logged = [];
  const skipped = [];
  const logIds = [];
  const questions = [];

  for (const resolution of resolutions) {
    const servings = resolution.servingsOverride ?? resolution.entry.servings;
    const candidate = {
      name: resolution.name,
      servings,
      unit: resolution.entry.unit,
      nutrition: resolution.nutrition,
      serving: resolution.serving
    };

    const rails = checkEntry(candidate);
    if (rails.severity === 'reject') {
      logger.warn({ name: resolution.name, flags: rails.flags }, 'Entry rejected by sanity rails');
      skipped.push({ name: resolution.name, reason: rails.flags[0] || 'failed-sanity-check' });
      continue;
    }

    const nutrition = rails.corrected ? rails.corrected.nutrition : resolution.nutrition;

    try {
      const foodItemId = await ensureFoodItem({ ...resolution, nutrition }, userId);
      const log = await new FoodLog({
        user_id: userId,
        food_item_id: foodItemId,
        log_date: date,
        meal_type: resolution.entry.mealType,
        servings,
        nutrition
      }).save();

      logIds.push(String(log._id));
      logged.push({
        logId: String(log._id),
        name: resolution.name,
        servings: resolution.entry.servings,
        loggedServings: servings,
        mealType: resolution.entry.mealType,
        calories: rails.totals.calories,
        nutrition,
        source: resolution.source,
        flags: rails.flags,
        needsJudge: rails.severity === 'suspect'
      });

      // Worth one question only when the answer moves the day.
      if (resolution.spread != null && resolution.spread > QUESTION_SPREAD_CALORIES) {
        questions.push({
          logId: String(log._id),
          name: resolution.name,
          spread: resolution.spread
        });
      }

    } catch (error) {
      logger.error({ err: error, name: resolution.name }, 'Failed to write described log');
      skipped.push({ name: resolution.name, reason: 'write-failed' });
    }
  }

  if (logIds.length > 0) {
    await DailySummary.updateFromLogs(userId, date);
  }

  logger.info({
    userId,
    text: parsed.normalized,
    entries: parsed.entries.length,
    logged: logged.length,
    skipped: skipped.length,
    sources: [...new Set(logged.map((l) => l.source))]
  }, 'Described meal logged');

  // Detached on purpose: the response returns now, and the judge catches up.
  // Never awaited, and never allowed to reject into the request path.
  if (!options.skipReview) {
    reviewLoggedEntries(logged, { userId, date })
      .catch((error) => logger.warn({ err: error }, 'Background review failed'));
  }

  return { logged, skipped, logIds, questions, parsed };
}

export default {
  logDescription,
  resolveEntries,
  reviewLoggedEntries,
  findInHistory,
  detectBrand,
  entryKey,
  QUESTION_SPREAD_CALORIES,
  JUDGE_MATERIAL_RATIO
};
