/**
 * describeAndLogService — a sentence in, log rows out.
 *
 * The whole point is that Chef never searches, never picks and never confirms:
 * he says what he ate and it is written. See DOCS/THE_DESCRIBE_AND_LOG_PLAN.md.
 *
 * Resolution order per dish, cheapest and most trustworthy first:
 *
 *   0. SAVED     — the text names a meal (or a "homemade" food) he saved on
 *                  purpose. Chef, 2026-09-22: "if I have homemade quesadilla
 *                  saved as a meal/food, it should use that before guessing
 *                  at something else." A saved meal logs as its component
 *                  foods, exactly as logging it from the meals screen does.
 *                  Matching is deliberately strict — see savedItemMatcher.
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
import Meal from '../models/Meal.js';
import DailySummary from '../models/DailySummary.js';
import logger from '../config/logger.js';
import aiFoodService from './aiFoodService.js';
import unifiedFoodService from './unifiedFoodService.js';
import { checkEntry } from './foodSanityRails.js';
import { rankFoodResults, isConfidentMatch } from './foodRanker.js';
import { parseMealDescription } from './mealDescriptionParser.js';
import { parseFoodQuery, normalizeQuery, tokenize } from './foodQueryParser.js';
import { matchSavedItem } from './savedItemMatcher.js';

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

/**
 * The caption a log row written from a saved meal carries. Byte-identical to
 * the gateway's `logMeal` (and REST's add-to-log before it) on purpose:
 * FoodLogItem renders `notes` under the food name, so a describe-logged meal
 * reads exactly like one logged from the meals screen.
 */
export const savedMealNote = (mealName) => `Added from meal: ${mealName}`;

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

/**
 * Everything he has saved on purpose that a description could name: his
 * meals, with their foods populated, and his own foods whose names carry a
 * "homemade" qualifier (the only saved foods `savedItemMatcher` trusts — see
 * its header for why the rest stay with `findInHistory`).
 *
 * Loaded once per description, not once per dish. Most-recently-updated first,
 * because that is the tiebreak the matcher applies.
 *
 * A failure here is not fatal: it returns nothing saved and every dish takes
 * the ordinary path. Chef loses the preference for one request; he does not
 * lose the log.
 */
export async function loadSavedItems(userId) {
  const none = { meals: [], foods: [] };
  if (!userId) return none;

  try {
    const [meals, foods] = await Promise.all([
      Meal.find({ user_id: userId, is_deleted: false })
        .populate('food_items.food_item_id')
        .sort({ updated_at: -1 })
        .lean(),
      FoodItem.find({
        user_id: userId,
        is_deleted: false,
        name: /home-?made|house-?made/i
      })
        .sort({ updated_at: -1 })
        .limit(HISTORY_CANDIDATES)
        .lean()
    ]);
    return { meals: meals || [], foods: foods || [] };
  } catch (error) {
    logger.warn({ err: error, userId }, 'Saved meals/foods lookup failed');
    return none;
  }
}

/**
 * A saved meal, resolved into what will be written: one row per component
 * food, each at the meal's servings times the quantity he said. "2 homemade
 * quesadillas" is two of the meal, so every component doubles.
 *
 * A component whose food no longer exists (deleted, or a dangling reference)
 * is carried as `missing` rather than dropped. The gateway's `logMeal` skips
 * those with a bare `continue`; here that would be a silent partial log,
 * which this path promises never to do.
 */
