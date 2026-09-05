/**
 * fitnessgeek `FoodItem` — the single source of truth for the catalog field
 * set, its indexes (including the `barcode` unique index and the text index),
 * the `source` enum, the `isGlobal` instance method, the `totalCalories`
 * virtual, and the `findOrCreate` dedupe ladder.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two independent writers point at the same `fooditems` collection in the
 * `fitnessgeek` MongoDB database:
 *
 *   1. basegeek's GraphQL gateway — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *      (`fitnessFood`, `addFitnessFood`, and `addFoodLog`, which took the
 *      food-log writes over on 2026-09-05 in `79b1b57`)
 *   2. fitnessgeek's REST backend — src/routes/foodRoutes.js and
 *      src/services/unifiedFoodService.js
 *
 * Mongoose runs in strict mode by default: an unknown path in a `$set` is
 * dropped silently, not rejected. Two hand-synced copies of a schema is
 * therefore a data-loss hazard, not a style complaint — see
 * `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md`.
 *
 * The two copies were byte-identical when this module was created (2026-09-05)
 * apart from the connection binding and basegeek's two `findAccessible*`
 * statics, so promoting the schema here was a pure refactor: no field added,
 * removed, retyped or re-defaulted, and no index changed.
 *
 * THE `unique` INDEX — READ THIS BEFORE CHANGING A FLAG
 * ----------------------------------------------------
 * `barcode` carries `unique: true, sparse: true`. It is the only `unique` flag
 * anywhere in `packages/schemas/fitnessgeek/`, and it is the reason this pair
 * is the first with a deploy caveat:
 *
 *   - **Today, nothing to do.** The flag is identical to what both sides
 *     already declared, so `syncIndexes` on either process is a no-op against
 *     the index that already exists in production. Consolidating changes no
 *     index, so there is no index rebuild and no ordering constraint between
 *     the two deploys.
 *   - **If a `unique` (or `sparse`, or the text index) flag is ever CHANGED
 *     here, both processes must be redeployed together.** Whichever reaches
 *     `syncIndexes` first tries to build the new index; the other keeps
 *     writing under the old contract, and a build that the live data violates
 *     fails loudly and repeatedly. In this suite that happens by construction —
 *     every push to `main` rebuilds all eight images and Watchtower rolls the
 *     fleet — but it is a property of the pipeline, not of the code, so say so
 *     in the commit if you ever touch it.
 *
 * The text index (`{ name: 'text', brand: 'text' }`) carries **no `weights`
 * option** on either side, so both fields weigh 1. Both tripwire suites
 * compare the normalized index list *including* `weights`, so adding a weight
 * on one side only is a test failure rather than a silent ranking change.
 *
 * KNOWN QUIRK — A SOFT-DELETED ROW STILL OWNS ITS BARCODE
 * ------------------------------------------------------
 * The `unique` index on `barcode` is **not** filtered by `is_deleted`, but
 * every rung of the dedupe ladder below is. So when a soft-deleted row holds a
 * barcode, `findOrCreate` declines to return it and then collides with it on
 * insert: the caller gets an `E11000`, not a row. This is pre-existing on both
 * sides — identical ladder, identical index — and it is asserted in
 * `fitnessgeekSchemaParity.test.js` so that it stays a known property instead
 * of an occasional mystery in an error log. Fixing it means either a partial
 * unique index (`partialFilterExpression: { is_deleted: false }`) or clearing
 * `barcode` on soft delete. Both are migrations with their own ticket, and
 * both would change a `unique` index — see the redeploy rule above.
 *
 * WHAT MOVED, AND WHAT DIDN'T
 * ---------------------------
 * Moved: the fields, all six indexes, the options, the `totalCalories`
 * virtual, the `isGlobal` instance method, the `source` enum — and the
 * `findOrCreate` dedupe ladder, which is the one carve-out from the plan's
 * "statics stay app-side" rule (§4 pair 8, §10 carry-forward #4).
 *
 * `findOrCreate` earns the carve-out because it is not an ownership policy: it
 * is the only thing stopping the two writers minting duplicate catalog rows
 * for the same USDA / OpenFoodFacts item. A divergence there does not throw —
 * it quietly forks the catalog. So the *lookup order and the global-row
 * creation* live here, as `findOrCreateFoodItem(Model, foodData)`, and each
 * app keeps a one-line static that delegates to it. The pure halves —
 * `foodItemDedupeFilters` and `newFoodItemAttrs` — are exported by name so a
 * hermetic suite with no database can assert the ladder and the defaults,
 * exactly as `applyLoginToStreak` and `sumMealNutrition` are.
 *
 * Did NOT move — every static that expresses *who may see what*:
 *
 *   | static              | fitnessgeek | basegeek                          |
 *   |---------------------|-------------|-----------------------------------|
 *   | `search`            | present     | present, byte-identical            |
 *   | `findAccessible`    | absent      | `requireUser` + `foodCatalogFilter`|
 *   | `findAccessibleMany`| absent      | `requireUser` + `foodCatalogFilter`|
 *
 * `search` is identical on both sides today and §4 originally said to promote
 * it with `findOrCreate`. It was deliberately left app-side, because it is an
 * ownership-scoping read and the two sides do not in fact agree about what a
 * visible catalog row is: `search` matches `{ user_id: null }` while
 * `foodCatalogFilter` (which `findAccessible` uses, in the same file) also
 * matches `{ user_id: { $exists: false } }`. A legacy row with no `user_id`
 * key at all is therefore reachable through one and not the other. Promoting
 * `search` would freeze one of two live definitions of catalog visibility into
 * the shared contract; a read static has no corruption failure mode, so there
 * is nothing to buy for that price. Reconciling the two filters is its own
 * ticket.
 *
 * WHERE THE ACCESSIBILITY RE-CHECK LIVES
 * --------------------------------------
 * The dedupe queries below are deliberately unscoped — that is how a global
 * catalog row gets shared. The gateway therefore puts the resolved row through
 * `FoodItem.findAccessible` afterwards, so that a crafted `(name, brand)`
 * cannot hand back another user's PRIVATE custom food. **That re-check lives
 * in the resolver** (`resolvers.js`, `resolveLogFoodItem`), not in the static,
 * and it is not replicated here: `findOrCreateFoodItem` returns whatever the
 * ladder resolved to, on both sides, exactly as both shipped copies did.
 * fitnessgeek's REST side has no equivalent re-check and no live caller of
 * `findOrCreate` at all today (grepped 2026-09-05: the only reference in that
 * app is the declaration itself).
 *
 * WHY `mongoose` IS A PARAMETER, AND WHY THIS MODULE IS CJS
 * --------------------------------------------------------
 * Same reasons as `weight.js`, `meal.js` and `userSettings.js`: the consumers
 * own their own mongoose instances (a `Schema` built by instance A fails
 * `instanceof` inside instance B's `Connection.model()`), and a CJS module
 * with a literal `module.exports = { … }` is statically readable by Node's
 * ESM→CJS interop from both of them with no build step.
 */

