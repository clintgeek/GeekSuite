# fitnessgeek `UserSettings` — schema source of truth

*Written 2026-09-05 for `DOCS/TODO_ORDER.md` #21. Supersedes the "Duplicated
`UserSettings` schema" entry in `DOCS/CONTEXT.md`.*

*Widened 2026-09-05: `UserSettings` was the first pair through this pipeline,
not the only one. The section immediately below is the index of every
fitnessgeek model whose schema now lives in `@geeksuite/schemas`; the rest of
this document remains the `UserSettings` case study — the incident that
motivated the work and the reference walkthrough for the next pair.*

---

## Shared schemas — the index

`packages/schemas/fitnessgeek/*` holds the field definitions for every
fitnessgeek collection with more than one writer. Each module exports a
`create<Model>Schema(mongoose)` factory; each app's model file is a thin
wrapper that calls it, attaches its own statics, and binds the result to its
own connection. **Add a field to the shared module, never to a wrapper.**

| Model | Shared module | Collection | Consolidated | Exports beyond the factory |
|---|---|---|---|---|
| `UserSettings` | `packages/schemas/fitnessgeek/userSettings.js` | `usersettings` | 2026-09-05 | `encryptGarminPassword`, `readGarminPassword`, `attachGarminPasswordEncryption` |
| `Weight` | `packages/schemas/fitnessgeek/weight.js` | `weights` | 2026-09-05 | — |
| `BloodPressure` | `packages/schemas/fitnessgeek/bloodPressure.js` | `bloodpressures` | 2026-09-05 | `bloodPressureBounds`, `classifyBloodPressure` |
| `Medication` | `packages/schemas/fitnessgeek/medication.js` | `medications` | 2026-09-05 | `MED_TIME_OF_DAY`, `MED_TYPES`, `medicationBounds` |
| `LoginStreak` | `packages/schemas/fitnessgeek/loginStreak.js` | `loginstreaks` | 2026-09-05 | `applyLoginToStreak`, `attachLoginStreakMethods` |
| `WeightGoals` | `packages/schemas/fitnessgeek/weightGoals.js` | `weightgoals` | 2026-09-05 | — |
| `NutritionGoals` | `packages/schemas/fitnessgeek/nutritionGoals.js` | `nutritiongoals` | 2026-09-05 | `evaluateGoalsMet`, `computeGoalProgress`, `attachNutritionGoalsMethods` |
| `Meal` | `packages/schemas/fitnessgeek/meal.js` | `meals` | 2026-09-05 | `MEAL_TYPES`, `sumMealNutrition`, `createMealItemSchema`, `attachMealTimestamps`, `attachMealMethods` |
| `FoodItem` | `packages/schemas/fitnessgeek/foodItem.js` | `fooditems` | 2026-09-05 | `FOOD_SOURCES`, `findOrCreateFoodItem`, `foodItemDedupeFilters`, `newFoodItemAttrs`, `foodItemDefaults`, `foodItemBounds`, `attachFoodItemVirtuals`, `attachFoodItemMethods` |

The wrappers, per model:

| | fitnessgeek (REST) | basegeek (GraphQL gateway) |
|---|---|---|
| File | `apps/fitnessgeek/backend/src/models/<M>.js` | `apps/basegeek/packages/api/src/graphql/fitnessgeek/models/<M>.js` |
| Import form | named — `import { create<M>Schema } from '@geeksuite/schemas/fitnessgeek/<m>'` | default + destructure — the form that survives jest's `--experimental-vm-modules` |
| Binding | `mongoose.model('<M>', schema)` (default connection) | `fitnessConn.model('<M>', schema)` where `fitnessConn = getAppConnection('fitnessgeek')` |
| Statics | its own, post-authentication | its own, `requireUser`-guarded — the gateway is multi-tenant and fails closed |

Statics and instance methods, per consolidated model:

