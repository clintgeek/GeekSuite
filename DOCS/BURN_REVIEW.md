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
| 3 | **P0** | `CSRF_TOKEN=enforce` (Q18b) logs the suite out within the hour | `middleware/csrfToken.js:296` | `a3c4031` **new, latent** |
| 4 | **P0** | flockgeek REST `create` lets the body overwrite `ownerId` | `eggProductionController.js:40` | pre-existing |
| 5 | **P1** | A settings save through the gateway wipes the Garmin credential, both OAuth tokens, and any partial `nutrition_goal` | `graphql/fitnessgeek/models/UserSettings.js:46` | pre-existing, now live |
| 6 | **P1** | REST `PUT /api/settings` has two `$set` keys; the Garmin one is discarded | `routes/settingsRoutes.js:112` | pre-existing |
| 7 | **P1** | `title: null` is accepted and poisons the row against `Book.title: String!` | `graphql/bookgeek/validation.js:84` | `d5ecb22` **new** |
| 8 | **P1** | Task grouping moved to the UTC day for dates bujogeek stores as instants | `tasks/TaskList.jsx:52` | `1fc8623` **new** |
| 9 | **P1** | REST settings accepts `household.household_id`, which the gateway explicitly refuses | `validation/schemas/settings.js:130` | `00ef0b7` **new (mirrored a hole)** |
| 10 | **P1** | A `provider/model` pin silently reroutes to another provider's default model | `routes/openaiProxy.js:432` | `8879e94` |
| 11 | **P1** | The proxy relays upstream provider error bodies verbatim | `routes/openaiProxy.js:723` | `8879e94` |
| 12 | **P1** | `gatewaySchemaLoads` is weaker than the boot path it guards | `__tests__/gatewaySchemaLoads.test.js:11` | `61d3109` |
| 13 | **P1** | `TZ=America/Chicago` is inert in every container — no image installs `tzdata` | `apps/*/Dockerfile` | pre-existing |
| 14 | **P1** | The gateway guesses "today" from the server clock, and the client asks it to | `graphql/fitnessgeek/resolvers.js:453` | pre-existing, now live |
| 15 | **P1** | `FitnessFood.serving_size`/`serving_unit` always null → editing a custom food rewrites its serving to 100 g | `graphql/fitnessgeek/resolvers.js:1138` | pre-existing |
| 16 | **P1** | The household log view is dead twice over (routing shadow, then a variable-type mismatch) | `services/apiService.js:436`, `:222` | pre-existing |
| 17 | **P1** | A request replayed after a token refresh carries the pre-rotation CSRF token | `packages/auth/src/authClient.js:441` | `a3c4031` **new** |
| 18 | **P1** | flockgeek update handlers let a caller reassign a record's `ownerId` | `birdController.js:205` +7 | pre-existing |
| 19 | **P1** | `updateFitnessFood` replaces `nutrition` and `serving` wholesale | `graphql/fitnessgeek/resolvers.js:883` | pre-existing, latent |
| 20 | **P1** | Four shared packages ship suites CI never runs — three of them today's CSRF packages | `.github/workflows/ci.yml` | absent since inception |
| 21 | **P1** | `main` has no required status checks; all 15 CI jobs are advisory | branch protection | never enabled |
| 22 | **P1** | Nothing tests the two classes that caused today's outages | (see §22) | structural |

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

### 2. P0 — `/api/ai/parse-json` is an unguarded second front door

`…/src/routes/aiRoutes.js:676` has no `requirePermission(req, res, 'ai:call')` and no `resolveCaller`;
it passes `req.body.config` straight into `aiService.callAI`, which reads `appName`, `userId` and
`useAppConfig` off it (`services/aiService.js:1407-1419`). `/call` does both guards at `:502-541`.

*Scenario:* any authenticated credential — including a key minted with only `ai:models` — POSTs
`{prompt, config:{appName:"storygeek", useAppConfig:true, userId:"<someone else>"}}`, routes through
another app's `AIAppConfig`, and bills that app and that user's quota. *Fix:* add the same
`requirePermission` + `resolveCaller` pair. `92e7bc9` hardened five call sites and missed this one.

### 3. P0 (latent) — flipping `CSRF_TOKEN=enforce` logs the suite out

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

### 4. P0 — flockgeek REST lets the body set the owner

