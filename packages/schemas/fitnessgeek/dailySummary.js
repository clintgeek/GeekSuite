/**
 * fitnessgeek `DailySummary` — the single source of truth for the field set,
 * the unique `(user_id, date)` index, and the recompute that fills it in.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two independent writers point at the same `dailysummaries` collection in the
 * `fitnessgeek` MongoDB database:
 *
 *   1. basegeek's GraphQL gateway — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *      (`dailySummary`, `refreshDailySummary`, and every food-log
 *      create/update/delete/`logMeal` mutation — seven call sites, all of them
 *      on the hot path since `79b1b57`)
 *   2. fitnessgeek's REST backend — src/routes/logRoutes.js and
 *      src/routes/summaryRoutes.js
 *
 * Mongoose runs in strict mode by default: an unknown path in a `$set` is
 * dropped silently, not rejected. This is the pair where that stopped being
 * theoretical. `updateFromLogs` writes the WHOLE `totals` sub-document through
 * `findOneAndUpdate`, and for one day in September 2026 the gateway's copy of
 * the schema was missing `totals.net_carbs_grams` — so every gateway read of a
 * day erased the keto ring's number from the stored document. That is
 * divergence C1 in `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md`; it was fixed in
 * place in `0cecb4a` (PRE-1), before this module existed, and this module is
 * what stops it happening again.
 *
 * The two copies were byte-identical when this module was created (2026-09-05,
 * post-PRE-1) apart from the connection binding and basegeek's `requireUser`
 * guards, so promoting the schema here was a pure refactor: no field added,
 * removed, retyped or re-defaulted, and no index changed.
 *
 * WHAT MOVED, AND WHAT DIDN'T
 * ---------------------------
 * Moved: the fields, the unique compound index, the options — and the
 * recompute, as `updateDailySummaryFromLogs(...)`, with its two pure halves
 * (`summarizeFoodLogs`, `evaluateDailyGoalsMet`) exported by name.
 *
 * `updateFromLogs` is the second carve-out from the plan's "statics stay
 * app-side" rule, after `FoodItem.findOrCreate`, and it earns it the same way:
 * it is not an ownership policy, it has exactly one correct meaning for both
 * writers, and a divergence in it does not throw — it silently writes a
 * different day. It is also the *only* writer of `totals`, `meals` and
 * `goals_met` in the entire suite, so "the two sides compute the same numbers"
 * is not a nice-to-have, it is the collection's contract.
 *
 * Did NOT move:
 *
 *   - **`getOrCreate` and `getSummaryRange`** — ownership-scoped reads on one
 *     side and `requireUser`-guarded on the other, and both are date-normalizing.
 *   - **The date normalization itself, in all three statics.** `toUtcMidnight`
 *     lives in `@geeksuite/utils`, which is ESM-only and therefore
 *     un-`require`-able from this CommonJS package (plan §3, §11). So
 *     `updateDailySummaryFromLogs` takes `startDate` and `endDate` as
 *     **already-normalized** arguments: the wrapper calls `toUtcMidnight` and
 *     hands the result in. Do not add a CJS build to `@geeksuite/utils` for
 *     this, do not pass the function in as a factory parameter, and above all
 *     do not inline an eighth copy of the normalizer.
 *   - **`requireUser`** — basegeek's fail-closed guard, unchanged.
 *
 * The models are parameters for the same reason `findOrCreateFoodItem` takes
 * one: this module registers nothing and knows nothing about connections, and
 * each app resolves `FoodLog` and `UserSettings` on its own connection
 * (`mongoose.model(...)` on one side, `fitnessConn.model(...)` on the other).
 *
 * NESTED SHAPE — OBJECTS, NOT SUB-SCHEMAS
 * ---------------------------------------
 * `totals`, `meals.<type>` and `goals_met` are nested plain **objects**, so
 * mongoose flattens them into dotted paths (`totals.net_carbs_grams`,
 * `meals.breakfast.calories`, …). `describePath()` therefore sees every leaf
 * and its `min: 0` directly, and no separate sub-schema comparison is needed —
 * unlike `Meal.food_items`, which is a real DocumentArray. 32 declared paths
 * (2 + 8 totals + 16 meal-breakdown + 4 goals_met + 2 timestamps).
 *
 * THE MEAL BREAKDOWN'S KEYS ARE `MEAL_TYPES`
 * ------------------------------------------
 * `meals` has one block per meal type, and the recompute buckets logs into it
 * with `meals[log.meal_type]`. Those four keys and `FoodLog.meal_type`'s enum
 * are the same vocabulary — a value legal on `foodlogs` but absent here counts
 * in `totals` and vanishes from the breakdown, silently, because the bucketing
 * is guarded (`if (meals[log.meal_type])`). So the block is built from
 * `MEAL_TYPES` rather than hand-written four times, in both the schema and the
 * accumulator. Key order is the array's order — breakfast, lunch, dinner,
 * snack — which is exactly what both sides shipped; the rollback check
 * confirms the generated definition is path-for-path identical to the
 * hand-written one it replaced.
 *
 * KNOWN QUIRK — THE RECOMPUTE IGNORES THE LOG'S STORED NUTRITION
 * -------------------------------------------------------------
 * `FoodLog.nutrition` exists so a log keeps the numbers it was written with,
 * and `FoodLog.calculatedNutrition` reads it first. `summarizeFoodLogs` does
 * not: it reads `log.food_item_id.nutrition` — the CURRENT catalog row — and
 * skips any log whose food is un-populated or has no nutrition block. So
 * editing a catalog food restates every past day that used it, and a summary
 * recomputed from un-populated logs is all zeros. Both sides shipped this
 * identically; it is not a consolidation hazard and nothing was changed.
 * Recorded in §12 of the plan as a follow-up.
 *
 * KNOWN QUIRK — `goals_met` READS `UserSettings.nutrition_goal`
 * ------------------------------------------------------------
 * NOT the `nutritiongoals` collection, which is a different document with a
 * different field set (`calories`, not `daily_calorie_target`). The plan warns
 * about this trap twice (§4 pair 6, §9); `evaluateDailyGoalsMet` takes the
 * settings sub-document and its field names are that document's. Do not
 * "helpfully" unify them.
 *
 * FOUND BY CONSOLIDATING — THREE OF THE FOUR GOALS CAN NEVER BE MET
 * ----------------------------------------------------------------
 * `UserSettings.nutrition_goal` declares `daily_calorie_target` and **no**
 * `protein_grams`, `carbs_grams` or `fat_grams` (`userSettings.js`, the
 * `nutrition_goal` block — it carries `protein_g_per_lb_goal` and
 * `fat_g_per_lb_goal` instead, which are ratios, not gram targets). So
 * `evaluateDailyGoalsMet` reads `undefined` for three of its four inputs and
 * `goals_met.protein`, `.carbs` and `.fat` are permanently `false` in
 * production — on both sides, since April 2026 at the latest. Not introduced
 * here, identical on both sides, and asserted in
 * `fitnessgeekSchemaParity.test.js` so it is a known property rather than a
 * puzzle. Fixing it means deciding what a macro goal on the settings document
 * is (a target, a ratio, or a read of the `nutritiongoals` collection); that
 * is a product ticket, not a refactor. Plan §12.
 *
 * WHY `mongoose` IS A PARAMETER, AND WHY THIS MODULE IS CJS
 * --------------------------------------------------------
 * Same reasons as `weight.js`, `meal.js` and `foodItem.js`: the consumers own
 * their own mongoose instances (a `Schema` built by instance A fails
 * `instanceof` inside instance B's `Connection.model()`), and a CJS module
 * with a literal `module.exports = { … }` is statically readable by Node's
 * ESM→CJS interop from both of them with no build step.
 */