| Model | Statics (app-side) | Instance methods (shared) |
|---|---|---|
| `UserSettings` | `getOrCreate`, `updateSettings` on both, deliberately different | — |
| `Weight` | none on either side | — |
| `BloodPressure` | none on either side | — |
| `Medication` | none on either side | — |
| `LoginStreak` | `getOrCreateStreak` on both; basegeek's opens with `requireUser` | `recordLogin` |
| `WeightGoals` | `getActiveWeightGoals`, `createWeightGoals`, `updateWeightGoals` on both; basegeek's all open with `requireUser` | — |
| `NutritionGoals` | `getActiveGoals`, `createGoals`, `updateGoals` on both; basegeek's all open with `requireUser` | `checkGoalsMet`, `getProgress` |
| `Meal` | `getActiveMeals`, `getMealsByType`, `searchMeals` on both **and they disagree** — basegeek's throw on an unscoped call, fitnessgeek's return every user's meals; `findOwned` is basegeek-only | `getNutrition` |
| `FoodItem` | `search` on both (byte-identical, still app-side); `findAccessible`, `findAccessibleMany` basegeek-only. `findOrCreate` on both, but each is a **one-line delegate** to the shared `findOrCreateFoodItem` | `isGlobal` |

`recordLogin` was the first *instance method* to move into a shared module. It
mutates four declared paths, so a divergence in it would corrupt a user's
streak rather than merely throw — which is the same reason fields move. Its
arithmetic is also exported as `applyLoginToStreak(streak, now)` so it can be
asserted without a database (the method itself calls `this.save()`), exactly
as `classifyBloodPressure` is exported for the `status` virtual.

Four more instance methods followed on 2026-09-05, and they widen the rule.
`NutritionGoals.checkGoalsMet` / `getProgress` and `Meal.getNutrition` do **not**
mutate anything — they read declared paths and return a number or a boolean.
They moved anyway, because the failure mode is what matters: a divergence there
does not throw, it quietly tells each caller a different answer. **The rule is
§3's — instance methods live in the shared module. The "does it mutate?"
question is why *statics* are the exception, not a second gate methods have to
pass.** Each one's arithmetic is exported by name (`evaluateGoalsMet`,
`computeGoalProgress`, `sumMealNutrition`) so the hermetic suite can call it.
`FoodItem.isGlobal` joined them on 2026-09-05 for the same reason: it reads one
declared path and its answer decides whether a catalog row is shared.