function resolveSavedMeal(entry, meal) {
  const quantity = Number(entry.servings) > 0 ? Number(entry.servings) : 1;
  const components = [];
  const missing = [];

  for (const item of meal.food_items || []) {
    const food = item?.food_item_id;
    // Unpopulated (a bare ObjectId) or null both mean the food is gone.
    if (!food || typeof food !== 'object' || !food._id) {
      missing.push(item);
      continue;
    }
    const perMeal = Number(item.servings) > 0 ? Number(item.servings) : 1;
    components.push({
      foodId: String(food._id),
      name: food.name,
      nutrition: food.nutrition || {},
      serving: food.serving,
      servings: Math.round(perMeal * quantity * 1000) / 1000
    });
  }

  return {
    entry,
    source: 'saved-meal',
    name: meal.name,
    savedMeal: { id: String(meal._id), name: meal.name },
    components,
    missing,
    foodId: null,
    spread: null
  };
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
export async function resolveEntries(entries, { userId, saved } = {}) {
  const resolved = new Array(entries.length).fill(null);
  const needsEstimate = [];
  const savedItems = saved || await loadSavedItems(userId);

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];

    // Before history, because history cannot tell his saved "Homemade
    // Quesadilla" meal from any old row named "Quesadillas": it strips the
    // qualifier that is the whole difference, and it never reads meals.
    const savedMatch = matchSavedItem(entry, savedItems);
    if (savedMatch?.kind === 'meal') {
      resolved[i] = resolveSavedMeal(entry, savedMatch.meal);
      continue;
    }
    if (savedMatch?.kind === 'food') {
      const food = savedMatch.food;
      resolved[i] = {
        entry,
        source: 'saved-food',
        // No `servingsOverride`: unlike a history row, a food he named
        // himself is one unit, so "2 homemade tamales" really is two
        // servings of it. This is the case the matcher's eligibility rule
        // exists to make safe.
        name: food.name,
        nutrition: food.nutrition || {},
        serving: food.serving,
        foodId: String(food._id),
        spread: null
      };
      continue;
    }

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
          // Carried so the one question we are allowed to ask can offer real
          // numbers. "Was it bigger or smaller?" is not answerable; "400 or
          // 1,200?" is one tap.
          lowCalories: dish.lowCalories ?? null,
          highCalories: dish.highCalories ?? null,
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
 * Write a saved meal as its component foods — the same shape the gateway's
 * `logMeal` writes when he logs the meal from the meals screen: one FoodLog
 * per component, pointing at the component's own food row, at its servings,
 * with its own nutrition, captioned "Added from meal: <name>".
 *
 * Differences from `logMeal`, each on purpose:
 *   - the meal type is the one this description resolved (stated, or guessed
 *     from the hour) like every other described entry, not the meal's saved
 *     type — he is telling us when he ate it;
 *   - every component still goes through the rails, so one corrupt saved food
 *     cannot write nonsense just because it arrived inside a meal;
 *   - a component that is gone, rejected, or fails to write is SKIPPED BY
 *     NAME. `logMeal` drops a dangling component with a bare `continue`;
 *     here that would be a partial meal reported as a whole one.
 *
 * Numbers are never re-estimated and no model is asked anything: this is his
 * food, as he saved it.
 */
async function writeSavedMeal(resolution, { userId, date, entryIndex }) {
  const logged = [];
  const skipped = [];
  const mealName = resolution.savedMeal.name;
  const from = (name) => `${name || 'an item'} (from ${mealName})`;

  if (resolution.components.length === 0 && resolution.missing.length === 0) {
    skipped.push({ name: mealName, reason: 'saved-meal-empty', entryIndex });
    return { logged, skipped };
  }

  for (let i = 0; i < resolution.missing.length; i += 1) {
    skipped.push({ name: from(null), reason: 'missing-from-saved-meal', entryIndex });
  }

  for (const component of resolution.components) {
    const rails = checkEntry({
      name: component.name,
      servings: component.servings,
      nutrition: component.nutrition,
      serving: component.serving
    });
    if (rails.severity === 'reject') {
      logger.warn({ name: component.name, meal: mealName, flags: rails.flags }, 'Saved-meal component rejected by sanity rails');
      skipped.push({ name: from(component.name), reason: rails.flags[0] || 'failed-sanity-check', entryIndex });
      continue;
    }

    // His saved row is written as it is. The rails may have a correction to
    // offer, but "correcting" a food he entered by hand would quietly
    // overrule him; a reject is the only thing allowed to stop it.
    const nutrition = component.nutrition;

    try {
      const log = await new FoodLog({
        user_id: userId,
        food_item_id: component.foodId,
        log_date: date,
        meal_type: resolution.entry.mealType,
        servings: component.servings,
        notes: savedMealNote(mealName),
        nutrition
      }).save();

      logged.push({
        logId: String(log._id),
        name: component.name,
        servings: component.servings,
        loggedServings: component.servings,
        mealType: resolution.entry.mealType,
        calories: rails.totals.calories,
        nutrition,
        source: 'saved-meal',
        savedMeal: resolution.savedMeal,
        flags: rails.flags,
        needsJudge: false,
        entryIndex
      });
    } catch (error) {
      logger.error({ err: error, name: component.name, meal: mealName }, 'Failed to write saved-meal component');
      skipped.push({ name: from(component.name), reason: 'write-failed', entryIndex });
    }
  }

  return { logged, skipped };
}

/**
 * Is this estimate's range worth putting in front of a person?
 *
 * Both ends have to be real numbers, the low above zero, the high above the
 * low, and the logged value has to sit between them — otherwise the "range" is
 * the model padding rather than describing its own uncertainty.
 *
 * Models are bad at this. Asked for genuine uncertainty on 2026-09-16,
 * `allam-2-7b` returned 0-1000 for pancakes and 0-2400 for nachos: a lower
 * bound of zero, and an upper that is just twice the estimate. "Smaller, about
 * 0 cal" is not a choice, so an unusable range is treated as no opinion and
 * nothing is asked — the same as when a model declines to give a range at all.
 *
 * The spread must still be wide enough to move the day (plan §3.8).
 */
export function usableRange(resolution, loggedCalories) {
  const low = Number(resolution?.lowCalories);
  const high = Number(resolution?.highCalories);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return false;
  if (low <= 0 || high <= low) return false;
  if (!Number.isFinite(loggedCalories) || loggedCalories < low || loggedCalories > high) return false;
  return (high - low) > QUESTION_SPREAD_CALORIES;
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
    return { logged: [], skipped: [], logIds: [], questions: [], parsed, requested: 0 };
  }

  const resolutions = await resolveEntries(parsed.entries, { userId });

  // `resolveEntries` returns `resolved.filter(Boolean)` — every entry it could
  // not identify is simply absent from that array. An entry reaches that state
  // by missing history, missing the catalog, and then getting an AI estimate
  // that declined, timed out or returned unparseable JSON. `estimateDishes`
  // reports all three as a clean `{ ok: false }` rather than throwing, so this
  // is ordinary traffic, not a rare crash.
  //
  // Those entries used to vanish completely: not logged, not skipped, not
  // counted anywhere, while the route answered 200 `{success: true}`. Describe
  // "chicken sandwich, kombucha, diet coke", have the kombucha estimate time
  // out, and you were told everything worked — on the app's primary logging
  // path. The response carried no original-entry count either, so the frontend
  // could not have detected the loss even in principle.
  //
  // Recovered by difference: each resolution carries its source `entry` by
  // reference, so anything parsed but not resolved is a silent drop. They go
  // into `skipped`, which callers already render, rather than into a new field
  // nothing reads.
  const resolvedEntries = new Set(resolutions.map((r) => r.entry));
  const unresolved = parsed.entries.filter((entry) => !resolvedEntries.has(entry));

  // Every logged and skipped row says which described entry it answers. One
  // entry is usually one row, but a saved meal is one entry and several rows,
  // so `logged.length + skipped.length === requested` stops being the check
  // the moment he names one. The check that survives is per entry: every
  // index from 0 to requested-1 appears on at least one row.
  const indexOf = (entry) => parsed.entries.indexOf(entry);

  const logged = [];
  const skipped = unresolved.map((entry) => ({
    name: entryKey(entry) || entry.description || 'that item',
    reason: 'could-not-identify',
    entryIndex: indexOf(entry)
  }));
  const logIds = [];
  const questions = [];

  for (const resolution of resolutions) {
    if (resolution.source === 'saved-meal') {
      const rows = await writeSavedMeal(resolution, { userId, date, entryIndex: indexOf(resolution.entry) });
      logged.push(...rows.logged);
      skipped.push(...rows.skipped);
      logIds.push(...rows.logged.map((row) => row.logId));
      continue;
    }

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
      skipped.push({
        name: resolution.name,
        reason: rails.flags[0] || 'failed-sanity-check',
        entryIndex: indexOf(resolution.entry)
      });
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
        needsJudge: rails.severity === 'suspect',
        entryIndex: indexOf(resolution.entry)
      });

      // Worth one question only when the answer moves the day AND the range
      // is one a person could actually pick from.
      //
      // Models are bad at this. Asked for genuine uncertainty, `allam-2-7b`
      // returned 0–1000 for pancakes and 0–2400 for nachos on 2026-09-16:
      // a lower bound of zero, and an upper that is just twice the estimate.
      // "Smaller · ~0 cal" is not a choice, so an unusable range is treated as
      // no opinion and nothing is asked — the estimate stands, which is the
      // behaviour when a model declines to express a range at all.
      if (usableRange(resolution, rails.totals.calories)) {
        questions.push({
          logId: String(log._id),
          name: resolution.name,
          spread: resolution.spread,
          low: resolution.lowCalories ?? null,
          high: resolution.highCalories ?? null,
          logged: rails.totals.calories
        });
      }

    } catch (error) {
      logger.error({ err: error, name: resolution.name }, 'Failed to write described log');
      skipped.push({ name: resolution.name, reason: 'write-failed', entryIndex: indexOf(resolution.entry) });
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
    unresolved: unresolved.length,
    sources: [...new Set(logged.map((l) => l.source))]
  }, 'Described meal logged');

  // Detached on purpose: the response returns now, and the judge catches up.
  // Never awaited, and never allowed to reject into the request path.
  if (!options.skipReview) {
    reviewLoggedEntries(logged, { userId, date })
      .catch((error) => logger.warn({ err: error }, 'Background review failed'));
  }

  // `requested` is the count the user actually described. Every entry is now
  // accounted for — each index below `requested` is the `entryIndex` of at
  // least one logged or skipped row — so a caller can assert that rather than
  // trust it. Without a saved meal in the text that is still exactly
  // `logged.length + skipped.length === requested`.
  return { logged, skipped, logIds, questions, parsed, requested: parsed.entries.length };
}

export default {
  logDescription,
  usableRange,
  resolveEntries,
  loadSavedItems,
  reviewLoggedEntries,
  findInHistory,
  detectBrand,
  entryKey,
  QUESTION_SPREAD_CALORIES,
  JUDGE_MATERIAL_RATIO
};
