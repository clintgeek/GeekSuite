/**
 * fitnessgeek `Weight` — the single source of truth for the field set.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two independent writers persist this document into the same `weights`
 * collection in the `fitnessgeek` MongoDB database:
 *
 *   1. fitnessgeek's REST backend — apps/fitnessgeek/backend/src/controllers/weightController.js
 *      (plus services/foodReportService.js, services/aiInsightsService.js and
 *      the standalone scripts/importWeight.js, which is neither app's server)
 *   2. basegeek's GraphQL gateway — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *
 * They used to declare the schema separately. Mongoose runs in strict mode by
 * default, which silently DROPS unknown paths from a `$set` instead of
 * erroring — so a field present in one copy and absent from the other is
 * accepted by the API, logged as a success, and never written. That is how
 * `nutrition_goal.keto` evaporated from `UserSettings` in April 2026; see
 * `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md` for the full audit.
 *
 * The two copies were byte-identical when this module was created (2026-09-05)
 * apart from the connection binding, so promoting them here was a pure
 * refactor: no field added, removed, retyped or re-defaulted, and no index
 * changed. The tripwire tests in both suites fail if either model stops
 * consuming this definition.
 *
 * NOTE — `userId`, not `user_id`. `Weight` and `BloodPressure` are the only
 * two models in the fitnessgeek set using the camelCase owner field. That is a
 * pre-existing inconsistency in the collections themselves and normalizing it
 * would be a data migration wearing a refactor's clothes. Left alone
 * deliberately.
 *
 * WHY `mongoose` IS A PARAMETER
 * -----------------------------
 * The two consumers are separate workspace packages with their own mongoose
 * dependency ranges. They resolve to one physical install today, but a version
 * bump on either side would split them — and a `Schema` built by mongoose
 * instance A blows up `instanceof` checks inside instance B's
 * `Connection.model()`. Taking mongoose from the caller makes that impossible
 * and keeps mongoose out of this package's own dependency list.
 *
 * This module is CommonJS on purpose: no build step, `require`-able and
 * `import`-able by either consumer, matching the precedent set by
 * `@geeksuite/crypto-vault`. Both consumers are ESM and pick it up through
 * Node's ESM→CJS interop — fitnessgeek via a named import, basegeek via the
 * default export (see `createWeightSchema` below).
 */

/**
 * The numeric bounds, in one place, shared by the schema and by fitnessgeek's
 * zod request validator. Frozen so a consumer cannot mutate the contract.
 *
 * WHY THESE ARE EXPORTED
 * ----------------------
 * `apps/fitnessgeek/backend/src/validation/schemas/weight.js` is a zod layer
 * in front of the REST controller. Its header says *"Mirrors the shared schema
 * packages/schemas/fitnessgeek/weight.js (`min: 0, max: 1000`)"* and then
 * writes `.max(1000)` by hand — a hand-synced copy of the same number in a
 * different language, which is the drift mode consolidation exists to end.
 * `medication.js` and `bloodPressure.js` both export their bounds and are
 * imported by their validators; `weight` was the one member of the set that
 * could still drift (BURN_REVIEW 2026-09-05, note (r)).
 *
 * The zod layer keeps a *positive* floor rather than `min: 0` — deliberately,
 * and documented at that call site — so only the ceiling and the notes length
 * are shared. `weightBounds.weight_value.min` is the schema's floor and is
 * exported for completeness, not as an instruction to the validator.
 */
const weightBounds = Object.freeze({
  weight_value: Object.freeze({ min: 0, max: 1000 }),
  notes: Object.freeze({ maxlength: 500 }),
});

/**
 * The field definitions, as a plain object literal.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {Object} a definition object suitable for `new mongoose.Schema(...)`
 */
function weightDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/weight: pass your own mongoose instance'
    );
  }

  return {
    userId: {
      type: String,
      required: true
    },
    weight_value: {
      type: Number,
      required: true,
      min: weightBounds.weight_value.min,
      max: weightBounds.weight_value.max
    },
    log_date: {
      type: Date,
      required: true,
      default: Date.now
    },
    notes: {
      type: String,
      maxlength: weightBounds.notes.maxlength,
      default: ''
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    updated_at: {
      type: Date,
      default: Date.now
    }
  };
}

const weightOptions = {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
};

/**
 * Build a fresh `Weight` schema — indexes, virtuals and serialization
 * settings included. They are part of the contract: an index divergence means
 * one process creating an index the other's queries depend on, and a virtual
 * that exists on one side only changes what the API returns.
 *
 * Statics are deliberately NOT attached here. Neither side has any today, and
 * the policy (see `userSettings.js`) is that they stay app-side: the gateway
 * enforces caller ownership, fitnessgeek's backend has already authenticated,
 * and statics do not affect `schema.paths` so they cannot cause the
 * strict-mode data loss this module exists to prevent.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {import('mongoose').Schema}
 */
function createWeightSchema(mongoose) {
  const schema = new mongoose.Schema(weightDefinition(mongoose), weightOptions);

  // Compound index for efficient queries.
  schema.index({ userId: 1, log_date: -1 });

  // Virtual for formatted date.
  schema.virtual('formatted_date').get(function formattedDate() {
    return this.log_date.toISOString().split('T')[0];
  });

  // Ensure virtuals are serialized.
  schema.set('toJSON', { virtuals: true });
  schema.set('toObject', { virtuals: true });

  return schema;
}

module.exports = {
  weightBounds,
  weightDefinition,
  weightOptions,
  createWeightSchema,
};
