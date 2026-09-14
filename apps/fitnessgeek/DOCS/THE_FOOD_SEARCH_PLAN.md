# FitnessGeek — The Food Search Plan

*Proposal, 2026-09-14. Nothing here is built yet.*

Food search is the app's front door: it is the one thing a person does three to five
times a day, and everything else in FitnessGeek is downstream of it. Today it is the
slowest, noisiest, least certain surface in the suite. This document says exactly why,
and what to do about it.

The target, stated once so every decision below can be checked against it:

> **One box. Results while you type. The right food in the top three. Two taps to log it.**

---

## 0. Status — 2026-09-14

Phases 1–6 **built and green**. Not yet deployed; not yet seen on a phone.

| Phase | State |
|---|---|
| 1 — Make it instant | Done. `GET /api/foods/suggest`, 150ms/400ms two-wave box, cache + breakers restored, parallel fragments. |
| 2 — Understand the query | Done. `foodQueryParser.js`, head-noun rule, grounding guard, dish-first resolution. |
| 3 — Rank like we mean it | Done. `foodRanker.js`, token-based personal matching, AI demoted, ownership scoping. |
| 4 — One surface | Done. Rows, one-tap-with-undo, inline box on Food Log, real `/food-search`, create-what-you-typed row. |
| 5 — Delete | Done. 7 components removed, plus the orphaned AI Assist switch and its plumbing. |
| 6 — Prove it | Done. 84 new tests, pino argument order fixed, search telemetry added. |

**Verification:** backend 459 tests / 27 suites green; frontend 137 tests / 19 files green;
`tools/syntax-check.mjs` clean over 874 files; `tools/gql-arg-audit.mjs` clean; production
build succeeds. The mobile harness has not been run locally — CI owns it.

**One thing the fixture tests missed.** Ranking was first gated on a points floor
(`DISH_CONFIDENCE_FLOOR = 300`). Checked against a live USDA response for
`4 chocolate chip pancakes homemade`, the correct winner — "Pancakes, chocolate" — scored
**213**, because real catalog names drop words. The floor would have declared the dish
unresolved and decomposed it into chocolate chips: the exact bug this work exists to fix,
reintroduced one layer down. Confidence is now structural (`foodRanker.isConfidentMatch`:
head noun present, ≥50% token coverage, has calories) and the real USDA response is pinned as
a fixture in `foodRanker.test.js`.

**Still to do:** deploy, then walk the named queries in §4.1 on a real phone.

---

## 1. What's actually wrong

Evidence first. Every claim below is a file, a line, or a production log measurement.

### 1.0 The headline: the classifier shreds one dish into its ingredients

This is the bug Chef hit, and it is the most damaging thing in the app. Reproduced
2026-09-14 by calling `aiFoodService.classifyFoodInput` directly inside the running
container:

```
"4 chocolate chip pancakes homemade"
  → type: composite
    items: [ {name: "chocolate chip", quantity: 4}, {name: "pancakes"}, {name: "pancake mix"} ]

"chocolate chip pancakes"
  → type: composite
    items: [ {name: "chocolate"}, {name: "pancake"}, {name: "chocolate chip"} ]

"peanut butter and jelly sandwich"
  → type: composite
    items: [ {name: "peanut butter"}, {name: "jelly"}, {name: "bread"} ]

"greek yogurt with honey and granola"
  → items: [ "greek yogurt", "honey", "granola", "granola" ]   ← duplicated
```

One dish becomes three ingredient searches. Each is then searched *separately*
(`searchComposite`), each returns ingredient-shaped results, and the composite resolver
auto-stages the best of each bogus group into the tray. You typed the name of a food and got
a bag of chocolate chips, a box of pancake mix, and no pancakes.

**Cause.** `aiFoodService.buildClassificationPrompt` (`:519`) opens with:

> `CRITICAL: Extract EVERY distinct food item mentioned. Split on "and", commas, or implicit separators.`

