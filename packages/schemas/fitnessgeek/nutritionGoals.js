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
 * The two *instance methods*, `checkGoalsMet` and `getProgress`, moved — and
 * were later deleted (Q39, 2026-09-11): both were caller-less on every side,
 * so the shared module kept them only as a rollback nicety. Their backing
 * exports (`evaluateGoalsMet`, `computeGoalProgress`,
 * `attachNutritionGoalsMethods`) went with them. The shipped ceiling
 * semantics — sugar and sodium read as limits, not targets — is preserved in
 * git history and in this note; reintroducing the arithmetic should re-use
 * that shape rather than re-derive it.
 *
 * The three *statics* — `getActiveGoals`, `createGoals`, `updateGoals` — did
 * NOT move. basegeek's copies open with `requireUser(userId)` (fail-closed
 * ownership) and fitnessgeek's do not, because every fitnessgeek caller is
 * already past auth. Statics do not affect `schema.paths`, so the two writers
 * are free to disagree and neither is blocked on the other.
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
 * Build a fresh `NutritionGoals` schema — index included.
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

  return schema;
}

module.exports = {
  nutritionGoalsDefinition,
  nutritionGoalsOptions,
  createNutritionGoalsSchema,
};
