/**
 * fitnessgeek `NutritionGoals` — the single source of truth for the field set
 * and for the goal arithmetic.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two independent writers point at the same `nutritiongoals` collection in the
 * `fitnessgeek` MongoDB database:
 *
 *   1. basegeek's GraphQL gateway — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *      (the only *writer*: `setNutritionGoals` → `createGoals`)
 *   2. fitnessgeek's REST backend — src/routes/aiCoachRoutes.js,
 *      src/services/foodReportService.js and src/services/aiInsightsService.js
 *      (read-only today, but it declares the whole schema, so a drift there is
 *      still a drift)
 *
 * Mongoose runs in strict mode by default: an unknown path in a `$set` is
 * dropped silently, not rejected. Two hand-synced copies of a schema is
 * therefore a data-loss hazard, not a style complaint — see
 * `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md`.
 *
 * The two copies were byte-identical when this module was created (2026-09-05)
 * apart from the connection binding and basegeek's `requireUser` guards, so
 * promoting them here was a pure refactor: no field added, removed, retyped or
 * re-defaulted, and no index changed.
 *
 * NOT THE SAME THING AS `UserSettings.nutrition_goal`
 * ---------------------------------------------------
 * There are two places in fitnessgeek that describe a nutrition goal, and they
 * are different documents in different collections:
 *
 *   - THIS one, the `nutritiongoals` collection: seven macro targets
 *     (`calories`, `protein_grams`, `carbs_grams`, `fat_grams`, `fiber_grams`,
 *     `sugar_grams`, `sodium_mg`), a validity window and a
 *     deactivate-then-create history model
 *   - `UserSettings.nutrition_goal`, a nested sub-document on the
 *     `usersettings` collection, validated by
 *     `apps/fitnessgeek/backend/src/validation/schemas/settings.js:86-115`. It
 *     is a *planning* document — `plan_type`, `calorie_target_mode`,
 *     `weekly_schedule`, `bmr`, `tdee`, a `keto` block — and shares not one
 *     field name with this schema
 *
 * `DailySummary.updateFromLogs` reads the **settings** one, not this one. The
 * two look near enough alike by name to invite a "helpful" unification; do not
 * attempt one here. Nothing in `settings.js` was rewired to import from this
 * module — same call as `WeightGoals` vs `UserSettings.weight_goal`, and for
 * the same reason.
 *
 * WHAT MOVED, AND WHAT DIDN'T
 * ---------------------------
 * The two *instance methods*, `checkGoalsMet` and `getProgress`, moved. They
 * are byte-identical on both sides and they read seven declared paths each, so
 * a divergence would not throw — it would quietly report a different answer to
 * each caller about whether a user hit their macros. Both are caller-less
 * today; they were promoted rather than deleted so the shared definition stays
 * byte-equivalent to what is deployed, which is what the rollback claim rests
 * on. Deleting them is a separate, deliberate ticket.
 *
 * The three *statics* — `getActiveGoals`, `createGoals`, `updateGoals` — did
 * NOT move. basegeek's copies open with `requireUser(userId)` (fail-closed
 * ownership) and fitnessgeek's do not, because every fitnessgeek caller is
 * already past auth. Statics do not affect `schema.paths`, so the two writers
 * are free to disagree and neither is blocked on the other.
 *
 * WHY THE ARITHMETIC IS EXPORTED
 * ------------------------------
 * `evaluateGoalsMet` and `computeGoalProgress` are the method bodies with
 * `this` taken out: they take the goal document (or any object carrying the
 * same seven paths) as their first argument, so fitnessgeek's hermetic suite —
 * no Mongo, no Redis, no network — can assert the sugar/sodium inversion and
 * the 100 % clamp directly. Same reason `loginStreak.js` exports
 * `applyLoginToStreak` and `bloodPressure.js` exports `classifyBloodPressure`:
 * a behaviour assertion needs something to call.
 *
 * WHY `mongoose` IS A PARAMETER, AND WHY THIS MODULE IS CJS
 * --------------------------------------------------------
 * Same reasons as `weight.js`, `bloodPressure.js` and `userSettings.js`: the
 * consumers own their own mongoose instances (a `Schema` built by instance A
 * fails `instanceof` inside instance B's `Connection.model()`), and a CJS
 * module with a literal `module.exports = { … }` is statically readable by
 * Node's ESM→CJS interop from both of them with no build step.
 */

/**
 * The field definitions, as a plain object literal.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {Object} a definition object suitable for `new mongoose.Schema(...)`
 */
function nutritionGoalsDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/nutritionGoals: pass your own mongoose instance'
    );
  }

  return {
    user_id: {
      type: String,
      required: true,
      index: true
    },
    calories: {
      type: Number,
      min: 0,
      max: 10000
    },
    protein_grams: {
      type: Number,
      min: 0,
      max: 1000
    },
    carbs_grams: {
      type: Number,
      min: 0,
      max: 2000
    },
    fat_grams: {
      type: Number,
      min: 0,
      max: 500
    },
    fiber_grams: {
      type: Number,
      min: 0,
      max: 200
    },
    sugar_grams: {
      type: Number,
      min: 0,
      max: 500
    },
    sodium_mg: {
      type: Number,
      min: 0,
      max: 10000
    },
    start_date: {
      type: Date,
      default: Date.now
    },
    end_date: {
      type: Date
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true
    }
  };
}

