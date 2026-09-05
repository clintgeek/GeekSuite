# Burn review — reading 2026-09-05 across the streams

*Adversarial cross-stream review of the ~164 commits pushed to `main` between 11:00 and 16:00 on
2026-09-05 (`be39008..origin/main`), by ~70 streams each verified alone. This is the first read
**across** them. Read-only: no code changed; this file is the only artifact.*

Both escaped regressions came from a runtime path no test imported — a `gql` backtick, and a drifted
gateway model whose missing field mongoose dropped in silence. Both classes were re-swept
mechanically and are closed (see *Checked and clean*). What the sweep found instead is below.

**Provenance is marked.** Several findings are older bugs that today's work moved onto the live path,
or had the chance to fix and mirrored instead. Those say "pre-existing" — worth fixing, not burn
regressions. Seven are genuinely new today and are marked **new**.

---

## Findings

| # | Sev | What | File | Stream |
|---|-----|------|------|--------|
| 1 | **P0** | Any book published before 2000 can no longer be edited at all | `graphql/bookgeek/validation.js:132` | `d5ecb22` **new** |
| 2 | **P0** | `/api/ai/parse-json` takes app identity and userId from the body, ungated | `routes/aiRoutes.js:676` | `92e7bc9` **new (miss)** |
| 3 | **P0** | `CSRF_TOKEN=enforce` (Q18b) logs the suite out within the hour (fixed) | `middleware/csrfToken.js:296` | `a3c4031` **new, latent** |
| 4 | **P0** | flockgeek REST `create` lets the body overwrite `ownerId` | `eggProductionController.js:40` | pre-existing |
| 5 | **P1** | A settings save through the gateway wipes the Garmin credential, both OAuth tokens, and any partial `nutrition_goal` (fixed) | `graphql/fitnessgeek/models/UserSettings.js:46` | pre-existing, now live |
| 6 | **P1** | REST `PUT /api/settings` has two `$set` keys; the Garmin one is discarded (fixed) | `routes/settingsRoutes.js:112` | pre-existing |
| 7 | **P1** | `title: null` is accepted and poisons the row against `Book.title: String!` | `graphql/bookgeek/validation.js:84` | `d5ecb22` **new** |
| 8 | **P1** | Task grouping moved to the UTC day for dates bujogeek stores as instants | `tasks/TaskList.jsx:52` | `1fc8623` **new** |
| 9 | **P1** | REST settings accepts `household.household_id`, which the gateway explicitly refuses (fixed) | `validation/schemas/settings.js:130` | `00ef0b7` **new (mirrored a hole)** |
| 10 | **P1** | A `provider/model` pin silently reroutes to another provider's default model | `routes/openaiProxy.js:432` | `8879e94` |
| 11 | **P1** | The proxy relays upstream provider error bodies verbatim | `routes/openaiProxy.js:723` | `8879e94` |
| 12 | **P1** | `gatewaySchemaLoads` is weaker than the boot path it guards | `__tests__/gatewaySchemaLoads.test.js:11` | `61d3109` |
| 13 | **P1** | `TZ=America/Chicago` is inert in every container — no image installs `tzdata` | `apps/*/Dockerfile` | pre-existing |
| 14 | **P1** | The gateway guesses "today" from the server clock, and the client asks it to (fixed) | `graphql/fitnessgeek/resolvers.js:453` | pre-existing, now live |
| 15 | **P1** | `FitnessFood.serving_size`/`serving_unit` always null → editing a custom food rewrites its serving to 100 g (fixed, gateway + frontend) | `graphql/fitnessgeek/resolvers.js:1138` | pre-existing |
| 16 | **P1** | The household log view is dead twice over (routing shadow, then a variable-type mismatch) | `services/apiService.js:436`, `:222` | pre-existing |
| 17 | **P1** | A request replayed after a token refresh carries the pre-rotation CSRF token (fixed) | `packages/auth/src/authClient.js:441` | `a3c4031` **new** |
| 18 | **P1** | flockgeek update handlers let a caller reassign a record's `ownerId` | `birdController.js:205` +7 | pre-existing |
| 19 | **P1** | `updateFitnessFood` replaces `nutrition` and `serving` wholesale (fixed) | `graphql/fitnessgeek/resolvers.js:883` | pre-existing, latent |
| 20 | **P1** | Four shared packages ship suites CI never runs — three of them today's CSRF packages (fixed) | `.github/workflows/ci.yml` | absent since inception |
| 21 | **P1** | `main` has no required status checks; all 15 CI jobs are advisory | branch protection | never enabled |
| 22 | **P1** | Nothing tests the two classes that caused today's outages (fixed, import/boot half) | (see §22) | structural |

Paths are relative to `apps/basegeek/packages/api/src/`, `apps/fitnessgeek/backend/src/`,
`apps/fitnessgeek/frontend/src/`, `apps/bujogeek/frontend/src/` or `apps/flockgeek/backend/src/` as
context makes obvious; each section gives the absolute path.

---

### 1. P0 — a pre-2000 `publishedDate` blocks every book edit

`/mnt/Media/Projects/GeekSuite/apps/basegeek/packages/api/src/graphql/bookgeek/validation.js:132`
uses `calendarDateField()`, whose floor is `MIN_DATE = 2000-01-01` (`graphql/shared/validation.js:36`).
The edit dialog seeds `publishedDate` from the book (`apps/bookgeek/web/src/App.jsx:1633`) and
**always resends it** (`:1694`).

*Scenario:* changing a rating, tag or review on *Dune* is rejected with `BAD_USER_INPUT: date must be
between 2000-01-01 and 10 years from now` — every metadata edit on a pre-2000 book, i.e. most of a
real library. *Fix:* give `publishedDate` its own floor (a `min` option on `calendarDateField`, or a
dedicated publication-date field with a 1400 floor). *Verified by executing the schema:* `1965-08-01`
and `1999-12-31` reject; `2000-01-01` and `2024-03-05` pass.

**Fixed — see BURN_QUEUE.** `shared/validation.js` grew a `min` option and a `historicalDateField()`
(1000-01-01 floor, same 10-years-out ceiling); `publishedDate` uses it, and every other gateway date
— flockgeek's hatch/set/pairing/harvest days, bujogeek's due dates and habit logs — was checked and
correctly keeps the 2000 scheduling floor.

### 2. P0 — `/api/ai/parse-json` is an unguarded second front door (fixed — see BURN_QUEUE)

