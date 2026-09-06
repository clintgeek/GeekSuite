# FitnessGeek — Project Context

How this app is actually built, run and deployed. Paths, ports and commands
here override any reasonable-looking default.

**2026-09-05 (BURN_REVIEW #16 fix):** the household log view (`HouseholdLogView.jsx`) was dead
twice over in `frontend/src/services/apiService.js`'s `routeRequest`. Both `/logs/household` (member
list) and `/logs/household/:memberId/:date` (a member's logs) were shadowed by the earlier generic
`base.startsWith('/logs/')` branch and routed to `GetFoodLogs` instead — sending "household"/a
memberId as a `Date` scalar variable, which threw. Fixed by moving both household branches above the
generic one, and by retyping `GetHouseholdMemberLogs`'s `$date` from `Date!` to `String!` to match the
gateway's typeDefs. See `DOCS/BURN_REVIEW.md` #16 and
`frontend/src/services/__tests__/apiServiceHouseholdLogs.test.js`.

**2026-09-05 (Q67 fix):** `SaveMealDialog.jsx`'s fallback for a food-log row with no
catalog id used to send `food_item_payload` inside `MealItemInput`, a field the gateway never
declared (`food_item_id: ID!` / `servings: Float!` only) — reaching that branch would have failed
the whole save. Since `addFoodLog` always resolves a real `food_item_id` today, the dialog now
skips any such row and shows "N item(s) could not be saved to the meal — no catalog entry" instead
of sending the field. See `frontend/src/components/__tests__/SaveMealDialog.test.jsx`.

---

## Going-over 2026-09-05 — the full-tree read

*A senior-inheriting-it read of every route, resolver, service, component, test
and config in `apps/fitnessgeek/**`, after the burn. What follows is what was
wrong and what is now true.*

### Fixed — frontend

- **The Medications page was empty, and had been since `cf3254c`.**
  `medsService` unwraps the transport envelope (`unwrap()` — `list()`,
  `search()` and `getDetails()` resolve to the payload, not `{data: payload}`),
  but `pages/Medications.jsx` still read `.data` off every one of those results.
  So `setMyMeds(r.data || [])` was always `[]`, search never showed a
  candidate, strengths and suggested indications never loaded, and
  `saveMedication`'s `r.data.id` was a TypeError. The page now reads the
  unwrapped values. Pinned by `src/pages/__tests__/Medications.test.jsx`.
- **`addFitnessMedication` / `updateFitnessMedication` selected only `{ id }`,**
  so an add or edit spliced a bare `{id}` stub into the list and the row
  rendered blank until a reload. Both now select the same field list
  `GET_MEDICATIONS` does (`MEDICATION_FIELDS` in `apiService.js` — one list, not
  three copies).
- **Every barcode scan returned an arbitrary food.**
  `fitnessGeekService.getFoodByBarcode` went through the GraphQL router;
  `fitnessFoods(search: String)` has no barcode argument, so the barcode was
  dropped, the query answered with the unfiltered catalog, and BarcodeScanner
  took `[0]`. It goes to `GET /api/foods?barcode=` now — REST, which is where
  barcode belongs per "Frontend — where the writes go" below.
- **The Garmin heart-rate chart on `/blood-pressure` was permanently empty.**
  `pages/BloodPressure.jsx` fetched it with `fitnessGeekService.get(...)`, i.e.
  the GraphQL router, which has no mapping for
  `/fitness/garmin/heart-rate/:date` — every call threw "Rest proxy gap" into a
  `logger.warn`. It calls `getGarminHeartRate()` (REST) now.
- **"Export CSV" on `/reports` always failed.** `reportsService.export` went
  through the GraphQL router too; `/food-reports/export` has no mapping and
  returns `text/csv` anyway. It goes to `restClient` with
  `responseType: 'blob'`.
- **`PUT /settings/dashboard` and `/settings/ai` could never succeed.** Those
  routes take the SUB-DOCUMENT as their body, and the router handed it to the
  gateway as the whole `FitnessUserSettingsInput` — a GraphQL input-coercion
  error (`Field "show_current_weight" is not defined by type …`). The router
  nests them under `dashboard` / `ai` now. Latent today: nothing imports
  `hooks/useSettings.js`, so `SettingsContext`'s dashboard writer has no caller.
- **Blood-pressure dates rendered a day early west of UTC, with a fake time.**
  `log_date` is a calendar date at UTC midnight; `BPLogList` rendered it with a
  plain `toLocaleDateString` and printed `toLocaleTimeString` beside it — always
  7:00 PM, UTC midnight in Central. Now `displayCalendarDate`, and the time is
  gone (a "Today" marker replaces it, computed
  `utcDateString(log_date) === localDateString()`). `BPReport` had the same
  class one level up: it derived the ISO week from `getDay()`/`setDate()` —
  local accessors on a UTC-midnight value — so a Sunday reading was bucketed
  into the week before. UTC end to end now, and the reporting period prints as
  `YYYY-MM-DD` instead of a raw ISO instant. (BURN_REVIEW P2 (c).)
- **Medication "days left" ticked down at 19:00 Central.**
  `computeRemainingAndRunout` differenced a UTC-midnight `supply_start_date`
  against a raw local `new Date()`. Both sides are normalised to UTC midnight
  now, so it counts whole calendar days. (BURN_REVIEW P2 (f).)
- **"Test Connection" always said Connection Failed.** `InfluxDBSettings` read
  `response.connected`; `GET /api/influx/status` answers
  `{ userEnabled, serverConnected, error }` and never sent `connected`,
  `database` or `measurementCount`. It reads `serverConnected` now and the
  success branch no longer prints `undefined`.
- **One AI hiccup blanked the whole Reports page.** `Promise.all` over two
  report reads and two AI reads meant a provider failure rejected the batch.
  `Promise.allSettled`; the page errors only if BOTH report halves fail.

### Fixed — backend

- **`GET /api/logs/household` was shadowed by `GET /api/logs/:id`** — one path
  segment, so express matched `/:id` first and issued
  `FoodLog.findOne({_id: 'household'})`, a CastError answered as a 500. Both
  household routes now sit above `/:id`. Same shadowing class as BURN_REVIEW
  #16, one layer down.
- **`POST /api/meds/:id/logs` never checked the medication was the caller's.**
  It stamped the caller's `user_id` on the row but took `medication_id`
  straight from the URL, and `GET /logs/by-date` populates that reference — so a
  log written against a stranger's medication id handed back that stranger's
  whole medication document. The route 404s on a medication that is not yours,
  and the body now has a zod schema (a bad `date` or `time_of_day` is a 400, not
  a 500 from mongoose).
- **The app-level error handler threw inside itself.** `req.log` is attached by
  `createHttpLogger`, which is mounted AFTER `express.json()` and `cors()` — so
  a malformed JSON body (a 400 any client can produce) reached the handler with
  `req.log` undefined, and `req.log.error(...)` threw. Express then answered
  with its own HTML 500: no log line, and the `{success, error, timestamp}`
  envelope replaced by markup. It falls back to the process logger now.
  `src/utils/reqLogger.js` does the same for the eight route handlers that call
  `req.log` inside their own `catch` — a catch that throws sends no response at
  all, so the request hangs rather than answering the 500 it meant to.
- **`UserSettings.updateSettings` replaced sub-documents.** It was the one
  writer of `usersettings` still `$set`-ing whole nested objects (see "Settings
  writes are PARTIAL" below — the other two were fixed in BURN_REVIEW #5/#6).
  `updateSettings(id, {ai: {enabled: false}})` deleted `ai.features`; a partial
  `nutrition_goal` deleted bmr, tdee, weekly_schedule and keto. The dot-path
  rule now lives in `src/utils/flattenSettingsUpdate.js` and both this static
  and `PUT /api/settings` consume it. Callers: `PUT /settings/ai`,
  `PUT /settings/dashboard`, `POST /goals`.
- **`POST /api/goals` discarded every weight goal it was given.**
  `UserSettings.weight_goal` declares `startWeight` / `targetWeight` /
  `startDate` / `goalDate` — camelCase, and the two dates are `YYYY-MM-DD`
  STRINGS. The route wrote `start_weight` / `target_weight` / `start_date` /
  `goal_date` as Dates: not schema paths, so mongoose strict mode dropped all
  four, and `GET /api/goals` read them back as `undefined`. It also spread the
  existing mongoose sub-document (`{...subdoc}` copies `$__`/`_doc`, not the
  fields). Both fixed. Reachable only by direct API call today — the frontend
  routes `/goals` to the gateway.
- **`PUT /api/user/profile` answered 400 to every save.** It destructured
  `{username, email, age, height, gender}` off `req.body`, but its only caller
  (`services/userService.js`) sends `{profile: {firstName, lastName, age,
  height, gender}}` — basegeek's own shape. Every field read `undefined` and the
  route replied `NO_VALID_FIELDS`, so the Profile page's Save and
  AIGoalPlanner's profile step never worked. Both shapes are accepted now, and
  `firstName`/`lastName` are relayed instead of dropped.
- **`GET /api/meds/search` answered a different SHAPE when RxNav failed** — the
  detail route's `{ingredient, strengths, …}` object where the success path
  returns an array, so a caller that mapped over it got a TypeError. It answers
  `[]` and logs the upstream error.
- **`POST /api/logs/copy` 500'd on one orphaned log.** A source log whose
  catalog row was hard-deleted populates to `null`; reading `._id` off it threw
  mid-loop and left the rows already created behind. Orphans are skipped, and a
  source day of nothing but orphans is the same 404 an empty day gets.
- **`POST /settings/household/create|join` took their bodies raw** — a
  non-string `household_id` threw at `.toUpperCase()` and came back as a 500.
  Both are zod-validated now. `household_id` is deliberately just "a non-empty
  bounded string", not the 12-hex shape `/create` mints: tightening that would
  lock out any older code, which is a product decision, not a bug fix.
- **The dev `/graphql` proxy stripped `X-CSRF-Token`** (BURN_REVIEW P2 (n)) and
  this backend's CORS `allowedHeaders` did not list it, so a cross-origin
  preflight for any REST mutation `@geeksuite/auth` decorates would fail. Both
  fixed; the proxy forwards the header as received and never synthesizes one,
  same rule as the auth proxies.
- `PATCH /api/user/settings` no longer 500s on `healthBaselines: null`.
- **`routes/authRoutes.js`'s basegeek proxies had no axios timeout** — axios
  defaults to `0`, so a *hung* basegeek parked the handler and the browser
  until the socket died. Now bounded by `BASEGEEK_TIMEOUT_MS` (default 8000),
  the same knob `packages/user`'s `validateToken` uses; a timeout carries no
  `.response` and lands in each handler's existing 502 branch, never a 401.

### Left in place, with reasons

- **`goals_met.protein` / `.carbs` / `.fat` can never be true.**
  `evaluateDailyGoalsMet` reads `goals.protein_grams` / `carbs_grams` /
  `fat_grams` off `UserSettings.nutrition_goal`, which declares none of them.
  `POST /api/goals` used to *write* those three keys, which mongoose dropped in
  silence; that write is now gone rather than "fixed", because deciding what a
  macro goal on this document IS — a gram target, a ratio
  (`protein_g_per_lb_goal` already exists), or a read of the `nutritiongoals`
  collection — is a schema-shape decision. `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md`
  §12 follow-up #8.
- **`DailySummary.updateFromLogs` ignores `FoodLog.nutrition`** and recomputes
  from the CURRENT catalog row, so editing a food restates every past day that
  used it, and a day recomputed from un-populated logs is all zeros. Two
  features of the same data disagreeing about which number is true; picking one
  is §12 follow-up #9, not a bug fix.
- **`FoodLog.nutrition.*` has no `min`** where `FoodItem.nutrition.*` and
  `DailySummary.totals.*` both floor at 0 — a schema-shape change on a shared
  module both apps consume. §12 follow-up #13.
- **`BarcodeScanner` loads ZXing from unpkg at scan time** (`<script
  src="https://unpkg.com/@zxing/library@0.19.1/…">`). A runtime CDN dependency
  on the food-logging path, and the one third-party origin the service worker's
  `cacheWillUpdate` guard exists to cover. Vendoring it is a dependency
  decision (TODO_ORDER Q52) — reported, not taken.
- **`routes/aiCoachRoutes.js` is caller-less and would 500 on real data.**
  Nothing in the frontend calls `/api/ai-coach/*`; all four handlers read
  `log.food_item_id.nutrition.*` with no guard, so one log whose food was
  deleted throws, and `/meal-suggestions` picks its day off the server clock
  (`new Date()` + `setUTCHours(0,…)`, i.e. UTC's today). Left whole rather than
  half-fixed: whether this router lives at all is a Q22-class call.
- **`GET /api/summary/today` and `goalRoutes`' `todayIndex` still guess the day
  from the server clock.** Both are REST-only and caller-less (the frontend
  sends `localDateString()` through the gateway), and both were already recorded
  as open under "Per-day reads take the browser's date" below. `summaryRoutes`'
  comment claiming `format(new Date(), …)` is "local today, not the UTC
  instant" is wrong — every container runs UTC (BURN_REVIEW #13).
- **Caller-less router entries that would misbehave if revived**, all reported
  rather than changed: `apiService`'s `GET /goals` answers `derivedMacros`
  while `goalsService.getGoals()` expects `{nutrition, weight}`;
  `POST /goals` maps to `setNutritionGoals` whose input is the
  `nutritiongoals` shape, not `saveGoals`'s; `GET /meals/:id` sends an ObjectId
  as `mealType`; `getMeals(mealType, search)` drops both params (matcherService
  survives on its own local scoring); `bpService.getBPStats` answers the whole
  log list.
- **InfluxDB reads are not user-scoped** — `influxService.getComprehensiveDaily(date)`
  takes no user id, and `checkInfluxEnabled` gates on the caller's own flag.
  Correct for a single-instance integration, flagged so the choice is explicit
  (same shape as bookgeek's owner-less `Book`).

### Docs corrected here

- The Commands section said "12 suites / 104 tests"; the backend suite is
  **18 suites / 321 tests** as of this pass (278 before it).
- The frontend suite is **61** (37 before it); `pnpm lint` is **54** warnings,
  unchanged.

---

## Runtime

| | |
|---|---|
| **Node** | 20 (`node:20-alpine`, both stages of `apps/fitnessgeek/Dockerfile`) |
| **Backend module system** | **native ESM** — `"type": "module"` in `backend/package.json`. `import`/`export` throughout `backend/src/**`; there is no `__dirname` (see `src/app.js`, which derives one from `import.meta.url` for the built-frontend `public/` path). |
| **Frontend** | React + Vite + MUI, built to `frontend/dist` and copied into the backend image as `backend/public` |
| **Database** | MongoDB (shared basegeek instance), Mongoose 8 |
| **Cache** | Redis (optional — the app boots and serves without it) |
| **Time series** | InfluxDB (own instance) for the health dashboard |
| **Auth** | SSO via basegeek; `@geeksuite/user`'s `attachUser()` validates every token remotely. No local JWT verification. |
| **Container port** | 3001 (published on the host as 4080) |

The backend was CommonJS on `node:18-alpine` until 2026-09-05. It was moved to
node 20 + ESM so it could consume `@geeksuite/utils`, which is ESM-only and
therefore not `require()`-able.

---

## Shared workspace packages

The backend depends on five `workspace:*` packages:

| Package | Used for |
|---|---|
| `@geeksuite/crypto-vault` | AES-256-GCM for the Garmin password at rest (`KEY_VAULT_SECRET`) |
| `@geeksuite/logger` | pino logger + `createHttpLogger` |
| `@geeksuite/schemas` | the shared field sets for **every** fitnessgeek collection with two writers — `UserSettings`, `Weight`, `BloodPressure`, `Medication`, `LoginStreak`, `WeightGoals`, `NutritionGoals`, `Meal`, `FoodItem`, `FoodLog` and `DailySummary`, all eleven as of 2026-09-05. No model file on either side declares a schema literal any more. It also owns `Medication`'s enums and bounds (imported by `src/validation/schemas/medication.js`, by `models/MedicationLog.js` and by `routes/medicationRoutes.js` instead of restating), `BloodPressure`'s bounds, `MEAL_TYPES` — shared by `meals` **and** `foodlogs` and imported by `routes/mealRoutes.js` — and `Meal`'s embedded food-item sub-schema, `FoodItem`'s `FOOD_SOURCES` enum, the instance-method arithmetic for `LoginStreak`, `NutritionGoals`, `Meal` and `FoodItem`, and the two statics that moved because a divergence in them fails silently: `findOrCreateFoodItem` (the dedupe ladder — a divergence forks the food catalog) and `updateDailySummaryFromLogs` (the day's recompute — a divergence erases a macro from a stored day, which is what happened to `totals.net_carbs_grams`). Both apps' `updateFromLogs` statics keep only their guard, their model lookups and the date normalization: `toUtcMidnight` is ESM-only and cannot be `require`d from the CJS package, so the helper takes an already-normalized window. Two `unique` indexes live here (`FoodItem.barcode`, `DailySummary.{user_id,date}`): changing a `unique` flag in a shared module means both processes redeploy together. Index and conventions in `USER_SETTINGS_SCHEMA.md`; the full record in `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md` (§12 carries the open follow-ups) |
| `@geeksuite/user` | `attachUser()`, `csrfGuard()`, `meHandler()` |
| `@geeksuite/utils` | **date handling** — `toUtcMidnight` and friends |

`@geeksuite/utils` replaced five private copies of the same UTC-midnight
normalizer that used to live in `weightController.js`,
`bloodPressureController.js`, `models/FoodLog.js`, `models/DailySummary.js`
and `routes/logRoutes.js`. There is now exactly one implementation, with the
timezone test suite in `packages/utils`. **Do not add a sixth** — import it.

---

## How production gets the workspace packages

This is the part that is easy to get wrong.

`.github/workflows/release.yml` builds one image per app from a matrix of
`apps/*/Dockerfile`, **with the repo root as the build context**:

```
context: .
file: apps/fitnessgeek/Dockerfile
```

So the production image comes from `apps/fitnessgeek/Dockerfile`, which copies
`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, the whole
of `packages/`, and `apps/fitnessgeek/**` into the image, then runs
`pnpm install --frozen-lockfile` (build stage) and
`pnpm install --frozen-lockfile --prod` (prod stage). That is what turns the
`workspace:*` ranges into real symlinks under
`/app/apps/fitnessgeek/backend/node_modules/@geeksuite/`.

`apps/fitnessgeek/backend/Dockerfile` exists but is **not** the production
build — it installs from `package-lock.json` with the backend directory alone
as its context, so the `workspace:*` deps do not resolve there. It is kept on
the same node version as the real one; treat it as a standalone smoke test.

Adding a new `workspace:*` dependency therefore needs a root `pnpm install`
(so `pnpm-lock.yaml` is in step) or the frozen-lockfile install in the image
build will fail.

---

## Environment — `KEY_VAULT_SECRET`

**The server refuses to boot without it.** `src/config/keyVault.js` checks it in
`start()` and exits 1 with a message naming the variable.

| | |
|---|---|
| **Name** | `KEY_VAULT_SECRET` |
| **Format** | exactly 64 hexadecimal characters (32 bytes). `openssl rand -hex 32` |
| **Used for** | AES-256-GCM encryption of `garmin.password` at rest, via `@geeksuite/crypto-vault` |
| **Declared in** | `backend/env.example` (name and format only — never a value) |

Fail-at-boot rather than degrade-with-a-warning is deliberate: Garmin is a core
feature here (the dashboard summary card, the activity page, sleep, the weight
sync), and without the key every settings save carrying a password is refused
and every stored password reads back as null. That is a broken app pretending to
work. basegeek already fails fast on the same variable, so the behaviour is
consistent across the suite.

### It must be the SAME value basegeek uses

This is the part that will bite. `apps/fitnessgeek/backend` is **not** the only
process that reads and writes this field:

| | Writer | Reader |
|---|---|---|
| fitnessgeek | `routes/settingsRoutes.js` (`PUT /api/settings`) | `services/garminConnectService.js` |
| basegeek | `graphql/fitnessgeek/resolvers.js` (`updateFitnessUserSettings`) | `graphql/fitnessgeek/resolvers.js` (`buildGarminClient`, `garminStatus`) |

The frontend's `apiService.js` rewrites most settings traffic to GraphQL, so
basegeek's copy handles the majority of real reads and writes. Both build their
model from `@geeksuite/schemas/fitnessgeek/userSettings`, which is where the
encryption lives — so both must decode with the same key or Garmin login breaks
in whichever process has the wrong one.

The repo's root `DEPLOY.md` still carries a "`KEY_VAULT_SECRET` | basegeek only
| Never share across apps" row. **That row is out of date as of 2026-09-05** —
fitnessgeek and basegeek now share it. Copy basegeek's existing value into
fitnessgeek's `.env.production`; do not generate a new one.

---

## Settings writes are PARTIAL — one `$set`, dot paths, no `household`

*Landed 2026-09-05 (burn review #5, #6, #9). Both writers of the `usersettings`
collection now follow the same three rules; they disagreed before, and each
disagreement lost data.*

**1. Dot paths, never a whole sub-object.** Every client of both writers sends
only the keys the user just touched — the Settings page sends
`garmin: {enabled, username}` with `password` only when it is retyped;
AIGoalPlanner's "Remove Goal" sends `{nutrition_goal: {enabled: false}}`.
`$set` with a nested object **replaces the whole sub-document**, so those two
saves used to delete the encrypted credential, both OAuth tokens and
`last_connected_at`, and start/target weight, bmr, tdee, weekly_schedule and the
keto block, respectively.

- basegeek: `flattenSettingsUpdate()` in
  `graphql/fitnessgeek/resolvers.js` (exported for its tests), applied before
  `UserSettings.updateSettings`.
- fitnessgeek: `flattenForSet()` in `routes/settingsRoutes.js`.

Same rules in both: recurse into plain objects, stop at arrays (`card_order`,
`weekly_schedule`), Dates, scalars and the two Mixed OAuth token blobs
(`garmin.oauth1_token` / `oauth2_token` — a per-key merge there would splice two
tokens together); drop `undefined` and empty objects. **These two helpers are
twins and must stay in step.** Their proper home is
`@geeksuite/schemas/fitnessgeek/userSettings` beside the encryption — see
`USER_SETTINGS_SCHEMA.md`; they live app-side today only because the shared
package deliberately carries no statics.

Encryption is unaffected: the schema hook rewrites `garmin.password` in the
dot-path shape as well as the nested one (`encryptGarminPasswordIn`), which both
suites now pin.

**2. Exactly one `$set` per update.** `PUT /api/settings` used to compose an
object literal with *two* `$set` keys — Garmin's dot paths, then a second for
the ordinary fields — and the second silently won. Any body carrying both (i.e.
every save the Settings page makes) dropped the Garmin write, encrypted password
and all. One `$set`, or `$setOnInsert: {user_id}` when nothing writable
survives the allow-list — an empty `$set` is a MongoDB error.

**3. `household` is not writable through the general settings write.** Neither
`PUT /api/settings` nor `updateFitnessUserSettings` accepts it. Accepting
`household.household_id` let a client PUT any 12-hex code and graft itself onto
that household, bypassing `/household/join`'s "leave first" check and gaining
member enumeration plus shared food-log reads. `household_id` is refused by the
zod schema (a 400 naming it); the share flags and display name still validate,
and are then dropped by the route's allow-list, exactly as the gateway drops
them. Membership goes through `POST /api/settings/household/create|join`,
`/leave`; the flags go through `PUT /api/settings/household`.

---

## Per-day reads take the browser's date, not the server's

*Landed 2026-09-05 (burn review #14).* Every container runs in UTC — no image
installs `tzdata`, so `TZ=America/Chicago` is inert (burn review #13) — so a
server-side `format(new Date(), 'yyyy-MM-dd')` is *tomorrow* for a Central-time
user any evening after 19:00, which is how the dashboard's insights card served
an empty ring.

- `dailySummary` and `refreshDailySummary` in the gateway go through
  `requireCalendarDate()`: no date, or one that is not `YYYY-MM-DD`, is an
  error. They never guess.
- `frontend/src/services/apiService.js` sends `localDateString()` for
  `/summary/today`, a bare `/summary`, a literal `/summary/today/refresh` and
  `/insights/daily-summary` with no `?date=`. Writes already sent one
  (`fitnessGeekService.toApiDate`).

Still on the server clock, and still open: `backend/src/routes/goalRoutes.js`
(the daily calorie target, `:165,174`) and the weekly plan's `todayIndex` in
`graphql/fitnessgeek/resolvers.js`.

---

## Custom food edits are partial too — and the type is flat

*Landed 2026-09-05 (burn review #15, #19).* GraphQL's `FitnessFood` is declared
flat (`serving_size` / `serving_unit`); the shared `FoodItem` schema stores
`serving: {size, unit}`. With no field resolvers both answered `null` for every
row, and MyFoods' edit dialog — which pre-fills from the row it just read —
rewrote each custom food's serving to its 100 g fallback on save. The gateway
now resolves both fields from `serving.{size,unit}`, and `updateFitnessFood`
writes `nutrition.<key>` / `serving.size` / `serving.unit` as dot paths for the
keys the client actually sent (a calories-only edit no longer zeroes the other
six macros; a unit-only edit no longer deletes `serving.size`, a
`required, min: 0.1` path with update validators off).

**Frontend half landed 2026-09-05.** `pages/MyFoods.jsx` now reads
`food.serving_size`/`food.serving_unit` and `editingFood.id ?? editingFood._id`
(same fix on delete and the list key), and its save only sends the nutrition
macros that actually changed — `apiService.js` gained a genuine partial-patch
normalizer (`normalizeFoodUpdateInput`) for `PUT /foods/:id` so an omitted
macro is left alone instead of zero-filled like `addFitnessFood`'s creator
path does. The same `id`/`serving.size` misreads were also live in
`matcherService.js`, `Medications.jsx`, `SaveMealDialog.jsx`, and
`components/FoodSearch/FoodSearch.jsx` (all gateway-result readers) and were
fixed alongside it; `UnifiedFoodSearch.jsx` and `foodService.js`'s own reads
are REST results and were already correct as-is.

---

## How the Garmin password is encrypted

Garmin Connect credentials cannot be hashed — the backends log in to Garmin as
the user, so the password has to be recoverable. It is encrypted instead.

**Choke point:** `packages/schemas/fitnessgeek/userSettings.js`, inside
`createUserSettingsSchema()`. Not in a route, not in a service — both apps build
their model from that function, so it is the only place all four read/write
sites pass through.

- **Write** — `pre('save')` and `pre(['findOneAndUpdate','updateOne','updateMany','replaceOne'])`
  encrypt `garmin.password`, in both the dot-path (`{'garmin.password': x}`) and
  nested (`{garmin: {password: x}}`) update shapes. Both are used in production.
  Idempotent: `isEncrypted()` short-circuits an already-packed value.
- **Read** — a getter on the path decrypts on property access. Mongoose does not
  run getters in `toObject()` / `toJSON()`, so serialising a settings document
  still yields ciphertext; only explicit access (the Garmin login path) sees
  plaintext. `garminConnectService.buildClient()` calls `readGarminPassword()`
  explicitly anyway, so the decrypt is visible where it matters and survives a
  future `.lean()` read.
- **Legacy plaintext** — a value that is not `isEncrypted()` passes through both
  ways untouched, so rows written before the backfill keep working.
- **Corruption / wrong key** — `safeDecrypt()` logs and returns null, so the
  Garmin login fails on credentials rather than throwing mid-request.
- **The API never returns it.** `GET`/`PUT /api/settings` delete `garmin.password`
  from the response and send `garmin.password_set` (boolean) instead. It used to
  send `'********'`, which became actively dangerous once encryption landed: a
  client that round-tripped the GET body into a PUT would have had eight literal
  asterisks encrypted and stored as the real password. basegeek's GraphQL
  `GarminSettings` type never exposed the field at all, and the Settings page
  rebuilds `garmin` from `enabled` + `username` only, so nothing reads it.

### Backfill — production run order

`backend/scripts/encryptGarminPasswords.js` encrypts rows written before the
above landed. Idempotent, prints counts only, never a value.

```bash
# 1. Set KEY_VAULT_SECRET in apps/fitnessgeek/.env.production
#    — the SAME value basegeek already uses. Do not generate a new one.

# 2. Deploy. Both images must come from the same commit, because
#    packages/schemas changed and both apps consume it.
#    (Push to main → CI builds the matrix → Watchtower; or ./build.sh)

# 3. Verify the app booted (a missing key exits 1 with a named message)
docker logs --tail 20 fitnessgeek

# 4. Dry run first — reports counts, writes nothing
docker exec -w /app/apps/fitnessgeek/backend fitnessgeek \
  node scripts/encryptGarminPasswords.js --dry-run

# 5. Real run
docker exec -w /app/apps/fitnessgeek/backend fitnessgeek \
  node scripts/encryptGarminPasswords.js

# 6. Re-run step 4. "WOULD encrypt : 0" means the backfill is complete.
```

Rotating or losing `KEY_VAULT_SECRET` afterwards makes every stored Garmin
password undecryptable; users would have to re-enter them. It is a one-way door
— store it with basegeek's copy.

---

## Commands

```bash
# from the repo root
pnpm install                                   # links workspace:* deps

# backend (dev)
cd apps/fitnessgeek/backend && npm run dev     # nodemon, port 3001

# backend tests — 18 suites / 321 tests, hermetic (no Mongo, no Redis, no network)
cd apps/fitnessgeek/backend && npm test

# frontend tests — 9 files / 61 tests. vitest + RTL, jsdom.
# Config is vitest.config.js, NOT vite.config.js
cd apps/fitnessgeek/frontend && pnpm test

# build the production image exactly as CI does (repo root as context)
docker build -f apps/fitnessgeek/Dockerfile . -t fitnessgeek-local

# deploy (see root DEPLOY.md and DOCS/CICD.md)
./build.sh fitnessgeek
```

---

## Test suite notes

`backend/jest.config.js` runs jest's **ESM** mode:
`node --experimental-vm-modules node_modules/jest/bin/jest.js` with an empty
`transform`, matching bujogeek, notegeek, flockgeek and storygeek. Practical
consequences when writing a test here:

- `jest`, `describe`, `test`, `expect` come from `@jest/globals`.
- Module doubles are `jest.unstable_mockModule()`, registered **before** an
  `await import()` of the subject — not `jest.mock()` + `require()`.
- A relative mock specifier must be made absolute
  (`new URL('../../models/Weight.js', import.meta.url).pathname`); jest
  otherwise resolves it against `jest.setup.js` and cannot find it.
- A default-exporting module's factory must return `{ default: … }`.
- `src/__tests__/auth.test.js` registers the axios double **twice** — once with
  `unstable_mockModule` (this app's ESM `import axios`) and once with
  `jest.mock` (`@geeksuite/user`'s CommonJS `require('axios')`). ESM and CJS
  are separate module registries; one registration only covers one of them.

The ad-hoc `backend/test-*.js` scripts at the top level are hand-run
integration probes (Redis / FatSecret / Garmin), not jest tests — `testMatch`
is scoped to `src/__tests__` so they never get picked up.

---

## Frontend — shared feedback primitives (2026-09-05)

`GeekEmptyState` / `GeekErrorState` / `GeekToastProvider`+`useToast` / `toneForMode` (all
`@geeksuite/ui`) replaced this app's local `Snackbar`/`Alert` success-error patterns and its
`isDark ? color : darken(color, 0.35)` tone branches — TODO_ORDER #15/#19 fan-out; detail in
`DOCS/THE_UI_UNIFICATION_PLAN.md` §3a "Feedback primitives" ("fitnessgeek — done 2026-09-05").
`GeekToastProvider` is mounted in `frontend/src/components/Layout/ModernLayout.jsx`, inside
`GeekShell` and outside `GeekAppFrame` — new code should call `useToast()` for transient
confirmations rather than adding another local `Snackbar`. The local
`components/primitives/EmptyState.jsx` is now a thin wrapper over `GeekEmptyState`; its call
sites (`MyFoods`, `MyMeals`, `Medications`, `Activity`) are unchanged. `PWAUpdatePrompt` and
`OfflineIndicator` are mounted in `App.jsx` above the router, outside `GeekToastProvider`'s
reach, and were deliberately left on their own `Snackbar`s. `FoodLog*` pages/components,
`UnifiedFoodSearch.jsx` (a dependency of `FoodLog`'s `AddFoodDialog`), and `frontend/src/
services/**` were not touched — see "Frontend — where the writes go" below.

---

## Frontend — a11y pass (2026-09-05, TODO_ORDER Q51)

The mobile harness' axe run had fitnessgeek at **29 findings — 0 now**, and it
was the app that kept the suite gate report-only. Nothing needed a waiver.
What it took, and what to keep doing:

- **Every `LinearProgress` carries an `aria-label` that names what it measures
  and reads the number** (`Net carbs: 42g of 50g`), not "progress". Twelve of
  them, across `Dashboard/DailyTicket`, `Dashboard/NetCarbMeter`,
  `Dashboard/MetricCard`, `FoodLog/CalorieSummary` (both modes),
  `FoodLog/NutritionSummary`, `pages/FoodLog`, `Weight/WeightProgress`,
  `Weight/ProgressTracker`, `RecoveryCoach`, `SleepAnalysis` and
  `pages/Reports`. A bare MUI progress bar has no accessible name at all.
- **Icon buttons are named after the row they act on.**
  `WeightLogList`'s delete is `Delete the 218.7 lbs entry from Sep 3`, not
  "Delete" — 24 identical "Delete"s on one screen is not a name.
  `DashboardHeader`'s three quick actions, `AIInsightsCard`'s refresh /
  expand / send and `DateNavigator`'s day arrows got the same treatment.
- **`<Divider>` inside a `<List>` is an axe `list` violation** and
  `component="li"` does *not* fix it (axe reads the `role="separator"` MUI
  then adds). `WeightLogList` paints the rule as a `borderBottom` on the
  `ListItem` instead. Same rule on `pages/Profile`: the Sign-out row was a
  `<ListItem component="button">`, i.e. a bare `<button>` child of a `<ul>` —
  it is now `<ListItem disablePadding><ListItemButton …>`.
- **Charts need a name on the element that carries `role="img"`.**
  `@nivo/line` forwards both `role` and `ariaLabel` to its `<svg>`
  (`WeightTimeline`, `BPChartNivo`); **`@nivo/pie` forwards only `role`**, so
  `BPCategoryDistribution` names the wrapping `Box` (`role="img"` +
  `aria-label`) and passes the pie `role="presentation"`. Recharts renders a
  `<title>` element unconditionally, so a recharts chart with no `title` prop
  has an *empty* title — `BPHRChart` passes `title` and `desc`.
- **The three contrast failures were tinted surfaces, not tokens.**
  `FoodCard`'s source chip painted `getSourceColor()` on
  `alpha(text.secondary, 0.12)` — 2.56:1 in dark, 4.14:1 in light;
  `CopyMealDialog`'s summary and `BPInsights`' trend panel painted
  `text.secondary` on `action.hover` and on a 6% domain tint — 4.4:1 and
  4.39:1. All three now go through
  `readableOn(ink, tint, { under: background.paper })`. **Pass `under`**: a
  translucent surface is a colour *and the paper beneath it*, and it
  composites differently per mode.
- **`QuickAddPanel`'s header was a `<Button>` wrapping a `ToggleButtonGroup`**
  (`nested-interactive`, and the meal toggles were unreachable by keyboard).
  The row is a plain container now; the disclosure button and the picker are
  siblings. `CopyMealDialog`'s three `Select`s are wired
  `InputLabel id` ↔ `labelId` — MUI does not do that for you.

Re-check with
`node tools/mobile-harness/shoot.mjs --app fitnessgeek --serve --enforce-a11y --viewports phone`.

---

## Frontend — where the writes go (2026-09-05)

Two clients, one rule: **domain data goes to basegeek's `/graphql`; only what
the gateway has no equivalent for stays on this app's REST backend.**

| Client | Module | What still goes through it |
|---|---|---|
| `apiService.js` | Apollo → `https://basegeek.clintgeek.com/graphql` | settings, weights, goals, food logs (**reads and writes**), meals, medications, blood pressure, streaks, summaries, households, food reports, insights, Garmin |
| `restClient.js` | axios → this app's own `/api` | food **search** / barcode / favorites / recent (`foodService.js`), meds RxNorm lookup + med logs, InfluxDB, AI passthrough, `PUT /user/profile`, Garmin heart-rate detail |

The four food-log writes — `addFoodToLog`, `updateFoodLog`, `deleteFoodLog`,
`addMealToLog` in `services/fitnessGeekService.js` — moved from `restClient` to
`apiService` on **2026-09-05**, once basegeek's `addFoodLog` / `updateFoodLog` /
`deleteFoodLog` / `logMeal` became behaviour-equivalent (gateway side: `79b1b57`).
What that means in practice:

- `FoodLogInput.food_item` takes a whole search result and the gateway runs
  `FoodItem.findOrCreate` — that is how a USDA / OpenFoodFacts / AI result with a
  synthetic id (`usda_169705`) gets logged at all. `apiService`'s
  `normalizeFoodLogInput()` picks the branch: an id that is a Mongo ObjectId goes
  out as `food_item_id`, anything else as `food_item`. `normalizeFoodInput()`
  therefore **must keep `id`, `source` and `source_id`** — the dedupe reads them.
- `updateFoodLog` takes `FoodLogUpdateInput`, all-nullable, so `EditLogDialog`'s
  partial patch (servings / meal_type / notes / nutrition) works, and omitting
  `food_item_id` skips the catalog check — a servings edit over a soft-deleted
  food succeeds.
- `deleteFoodLog` returns a **Boolean**, not a body. The service throws on `false`
  so both callers stay on the error path REST's 404 put them on.
- Dates go out as plain `YYYY-MM-DD` (`@geeksuite/utils` `localDateString`); the
  gateway normalizes to UTC midnight. Meals added to the log now land on the
  correct UTC day — REST's add-to-log used local midnight and was a day early
  west of UTC.

Tests: `frontend/src/services/__tests__/fitnessGeekServiceFoodLogWrites.test.js`
(vitest, Apollo mocked at `@geeksuite/api-client`) pins the operation name and
variables for all four. CI job `test-fitnessgeek-web`.

---

## Frontend — Bundle (2026-09-05)

`pnpm build` used to end with three "chunks are larger than 500 kB" warnings.
It no longer warns. The numbers below are from `frontend/dist`, KiB
(bytes / 1024), gzip measured with `zlib.gzipSync`.

**First load** — the entry chunk plus everything `dist/index.html` references
directly (`<script>`, `<link rel="modulepreload">`, `<link rel="stylesheet">`):

| | before | after |
|---|---|---|
| entry chunk `index-*.js` | 632.9 kB (gz 190.0) | **93.2 kB (gz 28.0)** |
| first load, total | 1170.5 kB (gz 363.2) | **992.0 kB (gz 309.7)** |
| files on the critical path | 3 | 6 |
| all built js + css | 3130.9 kB (gz 980.9) | 2956.4 kB (gz 932.2) |
| chunks emitted | 45 | 62 |
| chunks over 500 kB | 3 (entry 648, jspdf 589, mui 522) | 0 (largest is `mui` at 401) |

**Route cost** — what a route pulls *beyond* the first load, following its
static imports transitively:

| route | before | after |
|---|---|---|
| `/blood-pressure` | 1246.2 kB (gz 386.5) | **122.4 kB (gz 38.4)** |
| `/medications` | 631.8 kB (gz 193.2) | **54.8 kB (gz 21.8)** |
| `/weight` | 312.8 kB (gz 109.1) | **74.7 kB (gz 21.6)** |
| `/health` | 293.9 kB (gz 96.3) | **53.7 kB (gz 20.9)** |
| `/food-log`, `/dashboard`, the rest | unchanged | unchanged |

Route-level `React.lazy` was already in place in `App.jsx` before this pass and
is not where the win came from. Four things were.

### 1. The MUI dedupe was missing

`resolve.dedupe` listed react, react-dom and the two emotion packages but not
`@mui/material`, so the bundle carried **two** @mui/material 5.18.0 trees — the
app's own and the one pnpm materializes for `packages/ui`'s `^5` peer (Tooltip,
Chip, InputBase, SelectInput, Button, Popover and `createStyled` each appeared
twice in the chunk dump). That is the suite-wide landmine in the root `DOCS/`,
and fitnessgeek was the app still carrying it; bujogeek, notegeek, flockgeek and
storygeek all had the full list already. Adding `@mui/material` took 118 kB off
the eager path and put `GeekShell`/`GeekAppFrame` on the same MUI ThemeContext
as the rest of the app. Do **not** add `@mui/system` to the list — deduping
`@mui/material` makes its nested `@mui/system` a singleton transitively, while
naming it directly breaks resolution under pnpm.

### 2. `manualChunks` was an object, and the object form is a trap

`manualChunks: { vendor: ['react', 'react-dom'], mui: [...] }` matches by
resolved module id. react and react-dom arrive through `@rollup/plugin-commonjs`
proxy modules whose ids never equal the bare specifier, so `vendor` came out as
a **0.03 kB chunk** and react-dom's 130 kB rode along inside `mui`. It is now a
function matching on the path (see `VENDOR_GROUPS` in `vite.config.js`), which
is proxy-proof and pnpm-proof.

Groups, and why each exists:

| chunk | contents | eager? |
|---|---|---|
| `react-vendor` | react, react-dom, scheduler, react-is, react-router + `@remix-run/router` | yes |
| `mui` | `@mui/*`, `@emotion/*` | yes |
| `apollo` | `@apollo/client`, graphql and its runtime tail | yes |
| `motion` | framer-motion / motion-dom — pulled by `packages/ui`'s `GeekAppFrame`, not by app code | yes |
| `date-fns` | date-fns | no |
| `lodash` | lodash | no |
| `d3` | `d3-*`, internmap, delaunator, robust-predicates | no |
| `nivo` | `@nivo/*`, `@react-spring/*` | no |
| `recharts` | recharts + its Redux/immer/es-toolkit tail | no |
| `chartjs` | chart.js, react-chartjs-2, the date-fns adapter | no |

Three of those groups exist only because of a chunk-graph trap that does not
show up in the build log. **A module no group claims can be folded by rollup
into a manual chunk that already needs it — and that makes the whole chunk a
dependency of everything else that needs the module.** Measured here:

- date-fns landed inside `chartjs`, so `/weight` (which only wants
  `differenceInWeeks`) statically imported all 217 kB of chart.js.
- the shared d3 packages landed inside `nivo`, so `recharts` imported `nivo`,
  and one Recharts heart-rate chart cost 574 kB.
- `delaunator`/`robust-predicates` are `d3-delaunay`'s deps, not Nivo's; leaving
  them in the `nivo` group added a `d3 → nivo` edge on top of `nivo → d3`, and
  the cycle made every d3 consumer pull all of Nivo.

The `mui` group is load-bearing for the **async** side too, which is the least
obvious thing here. Dropping it and letting rollup place `@mui` itself pushes
first load from 992 kB to **1439 kB** and drags `nivo` (303 kB) and `recharts`
(269 kB) onto it, because without a MUI chunk boundary rollup's automatic
grouping hoists the chart vendors into the entry's graph. Measured, not
guessed. Do not "simplify" it away.

### 3. Heavy, rarely-used libraries load on demand

- **jspdf + html2canvas** (589 kB minified together) were module-scope imports
  in `pages/Medications.jsx` and `components/BloodPressure/BPReport.jsx`, so
  they were on the *route* load for two pages. They are now `await import()`ed
  inside the two export handlers, i.e. on the click. Medications also imported
  `html2canvas` and never called it; that import is gone (this is the one
  eslint warning that disappeared, 55 → 54).
- **Nivo / Recharts / chart.js.** All three chart libraries are in use — Nivo on
  `/weight` and `/blood-pressure`, Recharts for the Garmin heart-rate chart,
  chart.js on `/health`. Each chart is now a `React.lazy` island inside its
  page: `BPChartNivo`, `BPCategoryDistribution`, `BPHRChart` and `BPReport` on
  `/blood-pressure`; `WeightTimeline` on `/weight`; the four analytics tab
  panels on `/health`. The page frame, insights and log list paint first.
- `/health` is the biggest of these in practice: chart.js used to be downloaded
  even by users who have never enabled the InfluxDB integration and only ever
  see the "integration required" screen. Now it is never fetched for them.
- **Barcode / ZXing was already on demand** and stays that way — `BarcodeScanner`
  appends a `<script src="https://unpkg.com/@zxing/library@0.19.1/...">` at scan
  time and nothing ZXing is bundled. (That CDN dependency is its own question,
  but it is not a bundle-size one.)

### 4. Barrel files defeat lazy boundaries

`pages/Weight.jsx` imported four components from `components/Weight/index.js`.
That barrel also re-exports the legacy `WeightChart` / `WeightChartNivo` /
`WeightSparkline*` set, and **nothing in this workspace declares
`sideEffects: false`** — so rollup shakes the unused *bindings* but keeps those
modules' top-level side effects, and `@nivo/line` came straight back into the
page chunk as a bare side-effect import, silently undoing the lazy boundary.
Importing the three components by file dropped `/weight` from 380 kB to 74.7 kB.
Nothing else in the app imports through that barrel. **If a lazy boundary does
not show up in the chunk sizes, look for a barrel first.**

### The FAB registry is unaffected

`useGeekPrimaryAction` (`packages/ui/src/navigation/primaryActionContext.js`)
registers in a mount effect and unregisters on unmount, as a stack. A lazy
component simply registers when Suspense resolves it. It did not need handling
here anyway: the three registrants — `FoodLog`, `QuickAddWeight`, `QuickAddBP` —
were all deliberately left eager within their routes, so nothing that registers
a FAB sits behind a new Suspense boundary.

### Service worker

`generateSW` precaches **every** hashed `.js`/`.css` — verified after the split:
62 js/css files on disk, 64 precache entries (those plus `index.html` and
`offline.html`), none missing. New chunk names are therefore covered
automatically; there is nothing to maintain when the chunk list changes.

The `fitnessgeek-assets` StaleWhileRevalidate rule gained a `cacheWillUpdate`
plugin that refuses to cache a `text/html` response for a script/style/font
request. See the SPA-fallback note under "Known landmines" for why.

### How to re-measure

There is no bundle visualizer in this workspace and none was added.
`npx vite-bundle-visualizer` is not resolvable without an install. The numbers
above came from `dist/assets` file sizes plus a throwaway rollup
`generateBundle` hook that dumps each chunk's `modules`, `imports` and
`dynamicImports` to JSON; first load is the transitive static closure of the
entry chunk, a route's cost is its own closure minus that. Reading
`dist/index.html`'s `<script>` + `modulepreload` list gives the same first-load
set and is the quicker check.

---

## Known landmines

- **Mongoose duplicate-index warnings** on boot (`user_id`) are pre-existing
  and harmless — a field declares `index: true` and `schema.index()` both.
- **`garmin-connect` is CommonJS** with a named export Node's
  `cjs-module-lexer` cannot see, so it must be imported as a default and
  destructured (`src/services/garminConnectService.js`). A plain
  `import { GarminConnect } from 'garmin-connect'` throws at load.
- **The backend serves the SPA, and its fallback did NOT 404 asset paths — fixed
  2026-09-05 (Q53), all apps guarded as of 2026-09-05.** `src/app.js`'s `GET *`
  catch-all now checks `path.extname(req.path)` ahead of `res.sendFile`, so a
  request for `/assets/<hash>.js` naming a hash a deploy has just deleted gets
  a 404, not the index document. Before the fix (verified 2026-09-05 against a
  real build, `vite preview` behaving identically to the Express fallback):
  `GET /assets/gone-DEAD.js` answered **200 text/html**. This was the
  suite-wide landmine in the root `DOCS/` (see `DOCS/PWA_STANDARD.md` §1a);
  bujogeek, notegeek and bookgeek already carried the extname-404 guard, and
  as of the Q53 pass so do fitnessgeek, storygeek, flockgeek and basegeek's
  gateway. startgeek (no Express backend, static bundle via the `serve` npm
  package) carried the equivalent gap through `serve -s`'s unconditional
  not-found rewrite, closed by dropping `-s` (the app has no client-side
  router, so no deep-link fallback was ever needed). Every app's service
  worker also confirmed or gained a content-type check ahead of caching a
  static-asset response, so a poisoned response that slips through anyway
  before a deploy propagates can never get written into the cache under the
  asset's URL. Full file list and per-app detail: `DOCS/PWA_STANDARD.md`
  §1a and its "Remaining work" Q53 entry.

  Two things kept it from biting even before the server-side fix. First,
  `generateSW` precaches every hashed `.js`/`.css`, so an old client keeps
  serving the old chunks out of its own precache rather than re-fetching a URL
  the server no longer has. Second, the `fitnessgeek-assets` runtime rule
  carries a `cacheWillUpdate` plugin (`frontend/vite.config.js`) that declines
  to cache any `text/html` response for a script/style/font request, which
  covers what precaching does not: the 38 hashed `@fontsource`
  `.woff`/`.woff2` files (generateSW's `globPatterns` do not match them) and
  the cross-origin ZXing script. Neither was a substitute for the server-side
  404 — the guard makes a poisoned response uncacheable, it does not make the
  asset load; the 404 above is the actual cure.
- **`/health` and `/api/health`** both answer, unauthenticated. No Docker
  `HEALTHCHECK` is defined for this service.
- **`KEY_VAULT_SECRET` is shared with basegeek**, and `packages/schemas` is now
  a *behavioural* dependency, not just a field list — a change there changes how
  both apps write to Mongo. Deploy the two from the same commit.
- **The caller-less REST food-log writes are gone (2026-09-05).**
  `POST/PUT/DELETE /api/logs` (`logRoutes.js`) and `POST /api/meals/:id/add-to-log`
  (`mealRoutes.js`, plus its `parseLocalDate()` helper — confirmed the only caller)
  were deleted along with the `FoodItem`, `cacheService` and `mongoose` imports
  that only they used in `logRoutes.js`, and the `FoodLog` import in
  `mealRoutes.js`. `GET /api/logs` (and its siblings: `/:id`, `/date/:date`,
  `/household`, `/household/:memberId/:date`) and `POST /api/logs/copy` are
  unaffected — see the route table below. Two tests covering the deleted
  `DELETE /:id` route came out of `src/__tests__/routes/logs.test.js` (106 → 104
  tests); no test file targeted the deleted `POST /`, `PUT /:id`, or
  `add-to-log` routes directly. Docker boot verified (production image,
  `--network none`): boots past config/routes and fails at the expected
  Mongo-connect step, no import error.

### `logRoutes.js` / `mealRoutes.js` route table (post 2026-09-05 cleanup)

| Route | Status |
|---|---|
| `GET /api/logs` | live — date/meal-type query, recent-logs fallback |
| `GET /api/logs/:id` | live — single log, owner-scoped |
| ~~`POST /api/logs`~~ | **deleted** — caller-less, gateway's `addFoodLog` replaced it |
| ~~`PUT /api/logs/:id`~~ | **deleted** — caller-less, gateway's `updateFoodLog` replaced it |
| ~~`DELETE /api/logs/:id`~~ | **deleted** — caller-less, gateway's `deleteFoodLog` replaced it |
| `GET /api/logs/date/:date` | live |
| `GET /api/logs/household` | live |
| `GET /api/logs/household/:memberId/:date` | live — sharing gate |
| `POST /api/logs/copy` | live — still owns `FoodItem`/`DailySummary` via `FoodLog`/`UserSettings`; `toUtcMidnight` still imported for this route |
| `GET /api/meals`, `GET /api/meals/:id`, `POST /api/meals`, `PUT /api/meals/:id`, `DELETE /api/meals/:id` | live, untouched |
| ~~`POST /api/meals/:id/add-to-log`~~ | **deleted** — caller-less, gateway's `logMeal` replaced it; its `parseLocalDate()` helper (the buggy local-midnight one) went with it |

---

## Frontend — TODO_ORDER #30 small UI items, closed 2026-09-05

Three fitnessgeek sub-items from the "Small UI items" pass (see `SUITE_TODO.md`):

- **Drawer landmine — stale entry, no code change.** SUITE_TODO's "`MuiDrawer` landmine
  pins Drawer paper to `#0C0A09` in both modes" described the state *before* the GeekShell
  migration (`6e9b14e`, 2026-09-02). `theme/theme.jsx` carries no `MuiDrawer` override today;
  the always-dark chrome lives in `ModernLayout.jsx`'s `navSx={{ bgcolor: '#0C0A09' }}`,
  which `GeekShell` (`packages/ui/src/navigation/GeekShell.jsx`) applies only to its own nav
  Drawer `PaperProps`/permanent-sidebar `Box` — not a global override — in both app modes,
  deliberately (Studio Slate identity, MOBILE_UI_PLAN.md §4 "near-black drawer"). Verified via
  `git log -S`/`git show` rather than re-fixing something already fixed.

- **BarcodeScanner** (`components/BarcodeScanner/BarcodeScanner.jsx`, `.css`): the reticle's
  dark-mode styling keyed off `@media (prefers-color-scheme: dark)`, disagreeing with the
  app's actual theme switch (`:root[data-theme]`, set from the `geek_theme` cookie —
  independent of OS preference). Moved those four rules to `:root[data-theme='dark'] .scanner-*`
  selectors. Also folded the reticle/corner size and scan-line-speed `@media (max-width:
  600/480/360px)` cutoffs into `theme.breakpoints.down('sm'|480|360)` + `useMediaQuery` inside
  the component (computed once, applied as inline styles), so the sizing can't drift from the
  theme's own breakpoints the way a hand-copied stylesheet value can. The camera viewport is
  full width below `sm` and capped at 480px, centered, at `sm`+.

- **Native date pickers**: fitnessgeek has no MUI X date picker — every date-only field
  (weight log, BP log, HealthDashboard's "Viewing" day, CopyMealDialog's from/to) already used
  a bare `TextField type="date"` (the OS-native picker), just with a different
  label/size/min-width combination each time — two fields (`QuickAddBP`, `AddBPDialog`) had no
  visible label at all. Consolidated into one shared `components/primitives/DateField.jsx`
  (exported from the `primitives` barrel) and rewired all six call sites through it.
  `HealthDashboard`'s hand-rolled "no future dates" `max` (manual `Date` → `YYYY-MM-DD`
  formatting) is now `localDateString()` from `@geeksuite/utils`. Values in and out stay plain
  `YYYY-MM-DD` strings throughout — `DateField` never constructs or parses a `Date`, so it
  cannot reintroduce the calendar-vs-instant bug fixed in `4856227`.

Tests: `components/primitives/__tests__/DateField.test.jsx` (5 cases) and
`components/BarcodeScanner/__tests__/BarcodeScanner.test.jsx` (5 cases, first component tests
in this app's frontend suite — 17 → 27). The BarcodeScanner tests never touch a real camera;
jsdom has no `navigator.mediaDevices`, so `detectCameras()`'s own existing fallback drops the
component into manual-entry mode, which is what the tests exercise (8-14-digit validation,
lookup, not-found, and the localStorage-backed scan history). One thing to know if you touch
this test file again: the mount effect retries the camera ~100ms after `detectCameras()`
settles regardless of which mode it landed on, and without a native `BarcodeDetector` that
retry falls into the ZXing branch, which appends a real `<script src="https://unpkg.com/...">`
— jsdom never fires its `onload`/`onerror`, so the promise (and `isLoading`) hangs forever.
The tests stub `window.BarcodeDetector` in `beforeEach` to keep that retry on the fast,
synchronous-failure path instead.

`pnpm build` and `pnpm lint` (55 warnings, unchanged baseline) both clean; `tools/mobile-harness`
(`--app fitnessgeek --viewports phone`) stays at 0 violations across 20 scenes, both modes.
