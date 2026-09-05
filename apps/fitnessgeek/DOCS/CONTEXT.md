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

The backend depends on four `workspace:*` packages:

| Package | Used for |
|---|---|
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

## Commands

```bash
# from the repo root
pnpm install                                   # links workspace:* deps

# backend (dev)
cd apps/fitnessgeek/backend && npm run dev     # nodemon, port 3001

# backend tests — 11 suites / 90 tests, hermetic (no Mongo, no Redis, no network)
cd apps/fitnessgeek/backend && npm test

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
