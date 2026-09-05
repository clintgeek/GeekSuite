# fitnessgeek Model Consolidation — the plan for the remaining 12 pairs

fitnessgeek's backend (`apps/fitnessgeek/backend/src/models/*`) and basegeek's GraphQL gateway
(`apps/basegeek/packages/api/src/graphql/fitnessgeek/models/*`) each declare thirteen Mongoose
models against **the same thirteen collections in the same `fitnessgeek` database**. One of the
thirteen, `UserSettings`, was consolidated on 2026-09-05 into
`packages/schemas/fitnessgeek/userSettings.js` behind `createUserSettingsSchema(mongoose)`, with a
tripwire test on each side and the Garmin encryption hooks living in the shared module. That is the
template. This document diffs the remaining twelve pairs field by field, says who reads and writes
each collection from each side, orders the work safest-to-riskiest, and lists what has to be fixed
*before* any of it starts — because the audit turned up one divergence that is destroying data in
production right now and three more that are latent. **Read the pre-work list (§5) first; two of its
items are bug fixes that should ship on their own, ahead of any consolidation.**

---

## 0. Scope and headline numbers

| | |
|---|---|
| Model pairs total | **13** |
| Already consolidated | **11 — all of them.** `UserSettings` (pair 0), `Weight`, `BloodPressure`, `Medication`, `LoginStreak`, `WeightGoals`, `NutritionGoals`, `Meal`, `FoodItem`, `FoodLog`, `DailySummary` — every one on 2026-09-05 |
| basegeek orphans deleted | **2** (`AIFoodPromptCache`, `MedicationLog` — done 2026-09-05) |
| Remaining | **0 — CONSOLIDATION COMPLETE (11/11, 2026-09-05).** No fitnessgeek collection has two hand-synced schemas any more; see §12 for the record and the open follow-ups |
| …genuinely needing a shared schema | **0 left** |
| Conflicting divergences | **4** — 1 in the schema field set, 3 in statics |
| Drift divergences | 3 (statics one side has and the other doesn't) |
| Harmless divergences | the rest — connection binding, import order, trailing newline |
| Index divergences | **0.** Every index on every pair is identical, character for character |
| Estimated total | **≈ 32–36 hours**, ~55% of it in the last three pairs |

The good news, and it is the single most important finding: **the schema field definitions are
byte-identical on 11 of the 12 remaining pairs.** `diff` on each pair produces only the connection
binding (`mongoose.model` → `fitnessConn.model`, plus the `getAppConnection` import), the
`requireUser`/ownership imports, and basegeek's extra ownership statics. The one exception is
`DailySummary`. This makes consolidation a much smaller job than "13× the UserSettings drift hazard"
in `DOCS/SUITE_TODO.md` implies — but the one exception is live and it is losing data.

---

## 1. Divergence tables

### 1a. Every pair, at a glance

Read "schema" as the object literal passed to `new mongoose.Schema(...)` plus every `.index()`,
virtual, `toJSON`/`toObject` setting and instance method.

| # | Model | Collection | Schema fields | Indexes | Statics / hooks | Verdict |
|---|-------|-----------|---------------|---------|-----------------|---------|
| 1 | `Weight` | `weights` | identical | identical | none either side | ✅ **DONE 2026-09-05** |
| 2 | `BloodPressure` | `bloodpressures` | identical | identical | none either side | ✅ **DONE 2026-09-05** |
| 3 | `LoginStreak` | `loginstreaks` | identical | identical | BG adds `requireUser` guard | ✅ **DONE 2026-09-05** (guard stayed app-side) |
| 4 | `Medication` | `medications` | identical | identical | none either side | ✅ **DONE 2026-09-05** |
| 5 | `MedicationLog` | `medicationlogs` | identical | identical | none either side | ✅ **DELETED 2026-09-05** |
| 6 | `AIFoodPromptCache` | `aifoodpromptcaches` | identical | identical | none either side | ✅ **DELETED 2026-09-05** |
| 7 | `WeightGoals` | `weightgoals` | identical | identical | BG adds `requireUser` ×3 | ✅ **DONE 2026-09-05** (guards stayed app-side) |
| 8 | `NutritionGoals` | `nutritiongoals` | identical | identical | BG adds `requireUser` ×3 | ✅ **DONE 2026-09-05** (guards stayed app-side; two instance methods moved) |
| 9 | `Meal` | `meals` | identical | identical | BG adds `findOwned`; BG's 3 list statics are owner-scoped, FG's are not | ✅ **DONE 2026-09-05** (fields only; the C4 statics stayed put on both sides) |
| 10 | `FoodItem` | `fooditems` | identical | identical | BG adds `findAccessible`/`findAccessibleMany`; `findOrCreate` + `search` identical | ✅ **DONE 2026-09-05** (`findOrCreate`'s ladder moved as a shared helper; `search` and the two `findAccessible*` stayed app-side) |
| 11 | `FoodLog` | `foodlogs` | identical | identical | ~~different date normalizer~~ (fixed in `0cecb4a`); BG adds `requireUser` ×4 | ✅ **DONE 2026-09-05** (pair 9 — the four list statics stayed app-side; the `calculatedNutrition` virtual and the `meal_type` enum moved) |
| 12 | `DailySummary` | `dailysummaries` | ~~**BG is missing `totals.net_carbs_grams`**~~ (restored in `0cecb4a`) → identical | identical | ~~different date normalizer; BG's `updateFromLogs` omits the net-carb accumulation~~ (both fixed in `0cecb4a`); BG adds `requireUser` ×3 | ✅ **DONE 2026-09-05** (pair 10 — `updateFromLogs`'s recompute moved as a helper; `getOrCreate` / `getSummaryRange` and all date handling stayed app-side) |

Neither side passes an explicit `collection:` option anywhere, and every model name matches across
the two sides, so Mongoose's default pluralization lands both models on the same collection. That is
verified, not assumed — `grep -rn "collection:" ` over both model directories returns nothing.

### 1b. The conflicting divergences, in detail

#### C1 — `DailySummary.totals.net_carbs_grams` is missing on the gateway side · **live data loss**

| | fitnessgeek | basegeek |
|---|---|---|
| Schema path | `apps/fitnessgeek/backend/src/models/DailySummary.js:41-45` — `{ type: Number, default: 0, min: 0 }` | **absent.** `models/DailySummary.js:39` (`fiber_grams`) is followed directly by `:44` (`sugar_grams`) |
| Accumulator init | `DailySummary.js:143` — `net_carbs_grams: 0` | **absent** (`models/DailySummary.js:149-156`) |
| Accumulation | `DailySummary.js:172` — `Math.max(0, (carbs − fiber) × multiplier)` | **absent** |
| Write | `DailySummary.js:201-209` — `findOneAndUpdate(..., { totals, meals, goals_met, ... })` | `models/DailySummary.js:209-218` — same shape |

Both `updateFromLogs` implementations write the whole `totals` sub-document through
`findOneAndUpdate`. Mongoose strict mode drops an undeclared path from that write silently. So **every
call to basegeek's `updateFromLogs` erases `totals.net_carbs_grams` from the stored document**, and
basegeek's is now the copy that runs on the hot path:

- `apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js:456` — the `dailySummary` **query**
  calls `updateFromLogs`, so merely *reading* the day wipes the field
- `resolvers.js:791` — `refreshDailySummary`
- `resolvers.js:822, 917, 935, 948, 1130` — every food-log create / update / delete / `logMeal`
  mutation, i.e. the four writes the frontend switched onto the gateway on 2026-09-05
  (`DOCS/SUITE_TODO.md` item 2, gateway commit `79b1b57`)

Meanwhile the field is a declared, queried, rendered part of the product:

- `apps/basegeek/packages/api/src/graphql/fitnessgeek/typeDefs.js:436` — `net_carbs_grams: Float` on
  `DailySummaryTotals`
- `apps/fitnessgeek/frontend/src/services/apiService.js:147` and `:283` — both the daily-summary query
  and the `RefreshDailySummary` mutation select it
- `apps/fitnessgeek/frontend/src/pages/DashboardNew.jsx:173` —
  `consumed: summary.totals?.net_carbs_grams || 0`, the keto net-carb ring

The resolver returns `summary.totals` straight from the model, so the ring reads `0` for any user
whose day has been touched through the gateway. Given the frontend now writes food logs through the
gateway, that is every keto user, every day. **This is a shipped regression from 2026-09-05, not a
consolidation risk.** Fix it standalone (§5, PRE-1).

Classification: nominally *drift* — one side has a field the other lacks — but because both sides
write the parent sub-document wholesale, it behaves as a *conflict* and destroys committed data.

#### C2 / C3 — two hand-rolled date normalizers vs `@geeksuite/utils`

| | fitnessgeek | basegeek |
|---|---|---|
| `DailySummary` | `import { toUtcMidnight } from '@geeksuite/utils'` (`DailySummary.js:2`), used at `:101, :124, :127, :215, :218` | local `toUtcDate()` at `models/DailySummary.js:100-109`, used at `:112, :136, :139, :226, :229` |
| `FoodLog` | `import { toUtcMidnight } from '@geeksuite/utils'` (`FoodLog.js:2`), used at `:104, :107, :120, :123, :144, :147` | local `toUtcDate()` at `models/FoodLog.js:106-117`, used at `:121, :124, :138, :141, :164, :167` |

These are not equivalent. basegeek's copy branches on `typeof === 'string'` and splits on `-`
unconditionally; `packages/utils/src/dates.js:65-74` gates that branch behind a `YYYY-MM-DD` regex and
falls through to `new Date(value)` otherwise. Measured:

| input | basegeek `toUtcDate` | `@geeksuite/utils` `toUtcMidnight` |
|---|---|---|
| `'2026-09-05'` | Sep 5 00:00Z ✅ | Sep 5 00:00Z ✅ |
| `'2026-09-05T14:00:00Z'` | **Aug 31 00:00Z** ❌ | Sep 5 00:00Z ✅ |
| `'2026-09-05T14:00:00.000Z'` | **Aug 31 00:00Z** ❌ | Sep 5 00:00Z ✅ |
| a numeric timestamp | keeps time-of-day (`FoodLog` variant) ❌ | Sep 4 00:00Z ✅ |

`Number('05T14:00:00Z')` is `NaN`, `Date.UTC(2026, 8, NaN)` is not an error, and the result is a
plausible-looking Date four days off. Every caller today passes `yyyy-MM-dd`
(`resolvers.js:453`, `:790` both `format(new Date(), 'yyyy-MM-dd')`), so this is **latent, not live** —
but the GraphQL type is `date: String`, so nothing stops a client sending an ISO instant, and it would
silently read and write the wrong calendar day. `apps/fitnessgeek/DOCS/CONTEXT.md` is explicit about
this class of bug: five private copies of this normalizer were deleted into `@geeksuite/utils` on
2026-09-05, with "**Do not add a sixth** — import it." basegeek has copies six and seven.

basegeek's api already depends on `@geeksuite/utils` (`apps/basegeek/packages/api/package.json:19`), so
the fix is a one-line import swap per file. Do it as pre-work (§5, PRE-2), not during consolidation.

#### C4 — `Meal`'s list statics disagree on what a missing `userId` means

| static | fitnessgeek (`models/Meal.js`) | basegeek (`models/Meal.js`) |
|---|---|---|
| `getActiveMeals` | `:55-60` — `if (userId) query.user_id = userId;` → **no userId returns every user's meals** | `:71-77` — `requireUser(userId)` throws `UNAUTHORIZED` |
| `getMealsByType` | `:62-67` — same optional scoping | `:79-85` — `requireUser` |
| `searchMeals` | `:69-75` — same optional scoping | `:87-93` — `requireUser` |
| `findOwned` | absent | `:64-69` — id-validated, owner-scoped, returns `null` for malformed / missing / deleted / not-yours |

Every live fitnessgeek caller does pass a `userId` — `apps/fitnessgeek/backend/src/routes/mealRoutes.js:19,
:21, :23` all take it from the authenticated request — so this is latent too. But it means the two
sides do **not** have the same static, and moving basegeek's version into a shared module would be a
deliberate behavior tightening on the fitnessgeek side, not a refactor. See §4 (pair 9) for how to
handle that, and §3 for why the answer is probably "don't share the statics at all."

### 1c. The drift divergences

| Model | What one side has | Who depends on it |
|---|---|---|
| `FoodItem` | BG `findAccessible` (`models/FoodItem.js:122-127`) and `findAccessibleMany` (`:129-135`) — global-or-mine catalog read scope, built on `foodCatalogFilter` in `graphql/fitnessgeek/ownership.js:40-48` | basegeek only: `resolvers.js:32, 76, 82, 396`. fitnessgeek has no equivalent and no caller — its REST routes hand-roll the same filter inline (`routes/foodRoutes.js:49, 92, 191, 237, 385, 442`) |
| `LoginStreak`, `WeightGoals`, `NutritionGoals` | BG `requireUser(userId)` at the head of each static | basegeek's fail-closed ownership posture (`ownership.js:22-29`, mirroring the bujogeek service layer). fitnessgeek's callers are all post-auth, so nothing there depends on the *absence* of the guard |
| `DailySummary`, `FoodLog`, `Meal` | same `requireUser` additions | as above |

`FoodItem.findOrCreate` (FG `:116-171` / BG `:137-192`) and `FoodItem.search` (FG `:173-205` / BG
`:194-226`) are **identical**, including the barcode → `(source, source_id)` → `(name, brand)` dedupe
ladder. That matters: the gateway's `addFoodLog` took over the on-the-fly food creation path on
2026-09-05 and runs the same dedupe REST used to, so the two sides cannot mint different rows for the
same food.

### 1d. Harmless divergences (present on all 12)

- Connection binding: FG `export default mongoose.model('X', schema)` (default connection, opened by
  `apps/fitnessgeek/backend/src/config/database.js:18` against `…/fitnessgeek`); BG
  `export default fitnessConn.model('X', schema)` where `fitnessConn = getAppConnection('fitnessgeek')`
  (`graphql/shared/appConnections.js:21-41`, `mongoose.createConnection` against the same database).
  **This stays app-side forever** — it is the whole reason the shared factory takes `mongoose` as a
  parameter and never registers a model itself.
- Import block ordering and the `ownership.js` import.
- `BloodPressure` and `Weight` both end without a trailing newline on both sides. Leave it; changing it
  adds diff noise to a file you are about to delete.

---

## 2. Who reads and writes each collection

Which side's semantics must win is a function of who actually calls it. Tests and mocks excluded.

| Collection | fitnessgeek backend | basegeek gateway | Semantics owner |
|---|---|---|---|
| `usersettings` | `routes/settingsRoutes.js:5`, `goalRoutes.js:4`, `logRoutes.js:7`, `foodRoutes.js:6`, `userRoutes.js:6`, `influxRoutes.js:7`, `services/unifiedFoodService.js:24`, `services/aiRecoveryService.js:3`, `services/garminConnectService.js:5`, `controllers/weightController.js:5`, `scripts/encryptGarminPasswords.js:133` | `resolvers.js:8` | **shared** (done) |
| `weights` | `controllers/weightController.js:2`, `services/foodReportService.js:4`, `services/aiInsightsService.js:12`, `scripts/importWeight.js:12` | `resolvers.js:9` | tie — schemas identical |
| `bloodpressures` | `controllers/bloodPressureController.js:2`, `services/aiInsightsService.js:13`, `scripts/importBloodPressureSimple.js:12` | `resolvers.js:15` | tie |
| `loginstreaks` | `routes/streakRoutes.js:4` | `resolvers.js:16` | tie |
| `medications` | `routes/medicationRoutes.js:4` | `resolvers.js:14` | tie |
| `medicationlogs` | `routes/medicationRoutes.js:5` (create `:231`, read `:257`, cascade delete `:276`) | **nobody** | **fitnessgeek** |
| `aifoodpromptcaches` | `services/aiClassificationCacheService.js:14`, `services/aiFoodPromptCacheService.js:3` | **nobody** | **fitnessgeek** |
| `weightgoals` | `services/aiInsightsService.js:15` (read-only) | `resolvers.js:18` | **basegeek** (only writer) |
| `nutritiongoals` | `routes/aiCoachRoutes.js:6`, `services/foodReportService.js:3`, `services/aiInsightsService.js:14` | `resolvers.js:10` | **basegeek** |
| `meals` | `routes/mealRoutes.js:4` | `resolvers.js:13` (`:415, :416, :420, :796`) | **basegeek** — tighter, and it owns `logMeal` |
| `fooditems` | `routes/foodRoutes.js:4`, `services/unifiedFoodService.js:22` | `resolvers.js:11` | **basegeek** for catalog reads (`findAccessible`); dedupe is identical |
| `foodlogs` | `routes/logRoutes.js:5`, `foodRoutes.js:5`, `aiCoachRoutes.js:5`, `services/foodReportService.js:2`, `aiInsightsService.js:11`, `unifiedFoodService.js:23` | `resolvers.js:12` | **basegeek** for writes (took over 2026-09-05); fitnessgeek still reads heavily |
| `dailysummaries` | `routes/logRoutes.js:6` (`:367`), `routes/summaryRoutes.js:4` (`:18, :48, :79, :111, :149`) | `resolvers.js:17` (`:456, :791, :822, :917, :935, :948, :1130`) | **fitnessgeek** — its field set is the superset (see C1) |

Two things fall out of this table:

1. **`AIFoodPromptCache` and `MedicationLog` are basegeek orphans.** Nothing outside the model file
   itself mentions either name anywhere in `apps/basegeek/packages` — no resolver, no typeDef, no
   test. basegeek's medication schema exposes `fitnessMedications` / `addFitnessMedication` /
   `updateFitnessMedication` / `deleteFitnessMedication` (`typeDefs.js:607-608, 648-650`) but nothing
   for medication *logs*. These two are not consolidation candidates; they are the flockgeek/notegeek
   dead-code deletion from `DOCS/SUITE_TODO.md` item 1, one directory over. Delete them and the pair
   count drops from 12 to 10 for free.
2. **`DailySummary` is the one collection where fitnessgeek's semantics must win**, and it is also the
   riskiest pair. The shared definition must be the *union* — fitnessgeek's, `net_carbs_grams`
   included. Promoting basegeek's copy would make the live bug permanent.

---

## 3. The runtime constraint, and how hooks and statics move

### The module-system facts

| Package | `"type"` | Consequence |
|---|---|---|
| `apps/fitnessgeek/backend` | `module` (ESM), node 20 | `import`s the shared module through Node's ESM→CJS interop |
| `apps/basegeek/packages/api` | `module` (ESM), node 20 | same |
| `packages/schemas` | *unset* → **CommonJS, deliberately** | `require`-able and `import`-able; no build step; usable by a future CJS consumer |
| `packages/crypto-vault` | *unset* → CommonJS | the precedent `@geeksuite/schemas` already depends on |
| `packages/utils` | `module` — **ESM-only, no CJS entry** | **cannot be `require()`d from `packages/schemas`** |

> **Correction to file in flight.** `packages/schemas/fitnessgeek/userSettings.js:46-48` and
> `apps/basegeek/packages/api/src/__tests__/userSettingsSchemaParity.test.js:31` both say
> "fitnessgeek's backend is CJS." That stopped being true on 2026-09-05 when the backend moved to
> node 20 + ESM specifically so it could consume `@geeksuite/utils` (`apps/fitnessgeek/DOCS/CONTEXT.md`,
> Runtime table). The CJS decision for `@geeksuite/schemas` is still right — it just needs a different
> justification (no build step, dual-consumable, matches `@geeksuite/crypto-vault`). Fix the comments
> when you next touch those files.

### The import form

Both apps are ESM, but they use different interop forms, and both work in their own test harness:

```js
// fitnessgeek — apps/fitnessgeek/backend/src/models/UserSettings.js:2
import { createUserSettingsSchema } from '@geeksuite/schemas/fitnessgeek/userSettings';

// basegeek — apps/basegeek/packages/api/src/graphql/fitnessgeek/models/UserSettings.js:19-21
import userSettingsSchemaModule from '@geeksuite/schemas/fitnessgeek/userSettings';
const { createUserSettingsSchema } = userSettingsSchemaModule;
```

Named import works because `cjs-module-lexer` statically detects the `module.exports = { … }` object
literal at `packages/schemas/fitnessgeek/userSettings.js:538-548`. basegeek uses the default-import
form because that detection is not reliable under jest's `--experimental-vm-modules`
(`models/UserSettings.js:16-18` records exactly this). **Rule for every new module: keep the
`module.exports = { … }` object-literal form — never `exports.foo = …` or a computed export — and use
the default-import form in basegeek, either form in fitnessgeek.**

### The factory shape

```js
// packages/schemas/fitnessgeek/<model>.js  (CommonJS)
function <model>Definition(mongoose) {
  if (!mongoose || !mongoose.Schema) throw new TypeError('…: pass your own mongoose instance');
  const { ObjectId } = mongoose.Schema.Types;
  return { /* field definitions */ };
}
const <model>Options = { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } };
function create<Model>Schema(mongoose) {
  const schema = new mongoose.Schema(<model>Definition(mongoose), <model>Options);
  schema.index({ /* … */ });          // indexes belong here — they are part of the contract
  attach<Whatever>Hooks(schema);      // hooks belong here — see below
  return schema;
}
module.exports = { <model>Definition, <model>Options, create<Model>Schema, /* helpers */ };
```

`mongoose` is a parameter, never a dependency —
`packages/schemas/fitnessgeek/userSettings.js:34-41` gives the reason: the two consumers have their
own mongoose ranges, and a `Schema` built by instance A fails `instanceof` inside instance B's
`Connection.model()`. `mongoose` stays an optional peer dep in `packages/schemas/package.json`.

Each new module needs a subpath in `packages/schemas/package.json` `exports` and a line in
`packages/schemas/index.js`.

### What moves and what doesn't

**Fields, indexes, virtuals, instance methods, `toJSON`/`toObject` settings → the shared module.**
These are the contract. `schema.paths` divergence is the failure mode the whole exercise exists to
prevent (strict mode drops the unknown path silently), and index divergence means one process
creating an index the other's queries depend on.

**Hooks with one meaning for every writer → the shared module.** The Garmin password encryption is the
worked example: `attachGarminPasswordEncryption(schema)` at
`packages/schemas/fitnessgeek/userSettings.js:468-512` attaches a getter on the path plus
`pre('save')` and `pre(['findOneAndUpdate','updateOne','updateMany','replaceOne'])`, and
`createUserSettingsSchema` calls it at `:533` so every consumer gets it whether it knows or not
(`:344-356` spells out why: four call sites in two processes, and encrypting in one app alone would
leave the other writing plaintext and reading ciphertext into a Garmin login). Helper functions the
hooks use are exported alongside the factory (`:545-547`) for scripts and tests. **None of the twelve
remaining pairs has a hook on either side** — no `pre`, no `post`, nothing but the `pre('save')`
`updated_at` stamp in `Meal.js` which is identical on both sides. So this machinery is available but
unused for now.

**Statics → stay in the app models.** `packages/schemas/fitnessgeek/userSettings.js:516-521` states the
policy and the reason: the two writers need different ones (the gateway enforces caller ownership;
fitnessgeek has already authenticated), and statics do not affect `schema.paths`, so they cannot cause
the silent data loss the module exists to prevent. That policy resolves C4 and all three `requireUser`
drift rows at a stroke: **do not move `requireUser` into the shared module.** basegeek keeps its
fail-closed guards, fitnessgeek keeps its post-auth statics, and neither is blocked on the other.

**The exception that proves it:** `DailySummary` and `FoodLog` are the two pairs whose *divergence lives
in the statics* — the net-carb accumulation (C1) and the date normalizer (C2/C3). Those cannot be
resolved by "leave the statics alone." And they cannot be resolved by moving the statics into
`packages/schemas` either, because the correct date helper is `@geeksuite/utils`, which is ESM-only and
therefore un-`require`-able from a CJS package. **The answer for both is to fix the statics in place,
in basegeek, as pre-work (§5), and then consolidate only the field definitions.** Do not add a CJS
build to `@geeksuite/utils` for this; do not pass `toUtcMidnight` in as a factory parameter; and
absolutely do not inline an eighth copy of the normalizer.

---

## 4. The ordered plan

Ordering principle: read-mostly reference data and single-writer collections first; the food-log
family last, because the gateway only took over its writes on 2026-09-05 and it is the least-settled
code in the app. Within a tier, fewest statics first.

Every pair follows the same five steps. They are cheap after the first one.

> **The five steps**
> 1. **Promote** — create `packages/schemas/fitnessgeek/<model>.js` with `create<Model>Schema(mongoose)`,
>    add the subpath to `packages/schemas/package.json` `exports` and the entry to
>    `packages/schemas/index.js`. Copy the field definitions verbatim from whichever side §2 names as
>    the semantics owner.
> 2. **Test** — add the pair to a parity tripwire *before* either model switches, so it proves the
>    definition matches what is already deployed rather than what you just wrote.
> 3. **Switch fitnessgeek** — replace the inline schema in `apps/fitnessgeek/backend/src/models/<M>.js`
>    with the factory call. Statics stay. Deploy; the parity test still passes because basegeek's copy
>    still matches the shared definition.
> 4. **Switch basegeek** — same, in `apps/basegeek/packages/api/src/graphql/fitnessgeek/models/<M>.js`.
>    Keep `getAppConnection` and the ownership statics.
> 5. **Delete the duplicate** — nothing to delete, in fact: both model files survive, each shrunk to
>    an import, a factory call, its own statics, and its own connection binding. "The duplicate" that
>    goes away is the *schema literal*, in step 4. Then add the source-level "does not re-declare the
>    schema inline" assertion (see the tests below) so it cannot come back.

### Step 0 — the two free deletions (do these first, they are not consolidations) · ✅ **DONE 2026-09-05**

| Pair | Action | Why it is safe |
|---|---|---|
| `AIFoodPromptCache` | delete `apps/basegeek/packages/api/src/graphql/fitnessgeek/models/AIFoodPromptCache.js` | The only mention of the identifier anywhere in `apps/basegeek/packages` is its own `export default` line. Deleting it also stops basegeek from declaring a TTL index (`:52`, `expireAfterSeconds: 3888000`) on a collection it never reads — a background index whose only effect today is a second process racing fitnessgeek to create it |
| `MedicationLog` | delete `.../models/MedicationLog.js` | Same: no resolver, no typeDef, no test. fitnessgeek is the sole reader and writer (`routes/medicationRoutes.js:231, :257, :276`) |

Verify with `rg -n 'AIFoodPromptCache' apps/basegeek/packages` and the same for `MedicationLog` before
deleting — the `DOCS/SUITE_TODO.md` item 1 flockgeek lesson (13 "orphans" that turned out to be 4)
applies.

### Tier 1 — reference-shaped, no statics, single semantics · **do these as the proof**

| # | Pair | Effort | Rollback safe? | Notes |
|---|------|--------|----------------|-------|
| 1 | ✅ **`Weight`** *(done 2026-09-05)* | XS | ✅ | 47/50 lines. Zero statics, zero hooks, one compound index, `toJSON`/`toObject` virtuals identical (`:44-45` / `:47-48`). The only divergence is the connection binding |
| 2 | ✅ **`BloodPressure`** *(done 2026-09-05)* | XS | ✅ | Same shape, 72/75 lines. **Correction:** the virtual is `status`, not `bpCategory`, and there are *two* virtuals — `formatted_date` (on `Weight` too) and `status`. Same `toJSON` settings |
| 3 | ✅ **`Medication`** *(done 2026-09-05)* | XS | ✅ | 106/109 lines, shared `MED_TIME_OF_DAY` enum literal identical on both sides, no statics. **Two more copies of the enums live in `validation/schemas/medication.js`; both now import.** See §9 |
| 4 | ✅ **`LoginStreak`** *(done 2026-09-05)* | XS | ✅ | One static, `getOrCreateStreak`; the only difference is basegeek's `requireUser` — stayed app-side. **The plan missed an instance method, `recordLogin`, which did move.** See §9 |

Note for 1 and 2: both use `userId` (camelCase) as the owner field while the other eleven use
`user_id`. That is a pre-existing inconsistency in the collections themselves; **do not normalize it
during consolidation** — it would be a data migration wearing a refactor's clothes. Record it and move on.

### Tier 2 — one writer, guarded statics

| # | Pair | Effort | Rollback safe? | Notes |
|---|------|--------|----------------|-------|
| 5 | ✅ **`WeightGoals`** *(done 2026-09-05)* | S | ✅ | basegeek is the only writer; fitnessgeek reads via `aiInsightsService.js:15`. Three statics, `requireUser`-only divergence — all six copies stayed app-side. See §9 |
| 6 | ✅ **`NutritionGoals`** *(done 2026-09-05)* | S | ✅ | Same shape. **The plan missed two instance methods, `checkGoalsMet` and `getProgress`; both moved.** See §10. Note the naming trap: this is **not** `UserSettings.nutrition_goal`. Two different collections both describe nutrition goals, and `DailySummary.updateFromLogs` reads the *settings* one (`DailySummary.js:186-188`), not this one. Do not "helpfully" unify them |
| 7 | ✅ **`Meal`** *(done 2026-09-05)* | S | ✅ | **The plan missed an embedded sub-schema, a `pre('save')` hook and the `getNutrition` instance method; all three moved.** Statics conflict (C4). Consolidate the field definitions only; leave both sides' statics exactly as they are. If the tightened semantics are wanted in fitnessgeek, that is a separate, deliberate ticket with its own test |

### Tier 3 — the food family · **the gateway took these over on 2026-09-05; let them settle**

| # | Pair | Effort | Rollback safe? | Notes |
|---|------|--------|----------------|-------|
| 8 | ✅ **`FoodItem`** *(done 2026-09-05)* | M | ⚠️ see below | The `findOrCreate` dedupe ladder (`FG :116-171` / `BG :137-192`) is identical today and **must stay identical** — it is the only thing stopping the two writers from minting duplicate rows for the same USDA/OpenFoodFacts item. Promote it into the shared module *with the fields*, as an exception to the statics policy: unlike `requireUser`, it has one correct meaning for both writers and a divergence would corrupt the catalog. `findAccessible`/`findAccessibleMany` stay app-side (basegeek-only ownership scoping). `search` is identical too — promote it as well |

> **Correction, written after the fact.** `search` was **not** promoted. It is an ownership-scoping read and the two sides do not actually agree about what a visible catalog row is — `search` matches `{user_id: null}`, `foodCatalogFilter` (used by `findAccessible`, in the same file) also matches `{user_id: {$exists: false}}`. Promoting one would freeze a live disagreement into the shared contract, and a read static has no corruption failure mode to buy for that price. `findOrCreate` was split instead: the ladder and the global-row creation are the shared `findOrCreateFoodItem(Model, foodData)`, each side keeps a one-line delegating static. See §11 |
| 9 | ✅ **`FoodLog`** *(done 2026-09-05)* | S | ✅ | PRE-2 had already landed, so the date normalizer was no longer a divergence and the two copies differed only by the connection binding and `requireUser` ×4. **The plan missed a serialized virtual (`calculatedNutrition`) and the asymmetric `updatedAt` timestamp rename; both moved verbatim.** Also the pair where the cross-collection `MEAL_TYPES` question got answered — see §12 |
| 10 | ✅ **`DailySummary`** *(done 2026-09-05)* | S | ✅ | No longer the riskiest pair: PRE-1 restored `totals.net_carbs_grams` on the gateway in `0cecb4a`, so the two schemas were already equivalent and the half-switched state was as neutral as everybody else's. `updateFromLogs` moved as `updateDailySummaryFromLogs(...)`, the second carve-out from the statics policy; the date normalization and the `requireUser` guard stayed app-side |

### The rollback claim, verified per model

The claim under test: *both apps keep working if only one side has switched, because the collection is
the contract.*

**True, unconditionally, for pairs 1–7 and 9.** For each of those the shared definition is
byte-equivalent to what both sides already declare, so switching one side changes `schema.paths` by
exactly nothing. The half-switched state is indistinguishable from today's state at the database
level, and each app can be deployed and rolled back independently. That is not a hopeful reading — it
is why the index audit mattered: identical indexes mean neither process is depending on an index the
other creates.

**True for pair 8 (`FoodItem`) with one caveat.** `barcode` carries `unique: true, sparse: true` on
both sides (`FG :17-19` / `BG :21-23`), so whichever process reaches `syncIndexes` first creates it and
the other is a no-op. Identical on both sides today, so no risk — but if you ever change a `unique`
flag in the shared module, both processes must be redeployed together or one will try to build an
index the other's data violates. Note it in the module header.

**~~FALSE for pair 10 (`DailySummary`), and this is the one to call out.~~ Superseded — PRE-1 landed
first (`0cecb4a`, 2026-09-05), so by the time pair 10 was done the two schemas *were* equivalent and
its half-switched state was neutral like every other pair's. The analysis below is kept because it is
why PRE-1 was sequenced ahead of the pair, and it is the worked example of when a one-sided switch is
NOT safe.** The two schemas were *not* equivalent when this was written, so a one-sided switch would
have been a behavior change either way:

- Switch **fitnessgeek** first to a shared definition that includes `net_carbs_grams`: no change (that
  is already its definition). Safe.
- Switch **basegeek** first to the same definition: the field starts being written again. That is a
  *fix*, but it is a live behavior change shipping under a refactor's changelog entry, which is exactly
  the sort of thing that makes a bad afternoon hard to diagnose.
- Switch either side to a shared definition derived from **basegeek's** copy: fitnessgeek stops writing
  `net_carbs_grams` too, and the last path that still repairs the field is gone.

This is why PRE-1 exists. Land the field fix on basegeek as its own commit, with its own test and its
own deploy, confirm the keto ring reads correctly in production, and *then* the two schemas are
equivalent and pair 10 becomes as safe as the rest.

### The tests that prove parity

Model them on the existing pair, which is split across the two suites for a reason worth preserving.

**basegeek side** — `apps/basegeek/packages/api/src/__tests__/` — has `mongodb-memory-server` and a
shared in-memory Mongo (`jest.config.js` `globalSetup`, `maxWorkers: 1`). This is where the real
comparison lives. Extend `userSettingsSchemaParity.test.js` into a table-driven
`fitnessgeekSchemaParity.test.js` over all consolidated pairs, reusing its two helpers verbatim:

- `describePath()` (`userSettingsSchemaParity.test.js:45-58`) — the stable JSON description of one path
  (`instance`, `enum`, `default`, `required`, `index`, `unique`, `sparse`, `trim`, `ref`)
- the three assertions at `:61-96` — same path set, same per-path description, both matching the shared
  factory output with `_id`/`__v` stripped
- the write-through pattern at `:99-135` — bind fitnessgeek's *own* schema object to basegeek's
  connection on basegeek's collection name (`:106-108`), then write from each side and read from the
  other. Per pair, pick the field that would actually have been lost: `totals.net_carbs_grams` for
  `DailySummary`, `barcode` for `FoodItem`
- the control at `:155-163` — prove strict mode is really on, or the whole suite proves nothing

Add one **index** assertion the current test doesn't have, because indexes are part of the contract and
`describePath` only sees the path-level `index: true` flag, not `schema.index()` calls:

```js
const norm = (m) => m.schema.indexes()
  .map(([keys, opts]) => JSON.stringify([keys, { unique: !!opts.unique, sparse: !!opts.sparse,
                                                 expireAfterSeconds: opts.expireAfterSeconds }]))
  .sort();
expect(norm(RestModel)).toEqual(norm(GraphQLModel));
```

**fitnessgeek side** — `apps/fitnessgeek/backend/src/__tests__/models/` — is **hermetic by design**: no
Mongo, no Redis, no network (`userSettingsSchemaParity.test.js:20-24`). It cannot import basegeek's
model, because that model calls `getAppConnection('fitnessgeek')` at import time and would leave an
open handle. So this half does two things and only two:

- fitnessgeek's real model vs the shared factory, path set only (`:60-74`)
- **source-level** checks on basegeek's file read as text (`:91-102`): that it contains the
  `@geeksuite/schemas/fitnessgeek/<model>` specifier, that it matches
  `/create<Model>Schema\s*\(\s*mongoose\s*\)/`, and — the one that actually prevents regression —
  `expect(src).not.toMatch(/new\s+mongoose\.Schema\s*\(\s*\{/)`. That last assertion is what stops
  someone pasting a schema literal back in

Keep the split. Merging the two halves means either giving up fitnessgeek's hermeticity or giving up the
real two-model comparison, and both are worse than a bit of duplication.

---

## 5. Pre-work — fix these before consolidating anything

### PRE-1 · Restore `totals.net_carbs_grams` on the gateway · **bug fix, ship alone** · S · **DONE 2026-09-05**

`apps/basegeek/packages/api/src/graphql/fitnessgeek/models/DailySummary.js`:

1. Add `net_carbs_grams: { type: Number, default: 0, min: 0 }` to the `totals` block, between
   `fiber_grams` (`:39-43`) and `sugar_grams` (`:44-48`), matching
   `apps/fitnessgeek/backend/src/models/DailySummary.js:41-45` exactly.
2. Add `net_carbs_grams: 0` to the accumulator at `:149-156` (FG `:143`).
3. Add the accumulation line after `totals.fiber_grams` at `:182`:
   `totals.net_carbs_grams += Math.max(0, ((n.carbs_grams || 0) - (n.fiber_grams || 0)) * multiplier);`
   (FG `:172`).

Test: a memory-Mongo case that writes two food logs with known carbs and fiber, calls
`updateFromLogs`, and asserts the persisted `totals.net_carbs_grams` — reading it back from a `.lean()`
query, not from the returned document, so strict-mode stripping is actually exercised. Assert the
`Math.max(0, …)` floor too: a food with more fiber than carbs must not push the day negative.

Repair for existing data: none needed. `updateFromLogs` recomputes the whole `totals` sub-document from
the food logs on every call, and the `dailySummary` query calls it (`resolvers.js:456`), so each user's
days heal the next time they are viewed. No migration, no backfill script. Say so in the commit message
so nobody writes one.

**Done 2026-09-05.** Field and accumulation line added exactly as prescribed above; confirmed against
`apps/fitnessgeek/backend/src/models/DailySummary.js` line by line — the two `updateFromLogs` statics
now compute `net_carbs_grams` identically. Test added:
`apps/basegeek/packages/api/src/__tests__/dailySummaryGatewayFixes.test.js` (schema-shape assertion,
a two-log accumulation asserted via `.lean()`, the `Math.max(0, …)` floor, and a regression guard that
a second `updateFromLogs` call — the gateway's read-triggers-recompute hot path — doesn't re-erase the
field). No migration was run or needed, confirming the doc's claim: recompute-on-read heals each day
the next time it's viewed.

### PRE-2 · Delete basegeek's two hand-rolled date normalizers · **bug fix** · XS · **DONE 2026-09-05**

Replace `toUtcDate` with `@geeksuite/utils`'s `toUtcMidnight` in both files. basegeek's api already has
the dependency (`apps/basegeek/packages/api/package.json:19`), so this is an import swap and a
deletion:

- `graphql/fitnessgeek/models/DailySummary.js` — delete `:100-109`, replace the six call sites
  (`:112, :136, :139, :226, :229` and the `getOrCreate` use)
- `graphql/fitnessgeek/models/FoodLog.js` — delete `:106-117`, replace the six call sites
  (`:121, :124, :138, :141, :164, :167`)

The `setUTCHours(0,0,0,0)` immediately after each call is now redundant (`toUtcMidnight` already
returns UTC midnight); leave the `setUTCHours(23,59,59,999)` end-of-day ones, or better, switch those
pairs to `utcDayRange()` from `packages/utils/src/dates.js:106-111`, which is exactly this idiom. Add a
case to `packages/utils/src/__tests__/dates.test.js` for the ISO-instant input if one isn't there.

This is also what makes pair 9 (`FoodLog`) drop from M to S, and removes two of the four conflicting
divergences before consolidation starts.

**Done 2026-09-05.** Both local `toUtcDate` helpers deleted; both files now
`import { toUtcMidnight } from '@geeksuite/utils/dates'` (matching the import specifier already used by
`graphql/fitnessgeek/resolvers.js` in the same package), and every call site swapped. The redundant
`setUTCHours(0,0,0,0)` lines were left in place rather than pulled — harmless no-ops now, and touching
them was out of scope for this pass; `utcDayRange()` was not adopted for the same reason. Test added
in `dailySummaryGatewayFixes.test.js`: a `YYYY-MM-DD` string, a `Date`, and an ISO-instant string
(`'2026-09-05T14:00:00Z'`) all resolve to `2026-09-05T00:00:00.000Z` — not the `2026-08-31` the old
`toUtcDate` produced — through both `DailySummary.getOrCreate` and `FoodLog.getLogsForDate`. The
ISO-instant case was already covered in `packages/utils/src/__tests__/dates.test.js`, so nothing was
added there.

### PRE-3 · Delete the two orphan models · XS · ✅ **DONE 2026-09-05**

Step 0 above. Do it in the same pass as PRE-2; it is `rm` plus a `rg` to confirm.

**Done 2026-09-05.** Re-proved before deleting: across all of `apps/basegeek/packages`, the only
occurrence of either identifier was its own `export default fitnessConn.model(...)` line — no
resolver, no typeDef, no test, no service, and (checked case-insensitively) no reference to the
`aifoodpromptcaches` / `medicationlogs` collection names either. Both files deleted. **There is no
barrel to update:** `graphql/fitnessgeek/models/` has no `index.js`; `resolvers.js` imports each
model file directly. `gatewaySchemaLoads` — the tripwire that would catch a dangling import — stayed
green. fitnessgeek's own copies are untouched and remain the sole reader and writer of both
collections. A regression guard now asserts both files stay gone
(`apps/fitnessgeek/backend/src/__tests__/models/sharedSchemaParity.test.js`), because a
re-declaration would put a second process back in the race to build `AIFoodPromptCache`'s 45-day TTL
index on a collection basegeek never reads.

### PRE-4 · Decide `Meal`'s static semantics · XS (a decision, not code)

Pair 7 is blocked on an answer to one question: does fitnessgeek's `getActiveMeals(undefined)` returning
every user's meals need fixing? Every current caller passes a userId (`routes/mealRoutes.js:19, 21, 23`),
so it is not exploitable today. Recommendation: **leave it**, note it as a hardening follow-up alongside
`DOCS/SUITE_TODO.md`'s auth-isolation suites, and consolidate only `Meal`'s fields. Adding `requireUser`
to fitnessgeek's statics is a two-line change but it turns a silent over-fetch into a thrown error, and
that belongs in a commit whose title says so.

**Confirmed 2026-09-05.** No code changed — per this doc's own recommendation, `apps/fitnessgeek/**`
was not touched and basegeek's `Meal.js` statics (`findOwned`, `getActiveMeals`, `getMealsByType`,
`searchMeals`, all `requireUser`-guarded) were left exactly as they are. Recorded here again as the
hardening follow-up this doc already names.

