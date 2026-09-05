# fitnessgeek `UserSettings` — schema source of truth

*Written 2026-09-05 for `DOCS/TODO_ORDER.md` #21. Supersedes the "Duplicated
`UserSettings` schema" entry in `DOCS/CONTEXT.md`.*

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
| `garmin.password` | String | — | ✅ | ✅ |
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