`…/src/routes/aiRoutes.js:676` has no `requirePermission(req, res, 'ai:call')` and no `resolveCaller`;
it passes `req.body.config` straight into `aiService.callAI`, which reads `appName`, `userId` and
`useAppConfig` off it (`services/aiService.js:1407-1419`). `/call` does both guards at `:502-541`.

*Scenario:* any authenticated credential — including a key minted with only `ai:models` — POSTs
`{prompt, config:{appName:"storygeek", useAppConfig:true, userId:"<someone else>"}}`, routes through
another app's `AIAppConfig`, and bills that app and that user's quota. *Fix:* add the same
`requirePermission` + `resolveCaller` pair. `92e7bc9` hardened five call sites and missed this one.

**Fixed.** `/parse-json` now runs the same three steps `/call` does, in the same order:
`requirePermission(req, res, 'ai:call')`, `resolveCaller(req, req.body)`, and identity
(`appName`/`feature`/`userId`) stamped onto the config **last**, so nothing in the body survives it;
the `freeOnly` / `useAppConfig` switches are honoured as switches, choosing a mode and never an app.
New `src/__tests__/aiRoutesGates.test.js` — 13 cases, every one sending a body that lies (a caller
authenticated as one app claiming another, spending another user's quota), including one asserting
that `/parse-json` and `/call` refuse an `ai:models`-only key with the same status and code. The rest
of `aiRoutes.js` and `openaiProxy.js` was swept for the same miss: no other route reads app or user
identity out of a body. Two adjacent gaps found and *not* fixed here, filed instead:
`GET /api/ai/usage/:provider` reads `req.query.userId` (any credential can read any user's usage
summary), and eleven admin-shaped routes — `POST /provider`, `/models/:provider/refresh`,
`/reset-stats`, `/cache/clear`, `/summarization`, `/director/seed-*`, `/director/force-refresh` —
mutate suite-wide AI state behind authentication with no permission check at all.

**Both follow-ups closed (Q45).** The count was ten, not eleven, and two of the ten turned out not
to belong in the list: `/director/recommend` and `/director/analyze-cost` mutate nothing, and
StoryGeek's epub pipeline calls the first from a backend, where `requireAdminUser`'s blanket refusal
of API keys would have been an outage dressed as a fix. Those two take `ai:director` — the
permission their GET siblings already use. The remaining eight take `requireAdminUser`; all eight
were dead REST routes whose GraphQL twins (`resetAIStats`, `syncProviderModels`,
`seedDirectorPricing`, `seedDirectorFreeTier`) had been admin-gated all along, so this is the back
door beside the front one, closed. Two reads that had no check either were gated on the way past:
`GET /providers` takes `ai:providers` (an enum entry nothing had ever consulted) and
`GET /models/:provider` takes `ai:models` — both in the default set every mint path grants, so no
deployed key loses anything. `GET /usage/:provider` now takes its user id from the credential like
its `/usage/:provider/:modelId` sibling; `?userId=` is ignored rather than refused, since nothing
in the suite ever sent it. 39 new cases in `aiRoutesGates.test.js`, each asserted from both sides —
a gate that refused everyone would pass a 403-only test. Permissions table for the whole REST
surface in `apps/basegeek/DOCS/AIGEEK_USAGE.md`. Still filed: no route claims `ai:usage`, and
gating one with it would be a breaking change to a permission nothing has been granted.

### 3. P0 (latent) — flipping `CSRF_TOKEN=enforce` logs the suite out (fixed — see BURN_QUEUE)

Six consumer backends proxy `/auth/refresh` and `/auth/logout` to basegeek by replaying the user's
cookies **without** `X-CSRF-Token` — `apps/notegeek/backend/routes/auth.js:128`,
`apps/bujogeek/backend/src/routes/authRoutes.js:95`,
`apps/fitnessgeek/backend/src/routes/authRoutes.js:112`, `apps/storygeek/backend/src/routes/auth.js:79`,
`apps/bookgeek/api/src/routes/authRoutes.js:165`,
`apps/flockgeek/backend/src/controllers/authController.js:168`. The guard exempts only cookie-less
requests (`middleware/csrfToken.js:296,303`); these carry cookies.

*Scenario:* the 1h `geek_token` expires, refresh 403s, and `packages/auth/src/authClient.js:206` reads
403 as session-expired and clears the session — everywhere, within an hour of the flip. Logout has the
same gap, and bookgeek forwards `Cookie` on **login** (`authRoutes.js:43`), so the one call that could
mint a fresh token is blocked too. *Fix:* forward `X-CSRF-Token` in all six proxies and drop the
`Cookie` forward on bookgeek's login/register — **before Q18b**. Nothing is broken today; `report` mode
is doing exactly its job. This is the tripwire under the next queued step.

**Fixed.** All six proxies now build their upstream headers with one shared helper,
`authProxyHeaders()` in `packages/user/src/server/authProxyHeaders.js` (every one of the six already
depends on `@geeksuite/user`), which forwards `Cookie`, `Authorization` and `X-CSRF-Token` exactly as
the browser sent them and deliberately will *not* mint a token out of the replayed cookie jar —
doing so would give every proxied path a standing pass through the check the flip exists to turn on.
bookgeek's `/login` and `/register` no longer replay the caller's cookies at all. Pinned by 14 unit
tests on the helper plus a with-header/without-header pair per proxy path in each of the six
backends, and by a new `csrfToken.test.js` block that runs an originless proxied refresh through
basegeek's real `csrfGuard` + `csrfTokenGuard` under `enforce`: the pair is accepted, the header-less
call is the 403 this finding predicted, and `csrfGuard`'s step-4 "no Origin, no Referer → pass" is
what lets the server-to-server call reach the token check in the first place.

### 4. P0 — flockgeek REST lets the body set the owner (fixed — see BURN_QUEUE)

`/mnt/Media/Projects/GeekSuite/apps/flockgeek/backend/src/controllers/eggProductionController.js:40`
and `birdController.js:51` are `Model.create({ ownerId, ...data })` with `data = { ...req.body }`
(`:17`), so a body `ownerId` wins the spread. The router mounts at `server.js:65`.

*Scenario:* an authenticated flockgeek user POSTs `{"ownerId":"<victim>", …}` and writes records into
another account. *Fix:* spread `data` first and `ownerId` last, or `delete data.ownerId`. Pre-existing
(Feb 2026), in scope because today's flockgeek zod work (`e23559c`) validated the **gateway** mutations
only. Dies with Q22 if that lands as "delete".

**Fixed.** Added `src/utils/ownerFields.js`'s `withoutOwnerFields(body)` — strips `ownerId`,
`owner_id`, `owner`, `userId`, `user_id` and `_id` — and routed both `createEggProduction` and
`createBird` through it before merging `req.body` into the `Model.create(...)` call, closing this
alongside #18 (same helper, same sweep). 12 new tests (2 create-spoofing per controller, 1
update-reassignment per controller for groups/meat-runs, plus 6 unit tests on the helper itself);
flockgeek's 57 baseline auth tests stay green (69 total now).