`/mnt/Media/Projects/GeekSuite/apps/flockgeek/backend/src/controllers/eggProductionController.js:40`
and `birdController.js:51` are `Model.create({ ownerId, ...data })` with `data = { ...req.body }`
(`:17`), so a body `ownerId` wins the spread. The router mounts at `server.js:65`.

*Scenario:* an authenticated flockgeek user POSTs `{"ownerId":"<victim>", …}` and writes records into
another account. *Fix:* spread `data` first and `ownerId` last, or `delete data.ownerId`. Pre-existing
(Feb 2026), in scope because today's flockgeek zod work (`e23559c`) validated the **gateway** mutations
only. Dies with Q22 if that lands as "delete".

### 5. P1 — a settings save wipes the Garmin credential and any partial `nutrition_goal`

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

### 6. P1 — REST `PUT /api/settings` builds an object with two `$set` keys

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

### 8. P1 — bujogeek groups tasks by the UTC day, for dates it stores as instants

`/mnt/Media/Projects/GeekSuite/apps/bujogeek/frontend/src/components/tasks/TaskList.jsx:52` now returns
`utcDateString(dateString)`, applied to `task.dueDate` and `task.createdAt` (`:63`). But bujogeek
declares both as `instantField()` **deliberately**, so push reminders keep time-of-day
(`graphql/bujogeek/validation.js:25-28,84-85`). The comment above the function — *"Calendar dates are
stored as UTC midnight"* — is true for flockgeek and false for bujogeek.

*Scenario:* a task due 9pm Central groups under tomorrow's heading. *Fix:* use `localDateString` in
`getLocalDate` and correct the comment. The file was rewritten today by `1fc8623` — this is a burn
regression, not an old bug.

### 9. P1 — REST settings still accepts the household id the gateway refuses

`apps/fitnessgeek/backend/src/validation/schemas/settings.js:130` declares `household.household_id`.
`graphql/fitnessgeek/resolvers.js:828` strips `household` with a comment explaining that accepting it
*"let a client silently graft itself onto any household id."* A user PUTs a household code and joins,
bypassing the "leave first" invariant (`settingsRoutes.js:359`); membership grants member enumeration
and shared food-log reads. *Fix:* drop `household_id` and strip `household` from the PUT branch,
mirroring the gateway. Today's zod pass mirrored the hole rather than closing it. Reach is bounded —
`/household/join` already admits anyone holding the 12-hex code.

### 10. P1 — a provider pin silently reroutes to a different model

`routes/openaiProxy.js:432` skips the catalog 404 for any `provider/model` pin, and
`services/aiService.js:1566,1595` swaps in each fallback provider's `DEFAULT_MODELS` entry. So
`{"model":"anthropic/gpt-4o-mini"}` — or a valid pin whose provider is rate-limited — answers **200**
from a model the caller never named, and is billed for it. Unknown **non-pin** ids correctly 404, so
the conformance audit's headline holds; the pin path is the gap. *Fix:* validate a pin against the
catalog and disable cross-provider fallback on a pinned request.

### 11. P1 — the proxy relays upstream provider error bodies verbatim

`routes/openaiProxy.js:723` (and `:546`) put `error.message` into the response; those are built as
`` `Anthropic API error (${status}): ${JSON.stringify(error.response.data)}` `` at
`services/aiService.js:2440` and ten sibling sites. Any `ai:call` key holder receives the provider's
name and its raw error body — org and project ids, quota and entitlement detail, and on a
bad-credential case a vendor-redacted key fragment. *Fix:* log it, return an opaque string and a
request id.

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

### 14. P1 — the gateway guesses "today" from the server clock, and the client asks it to

`graphql/fitnessgeek/resolvers.js:453` (same shape at `:636`, `:790`, `:804`) does
`format(new Date(),'yyyy-MM-dd')` — the *server's* day. It is genuinely reached:
`services/apiService.js:444,447` map `/summary/today` and `/summary` to `dailySummary` with **no
`date` variable**, called from `components/Dashboard/AIInsightsCard.jsx:65,74`.

*Scenario:* between 19:00 and midnight Central the insights card asks for the next UTC day and gets an
empty ring. `routes/goalRoutes.js:165,174` and `resolvers.js:516` have the same shape for the daily
calorie target and the Garmin day-fetch. *Fix:* send `localDateString()` from the client
(`fitnessGeekService.js:10 toApiDate` already does elsewhere) and make the no-date resolver branch an
error rather than a guess.

