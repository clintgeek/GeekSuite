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
| Already consolidated | **6** (`UserSettings`, `Weight`, `BloodPressure`, `Medication`, `LoginStreak`, `WeightGoals` — all 2026-09-05) |
| basegeek orphans deleted | **2** (`AIFoodPromptCache`, `MedicationLog` — done 2026-09-05) |
| Remaining | **5** (`NutritionGoals`, `Meal`, `FoodItem`, `FoodLog`, `DailySummary`) |
| …genuinely needing a shared schema | **5** |
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
| 8 | `NutritionGoals` | `nutritiongoals` | identical | identical | BG adds `requireUser` ×3 | drift (guard) |
| 9 | `Meal` | `meals` | identical | identical | BG adds `findOwned`; BG's 3 list statics are owner-scoped, FG's are not | **conflicting** |
| 10 | `FoodItem` | `fooditems` | identical | identical | BG adds `findAccessible`/`findAccessibleMany`; `findOrCreate` + `search` identical | drift (2 statics) |
| 11 | `FoodLog` | `foodlogs` | identical | identical | different date normalizer | **conflicting** |
| 12 | `DailySummary` | `dailysummaries` | **BG is missing `totals.net_carbs_grams`** | identical | different date normalizer; BG's `updateFromLogs` omits the net-carb accumulation | **conflicting ×2** |

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
| 6 | `NutritionGoals` | S | ✅ | Same shape. Note the naming trap: this is **not** `UserSettings.nutrition_goal`. Two different collections both describe nutrition goals, and `DailySummary.updateFromLogs` reads the *settings* one (`DailySummary.js:186-188`), not this one. Do not "helpfully" unify them |
| 7 | `Meal` | S | ⚠️ see below | Statics conflict (C4). Consolidate the field definitions only; leave both sides' statics exactly as they are. If the tightened semantics are wanted in fitnessgeek, that is a separate, deliberate ticket with its own test |

### Tier 3 — the food family · **the gateway took these over on 2026-09-05; let them settle**

| # | Pair | Effort | Rollback safe? | Notes |
|---|------|--------|----------------|-------|
| 8 | `FoodItem` | M | ⚠️ see below | The `findOrCreate` dedupe ladder (`FG :116-171` / `BG :137-192`) is identical today and **must stay identical** — it is the only thing stopping the two writers from minting duplicate rows for the same USDA/OpenFoodFacts item. Promote it into the shared module *with the fields*, as an exception to the statics policy: unlike `requireUser`, it has one correct meaning for both writers and a divergence would corrupt the catalog. `findAccessible`/`findAccessibleMany` stay app-side (basegeek-only ownership scoping). `search` is identical too — promote it as well |
| 9 | `FoodLog` | M | ✅ *after* PRE-2 | Field definitions identical; the whole divergence is the date normalizer. Once PRE-2 has landed, this drops to an S |
| 10 | `DailySummary` | M | ❌ *before* PRE-1 | The riskiest pair, and it must be **last**. The shared definition must be fitnessgeek's superset. Until PRE-1 lands, a half-switched state is not neutral — see below |

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

**FALSE for pair 10 (`DailySummary`), and this is the one to call out.** The two schemas are *not*
equivalent today, so a one-sided switch is a behavior change either way:

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

*Written 2026-09-05. Companion to `apps/fitnessgeek/DOCS/USER_SETTINGS_SCHEMA.md` (the shared-schema
index) and `DOCS/SUITE_TODO.md` item 4.*
