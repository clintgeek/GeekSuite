/**
 * fitnessgeek `Meal` — the single source of truth for the field set, the
 * embedded meal-item sub-schema, the `updated_at` hook and the nutrition
 * arithmetic.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two independent writers point at the same `meals` collection in the
 * `fitnessgeek` MongoDB database:
 *
 *   1. basegeek's GraphQL gateway — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *      (`meals`, `meal`, and `logMeal`, which took over on 2026-09-05)
 *   2. fitnessgeek's REST backend — src/routes/mealRoutes.js
 *
 * Mongoose runs in strict mode by default: an unknown path in a `$set` is
 * dropped silently, not rejected. Two hand-synced copies of a schema is
 * therefore a data-loss hazard, not a style complaint — see
 * `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md`.
 *
 * The two copies were byte-identical when this module was created (2026-09-05)
 * apart from the connection binding and the statics, so promoting the schema
 * here was a pure refactor: no field added, removed, retyped or re-defaulted,
 * and no index changed.
 *
 * NO OPTIONS OBJECT — AND THAT IS DELIBERATE
 * ------------------------------------------
 * This is the only consolidated fitnessgeek model that passes no schema
 * options: no `timestamps`, no `toJSON`/`toObject` virtuals. `created_at` and
 * `updated_at` are ordinary declared paths with `default: Date.now`, and
 * `updated_at` is maintained by the `pre('save')` hook below rather than by
 * mongoose. `new Schema(def)` and `new Schema(def, {})` produce an identical
 * `schema.options`, so `mealOptions` is passed for symmetry with the other
 * modules without changing a thing.
 *
 * Note the consequence: the hook fires on `save()` only. Nothing stamps
 * `updated_at` on a `findOneAndUpdate` / `updateOne`, on either side. That is
 * shipped behaviour, it is the same on both sides, and fixing it is a
 * behaviour change with its own ticket — not a line in a consolidation commit.
 *
 * WHAT MOVED, AND WHAT DIDN'T
 * ---------------------------
 * Moved, because they are identical on both sides and they touch declared
 * paths:
 *
 *   - the embedded `mealItemSchema` (`food_items`), built from the caller's
 *     own mongoose so the sub-schema passes that instance's `instanceof`
 *   - the `pre('save')` hook that stamps `updated_at`
 *   - the instance method `getNutrition`, whose arithmetic is also exported as
 *     `sumMealNutrition(foodItems)` so it can be asserted without a database
 *
 * Did NOT move — and this is the pair where leaving them alone is the *only*
 * safe answer, not merely the tidy one. The four statics do not agree about
 * what a missing `userId` means:
 *
 *   | static           | fitnessgeek                        | basegeek                |
 *   |------------------|------------------------------------|-------------------------|
 *   | `getActiveMeals` | `if (userId) query.user_id = …`    | `requireUser` throws    |
 *   | `getMealsByType` | same optional scoping              | `requireUser` throws    |
 *   | `searchMeals`    | same optional scoping               | `requireUser` throws    |
 *   | `findOwned`      | absent                             | id-validated, owner-scoped |
 *
 * fitnessgeek's copies return **every user's meals** when called without a
 * userId; basegeek's fail closed. Every live fitnessgeek caller does pass one
 * (`routes/mealRoutes.js:19, :21, :23` take it from the authenticated request),
 * so this is latent rather than live — but promoting either version would be a
 * deliberate behaviour change on one side wearing a refactor's clothes. That is
 * divergence C4 in the plan, and its answer is: consolidate the fields, leave
 * the statics exactly where they are, and let the tightening be its own ticket
 * with its own test.
 *
 * `MEAL_TYPES` — AND THE COPIES THAT ARE STILL OUT THERE
 * ------------------------------------------------------
 * The `meal_type` enum is exported so a consumer can stop restating it.
 * `apps/fitnessgeek/backend/src/routes/mealRoutes.js` imports it (2026-09-05).
 * One copy is still hand-written:
 *
 *   - `models/FoodLog.js` on BOTH sides — the same four strings on a
 *     *different* collection (`foodlogs`). Pair 9. Whether the two collections
 *     share one enum constant or keep their own is a decision for that pair;
 *     do not reach across and rewire it from here.
 *
 * WHY `mongoose` IS A PARAMETER, AND WHY THIS MODULE IS CJS
 * --------------------------------------------------------
 * Same reasons as `weight.js`, `bloodPressure.js` and `userSettings.js`: the
 * consumers own their own mongoose instances (a `Schema` built by instance A
 * fails `instanceof` inside instance B's `Connection.model()`), and a CJS
 * module with a literal `module.exports = { … }` is statically readable by
 * Node's ESM→CJS interop from both of them with no build step.
 */

/** The `meal_type` enum, shared by both writers. Frozen so a consumer cannot mutate the contract. */
const MEAL_TYPES = Object.freeze(['breakfast', 'lunch', 'dinner', 'snack']);

/**
 * The embedded item definition: a reference to a catalog food plus how many
 * servings of it this meal uses.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {Object} a definition object suitable for `new mongoose.Schema(...)`
 */
function mealItemDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/meal: pass your own mongoose instance'
    );
  }

  return {
    food_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodItem',
      required: true
    },
    servings: {
      type: Number,
      required: true,
      default: 1
    }
  };
}