const nutritionGoalsOptions = {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
};

/**
 * Did the day's totals meet each goal?
 *
 * An unset (or zero) goal reads as `false` for that macro rather than
 * `true` — the shipped behaviour of `this.calories ? … : false` on both sides.
 * Do not "fix" that into a null check without a ticket: the dashboards read
 * these booleans.
 *
 * @param {Object} goals - a `NutritionGoals` document, or any object carrying
 *   the same seven target paths.
 * @param {Object} actualTotals - the day's totals, keyed as the schema is
 *   (`calories`, `protein_grams`, …).
 * @returns {Object} one boolean per macro, keyed short (`protein`, not
 *   `protein_grams`) — the shipped key set, which is on the wire.
 */
function evaluateGoalsMet(goals, actualTotals) {
  return {
    calories: goals.calories ? actualTotals.calories >= goals.calories : false,
    protein: goals.protein_grams ? actualTotals.protein_grams >= goals.protein_grams : false,
    carbs: goals.carbs_grams ? actualTotals.carbs_grams >= goals.carbs_grams : false,
    fat: goals.fat_grams ? actualTotals.fat_grams >= goals.fat_grams : false,
    fiber: goals.fiber_grams ? actualTotals.fiber_grams >= goals.fiber_grams : false,
    sugar: goals.sugar_grams ? actualTotals.sugar_grams <= goals.sugar_grams : false, // Sugar is a limit
    sodium: goals.sodium_mg ? actualTotals.sodium_mg <= goals.sodium_mg : false // Sodium is a limit
  };
}

/**
 * Progress towards each goal, as a percentage clamped at 100.
 *
 * Note the asymmetry with `evaluateGoalsMet`: this one treats sugar and sodium
 * as targets like the rest (consumed ÷ goal), so a day *under* the sodium
 * limit reads as low progress rather than good compliance. That is what both
 * shipped copies do and it moved verbatim; it is a product question, not a
 * refactor.
 *
 * An unset (or zero) goal reads as `0`.
 *
 * @param {Object} goals - as above.
 * @param {Object} actualTotals - as above.
 * @returns {Object} one number per macro, same short keys.
 */
function computeGoalProgress(goals, actualTotals) {
  return {
    calories: goals.calories ? Math.min((actualTotals.calories / goals.calories) * 100, 100) : 0,
    protein: goals.protein_grams ? Math.min((actualTotals.protein_grams / goals.protein_grams) * 100, 100) : 0,
    carbs: goals.carbs_grams ? Math.min((actualTotals.carbs_grams / goals.carbs_grams) * 100, 100) : 0,
    fat: goals.fat_grams ? Math.min((actualTotals.fat_grams / goals.fat_grams) * 100, 100) : 0,
    fiber: goals.fiber_grams ? Math.min((actualTotals.fiber_grams / goals.fiber_grams) * 100, 100) : 0,
    sugar: goals.sugar_grams ? Math.min((actualTotals.sugar_grams / goals.sugar_grams) * 100, 100) : 0,
    sodium: goals.sodium_mg ? Math.min((actualTotals.sodium_mg / goals.sodium_mg) * 100, 100) : 0
  };
}

/**
 * Attach the shared instance methods. Split out so a consumer that builds the
 * schema by hand (a migration script, say) can still get them.
 *
 * @param {import('mongoose').Schema} schema
 */
function attachNutritionGoalsMethods(schema) {
  // Method to check if goals are met
  schema.methods.checkGoalsMet = function checkGoalsMet(actualTotals) {
    return evaluateGoalsMet(this, actualTotals);
  };

  // Method to get progress percentages
  schema.methods.getProgress = function getProgress(actualTotals) {
    return computeGoalProgress(this, actualTotals);
  };
}

/**
 * Build a fresh `NutritionGoals` schema — index and instance methods included.
 * The index is part of the contract: an index divergence means one process
 * creating an index the other's queries depend on.
 *
 * Statics are deliberately NOT attached here. All three (`getActiveGoals`,
 * `createGoals`, `updateGoals`) exist on both sides and differ only in that
 * basegeek's open with `requireUser(userId)`. Each app keeps its own copies in
 * its own model file.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {import('mongoose').Schema}
 */
function createNutritionGoalsSchema(mongoose) {
  const schema = new mongoose.Schema(nutritionGoalsDefinition(mongoose), nutritionGoalsOptions);

  // Compound index for user and active status
  schema.index({ user_id: 1, is_active: 1 });

  attachNutritionGoalsMethods(schema);

  return schema;
}

module.exports = {
  evaluateGoalsMet,
  computeGoalProgress,
  attachNutritionGoalsMethods,
  nutritionGoalsDefinition,
  nutritionGoalsOptions,
  createNutritionGoalsSchema,
};