const { MEAL_TYPES } = require('./meal.js');

/** One macro leaf of `totals`: a non-negative number defaulting to 0. */
const totalField = () => ({ type: Number, default: 0, min: 0 });

/** The four numbers tracked per meal in the `meals` breakdown. */
function mealBreakdownDefinition() {
  return {
    calories: { type: Number, default: 0, min: 0 },
    protein_grams: { type: Number, default: 0, min: 0 },
    carbs_grams: { type: Number, default: 0, min: 0 },
    fat_grams: { type: Number, default: 0, min: 0 }
  };
}

/**
 * The field definitions, as a plain object literal.
 *
 * `totals` carries EIGHT macros. `net_carbs_grams` is the one the gateway lost
 * (C1) — it sits between `fiber_grams` and `sugar_grams`, it is derived
 * (`carbs − fiber`, floored at zero) rather than summed, and the keto ring on
 * `DashboardNew.jsx` is its only consumer. Every leaf here floors at 0, which
 * is what makes the floor in `summarizeFoodLogs` load-bearing rather than
 * decorative: a negative would be a validation error on save.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {Object} a definition object suitable for `new mongoose.Schema(...)`
 */
function dailySummaryDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/dailySummary: pass your own mongoose instance'
    );
  }

  return {
    user_id: {
      type: String,
      required: true,
      index: true
    },
    date: {
      type: Date,
      required: true,
      index: true
    },
    totals: {
      calories: totalField(),
      protein_grams: totalField(),
      carbs_grams: totalField(),
      fat_grams: totalField(),
      fiber_grams: totalField(),
      net_carbs_grams: totalField(),
      sugar_grams: totalField(),
      sodium_mg: totalField()
    },
    // One block per meal type, in MEAL_TYPES order — see the header.
    meals: Object.fromEntries(MEAL_TYPES.map((type) => [type, mealBreakdownDefinition()])),
    goals_met: {
      calories: { type: Boolean, default: false },
      protein: { type: Boolean, default: false },
      carbs: { type: Boolean, default: false },
      fat: { type: Boolean, default: false }
    }
  };
}