/**
 * Build the embedded sub-schema. It must be built from the *caller's* mongoose
 * for the same `instanceof` reason the parent schema is.
 *
 * `ref: 'FoodItem'` resolves against whichever connection the parent model is
 * bound to, so `populate('food_items.food_item_id')` finds that app's own
 * `FoodItem` model. Nothing here registers one.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {import('mongoose').Schema}
 */
function createMealItemSchema(mongoose) {
  return new mongoose.Schema(mealItemDefinition(mongoose));
}

/**
 * The field definitions, as a plain object literal.
 *
 * NOTE — `user_id` is `required: false` with `default: null`. Meals predate
 * per-user scoping in this app and unowned rows exist. That is why
 * fitnessgeek's statics still treat a missing userId as "no filter" (see the
 * header); it is not an oversight in the schema.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {Object} a definition object suitable for `new mongoose.Schema(...)`
 */
function mealDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/meal: pass your own mongoose instance'
    );
  }

  return {
    user_id: {
      type: String,
      required: false,
      index: true,
      default: null
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    meal_type: {
      type: String,
      enum: MEAL_TYPES,
      required: true
    },
    food_items: [createMealItemSchema(mongoose)],
    is_deleted: {
      type: Boolean,
      default: false
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

// Empty on purpose — see the header. Kept so every module in this directory
// has the same three-part shape (definition, options, factory).
const mealOptions = {};

/** The zero totals a meal accumulates into, in the shipped key order. */
const emptyMealNutrition = () => ({
  calories: 0,
  protein_grams: 0,
  carbs_grams: 0,
  fat_grams: 0,
  fiber_grams: 0,
  sugar_grams: 0,
  sodium_mg: 0
});

/**
 * Sum a meal's nutrition from its **populated** items.
 *
 * Lifted verbatim out of `getNutrition` so it can be asserted without a
 * database, the same way `loginStreak.js` exports `applyLoginToStreak`.
 *
 * An item whose `food_item_id` is an un-populated ObjectId — or a populated
 * document with no `nutrition` block — contributes nothing rather than
 * throwing or poisoning the totals with `NaN`. Callers that forget to
 * `.populate()` therefore get zeros, quietly; that is shipped behaviour on
 * both sides.
 *
 * @param {Array<{food_item_id: any, servings: number}>} foodItems
 * @returns {Object} calories rounded to the unit, grams to one decimal,
 *   sodium to the unit — the shipped precision.
 */
function sumMealNutrition(foodItems) {
  const totals = emptyMealNutrition();

  (foodItems || []).forEach(item => {
    if (item.food_item_id && item.food_item_id.nutrition) {
      const multiplier = item.servings || 1;
      totals.calories += item.food_item_id.nutrition.calories_per_serving * multiplier;
      totals.protein_grams += item.food_item_id.nutrition.protein_grams * multiplier;
      totals.carbs_grams += item.food_item_id.nutrition.carbs_grams * multiplier;
      totals.fat_grams += item.food_item_id.nutrition.fat_grams * multiplier;
      totals.fiber_grams += item.food_item_id.nutrition.fiber_grams * multiplier;
      totals.sugar_grams += item.food_item_id.nutrition.sugar_grams * multiplier;
      totals.sodium_mg += item.food_item_id.nutrition.sodium_mg * multiplier;
    }
  });

  // Round to reasonable precision
  return {
    calories: Math.round(totals.calories),
    protein_grams: Math.round(totals.protein_grams * 10) / 10,
    carbs_grams: Math.round(totals.carbs_grams * 10) / 10,
    fat_grams: Math.round(totals.fat_grams * 10) / 10,
    fiber_grams: Math.round(totals.fiber_grams * 10) / 10,
    sugar_grams: Math.round(totals.sugar_grams * 10) / 10,
    sodium_mg: Math.round(totals.sodium_mg)
  };
}

/**
 * Attach the `updated_at` stamp. It is the only hook either side declares on
 * this schema and it is identical on both, so it belongs with the fields:
 * a divergence would leave one writer's saves with a stale `updated_at` and
 * nothing would throw.
 *
 * @param {import('mongoose').Schema} schema
 */
function attachMealTimestamps(schema) {
  // Update the updated_at field before saving
  schema.pre('save', function(next) {
    this.updated_at = new Date();
    next();
  });
}

/**
 * Attach the shared instance methods. Split out so a consumer that builds the
 * schema by hand (a migration script, say) can still get them.
 *
 * @param {import('mongoose').Schema} schema
 */
function attachMealMethods(schema) {
  // Calculate total nutrition for the meal
  schema.methods.getNutrition = function getNutrition() {
    return sumMealNutrition(this.food_items);
  };
}

/**
 * Build a fresh `Meal` schema — sub-schema, hook and instance method included.
 *
 * The only index is the path-level `index: true` on `user_id`; there is no
 * `schema.index()` call on either side.
 *
 * Statics are deliberately NOT attached here — the four of them are the
 * divergence, not an accident. See the header.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {import('mongoose').Schema}
 */
function createMealSchema(mongoose) {
  const schema = new mongoose.Schema(mealDefinition(mongoose), mealOptions);

  attachMealTimestamps(schema);
  attachMealMethods(schema);

  return schema;
}

module.exports = {
  MEAL_TYPES,
  sumMealNutrition,
  attachMealTimestamps,
  attachMealMethods,
  mealItemDefinition,
  createMealItemSchema,
  mealDefinition,
  mealOptions,
  createMealSchema,
};
