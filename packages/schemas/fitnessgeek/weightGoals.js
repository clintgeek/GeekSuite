/**
 * fitnessgeek `WeightGoals` — the single source of truth for the field set.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two independent writers point at the same `weightgoals` collection in the
 * `fitnessgeek` MongoDB database:
 *
 *   1. basegeek's GraphQL gateway — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *      (the only *writer*)
 *   2. fitnessgeek's REST backend — apps/fitnessgeek/backend/src/services/aiInsightsService.js
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
 * NOT THE SAME THING AS `UserSettings.weight_goal`
 * ------------------------------------------------
 * There are two places in fitnessgeek that describe a weight goal, and they
 * are different documents in different collections:
 *
 *   - THIS one, the `weightgoals` collection, with `startWeight`,
 *     `targetWeight`, `startDate`, `goalDate`, `is_active` and a
 *     deactivate-then-create history model
 *   - `UserSettings.weight_goal`, a nested sub-document on the `usersettings`
 *     collection, validated by
 *     `apps/fitnessgeek/backend/src/validation/schemas/settings.js` (its
 *     `startWeight`/`targetWeight` carry a 0–2000 bound this schema does not
 *     have, and it has `enabled`, `ratePerWeek`, `unit` and `lastRecalculated`
 *     that this one does not)
 *
 * `routes/goalRoutes.js` reads both and merges them. They look near enough
 * alike to invite a "helpful" unification; do not attempt one here. Nothing in
 * `settings.js` was rewired to import from this module, deliberately — it is
 * validating the *other* collection, and pointing it at these numbers would
 * silently change what a settings write accepts.
 *
 * NOTE — MIXED FIELD NAMING. `user_id` and `is_active` are snake_case while
 * `startWeight`, `targetWeight`, `startDate` and `goalDate` are camelCase.
 * That is a pre-existing inconsistency in the collection itself and
 * normalizing it would be a data migration wearing a refactor's clothes. Left
 * alone deliberately, same as `Weight`'s `userId`.
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
function weightGoalsDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/weightGoals: pass your own mongoose instance'
    );
  }

  return {
    user_id: {
      type: String,
      required: true,
      index: true
    },
    startWeight: {
      type: Number,
      required: true,
      min: 0
    },
    targetWeight: {
      type: Number,
      required: true,
      min: 0
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    goalDate: {
      type: Date
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true
    }
  };
}

const weightGoalsOptions = {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
};

/**
 * Build a fresh `WeightGoals` schema — indexes included. They are part of the
 * contract: an index divergence means one process creating an index the
 * other's queries depend on.
 *
 * Statics are deliberately NOT attached here. All three
 * (`getActiveWeightGoals`, `createWeightGoals`, `updateWeightGoals`) exist on
 * both sides and differ only in that basegeek's open with `requireUser(userId)`
 * — its fail-closed ownership posture — while fitnessgeek's callers are
 * already past auth. Statics do not affect `schema.paths`, so the two writers
 * are free to disagree about them and neither is blocked on the other. Each
 * app keeps its own copies in its own model file.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {import('mongoose').Schema}
 */
function createWeightGoalsSchema(mongoose) {
  const schema = new mongoose.Schema(weightGoalsDefinition(mongoose), weightGoalsOptions);

  // Compound index for user and active status
  schema.index({ user_id: 1, is_active: 1 });

  return schema;
}

module.exports = {
  weightGoalsDefinition,
  weightGoalsOptions,
  createWeightGoalsSchema,
};