const dailySummaryOptions = {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
};

/** A fresh zeroed `totals` accumulator, in the shipped key order. */
function emptyDailyTotals() {
  return {
    calories: 0,
    protein_grams: 0,
    carbs_grams: 0,
    fat_grams: 0,
    fiber_grams: 0,
    net_carbs_grams: 0,
    sugar_grams: 0,
    sodium_mg: 0
  };
}

/** A fresh zeroed `meals` accumulator — one block per meal type. */
function emptyMealBreakdown() {
  return Object.fromEntries(
    MEAL_TYPES.map((type) => [
      type,
      { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 }
    ])
  );
}

/**
 * Recompute a day's `totals` and per-meal `meals` blocks from its food logs.
 *
 * This is the arithmetic both writers must agree on, lifted out so it can be
 * asserted without a database (the `applyLoginToStreak` /
 * `foodItemDedupeFilters` pattern).
 *
 * Behaviours that are shipped and deliberate, on both sides:
 *
 *   - **The populated catalog row is the source, not `log.nutrition`.** See the
 *     header. A log whose `food_item_id` was not populated, or whose food has
 *     no `nutrition` block, contributes NOTHING — it is skipped whole, not
 *     counted as zero-with-a-multiplier.
 *   - **`servings || 1`**, so a missing or zero serving count means one.
 *   - **`net_carbs_grams` is derived per log and floored per log**:
 *     `max(0, (carbs − fiber) × servings)`. Flooring per log rather than on the
 *     day's sum means a single high-fiber food cannot subtract net carbs from
 *     the rest of the day — and it is what keeps the value inside the schema's
 *     `min: 0`.
 *   - **The meal breakdown is guarded** (`if (meals[log.meal_type])`), so an
 *     unrecognised meal type lands in `totals` and nowhere else. That guard is
 *     why `FoodLog`'s enum and `MEAL_TYPES` have to stay one list.
 *   - **The breakdown tracks four macros, not eight** — no fiber, no net carbs,
 *     no sugar, no sodium per meal.
 *
 * @param {Array} logs - food logs, `food_item_id` POPULATED.
 * @returns {{totals: Object, meals: Object}}
 */
