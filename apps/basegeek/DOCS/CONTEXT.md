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