### 5. P1 — a settings save wipes the Garmin credential and any partial `nutrition_goal` (fixed — see BURN_QUEUE)

**Fixed:** `updateFitnessUserSettings` now flattens the input to dot paths before
`UserSettings.updateSettings` (`flattenSettingsUpdate`, exported from the gateway resolvers), so a
`$set` merges the sub-document instead of replacing it; arrays and the Mixed OAuth token blobs stay
whole values, and the shared schema's encryption hook still fires on the dot-path shape. Pinned by
`__tests__/fitnessgeekSettingsWrites.test.js`.

`…/graphql/fitnessgeek/models/UserSettings.js:46` does `{ $set: updateData }` with nested objects
intact — mongoose leaves them undotted, so MongoDB **replaces the whole sub-document**. Reached from
`graphql/fitnessgeek/resolvers.js:834`. The REST twin dots `garmin` out deliberately, with a comment
saying why (`apps/fitnessgeek/backend/src/routes/settingsRoutes.js:108`, *"avoid replacing nested
objects"*).

*Garmin:* `pages/Settings.jsx:136` sends `garmin:{enabled,username}` with `password` only when retyped,
so toggling Garmin deletes `garmin.password`, `oauth1_token`, `oauth2_token` and `last_connected_at`.
Today's `17e33bb` put a newly-encrypted secret behind this old hazard. *Goals:*
`components/FitnessGoals/AIGoalPlanner.jsx:599` sends `{ nutrition_goal: { enabled: false } }` — one
"Remove Goal" click erases `start_weight`, `target_weight`, `bmr`, `tdee`, `daily_calorie_target`,
`weekly_schedule` and the whole `keto` block. *Fix:* flatten to dot paths inside `updateSettings`, the
way `services/garminConnectService.js:69` already does.

### 6. P1 — REST `PUT /api/settings` builds an object with two `$set` keys (fixed — see BURN_QUEUE)

**Fixed:** the route builds ONE `$set` through a local `flattenForSet()` — every sub-document dotted,
not just `garmin` — and falls back to `$setOnInsert` when nothing writable survives the allow-list.
Pinned by `__tests__/routes/settings.test.js` (“PUT /api/settings write shape”), including a Garmin
password proven encrypted through the schema's update hook.

`apps/fitnessgeek/backend/src/routes/settingsRoutes.js:112` composes
`{ $set: <garmin dot-paths>, ...($setOnInsert), ...({ $set: <other fields> }) }`. The second `$set`
overwrites the first. *Reproduced:* `{garmin:{enabled,username}, theme:"dark"}` yields
`{"$set":{"theme":"dark"},"$setOnInsert":{}}` — the Garmin write is gone whenever the same body carries
`dashboard|theme|notifications|units|ai|nutrition_goal|weight_goal`. *Fix:* merge into one `$set`.

### 7. P1 — `title: null` is accepted and poisons the row

`graphql/bookgeek/validation.js:84` makes `optionalTitleSchema` `.nullable()`; `resolvers.js:327`
writes `{ $set: input }` with no `runValidators`; `typeDefs.js:6` declares `Book.title: String!`.
Clearing the title box sends `title: null` (`App.jsx:1691`), the write succeeds, and that row then
errors out of every subsequent `books` query. *Fix:* drop `.nullable()`. The `$set` path predates
today; the new validation layer explicitly permits null instead of catching it.

**Fixed — see BURN_QUEUE.** `optionalTitleSchema` dropped `.nullable()`: `title` on update is
optional but, when present, a non-empty string. Every `String!`-backed field in bookgeek's typeDefs
was reviewed with it — `CreateBookInput.title`, `saveLibraryFilter`'s `name` and `addBookShelf`'s
`label` are non-null GraphQL arguments whose zod schemas were already non-nullable; the shelf/filter
`id`s are server-generated. `title` was the only hole.

### 8. P1 — bujogeek groups tasks by the UTC day, for dates it stores as instants (fixed — see BURN_QUEUE)

`/mnt/Media/Projects/GeekSuite/apps/bujogeek/frontend/src/components/tasks/TaskList.jsx:52` now returns
`utcDateString(dateString)`, applied to `task.dueDate` and `task.createdAt` (`:63`). But bujogeek
declares both as `instantField()` **deliberately**, so push reminders keep time-of-day
(`graphql/bujogeek/validation.js:25-28,84-85`). The comment above the function — *"Calendar dates are
stored as UTC midnight"* — is true for flockgeek and false for bujogeek.

*Scenario:* a task due 9pm Central groups under tomorrow's heading. *Fix:* use `localDateString` in
`getLocalDate` and correct the comment. The file was rewritten today by `1fc8623` — this is a burn
regression, not an old bug.

**Fixed.** `getLocalDate` now calls `localDateString` (import of `utcDateString` dropped) and the
comment above it explains why dueDate/createdAt are instants, not calendar dates. Grepped the rest of
bujogeek's frontend for `utcDateString` — this was the only call site, so no other spot needed
touching or leaving alone. (`HabitsPage.jsx` builds its day keys with `localDateString`, not
`utcDateString`, for `toggleHabitLog`'s calendar-date `date` arg — out of scope here since it isn't a
UTC-accessor-on-an-instant bug and wasn't part of this finding; the gateway normalizes that arg through
`calendarDateField` regardless of what the client sends, so flagging it as a separate item rather than
asserting it's fine.) Two new tests in `__tests__/components/TaskList.test.jsx`, run under
`TZ=America/Chicago`: a task due 23:30 local groups under that local day (not the next UTC day), and
the `createdAt` fallback does the same; bujogeek's suite is 97 (was 95).

### 9. P1 — REST settings still accepts the household id the gateway refuses (fixed — see BURN_QUEUE)

**Fixed:** `household_id` is gone from the nested zod schema (an attempt is now a 400 naming it) and
`household` is out of the route's `allowedFields`, so `PUT /` drops it exactly as the gateway does —
membership and the share flags stay with `/household/create|join|leave` and `PUT /household`. Pinned
by `__tests__/routes/settingsValidation.test.js` (“PUT /api/settings household hazard”).

`apps/fitnessgeek/backend/src/validation/schemas/settings.js:130` declares `household.household_id`.
`graphql/fitnessgeek/resolvers.js:828` strips `household` with a comment explaining that accepting it
*"let a client silently graft itself onto any household id."* A user PUTs a household code and joins,
bypassing the "leave first" invariant (`settingsRoutes.js:359`); membership grants member enumeration
and shared food-log reads. *Fix:* drop `household_id` and strip `household` from the PUT branch,
mirroring the gateway. Today's zod pass mirrored the hole rather than closing it. Reach is bounded —
`/household/join` already admits anyone holding the 12-hex code.

### 10. P1 — a provider pin silently reroutes to a different model (fixed — see BURN_QUEUE)

`routes/openaiProxy.js:432` skips the catalog 404 for any `provider/model` pin, and
`services/aiService.js:1566,1595` swaps in each fallback provider's `DEFAULT_MODELS` entry. So
`{"model":"anthropic/gpt-4o-mini"}` — or a valid pin whose provider is rate-limited — answers **200**
from a model the caller never named, and is billed for it. Unknown **non-pin** ids correctly 404, so
the conformance audit's headline holds; the pin path is the gap. *Fix:* validate a pin against the
catalog and disable cross-provider fallback on a pinned request.

**Fixed.** Both halves, in `openaiProxy.js`. A `<provider>/<model>` pin is checked against that
provider's catalog before anything is spent — unknown model → the same 404 `model_not_found` a bare id
gets since `8879e94`, naming the provider and the aliases. The check fails *open* on an empty catalog
(`getModels` swallows its own DB errors, so "cannot enumerate" must not become "does not exist"). And
a request that names a concrete model — pinned or a bare catalog id — is now sent with `provider` set
to the model's owner and a new `noFallback` flag, which `aiService.callAI` honours by trying that
provider and stopping: a pin whose provider is rate-limited fails as itself instead of being answered,
and billed, as the next provider's default model. The three `basegeek-*` aliases keep every bit of
their rotation, which is asserted. 4 new cases in `openaiCompat.test.js` (F-22).

### 11. P1 — the proxy relays upstream provider error bodies verbatim (fixed — see BURN_QUEUE)

`routes/openaiProxy.js:723` (and `:546`) put `error.message` into the response; those are built as
`` `Anthropic API error (${status}): ${JSON.stringify(error.response.data)}` `` at
`services/aiService.js:2440` and ten sibling sites. Any `ai:call` key holder receives the provider's
name and its raw error body — org and project ids, quota and entitlement detail, and on a
bad-credential case a vendor-redacted key fragment. *Fix:* log it, return an opaque string and a
request id.

**Fixed.** `openaiProxy.js` maps every upstream failure through one allowlist (`UPSTREAM_FAILURES`):
seven entries, each a fixed message plus a `type`/`code` pair, chosen by the upstream status parsed
out of the error string — nothing of the provider's reaches the caller, not even its name. Statuses
follow OpenAI's: a provider rate limit is the caller's 429 (with `Retry-After`), a provider's
rejection of the request shape is their 400, a bad provider key or a provider 500 is a 502, an
exhausted rotation a 503, an unrecognised failure a bare 500. The provider's body is still written in
full by the redacting logger, and the response message carries the request id that finds that log
line. Applied at all three sites — the non-streaming catch, the pre-first-chunk streaming catch, and
the terminal error frame. 5 new cases in `openaiCompat.test.js` (F-23), each asserting that a
realistic leaky upstream body (org id, project id, key fragment, upstream request id) appears nowhere
in the response. Not covered, and filed: `/api/ai/call` and `/api/ai/parse-json` relay the same
strings on their own (non-OpenAI) envelope.

**Follow-up closed (Q46).** Three sites, not two — `/call` leaked through its catch *and* through
its streaming error frame, which built `{ error: { message: streamError.message } }` by hand. The
allowlist moved out of `openaiProxy.js` into `services/aiFailureEnvelope.js` and both routers import
it, because two copies of one vocabulary is exactly how one of the two drifts back into leaking.
`resolveFailure` does the classifying, the logging and the `Retry-After` / `X-Request-Id` headers;
each router only renders — OpenAI's `{ error: { message, type, param, code } }` on `/openai/v1`,
baseGeek's `{ success: false, error: { message, type, code } }` on the two REST routes. Same status,
same code, same words either way. One entry was added: a `/parse-json` answer that is not JSON is a
502 `invalid_json_response` rather than an anonymous 500, since that is both actionable and
baseGeek's own observation about the answer, not the provider's about itself. `/call`'s old
400-vs-502 heuristic — testing `error.message` for "required" or "Missing" — went with it; it
required reading the string it must not return, and matched nothing that was actually a client
error. 8 new cases in `aiRoutesGates.test.js`, each asserting a realistic leaky body (vendor name,
org id, project id, key fragment, upstream request id) appears nowhere in the response or the SSE
frame.

### 12. P1 — the tripwire is weaker than the boot path it guards

`__tests__/gatewaySchemaLoads.test.js:11` calls `buildASTSchema(typeDefs)`, which never looks at
resolvers. `server.js:430` boots `new ApolloServer({ typeDefs, resolvers })`, which runs
`makeExecutableSchema` and **throws** on a resolver field the schema lacks. One stream renames a
typeDefs field while another edits resolvers the same day, CI is green, and basegeek crash-loops —
exactly the outage this tripwire was written to prevent.

*Proved:* with a bogus `Query.thisFieldDoesNotExistInTypeDefs` resolver, `buildASTSchema` passes and
the boot path throws `…defined in resolvers, but not in schema`. *Fix:* make the tripwire
`await new ApolloServer({ typeDefs, resolvers }).start()`. Today's schema passes the stricter build —
verified — so this is a one-line hardening, not a fire.

**Fixed — see BURN_QUEUE.** The tripwire now builds the real `new ApolloServer({ typeDefs, resolvers })`
and `await`s `start()`/`stop()` (`@graphql-tools/schema` is only transitive here and does not resolve;
`@apollo/server` is the boot path anyway), plus a negative test that a resolver field the schema does
not declare makes it throw — proved: the old `buildASTSchema` built cleanly with that bogus map
present, the new one throws `Query.thisFieldDoesNotExistInTypeDefs defined in resolvers, but not in
schema`.

### 13. P1 — `TZ=America/Chicago` is inert in every container

Every compose file sets `TZ=America/Chicago` (`apps/basegeek/docker-compose.yml:8,26,42,55,73`;
`apps/fitnessgeek/docker-compose.yml:17`; six more apps), every prod stage is `node:20-alpine`
(`apps/basegeek/Dockerfile:23`, `apps/fitnessgeek/Dockerfile:26`), and **no image installs `tzdata`** —
zero hits repo-wide. Alpine ships no zoneinfo, so Node falls back to UTC and the TZ line does nothing.

This is currently load-bearing in a bad way: it is *why* the gateway and the fitnessgeek backend agree
on which day a food log belongs to. Fix findings 14 and (a) first; then either add
`RUN apk add --no-cache tzdata` or delete the TZ lines and make UTC explicit — but changing this alone
shifts every server-clock date by six hours. *File facts verified by grep; the runtime fallback is
inference — confirm with `docker run --rm -e TZ=America/Chicago node:20-alpine node -e
"console.log(new Date().toString())"` (not run here: no docker).*

### 14. P1 — the gateway guesses "today" from the server clock, and the client asks it to (fixed — see BURN_QUEUE)

**Fixed:** `dailySummary` and `refreshDailySummary` now go through `requireCalendarDate()` and throw
rather than default; `services/apiService.js` sends `localDateString()` for `/summary/today`,
`/summary`, a literal `/summary/today/refresh` and `/insights/daily-summary` with no date. Pinned by
`__tests__/fitnessgeekFoodLogWrites.test.js` (“per-day reads require the caller’s date”). The
remaining server-clock reads called out here — `routes/goalRoutes.js:165,174` and `resolvers.js:516`
(the weekly plan's `todayIndex`) — are untouched and still open.

`graphql/fitnessgeek/resolvers.js:453` (same shape at `:636`, `:790`, `:804`) does
`format(new Date(),'yyyy-MM-dd')` — the *server's* day. It is genuinely reached:
`services/apiService.js:444,447` map `/summary/today` and `/summary` to `dailySummary` with **no
`date` variable**, called from `components/Dashboard/AIInsightsCard.jsx:65,74`.

*Scenario:* between 19:00 and midnight Central the insights card asks for the next UTC day and gets an
empty ring. `routes/goalRoutes.js:165,174` and `resolvers.js:516` have the same shape for the daily
calorie target and the Garmin day-fetch. *Fix:* send `localDateString()` from the client
(`fitnessGeekService.js:10 toApiDate` already does elsewhere) and make the no-date resolver branch an
error rather than a guess.

### 15. P1 — `FitnessFood.serving_size` / `serving_unit` are always null (fixed)

**Fixed (gateway half):** `FitnessFood` now has `serving_size` / `serving_unit` field resolvers over
`serving.{size,unit}`, so the six live documents that select them get real values. Pinned by
`__tests__/fitnessgeekFoodLogWrites.test.js` (“FitnessFood exposes the serving it actually stores”).

**Fixed (frontend half, 2026-09-05):** `pages/MyFoods.jsx` now reads `food.serving_size` /
`food.serving_unit` and `editingFood.id ?? editingFood._id` (same fix on delete and the list key), and
`handleEditSubmit` sends only the nutrition macros that actually changed — `apiService.js`'s PUT
`/foods/:id` route now runs through a dedicated `normalizeFoodUpdateInput` so an unedited macro is
left alone instead of zero-filled the way `addFitnessFood`'s creator-side normalizer does. The same
`_id`/`serving.size` misreads, all against gateway results, were also live in `matcherService.js`,
`pages/Medications.jsx`, `components/FoodLog/SaveMealDialog.jsx`, and
`components/FoodSearch/FoodSearch.jsx`, and were fixed alongside it. Pinned by
`services/__tests__/fitnessGeekServiceFoodWrites.test.js`.

`graphql/fitnessgeek/typeDefs.js:236` declares them flat; the shared factory stores `serving.size` /
`serving.unit`; `resolvers.js:1138` maps only `id`. Six live documents select them
(`services/apiService.js:46,50,58,62,71,87`). `pages/MyFoods.jsx:80` pre-filled the edit dialog from
`food.serving?.size || 100` — and `serving` is not a field on the type — so **every custom-food edit
rewrote its serving size to 100 g**. The same page passed `editingFood._id` (`:95`), which the
GraphQL row does not carry, so the save issued `PUT /foods/undefined` and CastErrors first.

### 16. P1 — the household log view is dead twice over (fixed — see BURN_QUEUE)

`services/apiService.js:436` returns `GET_FOOD_LOGS` for anything starting `/logs/`, swallowing
`/logs/household` before the intended branch at `:450`, so `HouseholdLogView.jsx:61` issues
`GetFoodLogs(date: "household")` and the `Date` scalar throws. Behind it, `apiService.js:222` declares
`$date: Date!` while `graphql/fitnessgeek/typeDefs.js:616` declares `date: String!` — a hard validation
error the moment the routing is fixed. *Fix:* move the `/logs/household…` branches above `:436` and
change the variable to `$date: String!`. Pre-existing since `471cb79` (2026-03-22) — the feature has
never worked. This was the **only** document error in 159 (see *Checked and clean*).

**Fixed.** Both household branches (bare `/logs/household` → `GetFitnessHousehold`, and
`/logs/household/:memberId/:date` → `GetHouseholdMemberLogs`) now come before the generic
`base.startsWith('/logs/')` catch-all — the bare form was swallowed the same way and needed the same
reordering, not just the `:memberId/:date` one. `GetHouseholdMemberLogs`'s `$date` is now `String!`,
matching the gateway's typeDefs. The dead duplicate `/logs/household/` branch further down (already
unreachable once the shadow was in place) and the never-matching `/logs/ household/` (space typo)
branch were removed. 4 new tests in
`src/services/__tests__/apiServiceHouseholdLogs.test.js` pin the operation name and variable shape for
both household routes and confirm a plain `/logs/:date` still reaches `GetFoodLogs`; fitnessgeek
frontend's suite is 31 (was 27).

### 17. P1 — a post-refresh replay carries the pre-rotation CSRF token (fixed — see BURN_QUEUE)

`packages/auth/src/authClient.js:441` sets the header only `if (!config.headers[name])`; the retries at
`:486` and `:510` reuse the original headers, while `routes/auth.js:46` rotates `geek_csrf` on every
refresh. Under `enforce`, the recovery retry 403s. *Fix:* always overwrite `X-CSRF-Token` in the
request interceptor.

**Fixed.** The interceptor now calls `applyCsrfHeader(config)`, which clears any case-variant of the
header already on the config and re-reads the cookie, so the replay at `:486`/`:510` — which re-enters
this same interceptor via `axiosInstance(originalRequest)` — carries the post-rotation value, or
nothing at all if the session no longer has a token. Six new tests in
`packages/auth/src/__tests__/csrfHeaders.test.js` cover the replay, the case-variant, the
logged-out replay, an AxiosHeaders-shaped bag and a POST→GET reuse; the old
"does not clobber a header a call site set deliberately" test was inverted, since it encoded the bug.
`packages/api-client`'s Apollo link was checked and already spreads `csrfHeaders()` *last*, so it has
never had this problem; startgeek reads the cookie inline per call and makes no refresh call at all.

### 18. P1 — flockgeek update handlers allow owner reassignment (fixed — see BURN_QUEUE)

`birdController.js:205`, `eggProductionController.js:123`, `healthRecordController.js:110`,
`locationController.js:91`, `hatchEventController.js:140`, `groupController.js:123`,
`pairingController.js:97`, `meatRunController.js:72` spread raw `req.body` into the update. The filter
is owner-scoped, so this is self-transfer rather than theft. *Fix:* strip `ownerId`/`_id` before the
spread. Pre-existing; dies with Q22.

**Fixed.** All eight update handlers now build their update document from
`withoutOwnerFields(req.body)` (see #4 — same helper, one sweep) instead of raw `req.body`; the
owner-scoped `{ _id, ownerId }` filter was already correct and is unchanged, so a foreign record still
404s. Regression tests added on `birdController`/`eggProductionController` (body `ownerId` on update is
ignored, record stays with its original owner) and on `groupController`/`meatRunController` (same
assertion, since those two didn't yet have dedicated route test files exercising update); the other
four handlers (`healthRecordController`, `locationController`, `hatchEventController`,
`pairingController`) share the identical helper and pattern but don't have route test scaffolding of
their own yet — a follow-up, not a gap in the fix. flockgeek's 57 baseline auth tests plus these are
69 total, all green.

### 19. P1 (latent) — `updateFitnessFood` replaces `nutrition` and `serving` wholesale (fixed — see BURN_QUEUE)

**Fixed:** the mutation writes `nutrition.<key>` for the keys the client actually sent and
`serving.size` / `serving.unit` only when supplied, so a calories-only edit keeps the other six
macros and a unit-only edit keeps `serving.size`. Pinned by
`__tests__/fitnessgeekFoodLogWrites.test.js` (“updateFitnessFood is a partial patch”).

`graphql/fitnessgeek/resolvers.js:883` builds both as nested literals. A partial `NutritionDataInput`
loses the six sibling macros to schema defaults (`0`), and a `serving_unit`-only edit deletes
`serving.size` — a `required, min: 0.1` path, with update validators off. Latent only because today's
`normalizeFoodInput` (`apiService.js:347`) always fills every key. *Fix:* dot the two sub-objects, and
only for keys actually supplied.

### 20. P1 — four shared packages ship suites CI never runs *(fixed — see BURN_QUEUE)*

`ci.yml` has jobs for `@geeksuite/ui`, `utils` and `crypto-vault`, and none for `@geeksuite/auth`,
`@geeksuite/user`, `@geeksuite/api-client` or `@geeksuite/logger` — all four of which have real `test`
scripts (`csrfGuard.test.js`, `csrfHeaders.test.js`, `authLink.test.js`, `logger.test.js`). Three of
the four are precisely the packages today's cross-cutting CSRF work touched (`a3c4031`, `d8521eb`), and
the fourth is the brand-new logger (`61997ed`). A CSRF regression in `authClient` ships with a green
CI. *Fix:* add four jobs mirroring `test-utils` (`ci.yml:168`).

**Fixed:** added `test-api-client`, `test-auth`, `test-logger`, `test-user` to `ci.yml`, each
mirroring `test-utils` (checkout, pnpm/node setup, frozen install, run the package's test
command). All four ran green locally before landing: api-client 4/4, auth 17/17, logger 7/7,
user 68/68 — no `continue-on-error` needed.

### 21. P1 — `main` has no required status checks

`DOCS/CICD.md:102-107` says `test-*`, `lint` and `docker-build-changed` are required. Branch protection
returns 404 (not protected), `ci.yml` has zero `needs:` and no aggregation job, so all 15 jobs are
advisory and a red suite cannot block a merge. *Fix:* enable required checks on `main`, or correct
CICD.md. *Reported from a `gh api` query; Chef can confirm in the repo settings UI.*

### 22. P1 (structural) — nothing tests the two classes that caused today's outages *(fixed — see BURN_QUEUE)*

**Fixed (import/boot half):** added a `boot-smoke` CI job (`tools/boot-smoke.mjs`, `pnpm
check:boot`) that `await import()`s the app-building module of each of the seven backends
with a fake `KEY_VAULT_SECRET` and fake, never-listening Mongo URIs — this is the class the
syntax gate and `gatewaySchemaLoads` can't see: a module that parses but fails at *import
time* (a missing export, a bad workspace path, a CJS/ESM interop error), or a service that
boots without a required env var. Three of the seven backends (bujogeek, fitnessgeek,
storygeek) already have a dedicated `app.js` split from `server.js` for exactly this
importability; the other four (flockgeek, notegeek, bookgeek, basegeek) have no such split and
no `SKIP_LISTEN`-style guard, so each falls back to the deepest available substitute (routers,
or basegeek's `graphql/index.js`) with its coverage gap documented in `DOCS/RUNBOOK.md` §5 and
in the script itself — none of the four fallbacks reach their app's inline routes/REST surface
in full. Ran clean locally (7/7). **Still open** — this task's scope did not touch these: the
frontend-GraphQL-document-vs-gateway-schema CI job, the parity suites' blindness to a field
missing from both sides, `QuickHarvestEntry.test.jsx`'s unfalsifiable mock, and the gateway
boot tripwire itself (finding 12, a separate lane).

- **No test validates a frontend GraphQL document against the gateway schema.** The fitnessgeek
  food-log suite's own header
  (`apps/fitnessgeek/frontend/src/services/__tests__/fitnessGeekServiceFoodLogWrites.test.js:12`) claims
  such a static check exists, *"see `DOCS/SUITE_TODO.md` item 2"* — **it does not**; that item is the
  REST-route deletion. bookgeek's (`apps/bookgeek/web/src/__tests__/graphql/profileOperations.test.js:83`)
  asserts `print(doc).toContain(field)` — it checks the document contains the fields the document
  contains. The ~40-line sweep written for this review found the one real error across 159 documents
  with zero false positives and needs no database. It should be a CI job.
- **The parity suites are blind to a field missing from *both* sides.** `sharedSchemaParity` and
  `fitnessgeekSchemaParity` are genuinely excellent — path-for-path, both directions, types, defaults,
  bounds, indexes, with a control proving strict mode drops an undeclared path — but every assertion's
  ground truth is the factory itself. `net_carbs_grams` was invisible to that shape, and so are
  findings 15, 19 and P2 (a). The missing test takes a resolver's actual update payload and asserts
  every key survives `castUpdate`.
- **One suite is genuinely unfalsifiable:** `apps/flockgeek/frontend/src/__tests__/components/QuickHarvestEntry.test.jsx:15`
  replaces `useMutation` wholesale and never inspects the document, so a renamed mutation, a wrong
  field, or a regression from `localDateString()` back to `toISOString()` all pass (`71066ba`, today).
- **The gateway boot tripwire** does not run the boot path — finding 12.

---

## P2

- **(a)** `graphql/fitnessgeek/resolvers.js:925,980` write `updated_at`; both models' timestamp key is
  `updatedAt`, so mongoose strips it (the `net_carbs` mechanism; benign today because the plugin stamps
  `updatedAt` anyway). — `79b1b57`, `1457a7d`
- **(b)** `resolvers.js:929` — `findOneAndUpdate` without `runValidators`, so the `meal_type` enum and
  `servings` `min 0.1 / max 100` are no longer enforced; the deleted REST route used `save()` and 400'd. — `79b1b57`
- **(c)** BP dates render one day early west of UTC and the "time" column is always 7:00 PM —
  `components/BloodPressure/BPLogList.jsx:35,44` renders a UTC-midnight value with plain
  `toLocaleDateString`/`toLocaleTimeString`; `BPReport.jsx:50` reads a **local** weekday off it, so every
  reading lands in the wrong ISO week. Both files were touched today without being fixed.
- **(d)** `graphql/glance/askService.js:363` slices bujogeek's instant `dueDate` to a UTC day, so the
  model is told a 21:00-Central task is due tomorrow (`:426` `updatedAt` is the same class).
- **(e)** `resolvers.js:1106,1113` — `copyFoodLogs` is the only pair of food-log date sites that skip
  `toUtcMidnight`; missed by `0cecb4a`.
- **(f)** `pages/Medications.jsx:72` differences a UTC-midnight `supply_start_date` against a local
  `new Date()`, so "days remaining" ticks down at 19:00 Central.
- **(g)** `NutritionData.calories_per_serving` and `FitnessFood.is_verified` have no backing path and
  always resolve null (`typeDefs.js:203,240`); `refreshDailySummary { date }` returns epoch millis
  (`resolvers.js:791`). No caller reads any of the three today.
- **(h)** Per-key AI routing is advisory: a pin sets `useAppConfig = false` (`aiService.js:1436`) and the
  proxy has no allowlist, so any `ai:call` key can pin any configured paid provider. — `6c39d00`
- **(i)** Ungated process-wide AI routes: `POST /provider` (`aiRoutes.js:744`), `/reset-stats` (`:1204`),
  `/cache/clear` (`:1597`), `/summarization` (`:1617`), `/director/seed-*` (`:1045`). Pre-existing, but
  `92e7bc9` widened the blast radius by minting service keys.
- **(j)** `GET /openai/v1/models` is gated by `ai:call`, not `ai:models` (`openaiProxy.js:294`) — the
  dedicated permission is inert. Post-header stream errors end with `data: [DONE]` at HTTP 200
  (`:641`), so a raw-SSE client reads a failed stream as a clean truncation; genuine provider failures
  do return a real 5xx.
- **(k)** A plausible API-key literal sits in a git-tracked, GitHub-public fixture —
  `tools/mobile-harness/apps/basegeek/aigeek.mjs:145`. Almost certainly synthetic (everything around it
  is fixture data) but indistinguishable by inspection. **Unverified** — check it against the AIGeek
  `apikeys` collection, and replace it with an obviously fake token either way. — `363a820`
- **(l)** `scripts/mint-api-key.js:236` has no gitignore check on `--write-env`.
- **(m)** basegeek's Garmin read path (`resolvers.js:329`) has no decrypt-failure warning; fitnessgeek
  warns explicitly at `garminConnectService.js:34`. Mirror it.
- **(n)** `apps/fitnessgeek/backend/src/app.js:197` — the dev `/graphql` proxy strips the CSRF header
  (production unaffected; nginx routes `/graphql` straight to basegeek). `server.js:138` mounts the CSRF
  guard before `cors()` at `:140`, so an `enforce` 403 reaches the browser as an opaque network error.
- **(o)** `bookAiStatus` returns a provider **count** (`graphql/bookgeek/resolvers.js:287`) — a coarse
  entitlement signal with no client use — and a hardcoded `model: "basegeek-rotation"` (`:301`) the
  settings pane renders as if live. No key material, prefixes or provider list.
- **(p)** bookgeek's Kindle email can never be cleared (`App.jsx:1096` sends `null`; `resolvers.js:349`
  only acts on a string); a cleared star rating is silently ignored (`App.jsx:1713`).
- **(q)** `apps/bookgeek/api/src/server.js:868,1186,1261,732` — the four book write/query routes were
  skipped by the REST validation pass while the routes around them got schemas. Scope gap. — `605c99c`
- **(r)** `validation/schemas/weight.js:47` hand-syncs `max(1000)` because
  `packages/schemas/fitnessgeek/weight.js` exports no `weightBounds` — the one validator in the set that
  can drift. Blood pressure and medication import theirs properly.
- **(s)** Q39 confirmed: `packages/schemas/fitnessgeek/nutritionGoals.js:182` treats sugar/sodium as a
  ceiling, `:209` as a floor, so hitting your sodium limit exactly reads as 100% "progress". Both
  methods have zero non-test callers.
- **(t)** `settingsUpdateSchema` is `.strict()` and omits `influxEnabled` and `healthBaselines`, which
  `FitnessUserSettingsInput` accepts — REST 400s on a write the gateway performs happily.
- **(u)** `apps/basegeek/Dockerfile:16` is the only live app image whose `pnpm install` lacks
  `--frozen-lockfile`. Every other Dockerfile and all 15 CI install steps have it.
- **(v)** `.github/workflows/mobile-harness.yml:59` still carries a comment saying the step is
  "Report-only until the probe findings from 2026-09-05 (698 …) are burned down" — the
  `continue-on-error` is gone and every app is at 0, so the comment is stale and should be deleted.
  (Downgraded from the reviewing agent's P1: the board records this workflow green and enforcing since
  14:54.) — `363a820`
- **(w)** `DOCS/CONTEXT.md:107-113` still lists `packages/api-client`, `startgeek/src/lib/graphql.js` and
  `basegeek.js` as CSRF "still to do"; all three send the header as of `d8521eb`.
  `apps/fitnessgeek/DOCS/CONTEXT.md:113` still describes `DEPLOY.md` as saying `KEY_VAULT_SECRET` is
  "basegeek only"; `DEPLOY.md:73` now says shared. (R73's lane.)
- **(x)** bookgeek's `Book` collection has **no owner field at all**, so any authenticated suite user can
  read and mutate the whole library through the gateway. Correct for a single-user library and unchanged
  today — flagged only so the choice is explicit, since `Profile` *is* per-user.
- **(y)** API-key rate limiting is a non-atomic read-modify-write (`models/APIKey.js:166`) with
  server-local `getHours()` window resets; concurrent requests can overshoot.
- **(z)** `apps/storygeek/frontend/src/pages/Settings.jsx:56` — `load` is a `useCallback` keyed on state
  it writes; a guard stops it after one extra pass today, but it is one edit from a loop.

---

## Checked and clean

Swept mechanically, not eyeballed:

- **The backtick class is closed.** All nine `graphql/*/typeDefs.js` parse; `node --check` passes over
  every gateway module; `graphql/index.js` imports all nine, so `gatewaySchemaLoads` does reach every
  module; no `${` interpolation in any gql template. `tools/syntax-check.mjs` is honest about its one
  exclusion (`.jsx`, covered by Vite).
- **All 159 frontend GraphQL documents validate against the real merged gateway schema** — bookgeek,
  bujogeek, notegeek, flockgeek, fitnessgeek, storygeek and basegeek-ui. One error, finding 16.
- **The boot-path schema build succeeds** — `new ApolloServer({typeDefs, resolvers}).start()` runs clean.
- **ESM/CJS boundary holds.** All nine `@geeksuite/schemas` subpaths resolve from real Node ESM in both
  consumer apps with named imports intact (the CJS files use a literal `module.exports = {…}` precisely
  so `cjs-module-lexer` can read them, and say so). `@geeksuite/utils` and `/dates` export the same
  seven helpers. No CJS file imports the ESM-only package. fitnessgeek's jest runs real ESM with
  `transform: {}`, so the boundary is genuinely exercised.
- **The 21-dependency drop (`3bafe54`) broke nothing.** Every bare import in all seven backends is
  declared, and every shared package declares its own runtime deps (`@geeksuite/logger` owns
  pino/pino-http/pino-pretty; `@geeksuite/auth`'s only `axios` reference is a JSDoc type).
- **New env vars.** `KEY_VAULT_SECRET` is the only one production needs, and it is in
  `apps/fitnessgeek/backend/env.example`, `DEPLOY.md:73`, `apps/fitnessgeek/DOCS/CONTEXT.md` and the
  board's deploy-prerequisite line. The only other `process.env` reads added today are
  `SYNTAX_CHECK_DIR`, `SYNTAX_CHECK_CONCURRENCY` and `PLAYWRIGHT_MODULE` — dev tooling.
- **`net_carbs_grams` is present and accumulated** in the gateway `DailySummary` — `0cecb4a` closed it.
- **No index or `unique` changed in the consolidation.** All nine pairs diffed against their
  pre-consolidation copies on both sides: every index, `unique` and `sparse` carried through unchanged,
  including `foodItem.barcode`. **No pair requires a coordinated two-app deploy** — nothing moved.
- **Ownership.** No REST route in any of the seven backends takes ownership from `req.body` except
  flockgeek (4, 18). Zero `.passthrough()`; every new zod schema is `.strict()`; no schema declares
  `userId`/`user_id`/`ownerId`. Gateway owner-stripping is structural — no input type declares an owner
  field and every mutation stamps `user.id` last.
- **Garmin at rest.** Every write path encrypts through
  `packages/schemas/fitnessgeek/userSettings.js:466` (save, `findOneAndUpdate`, `updateOne`,
  `updateMany`, `replaceOne`, dotted and nested); both read paths decrypt; `GarminSettings` never
  exposes `password`; the REST GET deletes it. `safeDecrypt` returns **null** and warns — it does not
  return the ciphertext — so "ciphertext posted to Garmin" cannot happen. The backfill writes through
  the raw collection, so it cannot double-encrypt.
- **crypto-vault, the mint script, `callerIdentity`, `requireAdminUser`, storygeek's
  `requireStoryOwner`, the household guards, `copyFitnessMeal`'s share checks, timing-safe CSRF
  comparison, CORS `allowedHeaders`** — read and clean. No `.env*` file is tracked in git.
- **`packages/utils/src/dates.js` is correct** — the calendar/instant split is clean, no
  `getTimezoneOffset` arithmetic, 36/36 tests pass including UTC−12/+14, the Kolkata half-hour boundary
  and both DST transitions. The five fitnessgeek `toUtcMidnight` copies and the gateway's are now one
  implementation building identical UTC-midnight ranges, so a food log written through the gateway and
  read through REST lands on the same day. All flockgeek consumers use the right half.
- **The REST deletions stranded no caller.** No fitnessgeek or bookgeek frontend call site reaches a
  deleted path; every surviving `restClient` target still exists.
- **bookgeek Profile and Book models are field-identical** across the two copies, and every key in the
  `saveLibraryFilter` / `addBookShelf` `$push` sub-documents exists on the schema.
- **Skip markers: four in the whole repo, none added today**, each with a doc-comment. Zero `.only(`,
  zero `.todo`, zero live `it.failing`. No `continue-on-error`, `|| true` or swallowed failure in any of
  the three workflows, and no second `pnpm --filter X <builtin>` install-alias landmine.
- **The 15s storygeek timeout is not masking a loop.** 39/39 pass in 69s, slowest test 3.86s; both named
  render loops are fixed and no storygeek effect still depends on an object rather than an id.

---

*R72 — read-only review, 2026-09-05. Seven findings are new today: 1, 2, 3, 7, 8, 9, 17. Everything
else is older code that today's work moved onto the live path, or a structural gap in the guards.*
