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

**None of these models declares a schema here any more — the consolidation is
complete as of 2026-09-05.** `UserSettings`, `Weight`, `BloodPressure`,
`Medication`, `LoginStreak`, `WeightGoals`, `NutritionGoals`, `Meal`,
`FoodItem`, `FoodLog` and `DailySummary` all build from `@geeksuite/schemas` —
the file in this directory is a thin wrapper: a factory call, its own ownership
statics, and the `fitnessConn.model(...)` binding. (The other two models this
gateway used to declare, `AIFoodPromptCache` and `MedicationLog`, were orphans
with no consumer here and were deleted; a test asserts they stay gone.) The
`requireUser` guards stayed here on purpose — on
`LoginStreak.getOrCreateStreak`, the three `WeightGoals` statics, the three
`NutritionGoals` statics, all four `Meal` statics, `FoodItem`'s
`findAccessible` / `findAccessibleMany`, all four `FoodLog` list statics and
all three `DailySummary` statics — because this gateway fails closed on an unscoped query while
fitnessgeek's callers are already past auth, and statics don't appear in
`schema.paths` so the two writers are free to disagree. For `Meal` that
disagreement is load-bearing rather than cosmetic: fitnessgeek's list statics
return **every user's meals** when called without a userId, and both apps' test
suites assert that divergence as a decision. Do not unify them here; tightening
fitnessgeek's copy is its own ticket.

`FoodItem` and `DailySummary` are the two carve-outs from that statics rule,
both taken on 2026-09-05.
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
`@geeksuite/schemas` apart from `DailySummary`'s `{user_id, date}`; changing a
`unique` flag there means both processes redeploy together.

`DailySummary.updateFromLogs` is the other carve-out, and the one with a
production incident behind it. It recomputes a day's whole `totals` /
`meals` / `goals_met` triple from that day's food logs and writes it through a
single `findOneAndUpdate` — so when this gateway's copy of the schema was
missing `totals.net_carbs_grams` (C1, fixed in `0cecb4a`), merely *reading* a
day through `dailySummary` erased the keto ring's number from the stored
document. The recompute now lives in the shared module as
`updateDailySummaryFromLogs({SummaryModel, FoodLogModel, UserSettingsModel,
userId, startDate, endDate})`, with `summarizeFoodLogs` and
`evaluateDailyGoalsMet` exported for assertions, and the static here keeps only
three things: the `requireUser` guard, the two `fitnessConn.model(...)` lookups,
and the date normalization. **The date normalization cannot move** —
`toUtcMidnight` comes from `@geeksuite/utils`, which is ESM-only and cannot be
`require`d from the CommonJS shared package — so the helper takes an
already-normalized `startDate` / `endDate`. Do not add a CJS build to
`@geeksuite/utils` for it, and do not hand-roll an eighth normalizer.

`FoodLog`'s `meal_type` enum is `MEAL_TYPES` from the shared `meal.js` rather
than a copy: `logMeal` writes a saved Meal's `meal_type` straight into a
`foodlogs` row, and `updateFromLogs` buckets those rows by it under a guard, so
a value legal on one collection and not the other would count in `totals` and
vanish from the per-meal breakdown.

Instance methods went the other way and live in the shared modules, so both
sides run one implementation: `LoginStreak.recordLogin`,
`NutritionGoals.checkGoalsMet` / `getProgress`, `Meal.getNutrition` and
`FoodItem.isGlobal` — along with `Meal`'s embedded food-item sub-schema, its
`pre('save')` `updated_at` stamp, and the `FoodItem.totalCalories` and
`FoodLog.calculatedNutrition` virtuals. Do not add fields to the wrapper; add them to
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
  entry — ever gives a time of day, so it normalizes to UTC midnight);
  `dateStarted`/`dateFinished` are real reading-progress instants and keep
  whatever time-of-day they carry.

**And dates have two floors, which is a second axis entirely.** A *scheduling*
date — everything flockgeek and bujogeek write, plus bookgeek's
`dateStarted`/`dateFinished` — is recent or near-future, and
`calendarDateField()`/`instantField()` floor it at `MIN_DATE` (2000-01-01) to
catch a typo or a unix-epoch zero. A *historical* date records a fact about
the world and can be centuries old: `publishedDate` is the only one in the
gateway today, and it uses `historicalDateField()`, whose floor is
`MIN_HISTORICAL_DATE` (1000-01-01). The ceiling (10 years out) is the same for
both. This is not cosmetic — the book edit dialog seeds `publishedDate` from
the book and **resends it on every save**, so the scheduling floor made every
pre-2000 book permanently uneditable: a rating change on *Dune* came back
`BAD_USER_INPUT`. Both floors are options on the same primitive
(`calendarDateField({ min })`), so a new field picks one deliberately. The
question to ask is whether a value from 1965 would be a bug.

