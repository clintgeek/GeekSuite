/**
 * fitnessgeek `BodyComposition` — the single source of truth for the field
 * set behind a smart-scale body-composition scan (Arboleaf, and whatever
 * scanner comes after it), the unique `(userId, measured_at)` dedupe index,
 * and the `formatted_date` virtual shared with `Weight` and `BloodPressure`.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two independent writers persist this document into the same
 * `bodycompositions` collection in the `fitnessgeek` MongoDB database:
 *
 *   1. fitnessgeek's REST backend — the AI-extraction ingest path that reads
 *      an uploaded Arboleaf PDF/PNG (plus a manual-entry fallback).
 *   2. basegeek's GraphQL gateway — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *
 * Mongoose runs in strict mode by default, which silently DROPS unknown paths
 * from a `$set` instead of erroring — so a field present in one copy and
 * absent from the other is accepted by the API, logged as a success, and
 * never written. That is how `nutrition_goal.keto` evaporated from
 * `UserSettings` in April 2026; see `weight.js`'s header for the full audit
 * and `DOCS/ARCHIVE/FITNESSGEEK_MODEL_CONSOLIDATION.md`.
 *
 * WHY THIS IS ITS OWN MODEL, NOT A FIELD ON `Weight`
 * ---------------------------------------------------
 * `Weight` stores one number a user can supply from anywhere — a Garmin push,
 * a manual correction, an old imported row, a travel gap — and most `weights`
 * rows have no scan behind them at all. Bolting scan fields onto `Weight`
 * would give every one of those rows a wide, permanently-empty tail of
 * body-composition columns. Instead this collection is joined to `Weight` on
 * `userId` + `log_date`: same person, same calendar day, two different
 * questions ("what did the scale say" vs. "what did the scan measure").
 *
 * WHAT IS STORED, AND WHAT IS NOT
 * --------------------------------
 * Only the report's directly-measured, non-derivable primaries and its
 * five-segment muscle/fat breakdown are stored: eight whole-body values plus
 * ten segmental ones. The test for "does it get stored" is not "is it a
 * primary-looking number" — it is "can a reader recompute it EXACTLY from the
 * other stored fields". Verified numerically against a real scan:
 *
 *   fat_free_mass = weight - body_fat_mass          -> exact
 *   muscle_mass   = fat_free_mass - bone_mass        -> exact
 *   body_water_%  = body_water_l / weight            -> exact (unit-converted)
 *   BMR           = 370 + 21.6 * fat_free_mass_kg    -> Katch-McArdle, exact
 *   SMI           = appendicular_muscle_kg / height_m^2 -> exact
 *   BMI           = weight_kg / height_m^2           -> NOT exact: the report
 *     rounds height to 1.80 m, so recomputing from a more precisely stored
 *     height differs in the first decimal. Height-sensitive, not this
 *     schema's problem, but a comment claiming BMI/SMI "recompute exactly"
 *     would be wrong — say so if you write one.
 *
 * All of the above, plus body fat % and every other ratio the report prints,
 * are therefore NOT stored — they are arithmetic over what is, and get
 * recomputed on read. `subcutaneous_fat_lb` and `visceral_fat_index` (below)
 * FAILED this test: the report gives visceral fat only as a unitless index,
 * never a mass, so `total_fat - visceral_fat` is not computable from stored
 * fields, and subcutaneous fat is a genuinely independent BIA regression
 * output, not a subtraction. Both are stored as primaries for that reason.
 *
 * `weight_value` IS DUPLICATED FROM `Weight` — ON PURPOSE
 * ---------------------------------------------------------
 * The scan's own weight reading is the denominator for every percentage a
 * caller recomputes from this document (body fat %, muscle %, …), and a scan
 * can arrive before, after, or without ever being reconciled against a manual
 * `Weight` row for the same day. Storing the scan's own number here means a
 * reader never has to join to `Weight` just to divide — the join is for
 * *provenance* ("was this day's weight a scan or a guess"), not for the
 * arithmetic.
 *
 * NOTE — `userId`, not `user_id`. `Weight` and `BloodPressure` are the only
 * two fitnessgeek models using the camelCase owner field, and this model
 * joins to `Weight` on `userId` + `log_date` — so it deliberately matches
 * `Weight`'s spelling rather than the `user_id` majority. See `weight.js`'s
 * header for the pre-existing inconsistency this is matching, not
 * introducing.
 *
 * TWO DATES, NOT ONE — READ BEFORE TOUCHING EITHER
 * --------------------------------------------------
 * `measured_at` is an INSTANT: the exact moment printed on the scan report
 * (e.g. "09/16/2026 08:01"), stored as a full ISO-8601 UTC value. `log_date`
 * is a CALENDAR DATE: UTC midnight of the day the scan counts for, and it is
 * the join key against `Weight.log_date`. See `DOCS/THE_CONTEXT.md` §3.1 —
 * these are two different kinds of date and the suite is strict about not
 * mixing them. `@geeksuite/utils` (`toUtcMidnight`) is ESM-only and cannot be
 * `require`-d from this CJS package (the same constraint noted in
 * `dailySummary.js` and `foodLog.js`), so `log_date` is declared `required`
 * with NO default: each app's ingest path normalizes `measured_at` down to
 * its UTC calendar day with `toUtcMidnight` and passes the already-normalized
 * value in. Do not default this to `Date.now` — that would store the instant
 * the row was inserted, not the calendar day the scan is *for*.
 *
 * THE UNIQUE INDEX IS `(userId, measured_at)`, NOT A FILE HASH
 * ----------------------------------------------------------------
 * The same physical scan commonly arrives twice — a user shares the PDF, then
 * later shares a photo of the same printout, or re-uploads the same file by
 * mistake. Those are different bytes describing one real-world event, so a
 * file hash would treat them as two scans and double-count a single reading.
 * `(userId, measured_at)` is the event key instead: two ingests of the same
 * scan read the same instant off the same report, so the second upload
 * collides on this unique index rather than creating a duplicate row. This is
 * the third `unique` flag anywhere in `packages/schemas/fitnessgeek/`, after
 * `FoodItem.barcode` and `DailySummary`'s `(user_id, date)` — the same
 * redeploy rule applies: if this index's shape or uniqueness is ever changed,
 * both writers must be redeployed together (see `foodItem.js`'s header for
 * the mechanics of why).
 *
 * `extraction` — AI-EXTRACTION PROVENANCE, NOT MEASUREMENT DATA
 * ------------------------------------------------------------------
 * The ingest path runs the scan through an AI extractor and an arithmetic
 * validation gate (do the segments sum close enough to the report's own
 * totals) before trusting the result. `extraction.validation_passed` records
 * whether that gate passed; `extraction.confidence` and `.method` are
 * free-form provenance from whatever extractor ran. None of this is
 * measurement data and none of it participates in any recomputation — it
 * exists so a caller can flag, sort or re-review a low-confidence row later.
 *
 * SEGMENTS ARE NESTED OBJECTS, NOT A SUB-SCHEMA
 * ----------------------------------------------
 * `left_arm`, `right_arm`, `trunk`, `left_leg` and `right_leg` are nested
 * plain **objects**, so mongoose flattens them into dotted paths
 * (`left_arm.muscle_lb`, `left_arm.fat_lb`, …) — the same shape as
 * `dailySummary.js`'s `meals.<type>` and `foodItem.js`'s `nutrition`/
 * `serving`. There are exactly five, always present as a set, never appended
 * to or reordered by a caller, which is what makes a plain object the right
 * shape here rather than a `DocumentArray` (contrast `Meal.food_items`, which
 * genuinely varies in length and needs its own sub-schema comparison).
 *
 * WHY `mongoose` IS A PARAMETER, AND WHY THIS MODULE IS CJS
 * --------------------------------------------------------
 * Same reasons as `weight.js`: the two consumers are separate workspace
 * packages with their own mongoose dependency ranges, and a `Schema` built by
 * mongoose instance A fails `instanceof` checks inside instance B's
 * `Connection.model()`. This module is CommonJS on purpose — no build step,
 * `require`-able and `import`-able by both consumers, matching every other
 * file in this directory. Both consumers are ESM and pick it up through
 * Node's ESM→CJS interop — fitnessgeek via a named import, basegeek via the
 * default export (see `createBodyCompositionSchema` below).
 */