### PRE-5 · Correct the two stale "fitnessgeek is CJS" comments · XS · ✅ **DONE 2026-09-05**

`packages/schemas/fitnessgeek/userSettings.js:46-48` and
`apps/basegeek/packages/api/src/__tests__/userSettingsSchemaParity.test.js:31`. Both predate the
2026-09-05 ESM migration. The CJS choice for `@geeksuite/schemas` is still correct; only its stated
reason is wrong. Fold this into whichever commit touches those files first.

**`userSettings.js` fixed 2026-09-05**; the module header now cites no-build-step/dual-consumable/
`@geeksuite/crypto-vault` precedent instead of "fitnessgeek's backend is CJS."

**Closed 2026-09-05** with pairs 1–2: the comment at
`apps/basegeek/packages/api/src/__tests__/userSettingsSchemaParity.test.js:31` now says the backend is
ESM and that CommonJS is a property of the shared schema module, not of the app. The two new shared
modules (`weight.js`, `bloodPressure.js`) carry the corrected justification from the start.

**One stale claim of the same family survives, outside this item's scope:**
`apps/basegeek/packages/api/src/graphql/fitnessgeek/models/UserSettings.js:16-18` still reads
"fitnessgeek's backend is CJS and requires it directly" in its interop comment. The *conclusion* —
use the default-import form — is still correct and is what the two new basegeek wrappers do; only the
reason is wrong. Fold the fix into whichever commit next touches that file.