**Nullable is a per-field decision, made against the GraphQL type.**
`.nullable()` on an update field means "the client may send `null` to clear
this", which is right for every field its type declares nullable and wrong for
one it declares non-null. The gateway's update resolvers write `{ $set: input }`
without `runValidators`, so an accepted `null` lands in the document and that
row then errors out of every later query against the non-null field. Hence
`updateBook`'s `title` is **optional but not nullable** — omit it to leave the
title alone; there is deliberately no way to clear it, because `Book.title` is
`String!`. Every other `String!`-backed input in bookgeek is a non-null GraphQL
argument (GraphQL itself refuses the `null`) or a server-generated id.

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

## Gateway fixes (Q64, 2026-09-05)

- **bujogeek** `taskService`'s two virtual-occurrence builders (in-range and
  the daily/all carry-forward) omitted `collectionId` and `recurrencePattern`
  on every synthetic row, so a recurring task filed into a collection read as
  unfiled from Today/Plan/Review; both now copy every field `TaskEditor`
  reseeds (`collectionId`, `recurrenceRule`, `recurrencePattern`, `tags`,
  `signifier`, `priority`) straight off the master — pinned in
  `bujogeekRecurrenceUnification.test.js`.
- **notegeek** `renameTag`'s positional `$set: 'tags.$'` duplicated a tag
  already on the note (`a`→`b` on `[a, b]` gave `[b, b]`); now `$addToSet`s
  the new tag then `$pull`s the old one and returns whether any note actually
  changed — pinned in `notegeekOwnership.test.js`.
- **notegeek** `updateFolder` took any `parentId` with no ancestry check, so a
  folder could become its own descendant and loop the tree view; it now walks
  the caller's folder set and rejects a self- or descendant-`parentId` with
  `BAD_USER_INPUT` — pinned in `notegeekOwnership.test.js` (self, child,
  grandchild, and a valid move/re-root).

---

## notegeek: HTML note bodies are sanitized on save (Q63, 2026-09-05)

`createNote`/`updateNote` run the body through
`graphql/notegeek/sanitize.js` before it is stored. Three things are worth
knowing before touching that path:

**Only `type: 'text'` is sanitized, and that is not a shortcut.** The five
note types do not all hold the same thing: `text` is TipTap HTML (`getHTML()`),
`markdown` is markdown source, `code` is `JSON.stringify({language, code})`,
and `mindmap`/`handwritten` are serialized ReactFlow / tldraw snapshots.
Running an HTML sanitizer over a JSON snapshot would entity-escape its quotes
and angle brackets and corrupt the document, so every non-`text` body is
stored byte-for-byte as before. `sanitizeNoteContent(content, type)` is a
pass-through for an unknown type too — a new note type is opted in
deliberately, never by accident.

**A create with no `type` counts as `text`.** `Note.type`'s schema default is
`'text'`, so a body that arrives without a type really does become a
rich-text note and has to be cleaned like one.

**An update that omits `type` costs one extra read — deliberately.** `type` is
optional on `updateNote` and every notegeek client sends it, but a hand-rolled
`updateNote(id, content)` need not, and skipping sanitization in that case
would leave the hole open. When `content` is present and `type` is not, the
resolver reads the stored type first (`findOne({_id, userId}, {type: 1})`).
This is the opposite call from the content-size ceilings a few sections up,
which accept the imprecision rather than pay for a read: a too-generous
ceiling is not a security boundary, and this is.