/**
 * The numeric bounds, in one place, shared by every mass-shaped field on the
 * document. Frozen so a consumer cannot mutate the contract.
 */
const bodyCompositionBounds = Object.freeze({
  // Every lb-denominated mass on the report — `weight_value`, the five other
  // lb-denominated whole-body primaries (`body_fat_mass_lb`, `protein_lb`,
  // `bone_mass_lb`, `skeletal_muscle_lb`, `subcutaneous_fat_lb`), and each
  // segment's `muscle_lb`/`fat_lb` — shares one ceiling. 1000 matches
  // `weight.js`'s `weight_value.max`: no component of a body-composition scan
  // can plausibly exceed the person's own weight.
  mass_lb: Object.freeze({ min: 0, max: 1000 }),
  // Total body water, in LITERS — the report's own unit, not lb. 500 L is a
  // deliberately generous, non-physiological ceiling: it exists to catch a
  // unit-conversion bug (storing lb where L was meant), not to model a real
  // human range.
  body_water_l: Object.freeze({ min: 0, max: 500 }),
  // A proprietary, unitless BIA index (typical device range is single digits
  // to low tens). NOT a mass — see `visceral_fat_index`'s own comment below.
  // The ceiling is generous on purpose: it exists to catch a gross ingest
  // error, not to model the index's real distribution.
  visceral_fat_index: Object.freeze({ min: 0, max: 60 }),
  extraction: Object.freeze({
    confidence: Object.freeze({ min: 0, max: 1 }),
  }),
  notes: Object.freeze({ maxlength: 500 }),
});