The prompt commands maximal decomposition and every one of its examples reinforces it. There
is no concept of a **dish** — a modifier-plus-noun phrase that names one food. So
"chocolate chip pancakes" reads as an instruction to split on an implicit separator.

Two aggravating factors:
- **`homemade` became `pancake mix`.** A preparation adjective was turned into an invented
  ingredient that appears nowhere in the input. Nothing validates the model's items against
  the text it was given.
- **The quantity landed on the wrong noun.** `4` attached to "chocolate chip", not to the
  pancakes.

This is not a tuning problem. Decomposition is the wrong default: it should be the exception,
reached only when the text actually separates two foods.

### 1.1 You cannot type and see — search is submit-only

`components/FoodSearch/SearchBar.jsx:35` fires `onSubmit` on Enter, and
`UnifiedFoodSearch.jsx`'s `handleSearchSubmit` is the only other caller. There is **no
debounce anywhere in the live search path**. You type, you stop, you press Enter or hit a
send arrow, you wait, then you find out you typed the wrong thing.

The joke is that the *dead* component got this right:
`components/FoodSearch/FoodSearch.jsx:72` — 412 lines of legacy component, still the
default export of `components/FoodSearch/index.js`, zero callers — has a 300ms debounced
search effect.

This single fact is most of the "embarrassing" feeling. Every search box a person has
touched in the last decade answers while they type.

### 1.2 Ranking is arrival order, not relevance — on the most common query shape

`unifiedFoodService.js:507-523`: both `shouldUseAIScoring` and `shouldUseAIClassification`
bail out for any query of **≤3 words that isn't sentence-shaped**. That is nearly every
real query: "chicken breast", "greek yogurt", "cheddar", "Pure Protein bar".

Those queries therefore route to `searchAPIs` (`:638`), which:
1. fires local DB + FatSecret + `foodApiService` in parallel,
2. concatenates them **in source order**,
3. calls `deduplicateResults` — which preserves insertion order and applies no score,
4. returns.

No lexical sort is applied on this path at all. `basicLexicalSort` exists (`:415`) but is
only ever called from `searchRawIngredient`. Then the frontend "ranks"
(`UnifiedFoodSearch.jsx:706-713`) by `sanityRank` then `aiRelevanceScore` — both `undefined`
on this path, so every item ties, `Array.prototype.sort` is stable, and source order
survives intact into the UI.

**The "Best Matches" heading sits above whichever three results the fastest API happened to
return first.** That is the bug that makes the feature feel broken, and it is a dozen lines
to fix.

### 1.3 It is slow, and the slowness is self-inflicted

Measured from the production container's own request log (`responseTime`, ms):

| Query | Time |
|---|---|
| `pancakes` | 722 ms |
| `homemade pancakes` | 772 ms |
| `Pure Protein Chocolate Peanut caramel` | 3 458 ms |
| `4 chocolate chip pancakes homemade` | 5 356 ms |

Three causes, all avoidable:

- **The cache is bypassed on the AI path.** `foodApiService.searchFoods` is Redis-wrapped
  with a 7-day TTL (`foodApiService.js:29-32`), and FatSecret has its own 7-day cache
  (`fatSecretService.js:134`). But `searchRawIngredient` (`:298`) calls
  `this.searchUSDA` / `this.searchOpenFoodFacts` **directly** — raw axios, 8s timeouts, no
  cache. The generic-food path pays full upstream latency every single time.
- **Composite queries are sequential.** `searchComposite` (`:199`) loops items with `await`
  inside a `for`. Four items = four serial round trips, each of which may itself make an
  AI relevance call (20s timeout each, `aiFoodService.js:337`).
- **Two LLM calls do the job of zero.** `applySanityCheck` (`:681`) calls
  `scoreResultsRelevance` *and then* `sanityCheckResults`. The second call's entire output —
  `sanityCheckPassed`, `sanityCheckIssues`, `sanityCheckConfidence` — **is never rendered
  anywhere in the frontend** (grep: zero hits outside the service). It is a 20-second
  timeout budget spent on fields nobody reads.

