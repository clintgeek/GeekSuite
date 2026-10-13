# Recipes in My Foods — Plan

*Status: DRAFT, 2026-10-13. Chef chose "Both": an ingredient builder at the core,
with pasted recipe text as a second way to fill it. Decisions marked **(Chef?)**
are Sage's defaults and stand unless Chef says otherwise.*

## 1. What a recipe is

A recipe is a **custom food that remembers its ingredients.** It is a `FoodItem`
(`source: 'custom'`, owned) with an extra `recipe` sub-document:

```
recipe: {
  yield_servings: Number,          // "Makes 6 servings" — required, > 0
  ingredients: [{
    food_item_id: ObjectId | null, // catalog row it came from, when there is one
    name: String,                  // snapshot, shown in the editor
    amount: Number,                // what the person typed: 1
    unit: String,                  // ...and its unit: "lb", "cup", "serving"
    servings: Number,              // that amount in the ingredient's own servings
    nutrition: { calories_per_serving, protein_grams, carbs_grams, fat_grams,
                 fiber_grams, sugar_grams, sodium_mg }  // per ONE ingredient serving, snapshot
  }]
}
```

The food's own `nutrition` is **per serving of the recipe** =
Σ(ingredient.nutrition × ingredient.servings) ÷ yield_servings. Serving is
`{ size: 1, unit: 'serving' }`.

Because a recipe *is* a food, everything that already works on foods works on
it without changes: search, the typeahead, describe-and-log ("a bowl of chili"),
favourites, recents, saved meals, and the household.

### Why snapshots, not live links
Ingredient nutrition is copied in at save time. A shared catalog row changing
later must not silently change a recipe, just as `FoodLog.nutrition` snapshots
for the same reason. Editing the recipe re-snapshots the ingredients you touch.

### Who computes the totals
The **server** (gateway `addFitnessFood` / `updateFitnessFood`) recomputes the
per-serving `nutrition` from `recipe` whenever `recipe` is sent, and ignores any
client-sent `nutrition` in that case. The client shows a live preview using the
same pure function (shared in `packages/schemas/fitnessgeek`), so the two can
never disagree.

## 2. The builder (My Foods → "New recipe")

Phone first: a full-screen sheet.

1. **Name.** Required.
2. **Ingredients.** "Add ingredient" opens the same search the logger uses
   (suggest + deep search). Pick a food, then set an amount:
   - Units offered: `serving` always; plus `g`, `oz`, `lb` when the food's serving
     is in grams; `ml`, `cup`, `tbsp`, `tsp`, `fl oz` when it is in ml. Converted
     to `servings` for the math. **(Chef?)** No volume↔weight guessing: a gram
     food cannot be measured in cups.
   - Each row shows its kcal, and you can edit or remove it.
3. **Makes N servings.** Required; decimals allowed (2.5).
4. **Live total**: per serving kcal and P/C/F, plus the batch total.
5. **Save.** The recipe appears in My Foods tagged *Recipe*, and can be logged at once.

Editing a recipe opens the same sheet, pre-filled. Deleting a recipe works like
deleting any food.

## 3. Paste to fill

In the builder: **"Paste ingredients"**. Paste a list, one ingredient per line;
blank lines and headings ("Ingredients:", "For the sauce") are ignored.

`POST /api/foods/recipe/parse { text }` on the FitnessGeek backend:
- each line → `parseFragment` (quantity + unit + food words), the parser
  describe-and-log already uses;
- then `resolveEntries` (history → catalog → AI estimate), as describe-and-log does;
- **nothing is logged and nothing is saved.** It returns one row per line:
  `{ line, name, food_item_id?, amount, unit, servings, nutrition, confidence }`,
  or `{ line, unresolved: true }`.

The rows land in the builder's ingredient list for **review**: unresolved lines
show in a warning state with "Pick a food". Nothing is saved until Save. **(Chef?)**
AI-estimated lines carry an "estimate" marker, so you know which to check.

Recipe text never needs to leave the box except through the existing aiGeek
estimate path describe-and-log already uses (same `need:` routing, same caps).

## 4. Where it shows

- **My Foods**: a "New recipe" button. Recipes carry a *Recipe* label and their
  serving count. My Foods currently has no "New food" button, though its empty state
  promises one. **(Chef?)** Add "New food" beside "New recipe" (the existing create
  form from `/food-search`).
- **Logging a recipe**: unchanged. 1 serving = 1/N of the batch.

## 5. Out of scope (later, if wanted)
- Weighing the cooked batch ("I ate 340 g of a 2.1 kg pot").
- Importing from a URL.
- Sharing recipes with the household (the household shares *logs* and *meals* today).
- Scaling a recipe up or down.

## 6. Build order and deploy

1. `packages/schemas/fitnessgeek/foodItem.js`: the `recipe` sub-document, plus a
   pure `recipeNutrition(recipe)` with unit tests.
2. Gateway: `FitnessRecipe` / `FitnessRecipeInput` types; add/update
   recompute; `fitnessFoods` selects it. Full API suite; **push and confirm live
   before step 4** (schema-before-UI rule).
3. FitnessGeek backend: `POST /api/foods/recipe/parse`, tested.
4. Frontend: the builder sheet, paste, and the My Foods buttons and labels. Tests
   are reverted-to-red; run the harness with `--enforce-a11y` locally before pushing.
5. Work log entry; CONTEXT.md note.

## 7. Done means
- Chef builds "Chili" from 5 ingredients on his phone, says it makes 6, saves, and
  logs 1 serving. The log shows ⅙ of the batch's calories.
- Pasting a 10-line ingredient list fills the builder. Every line is either
  matched (with its amount) or visibly unresolved. Nothing is logged.
- Describe-and-log "a bowl of chili" finds the recipe.
- Editing the recipe changes future logs only; past logs keep their snapshot.