**The profile is a twin of the client's, on purpose.**
`apps/notegeek/frontend/src/utils/sanitizeNoteHtml.js` carries the same
`ALLOWED_TAGS` / `ALLOWED_ATTR` / `FORBID_TAGS` / `FORBID_ATTR` and the same
link/image hooks. **Change one, change the other** — they are duplicated
rather than shared because they live in different pnpm workspaces with no
common runtime package. `notegeekSanitize.test.js` pins what keeps them
honest: `sanitize(sanitize(x)) === sanitize(x)`, and a real TipTap document
comes back byte-for-byte (including its `rel="noopener noreferrer nofollow"`,
which the hook augments rather than rewrites — otherwise every save would
rewrite the note and the editor's dirty-tracking would never settle).

**Two new dependencies, and why not `isomorphic-dompurify`.** `dompurify`
(pinned `3.4.14`, the same version the notegeek client pins, which is what
makes the two profiles provably identical) and `jsdom` (pinned `26.1.0`).
`isomorphic-dompurify` is those two with a wrapper, but every release new
enough to carry a current DOMPurify declares `engines.node >= 22` and this
service runs on `node:20-alpine`. The jsdom pin is likewise forced, by the
test runner rather than the image: jsdom 27.4+ pulls
`html-encoding-sniffer@6` and 27.0–27.3 pull `cssstyle@5`, both of which reach
an ESM-only package through a CJS `require` — Node handles that from 22.12,
`jest@29`'s module registry does not, and the suite dies at import before a
test runs. 26.1.0 is the last line whose transitive tree is CJS all the way
down. Revisit when this package moves off jest@29. The frontends keep their
own `jsdom@28` devDependency; vitest loads ESM natively.

**Cost at runtime.** The jsdom window and the DOMPurify instance are built on
first use, not at boot, and then reused for the life of the process — most
gateway requests never touch a rich-text note.

---

## Frontend/gateway argument parity (Q59, 2026-09-05)

**The rule: a frontend field with no mutation argument is a bug, not a
preference.** Either the gateway grows the argument or the input comes out of
the form. An editable input that saves nothing is worse than a missing
feature — the user believes the value was stored.

Validation (above) guards the values that arrive. This guards the ones that
never do, and GraphQL is only half-loud about them:

- An **undeclared argument** is a validation error. Loud, fails fast.
- A **key in the `variables` object the document never declared as a `$var`**
  is dropped without a word. The request succeeds and the field is never
  written. flockgeek's `QuickHarvestEntry` shipped `source: "manual"` to
  `recordEggProduction` for the life of the feature; not one record carried
  it. The Add Hatch Event dialog lost `hatchDate` the same way.
- A **`$var` declared and never passed** to the field is the same bug in a
  different place.
- A **field the form collects that the mutation has no argument for at all**
  is where Q59 lived: `updateBird` declared 6 of the 16 fields BirdsPage's edit
  form collects, so Breed, Hatch Date, Species, Strain, Cross, Origin,
  Foundation Stock, Temperament, Status Date and Status Reason were editable
  inputs that changed nothing. Widened 2026-09-05; `createBird` and
  `updateBird` now take the **same field list**, differing only by `id` and by
  whether `tagId` is required, and `flockgeekBirdFieldParity.test.js` fails if
  they drift again or if a GraphQL argument and its zod key stop matching.

None of this is catchable from a frontend test: both sides of a frontend test
are the client, which is exactly how `QuickHarvestEntry.test.jsx` came to
assert a `source` key the server had never once received.

**The tool: `tools/gql-arg-audit.mjs` (`pnpm check:gql`, CI job `gql-audit`).**
It imports every `src/graphql/*/typeDefs.js` — they import nothing but
`graphql-tag`, so no Mongo connection is opened and no merged schema is built —
scans the `gql` literals out of every document in the seven frontend trees, and
fails on `undeclared-variable`, `unused-variable`, `unknown-argument` and
`undeclared-callsite-key`. `DOCS/RUNBOOK.md` has the rule table and the flags.

**Its blind spot, and where that is covered instead.** The tool compares root
field *arguments*; `input: SomeInput!` is one argument and the fields inside it
are invisible — doubly so when the frontend sends `variables: { input: data }`,
a name whose keys are built in another module. That gap hid a live outage:
fitnessgeek's Medications page sent `suggested_indications` inside
`FitnessMedicationInput`, which declared no such field though the output type
and the model both had it, and **every Add and Edit Medication failed** — not
silently, because an unrecognized field on an input-object *variable* is a
coercion error graphql-js raises before the resolver runs, even when the value
is `[]`. The input type now declares it, and
`gatewayInputObjectParity.test.js` coerces the real frontend payloads against
the real merged schema so the next one fails in CI instead of in the app.

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

---

## a11y pass (2026-09-05, TODO_ORDER Q51)

The mobile harness' axe run had basegeek at **2 findings — 0 now**, both
`aria-input-field-name` on `/account`: the six `Select`s in
`packages/ui/src/pages/AccountPage.jsx` (Timezone, Locale, Theme, Date format,
Time format, Start of week) had an `InputLabel` with no `id` and a `Select`
with no `labelId`. MUI does not wire those together on its own — a
`FormControl` without an explicit `id` gives the label no id to be referenced
by, so the control ends up nameless however visible its label looks. Every new
`Select` in this app gets `<InputLabel id="x-label">` +
`<Select labelId="x-label">`.

---

## Going-over 2026-09-05 — `packages/ui` (the admin console)

A read of the whole console — every page, component, hook, the api/apollo
clients and the routing. vitest 94 → 103, lint unchanged at 7 warnings, build
clean, harness 26 scenes 0/0/0 with `--enforce-a11y`.

### Fixed

- **`safeRedirect` had two open-redirect escapes.** The relative-path branch was
  a literal `startsWith('/') && !startsWith('//')`, and a browser does not read
  a URL that literally. A backslash is a slash in every special scheme, so
  `/\evil.example.com` parses as `//evil.example.com`; and ASCII tab/LF/CR are
  *deleted* from a URL wherever they appear, so `/%09/evil.example.com` decodes
  to `/<TAB>/evil.example.com` and collapses to the same thing. Both passed the
  old check, and both left the origin on the one path in this app that follows a
  `?redirect=` from an untrusted link — LoginPage and RegisterPage. The check now
  normalizes (strip tab/LF/CR, backslash → slash) before deciding, and the
  absolute branch parses the normalized value too, which also closes
  `https://clintgeek.com<TAB>@evil.example.com`. The value handed back is still
  the original; the browser applies the same normalization anyway.
  `utils/safeRedirect.js`, `__tests__/utils/safeRedirect.test.js` (12 → 19).
- **Deleting a user had no confirmation.** The trash icon on `UserGeekPage`
  called `DELETE /users/:id` straight from its `onClick`. That is the most
  destructive action in this console — it removes a suite user's `userGeek`
  record across every app, with no undo on the server — and it was the *only*
  destructive action without a dialog, while resetting AI stats, restoring
  defaults and revoking an API key all sit behind a `ConsoleDialog`. It now
  goes through the same dialog, naming the user and saying it cannot be undone.
  `pages/UserGeekPage.jsx`, `__tests__/pages/UserGeekPage.test.jsx` (7 → 10).
- **The Account card's Locale row was always blank** — it read
  `prefsForm.locale`, and `locale` lives on the *profile*, not on preferences,
  so `prefsForm` never has one. Found and left by the test pass that landed
  earlier the same day ("one known quirk the tests caught rather than fixed");
  fixed here. The Theme row on the same card now reads `themeValue` — the mode
  actually in effect — rather than the un-hydrated `prefsForm.theme`.
  `pages/AccountPage.jsx`, `__tests__/pages/AccountPage.test.jsx` (12 → 14).

### Checked and clean

- **API keys are never re-displayed.** The plaintext exists only in
  `createAPIKey`'s response, is held in `newKeyPlaintext` for exactly one
  dialog, and is cleared by `keys/mintedDismissed`. `KeyTable` shows
  `keyPrefix…` and copies the prefix, never a key. `NewKeyDialog` says so on the
  page. Revoke is confirmed (`revokingKey` → dialog), reports its failure as a
  toast and leaves the dialog open, and `keys/revokeClose` resets the spinner —
  no stuck-disabled button on either path.
- **Every other admin action's confirm.** Reset stats, reset config and restore
  defaults each go through `confirm/set` and a dialog; routing deletes and app
  config edits go through `AppConfigDialog`/`ConfirmDialogs`. There is no undo
  anywhere in this console — the confirmations are the undo, which is why the
  `UserGeekPage` gap above mattered.
- **The health proxy fallback.** `BaseGeekHome` seeds `apps` from the hardcoded
  `fallbackApps` list, keeps it when `/apps` fails, and marks every app offline
  on a `/health/app/<name>` failure rather than dropping the tile. Both are
  covered by `BaseGeekHome.test.jsx`.
- `api.js`'s CSRF interceptor reads the cookie fresh per request and skips safe
  methods; `AuthContext`'s cross-tab logout ignores its own broadcast and closes
  the channel on unmount; `RequireAdmin` is chrome over a server gate and says so.

### Left in place, with reasons

- **`pages/Databases.jsx` is an orphan (Q11).** No route in `App.jsx`, no
  import anywhere in `src/` — the mobile harness reports `/databases route not
  present` on every run. Its Mongo browser is a real feature that `DataGeekPage`
  does not duplicate, so whether it is dead code or an unrouted feature is
  Chef's call, not a reviewer's. **Reported only.**
- **`AuthContext`'s provider `value` is rebuilt on every render**, so every
  consumer re-renders on any auth state change. There are five consumers and
  the state changes about twice per session; memoizing it is a change with no
  observable payoff, so it stays.
- **`saveProfile` posts `{...identityForm, ...profileForm}`** — username and
  email go to `updateProfile` along with the profile fields. Whether that is the
  intended contract is a question about `@geeksuite/user` and basegeek's own
  `/api/users/profile`, both outside this package.

---

## Tests (added 2026-09-05)

The admin console (`apps/basegeek/packages/ui`) had no test suite before this
— every other frontend in the suite did. It now has vitest + React Testing
Library, mirroring `apps/fitnessgeek/frontend`'s config exactly (jsdom,
`@geeksuite/ui` aliased to source with the same MUI/React dedupe block, since
this console consumes it from source the same way) and `apps/bookgeek/web`'s
Apollo-mocking pattern (mock `apolloClient` at module level, route by
GraphQL operation name rather than by JS reference — see
`src/__tests__/pages/AIGeekPage.test.jsx`).