function summarizeFoodLogs(logs) {
  const totals = emptyDailyTotals();
  const meals = emptyMealBreakdown();

  (logs || []).forEach(log => {
    const food = log.food_item_id;
    const multiplier = log.servings || 1;

    // Skip if food or nutrition is missing
    if (!food || !food.nutrition) {
      return;
    }

    const n = food.nutrition;

    // Add to totals (with null safety)
    totals.calories += ((n.calories_per_serving || 0) * multiplier);
    totals.protein_grams += ((n.protein_grams || 0) * multiplier);
    totals.carbs_grams += ((n.carbs_grams || 0) * multiplier);
    totals.fat_grams += ((n.fat_grams || 0) * multiplier);
    totals.fiber_grams += ((n.fiber_grams || 0) * multiplier);
    totals.net_carbs_grams += Math.max(0, ((n.carbs_grams || 0) - (n.fiber_grams || 0)) * multiplier);
    totals.sugar_grams += ((n.sugar_grams || 0) * multiplier);
    totals.sodium_mg += ((n.sodium_mg || 0) * multiplier);

    // Add to meal breakdown
    if (meals[log.meal_type]) {
      meals[log.meal_type].calories += ((n.calories_per_serving || 0) * multiplier);
      meals[log.meal_type].protein_grams += ((n.protein_grams || 0) * multiplier);
      meals[log.meal_type].carbs_grams += ((n.carbs_grams || 0) * multiplier);
      meals[log.meal_type].fat_grams += ((n.fat_grams || 0) * multiplier);
    }
  });

  return { totals, meals };
}

/**
 * Decide which of the four goals the day met.
 *
 * `goals` is **`UserSettings.nutrition_goal`**, not a `nutritiongoals`
 * document — note `daily_calorie_target` rather than `calories`. See the
 * header.
 *
 * Two shipped behaviours worth naming, because both look like bugs and neither
 * was changed here:
 *
 *   - **An unset or zero goal reads as NOT met**, never as trivially met —
 *     the `goal ? … : false` shape.
 *   - **Every one of the four is a floor** (`actual >= goal`), including
 *     `carbs` and `fat`. A keto user under their carb ceiling therefore reads
 *     as *not meeting* the carb goal. Whether `carbs`/`fat` should be ceilings
 *     is a product question, not a refactor — the deleted
 *     `NutritionGoals.checkGoalsMet` made the opposite call for sugar/sodium
 *     (Q39, removed 2026-09-11; its ceiling shape survives in git history).
 *
 * @param {Object} totals - the output of `summarizeFoodLogs`.
 * @param {Object|null} goals - `UserSettings.nutrition_goal`, or null.
 * @returns {{calories: boolean, protein: boolean, carbs: boolean, fat: boolean}}
 */
function evaluateDailyGoalsMet(totals, goals) {
  return {
    calories: goals && goals.daily_calorie_target ? totals.calories >= goals.daily_calorie_target : false,
    protein: goals && goals.protein_grams ? totals.protein_grams >= goals.protein_grams : false,
    carbs: goals && goals.carbs_grams ? totals.carbs_grams >= goals.carbs_grams : false,
    fat: goals && goals.fat_grams ? totals.fat_grams >= goals.fat_grams : false
  };
}