### Not pre-work, but worth knowing

- `packages/schemas` currently depends on `@geeksuite/crypto-vault` and nothing else, and requires it
  *lazily* (`userSettings.js:390-403`) because it throws at load without `KEY_VAULT_SECRET`. None of the
  twelve remaining models needs the vault, so this stays a one-dependency package. Keep it that way.
- Adding a `workspace:*` dependency needs a root `pnpm install` or the frozen-lockfile install in the
  image build fails (`apps/fitnessgeek/DOCS/CONTEXT.md`, "How production gets the workspace packages").
  Consolidation adds no new deps — both apps already depend on `@geeksuite/schemas` — so this shouldn't
  bite, but it is the reason to check `pnpm-lock.yaml` is in step before pushing.

---

## 6. Effort estimates

XS ≈ 1–2 h · S ≈ 3–4 h · M ≈ 6–8 h. Includes writing the shared module, extending the parity test,
both switches, and a deploy of each app.

| Item | Size | Hours |
|---|---|---|
| PRE-1 `net_carbs_grams` fix + test + deploy | S | 3 |
| PRE-2 date normalizers | XS | 1.5 |
| PRE-3 orphan deletions | XS | 1 |
| PRE-4 / PRE-5 decision + comments | XS | 0.5 |
| **Pre-work subtotal** | | **6** |
| 1 `Weight` — includes building the parity-test harness | S | 4 |
| 2 `BloodPressure` | XS | 1.5 |
| 3 `Medication` | XS | 1.5 |
| 4 `LoginStreak` | XS | 1.5 |
| 5 `WeightGoals` | S | 3 |
| 6 `NutritionGoals` | S | 3 |
| 7 `Meal` | S | 3.5 |
| 8 `FoodItem` (fields + `findOrCreate` + `search`) | M | 7 |
| 9 `FoodLog` (M → S once PRE-2 lands) | S | 4 |
| 10 `DailySummary` (M → S once PRE-1 lands) | S | 4 |
| **Consolidation subtotal** | | **33** |
| **Total** | | **≈ 39 h ≈ 5 working days** |

Pair 1 carries most of the fixed cost — the table-driven parity test, the `exports` plumbing, the
first-time decisions. Pairs 2–4 are near-mechanical once it exists. Pairs 8–10 are where the judgment
is, which is why they are last. If the pre-work lands and pairs 8–10 get deferred, the first seven
pairs are **≈ 18 hours** and leave the suite in a strictly better place than it is now.

## 7. The proof: do `Weight` and `BloodPressure` first

**`Weight`** (`apps/fitnessgeek/backend/src/models/Weight.js`, 47 lines /
`apps/basegeek/packages/api/src/graphql/fitnessgeek/models/Weight.js`, 50 lines) is the smallest pair in
the set and has the least behavioral surface of any: no statics, no hooks, no `findOrCreate`, one
compound index (`weightSchema.index({ userId: 1, log_date: -1 })`, identical line on both sides),
identical `toJSON`/`toObject` virtual settings. `diff` between the two files produces exactly three
lines of connection binding. It exercises the full five-step pipeline — promote, test, switch, switch,
delete — with a divergence surface of zero, which is precisely what a proof wants: if something goes
wrong, the problem is in the *pattern*, not in the model. And it is genuinely two-sided
(`controllers/weightController.js:2`, `services/foodReportService.js:4`,
`services/aiInsightsService.js:12`, `scripts/importWeight.js:12` on one side; `resolvers.js:9` on the
other), including a standalone import script — so the shared module gets exercised from a process that
is neither app's server, which is a real property of this package worth confirming early.

