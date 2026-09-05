/**
 * fitnessgeek `Medication` — the single source of truth for the field set,
 * the two enums and the numeric bounds.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two independent writers persist this document into the same `medications`
 * collection in the `fitnessgeek` MongoDB database:
 *
 *   1. fitnessgeek's REST backend — apps/fitnessgeek/backend/src/routes/medicationRoutes.js
 *   2. basegeek's GraphQL gateway — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *      (`fitnessMedications`, `addFitnessMedication`, `updateFitnessMedication`,
 *      `deleteFitnessMedication`)
 *
 * Mongoose runs in strict mode by default: an unknown path in a `$set` is
 * dropped silently, not rejected. Two hand-synced copies of a schema is
 * therefore a data-loss hazard, not a style complaint — see
 * `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md` and the April 2026 keto incident
 * in `apps/fitnessgeek/DOCS/USER_SETTINGS_SCHEMA.md`.
 *
 * The two copies were byte-identical when this module was created (2026-09-05)
 * apart from the connection binding, so promoting them here was a pure
 * refactor: no field added, removed, retyped or re-defaulted, and no index
 * changed.
 *
 * WHY THE ENUMS AND BOUNDS ARE EXPORTED
 * -------------------------------------
 * `apps/fitnessgeek/backend/src/validation/schemas/medication.js` is a zod
 * layer in front of the REST routes, and it restated BOTH enums by hand
 * (`MED_TYPES`, `TIME_OF_DAY`) plus the `days_supply` and `notes` bounds —
 * the same hand-sync this exercise exists to end, in a different language. It
 * now imports them from here, so the request validator and the schema cannot
 * disagree about what a legal `med_type`, `times_of_day` entry or supply
 * length is.
 *
 * KNOWN QUIRK — THE TIMESTAMP KEYS ARE ASYMMETRIC
 * -----------------------------------------------
 * `timestamps: { createdAt: 'created_at', updatedAt: 'updatedAt' }` — snake on
 * the way in, camel on the way out. Every other fitnessgeek model that renames
 * its timestamps uses `updated_at`. This is what both shipped copies declare
 * and what is on disk in the `medications` collection today, so it moved
 * verbatim. Fixing it is a data migration wearing a refactor's clothes; if it
 * is ever worth doing it needs its own ticket, its own backfill and its own
 * commit title.
 *
 * KNOWN QUIRK — `toJSON`/`toObject` VIRTUALS WITH NO VIRTUALS
 * -----------------------------------------------------------
 * Both copies pass `toJSON: { virtuals: true }` and `toObject: { virtuals: true }`
 * in the schema options while declaring no virtual at all. The only effect is
 * that mongoose's automatic `id` virtual is serialized. Preserved because it
 * IS on the wire today.
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
 * The dosing slots a medication can be scheduled into. Shared by the schema,
 * fitnessgeek's zod validator, and (still by hand — see the carry-forward note
 * in DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md §8) `models/MedicationLog.js`.
 */
const MED_TIME_OF_DAY = Object.freeze(['morning', 'afternoon', 'evening', 'bedtime']);

/** The `med_type` enum. `'rx'` is the default and the fallback. */
const MED_TYPES = Object.freeze(['rx', 'otc', 'supplement']);

/**
 * The numeric bounds the schema enforces, in one place, so the zod request
 * validator can enforce exactly the same ones. Frozen so a consumer cannot
 * mutate the contract.
 */
const medicationBounds = Object.freeze({
  days_supply: Object.freeze({ min: 1, max: 3650 }),
  notes: Object.freeze({ maxlength: 500 }),
});

/**
 * The field definitions, as a plain object literal.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {Object} a definition object suitable for `new mongoose.Schema(...)`
 */
function medicationDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/medication: pass your own mongoose instance'
    );
  }

  return {
    user_id: {
      type: String,
      required: true,
      index: true
    },
    display_name: {
      type: String,
      required: true,
      trim: true
    },
    is_supplement: {
      type: Boolean,
      default: false
    },
    med_type: {
      type: String,
      enum: MED_TYPES,
      default: 'rx',
      index: true
    },
    rxcui: {
      type: String,
      default: null,
      index: true
    },
    ingredient_name: {
      type: String,
      default: null
    },
    brand_name: {
      type: String,
      default: null
    },
    form: {
      type: String,
      default: null
    },
    route: {
      type: String,
      default: null
    },
    strength: {
      type: String,
      default: null
    },
    dose_value: {
      type: Number,
      default: null
    },
    dose_unit: {
      type: String,
      default: null
    },
    sig: {
      type: String,
      default: null
    },
    times_of_day: {
      type: [String],
      enum: MED_TIME_OF_DAY,
      default: []
    },
    suggested_indications: {
      type: [String],
      default: []
    },
    user_indications: {
      type: [String],
      default: []
    },
    // Supply tracking
    supply_start_date: {
      type: Date,
      default: null
    },
    days_supply: {
      type: Number,
      default: null,
      min: medicationBounds.days_supply.min,
      max: medicationBounds.days_supply.max
    },
    notes: {
      type: String,
      trim: true,
      maxlength: medicationBounds.notes.maxlength,
      default: ''
    }
  };
}

const medicationOptions = {
  timestamps: {
    createdAt: 'created_at',
    // Not a typo — see "KNOWN QUIRK" in this file's header.
    updatedAt: 'updatedAt'
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
};

/**
 * Build a fresh `Medication` schema — indexes and serialization settings
 * included. They are part of the contract: an index divergence means one
 * process creating an index the other's queries depend on.
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
function createMedicationSchema(mongoose) {
  const schema = new mongoose.Schema(medicationDefinition(mongoose), medicationOptions);

  schema.index({ user_id: 1, display_name: 1 });

  return schema;
}

module.exports = {
  MED_TIME_OF_DAY,
  MED_TYPES,
  medicationBounds,
  medicationDefinition,
  medicationOptions,
  createMedicationSchema,
};