Run from this package:

```
cd apps/basegeek/packages/ui
npx vitest run       # or `pnpm test`
npx vitest           # watch mode, or `pnpm test:watch`
```

Coverage, by surface:
- `pages/BaseGeekHome.jsx` — KEY_APPS order, Postgres in Infrastructure, the
  health proxy (`/health/app/<name>`), registry fallback.
- `pages/AIGeekPage.jsx` + `pages/aigeek/*` — the four tabs, `AppsKeysTab`'s
  key list and the "Recommend a free model" flow, `ModelStewardBlock`,
  `TestPromptPanel`. GraphQL is mocked on `apolloClient.query`/`.mutate` by
  operation name (`useAIGeek.js` calls these directly rather than through
  `useQuery`/`useMutation` hooks, so there is no `MockedProvider` to reach
  for); REST (`TestPromptPanel`'s `POST /ai/call`) mocks `../../api`.
- `components/primitives/ResponsiveTable.jsx` — empty/error/data states,
  desktop table vs. mobile card layout.
- `pages/AccountPage.jsx` — mocks `@geeksuite/user` (`useUser`, `useThemeMode`)
  as a module and `@geeksuite/ui`'s `useToast` as a spy (every other
  `@geeksuite/ui` export stays real via `importOriginal`), so a save's
  `notify(...)` call is asserted directly.