**`BloodPressure`** is the right second because it is the same shape but *not* a copy: it adds a virtual
with logic (`bpCategory`), a wider field set, and its own bounds that a hand-written validation file
mirrors (`apps/fitnessgeek/backend/src/validation/schemas/bloodPressure.js:4` — "Mirrors
models/BloodPressure.js bounds exactly"). That makes it the first pair where the parity test has to
prove something non-trivial — that a virtual survives the move into the factory, and that the shared
definition is still the thing the validation layer is mirroring. Doing it second, immediately after a
pair with zero surprises, means any failure is unambiguously about the new thing.

Together they also settle the `userId`-vs-`user_id` question early (§4, Tier 1 note): they are the only
two models in the set using the camelCase owner field, so getting both through the pipeline without
touching it establishes the precedent that consolidation is a pure refactor. That precedent is what
makes `DailySummary` safe to attempt ten pairs later.

---

## 8. Pairs 1 and 2, done — and what the pipeline actually taught us

**`Weight` and `BloodPressure` were consolidated on 2026-09-05**, together with the two orphan
deletions (PRE-3). The five-step pipeline in §4 held. What follows is the record and the corrections,
written for whoever picks up pairs 3–10.

### What shipped

| | |
|---|---|
| New shared modules | `packages/schemas/fitnessgeek/weight.js` → `createWeightSchema(mongoose)`<br>`packages/schemas/fitnessgeek/bloodPressure.js` → `createBloodPressureSchema(mongoose)` |
| Wiring | one subpath each in `packages/schemas/package.json` `exports`, one entry each in `packages/schemas/index.js` |
| Wrappers (4) | `apps/fitnessgeek/backend/src/models/{Weight,BloodPressure}.js` — named import, `mongoose.model(...)`<br>`apps/basegeek/packages/api/src/graphql/fitnessgeek/models/{Weight,BloodPressure}.js` — default import + destructure, `fitnessConn.model(...)` |
| Statics moved | **none — there are none.** Both models have zero statics on both sides, as §1a said. The wrappers carry a comment saying that if either side ever needs one it belongs in the wrapper, not the shared module |
| New tripwires | `apps/basegeek/packages/api/src/__tests__/fitnessgeekSchemaParity.test.js` (table-driven, in-memory Mongo)<br>`apps/fitnessgeek/backend/src/__tests__/models/sharedSchemaParity.test.js` (hermetic, source-level) |
| Third copy folded in | `apps/fitnessgeek/backend/src/validation/schemas/bloodPressure.js` now imports `bloodPressureBounds` instead of restating the four numbers |
| Deleted | `apps/basegeek/packages/api/src/graphql/fitnessgeek/models/{AIFoodPromptCache,MedicationLog}.js` |

Test counts: fitnessgeek's backend **104 → 129**, basegeek's api **856 → 889** (47 suites, 1 pre-existing
skip). `packages/schemas` lint clean; `node tools/syntax-check.mjs` 759 files clean.

### Where the plan was wrong

Three corrections, all in the same direction — **§1a is reliable about field sets and indexes and
loose about everything else on the schema object.**

1. **`BloodPressure`'s virtual is `status`, not `bpCategory`.** §4 and §7 both name it `bpCategory`.
   The shipped name on both sides is `status`, and because both schemas set
   `toJSON: { virtuals: true }`, it is on the wire in every API response. It was moved under its
   shipped name. Renaming it would be a behaviour change wearing a refactor's clothes.
2. **There are two virtuals, not one — and `Weight` has one too.** §4 Tier 1 describes `Weight` as
   having "no statics, no hooks, one compound index, `toJSON`/`toObject` virtuals identical" without
   naming `formatted_date`, and calls `BloodPressure` "one virtual". Both models carry
   `formatted_date`; `BloodPressure` adds `status`. Assume every remaining pair has undocumented
   virtuals until you have read the file.
3. **The bounds had a *third* copy, outside both model files.**
   `apps/fitnessgeek/backend/src/validation/schemas/bloodPressure.js` opened with the comment
   *"Mirrors models/BloodPressure.js bounds exactly"* — the same hand-sync this exercise exists to
   end, in zod instead of Mongoose. It now imports `bloodPressureBounds` from the shared module, and
   a test asserts the zod layer rejects exactly what the schema rejects. §1 counted divergences
   between the two *model* files only; it did not look for mirrored constants elsewhere in either app.

### What the tripwire had to grow

The `UserSettings` tripwire's helpers do not generalize as-is. Two real gaps, both fixed in the new
table-driven suite and both worth back-porting when someone next touches
`userSettingsSchemaParity.test.js`:

- **`describePath()` ignored `min`, `max` and `maxlength`.** For `UserSettings` that never mattered —
  none of its 81 paths has a numeric bound. For `BloodPressure` the bounds *are* the interesting part
  of the contract, and for `DailySummary` every `totals.*` path carries `min: 0`. The new copy adds
  those three keys. Without them a divergence on `systolic.max` would sail straight through.
- **Virtuals appear nowhere in `schema.paths`.** A virtual that exists on one side only — or one
  whose logic drifts — is invisible to a path-set comparison. The new suite asserts the virtual name
  set on both models, that `toJSON`/`toObject` still serialize them, and, for `status`, its output at
  every band boundary (13 cases) against both real models *and* the exported
  `classifyBloodPressure()`. That is why the classifier is a named export rather than an inline
  closure: a behaviour assertion needs something to call.

The index assertion §4 asked for works, with one adjustment: feed it a `Schema`, not a `Model`, and
keep the normalizer to `{ unique, sparse, expireAfterSeconds }` — Mongoose adds `background: true`
to every index's options, so a raw comparison of the options object is noisier than it needs to be.

### The mechanical facts, confirmed

- **The import forms in §3 are exactly right.** Named import from fitnessgeek, default-import +
  destructure in basegeek. Both work under Node ESM, under each app's jest harness, and inside the
  production image. Keep `module.exports = { … }` as an object literal.
- **No `pnpm install`, no lockfile churn.** Adding a subpath to an existing package's `exports` is not
  a dependency change; both apps already depend on `@geeksuite/schemas`. `pnpm-lock.yaml` is
  untouched, so the frozen-lockfile install in the image build is unaffected. This should hold for
  every remaining pair — none of them adds a dependency.
- **The production image resolves the new subpaths.** `docker build -f apps/fitnessgeek/Dockerfile .`
  then a `--network none` run: the app boots, mounts routes, and dies at `MongoDB connection failed`
  — not at an import. Importing the two models inside the image directly returns the full path list,
  the compound index, and `status` = `Stage 1` for 145/88. The image was removed afterwards.
- **There is no barrel in `graphql/fitnessgeek/models/`.** Resolvers import model files directly, so
  promoting or deleting one is a file-level operation with nothing else to update.

### The rollback claim, confirmed for pairs 1 and 2

§4's claim — *both apps keep working if only one side has switched, because the collection is the
contract* — holds unconditionally for these two, and it is now asserted rather than argued:

| | `Weight` | `BloodPressure` |
|---|---|---|
| Collection, both sides | `weights` | `bloodpressures` |
| Indexes, both sides | `{ userId: 1, log_date: -1 }` — no `unique`, no `sparse`, no TTL | `{ userId: 1, log_date: -1 }` — same |
| Paths added / removed / retyped / re-defaulted | none | none |

Neither side passes an explicit `collection:` option and the model names match, so Mongoose's default
pluralization lands both on the same collection — the new suite asserts
`Rest.collection.name === GraphQL.collection.name` per pair rather than trusting that. The shared
definition is byte-equivalent to what both sides already declared, so switching one side changes
`schema.paths` by exactly nothing; a half-switched deploy is indistinguishable from today's state at
the database level, and each app can be deployed and rolled back independently. Identical indexes
mean neither process depends on an index the other creates, so there is no ordering constraint
between the two deploys either.

### Carry-forward for pairs 3–10

1. **Grep for the third copy before you start.** Not just `models/`: also
   `apps/fitnessgeek/backend/src/validation/schemas/`. Pair 3 (`Medication`) already has one —
   `validation/schemas/medication.js:5` restates `TIME_OF_DAY = ['morning','afternoon','evening','bedtime']`,
   which is `MED_TIME_OF_DAY` in `models/Medication.js:3`. Export the enum from the shared module and
   have both consume it, the way `bloodPressureBounds` now works.
2. **One mirror is deliberate — leave it.** `validation/schemas/weight.js` mirrors `Weight`'s bounds
   but *intentionally* uses a positive floor instead of `min: 0`, with a documented reason. It was not
   rewired. Its header comment now points at `models/Weight.js` for numbers that live in
   `packages/schemas/fitnessgeek/weight.js` — a one-line comment fix, deliberately left out of this
   pass because that file was outside its touch list. **Follow-up: repoint that comment.**
   ✅ **Closed** — the comment now reads "Mirrors the shared schema
   `packages/schemas/fitnessgeek/weight.js` (`min: 0, max: 1000`), with a positive floor instead of
   `min: 0`." The mirror itself is still deliberate and still not rewired.
3. **Adding a pair is now a table row.** Both new suites are `describe.each` over a `PAIRS` array:
   model pair, factory, expected path list, expected virtual list, a probe document. Pair 3 should be
   under an hour of test work, not the 1.5 h in §6.
4. **Assert the expected path list literally, not just `length > N`.** The new suites compare against
   an explicit array of field names. That is what makes a failure say *which* field went missing
   instead of *some field* went missing, and it is cheap when the model has eight paths rather than 81.
5. **§6's estimates are high for Tier 1.** Pairs 1 and 2 together — including building the shared
   harness both suites now use, the validation-file rewire, a full image build and the two deletions —
   came in well under the 5.5 h §6 budgets for them. Pairs 3 and 4 should be genuinely mechanical.
   The judgment-heavy pairs (8–10) are unaffected by any of this.

---

## 9. Pairs 3, 4 and 5, done — and what changed in the picture

**`Medication`, `LoginStreak` and `WeightGoals` were consolidated on 2026-09-05**, in §4's order
(Tier 1 #3 and #4, then Tier 2 #5). §8's carry-forward held: the pipeline is a table row per pair
plus a shared module, and none of the three took anything like §6's budget. What follows is the
record, the corrections, and what pairs 6–10 should expect.

### What shipped

| | |
|---|---|
| New shared modules | `packages/schemas/fitnessgeek/medication.js` → `createMedicationSchema(mongoose)`<br>`packages/schemas/fitnessgeek/loginStreak.js` → `createLoginStreakSchema(mongoose)`<br>`packages/schemas/fitnessgeek/weightGoals.js` → `createWeightGoalsSchema(mongoose)` |
| Wiring | one subpath each in `packages/schemas/package.json` `exports`, one entry each in `packages/schemas/index.js` |
| Wrappers (6) | `apps/fitnessgeek/backend/src/models/{Medication,LoginStreak,WeightGoals}.js` — named import, `mongoose.model(...)`<br>`apps/basegeek/packages/api/src/graphql/fitnessgeek/models/{Medication,LoginStreak,WeightGoals}.js` — default import + destructure, `fitnessConn.model(...)` |
| Statics — stayed app-side | `LoginStreak.getOrCreateStreak` (×2 copies), `WeightGoals.{getActiveWeightGoals,createWeightGoals,updateWeightGoals}` (×2 copies each). basegeek's keep `requireUser`; fitnessgeek's stay unguarded, per §3 and PRE-4 |
| Instance method — moved | `LoginStreak.recordLogin`, plus `applyLoginToStreak(streak, now)` and `attachLoginStreakMethods(schema)` as named exports |
| Third copies folded in | `apps/fitnessgeek/backend/src/validation/schemas/medication.js` now imports `MED_TIME_OF_DAY`, `MED_TYPES` and `medicationBounds` instead of restating two enum arrays and four numbers |
| Parity rows added | 3 per suite, in both `fitnessgeekSchemaParity.test.js` and `sharedSchemaParity.test.js` |

Test counts: fitnessgeek's backend **129 → 169**, basegeek's api **889 → 930** (47 suites, 1
pre-existing skip, `gatewaySchemaLoads` green). `packages/schemas` lint clean;
`node tools/syntax-check.mjs` 762 files clean. No `pnpm install`, no lockfile change.

### Where the plan was wrong, per pair

§8's correction #2 — *"assume every remaining pair has undocumented virtuals until you have read the
file"* — should be widened. §1a is reliable about **field sets and indexes** and unreliable about
**everything else on the schema object**: virtuals, instance methods, serialization settings and
timestamp key renames are all under-reported.

**Pair 3 · `Medication`** — §4 calls it "106/109 lines, shared `MED_TIME_OF_DAY` enum literal
identical on both sides, no statics." All true. Three things it doesn't mention:

1. **`timestamps: { createdAt: 'created_at', updatedAt: 'updatedAt' }`.** Snake on the way in, camel
   on the way out. Every other renaming model in the set uses `updated_at`. This is what both copies
   declare and what is in the `medications` collection, so it moved verbatim; the parity rows spell
   `updatedAt` out in the expected-path list so nobody "fixes" it by accident. Fixing it properly is
   a migration with its own backfill, not a line in a refactor.
2. **`toJSON: { virtuals: true }` / `toObject: { virtuals: true }` with no virtual declared.** The
   only effect is that mongoose's automatic `id` virtual is serialized — and it *is* on the wire, so
   it stayed. This is also why the parity suites grew a per-pair `serializesVirtuals` flag: three of
   the five consolidated pairs opt in and two do not, and which is which is itself contract.
3. **There were two more enum copies, not one.** §8's carry-forward named `TIME_OF_DAY` in
   `validation/schemas/medication.js:5`. The same file also declared `MED_TYPES` at `:4` (the
   `med_type` enum) and restated the `days_supply` (1–3650) and `notes` (500) bounds inline. All
   four now come from the shared module.

**Pair 4 · `LoginStreak`** — §4 calls it "one static, `getOrCreateStreak`; the only difference is
basegeek's `requireUser`." The static part is right. Missed:

1. **An instance method, `recordLogin`** — 40 lines of streak arithmetic, byte-identical on both
   sides, mutating `current_streak`, `longest_streak`, `streak_start_date` and `last_login_date`. It
   moved. §3 already says instance methods belong in the shared module and the reason applies with
   force here: a divergence would silently corrupt a user's streak rather than throw. It is the first
   instance method any of these modules carries.
2. **Four timestamp paths.** The definition declares `created_at`/`updated_at` by hand *and* the
   options pass `timestamps: true`, so mongoose adds `createdAt`/`updatedAt` on top. `recordLogin`
   stamps the hand-rolled one; mongoose stamps the other. Both copies did this. Moved verbatim.
3. **`user_id` is indexed twice** — path-level `index: true` plus `schema.index({ user_id: 1 })`.
   That is where the `[MONGOOSE] Warning: Duplicate schema index on {"user_id":1}` line at boot comes
   from; it predates this work and now appears twice per process because both the model and the
   parity suite build the schema. Left alone: removing one would make the shared definition stop
   being byte-equivalent to what is deployed, which is the property the whole rollback claim rests on.

**Pair 5 · `WeightGoals`** — §4's description is accurate: three statics, `requireUser`-only
divergence, basegeek the only writer. Two things worth recording:

1. **The `UserSettings.weight_goal` trap is real, and it is the same trap §4 flags for
   `NutritionGoals`.** `validation/schemas/settings.js:117-118` declares
   `startWeight: boundedNumber(0, 2000)` and `targetWeight: boundedNumber(0, 2000)` — field names
   that match this model exactly. It is validating a *nested sub-document on the `usersettings`
   collection*, not this collection: different bounds (this schema has `min: 0` and no max), extra
   fields (`enabled`, `ratePerWeek`, `unit`, `lastRecalculated`), and `routes/goalRoutes.js` reads
   both and merges them. **It was deliberately not rewired.** Pointing it at these numbers would
   silently change what a settings write accepts. This is a mirror that *looks* like a third copy and
   isn't — the §8 carry-forward's "grep for the third copy" needs a companion rule: *and then check
   it is the same collection*.
2. **Mixed field naming**, like `Weight`'s `userId`: `user_id` and `is_active` are snake_case,
   `startWeight`/`targetWeight`/`startDate`/`goalDate` are camelCase, in one document. Pre-existing,
   left alone, recorded.

### Third copies: what was found and what was done

| Copy | Location | Disposition |
|---|---|---|
| `TIME_OF_DAY` enum | `validation/schemas/medication.js:5` | **Rewired** — imports `MED_TIME_OF_DAY` |
| `MED_TYPES` enum | `validation/schemas/medication.js:4` | **Rewired** — imports `MED_TYPES` |
| `days_supply` 1–3650, `notes` 500 | `validation/schemas/medication.js:37-38` | **Rewired** — imports `medicationBounds` |
| `MED_TIME_OF_DAY` — a **fourth** copy | `apps/fitnessgeek/backend/src/models/MedicationLog.js:3` | **Left.** Outside this pass's touch list, and `MedicationLog` is single-writer (basegeek's copy was deleted as an orphan in PRE-3) so it is not a two-writer drift hazard. Still a hand-synced enum. **Follow-up: import it.** |
| `['rx','otc','supplement']` inline ×2 | `routes/medicationRoutes.js:114, :194` | **Left.** Routes are outside the touch list. The zod layer in front of them already rejects an invalid `med_type`, so these two ternaries are now dead defaulting logic rather than a second opinion. **Follow-up: import `MED_TYPES` or delete the ternaries.** |
| `startWeight`/`targetWeight` bounds | `validation/schemas/settings.js:117-118` | **Left, deliberately** — it validates `UserSettings.weight_goal`, a different collection. See pair 5 above. Not a third copy. |
| `Weight` bounds | `validation/schemas/weight.js` | **Still a deliberate mirror** (positive floor instead of `min: 0`, documented reason). §8's follow-up to repoint its header comment is now **closed**. |

### What the tripwires grew

Both suites are still `describe.each` over a `PAIRS` array; three rows went into each. Two additions
to the harness, both driven by the new pairs and both worth having for pairs 6–10:

- **`serializesVirtuals`, per pair.** The old assertion hard-coded
  `expect(schema.options.toJSON).toEqual({ virtuals: true })`, which is true of `Weight`,
  `BloodPressure` and `Medication` and false of `LoginStreak` and `WeightGoals`. It now asserts the
  shipped answer either way, so "someone turned virtual serialization on" is a failure and not a pass.
- **`ownerField`, per pair.** The write-through helper filtered on `{ userId: OWNER }` because the
  first two pairs are the only two using the camelCase owner field. Every remaining pair uses
  `user_id`. It now takes the field from the row.

Three new behaviour describes, because presence assertions prove nothing about logic:

- **`Medication` enums and bounds** — both models declare the shared enums; an out-of-enum
  `med_type` or `times_of_day` slot fails `validateSync()` on both; and the zod layer accepts and
  rejects exactly what the schema does, walked over every enum member and both ends of both bounds.
- **`LoginStreak` arithmetic** — the six branches of `applyLoginToStreak` (first login, consecutive
  day, beating the record, gap-reset, same-day no-op, and the local-calendar-day rule that
  `setUTCHours` would get wrong after ~18:00 US-Central) asserted hermetically on the fitnessgeek
  side, plus `recordLogin` persisting through a real collection on basegeek's in-memory Mongo, plus
  a check that both sides' method bodies are the same source.
- **The statics divergence, asserted as a decision** — the gateway's `getOrCreateStreak` and all
  three `WeightGoals` statics reject an unscoped call with `UNAUTHORIZED`; fitnessgeek's copy bound
  to the same collection returns `null` instead; the two implementations are provably distinct
  objects; and the fitnessgeek wrapper source contains no `requireUser` and no `ownership.js` import.
  If someone "helpfully" unifies them, they have to delete these assertions to ship — which is the
  point, because that unification is PRE-4's separate ticket, not a refactor.

One harness wrinkle worth knowing: `Object.keys(schema.methods)` on a compiled model includes
mongoose's own `initializeTimestamps`. The suite filters it by name rather than comparing against a
bare schema, because the compiled and uncompiled method sets differ.

### The rollback claim, confirmed for pairs 3–5

§4's claim — *both apps keep working if only one side has switched, because the collection is the
contract* — holds unconditionally for these three. It was verified mechanically, not argued: each
model was built from `git show HEAD:<path>` under a temporary model name and compared to the
switched model on path set, per-path description (type, enum, default, required, index/unique/sparse
flags, min/max/maxlength), normalized index list, schema options, and the statics and methods key
sets. All three came back **identical**.

| | `Medication` | `LoginStreak` | `WeightGoals` |
|---|---|---|---|
| Collection, both sides | `medications` | `loginstreaks` | `weightgoals` |
| Indexes, both sides | `{user_id:1}`, `{med_type:1}`, `{rxcui:1}`, `{user_id:1, display_name:1}` | `{user_id:1}` ×2 (the duplicate) | `{user_id:1}`, `{is_active:1}`, `{user_id:1, is_active:1}` |
| `unique` / `sparse` / TTL anywhere | none | none | none |
| Paths added / removed / retyped / re-defaulted | none | none | none |

No `unique` flag anywhere in the three, so §4's `FoodItem` caveat about redeploying both processes
together does not apply here. The shared definitions are byte-equivalent to what both sides already
declared, so a half-switched deploy is indistinguishable at the database level and either app can be
deployed or rolled back alone, in either order.

**The production image resolves the new subpaths.** `docker build -f apps/fitnessgeek/Dockerfile .`
then a `--network none` run: the app boots, mounts routes, and dies at `MongoDB connection failed` —
not at an import. Importing the three models inside the image returns `medications`/`loginstreaks`/
`weightgoals`, 23/11/10 paths, the full index lists above, `med_type` enum intact, `recordLogin`
present, `WeightGoals`' three statics present, and the rewired zod validator accepting a
`times_of_day: ['bedtime']`, `days_supply: 3650` payload. The image was removed afterwards.

### Carry-forward for pairs 6–10

1. **Read the whole model file, not §1a's row.** Three pairs, three under-reported things: an
   instance method, an asymmetric timestamp rename, and a doubled index. §1a's field-set and index
   columns have been right five times out of five; nothing else in it has been.
2. **Grep for the third copy — then check it is the same collection.** `validation/schemas/` turned
   up a real third copy for `Medication` and a convincing false positive for `WeightGoals`
   (`settings.js` validating `UserSettings.weight_goal`). Pair 6 (`NutritionGoals`) walks straight
   into the same trap and §4 already warns about it: `UserSettings.nutrition_goal` is a different
   document, and `DailySummary.updateFromLogs` reads the *settings* one.
3. **Two enum copies are still outstanding and both are cheap.** `models/MedicationLog.js:3` and the
   two inline `['rx','otc','supplement']` ternaries in `routes/medicationRoutes.js`. Neither is a
   two-writer hazard, so neither blocked this pass; fold them into whichever commit next touches
   those files.
4. **Statics policy survived first contact.** Pair 5 was the first pair where the divergence was
   real and load-bearing (three guarded statics vs three unguarded), and "leave them app-side" cost
   nothing and needed no negotiation. Expect the same for pair 6 (`NutritionGoals`, the same three
   `requireUser` guards) and pair 7 (`Meal`, where C4 makes it the *only* safe answer).
5. **Instance methods are the exception to "statics stay."** The rule is not "behaviour stays
   app-side" — it is *does this mutate declared paths?* `recordLogin` does, so it moved; the
   `requireUser` guards don't, so they stayed. `FoodItem.findOrCreate` (pair 8) is a static that
   fails the first test but passes the spirit of the second — §4 already carves it out, and pair 4's
   split is the precedent for how to carve it: move the logic, export the pure part by name so a
   test can call it.
6. **§6's estimates are now clearly high for Tiers 1–2.** Pairs 3–5 together, including the
   validation rewire, two new harness features, three behaviour describes, a full image build and
   the HEAD-baseline verification, came in far under the 6 h §6 budgets. The judgment-heavy pairs
   (8–10) are still where the time is; nothing here changes that.

---

## 10. Pairs 6 and 7, done — and what is left is only the food family

**`NutritionGoals` and `Meal` were consolidated on 2026-09-05**, in §4's order (Tier 2 #6 and #7).
§9's carry-forward held again, and its first rule earned its keep twice: **§1a's field-set and index
columns have now been right 7/7, and nothing else in it has been right once.** Eight of the thirteen
pairs are shared; the three that remain are the food family (§4 Tier 3), which is exactly where the
plan always said the judgment was.

### What shipped

| | |
|---|---|
| New shared modules | `packages/schemas/fitnessgeek/nutritionGoals.js` → `createNutritionGoalsSchema(mongoose)`<br>`packages/schemas/fitnessgeek/meal.js` → `createMealSchema(mongoose)` |
| Wiring | one subpath each in `packages/schemas/package.json` `exports`, one entry each in `packages/schemas/index.js` |
| Wrappers (4) | `apps/fitnessgeek/backend/src/models/{NutritionGoals,Meal}.js` — named import, `mongoose.model(...)`<br>`apps/basegeek/packages/api/src/graphql/fitnessgeek/models/{NutritionGoals,Meal}.js` — default import + destructure, `fitnessConn.model(...)` |
| Statics — stayed app-side | `NutritionGoals.{getActiveGoals,createGoals,updateGoals}` (×2 copies each), `Meal.{getActiveMeals,getMealsByType,searchMeals}` (×2) and basegeek-only `Meal.findOwned`. basegeek's keep `requireUser`; fitnessgeek's stay unguarded |
| Instance methods — moved | `NutritionGoals.{checkGoalsMet,getProgress}` with `evaluateGoalsMet` / `computeGoalProgress` / `attachNutritionGoalsMethods` as named exports; `Meal.getNutrition` with `sumMealNutrition` / `attachMealMethods` |
| Also moved | `Meal`'s embedded `mealItemSchema` (as `mealItemDefinition` / `createMealItemSchema`) and its `pre('save')` `updated_at` stamp (as `attachMealTimestamps`); `MEAL_TYPES` is exported |
| Third copies folded in | **none for these two pairs** — see below. The two *outstanding* `Medication` copies §9 listed were folded in with this commit: `models/MedicationLog.js` and the two inline ternaries in `routes/medicationRoutes.js` now import `MED_TIME_OF_DAY` / `MED_TYPES` |
| Parity rows added | 2 per suite, in both `fitnessgeekSchemaParity.test.js` and `sharedSchemaParity.test.js` |

Test counts: fitnessgeek's backend **169 → 203**; basegeek's api **930 → 1044** (49 suites, 1
pre-existing skip, `gatewaySchemaLoads` green). Of that +114, **+40 is this work** (the parity suite
went 74 → 114 tests) and +74 arrived with `e23559c`, the concurrent notegeek/flockgeek gateway
validation pass — nothing under `graphql/{notegeek,flockgeek,shared}` was touched here.
`packages/schemas` lint clean; `node tools/syntax-check.mjs` **769 files** clean. No `pnpm install`,
no lockfile change.

### Where the plan was wrong, per pair

**Pair 6 · `NutritionGoals`** — §4 calls it "same shape" with three `requireUser` statics. Both true.
Missed:

1. **Two instance methods, `checkGoalsMet` and `getProgress`.** Byte-identical on both sides, seven
   declared paths read by each. They moved, on §3's rule, and the arithmetic is exported by name so
   the hermetic suite can assert it — the `recordLogin`/`applyLoginToStreak` split from pair 4. Note
   the widened rule: §9's carry-forward #5 framed the test as *does it mutate declared paths?*, which
   these two do not. They still moved, because the failure mode is the one that matters here: a
   divergence would not throw, it would quietly tell each caller a different answer about whether a
   user hit their macros. **§3's "instance methods → the shared module" is the rule; the mutation
   question is why statics are the exception, not a second gate methods have to pass.**
2. **Both methods are caller-less today.** Nothing in either app calls `checkGoalsMet` or
   `getProgress`. They were promoted rather than deleted, deliberately: deleting them changes the
   schema's method key set and breaks the byte-equivalence the rollback claim rests on. Deleting dead
   code is its own ticket. **Follow-up: decide whether these two live or die.**
3. **The two methods disagree with each other, on purpose-by-accident.** `checkGoalsMet` treats
   `sugar_grams` and `sodium_mg` as *ceilings* (`actual <= goal`); `getProgress` treats them as
   *floors* like the other five (`actual / goal`), so a day well under the sodium limit reads as 50 %
   progress. Both shipped copies did this. Moved verbatim, and both suites now assert the asymmetry
   so that nobody fixes one half of it. It is a product question, not a refactor.
4. **An unset or zero goal reads as *not met*, not as trivially met** — `this.calories ? … : false`.
   Also asserted, also verbatim.

**Pair 7 · `Meal`** — §4 says "consolidate the field definitions only; leave both sides' statics
exactly as they are." That was right, and it is the whole reason this pair was safe. Missed:

1. **An embedded sub-schema.** `food_items` is a `DocumentArray` over a second
   `new mongoose.Schema({ food_item_id, servings })`, declared inline above the main schema on both
   sides. It has to be built from the *caller's* mongoose for the same `instanceof` reason the parent
   does, so it moved as `mealItemDefinition(mongoose)` / `createMealItemSchema(mongoose)`. This is the
   first sub-schema in `packages/schemas/fitnessgeek/`, and `describePath()` does not see inside one —
   the rollback check and both suites compare the sub-schema's own path set separately. **`FoodLog`
   and `DailySummary` both have nested structure too; do the same for them.**
2. **A `pre('save')` hook.** §3 said "none of the twelve remaining pairs has a hook on either side"
   and then, in the same sentence, named this one. It exists, it is identical on both sides, it
   mutates a declared path (`updated_at`), and it moved as `attachMealTimestamps`. Worth knowing what
   it does *not* do: the schema passes **no options object at all** — no `timestamps`, no
   `toJSON`/`toObject` — so nothing stamps `updated_at` on a `findOneAndUpdate` or `updateOne`, on
   either side. Shipped behaviour, left alone.
3. **`Meal` is the only pair with no schema options.** `created_at` and `updated_at` are ordinary
   declared paths with `default: Date.now`. `new Schema(def)` and `new Schema(def, {})` produce an
   identical `schema.options` (verified), so the module passes an empty `mealOptions` for symmetry
   with its five siblings and changes nothing.
4. **A third instance method, `getNutrition`** — 35 lines of populate-and-sum arithmetic, identical on
   both sides, also caller-less today. Moved, with `sumMealNutrition(foodItems)` exported. Its quiet
   failure mode is now asserted rather than merely present: an un-populated `food_item_id` contributes
   nothing instead of `NaN`, so a caller that forgets `.populate()` silently gets zeros.
5. **Its only index is path-level.** No `schema.index()` call on either side, just `index: true` on
   `user_id`. `schema.indexes()` reports it anyway, so the existing index assertions cover it.

### Third copies: what was found, what was rewired, what was rejected

§9's rule — *grep `validation/schemas/`, then check it is the same collection* — was the right rule and
it fired both ways.

| Copy | Location | Disposition |
|---|---|---|
| `nutrition_goal` bounds and enums | `validation/schemas/settings.js:86-115` | **Rejected — different collection.** It validates `UserSettings.nutrition_goal` on `usersettings`: `plan_type`, `calorie_target_mode`, `weekly_schedule`, `bmr`, `tdee`, a `keto` block. It shares **not one field name** with `nutritiongoals`, and `DailySummary.updateFromLogs` reads *that* one. §4 predicted this trap and §9 predicted we would walk into it; the only overlap is a coincidental `boundedNumber(0, 10000)` on two unrelated calorie fields. Not rewired |
| a zod validator for `nutritiongoals` | — | **Does not exist.** No `validation/schemas/nutritionGoals.js`; the gateway is the only writer and it validates through GraphQL input types |
| a zod validator for `meals` | — | **Does not exist** either |
| `['breakfast','lunch','dinner','snack']` ×2 | `routes/mealRoutes.js:107, :200` (`const validMealTypes`) | **Left** — routes are outside this pass's touch list, same call as the `medicationRoutes` ternaries in §9. `MEAL_TYPES` is exported and ready. **Follow-up: import it** |
| the same four strings, on `foodlogs` | `models/FoodLog.js` on **both** sides | **Left, and do not reach across from here.** It is a different collection. Whether `meals` and `foodlogs` share one enum constant or keep their own is pair 9's decision |
| `MED_TIME_OF_DAY` — the fourth copy | `models/MedicationLog.js:3` | **Rewired** — imports `MED_TIME_OF_DAY`. §9's outstanding follow-up, closed |
| `['rx','otc','supplement']` inline ×2 | `routes/medicationRoutes.js:114, :194` | **Rewired** — both ternaries now test `MED_TYPES.includes(...)`. §9's other outstanding follow-up, closed. A hermetic test asserts neither literal comes back |

### What the tripwires grew

No new harness features were needed — `serializesVirtuals` and `ownerField` from §9 covered both
rows, and both pairs are `serializesVirtuals: false` with `ownerField: 'user_id'`. Four new
behaviour describes:

- **`NutritionGoals` arithmetic** (hermetic, fitnessgeek): floors vs ceilings, the unset-goal branch,
  the 100 % clamp, the `checkGoalsMet`/`getProgress` asymmetry, and the real model's methods agreeing
  with the exported functions.
- **`NutritionGoals` arithmetic** (basegeek): both models carry both methods *from the same source*,
  and the two models' answers are equal for the same input.
- **`Meal` sub-schema, enum, hook and `getNutrition`** on both sides: the sub-schema's own path set
  and its `ref`/`default`, the shared `meal_type` enum rejecting `'brunch'`, the `pre('save')` stamp
  present on the built schema and on the compiled model (by hook *source*, not by count — compiling
  a model adds mongoose's own pre-save hooks), servings multiplication and rounding precision, and
  the un-populated-item zero.
- **The statics divergence, extended** — the gateway rejects all three `NutritionGoals` statics and
  all four `Meal` statics unscoped with `UNAUTHORIZED`, and fitnessgeek's `Meal.getActiveMeals(undefined)`
  bound to the same collection **returns every user's meals**, asserted against a two-owner fixture.
  That is C4 written down as a decision: if someone tightens fitnessgeek's copy, they have to delete
  that assertion to ship, which is the point.

Two harness wrinkles worth knowing for the food family:

- The `Meal` statics `.populate('food_items.food_item_id')`, so the basegeek suite imports
  `graphql/fitnessgeek/models/FoodItem.js` — not under test, just registered on the connection, with
  an assertion saying so. Without it `populate` throws `MissingSchemaError` and the "returns
  everybody's meals" test would pass for the wrong reason.
- A wrapper's own prose can trip a source-level assertion. Both the `pre('save')` check and the
  "no `requireUser` here" check strip `//` lines before matching, because the wrappers explain the
  divergence they are being checked for.

### The rollback claim, confirmed for pairs 6 and 7

Verified mechanically, not argued: each of the four switched model files was rebuilt from
`git show HEAD:<path>` under a temporary name, alongside the working-tree version, and the two were
compared on path set, per-path description (type, enum, default, required, index/unique/sparse flags,
min/max/maxlength), **sub-schema path sets and descriptions**, normalized index list, `schema.options`,
and the statics / methods / virtuals key sets. All four came back **identical**.

| | `NutritionGoals` | `Meal` |
|---|---|---|
| Collection, both sides | `nutritiongoals` | `meals` |
| Indexes, both sides | `{user_id:1}`, `{is_active:1}`, `{user_id:1, is_active:1}` | `{user_id:1}` only (path-level) |
| `unique` / `sparse` / TTL anywhere | none | none |
| Schema options | `timestamps: {createdAt: 'created_at', updatedAt: 'updated_at'}` | **none** |
| Paths added / removed / retyped / re-defaulted | none | none |
| Statics, FG / BG | 3 / 3 (guards differ) | 3 / 4 (`findOwned` is BG-only) |
| Instance methods, both sides | `checkGoalsMet`, `getProgress` | `getNutrition` |

No `unique` flag in either, so §4's `FoodItem` caveat about redeploying both processes together
still does not apply. The shared definitions are byte-equivalent to what both sides already declared,
so a half-switched deploy is indistinguishable at the database level and either app can be deployed
or rolled back alone, in either order.

**The production image resolves the new subpaths.** `docker build -f apps/fitnessgeek/Dockerfile .`
then a `--network none` run: the app boots, mounts routes, and dies at `MongoDB connection failed` —
not at an import. Importing the two models inside the image returns `nutritiongoals` / `meals`, the
index lists above, `meal_type` enum intact, the `food_items` sub-schema's three paths, both
`NutritionGoals` methods and `Meal.getNutrition` behaving correctly, and `MedicationLog`'s
`time_of_day` enum now coming from the shared module. The only mongoose warning at boot is the
pre-existing `LoginStreak` duplicate-index one. The image was removed afterwards.

### Carry-forward for the food family (pairs 8–10)

1. **§1a is 7/7 on field sets and indexes and 0/7 on everything else.** Read both model files whole.
   The remaining three are the *largest* of the thirteen and the ones §1a describes in the least
   detail, so budget for undocumented virtuals, methods, hooks, nested sub-schemas and options.
2. **Sub-schemas are now a solved problem, and the food family is full of them.** `Meal`'s
   `mealItemSchema` is the pattern: a `<x>Definition(mongoose)` plus a `create<X>Schema(mongoose)`,
   built from the caller's instance, compared separately by the rollback check because
   `describePath()` cannot see inside a `DocumentArray`. `DailySummary.totals` and its per-meal blocks
   are nested *objects* rather than sub-schemas, which `schema.paths` flattens with dots — check which
   shape each one actually is before assuming.
3. ~~**PRE-1 and PRE-2 are still the gate on pair 10.**~~ **Stale — both landed in `0cecb4a`
   (2026-09-05), before this section was written.** `totals.net_carbs_grams` and its accumulation are
   back on the gateway's `DailySummary`, and both hand-rolled `toUtcDate` normalizers are now
   `toUtcMidnight` from `@geeksuite/utils`, in place, in basegeek. So the two `DailySummary` schemas
   *are* equivalent today and pair 10's half-switched state is neutral like every other pair's. What
   still stands: do not pass `toUtcMidnight` into a factory — `packages/schemas` is CJS and
   `@geeksuite/utils` is ESM-only, so the date helpers stay in the app-side statics.
4. **`FoodItem.findOrCreate` and `search` are the one carve-out from the statics policy** (§4 pair 8).
   Pair 4's split is the shape: move the logic, export the pure part by name so a test can call it —
   which is now the third time that shape has been used (`applyLoginToStreak`, `evaluateGoalsMet` /
   `computeGoalProgress`, `sumMealNutrition`). Mind the `barcode` `unique: true, sparse: true`: if a
   `unique` flag ever changes in a shared module, both processes must be redeployed together.
5. **The statics policy is now 4/4.** Pairs 3, 5, 6 and 7 all had real static divergence and "leave
   them app-side" cost nothing every time — including pair 7, where the two sides genuinely disagree
   about what an unscoped call means. PRE-4 (tightening fitnessgeek's) is still its own ticket.
6. **Three follow-ups are open and all are cheap.** ~~`routes/mealRoutes.js`'s two `validMealTypes`
   literals~~ (closed in `3b842e7`); the caller-less `checkGoalsMet` / `getProgress` / `getNutrition` (keep or delete —
   decide, don't drift); and §3's stale "fitnessgeek's backend is CJS" comments in
   `userSettings.js:46-48` and `userSettingsSchemaParity.test.js:31`, still uncorrected.

---

## 11. Pair 8, done — `FoodItem`, and the first static that had to move

**`FoodItem` was consolidated on 2026-09-05** (§4 Tier 3 #8). Nine of the thirteen pairs are now
shared; two remain, both in the food family. This is the first pair with a `unique` index, the first
with a text index, and the first where a *static* moved into `packages/schemas` — so it is worth
reading before pairs 9 and 10 rather than skimming.

### What shipped

| | |
|---|---|
| New shared module | `packages/schemas/fitnessgeek/foodItem.js` → `createFoodItemSchema(mongoose)` |
| Wiring | one subpath in `packages/schemas/package.json` `exports`, one entry in `packages/schemas/index.js` |
| Wrappers (2) | `apps/fitnessgeek/backend/src/models/FoodItem.js` — named import, `mongoose.model(...)`<br>`apps/basegeek/packages/api/src/graphql/fitnessgeek/models/FoodItem.js` — default import + destructure, `fitnessConn.model(...)` |
| Statics — **split** | `findOrCreate`'s dedupe ladder and global-row creation **moved** as `findOrCreateFoodItem(Model, foodData)`; each side keeps a one-line delegating static. `search` (both sides) and `findAccessible` / `findAccessibleMany` (basegeek only) **stayed app-side** |
| Instance method — moved | `isGlobal` |
| Virtual — moved | `totalCalories` (declared, but not serialized — this pair passes no `toJSON`/`toObject`) |
| Also moved | all twelve indexes, including `barcode`'s `unique: true, sparse: true` and the `{name:'text', brand:'text'}` text index; the `source` enum as `FOOD_SOURCES` |
| Also exported | `foodItemDedupeFilters`, `newFoodItemAttrs` (the pure halves, so the hermetic suite can assert the ladder without a database), `foodItemDefaults`, `foodItemBounds`, `attachFoodItemVirtuals`, `attachFoodItemMethods` |
| Third copies folded in | **none** — see below |
| Parity rows added | 1 per suite, plus a behaviour describe on each side |

Test counts: fitnessgeek's backend **203 → 229**; basegeek's api **1044 → 1111** (50 suites, 1
pre-existing skip, `gatewaySchemaLoads` and `fitnessgeekFoodLogWrites` green). Of that +67, **+29 is
this work** (the parity suite went 114 → 143) and the rest arrived with the concurrent
`graphql/bookgeek/validation.js` pass, which was not touched here. `packages/schemas` lint clean;
`node tools/syntax-check.mjs` **772 files** clean. No `pnpm install`, no lockfile change.

### Where the plan was wrong

§1a's field-set and index columns were right for the eighth time out of eight. Its statics column was
not, and neither was §4's instruction for them.

1. **`search` was NOT promoted, and §4 said to promote it.** It is byte-identical on both sides, which
   is what §4 keyed on — but identical is not the same as *agreed*. `search` scopes a catalog read to
   `{ user_id: null }` OR `{ user_id: userId }`; `foodCatalogFilter` — which the gateway's
   `findAccessible` uses, twenty lines above `search` in the same file — also matches
   `{ user_id: { $exists: false } }`. A legacy row with no `user_id` key at all is therefore reachable
   through one and not the other, **inside a single process**. There are two live definitions of
   "a visible catalog row" and promoting either would freeze the disagreement into the shared contract
   rather than resolve it. A read static also has no corruption failure mode to buy for that price.
   Both copies stayed exactly where they were, and both suites assert that they are byte-identical *and*
   that they disagree with `foodCatalogFilter`. **Follow-up: reconcile the two filters, or write down
   why they differ.**
2. **`findOrCreate` moved as a helper, not as a static.** §10's carry-forward #4 called the shape and
   it was the right one: the *logic* goes into the shared module, the pure part is exported by name so a
   test can call it, and each app keeps the thin static. Concretely,
   `findOrCreateFoodItem(Model, foodData)` takes the model as a parameter — the fourth use of the
   `applyLoginToStreak` / `evaluateGoalsMet` / `sumMealNutrition` pattern, and the first where the
   pure part is a *query plan* (`foodItemDedupeFilters` returns the three rungs as data) rather than
   arithmetic. That is what let the hermetic fitnessgeek suite assert the ladder order, the
   skipped-rung cases and the `is_deleted: false` on every rung with no Mongo at all.
3. **The gateway's accessibility re-check is in the resolver, not the static.** The task framing said
   the two sides' `findOrCreate` differ by a re-check; they do not. Both statics were byte-identical.
   The divergence introduced in `79b1b57` lives in `resolvers.js`'s `resolveLogFoodItem`, which puts
   the row `findOrCreate` resolved through `findAccessible` afterwards — because the dedupe queries are
   deliberately unscoped and a crafted `(name, brand)` could otherwise hand back another user's private
   custom food. It was left there. Moving it into the static would double the query for every caller
   and change what the static returns; both suites now assert that neither static mentions
   `findAccessible`, so anyone who moves it has to say so.
4. **Neither side's `findOrCreate` had the caller the plan implied, and the two that exist are not
   symmetric.** The gateway's is live (`resolvers.js:75`). fitnessgeek's has **no caller at all** —
   grepped across the whole backend, the only reference is the declaration. `POST /api/logs/copy`
   does not use it; `foodRoutes.js:301-348` (`POST /api/foods`) open-codes its own two-rung lookup and `new FoodItem(...)`
   instead. It was kept rather than deleted, for the same reason `NutritionGoals`' caller-less methods
   were: deleting it changes the schema's statics key set and breaks the byte-equivalence the rollback
   claim rests on. **Follow-up: either point `foodRoutes.js:301` at the shared helper — it is a third,
   subtly different copy of the same ladder — or delete the dead static. Do not leave three.**
5. **`search` is dead on the gateway too.** No resolver calls it. fitnessgeek's `foodRoutes.js:492`
   is its only live caller anywhere.
6. **`nutrition` and `serving` are nested objects, not sub-schemas.** §10's carry-forward #2 said to
   check which shape each nested thing is before assuming, and this is the "flattened with dots" case:
   `schema.paths` carries `nutrition.calories_per_serving`, `serving.size` and so on directly, so
   `describePath()` sees their `min` bounds and no separate sub-schema comparison is needed. Twenty
   paths, eighteen declared. Contrast `Meal.food_items`, which really is a `DocumentArray`.

### The `unique` index, and the redeploy rule

`barcode` carries `unique: true, sparse: true` — the **first and only** `unique` flag anywhere in
`packages/schemas/fitnessgeek/`. Consolidation changed no index, so:

- **Production needs no index rebuild.** The shared definition is byte-equivalent to what both sides
  already declared, so `syncIndexes` on either process is a no-op against the index that already
  exists. The half-switched state is neutral, exactly as for pairs 1–7.
- **If a `unique` flag is ever *changed* here, both processes must be redeployed together.** Whichever
  reaches `syncIndexes` first tries to build the new index while the other keeps writing under the old
  contract, and a build the live data violates fails loudly and repeatedly. **In this suite that
  happens by construction — every push to `main` rebuilds all eight images and Watchtower rolls the
  fleet, so the two processes always move together.** That is a property of the pipeline, not of the
  code, so a commit that changes a `unique` flag should say so out loud. The module header carries the
  same warning.

The **text index** (`{ name: 'text', brand: 'text' }`) carries no `weights` on either side, so both
fields rank equally. `describeIndexes` in both suites now includes `weights` in the normalized
description, and each suite asserts explicitly that the text index has none — adding a weight to one
side alone would re-rank that writer's search and nothing else, which is exactly the kind of silent
one-sided change these suites exist to catch.

### Found by consolidating: a soft-deleted row still owns its barcode

Not introduced here, and identical on both sides, but it took writing the tests to see it: **every
rung of the dedupe ladder filters `is_deleted: false`, and the `unique` index on `barcode` does not.**
So when a soft-deleted row holds a barcode, `findOrCreate` declines to return it and then collides
with it on insert — the caller gets an `E11000`, not a row. Both shipped copies behave this way. It is
now asserted in `fitnessgeekSchemaParity.test.js` (through both models, on one collection) so that it
is a known property rather than an occasional mystery in an error log.

Fixing it means either a partial unique index (`partialFilterExpression: { is_deleted: false }`) or
clearing `barcode` on soft delete. Both are migrations with their own ticket, and both change a
`unique` index — so both fall under the redeploy rule above. **Follow-up: decide which.**

### Third copies: what was found, what was rejected

§9's rule fired again, and this time it found nothing worth rewiring.

| Copy | Location | Disposition |
|---|---|---|
| a zod validator for `fooditems` | — | **Does not exist.** `src/validation/schemas/` has `bloodPressure`, `common`, `medication`, `settings`, `weight` and nothing else. `foodItemBounds` is exported anyway, for the day one is written |
| the `source` enum, ×4 | fitnessgeek frontend — `components/MyFoods/FoodSourceUtils.jsx`, `FoodSearch/FoodSearch.jsx`, `FoodSearch/FoodCard.jsx`, `FoodSearch/CompositeResolver.jsx` | **Left — frontend is out of scope for this pass.** They are `switch` statements mapping a source to a label, colour and icon, not enum declarations, and none of them writes. `FOOD_SOURCES` is exported and ready |
| a source list with scores | `services/foodQualityService.js:5` | **Left — not an enum.** A partial ranking map (`nutritionix: 4, …`) used for result ordering. Rewiring it would mean inventing a score for every enum member |
| the enum in prose | `graphql/fitnessgeek/typeDefs.js:263` | **Left.** GraphQL types the field as `String`; the list is a doc comment. `typeDefs.js` was outside this pass's touch list |
| a fourth dedupe ladder | `routes/foodRoutes.js:301-348` (`POST /api/foods`) | **Left, and flagged.** Two rungs and they are `if`/`else if`, not sequential: barcode **or** `(source, source_id)`, never both, and no `(name, brand)` rung at all. It then open-codes its own `new FoodItem(...)` — which mints a **user-owned** row (`user_id: userId`), where `findOrCreate` always mints a global one. Different enough that folding it in is a behaviour decision, not a refactor. See follow-up 4 above |

### What the tripwires grew

- **`weights` in `describeIndexes`**, both suites — see above. Symmetric on every existing row, so no
  other pair's expectations changed.
- **A statics-split assertion.** `FoodItemRest` exposes exactly `findOrCreate, search`;
  `FoodItemGraphQL` exposes exactly `findAccessible, findAccessibleMany, findOrCreate, search`; the
  shared factory exposes **none**. Written as an equality on the sorted key sets, so adding a static to
  either side without deciding where it belongs is a failure.
- **A delegation assertion.** Both `findOrCreate` bodies contain `findOrCreateFoodItem` and contain
  neither `is_deleted` nor `source_id` — i.e. neither side restated the ladder — and the two bodies are
  identical once each wrapper's own prose is stripped. (Comment-stripping again: the wrappers explain
  the delegation in their own words. Third time that wrinkle has come up; assume it for pairs 9–10.)
- **The dedupe ladder, twice.** Hermetically in fitnessgeek — rung order, skipped rungs, the
  `is_deleted: false` on all three, the absence of any `user_id` scoping, the `||`-not-`??` coercion
  (a `serving.size` of `0` becomes `100`), `user_id: null` on every create, and the ladder walking in
  order and stopping at the first hit, driven by a fake model that records the filters it was handed.
  Against real Mongo in basegeek — all three rungs, the global row with its provenance intact, no
  duplicate on a second call, the existing row winning whole rather than merging, the two writers
  deduping against **each other** on one collection, and the soft-delete cases above.
- **`unique` proven in the database, not just in the schema.** `FoodItemGraphQL.init()` then a second
  insert on the same barcode, expecting `E11000`; then two rows with no barcode at all, proving
  `sparse` is doing its job. The rollback claim's "no index rebuild" is only worth something if the
  flag is actually enforced.
- **`totalCalories` reads through but is not on the wire**, both sides — this pair declares a virtual
  and passes no `toJSON: {virtuals: true}`, which is a combination none of the first seven had.

### The rollback claim, confirmed for pair 8

Verified mechanically: both model files were rebuilt from `git show HEAD:<path>` under temporary
names, alongside the shared factory's output, and all three were compared on path set, per-path
description (type, enum, default, required, index/unique/sparse flags, min/max/maxlength), normalized
index list **including `weights`**, `schema.options`, virtuals and instance methods. **HEAD-fitnessgeek
≡ HEAD-basegeek ≡ shared, on every one.** The statics key sets differ exactly as the split says they
should (`2` / `4` / `0`).

| | `FoodItem` |
|---|---|
| Collection, both sides | `fooditems` |
| Declared paths | 18 (20 with `_id`/`__v`) |
| Indexes, both sides | 7 path-level (`name`, `brand`, `barcode`, `source`, `source_id`, `user_id`, `is_deleted`), 4 compound (`{name,brand}`, `{source,source_id}`, `{is_deleted,user_id}`, `{barcode,is_deleted}`), 1 text (`{name:'text',brand:'text'}`) |
| `unique` / `sparse` | `barcode` — `unique: true, sparse: true`. **Unchanged**, so no index rebuild in production |
| TTL anywhere | none |
| Schema options | `timestamps: {createdAt: 'created_at', updatedAt: 'updated_at'}`; no `toJSON`/`toObject` |
| Paths added / removed / retyped / re-defaulted | none |
| Statics, FG / BG | 2 / 4 — `findOrCreate` (delegating) and `search` on both; `findAccessible`, `findAccessibleMany` basegeek-only |
| Instance methods, both sides | `isGlobal` |
| Virtuals, both sides | `totalCalories` (not serialized) |

Because no index changed, the half-switched deploy is indistinguishable at the database level and
either app can be deployed or rolled back alone, in either order — the same claim as pairs 1–7, and
the `unique` caveat in §4 is a caveat about *future* changes, not about this one.

**The production image resolves the new subpath.** `docker build -f apps/fitnessgeek/Dockerfile .`
then a `--network none` run: the app boots, mounts routes, and dies at `MongoDB connection failed` —
not at an import. Importing the model inside the image returns `fooditems`, 20 paths, all twelve
indexes with `barcode` still `unique+sparse`, the `source` enum intact, `findOrCreate` and `search`
as the only statics, `isGlobal` and `totalCalories` present, the ladder reporting
`barcode, source, name_brand` in order, and the create defaults `100 g / custom / user_id: null`.
The only mongoose warnings at boot are the pre-existing `LoginStreak` duplicate-index ones. The image
was removed afterwards.

### Carry-forward for pairs 9 and 10

1. **§1a is 8/8 on field sets and indexes and 0/8 on everything else.** Read both model files whole.
   `FoodLog` and `DailySummary` are the two largest of the thirteen.
2. **PRE-1 and PRE-2 are done** (`0cecb4a`, 2026-09-05) — `totals.net_carbs_grams` and its
   accumulation are back on the gateway, and both hand-rolled `toUtcDate` normalizers are
   `toUtcMidnight` from `@geeksuite/utils`. §10's carry-forward #3 said otherwise and has been
   corrected in place. **Pair 10 is no longer gated**, and its half-switched state is now as neutral
   as everybody else's. What still stands: `packages/schemas` is CJS and `@geeksuite/utils` is
   ESM-only, so **do not pass `toUtcMidnight` into a factory** — the date handling stays in the
   app-side statics on both sides.
3. **The statics policy now has a stated shape, not just a rule.** Four passes have used it:
   *ownership scoping stays app-side; a rule with one correct meaning for both writers moves, as a
   helper that takes the model or the document, with its pure part exported by name.* `DailySummary`'s
   `updateFromLogs` is the next candidate and it is the biggest yet — it reads `UserSettings`, sums
   `FoodLog`s and writes a nested `totals` block. Expect to split it the same way: the arithmetic
   moves and is exported; the date normalization and the ownership scoping stay.
4. **`FoodLog` and `Meal` both declare the four meal-type strings, on different collections.** Whether
   `foodlogs` imports `MEAL_TYPES` from `meal.js` or gets its own constant is pair 9's decision — the
   first genuinely cross-collection question in this exercise. `routes/mealRoutes.js` was rewired to
   the shared enum in `3b842e7`, so `models/FoodLog.js` ×2 is the last copy standing.
5. **Nested shape: check before assuming.** `FoodItem`'s `nutrition` and `serving` are flattened
   objects; `Meal`'s `food_items` is a `DocumentArray`. `DailySummary.totals` and its per-meal blocks
   are objects per §10; verify, because the comparison differs.
6. **Open follow-ups, all cheap, all named above:** reconcile `search` with `foodCatalogFilter`;
   decide whether `foodRoutes.js:303`'s two-rung ladder folds into the shared helper or the dead
   `FoodItem.findOrCreate` on the REST side goes; decide the soft-deleted-barcode collision (partial
   index or clear-on-delete); and the two still-open from §10 — the caller-less `checkGoalsMet` /
   `getProgress` / `getNutrition`, and §3's stale "fitnessgeek's backend is CJS" comments in
   `userSettings.js:46-48` and `userSettingsSchemaParity.test.js:31`.

---

## 12. Pairs 9 and 10, done — **consolidation complete (11/11)**

**`FoodLog` and `DailySummary` were consolidated on 2026-09-05**, in §4's order (Tier 3 #9 and #10).
That is the last of them. Thirteen model pairs went into this exercise: **eleven are now shared, two
were basegeek orphans and were deleted.** There is no fitnessgeek collection left with two
hand-synced Mongoose schemas, and both apps' tripwire suites fail if one comes back.

§11's first rule held to the end: **§1a's field-set and index columns were right 10/10, and nothing
else in it was right once.**

### What shipped

| | |
|---|---|
| New shared modules | `packages/schemas/fitnessgeek/foodLog.js` → `createFoodLogSchema(mongoose)`<br>`packages/schemas/fitnessgeek/dailySummary.js` → `createDailySummarySchema(mongoose)` |
| Wiring | one subpath each in `packages/schemas/package.json` `exports`, one entry each in `packages/schemas/index.js` |
| Wrappers (4) | `apps/fitnessgeek/backend/src/models/{FoodLog,DailySummary}.js` — named import, `mongoose.model(...)`<br>`apps/basegeek/packages/api/src/graphql/fitnessgeek/models/{FoodLog,DailySummary}.js` — default import + destructure, `fitnessConn.model(...)` |
| Statics — stayed app-side | all four `FoodLog` list statics (`getLogsForDate`, `getLogsForDateRange`, `getRecentLogs`, `getLogsByMealType`) ×2 copies, and `DailySummary.{getOrCreate,getSummaryRange}` ×2. basegeek's keep `requireUser`; fitnessgeek's stay unguarded |
| Static — **split** | `DailySummary.updateFromLogs` — the recompute **moved** as `updateDailySummaryFromLogs({SummaryModel, FoodLogModel, UserSettingsModel, userId, startDate, endDate})`; each side keeps a static holding its guard, its two model lookups and its date normalization |
| Virtual — moved | `FoodLog.calculatedNutrition` (and it **is** serialized — this pair passes `toJSON`/`toObject: {virtuals: true}`) |
| Also exported | `scaleLogNutrition`, `foodLogBounds` (foodLog); `summarizeFoodLogs`, `evaluateDailyGoalsMet`, `emptyDailyTotals`, `emptyMealBreakdown`, `mealBreakdownDefinition` (dailySummary) |
| Enum decision | `foodlogs` **imports** `MEAL_TYPES` from `meal.js` and re-exports it; `dailySummary.js` builds its four `meals.*` blocks from the same constant. See "The `MEAL_TYPES` decision" below |
| Third copies folded in | **none — there were none.** See below |
| Parity rows added | 2 per suite, plus two behaviour describes per suite |

Test counts: fitnessgeek's backend **229 → 267**; basegeek's api **1111 → 1149** (50 suites, 1
pre-existing skip, `gatewaySchemaLoads`, `fitnessgeekFoodLogWrites` and `dailySummaryGatewayFixes`
all green). `packages/schemas` lint clean; `node tools/syntax-check.mjs` **777 files** clean. No
`pnpm install`, no lockfile change.

### The `MEAL_TYPES` decision — share it, and here is why

§11's carry-forward #4 left this open: `FoodLog` and `Meal` declare the same four meal-type strings
on **different collections**, and §9's rule is "grep for the third copy — *then check it is the same
collection*". It is not the same collection. It is still one enum, and `foodlogs` now imports
`meal.js`'s `MEAL_TYPES` rather than freezing a fourth copy.

The bar the rule exists to enforce is not "do these strings match?" — it is "would a divergence hurt?"
Here it would, twice, and both failures are silent:

1. **`logMeal` copies the value across collections.** `resolvers.js:811` writes
   `mealType || meal.meal_type || 'snack'` — a saved **Meal**'s `meal_type` — straight into a new
   **FoodLog** row. A value legal on `meals` and not on `foodlogs` makes a saved meal unloggable, and
   the failure lands as a mongoose `ValidationError` at the end of a mutation, not at the point the
   meal was created.
2. **`DailySummary` buckets logs by it, under a guard.** `summarizeFoodLogs` does
   `if (meals[log.meal_type])`, so a value legal on `foodlogs` alone counts in `totals` and
   **vanishes** from the per-meal breakdown. A day whose macros do not add up, silently, per user.

Contrast the false positive §9 caught: `validation/schemas/settings.js`'s `startWeight` /
`targetWeight` bounds look exactly like `WeightGoals`' and were deliberately *not* rewired, because
they validate a sub-document on a different collection with no coupling between them. **The
distinguishing question is coupling, not spelling** — and that is the rule to carry forward if this
ever comes up again in another app.

Mechanically: `foodLog.js` does `const { MEAL_TYPES } = require('./meal.js')` and re-exports it, so a
consumer of either module gets the same frozen array *object* (asserted with `toBe`, not `toEqual`).
`dailySummary.js` requires it too and generates its `meals` block with
`Object.fromEntries(MEAL_TYPES.map(...))` — key order is the array's order, which is the shipped
order, and the rollback check confirms the generated definition is path-for-path and description-for-
description identical to the four hand-written blocks it replaced. `models/FoodLog.js` ×2 was the
last hand-written copy in the suite; a test asserts neither file contains the literal any more.

### Where the plan was wrong, per pair

**Pair 9 · `FoodLog`** — §4 calls it "field definitions identical; the whole divergence is the date
normalizer", and after `0cecb4a` even that was gone. True as far as it goes. Missed:

1. **A virtual, `calculatedNutrition`, and it is on the wire.** 17 lines of fallback arithmetic,
   byte-identical on both sides, and this pair passes `toJSON: {virtuals: true}` — so it is in every
   API response that carries a log. It moved, with the arithmetic exported as
   `scaleLogNutrition(stored, food, servings)`. Two shipped behaviours inside it are easy to misread
   as bugs and were preserved verbatim: the output key is `calories` (already multiplied) while the
   input is `calories_per_serving`, and the fallback is `||` not `??`, so **a stored zero falls
   through to the catalog value** — a genuinely zero-calorie entry reads the food's number instead of
   its own zero.
2. **The asymmetric timestamp rename, again.** `timestamps: { createdAt: 'created_at', updatedAt:
   'updatedAt' }` — snake in, camel out, exactly like `Medication` and unlike every other renaming
   model here. On disk, moved verbatim, spelled out in both suites' expected-path lists.
3. **Seven indexes, not three.** Four path-level (`user_id`, `log_date`, `meal_type`,
   `food_item_id`) plus the three compound ones §1a implies. None unique, none sparse, no TTL.
4. **`nutrition` is a flattened object**, like `FoodItem`'s — not a sub-schema. §11's carry-forward
   #5 said to check; checked.
5. **Every `nutrition.*` leaf has `default: 0` and no `min`.** `FoodItem.nutrition.*` and
   `DailySummary.totals.*` both floor at 0; this one does not, so a negative is accepted here.
   Pre-existing on both sides, left alone.

**Pair 10 · `DailySummary`** — §4's description of the *risk* was right and its sequencing (PRE-1
first) is what defused it. What it did not say:

1. **`updateFromLogs` is the only writer of three sub-documents, on both sides.** Nothing else in
   either app writes `totals`, `meals` or `goals_met`. That is what made C1 a data-loss bug rather
   than a stale-field bug, and it is why the recompute moved: it is the second carve-out from the
   statics policy, on §11's stated shape — *ownership scoping stays app-side; a rule with one correct
   meaning for both writers moves, as a helper that takes the model or the document, with its pure
   part exported by name.* Here it takes **three** models, and the pure parts are `summarizeFoodLogs`
   and `evaluateDailyGoalsMet`.
2. **The date could not go with it, exactly as §11 predicted.** `toUtcMidnight` is ESM-only. The
   helper takes an already-normalized `startDate` / `endDate` and each app's static normalizes. This
   is the one boundary in the whole exercise drawn by a module system rather than by semantics, and
   it is worth remembering the next time somebody proposes making `packages/schemas` ESM.
3. **`totals` and `meals` are nested objects, not sub-schemas — 32 declared paths.** Confirmed rather
   than assumed, per §11's carry-forward #5. `describePath()` sees every leaf's `min: 0` directly.
4. **The unique index is the second one in the package.** `{user_id: 1, date: 1}, {unique: true}` —
   one row per user per day, which is what makes the upsert safe under concurrency. Unchanged by
   consolidation, so no rebuild; but the `FoodItem.barcode` redeploy rule now applies to two indexes.
5. **The net-carb floor is per log, not per day.** `Math.max(0, (carbs − fiber) × servings)` inside
   the loop. That is not cosmetic: flooring the day's sum instead would let one high-fibre food
   subtract net carbs from the rest of the day, and it is what keeps the value inside the schema's
   `min: 0`.

### Found by consolidating — two live oddities, neither fixed

Both are identical on both sides, so neither is a consolidation hazard; both are now **asserted**, so
they are known properties rather than future mysteries.

1. **The recompute ignores the log's stored nutrition snapshot.** `FoodLog.nutrition` exists so a log
   keeps the numbers it was written with, and `calculatedNutrition` reads it first — but
   `summarizeFoodLogs` reads `log.food_item_id.nutrition`, the *current* catalog row, and skips any
   log whose food is un-populated or has no nutrition block. So editing a catalog food silently
   restates every past day that used it, and a day recomputed from un-populated logs is all zeros.
   Two features of the same data disagreeing about which number is true.
2. **Three of `goals_met`'s four flags can never be true.** `evaluateDailyGoalsMet` reads
   `goals.protein_grams`, `goals.carbs_grams` and `goals.fat_grams` off
   `UserSettings.nutrition_goal` — which declares **none of them**. That sub-document carries
   `daily_calorie_target` plus `protein_g_per_lb_goal` / `fat_g_per_lb_goal`, which are ratios, not
   gram targets. So `goals_met.protein`, `.carbs` and `.fat` are permanently `false` in production,
   on both sides, and have been since the field set was written. Only `calories` works. The parity
   suite writes a settings document with `protein_grams` set, watches strict mode drop it, and
   asserts the resulting `false` — plus a direct call to the helper with a goal object that *does*
   carry the macro, to show the arithmetic is fine and the gap is in the settings schema.

Also worth knowing, though it is a property of the *statics* and therefore unchanged: `goals_met`
treats every macro as a **floor** (`actual >= goal`), including carbs and fat, so a keto user under
their carb ceiling reads as not meeting the carb goal. `NutritionGoals.checkGoalsMet` disagrees with
itself about ceilings in the same way (§10). Same product question, two collections.

### Third copies: what was found, what was rejected

§9's rule fired for the last time and found nothing to rewire.

| Copy | Location | Disposition |
|---|---|---|
| a zod validator for `foodlogs` | — | **Does not exist.** `src/validation/schemas/` holds `bloodPressure`, `common`, `medication`, `settings`, `weight` and nothing else. `foodLogBounds` is exported anyway, for the day one is written |
| a zod validator for `dailysummaries` | — | **Does not exist** either. `settings.js:82`'s `track_net_carbs` is a display toggle on `usersettings`, not a bound on this collection |
| `['breakfast','lunch','dinner','snack']` | `models/FoodLog.js` on **both** sides | **Rewired** — both now take `MEAL_TYPES` from the shared `meal.js`. These were the last two hand-written copies in the suite; `routes/mealRoutes.js` went in `3b842e7`. A test asserts neither file contains the literal |
| the same four strings as **object keys** | `DailySummary.meals` on both sides, and its accumulator | **Rewired** — the schema block and the accumulator are both generated from `MEAL_TYPES`, proven path-for-path identical to the hand-written version |
| `mealTiming` / per-meal stats maps | `graphql/fitnessgeek/resolvers.js:149, :230` | **Left — not enums.** They build buckets from whatever `log.meal_type` values the data actually holds, rather than declaring the vocabulary. Resolvers were outside this pass's touch list |

### What the tripwires grew

No new harness features were needed — `serializesVirtuals` and `ownerField` covered both rows
(`FoodLog` is `true`, `DailySummary` is `false`; both are `user_id`). Four new behaviour describes:

- **`FoodLog` enum and arithmetic** (hermetic, fitnessgeek): the shared-enum object identity, that
  neither model file restates the four strings, that `foodlogs` and `meals` reject the same
  non-member, the stored-snapshot-wins rule, the `||`-not-`??` zero fall-through, and the real
  model's virtual agreeing with `scaleLogNutrition`.
- **`FoodLog` against real Mongo** (basegeek): the **populated** fallback branch the hermetic half
  cannot reach — a log with no snapshot reads the catalog row through `populate` and reads zeros
  without it — both models computing the virtual identically, it being on the wire via `toJSON`, and
  the four list statics rejecting an unscoped call on the gateway while fitnessgeek's copy returns
  `[]`.
- **`DailySummary` arithmetic** (hermetic, fitnessgeek): the eight totals, the per-log net-carb
  floor, the skipped log (no food / no nutrition), `servings || 1`, the breakdown's keys being
  `MEAL_TYPES`, an unrecognised meal type counting in `totals` and vanishing from the breakdown, the
  unset-goal branch, the floors-not-ceilings asymmetry — plus a fake-model test that pins the *shape*
  of the write (whole `totals` sub-document, one upsert, the given window) and a check that
  `toUtcMidnight` did not sneak into the CJS package.
- **`DailySummary` against real Mongo** (basegeek): the gateway's recompute persisting every macro
  read back with `.lean()`; **the same logs recomputed through fitnessgeek's own schema object
  producing a byte-identical document**, and both matching `summarizeFoodLogs` run directly; a second
  recompute not erasing the first (the read-triggers-write hot path); `goals_met` coming from
  `UserSettings.nutrition_goal` with three flags stuck false; both wrappers delegating and neither
  restating the arithmetic; and the guard asymmetry.

The comment-stripping wrinkle came up a fourth time, as §11 predicted it would: both wrappers explain
the delegation in their own prose, so the "neither side restated the arithmetic" assertions strip
`//` lines before matching.

### The rollback claim, confirmed for pairs 9 and 10

Verified mechanically, not argued: all four switched model files were rebuilt from
`git show HEAD:<path>` under temporary names, compiled into models so that mongoose's own
`options.pluralization` could not masquerade as a divergence, and compared to the working-tree models
and to the shared factory's output on path set, per-path description (type, enum, default, required,
index/unique/sparse flags, min/max/maxlength), sub-schema path sets, normalized index list including
`weights`, `schema.options`, virtuals, instance methods and statics key sets — plus, for `FoodLog`,
the virtual's actual output. **HEAD ≡ working tree ≡ shared, on every dimension, for all four files**,
and `Object.keys(schema.paths)` came back in the identical *order* too, which is the check that
mattered for `DailySummary`'s generated `meals` block.

| | `FoodLog` | `DailySummary` |
|---|---|---|
| Collection, both sides | `foodlogs` | `dailysummaries` |
| Declared paths | 15 (17 with `_id`/`__v`) | 32 (34 with `_id`/`__v`) |
| Indexes, both sides | 4 path-level (`user_id`, `log_date`, `meal_type`, `food_item_id`) + 3 compound (`{user_id,log_date}`, `{user_id,meal_type}`, `{user_id,food_item_id}`) | 2 path-level (`user_id`, `date`) + `{user_id:1, date:1}` **unique** |
| `unique` / `sparse` / TTL | none | `{user_id, date}` unique. **Unchanged**, so no index rebuild in production |
| Schema options | `timestamps: {createdAt: 'created_at', updatedAt: 'updatedAt'}`; `toJSON`/`toObject: {virtuals: true}` | `timestamps: {createdAt: 'created_at', updatedAt: 'updated_at'}`; no `toJSON`/`toObject` |
| Paths added / removed / retyped / re-defaulted | none | none |
| Statics, FG / BG | 4 / 4 (guards differ) | 3 / 3 (guards differ; `updateFromLogs` delegates on both) |
| Virtuals, both sides | `calculatedNutrition` (serialized) | none |

The shared definitions are byte-equivalent to what both sides already declared, so a half-switched
deploy is indistinguishable at the database level and either app can be deployed or rolled back
alone, in either order. `DailySummary`'s unique index is unchanged, so §4's redeploy caveat is a
caveat about *future* changes here too, not about this one.

**The production image resolves the new subpaths.** `docker build -f apps/fitnessgeek/Dockerfile .`
then a `--network none` run: the app boots, mounts routes, and dies at `MongoDB connection failed` —
not at an import. Importing the two models inside the image returns `foodlogs` / `dailysummaries`,
17 / 34 paths, the full index lists above with `{user_id, date}` still unique, the `meal_type` enum
intact, `calculatedNutrition` computing correctly, all seven statics present, and
`summarizeFoodLogs` returning the right net-carb floor with a `MEAL_TYPES`-keyed breakdown. The only
mongoose warnings at boot are the pre-existing `LoginStreak` duplicate-index ones. The image was
removed afterwards.

### What the whole exercise cost, against §6

§6 budgeted **≈ 39 h**. The actual work came in far under it, and the shape of the saving is the
useful part: pair 1 carried the fixed cost (the table-driven harness, the `exports` plumbing, the
first-time decisions) and every pair after it was a table row plus a module. Pairs 8–10 were where
the judgment was, exactly as predicted — but the judgment was about *statics*, not about fields:
§1a's field-set and index columns were right 10 times out of 10, and every single correction in
§§8–12 was about something else on the schema object (virtuals, instance methods, hooks, sub-schemas,
options, timestamp renames, doubled indexes).

### The statics policy, final score

Six pairs had real static divergence (`LoginStreak`, `WeightGoals`, `NutritionGoals`, `Meal`,
`FoodLog`, `DailySummary`) and "leave the ownership guards app-side" cost nothing every time. Two
statics moved, both as helpers taking the model, both because a divergence in them fails **silently**
rather than throwing: `FoodItem.findOrCreate`'s dedupe ladder and `DailySummary.updateFromLogs`'s
recompute. The rule that decided every case, stated as it finally reads:

> **Fields, indexes, virtuals, instance methods, hooks and sub-schemas move.** They are the contract,
> and mongoose drops what one side doesn't declare without saying so.
> **Statics stay app-side when they express *who may see what*** — the two writers legitimately
> disagree, and statics never touch `schema.paths`.
> **A static moves when it has one correct meaning for both writers and a divergence would corrupt
> rather than throw** — as a helper taking the model or the document, with its pure part exported by
> name so a hermetic test can call it.

### Open follow-ups — the whole list, collected from §§8–11 and this pass

Everything still outstanding at the end of the exercise, in one place. All of it is cheap, none of it
blocks anything, and none of it is a two-writer drift hazard any more.

| # | Follow-up | Where it came from | Notes |
|---|---|---|---|
| 1 | **Reconcile `FoodItem.search` with `foodCatalogFilter`, or write down why they differ.** `search` matches `{user_id: null}`; `foodCatalogFilter` also matches `{user_id: {$exists: false}}`, so a legacy row with no `user_id` key is reachable through one and not the other — *inside a single process* | §11 | Two live definitions of "a visible catalog row". Neither was promoted, deliberately; both suites assert the disagreement |
| 2 | **Decide `foodRoutes.js:301-348` (`POST /api/foods`) vs `FoodItem.findOrCreate`.** That route open-codes a *third*, subtly different ladder — two rungs, `if`/`else if` rather than sequential, no `(name, brand)` rung — and then mints a **user-owned** row where `findOrCreate` always mints a global one. Meanwhile fitnessgeek's `findOrCreate` static has no caller at all | §11 | Either point the route at `findOrCreateFoodItem` (a behaviour change: global vs user-owned) or delete the dead static. Do not leave three ladders |
| 3 | **Decide the soft-deleted-barcode collision.** Every rung of the dedupe ladder filters `is_deleted: false`; the `unique` index on `barcode` does not. A soft-deleted row holding a barcode makes `findOrCreate` return `E11000` instead of a row | §11 | Partial unique index (`partialFilterExpression: {is_deleted: false}`) or clear `barcode` on soft delete. Both are migrations, and both change a `unique` index — see the redeploy rule |
| 4 | **Decide whether the caller-less instance methods live or die** — `NutritionGoals.checkGoalsMet`, `NutritionGoals.getProgress`, `Meal.getNutrition`. Nothing in either app calls any of them | §10, §11 | They were promoted rather than deleted because deleting changes the schema's method key set and breaks the byte-equivalence the rollback claim rested on. That claim has now been banked, so deleting them is cheap — but decide, don't drift |
| 5 | ~~Fix the two stale "fitnessgeek's backend is CJS" comments~~ | §3, §10, §11 | ✅ **DONE 2026-09-05.** All three instances corrected: `packages/schemas/fitnessgeek/userSettings.js:46-51`, `apps/basegeek/packages/api/src/__tests__/userSettingsSchemaParity.test.js:30-32`, and the third the PRE-5 note flagged as out of scope, `apps/basegeek/packages/api/src/graphql/fitnessgeek/models/UserSettings.js:16-19`. Each now names the real reason `@geeksuite/schemas` is CommonJS — no build step, consumable from any module system — instead of claiming fitnessgeek's backend still is one |
| 6 | **`NutritionGoals.checkGoalsMet` and `getProgress` disagree about ceilings.** `checkGoalsMet` treats `sugar_grams` and `sodium_mg` as ceilings; `getProgress` treats them as floors, so a day well under the sodium limit reads as 50 % progress | §10 | Shipped on both sides, moved verbatim, asserted so nobody fixes half of it. A product question |
| 7 | **`DailySummary.goals_met` treats every macro as a floor**, carbs and fat included — so a keto user under their carb ceiling reads as not meeting the goal | §12 | Same product question as #6, one collection over |
| 8 | **Three of `goals_met`'s four flags can never be true.** `UserSettings.nutrition_goal` declares `daily_calorie_target` and no `protein_grams` / `carbs_grams` / `fat_grams` | §12 | Decide what a macro goal on the settings document *is* — a gram target, a ratio (`protein_g_per_lb_goal` already exists), or a read of the `nutritiongoals` collection. Then either add the fields or stop computing the flags |
| 9 | **`DailySummary.updateFromLogs` ignores `FoodLog.nutrition`** and reads the current catalog row instead, so editing a food restates every past day that used it | §12 | Two features of the same data disagreeing about which number is true. Pick one: the snapshot (history is immutable) or the catalog (corrections propagate) |
| 10 | **`PRE-4` — tighten fitnessgeek's `Meal` list statics.** `getActiveMeals(undefined)` returns every user's meals; basegeek's throw `UNAUTHORIZED`. Every live caller passes a userId, so it is latent | §4 PRE-4, §9, §10 | A two-line change that turns a silent over-fetch into a thrown error. It belongs in a commit whose title says so, with the parity assertion updated in the same commit — it is written as a decision precisely so somebody has to |
| 11 | **`LoginStreak`'s doubled `user_id` index and its four timestamp paths.** Path-level `index: true` plus `schema.index({user_id: 1})` — the source of the "Duplicate schema index" warning at every boot — and `created_at`/`updated_at` declared by hand alongside `timestamps: true` | §9 | Both pre-existing on both sides and moved verbatim, because changing either would stop the shared definition being byte-equivalent to what is deployed. Now that consolidation is done, cleaning them up is a normal (small) migration |
| 12 | **`Weight` and `BloodPressure` use `userId` while the other nine use `user_id`** | §4 Tier 1 note, §8 | Normalizing is a data migration wearing a refactor's clothes. Recorded, not fixed |
| 13 | **`FoodLog.nutrition.*` has no `min`** where `FoodItem.nutrition.*` and `DailySummary.totals.*` both floor at 0, so a negative macro is accepted on a log | §12 | A validation decision, not a refactor. Cheap if wanted |
| 14 | **`Meal` stamps `updated_at` only on `save()`.** It passes no schema options, so nothing stamps it on a `findOneAndUpdate` / `updateOne`, on either side | §10 | Shipped behaviour, left alone |

---

*Written 2026-09-05. Companion to `apps/fitnessgeek/DOCS/USER_SETTINGS_SCHEMA.md` (the shared-schema
index) and `DOCS/SUITE_TODO.md` item 4. **The consolidation is finished — 11/11 pairs shared, 2
orphans deleted, 2026-09-05.** What remains of this document is a record: §§1–7 are the audit and the
plan as written, §§8–12 are what actually happened, pair by pair, and §12's table is the only list of
open work.*