/**
 * The `source` enum — catalog provenance. Frozen so a consumer cannot mutate
 * the contract.
 *
 * Copies still out there, all read-only and all out of this pass's scope:
 *   - fitnessgeek's frontend switch statements
 *     (`components/MyFoods/FoodSourceUtils.jsx`, `FoodSearch/FoodSearch.jsx`,
 *     `FoodSearch/FoodCard.jsx`, `FoodSearch/CompositeResolver.jsx`) map a
 *     source to a label/colour/icon. Frontend is out of scope here.
 *   - `apps/fitnessgeek/backend/src/services/foodQualityService.js:5` scores
 *     sources for ranking — a partial list with numbers attached, not an enum.
 *   - `apps/basegeek/packages/api/src/graphql/fitnessgeek/typeDefs.js:263`
 *     restates it in a doc comment; GraphQL types it as `String`.
 * None is a two-writer hazard. Fold them in whenever those files are touched.
 */
const FOOD_SOURCES = Object.freeze([
  'nutritionix',
  'usda',
  'openfoodfacts',
  'custom',
  'ai',
  'fatsecret',
]);

/**
 * The numeric floors the schema enforces, exported so a request validator can
 * stop restating them. There is no zod validator for this collection today
 * (`src/validation/schemas/` has no `foodItem.js` — checked 2026-09-05), so
 * nothing imports these yet; they are here for the same reason
 * `bloodPressureBounds` is.
 */
const foodItemBounds = Object.freeze({
  nutrition: Object.freeze({ min: 0 }),
  serving: Object.freeze({ size: Object.freeze({ min: 0.1 }) }),
});

/** The defaults `findOrCreate` fills a new global row in with. */
const foodItemDefaults = Object.freeze({
  serving: Object.freeze({ size: 100, unit: 'g' }),
  source: 'custom',
});

/**
 * The field definitions, as a plain object literal.
 *
 * `nutrition` and `serving` are nested *objects*, not sub-schemas — mongoose
 * flattens them into dotted paths (`nutrition.calories_per_serving`, …), which
 * is why `describePath()` sees their bounds directly and no separate
 * sub-schema comparison is needed the way `Meal.food_items` needs one.
 *
 * `user_id` is a plain `String` with no default: a **global** catalog row is
 * one where it is absent/null, and `isGlobal()` is the predicate. `barcode` is
 * the only unique path in the set — see the header.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {Object} a definition object suitable for `new mongoose.Schema(...)`
 */
function foodItemDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/foodItem: pass your own mongoose instance'
    );
  }

  return {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    brand: {
      type: String,
      trim: true,
      index: true
    },
    barcode: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    nutrition: {
      calories_per_serving: {
        type: Number,
        required: true,
        min: 0
      },
      protein_grams: {
        type: Number,
        default: 0,
        min: 0
      },
      carbs_grams: {
        type: Number,
        default: 0,
        min: 0
      },
      fat_grams: {
        type: Number,
        default: 0,
        min: 0
      },
      fiber_grams: {
        type: Number,
        default: 0,
        min: 0
      },
      sugar_grams: {
        type: Number,
        default: 0,
        min: 0
      },
      sodium_mg: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    serving: {
      size: {
        type: Number,
        required: true,
        min: 0.1
      },
      unit: {
        type: String,
        required: true,
        default: 'g'
      }
    },
    source: {
      type: String,
      required: true,
      enum: FOOD_SOURCES,
      index: true
    },
    source_id: {
      type: String,
      index: true
    },
    user_id: {
      type: String,
      index: true
    },
    is_deleted: {
      type: Boolean,
      default: false,
      index: true
    }
  };
}

const foodItemOptions = {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
};

/**
 * The dedupe ladder, as data.
 *
 * Order is the contract, not a detail: barcode is a global identifier, then
 * `(source, source_id)` pins a specific row in a specific upstream catalog,
 * and `(name, brand)` is the last-resort match for hand-entered foods. Every
 * rung also requires `is_deleted: false`, so a soft-deleted row is never
 * resurrected by a lookup — a fresh one is minted instead.
 *
 * All three are deliberately **unscoped by user**: that is what makes a global
 * catalog row shared rather than re-created per user. The gateway's caller
 * re-checks accessibility afterwards; see the header.
 *
 * @param {Object} foodData - the incoming food, in the Mongoose shape.
 * @returns {Array<{by: string, filter: Object}>} the rungs that apply to this
 *   input, in evaluation order. A rung whose inputs are missing is omitted.
 */
function foodItemDedupeFilters(foodData = {}) {
  const rungs = [];

  // Try to find existing food by barcode first
  if (foodData.barcode) {
    rungs.push({
      by: 'barcode',
      filter: { barcode: foodData.barcode, is_deleted: false },
    });
  }

  // Try to find by source and source_id
  if (foodData.source && foodData.source_id) {
    rungs.push({
      by: 'source',
      filter: { source: foodData.source, source_id: foodData.source_id, is_deleted: false },
    });
  }

  // Try to find by name and brand (for custom foods)
  if (foodData.name && foodData.brand) {
    rungs.push({
      by: 'name_brand',
      filter: { name: foodData.name, brand: foodData.brand, is_deleted: false },
    });
  }

  return rungs;
}

/**
 * The attributes a brand-new catalog row is created with when no rung matched.
 *
 * Two things here are behaviour, not formatting, and both shipped on both
 * sides:
 *
 *   - **`user_id: null` — always.** `findOrCreate` mints a GLOBAL row even
 *     when the caller passed a userId. The private-custom-food path is a
 *     different call (`addFitnessFood` on the gateway, `POST /api/foods` on
 *     REST), which sets `user_id` itself.
 *   - **`||`, not `??`.** A `0` for any nutrition value, a `0` serving size,
 *     or an empty-string source falls back to the default. That is the shipped
 *     coercion; it is why a zero-calorie food gets `calories_per_serving: 0`
 *     either way but a `serving.size` of `0` becomes `100`.
 *
 * Fields not named here (`is_deleted`, `created_at`, `updated_at`) come from
 * the schema's own defaults and `timestamps`.
 *
 * @param {Object} foodData
 * @returns {Object} attributes for `new Model(...)`.
 */
function newFoodItemAttrs(foodData = {}) {
  return {
    name: foodData.name,
    brand: foodData.brand,
    barcode: foodData.barcode,
    nutrition: {
      calories_per_serving: foodData.nutrition?.calories_per_serving || 0,
      protein_grams: foodData.nutrition?.protein_grams || 0,
      carbs_grams: foodData.nutrition?.carbs_grams || 0,
      fat_grams: foodData.nutrition?.fat_grams || 0,
      fiber_grams: foodData.nutrition?.fiber_grams || 0,
      sugar_grams: foodData.nutrition?.sugar_grams || 0,
      sodium_mg: foodData.nutrition?.sodium_mg || 0
    },
    serving: {
      size: foodData.serving?.size || foodItemDefaults.serving.size,
      unit: foodData.serving?.unit || foodItemDefaults.serving.unit
    },
    source: foodData.source || foodItemDefaults.source,
    source_id: foodData.source_id,
    user_id: null
  };
}