/**
 * Recompute and persist one user-day.
 *
 * The one implementation of the write both apps make. It reads the day's logs,
 * sums them, reads the user's settings for the goal comparison, and upserts
 * the whole `totals` / `meals` / `goals_met` triple through
 * `findOneAndUpdate`. That wholesale write is exactly why the field set has to
 * be shared: a path the writing side does not declare is dropped in silence,
 * and the stored value is gone, not stale.
 *
 * **`startDate` and `endDate` must already be normalized.** This package is
 * CommonJS and `@geeksuite/utils` is ESM-only, so `toUtcMidnight` cannot be
 * called from here; each app's static calls it and passes the results in. The
 * `date` written on the document is `startDate` — so whatever the caller
 * normalized to is the calendar day this row claims to be.
 *
 * Nothing here is ownership-scoped: `userId` is taken as given. basegeek's
 * static calls `requireUser` before delegating; fitnessgeek's callers are all
 * post-auth.
 *
 * @param {Object} args
 * @param {import('mongoose').Model} args.SummaryModel - the caller's compiled
 *   DailySummary model (`this`, from the static).
 * @param {import('mongoose').Model} args.FoodLogModel - the FoodLog model on
 *   the same connection.
 * @param {import('mongoose').Model} args.UserSettingsModel - the UserSettings
 *   model on the same connection.
 * @param {string} args.userId
 * @param {Date} args.startDate - UTC midnight of the day.
 * @param {Date} args.endDate - the last millisecond of the same day.
 * @returns {Promise<import('mongoose').Document>} the upserted summary.
 */
async function updateDailySummaryFromLogs({
  SummaryModel,
  FoodLogModel,
  UserSettingsModel,
  userId,
  startDate,
  endDate,
}) {
  if (!SummaryModel || typeof SummaryModel.findOneAndUpdate !== 'function') {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/dailySummary: updateDailySummaryFromLogs needs a compiled DailySummary model'
    );
  }
  if (!FoodLogModel || typeof FoodLogModel.find !== 'function') {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/dailySummary: updateDailySummaryFromLogs needs a compiled FoodLog model'
    );
  }

  // Get all logs for the date
  const logs = await FoodLogModel.find({
    user_id: userId,
    log_date: { $gte: startDate, $lte: endDate }
  }).populate('food_item_id');

  // Calculate totals
  const { totals, meals } = summarizeFoodLogs(logs);

  // Get user's goals
  const userSettings = await UserSettingsModel.findOne({ user_id: userId });
  const goals = userSettings?.nutrition_goal || null;

  // Check if goals are met
  const goals_met = evaluateDailyGoalsMet(totals, goals);

  // Update or create daily summary
  const summary = await SummaryModel.findOneAndUpdate(
    { user_id: userId, date: startDate },
    {
      totals,
      meals,
      goals_met,
      updated_at: new Date()
    },
    { upsert: true, new: true }
  );

  return summary;
}

/**
 * Build a fresh `DailySummary` schema.
 *
 * Three indexes: two path-level (`user_id`, `date`) and the compound
 * `{ user_id: 1, date: 1 }`, which is **unique** — one summary row per user
 * per day, which is what makes `updateFromLogs`'s upsert safe under
 * concurrency. That is the second `unique` flag in this directory after
 * `FoodItem.barcode`, and the same rule applies: consolidating changed no
 * index, so there is nothing to rebuild today, but if a `unique` flag is ever
 * *changed* here both processes must be redeployed together — whichever
 * reaches `syncIndexes` first would try to build an index the other is still
 * writing against. In this suite that happens by construction (one push to
 * `main` rebuilds the fleet), but say so out loud in any commit that moves it.
 *
 * Statics are deliberately NOT attached here — `updateFromLogs` delegates to
 * `updateDailySummaryFromLogs` from each app's own model file, and
 * `getOrCreate` / `getSummaryRange` stay app-side. See the header.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {import('mongoose').Schema}
 */
function createDailySummarySchema(mongoose) {
  const schema = new mongoose.Schema(dailySummaryDefinition(mongoose), dailySummaryOptions);

  // Compound index for user and date
  schema.index({ user_id: 1, date: 1 }, { unique: true });

  return schema;
}

module.exports = {
  MEAL_TYPES,
  emptyDailyTotals,
  emptyMealBreakdown,
  mealBreakdownDefinition,
  summarizeFoodLogs,
  evaluateDailyGoalsMet,
  updateDailySummaryFromLogs,
  dailySummaryDefinition,
  dailySummaryOptions,
  createDailySummarySchema,
};
