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

**Still open, frontend side:** `pages/MyFoods.jsx:80,95` reads
`food.serving?.size || 100` and passes `editingFood._id` — it needs
`food.serving_size` and `food.id ?? food._id` before the 100 g rewrite and the
`PUT /foods/undefined` actually stop.

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

# backend tests — 12 suites / 104 tests, hermetic (no Mongo, no Redis, no network)
cd apps/fitnessgeek/backend && npm test

# frontend tests — vitest + RTL, jsdom. Config is vitest.config.js, NOT vite.config.js
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

## Known landmines

- **Mongoose duplicate-index warnings** on boot (`user_id`) are pre-existing
  and harmless — a field declares `index: true` and `schema.index()` both.
- **`garmin-connect` is CommonJS** with a named export Node's
  `cjs-module-lexer` cannot see, so it must be imported as a default and
  destructured (`src/services/garminConnectService.js`). A plain
  `import { GarminConnect } from 'garmin-connect'` throws at load.
- **The backend serves the SPA.** `src/app.js` has a `GET *` catch-all that
  sends `public/index.html` for anything that is not `/api/*` or `/graphql`.
  See the suite-wide note in `DOCS/` about fallbacks needing to 404 asset
  paths so a stale service worker cannot be poisoned on deploy.
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