- `pages/UserGeekPage.jsx` — load failure/retry, empty state, create/delete
  flows, and that a delete/create failure is a toast rather than an error
  state (it must not blow away a list already on screen).
- `utils/safeRedirect.js` — pure unit tests, no rendering.

One known quirk the tests caught rather than "fixed": `AccountPage`'s avatar
card renders its **Locale** detail row from `prefsForm.locale`, which is
never populated (locale lives on `profileForm`, hydrated from `profile`, not
`preferences`) — the row is always blank. Left as-is; this pass is tests, not
a product fix.

Verify: `npx vitest run` green, `pnpm build && pnpm lint` clean (7 pre-existing
warnings, none new), `node tools/syntax-check.mjs` from the repo root.

---

## Going-over 2026-09-05 — `packages/api` (the gateway and aiGeek)

A senior read of the whole of `apps/basegeek/packages/api` — every route,
resolver, service, model, script and test — against the classes
`DOCS/BURN_REVIEW.md` names. Nothing in this section duplicates a BURN_REVIEW
finding; where one is referenced it is because this pass extends it into a
place it had not reached.

Suite: **53 → 60 files, 1250 → 1338 tests, green before and after**. The seven
new files are `src/__tests__/goingOver{Gateway,AiGeek,Auth,Infra,Outbound,
FitnessGlance,Misc}.test.js`. This package has no `build` or `lint` script; the
verifications are the suite, `node tools/syntax-check.mjs` from the repo root
(839 files, clean) and a real `new ApolloServer({typeDefs, resolvers}).start()`
on the boot path.

### Fixed — the process can die

- **The aiGeek connection had no `error` listener** (Q44, `config/database.js`).
  A mongoose `Connection` is an EventEmitter, and an `error` event with no
  listener is *thrown* by Node — so any post-boot aiGeek fault (auth failure,
  socket reset, replica-set election) took the whole API down with an uncaught
  exception. `models/user.js` and `graphql/shared/appConnections.js` both
  already carried the two handlers; this connection was the odd one out.
- **`GET /api/health/infra` could be used to restart the API** (`server.js`).
  It is public and unauthenticated, and it built a node-redis client with no
  `.on('error')` — same mechanism as above, reachable by anyone, any time Redis
  was down. Its Mongo and Redis clients also skipped `close()`/`quit()`
  whenever the probe itself threw, leaking a pool per failing call. Both now
  close in a `finally`, with the rejection swallowed.
- **`GET /api/redis/status` and `/api/postgres/status`** had the same missing
  listener and, worse, `await client.quit()` / `await client.end()` sitting
  *inside* the catch — a rejecting close escaped as an unhandled rejection and
  the request got no response at all. Admin-gated, so the blast radius was
  smaller; the mechanism was identical.
- **The 500 handler threw inside itself** (`server.js`). It called
  `req.log.error(...)`, but `req.log` is attached by pino-http, which is
  mounted *after* `csrfGuard`, `csrfTokenGuard` and `cors()` — and `cors()`
  rejects a disallowed Origin with `callback(new Error(...))`. Falls back to
  the module logger now, so every error is logged once, from one place.

### Fixed — correctness a user would hit

- **`recordHatchEvent` could never succeed.** `HatchEvent.pairingId` was
  `required: true`; the mutation has never accepted a pairingId, in typeDefs or
  validation, and the Add dialog has no pairing selector. Every create failed
  the required-path validator. The field is now optional (eggs set from a mixed
  flock have no pairing to name) and the mutation takes an **optional**
  `pairingId`, ownership-checked when present, in the shape `createMeatRun`
  already uses. flockgeek's own REST copy still says `required: true` —
  reported for that tree.
- **`POST /api/ai/conversation/message` non-streaming always 500'd.** Its
  `usage` block read two `const`s declared inside the *streaming* branch. Every
  non-streaming call made the provider call, saved the assistant turn, then
  threw a `ReferenceError` — billed, conversation mutated, answer discarded.