`Meal` also carries the first two things of their kind in these modules: an
**embedded sub-schema** (`food_items`, exported as `createMealItemSchema` — it
must be built from the caller's own mongoose, exactly as the parent is) and a
**`pre('save')` hook** (`attachMealTimestamps`, the only hook outside
`UserSettings`' Garmin encryption).

### Two things that are *not* in the shared modules

- **Statics — with one carve-out, taken on 2026-09-05.** They do not appear in
  `schema.paths`, so they cannot cause the strict-mode data loss these modules
  exist to prevent, and the two writers legitimately need different ones. The
  exception is `FoodItem.findOrCreate`: its dedupe ladder is not an ownership
  policy, it has one correct meaning for both writers, and a divergence would
  fork the catalog silently rather than throw. So the ladder and the global-row
  creation live in the shared module as `findOrCreateFoodItem(Model, foodData)`
  and each app keeps a one-line delegating static. The shape is the same one
  used for instance methods — move the logic, export the pure part by name —
  except that the model is a parameter instead of the document, and the pure
  part is a *query plan* (`foodItemDedupeFilters` returns the three rungs as
  data) rather than arithmetic.

  Everything that expresses **who may see what** still stays app-side, including
  `FoodItem.search`, which is byte-identical on both sides and was still not
  promoted: it scopes on `{user_id: null}` while `foodCatalogFilter` — used by
  `findAccessible`, in the same gateway file — also matches
  `{user_id: {$exists: false}}`. Two live definitions of a visible catalog row;
  promoting one would freeze the disagreement rather than resolve it.
- **The connection.** No shared module opens a connection or registers a model.
  That is the whole reason the factory takes `mongoose` as a parameter.

### Notes carried over, not fixed

- `Weight` and `BloodPressure` use `userId` (camelCase) as the owner field
  while every other fitnessgeek model uses `user_id`. Pre-existing in the
  collections themselves; normalizing it would be a data migration wearing a
  refactor's clothes. Left alone deliberately.
- `BloodPressure`'s numeric bounds are exported as `bloodPressureBounds` and
  imported by `apps/fitnessgeek/backend/src/validation/schemas/bloodPressure.js`,
  which used to restate them in zod under a comment promising it mirrored the
  model. One set of numbers, two languages, one source.
- `Medication`'s two enums and its `days_supply` / `notes` bounds are exported
  the same way and imported by
  `apps/fitnessgeek/backend/src/validation/schemas/medication.js`, which used to
  declare its own `MED_TYPES` and `TIME_OF_DAY` arrays.
- `Medication` renames `createdAt` → `created_at` but leaves `updatedAt`
  camelCase. Asymmetric, on disk, and moved verbatim. Every other renaming
  model uses `updated_at`.
- `LoginStreak` declares `created_at`/`updated_at` by hand **and** passes
  `timestamps: true`, so it carries four timestamp paths; and it indexes
  `user_id` twice (path-level `index: true` plus a `schema.index()` call, which
  is where the "Duplicate schema index" warning at boot comes from). Both are
  pre-existing on both sides and moved verbatim — changing either would stop
  the shared definition being byte-equivalent to what is deployed.
- `Meal` is the only shared model that passes **no schema options at all** — no
  `timestamps`, no `toJSON`. `created_at`/`updated_at` are ordinary declared
  paths and the `pre('save')` hook maintains the latter, which means nothing
  stamps `updated_at` on a `findOneAndUpdate`, on either side. Pre-existing on
  both sides, moved verbatim.
- `FoodItem` carries the **only `unique` index** in `packages/schemas` —
  `barcode` is `unique: true, sparse: true`. Consolidation changed no index, so
  production needed no rebuild; but if a `unique` flag ever moves in a shared
  module, **both processes must be redeployed together**, because whichever
  reaches `syncIndexes` first builds an index the other's writes may violate.
  In this suite that happens by construction (every push to `main` rebuilds all
  eight images and Watchtower rolls the fleet) — but say so in the commit.
- `FoodItem`'s text index (`{name: 'text', brand: 'text'}`) declares **no
  weights** on either side, so both fields rank equally. Both parity suites now
  include `weights` in the normalized index description, so adding one on a
  single side is a test failure rather than a silent re-ranking.
- **A soft-deleted `FoodItem` still owns its barcode.** Every rung of the dedupe
  ladder filters `is_deleted: false`; the `unique` index on `barcode` does not.
  So when a soft-deleted row holds a barcode, `findOrCreate` refuses to return
  it and then collides with it on insert — the caller gets `E11000`, not a row.
  Pre-existing and identical on both sides; found by writing the tests, and now
  asserted so it stays a known property. Fixing it means a partial unique index
  or clearing `barcode` on soft delete — both migrations, both `unique` changes.
- `FoodItem` declares a virtual (`totalCalories`) and passes **no**
  `toJSON: {virtuals: true}`, so the virtual is readable on the document but is
  not on the wire. The only pair with that combination.
- `NutritionGoals`' two methods disagree about sugar and sodium on purpose:
  `checkGoalsMet` treats them as ceilings (under the limit is good),
  `getProgress` treats them as floors like the other five (under the limit
  reads as low progress). Both shipped copies did this; both suites assert the
  asymmetry so nobody fixes half of it.
- `NutritionGoals.{checkGoalsMet,getProgress}` and `Meal.getNutrition` have **no
  callers** in either app today. They were promoted rather than deleted so the
  shared definition stays byte-equivalent to what is deployed; deleting them is
  its own ticket.
- `NutritionGoals` is **not** `UserSettings.nutrition_goal`. That one is a
  *planning* sub-document on `usersettings` — `plan_type`, `weekly_schedule`,
  `bmr`, `tdee`, a `keto` block — and shares not one field name with this
  collection. `DailySummary.updateFromLogs` reads *that* one.
  `validation/schemas/settings.js` validates it and was deliberately not
  rewired.
- `WeightGoals` is **not** `UserSettings.weight_goal`. Two collections describe
  a weight goal with overlapping field names and different bounds;
  `routes/goalRoutes.js` reads both and merges them. `validation/schemas/settings.js`
  validates the *other* one and was deliberately not rewired.

### The tripwires

| Suite | Covers |
|---|---|
| `apps/basegeek/packages/api/src/__tests__/userSettingsSchemaParity.test.js` | `UserSettings` — both real models, path-by-path, plus write-through on in-memory Mongo |
| `apps/basegeek/packages/api/src/__tests__/fitnessgeekSchemaParity.test.js` | table-driven over `Weight`, `BloodPressure`, `Medication`, `LoginStreak`, `WeightGoals`, `NutritionGoals`, `Meal`: paths, per-path type/default/bound/flag, indexes, virtuals and whether they serialize, virtual *behaviour*, `recordLogin` against a real collection, the `requireUser` divergence, write-through, and a strict-mode control. **Add pair 6+ as a row here.** |
| `apps/fitnessgeek/backend/src/__tests__/models/userSettingsSchemaParity.test.js` | `UserSettings`, hermetic: model vs shared definition, source-level checks on basegeek's copy, REST allow-list resolution |
| `apps/fitnessgeek/backend/src/__tests__/models/sharedSchemaParity.test.js` | `Weight` / `BloodPressure` / `Medication` / `LoginStreak` / `WeightGoals` / `NutritionGoals` / `Meal`, hermetic: same shape, plus the zod bounds-and-enum checks, the `applyLoginToStreak` branch cases, an assertion that the ownership guards stayed app-side, and a guard that basegeek's two deleted orphan models stay deleted |

The fitnessgeek suites are hermetic by design and basegeek's models open a
connection at import time, so the fitnessgeek half does its cross-check at
source level. Keep that split.

The remaining three pairs — the food family, `FoodItem` / `FoodLog` /
`DailySummary` — with their divergences and risks:
`DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md`. §8, §9 and §10 are what the first
seven pairs taught the pipeline; §10's carry-forward is the live list.

---

## The shape of the problem

One document. One collection (`usersettings` in the `fitnessgeek` database).
**Two** writers:

| Writer | Entry point | Model |
|---|---|---|
| REST | `apps/fitnessgeek/backend/src/routes/settingsRoutes.js` | `apps/fitnessgeek/backend/src/models/UserSettings.js` |
| GraphQL | `apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js` | `apps/basegeek/packages/api/src/graphql/fitnessgeek/models/UserSettings.js` |

Both are live. The fitnessgeek frontend's `apiService.js` rewrites most REST
settings calls to GraphQL, so the basegeek copy handles the majority of real
traffic while the REST routes remain reachable:

```
/settings              GET  → GET_USER_SETTINGS          (GraphQL)
/user/settings         GET  → GET_USER_SETTINGS          (alias, GraphQL)
/settings              PUT  → UPDATE_USER_SETTINGS       (GraphQL)
/user/settings         PUT/PATCH → UPDATE_USER_SETTINGS  (GraphQL)
/settings/*            PUT  → UPDATE_USER_SETTINGS       (GraphQL, catch-all)
/settings/household    GET/PUT/DELETE → household ops    (GraphQL)
```

Until 2026-09-05 each writer declared its **own** copy of the Mongoose schema.

### Why that is a data-loss hazard, not a style complaint

Mongoose runs in **strict mode** by default. An unknown path in a `$set` is not
rejected — it is **dropped silently**. So a field present in one copy and
missing from the other produced:

1. Client sends the field.
2. The route's allow-list passes it through.
3. Mongoose strips it.
4. The API returns **HTTP 200** and logs a successful update.
5. Nothing was written. The next read returns the old value.

No error anywhere. The only symptom is a setting that "won't stick".

## What actually happened (the drift window)

| | |
|---|---|
| **2026-04-13** `59ec8d2` | `fitnessgeek: keto mode backend` added `nutrition_goal.mode` and the whole `nutrition_goal.keto` subtree to the **fitnessgeek** copy only. |
| **drift window** | The keto wizard saved through GraphQL → the **basegeek** copy, which had never heard of those paths. Every keto save was accepted and discarded. |
| **2026-04-13** `2258236` | `basegeek: add missing keto fields to UserSettings schema` back-filled the same 7 paths and documented the duplication as known debt. |

Fields the basegeek copy would have dropped on a GraphQL write during that
window — i.e. everything the REST copy knew and it did not:

| Path | Type | Notes |
|---|---|---|
| `nutrition_goal.mode` | String | enum: `standard` \| `keto`, default `"standard"` |
| `nutrition_goal.keto.net_carb_limit_g` | Number | default `20` |
| `nutrition_goal.keto.track_net_carbs` | Boolean | default `true` |
| `nutrition_goal.keto.macro_split.preset` | String | enum: `classic` \| `high_protein` \| `lazy`, default `"classic"` |
| `nutrition_goal.keto.macro_split.fat_pct` | Number | default `70` |
| `nutrition_goal.keto.macro_split.protein_pct` | Number | default `25` |
| `nutrition_goal.keto.macro_split.carb_pct` | Number | default `5` |

The reverse column was empty: the REST copy never lacked a field the GraphQL
copy had.

## The diff today

**Zero divergence.** As of 2026-09-05 the two copies declared an identical 81
paths — `2258236` re-synced them and nothing has drifted since. Neither side
would drop anything on the other's write, and there are **no disagreements on
any type, default, enum, or index flag** to reconcile.

That is the good news and also the point: the copies were in sync *by hand*,
and hand-sync is exactly what failed in April. The fix is structural, not a
re-sync.

### Consequences for the fix

Because the copies already agreed field-for-field, consolidation was a pure
refactor:

- **No document was rewritten.** No migration, no backfill, no index change.
- **No field was added, removed, retyped, or re-defaulted.** The shared module
  is a verbatim transcription of the definition both copies already held.
- The refactored models were re-diffed path-by-path against the originals:
  81 paths each, zero divergence, identical types/defaults/enums/flags.

## The fix

The field set now lives in exactly one file:

```
packages/schemas/fitnessgeek/userSettings.js   (@geeksuite/schemas)
```

Both models build from it:

```js
// fitnessgeek/backend (ESM since 2026-09-05)
import { createUserSettingsSchema } from '@geeksuite/schemas/fitnessgeek/userSettings';
const userSettingsSchema = createUserSettingsSchema(mongoose);

// basegeek/packages/api (ESM)
import userSettingsSchemaModule from '@geeksuite/schemas/fitnessgeek/userSettings';
const { createUserSettingsSchema } = userSettingsSchemaModule;
const userSettingsSchema = createUserSettingsSchema(mongoose);
```

### Why `packages/schemas` and not "a single source inside basegeek"

`packages/*` is already where this repo keeps cross-app libraries
(`@geeksuite/auth`, `@geeksuite/user`, `@geeksuite/ui`), and fitnessgeek's
backend already consumes one of them via `workspace:*`. The alternative —
fitnessgeek importing from basegeek — would point an app at another **app's**
private package (`@datageek/api`, marked `"private": true`), inverting the
dependency direction and dragging basegeek's dependency tree into fitnessgeek's
install graph for the sake of one object literal.

### Why `mongoose` is a parameter, not an import

The consumers are separate workspace packages with their own mongoose ranges.
They resolve to one physical install today, but a version bump on either side
would split them — and a `Schema` built by mongoose instance A fails the
`instanceof` checks inside instance B's `Connection.model()`. Taking mongoose
from the caller makes that class of bug impossible and keeps the shared package
dependency-free.

### Why the module is CommonJS

Both consumers are ESM now (fitnessgeek's backend moved to node 20 + ESM on
2026-09-05), but the shared module itself is still CJS: Node's ESM→CJS interop
reads its `module.exports = { … }` statically, so `import { createUserSettingsSchema }
from '@geeksuite/schemas/fitnessgeek/userSettings'` works unchanged from either
side. Same arrangement `@geeksuite/user` and `@geeksuite/logger` already use.
(`@geeksuite/utils` is the exception — it is ESM-only, which is what forced
fitnessgeek's backend off CommonJS in the first place.)

### What the shared module gained on 2026-09-05 — behaviour, not just fields

`createUserSettingsSchema()` now also attaches the `garmin.password`
encryption: `pre('save')` / `pre(<update ops>)` hooks that encrypt with
`@geeksuite/crypto-vault` on the way in, and a getter that decrypts on the way
out. See `CONTEXT.md` for the full description and the backfill run order.

It lives here for the same reason the field set does. `garmin.password` has two
writers *and* two readers across two processes:

| | Writes | Reads |
|---|---|---|
| REST (fitnessgeek) | `settingsRoutes.js` `PUT /api/settings` | `garminConnectService.js` `buildClient` / `getStatus` |
| GraphQL (basegeek) | `resolvers.js` `updateFitnessUserSettings` | `resolvers.js` `buildGarminClient` / `garminStatus` |

Encrypting in either app alone would leave the other writing plaintext and —
much worse — reading ciphertext straight into a Garmin login. This function is
the only choke point all four pass through.

Two consequences worth carrying forward:

1. **`@geeksuite/schemas` is no longer a pure data module.** A change here now
   changes how both apps *write* to Mongo, not just which paths they accept.
   Deploy the two apps from the same commit.
2. **Both apps must hold the same `KEY_VAULT_SECRET`.** The root `DEPLOY.md`'s
   "basegeek only / never share across apps" row is out of date.

The parity tripwires are unaffected: hooks and getters do not appear in
`schema.paths`, both models get them identically because both call
`createUserSettingsSchema()`, and both suites stayed green.

### What deliberately stayed per-model

The **statics**. `getOrCreate` and `updateSettings` differ on purpose:
basegeek's call `requireUser()` because the gateway is multi-tenant and must
fail closed; fitnessgeek's have already authenticated upstream. basegeek's
`updateSettings` also guards against an empty `$set` (a MongoDB error). Statics
do not appear in `schema.paths`, so they cannot cause strict-mode data loss.

## The tripwire

| Test | Asserts |
|---|---|
| `apps/basegeek/packages/api/src/__tests__/userSettingsSchemaParity.test.js` | Imports **both real models** and compares `schema.paths` key-for-key, then type/default/enum/index flag for every path; both match the shared definition. Then, on the in-memory Mongo: a field written by the REST model survives a GraphQL `$set` and vice versa — plus a **control** proving strict mode is genuinely on, so the write-through assertions mean something. |
| `apps/fitnessgeek/backend/src/__tests__/models/userSettingsSchemaParity.test.js` | fitnessgeek's real model matches the shared definition; neither model file declares a schema of its own; basegeek's copy still imports the shared module. Also checks every name in `settingsRoutes.js`'s `allowedFields` / `allowedDashboardFields` / `allowedAIFields` resolves to a real schema path. |

The fitnessgeek suite is hermetic by design (no Mongo, no network — see
`jest.setup.js`), and basegeek's model opens a connection at import time, so
that side does its cross-check at source level rather than dragging an open
handle into the suite. basegeek's suite, which already runs an in-memory Mongo,
carries the full runtime comparison.

Both tripwires were mutation-tested: adding a stray path to one model makes the
basegeek suite fail and **name the offending field**.

## Adding a field — the checklist

1. Add it to `packages/schemas/fitnessgeek/userSettings.js`. **Only there.**
2. If it must cross GraphQL, add it to `FitnessUserSettings` *and*
   `FitnessUserSettingsInput` in
   `apps/basegeek/packages/api/src/graphql/fitnessgeek/typeDefs.js`.
3. If it must be writable over REST, add it to the relevant allow-list in
   `apps/fitnessgeek/backend/src/routes/settingsRoutes.js`.
4. Run both suites. The tripwires cover step 1; steps 2 and 3 are separate
   allow-lists on top of the schema — necessary, and not implied by it.

## Known wart (not fixed here)

`user_id` is declared with `index: true` *and* `schema.index({ user_id: 1 }, {
unique: true })`, so Mongoose logs `Duplicate schema index on {"user_id":1}` at
every boot. Pre-existing in both copies and faithfully carried over. Left alone
deliberately: this ticket's mandate was to change the schema's *location*, not
its behaviour, and index declarations on a production collection are not a
free-swing. Worth a one-line follow-up.

## Full field inventory

81 paths, excluding `_id` and `__v`. REST / GraphQL columns are which model
declares the path — identical on both sides as of 2026-09-05.

| Path | Type | Notes | REST | GraphQL |
|---|---|---|---|---|
| `ai.enabled` | Boolean | default `true` | ✅ | ✅ |
| `ai.features.goal_recommendations` | Boolean | default `true` | ✅ | ✅ |
| `ai.features.meal_suggestions` | Boolean | default `true` | ✅ | ✅ |
| `ai.features.natural_language_food_logging` | Boolean | default `true` | ✅ | ✅ |
| `ai.features.nutrition_analysis` | Boolean | default `true` | ✅ | ✅ |
| `created_at` | Date | — | ✅ | ✅ |
| `dashboard.card_order` | Array | default `["current_weight","blood_pressure","calories_today","login_streak","nutrition_today","garmin_summary","quick_actions","weight_goal","nutrition_goal"]` | ✅ | ✅ |
| `dashboard.show_blood_pressure` | Boolean | default `true` | ✅ | ✅ |
| `dashboard.show_calories_today` | Boolean | default `true` | ✅ | ✅ |
| `dashboard.show_current_weight` | Boolean | default `true` | ✅ | ✅ |
| `dashboard.show_garmin_summary` | Boolean | default `true` | ✅ | ✅ |
| `dashboard.show_login_streak` | Boolean | default `true` | ✅ | ✅ |
| `dashboard.show_nutrition_goal` | Boolean | default `true` | ✅ | ✅ |
| `dashboard.show_nutrition_today` | Boolean | default `true` | ✅ | ✅ |
| `dashboard.show_quick_actions` | Boolean | default `true` | ✅ | ✅ |
| `dashboard.show_weight_goal` | Boolean | default `true` | ✅ | ✅ |
| `favorite_foods` | Array | — | ✅ | ✅ |
| `garmin.enabled` | Boolean | default `false` | ✅ | ✅ |
| `garmin.last_connected_at` | Date | — | ✅ | ✅ |
| `garmin.oauth1_token` | Mixed | — | ✅ | ✅ |
| `garmin.oauth2_token` | Mixed | — | ✅ | ✅ |
| `garmin.password` | String | **encrypted at rest** (AES-256-GCM); decrypt getter | ✅ | ✅ |
| `garmin.username` | String | — | ✅ | ✅ |
| `healthBaselines.lastUpdated` | Date | default `null` | ✅ | ✅ |
| `healthBaselines.restingHR` | Number | default `null` | ✅ | ✅ |
| `healthBaselines.weeklyHRV` | Number | default `null` | ✅ | ✅ |
| `household.display_name` | String | trim | ✅ | ✅ |
| `household.household_id` | String | indexed, sparse | ✅ | ✅ |
| `household.share_food_logs` | Boolean | default `true` | ✅ | ✅ |
| `household.share_meals` | Boolean | default `true` | ✅ | ✅ |
| `household.share_weight` | Boolean | default `false` | ✅ | ✅ |
| `influxEnabled` | Boolean | default `false` | ✅ | ✅ |
| `notifications.daily_reminder` | Boolean | default `true` | ✅ | ✅ |
| `notifications.enabled` | Boolean | default `true` | ✅ | ✅ |
| `notifications.goal_reminders` | Boolean | default `true` | ✅ | ✅ |
| `nutrition_goal.activity_eatback_cap_kcal` | Number | default `500` | ✅ | ✅ |
| `nutrition_goal.activity_eatback_fraction` | Number | default `0.6` | ✅ | ✅ |
| `nutrition_goal.activity_level` | String | — | ✅ | ✅ |
| `nutrition_goal.auto_base_calories` | Number | — | ✅ | ✅ |
| `nutrition_goal.bmr` | Number | — | ✅ | ✅ |
| `nutrition_goal.calorie_target_mode` | String | enum: `auto` \| `weekly` \| `fixed` \| `standard`, default `"standard"` | ✅ | ✅ |
| `nutrition_goal.daily_calorie_target` | Number | — | ✅ | ✅ |
| `nutrition_goal.enabled` | Boolean | default `false` | ✅ | ✅ |
| `nutrition_goal.estimated_end_date` | Date | — | ✅ | ✅ |
| `nutrition_goal.fat_g_per_lb_goal` | Number | default `0.35` | ✅ | ✅ |
| `nutrition_goal.fixed_calories` | Number | — | ✅ | ✅ |
| `nutrition_goal.goal_weight_lbs` | Number | — | ✅ | ✅ |
| `nutrition_goal.keto.macro_split.carb_pct` | Number | default `5` | ✅ | ✅ |
| `nutrition_goal.keto.macro_split.fat_pct` | Number | default `70` | ✅ | ✅ |
| `nutrition_goal.keto.macro_split.preset` | String | enum: `classic` \| `high_protein` \| `lazy`, default `"classic"` | ✅ | ✅ |
| `nutrition_goal.keto.macro_split.protein_pct` | Number | default `25` | ✅ | ✅ |
| `nutrition_goal.keto.net_carb_limit_g` | Number | default `20` | ✅ | ✅ |
| `nutrition_goal.keto.track_net_carbs` | Boolean | default `true` | ✅ | ✅ |
| `nutrition_goal.min_safe_calories` | Number | — | ✅ | ✅ |
| `nutrition_goal.mode` | String | enum: `standard` \| `keto`, default `"standard"` | ✅ | ✅ |
| `nutrition_goal.plan_type` | String | enum: `standard` \| `weekender` \| `auto` \| `fixed` \| `weekly`, default `"standard"` | ✅ | ✅ |
| `nutrition_goal.protein_g_per_lb_goal` | Number | default `0.8` | ✅ | ✅ |
| `nutrition_goal.show_adjustment` | Boolean | default `true` | ✅ | ✅ |
| `nutrition_goal.start_date` | Date | — | ✅ | ✅ |
| `nutrition_goal.start_weight` | Number | — | ✅ | ✅ |
| `nutrition_goal.target_weight` | Number | — | ✅ | ✅ |
| `nutrition_goal.tdee` | Number | — | ✅ | ✅ |
| `nutrition_goal.timeline_weeks` | Number | — | ✅ | ✅ |
| `nutrition_goal.weekly_schedule` | Array | — | ✅ | ✅ |
| `nutrition_goal.weight_change_rate` | Number | — | ✅ | ✅ |
| `theme` | String | enum: `light` \| `dark` \| `auto`, default `"light"` | ✅ | ✅ |
| `units.height` | String | enum: `ft` \| `cm`, default `"ft"` | ✅ | ✅ |
| `units.weight` | String | enum: `lbs` \| `kg`, default `"lbs"` | ✅ | ✅ |
| `updated_at` | Date | — | ✅ | ✅ |
| `user_id` | String | **required**, indexed | ✅ | ✅ |
| `weight_goal.enabled` | Boolean | default `false` | ✅ | ✅ |
| `weight_goal.goalDate` | String | — | ✅ | ✅ |
| `weight_goal.is_active` | Boolean | default `true` | ✅ | ✅ |
| `weight_goal.lastRecalculated` | String | — | ✅ | ✅ |
| `weight_goal.ratePerWeek` | Number | — | ✅ | ✅ |
| `weight_goal.startDate` | String | — | ✅ | ✅ |
| `weight_goal.startWeight` | Number | — | ✅ | ✅ |
| `weight_goal.targetWeight` | Number | — | ✅ | ✅ |
| `weight_goal.unit` | String | default `"lbs"` | ✅ | ✅ |
