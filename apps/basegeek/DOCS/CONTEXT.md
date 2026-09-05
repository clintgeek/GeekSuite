# baseGeek — Project Context

Current state reference for development work on baseGeek's admin console
(`apps/basegeek/packages/ui`). Update this when the console's architecture,
shared-primitive adoption, or feature status changes significantly.

For the suite-wide SSO architecture (basegeek as the central auth authority),
see `DOCS/CONTEXT.md` at the repo root — that file is the SSO reference only;
this one covers the admin-console frontend.

Last major revision: 2026-09-05 (UI unification — shared feedback primitives).

---

## What this app is

baseGeek is GeekSuite's "mission control": the suite-wide auth authority
(SSO cookies, `userGeek` collection) plus an admin console for the operator
— registry (`BaseGeekHome`), users (`UserGeekPage`), the AI subsystem
(`AIGeekPage`, split into `pages/aigeek/*`), infrastructure status
(`DataGeekPage`: Mongo/Redis/Postgres/InfluxDB), and the account/preferences
surface every suite user lands on (`AccountPage`). `PortalPage` is the public,
unauthenticated landing page at `/portal`.

**Frontend:** React 18 + Vite, MUI v5, Apollo Client (GraphQL), react-router
v6, zustand (via `@geeksuite/user`). Routes render inside `Layout.jsx`
(`GeekShell` + `Sidebar` + `TopBar`), except `PortalPage`/`LoginPage`/
`RegisterPage`, which render outside the shell entirely — no nav chrome, no
`GeekToastProvider`.

---

## The fitnessgeek GraphQL gateway's Mongoose models (2026-09-05)

Out of this file's usual scope — it covers the admin console — but there is no
other basegeek context doc, and this is the sort of thing that reads as missing
code if you don't know the history.

`apps/basegeek/packages/api/src/graphql/fitnessgeek/models/*` declares Mongoose
models against collections in the **`fitnessgeek`** database, bound to
`getAppConnection('fitnessgeek')`. fitnessgeek's own backend declares models
against the same collections. Two writers, one collection — and Mongoose strict
mode drops unknown paths from a `$set` silently, so drift between the two copies
destroys data without an error anywhere. The full audit, the remaining work and
the ordering are in `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md`.

**Six of those models no longer declare a schema here.** `UserSettings`,
`Weight`, `BloodPressure`, `Medication`, `LoginStreak` and `WeightGoals` build
from `@geeksuite/schemas` — the file in this directory is a thin wrapper: a
factory call, its own ownership statics, and the `fitnessConn.model(...)`
binding. The `requireUser` guards on `LoginStreak.getOrCreateStreak` and the
three `WeightGoals` statics stayed here on purpose — this gateway fails closed
on an unscoped query while fitnessgeek's callers are already past auth, and
statics don't appear in `schema.paths` so the two writers are free to disagree.
`LoginStreak.recordLogin` went the other way: it is an *instance method* that
mutates declared paths, so it lives in the shared module and both sides run the
same implementation. Do not add fields to the wrapper; add them to
`packages/schemas/fitnessgeek/*` and, if they must cross GraphQL, to
`typeDefs.js`. Tripwires in both apps' suites fail if a wrapper stops consuming
the shared module. Import form here is default-import-plus-destructure — the
shared modules are CommonJS, and that is the interop form that behaves
identically under Node ESM and jest's `--experimental-vm-modules`.

**Two models were deleted on 2026-09-05.** `AIFoodPromptCache` and
`MedicationLog` were declared here with zero consumers in this package — no
resolver, no typeDef, no test. fitnessgeek is the sole reader and writer of
both collections. Deleting `AIFoodPromptCache` also stopped this process racing
fitnessgeek to build a 45-day TTL index on a collection it never read. There is
no barrel in `models/` — resolvers import each file directly — so a deletion is
a file-level operation.

---

## UI unification — shared feedback primitives (TODO_ORDER #15, 2026-09-05)

`GeekEmptyState` / `GeekErrorState` / `GeekToastProvider` / `useToast` (from
`@geeksuite/ui`) are adopted across the console. Detail lives in
`DOCS/THE_UI_UNIFICATION_PLAN.md` §3a "Feedback Primitives" (basegeek's
entry) and `DOCS/TODO_ORDER.md` item 15; the short version:

- **`pages/aigeek/*`** (config/catalog/usage/keys tabs, the model-steward
  block) already used the shared primitives going into this pass — that
  landed during the same-week AIGeek polish (`apps/basegeek/DOCS/AIGEEK_POLISH.md`).
  `GeekToastProvider` has been mounted in `Layout.jsx` (inside `GeekShell`,
  outside `GeekAppFrame`) since that pass too.
- **`components/primitives/ResponsiveTable.jsx`** (shared by `Databases` and
  `AppsKeysTab`'s key tables) grew `error` / `errorTitle` / `onRetry` props —
  a load failure renders `GeekErrorState` in place of the table/card list —
  and its empty-message block is now `GeekEmptyState` (compact).
- **`AccountPage`** — the shared `error` state (profile/preferences save) and
  the two per-section `saved`-flag auto-clear checkmarks became
  `notify(msg, { tone })` calls at each save's success/catch; the store's own
  bootstrap-failure (`storeError`) surfaces the same way. "No app-specific
  preferences yet" is `GeekEmptyState`.
- **`UserGeekPage`** — the list-load failure renders `GeekErrorState` with
  `onRetry={fetchUsers}`; delete/create failures are toasts (they don't
  invalidate a list already on screen); "No users found" is `GeekEmptyState`.
- **Left alone, deliberately:** `MongoStatus` / `RedisStatus` /
  `PostgresStatus` / `InfluxStatus` (all on `DataGeekPage`) and
  `BaseGeekHome`/`PortalPage`'s app-health tiles — these are standing
  connection/health readouts on a 30s–60s poll, not transient confirmations
  or failures, so none of the three primitives fit. `LoginPage` /
  `RegisterPage`'s inline error `Alert`s — both render outside
  `GeekShell`/`GeekToastProvider` (public/auth routes have no shell chrome),
  matching the gap TODO_ORDER #19 already tracks as "Auth splash still open."
- No local `EmptyState`/`ErrorState`/toast component and no
  `isDark ? lighten(…) : darken(…)` hand-rolled tone helper existed here
  (this app derives brand-color ink via `theme.js`'s own `brandInk()`), so
  there was nothing to delete and nothing for `toneForMode` to replace.
- Verify: `pnpm build` / `pnpm lint` clean (no test script in this package);
  mobile harness (`node tools/mobile-harness/shoot.mjs --app basegeek --serve
  --viewports phone`) — 26 scenes, 0 violations, unchanged from the
  `e85fc43` baseline.

`src/theme.js` was intentionally left untouched throughout this pass (it had
just landed) — themed tooltips and brand-ink derivation live there.