Worst case for a four-item sentence: 1 classify (30s cap) + 4×(USDA+OFF+CalorieNinjas) +
4× AI scoring (20s each) + 1 scoring + 1 sanity check. The UI shows a spinner for all of it.

### 1.4 The Mongo text index is paid for and unused

`packages/schemas/fitnessgeek/foodItem.js:536` declares `{ name: 'text', brand: 'text' }`.
The live search path ignores it: `unifiedFoodService.searchLocalDB` (`:728`) does
`{ name: { $regex: query, $options: 'i' } }` — an unanchored, uncased regex, i.e. a
collection scan, on every keystroke-worth of search. The comment at
`models/FoodItem.js:65` even says so out loud: *"Simple regex search instead of text search."*

### 1.5 Local search is not ownership-scoped

`FoodItem.search` (`models/FoodItem.js:57`) applies `foodCatalogVisibilityFilter(userId)` —
the one correct definition of "a catalog row this person may see" — and **has no callers**.
The live path, `unifiedFoodService.searchLocalDB`, filters on `is_deleted: false` and
nothing else. Another household member's private custom foods are reachable from your
search results. Small blast radius on a family instance; still wrong, and free to fix.

### 1.6 Personalisation matches on the whole phrase

`buildQueryRegex` (`:1174`) escapes the **entire query** into a single regex and
`getUserPreferenceResults` (`:1025`) tests names against it. So your own saved
"Fage Total 0% Greek Yogurt" does not surface for `greek yogurt 0` — the literal phrase
isn't a substring. No tokenisation, no fuzz. Meanwhile preference results are *prepended*
and may occupy up to 20 of the 25 slots (`USER_PREFERENCE_LIMIT`), crowding out the search
they were supposed to enrich.

**Latent bug riding on this:** preference results carry no `compositeItem`.
`isCompositeResult` uses `.some()`, and `groupCompositeResults` walks the merged array from
index 0 — so a preference hit on a composite query mints a phantom group with
`item: undefined`, which the auto-stage effect (`UnifiedFoodSearch.jsx:213`) then stages
into the tray. Rare today only because §1.6's whole-phrase regex almost never matches.

### 1.7 It takes four interactions to reach a text field

`/food-search` (`pages/FoodSearch.jsx`) is not a search page. It is a 177-line marketing
panel — a wand icon, a headline, a paragraph, and one button — whose only job is to open
`AddFoodDialog`, whose Search tab hosts the actual input.

Nav → page → "Open Food Entry" → dialog → (already on Search tab) → field.

And because the dialog unmounts on close, every open re-fires three network requests
(`getRecentLogs`, `getMeals`, `getCustomFoods` — `UnifiedFoodSearch.jsx:229-231`) before the
box is usable.

### 1.8 Four competing ways to find the same food

| Surface | Where | What it does |
|---|---|---|
| `QuickAddPanel` | Food Log, collapsed by default | Favorites / Recent, own tabs, own fetches |
| `NaturalLanguageQuickAdd` | Food Log, sheet | AI sentence → proposal rows |
| `UnifiedFoodSearch` | inside `AddFoodDialog` | search + its own AI parse + its own recent + meals + custom lists |
| `/my-foods`, `/my-meals` | Tools nav | their own searches again |

Four doors, no obvious one. `UnifiedFoodSearch` alone renders three separately-collapsible
browse sections (My Meals, Recent Foods, My Foods), each with its own Show/Hide button,
stacked above the results.

### 1.9 The results are built for browsing, not scanning

`FoodCard` is 457 lines: image header, 460ms staggered entrance, hover lift, badge pop
animation, source chips. Rendered two-per-row in the dialog (`md={6}`), you see roughly four
results without scrolling. A 56px row showing name / brand / kcal / P-C-F shows twelve.

### 1.10 Dead ends and dead code

- **No escape hatch.** "Nothing found → *Try a different phrase or scan a barcode*". There is
  no "create '<what you just typed>'" — even though a Custom tab exists two clicks away and
  `foodService.create` is right there.
