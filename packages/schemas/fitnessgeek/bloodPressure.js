/**
 * fitnessgeek `BloodPressure` — the single source of truth for the field set,
 * the numeric bounds, and the BP classification.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two independent writers persist this document into the same
 * `bloodpressures` collection in the `fitnessgeek` MongoDB database:
 *
 *   1. fitnessgeek's REST backend — apps/fitnessgeek/backend/src/controllers/bloodPressureController.js
 *      (plus services/aiInsightsService.js and scripts/importBloodPressureSimple.js)
 *   2. basegeek's GraphQL gateway — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *
 * Mongoose runs in strict mode by default: an unknown path in a `$set` is
 * dropped silently, not rejected. Two hand-synced copies of a schema is
 * therefore a data-loss hazard, not a style complaint — see
 * `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md` and the April 2026 keto incident
 * in `apps/fitnessgeek/DOCS/USER_SETTINGS_SCHEMA.md`.
 *
 * The two copies were byte-identical when this module was created (2026-09-05)
 * apart from the connection binding, so promoting them here was a pure
 * refactor.
 *
 * WHY THE BOUNDS ARE EXPORTED
 * ---------------------------
 * `apps/fitnessgeek/backend/src/validation/schemas/bloodPressure.js` is a zod
 * layer in front of the REST controller whose header used to read "Mirrors
 * models/BloodPressure.js bounds exactly" — i.e. a third hand-synced copy of
 * the same four numbers, in a different language. It now imports
 * `bloodPressureBounds` from here, so the request validator and the schema
 * cannot disagree about what a legal systolic reading is.
 *
 * WHY THE CLASSIFIER IS A NAMED FUNCTION
 * --------------------------------------
 * The `status` virtual has real logic in it, not just a field read, and it is
 * serialized into every API response on both sides (`toJSON: { virtuals: true }`).
 * Exporting `classifyBloodPressure` lets the tripwire tests assert the
 * virtual's *behaviour* at each threshold rather than merely observing that a
 * virtual by that name exists.
 *
 * NOTE — the virtual is `status`, not `bpCategory`. The consolidation plan
 * calls it `bpCategory`; the shipped name on both sides is `status` and it is
 * on the wire. Renaming it would be a behaviour change wearing a refactor's
 * clothes, so the shipped name is what moved.
 *
 * NOTE — `userId`, not `user_id`. Same pre-existing inconsistency as `Weight`;
 * see that module's header. Left alone deliberately.
 *
 * WHY `mongoose` IS A PARAMETER, AND WHY THIS MODULE IS CJS
 * --------------------------------------------------------
 * Same reasons as `weight.js` and `userSettings.js`: the consumers own their
 * own mongoose instances, and a CJS module with a literal
 * `module.exports = { … }` is statically readable by Node's ESM→CJS interop
 * from both of them with no build step.
 */

/**
 * The numeric bounds, in one place, shared by the schema and by fitnessgeek's
 * zod request validator. Frozen so a consumer cannot mutate the contract.
 */
const bloodPressureBounds = Object.freeze({
  systolic: Object.freeze({ min: 70, max: 200 }),
  diastolic: Object.freeze({ min: 40, max: 130 }),
  pulse: Object.freeze({ min: 40, max: 200 }),
  notes: Object.freeze({ maxlength: 500 }),
});

/**
 * The BP category shown to the user, from a systolic/diastolic pair.
 *
 * Ladder semantics: the FIRST matching band wins, and every band requires
 * BOTH numbers to be under its ceiling — so a normal diastolic with a stage-2
 * systolic still reads as the worse of the two. Preserved verbatim from the
 * two shipped copies; do not "simplify" it into independent comparisons.
 *
 * @param {number} systolic
 * @param {number} diastolic
 * @returns {'Normal'|'Elevated'|'High Normal'|'Stage 1'|'Stage 2'|'Crisis'}
 */
function classifyBloodPressure(systolic, diastolic) {
  const sys = systolic;
  const dia = diastolic;

  if (sys < 120 && dia < 80) return 'Normal';
  if (sys < 130 && dia < 80) return 'Elevated';
  if (sys < 140 && dia < 90) return 'High Normal';
  if (sys < 160 && dia < 100) return 'Stage 1';
  if (sys < 180 && dia < 110) return 'Stage 2';
  return 'Crisis';
}

/**
 * The field definitions, as a plain object literal.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {Object} a definition object suitable for `new mongoose.Schema(...)`
 */
function bloodPressureDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/bloodPressure: pass your own mongoose instance'
    );
  }

  return {
    userId: {
      type: String,
      required: true
    },
    systolic: {
      type: Number,
      required: true,
      min: bloodPressureBounds.systolic.min,
      max: bloodPressureBounds.systolic.max
    },
    diastolic: {
      type: Number,
      required: true,
      min: bloodPressureBounds.diastolic.min,
      max: bloodPressureBounds.diastolic.max
    },
    pulse: {
      type: Number,
      min: bloodPressureBounds.pulse.min,
      max: bloodPressureBounds.pulse.max,
      default: null
    },
    log_date: {
      type: Date,
      required: true,
      default: Date.now
    },
    notes: {
      type: String,
      maxlength: bloodPressureBounds.notes.maxlength,
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

const bloodPressureOptions = {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
};

/**
 * Build a fresh `BloodPressure` schema — index, virtuals and serialization
 * settings included.
 *
 * Statics are deliberately NOT attached here; neither side has any, and the
 * policy is that they stay app-side. See `userSettings.js`.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {import('mongoose').Schema}
 */
function createBloodPressureSchema(mongoose) {
  const schema = new mongoose.Schema(bloodPressureDefinition(mongoose), bloodPressureOptions);

  // Compound index for efficient queries.
  schema.index({ userId: 1, log_date: -1 });

  // Virtual for formatted date.
  schema.virtual('formatted_date').get(function formattedDate() {
    return this.log_date.toISOString().split('T')[0];
  });

  // Virtual for BP status.
  schema.virtual('status').get(function status() {
    return classifyBloodPressure(this.systolic, this.diastolic);
  });

  // Ensure virtuals are serialized.
  schema.set('toJSON', { virtuals: true });
  schema.set('toObject', { virtuals: true });

  return schema;
}

module.exports = {
  bloodPressureBounds,
  classifyBloodPressure,
  bloodPressureDefinition,
  bloodPressureOptions,
  createBloodPressureSchema,
};
