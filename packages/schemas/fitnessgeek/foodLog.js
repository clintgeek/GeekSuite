/**
 * fitnessgeek `FoodLog` — the single source of truth for the field set, the
 * three compound indexes, the timestamp rename and the `calculatedNutrition`
 * virtual.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two independent writers point at the same `foodlogs` collection in the
 * `fitnessgeek` MongoDB database:
 *
 *   1. basegeek's GraphQL gateway — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *      (`addFoodLog`, `updateFoodLog`, `deleteFoodLog`, `logMeal`,
 *      `copyFitnessMeal` — the writes the frontend moved onto the gateway on
 *      2026-09-05 in `79b1b57`)
 *   2. fitnessgeek's REST backend — src/routes/logRoutes.js, foodRoutes.js,
 *      aiCoachRoutes.js and services/{foodReportService,aiInsightsService,unifiedFoodService}.js,
 *      which still read this collection heavily
 *
 * Mongoose runs in strict mode by default: an unknown path in a `$set` is
 * dropped silently, not rejected. Two hand-synced copies of a schema is
 * therefore a data-loss hazard, not a style complaint — see
 * `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md`.
 *
 * The two copies were byte-identical when this module was created (2026-09-05)
 * apart from the connection binding and basegeek's `requireUser` guards, so
 * promoting the schema here was a pure refactor: no field added, removed,
 * retyped or re-defaulted, and no index changed. (The last real divergence —
 * basegeek's hand-rolled `toUtcDate` — was deleted in `0cecb4a`, before this
 * pair started; both sides now normalize dates with `@geeksuite/utils`.)
 *
 * THE MEAL-TYPE ENUM IS `meal.js`'s, ON PURPOSE
 * ----------------------------------------------
 * `meals` and `foodlogs` are different collections, and the plan's rule (§9)
 * is "grep for the third copy — *then check it is the same collection*". This
 * one passes that check anyway, because the two enums are not two lists that
 * happen to hold the same strings: they are one vocabulary with a producer and
 * a consumer.
 *
 *   - `logMeal` (resolvers.js:811) writes a saved **Meal**'s `meal_type`
 *     straight into a new **FoodLog** row: `mealType || meal.meal_type ||
 *     'snack'`. A value legal on `meals` and not on `foodlogs` makes a saved
 *     meal unloggable, with a mongoose ValidationError at the end of a write.
 *   - `DailySummary.updateFromLogs` buckets FoodLog rows into
 *     `meals[log.meal_type]`, whose four keys are these four strings — and the
 *     bucketing is guarded (`if (meals[log.meal_type])`), so a value legal on
 *     `foodlogs` alone would count in `totals` and **vanish** from the per-meal
 *     breakdown. Silent, partial, per-day. Precisely the failure class this
 *     package exists to prevent.
 *
 * So `foodlogs` imports `MEAL_TYPES` from `./meal.js` rather than freezing a
 * fourth copy of the four strings, and re-exports it so a consumer of this
 * module does not have to know which file it came from. This is the first
 * cross-collection constant in `packages/schemas/fitnessgeek/`; the bar it had
 * to clear was a runtime coupling between the two collections, not a shared
 * spelling. Contrast `validation/schemas/settings.js`'s `startWeight` bounds,
 * which were deliberately NOT rewired to `weightGoals.js` (§9, pair 5): same
 * field names, different document, no coupling.
 *
 * WHAT MOVED, AND WHAT DIDN'T
 * ---------------------------
 * Moved: the fields, the three compound indexes, the options (including the
 * asymmetric timestamp rename below) and the `calculatedNutrition` virtual,
 * whose arithmetic is also exported as `scaleLogNutrition` so it can be
 * asserted without a database.
 *
 * Did NOT move — the four list statics (`getLogsForDate`,
 * `getLogsForDateRange`, `getRecentLogs`, `getLogsByMealType`). They are
 * byte-identical apart from basegeek's `requireUser(userId)` at the head of
 * each, which is the fail-closed ownership posture the gateway keeps and
 * fitnessgeek's post-auth callers do not need. They are also where the date
 * normalization lives, and `toUtcMidnight` comes from `@geeksuite/utils`,
 * which is ESM-only and therefore un-`require`-able from this CommonJS
 * package. Both reasons point the same way: they stay app-side.
 *
 * KNOWN QUIRK — THE TIMESTAMP RENAME IS ASYMMETRIC
 * ------------------------------------------------
 * `timestamps: { createdAt: 'created_at', updatedAt: 'updatedAt' }` — snake on
 * the way in, camel on the way out. `Medication` does the same thing; every
 * other renaming model in the set uses `updated_at`. This is what both copies
 * declare and what is in the `foodlogs` collection, so it moved verbatim, and
 * both parity suites spell `updatedAt` out in the expected-path list so nobody
 * "fixes" it by accident. Fixing it properly is a migration with a backfill,
 * not a line in a refactor.
 *
 * KNOWN QUIRK — THE STORED SNAPSHOT AND THE DAILY SUMMARY DISAGREE
 * ---------------------------------------------------------------
 * `nutrition` exists so a log keeps the numbers it was written with, in case
 * the catalog row changes later — and `calculatedNutrition` reads it first,
 * falling back to the populated food. `DailySummary.updateFromLogs` does the
 * opposite: it reads `log.food_item_id.nutrition` only and ignores the stored
 * snapshot entirely, so editing a catalog row silently restates every past
 * day's totals. Both sides do this identically, so it is not a consolidation
 * hazard and nothing was changed — but it is the kind of thing that is much
 * easier to see from here than from either app. Recorded in §12 of the plan as
 * a follow-up.
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

/**
 * The field definitions, as a plain object literal.
 *
 * `nutrition` is a nested **object**, not a sub-schema — mongoose flattens it
 * into dotted paths (`nutrition.calories_per_serving`, …), so `describePath()`
 * sees each leaf directly and no separate sub-schema comparison is needed the
 * way `Meal.food_items` needs one.
 *
 * Note that every `nutrition.*` leaf carries `default: 0` and **no `min`** —
 * unlike `FoodItem.nutrition.*`, which floors each at 0, and unlike
 * `DailySummary.totals.*`, which does the same. A negative number written here
 * is accepted. That is shipped on both sides; changing it is a validation
 * decision with its own ticket.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {Object} a definition object suitable for `new mongoose.Schema(...)`
 */
function foodLogDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/foodLog: pass your own mongoose instance'
    );
  }

  return {
    user_id: {
      type: String,
      required: true,
      index: true
    },
    log_date: {
      type: Date,
      required: true,
      index: true
    },
    meal_type: {
      type: String,
      required: true,
      enum: MEAL_TYPES,
      index: true
    },
    food_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodItem',
      required: true,
      index: true
    },
    servings: {
      type: Number,
      required: true,
      min: 0.1,
      max: 100
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500
    },
    // Store nutrition information at the time of logging (in case food item changes later)
    nutrition: {
      calories_per_serving: {
        type: Number,
        default: 0
      },
      protein_grams: {
        type: Number,
        default: 0
      },
      carbs_grams: {
        type: Number,
        default: 0
      },
      fat_grams: {
        type: Number,
        default: 0
      },
      fiber_grams: {
        type: Number,
        default: 0
      },
      sugar_grams: {
        type: Number,
        default: 0
      },
      sodium_mg: {
        type: Number,
        default: 0
      }
    }
  };
}

/**
 * The bounds the schema enforces, exported so a request validator can stop
 * restating them. There is no zod validator for this collection today
 * (`src/validation/schemas/` has `bloodPressure`, `common`, `medication`,
 * `settings`, `weight` and nothing else — checked 2026-09-05), so nothing
 * imports these yet; they are here for the same reason `foodItemBounds` is.
 */
const foodLogBounds = Object.freeze({
  servings: Object.freeze({ min: 0.1, max: 100 }),
  notes: Object.freeze({ maxlength: 500 }),
});

const foodLogOptions = {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updatedAt'
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
};

