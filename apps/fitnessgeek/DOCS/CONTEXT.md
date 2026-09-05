# FitnessGeek — Project Context

How this app is actually built, run and deployed. Paths, ports and commands
here override any reasonable-looking default.

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
| `@geeksuite/schemas` | the shared `UserSettings` field set (one collection, two writers — see `USER_SETTINGS_SCHEMA.md`) |
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

# backend tests — 12 suites / 106 tests, hermetic (no Mongo, no Redis, no network)
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
- **The fitnessgeek backend still serves REST routes nothing in this repo calls.**
  `POST/PUT/DELETE /api/logs` and `POST /api/meals/:id/add-to-log` lost their last
  caller on 2026-09-05 (see "Where the writes go" above) but are still mounted.
  Removing them is the next ticket; until then a stale service worker or an old
  client can still reach them, and they write through this app's own duplicate
  Mongoose models rather than the gateway's.
