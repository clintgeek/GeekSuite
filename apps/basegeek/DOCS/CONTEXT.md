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

**Nine of those models no longer declare a schema here.** `UserSettings`,
`Weight`, `BloodPressure`, `Medication`, `LoginStreak`, `WeightGoals`,
`NutritionGoals`, `Meal` and `FoodItem` build from `@geeksuite/schemas` — the
file in this directory is a thin wrapper: a factory call, its own ownership
statics, and the `fitnessConn.model(...)` binding. Only `FoodLog` and
`DailySummary` still declare a schema literal here. The `requireUser` guards
stayed here on purpose — on `LoginStreak.getOrCreateStreak`, the three
`WeightGoals` statics, the three `NutritionGoals` statics, all four `Meal`
statics and `FoodItem`'s `findAccessible` / `findAccessibleMany` — because this gateway fails closed on an unscoped query while
fitnessgeek's callers are already past auth, and statics don't appear in
`schema.paths` so the two writers are free to disagree. For `Meal` that
disagreement is load-bearing rather than cosmetic: fitnessgeek's list statics
return **every user's meals** when called without a userId, and both apps' test
suites assert that divergence as a decision. Do not unify them here; tightening
fitnessgeek's copy is its own ticket.

`FoodItem` is the one carve-out from that statics rule, taken on 2026-09-05.
Its `findOrCreate` **dedupe ladder** (barcode → `(source, source_id)` →
`(name, brand)`, otherwise a new global row) is not an ownership policy: it has
one correct meaning for both writers, and a divergence would fork the food
catalog silently instead of throwing. So the ladder lives in the shared module
as `findOrCreateFoodItem(Model, foodData)` and the static here is a one-line
delegate. **The accessibility re-check stays in `resolvers.js`**
(`resolveLogFoodItem`) — the dedupe queries are deliberately unscoped, so the
resolver puts the resolved row through `findAccessible` afterwards, and that is
this gateway's deliberate divergence from REST (`79b1b57`). Do not move it into
the static. `FoodItem.search` was **not** promoted even though it is
byte-identical on both sides: it scopes on `{user_id: null}` while
`foodCatalogFilter` above it also matches `{user_id: {$exists: false}}`, so
there are two live definitions of a visible catalog row and promoting one would
freeze the disagreement. `barcode` is the only `unique` index in
`@geeksuite/schemas`; changing a `unique` flag there means both processes
redeploy together.

Instance methods went the other way and live in the shared modules, so both
sides run one implementation: `LoginStreak.recordLogin`,
`NutritionGoals.checkGoalsMet` / `getProgress`, `Meal.getNutrition` and
`FoodItem.isGlobal` — along with `Meal`'s embedded food-item sub-schema, its
`pre('save')` `updated_at` stamp, and `FoodItem`'s `totalCalories` virtual. Do not add fields to the wrapper; add them to
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

## Gateway input validation (TODO_ORDER #22, 2026-09-05)

The GraphQL gateway validates mutation arguments with zod before a resolver
touches a service or a model. All four modules are covered now — bujogeek
(`3265b1c`), then notegeek and flockgeek, then **bookgeek**. Each has its own
`src/graphql/<app>/validation.js` with one strict schema per mutation family;
the machinery they are built from lives in
`src/graphql/shared/validation.js`.

**The rules, which are the same in all three:**

- **One error shape.** `validateInput(schema)` throws a `GraphQLError` with
  `extensions.code = 'BAD_USER_INPUT'`, `extensions.http.status = 400` and
  `extensions.details` — an array of `{ path, message }`. Nothing else.
- **Strict objects.** An argument that is not in the schema is a rejection,
  not a silently-dropped key. GraphQL already rejects undeclared arguments, so
  this mainly guards direct resolver calls and future argument churn.
- **Validation runs after the auth check, never before.** An anonymous caller
  gets `Unauthorized`, not a field-level complaint that describes a valid
  payload for them.
- **Ids are bounded strings, not ObjectId shapes.** Every owned-resource
  lookup in the gateway reports a malformed id and a foreign id identically
  ("not found"), on purpose. Validating id *format* here would give the two
  cases different errors and undo that. The ownership suites assert those
  exact messages. flockgeek's optional references additionally accept `''`,
  which `assertOwned` reads as "no reference at all".
- **Enums and bounds come from the models.** Mongoose only enforces `enum:`
  on `.save()` — a `findOneAndUpdate` runs with `runValidators` off — so
  before this layer, `updateBird(status: "anything")` and
  `updateMeatRun(status: "done")` reached the database unchallenged.

**Dates split by module, and the split is the point:**

- **flockgeek — every date argument is a calendar day.** Hatch, set, status,
  group start/end, pairing, harvest, egg-collection and health-event dates
  are all days; every form that writes one is an `<input type="date">`. They
  normalize through `@geeksuite/utils`' `toUtcMidnight`, the write-side half
  of the read-side fix in `4856227`. For the frontend this is a no-op; it
  fixes any other client that sends a full instant for a day field, which
  would store 06:00Z and read back as the previous day west of UTC.
- **notegeek — no date arguments at all.** `createdAt`/`updatedAt` are
  mongoose-managed. If one is ever added it is an *instant*.
- **bujogeek — mixed.** `dueDate` can carry a real reminder hour, so it stays
  an instant; only `toggleHabitLog`'s `date` is a calendar day. See that
  module's own doc comment.
- **bookgeek — mixed, the other way round.** `updateBook`'s `publishedDate`
  is a calendar day (no source — ISBN metadata, Open Library, a manual
  entry — ever gives a time of day, so it normalizes through
  `calendarDateField()`); `dateStarted`/`dateFinished` are real
  reading-progress instants and keep whatever time-of-day they carry.

**One bound worth knowing:** a notegeek note's `content` has two ceilings.
`text`/`markdown`/`code` stop at 100 000 characters; `mindmap`/`handwritten`
get 5 000 000, because those store a serialized tldraw/mind-map snapshot in
the same field and a modest sketch clears 100 000 without trying. The ceiling
is picked from the note's own `type`; an `updateNote` that omits `type` gets
the generous one, since the server cannot know the stored type without a read
it does not otherwise need.

**bookgeek is a special case: books and shelves are a deliberately SHARED
household library.** `Book` carries no owner/userId field on purpose — see
`resolvers.js`'s own doc comment — so `createBook`/`updateBook`/`deleteBook`
have no owner key to strip before validation (there never was one to strip:
no bookgeek mutation declares a `userId`/`ownerId` argument at all). Only the
Profile family — `saveBookProfile`, `saveLibraryFilter`,
`deleteLibraryFilter`, `addBookShelf`, `removeBookShelf` (added `01d35d4`) —
is per-user, scoped by the session's `userId` in every resolver. Several
Profile fields keep their own resolver-level checks with specific, tested
error messages (`deviceWord`'s 3-24-char pattern, a filter's required `name`,
a shelf's 40-char `label` cap, "Only custom shelves can be removed" for
`removeBookShelf`'s built-in ids) — this layer validates shape only for those
fields (a bounded string, nothing trimmed or required) so the resolver's own
message still fires; `removeBookShelf`'s `id` also deliberately accepts `''`
for the same reason (`bookgeekProfile.test.js`'s "a built-in shelf can never
be removed" case).

This closes the gateway side of #22 entirely. flockgeek's *own* REST backend
is a separate, still-open question (`DOCS/TODO_ORDER.md` #22).

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