- **`AddFoodModal`** (446 lines) is imported and rendered by `UnifiedFoodSearch`, gated on
  `modalFood`, which **nothing ever sets**. Dead behind live state.
- **The Barcode tab** switches tab *and* opens the scanner on click; the tab content you land
  on then tells you to click an icon to open the scanner you already opened.
- **`filterRelevantResults`** (`:344`) is marked DEPRECATED in its own docblock.
- Two different recent-foods fetchers (`fitnessGeekService.getRecentLogs` in the component,
  `foodService.getRecent` → `GET /foods/recent` in `QuickAddPanel`) for the same list.

### 1.11 We cannot see any of this in the logs

`logger` is pino, whose signature is `logger.info(mergingObject, message)`. Every structured
log call in the search path has the arguments backwards — `logger.info('Food search', {
userId, query, count, sources })` (`unifiedFoodService.js:36`, `:112`, `:194`, and ~15 more).
Pino takes the string as the message and discards the object. Production log lines for a
search read, in their entirety:

```json
{"level":30,"time":...,"name":"fitnessgeek","msg":"Food search"}
```

No query, no result count, no sources, no classification. The one thing that would have made
§1.0 obvious years ago has been silently thrown away on every call. Fixing the argument order
is a mechanical sweep and it is a prerequisite for Phase 5 being worth anything.


---

## 2. The target experience

What "sleek, low-friction, sexy" means here, concretely:

0. **A query is one dish until the text says otherwise.** "Chocolate chip pancakes" is a
   food, not a shopping list. Decomposition happens when the person wrote a separator, or
   when they ask for it — never as a silent guess.
1. **The box is already there.** Top of Food Log, top of `/food-search`, inside the meal-slot
   "+" sheet. Same component, three mounts, autofocused where it's the point of the screen.
2. **It answers in under 200ms.** From your own catalog — favorites, recents, custom foods,
   saved meals, previously-logged foods — before a single external API is touched.
3. **The rest arrives without blocking.** USDA / OpenFoodFacts / FatSecret results slide in
   underneath, the list re-ranks in place, nothing you were about to tap moves.
4. **AI is a garnish, never the gate.** A sentence ("two eggs and a slice of toast") is
   detected and parsed — but the local results paint first, always.
5. **Rows, not cards.** Name, brand, kcal, P/C/F, serving, one source dot. 44px+ tap target
   (the mobile harness enforces this). Twelve visible instead of four.
6. **One tap logs it** with a sensible default serving and an undo snackbar. The serving
   editor is a second tap for the people who want it, not a toll for everyone.
7. **It never dead-ends.** The last row is always *Create "goat cheese crostini"* →
   prefilled custom-food form.

---

## 3. The work

Six phases. Each is independently shippable; stop after any one and the app is better than it
is today. Chef has approved the full run (2026-09-14).

### Phase 1 — Make it instant

*Goal: first results under 200ms, typed-into, with no external dependency.*

1. **New endpoint `GET /api/foods/suggest?q=`** — local only. Mongo `$text` against the
   existing `{name, brand}` index, unioned with the user's favorites, recent logs, custom
   foods and saved meals. Ownership-scoped via `foodCatalogVisibilityFilter`. No external
   HTTP, no AI. Budget: 100ms p90.
2. **Debounce the input at 150ms** and call `suggest` on every pause. The send arrow goes —
   Enter means "also run the deep search now", not "run the only search".
3. **Second wave.** `GET /api/foods?search=` keeps the external + AI work, fires on a 400ms
   pause or Enter, and merges into the *same* list under a quiet inline progress line.
   Results already on screen never move out from under a finger: new items append, then the
   list re-ranks once, animated.
4. **Stop bypassing the cache.** Route `searchUSDA` / `searchOpenFoodFacts` through
   `foodApiService` (Redis-wrapped, 7-day TTL) or wrap them with `cacheService.wrap`
   directly. Add a 1-hour cache on the merged ranked payload keyed by
   `(normalised query, limit)`.