/**
 * Scale one log's nutrition by its servings — the arithmetic behind the
 * `calculatedNutrition` virtual, lifted out so it can be asserted without a
 * database (the `applyLoginToStreak` / `sumMealNutrition` pattern).
 *
 * Three behaviours here are shipped, identical on both sides, and easy to
 * misread as bugs:
 *
 *   - **The stored snapshot wins, then the populated food.** That is the point
 *     of writing `nutrition` onto the log at all.
 *   - **`||`, not `??`.** A stored `0` therefore falls THROUGH to the food's
 *     value: a genuinely zero-calorie entry reads the catalog number instead
 *     of its own zero. Preserved verbatim.
 *   - **The output key is `calories`, not `calories_per_serving`,** and it is
 *     already multiplied by servings. The other six keep their names.
 *
 * An un-populated `food_item_id` contributes nothing rather than throwing: the
 * caller passes `null` for `food` in that case, exactly as the virtual does.
 *
 * @param {Object} stored - the log's own `nutrition` block (may be empty).
 * @param {Object|null} food - the POPULATED catalog row, or null.
 * @param {number} servings - the multiplier.
 * @returns {Object} the seven scaled values.
 */
function scaleLogNutrition(stored, food, servings) {
  const nutrition = stored || {};
  const multiplier = servings;

  return {
    calories: (nutrition.calories_per_serving || (food?.nutrition?.calories_per_serving || 0)) * multiplier,
    protein_grams: (nutrition.protein_grams || (food?.nutrition?.protein_grams || 0)) * multiplier,
    carbs_grams: (nutrition.carbs_grams || (food?.nutrition?.carbs_grams || 0)) * multiplier,
    fat_grams: (nutrition.fat_grams || (food?.nutrition?.fat_grams || 0)) * multiplier,
    fiber_grams: (nutrition.fiber_grams || (food?.nutrition?.fiber_grams || 0)) * multiplier,
    sugar_grams: (nutrition.sugar_grams || (food?.nutrition?.sugar_grams || 0)) * multiplier,
    sodium_mg: (nutrition.sodium_mg || (food?.nutrition?.sodium_mg || 0)) * multiplier
  };
}

/**
 * Attach the shared virtual. Split out so a consumer that builds the schema by
 * hand (a migration script, say) can still get it.
 *
 * This pair DOES serialize its virtuals (`toJSON`/`toObject: { virtuals: true }`
 * in the options above), so `calculatedNutrition` is on the wire in every API
 * response that returns a log — a divergence here would change what clients
 * see, not just what a server computes.
 *
 * @param {import('mongoose').Schema} schema
 */
function attachFoodLogVirtuals(schema) {
  // Virtual for calculated nutrition values
  schema.virtual('calculatedNutrition').get(function calculatedNutrition() {
    // Use stored nutrition data if available, otherwise use food item nutrition
    const food = this.populated('food_item_id') ? this.food_item_id : null;
    return scaleLogNutrition(this.nutrition, food, this.servings);
  });
}

/**
 * Build a fresh `FoodLog` schema — indexes and virtual included.
 *
 * Seven indexes: four path-level (`user_id`, `log_date`, `meal_type`,
 * `food_item_id`) and three compound. None is `unique`, none is sparse, none
 * is a TTL, so §4's `FoodItem` redeploy caveat does not apply to this pair.
 *
 * Statics are deliberately NOT attached here — see the header.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {import('mongoose').Schema}
 */
function createFoodLogSchema(mongoose) {
  const schema = new mongoose.Schema(foodLogDefinition(mongoose), foodLogOptions);

  // Compound indexes for better query performance
  schema.index({ user_id: 1, log_date: 1 });
  schema.index({ user_id: 1, meal_type: 1 });
  schema.index({ user_id: 1, food_item_id: 1 });

  attachFoodLogVirtuals(schema);

  return schema;
}

module.exports = {
  MEAL_TYPES,
  foodLogBounds,
  scaleLogNutrition,
  attachFoodLogVirtuals,
  foodLogDefinition,
  foodLogOptions,
  createFoodLogSchema,
};