/** The `source` enum — the ingest path a scan came in through. */
const BODY_COMPOSITION_SOURCES = Object.freeze([
  'arboleaf_pdf',
  'arboleaf_image',
  'manual',
]);

/**
 * One lb-denominated mass leaf: optional (an extraction can partially fail
 * and still be worth keeping), bounded, and explicitly `null` rather than
 * `undefined` when absent — matching `medication.js`'s optional-numeric
 * convention.
 */
const massLbField = () => ({
  type: Number,
  min: bodyCompositionBounds.mass_lb.min,
  max: bodyCompositionBounds.mass_lb.max,
  default: null,
});

/** The two measures the report gives per segment. */
function segmentDefinition() {
  return {
    muscle_lb: massLbField(),
    fat_lb: massLbField(),
  };
}

/**
 * The field definitions, as a plain object literal.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {Object} a definition object suitable for `new mongoose.Schema(...)`
 */
function bodyCompositionDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/bodyComposition: pass your own mongoose instance'
    );
  }

  return {
    // See the header — deliberately camelCase, to match the `Weight`
    // collection this model joins against.
    userId: {
      type: String,
      required: true,
    },
    // The scan's own weight reading. Required: every recomputation a reader
    // does (body fat %, muscle %, …) divides by this number, so a row without
    // one is not a usable scan. See the header for why it is duplicated from
    // `Weight` rather than always joined for.
    weight_value: {
      type: Number,
      required: true,
      min: bodyCompositionBounds.mass_lb.min,
      max: bodyCompositionBounds.mass_lb.max,
    },
    body_fat_mass_lb: massLbField(),
    // Liters, not lb — see the header.
    body_water_l: {
      type: Number,
      min: bodyCompositionBounds.body_water_l.min,
      max: bodyCompositionBounds.body_water_l.max,
      default: null,
    },
    protein_lb: massLbField(),
    bone_mass_lb: massLbField(),
    skeletal_muscle_lb: massLbField(),
    // An independent BIA regression output, not `total_fat - visceral_fat` —
    // the report never gives visceral fat as a mass, so that subtraction is
    // impossible. See the header's "WHAT IS STORED" section.
    subcutaneous_fat_lb: massLbField(),
    // A unitless proprietary index (e.g. "20"), NOT a mass — deliberately
    // named without an `_lb` (or any unit) suffix so nobody later divides or
    // sums it alongside the lb-denominated fields above. Not derivable from
    // anything else on the report; stored as given.
    visceral_fat_index: {
      type: Number,
      min: bodyCompositionBounds.visceral_fat_index.min,
      max: bodyCompositionBounds.visceral_fat_index.max,
      default: null,
    },
    // Five segments, each a nested object (dotted paths) — see the header.
    left_arm: segmentDefinition(),
    right_arm: segmentDefinition(),
    trunk: segmentDefinition(),
    left_leg: segmentDefinition(),
    right_leg: segmentDefinition(),
    // The instant the scan was taken, read off the report. An INSTANT, not a
    // calendar date — see the header before conflating this with `log_date`.
    measured_at: {
      type: Date,
      required: true,
    },
    // UTC midnight of the calendar day this scan counts for — the join key
    // against `Weight.log_date`. No default; see the header.
    log_date: {
      type: Date,
      required: true,
    },
    source: {
      type: String,
      required: true,
      enum: BODY_COMPOSITION_SOURCES,
    },
    // AI-extraction provenance, not measurement data — see the header.
    extraction: {
      validation_passed: {
        type: Boolean,
        default: null,
      },
      confidence: {
        type: Number,
        min: bodyCompositionBounds.extraction.confidence.min,
        max: bodyCompositionBounds.extraction.confidence.max,
        default: null,
      },
      method: {
        type: String,
        default: null,
      },
    },
    notes: {
      type: String,
      maxlength: bodyCompositionBounds.notes.maxlength,
      default: '',
    },
  };
}

