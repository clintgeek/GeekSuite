/**
 * openFoodFactsNutrition.js — one normalizer for OpenFoodFacts `nutriments`.
 *
 * TWO BUGS THIS REPLACES, AND WHY THEY NEEDED THE SAME FIX
 * -------------------------------------------------------
 * OpenFoodFacts was transformed in two places — `foodApiService`
 * (`transformOpenFoodFacts`, reached by TEXT SEARCH) and `unifiedFoodService`
 * (reached by BARCODE SCAN) — and the two disagreed about the same product.
 *
 * 1. SODIUM WAS 1000x LOW ON THE SEARCH PATH. OFF reports `sodium_*` in
 *    GRAMS. `unifiedFoodService` multiplied by 1000 into its milligram field;
 *    `foodApiService` did not. A tin of soup at `sodium_100g: 0.89` (890 mg)
 *    logged as **0.9 mg** when found by typing and **890 mg** when found by
 *    scanning. Anyone watching sodium saw essentially zero for everything they
 *    reached by search.
 *
 * 2. PER-100g NUMBERS WERE STORED AS A PER-SERVING AMOUNT, IN BOTH. The
 *    `*_serving` fields are only populated when a contributor entered a serving
 *    size, which is often not the case; the `*_100g` fallback is per 100 g and
 *    has to be scaled. `foodApiService` computed `servingRatio = servingSize /
 *    100` and then never referenced it — the variable sat there unused while
 *    the record claimed "one serving = 15 g" and carried the numbers for 100 g.
 *    A hazelnut-spread-shaped product (539 kcal, 57.5 g carbs per 100 g, 15 g
 *    serving) logged as 539 kcal and 57.5 g carbs instead of 81 and 8.6 —
 *    6.7x over, and 57.5 g of net carbs against a 20 g keto cap.
 *
 * Both paths now call this, so a product cannot read differently depending on
 * how it was found.
 *
 * THE RULE, PER FIELD
 * -------------------
 * `X_serving` is already the amount in one serving: use it as-is. `X_100g` is
 * per 100 g: scale it by `servingSize / 100`. Mixing the two — taking
 * `X_serving` when present and an UNSCALED `X_100g` otherwise — is exactly the
 * bug above, and it is invisible whenever `serving_size` happens to be 100 g,
 * which is why it survived.
 */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * One nutrient, in per-serving terms.
 *
 * @param {*} servingValue the `X_serving` field (already per serving)
 * @param {*} per100gValue the `X_100g` field (per 100 g, needs scaling)
 * @param {number} ratio `servingSize / 100`
 * @returns {number} 0 when neither field is usable — the same "no data reads
 *   as zero" the callers already had, kept deliberately so this change is
 *   about the SCALING and not about introducing nulls into a dozen call sites.
 */
export function perServing(servingValue, per100gValue, ratio) {
  const direct = num(servingValue);
  if (direct !== null) return direct;
  const per100 = num(per100gValue);
  if (per100 === null) return 0;
  return per100 * ratio;
}

/**
 * Normalize an OFF `nutriments` block to this app's per-serving shape.
 *
 * @param {Object} nutriments the product's `nutriments`
 * @param {number} servingSize grams in one serving (100 when unknown, which
 *   makes the scaling a no-op and matches the callers' existing default)
 * @returns {Object} `{calories_per_serving, protein_grams, carbs_grams,
 *   fat_grams, fiber_grams, sugar_grams, sodium_mg}`
 */
export function normalizeOpenFoodFactsNutrition(nutriments = {}, servingSize = 100) {
  const size = num(servingSize);
  const ratio = size && size > 0 ? size / 100 : 1;

  // Energy: prefer the kcal fields, and fall back to the kJ one converted.
  // 1 kcal = 4.184 kJ. The kJ fallback is per 100 g like its neighbours, so it
  // is scaled too — it was not before.
  let calories = num(nutriments['energy-kcal_serving']);
  if (calories === null) {
    const kcal100 = num(nutriments['energy-kcal_100g']);
    if (kcal100 !== null) {
      calories = kcal100 * ratio;
    } else {
      const kj100 = num(nutriments.energy_100g);
      calories = kj100 !== null ? (kj100 / 4.184) * ratio : 0;
    }
  }

  return {
    calories_per_serving: Math.round(calories),
    protein_grams: round1(perServing(nutriments.proteins_serving, nutriments.proteins_100g, ratio)),
    carbs_grams: round1(perServing(nutriments.carbohydrates_serving, nutriments.carbohydrates_100g, ratio)),
    fat_grams: round1(perServing(nutriments.fat_serving, nutriments.fat_100g, ratio)),
    fiber_grams: round1(perServing(nutriments.fiber_serving, nutriments.fiber_100g, ratio)),
    sugar_grams: round1(perServing(nutriments.sugars_serving, nutriments.sugars_100g, ratio)),
    // GRAMS in the source, milligrams in our field. Both branches convert —
    // the search path used to convert neither.
    sodium_mg: round1(perServing(nutriments.sodium_serving, nutriments.sodium_100g, ratio) * 1000),
  };
}

export default { normalizeOpenFoodFactsNutrition, perServing };