### 15. P1 — `FitnessFood.serving_size` / `serving_unit` are always null

`graphql/fitnessgeek/typeDefs.js:236` declares them flat; the shared factory stores `serving.size` /
`serving.unit`; `resolvers.js:1138` maps only `id`. Six live documents select them
(`services/apiService.js:46,50,58,62,71,87`). `pages/MyFoods.jsx:80` pre-fills the edit dialog from
`food.serving?.size || 100` — and `serving` is not a field on the type — so **every custom-food edit
rewrites its serving size to 100 g**. The same page passes `editingFood._id` (`:95`), which the
GraphQL row does not carry, so the save issues `PUT /foods/undefined` and CastErrors first. *Fix:* add
`serving_size`/`serving_unit` field resolvers, and use `food.id ?? food._id`.

### 16. P1 — the household log view is dead twice over

`services/apiService.js:436` returns `GET_FOOD_LOGS` for anything starting `/logs/`, swallowing
`/logs/household` before the intended branch at `:450`, so `HouseholdLogView.jsx:61` issues
`GetFoodLogs(date: "household")` and the `Date` scalar throws. Behind it, `apiService.js:222` declares
`$date: Date!` while `graphql/fitnessgeek/typeDefs.js:616` declares `date: String!` — a hard validation
error the moment the routing is fixed. *Fix:* move the `/logs/household…` branches above `:436` and
change the variable to `$date: String!`. Pre-existing since `471cb79` (2026-03-22) — the feature has
never worked. This was the **only** document error in 159 (see *Checked and clean*).

### 17. P1 — a post-refresh replay carries the pre-rotation CSRF token

`packages/auth/src/authClient.js:441` sets the header only `if (!config.headers[name])`; the retries at
`:486` and `:510` reuse the original headers, while `routes/auth.js:46` rotates `geek_csrf` on every
refresh. Under `enforce`, the recovery retry 403s. *Fix:* always overwrite `X-CSRF-Token` in the
request interceptor.

### 18. P1 — flockgeek update handlers allow owner reassignment

`birdController.js:205`, `eggProductionController.js:123`, `healthRecordController.js:110`,
`locationController.js:91`, `hatchEventController.js:140`, `groupController.js:123`,
`pairingController.js:97`, `meatRunController.js:72` spread raw `req.body` into the update. The filter
is owner-scoped, so this is self-transfer rather than theft. *Fix:* strip `ownerId`/`_id` before the
spread. Pre-existing; dies with Q22.

### 19. P1 (latent) — `updateFitnessFood` replaces `nutrition` and `serving` wholesale

`graphql/fitnessgeek/resolvers.js:883` builds both as nested literals. A partial `NutritionDataInput`
loses the six sibling macros to schema defaults (`0`), and a `serving_unit`-only edit deletes
`serving.size` — a `required, min: 0.1` path, with update validators off. Latent only because today's
`normalizeFoodInput` (`apiService.js:347`) always fills every key. *Fix:* dot the two sub-objects, and
only for keys actually supplied.

### 20. P1 — four shared packages ship suites CI never runs

`ci.yml` has jobs for `@geeksuite/ui`, `utils` and `crypto-vault`, and none for `@geeksuite/auth`,
`@geeksuite/user`, `@geeksuite/api-client` or `@geeksuite/logger` — all four of which have real `test`
scripts (`csrfGuard.test.js`, `csrfHeaders.test.js`, `authLink.test.js`, `logger.test.js`). Three of
the four are precisely the packages today's cross-cutting CSRF work touched (`a3c4031`, `d8521eb`), and
the fourth is the brand-new logger (`61997ed`). A CSRF regression in `authClient` ships with a green
CI. *Fix:* add four jobs mirroring `test-utils` (`ci.yml:168`).

### 21. P1 — `main` has no required status checks

`DOCS/CICD.md:102-107` says `test-*`, `lint` and `docker-build-changed` are required. Branch protection
returns 404 (not protected), `ci.yml` has zero `needs:` and no aggregation job, so all 15 jobs are
advisory and a red suite cannot block a merge. *Fix:* enable required checks on `main`, or correct
CICD.md. *Reported from a `gh api` query; Chef can confirm in the repo settings UI.*

### 22. P1 (structural) — nothing tests the two classes that caused today's outages

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