const bodyCompositionOptions = {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
};

/**
 * Build a fresh `BodyComposition` schema — indexes, virtual and
 * serialization settings included. They are part of the contract: an index
 * divergence means one process creating an index the other's queries depend
 * on (or, for the unique one, an index the other's writes can silently start
 * violating), and a virtual that exists on one side only changes what the API
 * returns.
 *
 * Statics are deliberately NOT attached here, matching every other pair in
 * this directory: neither consumer needs one today, the gateway enforces
 * caller ownership while fitnessgeek's backend has already authenticated, and
 * statics do not affect `schema.paths` so they cannot cause the strict-mode
 * data loss this module exists to prevent.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {import('mongoose').Schema}
 */
function createBodyCompositionSchema(mongoose) {
  const schema = new mongoose.Schema(bodyCompositionDefinition(mongoose), bodyCompositionOptions);

  // The dedupe key — see the header. Two ingests of the same physical scan
  // read the same instant off the same report and collide here instead of
  // duplicating.
  schema.index({ userId: 1, measured_at: 1 }, { unique: true });

  // For the join against `Weight` (`userId` + `log_date`) and for "most
  // recent scan first" reads — the same shape as `weight.js`'s own compound
  // index.
  schema.index({ userId: 1, log_date: -1 });

  // Virtual for formatted date, matching `Weight` and `BloodPressure`.
  schema.virtual('formatted_date').get(function formattedDate() {
    return this.log_date.toISOString().split('T')[0];
  });

  // Ensure virtuals are serialized.
  schema.set('toJSON', { virtuals: true });
  schema.set('toObject', { virtuals: true });

  return schema;
}

module.exports = {
  bodyCompositionBounds,
  BODY_COMPOSITION_SOURCES,
  bodyCompositionDefinition,
  bodyCompositionOptions,
  createBodyCompositionSchema,
};