- **Reordering a day with a recurring task lost the whole order.** The rendered
  day contains `virtual_<masterId>_<epochMs>` ids and the drag handlers post the
  list verbatim; `TaskOrder.orderedTaskIds` is `[ObjectId]`, and one bad element
  fails the *whole* array cast. `saveDailyOrder` drops the virtual ids — the
  read side could never match them anyway.
- **Regex metacharacters broke three search boxes and were a ReDoS in all
  three.** bookgeek's `books(q:/author:)`, fitnessgeek's `fitnessFoods(search:)`
  and basegeek's `/api/notes?prefix=` all handed raw client text to a regex.
  `Dune (Deluxe`, `C++`, `Oreo (` and `50%+` threw out of mongod and rendered an
  error page; `(a+)+$` pinned a CPU per document. All escaped now (bookgeek's is
  also length-bounded); notegeek's gateway resolver had been doing it correctly
  all along and is the model.
- **`GET /api/notes/tags` was unreachable** — declared below `GET /:id`, so
  express matched the `:id` route first and answered 404 "Note not found".
- **`notes(tag:, prefix:)` silently dropped the `tag` half** — two plain
  assignments to `filter.tags`, the second overwriting the first.
- **A username with a capital letter could not log in.** `email` is declared
  `lowercase: true` so its stored form is the lowered one; `username` is only
  *trimmed*, and login searched `{username: identifier.toLowerCase()}` for it.
  An exact-case clause was added alongside; a non-string identifier is now a 401
  rather than a 500 out of `.toLowerCase()`.