5. **Parallelise `searchComposite`** — `Promise.allSettled` over items instead of the `for`
   loop. N items should cost one item's latency.
6. **Parallelise the frontend's two calls** — `foodService.search` and
   `fitnessGeekService.getMeals(null, term)` run sequentially today for no reason.

### Phase 2 — Understand the query (dish-first)

*Goal: "4 chocolate chip pancakes homemade" finds pancakes. This is the §1.0 fix and the
single most important phase in the document.*

The governing principle: **a query is one dish until the text says otherwise.**
Decomposition is the exception, not the default.

7. **Deterministic pre-parse, before any model call.** Strip and capture, rather than search:
   - a leading quantity (`4`, `two`, `a`) → `servings`, attached to the *dish*, not an item
   - a trailing/leading preparation adjective (`homemade`, `leftover`, `grilled`, `baked`,
     `fried`, `raw`, `roasted`) → a `preparation` hint used for ranking, never a search item
   - an explicit separator — `,`, ` and `, ` with `, ` + `, ` w/ ` — is the *only* thing that
     splits a query into fragments
   `"4 chocolate chip pancakes homemade"` → one fragment, `chocolate chip pancakes`,
   servings 4, preparation `homemade`. No model call needed, and no way to reach Chef's bug.
8. **Head-noun rule.** A fragment whose last noun is a dish word — `sandwich`, `pancakes`,
   `burrito`, `taco`, `salad`, `pie`, `soup`, `stew`, `casserole`, `bowl`, `wrap`, `smoothie`,
   `shake`, `pizza`, `burger`, `omelette`, `curry` — is **one dish, full stop**, even when it
   contains "and". This is what makes "peanut butter and jelly sandwich" a sandwich instead
   of a shopping list. Small, curated, testable word list; extend it as real queries demand.
9. **Dish-first resolution order.** For every fragment:
   a. search the whole phrase against every source;
   b. if a result clears a confidence floor (exact or strong token-coverage match on the
      full phrase), **stop** — that is the answer;
   c. only if (b) finds nothing worth showing, offer decomposition, and offer it *visibly*:
      "No match for *chocolate chip pancakes* — build it from ingredients?" as an explicit
      user choice, never a silent substitution.
10. **Rewrite the classification prompt** around this. Delete "CRITICAL: Extract EVERY
    distinct food item mentioned… implicit separators". Replace with a one-dish default,
    explicit-separator-only splitting, and negative examples drawn from the reproductions in
    §1.0 (`chocolate chip pancakes` → ONE item; `peanut butter and jelly sandwich` → ONE
    item; `2 eggs and toast` → two items). Demote the model to a *fallback* for fragments the
    deterministic parser can't resolve.
11. **Validate every model item against the input text.** An item name whose tokens do not
    appear in the query (modulo stemming) is dropped. `pancake mix` from a query that never
    said "mix" never reaches a search. This guard alone would have caught Chef's bug with no
    prompt change at all, so it ships regardless of how well the rewrite goes.
12. **De-duplicate items** before searching — the classifier returned `granola` twice for
    one query.
13. **Cache on the normalised query**, so the classification cache stops being keyed to
    incidental word order and quantity.

### Phase 3 — Rank like we mean it

*Goal: the food you meant is in the top three.*

14. **One scorer, server-side, on every path.** Delete `basicLexicalSort`, `scoreRelevance`,
    and the prepend-preferences trick; replace with a single
    `rankFoodResults(query, results, personalIndex)` scoring:
    - exact name match ≫ prefix ≫ all-tokens-present ≫ some-tokens
    - brand token match, weighted below name
    - source trust (local/custom > FatSecret branded > USDA > OFF > AI estimate)
    - length penalty for names far longer than the query
    - **preparation agreement** from Phase 2 (`homemade` should favour a from-scratch entry
      over a frozen branded one)
    - **personal boost**: favorite, recently logged with recency decay, own custom food,
      previously logged from this same query string
    Unit-tested against a fixture table. This is the §1.2 fix.