/**
 * Resolve an incoming food to a catalog row, creating a global one if no rung
 * of the dedupe ladder matched.
 *
 * This is the carve-out from the statics policy: the ladder has ONE correct
 * meaning for both writers, and a divergence in it forks the catalog rather
 * than throwing. Each app's model keeps a thin `findOrCreate` static that
 * calls this, so there is exactly one implementation.
 *
 * The `Model` is a parameter rather than `this` so the function can be called
 * — and asserted — without a schema, the same way `applyLoginToStreak` takes
 * the streak.
 *
 * @param {import('mongoose').Model} Model - the caller's compiled FoodItem model.
 * @param {Object} foodData - the incoming food, in the Mongoose shape
 *   (nested `nutrition` and `serving`, not the GraphQL flat form).
 * @returns {Promise<import('mongoose').Document>} the matched or created row.
 */
async function findOrCreateFoodItem(Model, foodData = {}) {
  if (!Model || typeof Model.findOne !== 'function') {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/foodItem: findOrCreateFoodItem needs a compiled model'
    );
  }

  for (const rung of foodItemDedupeFilters(foodData)) {
    const existing = await Model.findOne(rung.filter);
    if (existing) return existing;
  }

  // Create new food item
  const foodItem = new Model(newFoodItemAttrs(foodData));
  return await foodItem.save();
}

/**
 * Attach the shared virtual. Split out so a consumer that builds the schema by
 * hand (a migration script, say) can still get it.
 *
 * Note the schema passes no `toJSON`/`toObject` options, so this virtual is
 * NOT serialized — a caller has to read `doc.totalCalories` explicitly. That
 * is what both sides shipped.
 *
 * @param {import('mongoose').Schema} schema
 */
function attachFoodItemVirtuals(schema) {
  // Virtual for total calories calculation
  schema.virtual('totalCalories').get(function totalCalories() {
    return this.nutrition.calories_per_serving;
  });
}

/**
 * Attach the shared instance methods.
 *
 * `isGlobal()` is the catalog's ownership predicate: a row with no `user_id`
 * is visible to everybody. It reads a declared path and its answer decides
 * whether a row is shared, so it belongs with the fields — a divergence would
 * not throw, it would quietly disagree about who owns a food.
 *
 * @param {import('mongoose').Schema} schema
 */
function attachFoodItemMethods(schema) {
  // Method to check if food is global (not user-specific)
  schema.methods.isGlobal = function isGlobal() {
    return !this.user_id;
  };
}

/**
 * Build a fresh `FoodItem` schema — indexes, virtual and instance method
 * included.
 *
 * Six indexes: four path-level (`name`, `brand`, `source`, `source_id`,
 * `user_id`, `is_deleted` all carry `index: true`, and `barcode` carries
 * `unique: true, sparse: true`), four compound, and one text index. See the
 * header before changing any flag on the unique one.
 *
 * Statics are deliberately NOT attached here. `findOrCreate` delegates to
 * `findOrCreateFoodItem` from each app's own model file; `search` and
 * basegeek's `findAccessible` / `findAccessibleMany` express ownership policy
 * and stay app-side. See the header.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {import('mongoose').Schema}
 */
function createFoodItemSchema(mongoose) {
  const schema = new mongoose.Schema(foodItemDefinition(mongoose), foodItemOptions);

  // Compound indexes for better query performance
  schema.index({ name: 1, brand: 1 });
  schema.index({ source: 1, source_id: 1 });
  schema.index({ is_deleted: 1, user_id: 1 });
  schema.index({ barcode: 1, is_deleted: 1 });  // For barcode lookups in findOrCreate

  // Text search index
  schema.index({ name: 'text', brand: 'text' });

  attachFoodItemVirtuals(schema);
  attachFoodItemMethods(schema);

  return schema;
}

module.exports = {
  FOOD_SOURCES,
  foodItemBounds,
  foodItemDefaults,
  foodItemDedupeFilters,
  newFoodItemAttrs,
  findOrCreateFoodItem,
  attachFoodItemVirtuals,
  attachFoodItemMethods,
  foodItemDefinition,
  foodItemOptions,
  createFoodItemSchema,
};