- **The AI-insight window lost its oldest day, every time.**
  `buildUserContext` ran from `subDays(new Date(), n)` to `new Date()` — both
  carrying a time of day — against `log_date`, `Weight.log_date` and
  `BloodPressure.log_date`, all stored at UTC midnight. So
  `fitnessInsightsMorningBrief`, prompted *"based on yesterday's data"* with
  `daysBack: 1`, never matched yesterday's `00:00Z` row and at 07:00 handed the
  coach an empty day. Whole UTC days now, inclusive at both ends. (The
  server-clock half of this is BURN_REVIEW #14 and stays open.)
- **`fitnessInsightsDailySummary` ignored the date it was asked about** —
  `targetDate` reached the prompt string but never the context builder, so
  scrolling back to Tuesday returned the last day's food captioned as Tuesday's.
- **`aiUsage` could only ever return zeros** —
  `getProviderUsageSummary(provider, userId)` was passed the literal `'session'`
  in the userId slot. Same class Q45 fixed on the REST sibling.
- **A `conversationId` was globally unique.** The schema declared field-level
  `unique: true` *and* a compound `{conversationId, userId}` unique; the
  stricter one won, so a caller-chosen id that is not globally unique ("main", a
  per-app constant) worked for the first user and E11000'd for everyone after —
  even though `findOrCreate`'s `findOne` is correctly scoped by userId.
- **`priority: "cost"` did not order by cost.** Two bugs, both in
  `AIGEEK_USAGE.md` now: unpriced models sorted first (string concatenation and
  a `NaN` comparator), and the Groq/Together price rows were per-1K figures in a
  per-1M table. See that document; `analyze-cost` numbers for those two
  providers are 1000× larger than they were, which is the correction.
- **The model catalog re-fetched from every vendor on every director call.**
  The 24h guard measured the oldest row's `createdAt`, which `refreshModels`
  never writes (it upserts `lastChecked`) — so two days after seeding it was
  permanently true and every `/director/*` call fanned out a live vendor
  `models` request per enabled provider, spending quota on a read.
- **A disabled provider was still advertised.** `GET /api/ai/providers` filtered
  on key length alone while `/api/ai/capabilities` filtered the same map on
  `.enabled`.
- **An Anthropic response whose first block is not text threw.** Two of the
  three branches used `.find(b => b.type === 'text')`; the third indexed
  `content[0].text` blind, so a `max_tokens`-truncated turn was a `TypeError`
  rethrown raw — the rotation recorded Anthropic as failed and answered from
  another provider for a response that had already arrived.
- **The free-tier usage row raced itself.** `findOne` → `new AIUsage(...)` →
  `save()` against a unique index: the first two concurrent calls of a day both
  built a row and the loser got E11000, swallowed into a `{success:false}`
  nothing inspected. Get-or-create is an upsert now, and `aiService` logs a
  warning when the write does fail. *(The read-modify-write undercount under
  concurrency is separate and still open — see "Left in place".)*

### Fixed — security

- **A credentialed connection string sat in a git-tracked, published file.**
  `routes/mongo.js`'s fallback `MONGODB_URI` embedded a real-looking datageek
  username and password. Replaced with the credential-free localhost default
  `server.js` already uses. `apps/basegeek/mongodb-init.js` carries the same
  pair and is outside this tree — **reported, and the credential should be
  treated as disclosed and rotated regardless of what happens to that file.**
- **A Gmail message id was a path, not a segment.** `routes/ambient.js` mounts
  `GET /gmail/messages/:id` and the service interpolated the raw param into the
  URL; express decodes `%2F` to a literal `/`, so `..%2F..%2F..%2Fsettings` walked
  out of `/messages/` and reached other Gmail API paths with the caller's own
  OAuth token attached. `encodeURIComponent` on both call sites.
- **`calendarEvents` fetched any URL a caller named.** No scheme check, no host
  check, no cap on how many — an authenticated user could make basegeek GET
  `http://169.254.169.254/…` or two hundred slow hosts back to back, 15s each,
  sequentially. Loopback, link-local, the unspecified address and every
  non-http(s) scheme are refused; the source list is capped at 20. **RFC1918 is
  still allowed on purpose** — a self-hosted ICS feed on the LAN is a real
  calendar. That is a deliberate line, not an oversight.
- **The OAuth token endpoints had no timeout.** `disconnect()`'s revoke call had
  a 5s cap; the token exchange and the refresh had none, so a hung
  Google/Spotify endpoint held an `/api/connections` request open forever — and
  wedged `oauthRefreshJobService`, which awaits these serially for every
  connection due for refresh.
- **50 MB bodies were parsed before any credential check.** `express.json({limit:
  '50mb'})` was app-wide and both AI routers gate *inside* the router, so an
  unauthenticated POST to `/openai/v1/chat/completions` was fully buffered and
  parsed into heap, then run through tiktoken and an md5 of the whole
  conversation. `/openai/v1` and `/api/ai` get an 8 MB parser mounted in front
  (`AI_BODY_LIMIT` overrides); `/graphql` keeps 50 MB, which is what notegeek's
  5 000 000-character mindmap snapshots actually need.
- **Provider errors leaked the provider's words on two more routes.**
  `/call-smart` relayed them at HTTP **200**, and `/conversation/message` in its
  500 body and its SSE error frame. Both go through
  `services/aiFailureEnvelope.js` now — the status changes are documented in
  `AIGEEK_USAGE.md`.
- **The Gemini API key was in the URL query string.** `@geeksuite/logger`'s
  `err` serializer drops `err.config.headers` and `err.request` but deliberately
  keeps `err.config.url`, so Gemini was the one provider credential still
  reaching the logs in the clear on any failure. It travels as `x-goog-api-key`
  now. (The wider claim that Bearer tokens leak is **false** — that serializer
  already handles them; only the URL was exposed.)
- **Boot logged 20 characters of every provider key**, and `POST /api/ai/test`
  logged 12. `config/aiProviders.js`'s `keyHintFor` already defines the only
  fragment of a credential that may leave the process; both sites use it.
- **`POST /api/auth/register` was public and unrate-limited** while `/login` has
  been capped since it shipped, and it did not validate `app` — so registering
  with a typo'd app returned 201 and a session `authenticateToken` then refused
  on every route (403 "Invalid app token"). 10/hour, and an app that is present
  but not ours is a 400. An **absent** app is still fine: several consumer
  proxies and notegeek's frontend omit it.
- **Changing a password did not end any other session.** Refresh tokens live 30
  days and were only ever revoked by family (logout, reuse detection); nothing
  tied one to the credential it was minted against. `User.passwordChangedAt` is
  stamped by the hashing hook, and `rotateRefreshToken` refuses any token whose
  `iat` predates it — truncated to whole seconds, which is a JWT `iat`'s
  resolution, so the session that made the change is not caught by its own
  stamp. `/auth/reset-password` also re-issues the calling session, so the
  person who changed their own password is not logged out by their own action.
  The 1h access token still runs out its clock; that is inherent to a stateless
  JWT and is the bound on the window.
- **`null` could be written into four GraphQL non-null fields.** BURN_REVIEW #7
  fixed this class in bookgeek and did not sweep it into flockgeek
  (`FlockGroup.startDate`, `EggProduction.date`/`.eggsCount`,
  `HatchEvent.setDate`) or notegeek (`Note.content`, `Note.tags`). The update
  resolvers `$set` without `runValidators`, so an accepted null lands in the
  document and every later query on that collection fails the non-null check for
  the whole list. `calendarDateField`/`instantField` grew a `nullable` option —
  defaulting to `!required`, i.e. today's behaviour — passed explicitly as
  `false` for any field whose GraphQL type ends in `!`. **`createNote`'s `tags`
  argument IS nullable by declaration and stays so**; a test pins that, because
  over-correcting there would be a new 400.
- **`/openai/v1`'s `user` field re-admitted an over-long id.**
  `const userId = caller.userId ?? bodyUserId` fell back to the raw body value in
  exactly the case `normalizeUserId`'s 64-character cap had just rejected it —
  and that value lands in `AIUsage.userId`, which the quota groups on.

### Fixed — hygiene that changes behaviour

- `glanceDraft` takes an optional `today: String`. It told the model what day it
  was from the server clock, which is UTC in every container (no image installs
  tzdata — BURN_REVIEW #13), alongside the prompt rule *"if they name today's
  weekday they mean next week's"* — so from 19:00 Central it drafted against
  tomorrow, and the mutation had no argument with which to correct it. **Additive
  and optional**: a client that omits it gets exactly the previous behaviour.
  StartGeek already sends a local `date` to `glanceToday` and should send this
  too — reported for that tree.
- `garminActivities` inside `glanceToday`'s `Promise.all` has a 2s cap. It logs
  in and fetches with no timeout anywhere, `.catch()` covers a rejection but not
  a hang, and that `Promise.all` is what StartGeek's whole front page waits on.
- `searchNotes` is capped at 100 hits. It had no limit at all while projecting
  every matching row's full `content` — 5 000 000 characters for the snapshot
  types — to build a 200-character snippet it then discards for exactly those
  types.
- A duplicate username or email on `PATCH`/`PUT /api/users/profile` is a **409**
  naming the field, not a 500 carrying the raw driver message (index name and
  colliding value included).
- `useNewUrlParser` / `useUnifiedTopology` removed from all five connection
  sites. No-ops since driver v4, removed in the next major, and a deprecation
  warning on every boot and every test run.
- The dead ternary in `draftFrom`'s unknown-kind branch (it could only ever
  choose `'task'`).

### Left in place, with reasons

- **Ownership of a conversation still comes from the body for an API-key
  caller.** `aiRoutes.js:232` reads `caller.userId || req.user.id` and uses it as
  the lookup key for `getConversation`/`getMessagesForAPI`, so a backend key
  naming a victim's id plus a guessed `conversationId` loads that history into
  the prompt. The delete/archive siblings correctly use `req.user.id`. **Not
  fixed**: for a key-authenticated backend `req.user.id` is `apikey_<keyId>`, so
  switching the lookup key would orphan every conversation storygeek and geekPR
  have already stored. It needs a migration decision, which is Chef's.
- **Any authenticated user can mint an API key for any app.**
  `POST /api/api-keys` takes `appName` as a free string (`/^[a-zA-Z0-9_-]+$/`
  only), and `callerIdentity` treats a key's `appName` as the credential's
  answer to "which app is calling". Combined with the deliberate trust that lets
  a key name a user, a non-admin can mint a `storygeek` key and spend another
  user's quota. **Not fixed**: `API_KEYS.md` documents the free-form app name,
  and live keys exist for `codegeek`/`geekpr`, which are not in `VALID_APPS` —
  restricting it is a policy call, not a bug fix.
- **`AIUsage`'s counter update is still a read-modify-write**, so concurrent
  calls can undercount even though the row can no longer fail to exist. A
  correct fix is a single `findOneAndUpdate` with `$inc` plus a pipeline update
  for the minute/hour/day rollovers — a real rewrite of a path with tests, and
  disproportionate to this pass on a single-operator suite.
- **`routes/noteGeek.js` (`/api/notes`) and `models/Database.js` are dead.** The
  first declares its own `Note` model on the **default** connection, so it writes
  into `datageek.notes` where nothing reads them; notegeek's own notes moved to
  the gateway. The second has zero importers anywhere in the repo and declares a
  plaintext `password` field. `src/wasm-backend-init.js` is dead too (its only
  import is commented out). Deleting a feature is a Q22/Q38-class decision —
  **reported**. Its live bugs were fixed in the meantime rather than left armed.
- **`graphql/notegeek/models/Folder.js`** is the only gateway model on the
  default connection, so folders land in `datageek` rather than `noteGeek`.
  Nothing reads it. Same call as above.
- **BURN_REVIEW #14** (the gateway guessing "today" from the server clock) and
  **#13** (`TZ` inert without tzdata) are the root of the remaining date
  softness here and are already tracked.
- **Q49** (no route claims `ai:usage`) and **Q38** (storygeek module deletion)
  left as instructed.
- `lastProviderInfo` is a process-global read across an `await` in
  `openaiProxy.js`, so two concurrent proxy calls can cross-attribute provider,
  model, `finish_reason` and `tool_calls`. The fix is to return that info from
  `callAI` rather than stash it on the singleton — a signature change through
  every adapter, worth doing deliberately rather than at the end of a sweep.

### Reported for other trees

- `apps/flockgeek/backend/src/models/HatchEvent.js` still declares
  `pairingId: { required: true }`. It is a *validator*, not a schema path, so it
  cannot silently drop data — but the two writers now disagree.
- `apps/basegeek/mongodb-init.js` carries the same datageek credential pair that
  was just removed from `routes/mongo.js`.
- StartGeek should pass `today` to `glanceDraft`
  (`localDateString(new Date())`), the way it already passes `date` to
  `glanceToday`.