15. **Tokenise personal matching** — all-tokens-present over name+brand, replacing the
    whole-phrase regex, so `greek yogurt 0` finds `Fage Total 0% Greek Yogurt`.
16. **Demote AI to a reranker of the top 10**, run *after* first paint, patched in place,
    cached per query. Delete the `sanityCheckResults` call — §1.3 proves nothing consumes it.
17. **Fix the phantom composite group** (§1.6): tag preference results with a source marker
    and group only rows carrying `compositeItem`.
18. **Scope `searchLocalDB` to the caller** via `foodCatalogVisibilityFilter`; delete or
    adopt the caller-less `FoodItem.search` static.

### Phase 4 — One surface, one grammar

*Goal: one door, and it's already open.*

19. **`/food-search` becomes the search**, not a CTA for it. The marketing panel goes; the
    surface renders full-page with the input autofocused.
20. **Inline the box at the top of Food Log** — a real input, not a button that summons a
    dialog. The meal-slot "+" opens the same component in a `GeekSheet` with that meal
    preselected.
21. **Fold three entry points into one.** `QuickAddPanel`'s favorites/recents become the
    *empty state* of the box — no accordions, no tabs, the list is just there.
    `NaturalLanguageQuickAdd`'s sentence path becomes what happens when the typed query
    has explicit separators, rendered as proposal rows in the same list with the same
    provenance line it carries today.
22. **Rows replace cards.** New `FoodResultRow` (~120 lines, no entrance animation): name,
    brand, kcal, P/C/F, serving, source dot, staged badge, 44px+ target.
23. **One tap logs one serving**, with undo. The chevron opens the serving/macro editor for
    the minority who want it.
24. **Always a final row:** *Create "<query>"* → the custom-food form, name prefilled.
25. **Barcode moves into the box** as an icon adornment — `SearchBar` already takes
    `onBarcodeClick` and `AddFoodDialog` passes `showBarcode={false}` today. The Barcode tab
    disappears.
26. **The tray earns its place:** it appears at 2+ staged items. Single adds are one tap and
    done.

### Phase 5 — Delete

Nothing here has a live caller; all of it is read every time someone opens these files
looking for the real code.

- `components/FoodSearch/FoodSearch.jsx` (412 lines) and its default export from `index.js`
- `components/FoodSearch/AddFoodModal.jsx` (446 lines) — dead behind `modalFood`
- `unifiedFoodService.filterRelevantResults` — deprecated in its own docblock
- `aiFoodService.sanityCheckResults` call site, and the method if nothing else uses it
- the duplicate recent-foods fetcher
- `pages/FoodSearch.jsx`'s CTA surface

Roughly **1 400 lines out** before the rewrite adds anything back.

### Phase 6 — Prove it

27. **Fix the pino argument order** across the search path (§1.11) — `logger.info(obj, msg)`,
    not `logger.info(msg, obj)`. Everything below depends on being able to see what happened.
28. **Golden-set test** over `rankFoodResults` and the Phase 2 parser. The set starts with
    every query in §1.0 and §4, and grows by one row every time a real search disappoints.
29. **Timing telemetry** — search path taken (`local` / `external` / `ai`) and per-stage
    durations, so §4's numbers are measured, not asserted.
30. **Mobile harness stays at 0 findings** across the new rows and sheet.

## 4. Acceptance criteria

### 4.1 The named queries

These ship as tests. Each must return the stated food **in the top three**, and must not
silently decompose into ingredients.

| Query | Must find | Must NOT return |
|---|---|---|
| `4 chocolate chip pancakes homemade` | pancakes, chocolate-chip, 4 servings | a bag of chocolate chips; pancake mix; pancake syrup |
| `chocolate chip pancakes` | the same dish, 1 serving | three separate ingredient groups |
| `peanut butter and jelly sandwich` | one sandwich | peanut butter + jelly + bread as three rows |
| `greek yogurt with honey and granola` | three items, deliberately — the text separates them | a duplicated `granola` row |
| `2 eggs and toast` | two items — the text separates them | one merged item |
| `chedder` | cheddar cheese | nothing |
| `greek yogurt 0` | the user's own saved Fage Total 0% | only generic USDA yogurt |
| `pure protein chocolate peanut caramel` | the branded bar | loose ingredient rows |

### 4.2 The numbers

| # | Criterion | Measured by |
|---|---|---|
| 1 | First results painted ≤ 200ms p90 from first keystroke | `/api/foods/suggest` responseTime |
| 2 | External+AI wave ≤ 2 500ms p90, never blocking paint | route telemetry (Phase 6) |
| 3 | Intended food in top 3 for ≥ 17 of 20 golden queries | golden-set test |
| 4 | A query is decomposed **only** when it contains an explicit separator, or the user asks | parser unit tests |
| 5 | No item is searched whose tokens are absent from the query | parser unit tests |
| 6 | Zero interactions between nav and a focused input | manual, both surfaces |
| 7 | Log a found food in ≤ 2 taps, with undo | manual |
| 8 | Search returns no other user's custom foods | new test on `searchLocalDB` |
| 9 | Mobile harness: 0 findings | CI |
| 10 | Net lines removed > lines added | `git diff --stat` |

---

## 5. Open decisions — Chef's call

Full scope approved 2026-09-14. All four Phase-4 calls settled the same day:

1. **The staging tray survives, from 2+ items.** One tap logs a single food immediately with
   undo; the tray appears only once a second item is staged.
2. **The natural-language sheet is folded into the box.** One input; a sentence with
   separators returns proposal rows in the same result list, carrying the same provenance
   line. `NaturalLanguageQuickAdd` and its `naturalQuickAddOn` flag go.
3. **`/food-search` stays in the Tools nav** as a real full-page search — the CTA panel goes,
   the route renders the search itself, autofocused.
4. **Keto rows swap carbs for net carbs** — one number, labelled, rather than a fourth
   figure competing for width on a phone.

**Settled 2026-09-14 — the orphaned AI Assist switch is gone.** Folding the sentence path
into the box left the Settings toggle promising "Adds a 'Describe a meal' button to the Food
Log" for a button that no longer existed. Chef's call was to delete it, so the toggle, its
save handler, the one-shot opt-in migration (`utils/quickAddPreference.js`), the callerless
`services/quickAddService.js` and the dead `/quick-add/parse` router branch all went.

**Deliberately left standing:** the gateway side in basegeek — `parseFoodEntry`, its
resolver, `quickAddParser.js`, the typeDefs and their tests — plus the stored
`ai.features.natural_language_food_logging` field. Removing a GraphQL field is a breaking
schema change in another app, and the stored flag is inert. If that feature is never coming
back, retiring it is a basegeek job with its own blast radius.

---

## 6. Files this touches

**Backend**
- `backend/src/services/unifiedFoodService.js` — the bulk of Phases 1–2
- `backend/src/routes/foodRoutes.js` — new `/suggest` endpoint, telemetry
- `backend/src/models/FoodItem.js` — visibility scoping, text search
- `backend/src/services/aiFoodService.js` — drop `sanityCheckResults` usage

**Frontend**
- `frontend/src/components/FoodSearch/UnifiedFoodSearch.jsx` — the rewrite's centre
- `frontend/src/components/FoodSearch/SearchBar.jsx` — debounce, barcode adornment
- `frontend/src/components/FoodSearch/FoodResultRow.jsx` — new
- `frontend/src/components/FoodLog/AddFoodDialog.jsx` — loses its tabs
- `frontend/src/components/FoodLog/QuickAddPanel.jsx` — folded in
- `frontend/src/components/FoodLog/NaturalLanguageQuickAdd.jsx` — folded in
- `frontend/src/pages/FoodSearch.jsx` — becomes an actual search page
- `frontend/src/pages/FoodLog.jsx` — inline box
- `frontend/src/services/foodService.js` — `suggest()`

**Shared**
- `packages/schemas/fitnessgeek/foodItem.js` — index review only; no schema change expected
