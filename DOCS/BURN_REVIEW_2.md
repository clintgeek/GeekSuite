# Burn review 2 — reading the going-over, across the trees

*Adversarial cross-stream review of the ~40 commits pushed to `main` between 21:00 and 23:15 on
2026-09-05 (`1b1b175..origin/main`), by fifteen streams (R93–R105) each verified alone. This is the
first read **across** them. Read-only: no code changed; this file is the only artifact. Format and
severity scale are `BURN_REVIEW.md`'s; nothing there is re-tread.*

Tonight was mostly *hardening* — timeouts, sanitizers, path confinement, owner stripping, permission
gates — and hardening has a characteristic failure mode: the guard is right and the surface it guards
is not the whole surface. Eight of the fifteen findings below are that shape: a confinement helper
every route in one file uses and two other files don't; a timeout sweep that reached six auth proxies
and missed a seventh file in the same app; a length ceiling checked before the transform that changes
the length; a parity test written for the one mutation the tool happened to catch. The rest are
contract changes whose consumer lives in another tree — and five tests that stay green either way.

The good news up front: **no swallowed CI failure, no `.only`, and the two skips added tonight really
do run on CI** (proven from the run log). The `gql-arg-audit` gate is armed and fires. The one suite
BURN_REVIEW §22 named as unfalsifiable now falsifies.

**Provenance is marked.** "new" = introduced or newly reachable tonight; "scope gap" = tonight's fix
was correct and did not reach a sibling; "pre-existing" = older, worth fixing, not a burn regression.

---

## Findings

| # | Sev | What | File | Stream |
|---|-----|------|------|--------|
| 1 | **P0** | storygeek's compose `DB_URI` has no default — the next `up -d` from any other directory boots it empty | `apps/storygeek/docker-compose.yml:29` | `33953b6` **new** |
| 2 | **P1** | Renaming a tag to itself-after-trim deletes it from every note | `graphql/notegeek/resolvers.js:248` | `6d53910` **new** |
| 3 | ~~**P1**~~ | ~~A *slow* basegeek now logs the whole suite out instead of waiting~~ **FIXED** | `server.js:469` + `packages/api-client/src/index.js:100` | `016c7aa` **new** |
| 4 | **P1** | A typeless 5 MB update reaches the HTML sanitizer — 16 s of blocked event loop on the shared gateway | `graphql/notegeek/validation.js:118`, `resolvers.js:211` | `6d53910` **new** |
| 5 | **P1** | `type: null` is accepted, nulls every `notes` query, and fails the sanitizer open | `graphql/notegeek/validation.js:74` | pre-existing, now security-bearing |
| 6 | **P1** | Sanitizing can push a note past the 100 k ceiling it just passed — permanently unsaveable | `graphql/notegeek/resolvers.js:198,220` | `6d53910` **new** |
| 7 | **P1** | `ensureFormat()` never learned about the confinement helper | `apps/bookgeek/api/src/ebookFormats.js:127,150` | `e5e0dee` **scope gap** |
| 8 | **P1** | The Calibre import/rescan walk is unconfined and writes the escape back to the DB | `apps/bookgeek/api/src/routes/importRoutes.js:262` +7 | `e5e0dee` **scope gap** |
| 9 | **P1** | The cover fetcher follows redirects without re-checking the host | `apps/bookgeek/api/src/coverFetch.js:59` | `e5e0dee` **new** |
| 10 | **P1** | basegeek's entire secret set is now inside the Mongo and Postgres containers | `apps/basegeek/docker-compose.yml:12,75` | `fd2c6cc` **new** |
| 11 | **P1** | `INTERNAL_JWT_SECRET` is read in production and is in no env file | `routes/oauthConnections.js:44` | pre-existing, surfaced by `fd2c6cc` |
| 12 | **P1** | The four datastores have no healthcheck and `depends_on` is short-form | `apps/basegeek/docker-compose.yml:2-107` | `9ed9f3a` **scope gap** |
| 13 | **P1** | "Search saved meals" returns every saved meal for any query | `apps/fitnessgeek/frontend/src/services/apiService.js:481` | pre-existing |
| 14 | **P1** | Five of tonight's tests stay green with tonight's fix reverted — proven | (see §14) | `61768d8`, `90a7e60`, `c0c1691` **new** |
| 15 | **P1** | The audit's blind-spot cover reaches 2 of 23 input-object mutations | `__tests__/gatewayInputObjectParity.test.js:48` | `f7ccbfe` **new** |

Unqualified paths are relative to `apps/basegeek/packages/api/src/`.

---

**1. P0 (latent) — storygeek's `DB_URI` override can substitute an empty string.**
`apps/storygeek/docker-compose.yml:29` is `DB_URI: ${DB_URI}` — the only live shell interpolation in
all eight compose files **without** a `${VAR:-default}`. Its source `apps/storygeek/.env` is gitignored
and untracked, `.env.production`'s own line is still the malformed `DB_URI=MONGODB_URI=…` (Q56;
`grep -c` gives 1 malformed / 0 well-formed), and an `environment:` key beats `env_file:`.
*Scenario:* `docker compose up -d` from a clone, a worktree, or any shell without that untracked file
gets compose's warn-and-continue blank substitution and storygeek boots with `DB_URI=""` — silently
worse than the malformed value the override was added to work around. *Fix:* do Q56; until then
`${DB_URI:?DB_URI must be set}` so it fails loudly. *Compose's substitution rule is documented, not
executed here.*

**2. P1 — `renameTag` deletes the tag when the two names trim equal.** `graphql/notegeek/resolvers.js:248-252`
replaced the positional `$set: {'tags.$': newTag}` with `$addToSet` then `$pull`. The dedupe is right;
the degenerate case is not. `renameTagArgsSchema` (`graphql/notegeek/validation.js:122-127`) is
`z.string().trim()` on both names, while `TagContextMenu.jsx:23` guards only `newTagName !== tag` — on
the raw string. *Scenario:* the dialog is prefilled with the current name; a user adds a trailing space
and saves. zod trims both to `"work"`, `$addToSet` is a no-op, `$pull` removes it — gone from every
note, and `store/tagStore.js:63-67` then re-adds it to the sidebar, so it renders as a live tag with
zero notes. *Verified by probe:* the schema parses `{oldTag:'work', newTag:'work '}` to two identical
strings. The old positional `$set` was a harmless no-op here. *Fix:* `.refine(a => a.oldTag !== a.newTag)`,
or skip the `$pull` when they match.

**3. P1 — a slow basegeek now logs the suite out instead of waiting.** `016c7aa` gave `validateToken`
an 8 s timeout so a hung basegeek stops parking every consumer backend. Right for the six consumers —
and the 502 branch is in all six, because all six share one `attachUser`
(`packages/user/src/server/attachUser.js:76`). The seventh caller is basegeek itself: `server.js:469`
mounts `/graphql` behind `optionalUser()`, and `BASEGEEK_URL` is set neither in
`apps/basegeek/.env.production` nor in the running container (`docker inspect`, names only) — so the
gateway validates every token by calling `https://basegeek.clintgeek.com/api/users/me`, i.e. itself,
back out through nginx. `optionalUser()` is `required: false`, so a timeout takes
`attachUser.js:67` — `req.geek = null`, `next()` — and the request runs **anonymous**. Reads that
"degrade to empty" return an empty flock or library (`graphql/flockgeek/resolvers.js:82`); every
mutation throws `UNAUTHENTICATED`, which `packages/api-client/src/index.js:87-107` turns into
`logout()` + `loginRedirect` in the five apps built on `createApolloClient` (fitnessgeek, bujogeek,
notegeek, storygeek, basegeek-ui) and `apps/startgeek/src/lib/graphql.js:88-93` into an
`UnauthorizedError`. *Scenario:* basegeek is saturated rather than down; its self-call times out at
8 s and every open tab in the suite logs itself out — where before tonight it would have hung. The
loop is self-reinforcing. *Fix:* point basegeek's own `BASEGEEK_URL` at `127.0.0.1` (or short-circuit
`optionalUser` in-process), and make the gateway distinguish "no token" from "could not check the
token". *Mechanism verified by reading and by the absent env var; the saturation loop is inference —
there was no live traffic to observe.*

> **FIXED 2026-09-05.** Both halves, and the second half for everyone rather than just basegeek.
>
> **In-process validation.** `attachUser()`/`optionalUser()` now take an injectable
> `validateSession`; `server.js:469` passes `localSessionValidator`
> (`middleware/auth.js`), which reads the token cookie-first — basegeek's own order, not the shared
> header-first one — verifies it with `verifyAccessToken`, extracted from `authenticateToken` so
> there is still exactly one JWT parser in basegeek, applies R93's `passwordChangedAt` rule with the
> same whole-second tolerance `rotateRefreshToken` uses, and returns the `GET /api/users/me` payload
> normalized the way the HTTP validator normalized it. No socket is opened. `BASEGEEK_URL` was left
> alone: pointing it at loopback would have kept a network round trip for a question this process can
> answer from memory, and would still have been one misconfigured env var away from the loop.
> The six consumer backends keep the HTTP path unchanged.
>
> **"Could not check" is no longer "anonymous".** The anonymous fall-through at `attachUser.js:67`
> was the actual mechanism — it is what put a user-less request in front of a resolver that then
> threw `UNAUTHENTICATED`. `classifyValidationError()` now splits *invalid* (a flat 401/403 from
> the validator) from *unavailable* (timeout, network, 5xx, a local DB that will not answer, and
> anything else — it fails closed). Unavailable answers `503` + `Retry-After: 5` +
> `code: AUTH_UNAVAILABLE` on **both** the required and the optional path; invalid keeps its old
> 401/anonymous behaviour exactly. This replaces the old 502, so the three consumer suites that
> asserted `502` need their expectation moved to `503` — listed in the handover.
>
> **The client half.** `packages/api-client/src/index.js` returns early on any `networkError` with
> `statusCode >= 500`, so a 503 cannot reach `logout()`; the loose `message.includes('401')` check
> below it can no longer be tripped by a 5xx body. `packages/auth`'s axios interceptor already gated
> on 401/403 only and was left unchanged.
>
> **Tests:** `packages/user` 95 → 105 (injected validator makes no outbound call; unavailable → 503
> with `Retry-After` on both paths; invalid → 401/anonymous; a real hung loopback server → 503).
> `packages/api-client` 9 → 11 (a 503, and a 5xx whose message contains "401", must not log out).
> basegeek api 1424 → 1434 (`gatewayLocalSession.test.js`: `/graphql` with a valid cookie is
> authenticated with `BASEGEEK_URL` pointed at a loopback recorder that must record nothing; bad
> cookie, forged secret, missing user, no token → anonymous, still no outbound call; a token
> predating a password change → anonymous; the user store down → 503 + `Retry-After`).
> `node tools/boot-smoke.mjs` and `node tools/syntax-check.mjs` both clean.

**4. P1 — a typeless update hands 5 MB to the HTML sanitizer.** `graphql/notegeek/validation.js:54-59,118`
gives an update that omits `type` the *snapshot* ceiling (5 000 000) rather than the text one;
`resolvers.js:211-215` then reads the stored type, finds `text`, and `:220` sanitizes. jsdom parse +
DOMPurify are fully synchronous. *Scenario:* one `updateNote(id, content)` with a 5 MB body and no
`type` blocks the gateway's event loop for all eight apps — **measured at 16 365 ms**, output
7 837 814 chars — after which `notes` (`resolvers.js:105`) ships the 7.8 MB row on every list query.
*Fix:* re-apply `contentMaxFor(effectiveType)` once the type is known, before sanitizing.

**5. P1 — `type: null` is accepted and now decides whether HTML is sanitized.**
`graphql/notegeek/validation.js:74` is `z.enum(...).nullable().optional()`, so both `createNote` and
`updateNote` accept an explicit `type: null` (verified: both parse). Mongoose keeps it — the enum
validator skips null and `findOneAndUpdate` runs without `runValidators` — while `typeDefs.js:9`
declares `Note.type: String!` and `notes: [Note!]!`. *Scenario, three ways:* one such row nulls the
**entire** `notes` list for that user (the same non-null poisoning the `tags` comment two lines below
says was already closed for tags); `sanitize.js:235` is `HTML_NOTE_TYPES.has(null)` → false, so a later
typeless update on that row stores HTML **unsanitized** (probed: pass-through); and
`NoteEditorPage.jsx:216-223` coerces an unrecognised type to `text`, so the next UI save of a mindmap
row would run its JSON through the HTML sanitizer. No live XSS today — `NoteViewer.jsx:388` compares
`=== 'text'` strictly. *Fix:* drop `.nullable()` from `noteTypeSchema`.

**6. P1 — sanitizing can push a note past the ceiling it just passed.** `resolvers.js:198` validates
length, `:220` sanitizes after; `hardenRel` adds `rel`/`target` to every anchor and DOMPurify escapes
bare `&`, so the stored string can be longer than the validated one. *Verified:* a 100 000-char body
of `<p>see <a href="…">a</a></p>` passes validation and is **stored at 187 486 chars**, after which
every later save is rejected with `String must contain at most 100000 character(s)` — the note becomes
permanently uneditable. Today's TipTap build always emits `rel`/`target`, so its own output does not
grow; the trigger is any other writer (import, script, legacy row) or a future hook. *Fix:* check the
length of the sanitized string.

**7. P1 — `ensureFormat()` bypasses the confinement helper, on a route with no auth.** `e5e0dee` added
`resolveInLibrary` and routed every path-building site in `server.js` through it; it did not reach
`apps/bookgeek/api/src/ebookFormats.js:127` (`path.join(root, relPath)`) or `:150`
(`path.join(root, book.coverPath)`). Consumers: `server.js:1188` (`GET /api/books/:id/download/:format`,
authenticated) and `deviceBasket.js:484` (`GET /download-basket/:slug/item/:index`, **secret-word gated
only, no auth**). *Scenario:* a `Book.files[].path` of `../secret/private.epub` makes `res.download`
stream a file outside `LIBRARY_PATH` — **verified by probe**. The same join feeds `--cover` into the
`ebook-convert` spawn (`:54`), and `:196` persists `path.relative(root, outputPath)`, writing the
escape back into the DB. Finding 8 is how such a `path` gets there. *Fix:* import `resolveInLibrary`
into `ebookFormats.js` and 404 on null.

**8. P1 — the Calibre walk is the unconfined ingestion point.**
`apps/bookgeek/api/src/routes/importRoutes.js:262-263, 288, 306-307, 345-346` (import) and
`:549-550, 574, 592-593, 636-637` (rescan) join `libraryRoot` with the metadata.db `path` / `data.name`
columns with no confinement, then store the result as `Book.files[].path` / `Book.coverPath`.
*Scenario:* a metadata.db row with `path = "../../../../etc"` makes the rescan `readdir` outside the
library and persists escaped paths every downstream route then trusts. *Fix:* run each derived
relative path through `resolveInLibrary` and skip the row on null.

**9. P1 — the cover fetcher follows redirects without re-checking.**
`apps/bookgeek/api/src/coverFetch.js:59` is `redirect: "follow"`; the host allow-list is checked once,
at `server.js:1909`, on the URL the client supplied, and Node's fetch then follows up to 20 hops
unchecked. The suffix list (`coverFetch.js:26-32`) includes bare `google.com` and bare
`googleusercontent.com`. *Scenario:* a `coverUrl` pointing at an open redirector on an allowed host
reaches `http://169.254.169.254/…` or an RFC1918 service on this box, and the response body is written
into the library and served back by `GET /api/books/:id/cover`. *Fix:* `redirect: "manual"` plus a
re-check of `isAllowedCoverHost` on each `location`, capped at 3 hops. *Exploitability against a
specific live redirector is UNVERIFIED — no outbound requests were made.*

**10. P1 — the env_file roll put every basegeek secret inside the datastore containers.**
`apps/basegeek/docker-compose.yml:12-13` and `:75-76` point the `mongodb` and `postgres` services at
the app's full `.env.production`. `docker inspect` confirms both now carry ~40 variable names —
including `JWT_SECRET`, `JWT_REFRESH_SECRET`, `KEY_VAULT_SECRET`, `GOOGLE_CLIENT_SECRET`,
`SPOTIFY_CLIENT_SECRET`, `VAPID_PRIVATE_KEY` — where before tonight they carried two or three each.
*Scenario:* a shell in the Mongo container, or anyone who can run `docker inspect`, reads the whole
suite's credential set, and every one of those names lands in any container-env dump pasted into a bug
report. *Fix:* split the datastore credentials into `.env.datastores` and point those two `env_file:`
entries at it. Q58 decides what to rotate; this decides the blast radius next time.

**11. P1 — `INTERNAL_JWT_SECRET` is read in production and set nowhere.** `routes/oauthConnections.js:44`
reads it and `:46` error-logs its absence. It is in `apps/basegeek/.env.example` but is **not** one of
the 35 keys in `.env.production`, and is absent from the running container. *Scenario:* every
internal-JWT OAuth-connections call has been silently taking the not-configured path. *Fix:* add the
key and recreate basegeek.

**12. P1 — the datastores have no healthcheck, and `depends_on` cannot wait on one.**
`datageek_mongodb`, `datageek_postgres`, `datageek_redis` and `datageek_influxdb` all report
`health=none` (`docker inspect`); `apps/basegeek/docker-compose.yml:2-88` declares none, and `:103-107`
is short-form `depends_on`, which waits for *started*, not *ready*. `9ed9f3a` fixed the app
healthchecks and did not extend to the datastores it had just recreated. *Scenario:* on a full
`up -d`, basegeek opens its seven per-app Mongo connections before Mongo accepts them, and
`restart: unless-stopped` does not react to unhealthy. *Fix:* add `mongosh --eval "db.adminCommand('ping')"`
/ `pg_isready` / `redis-cli ping` checks and move `depends_on` to `condition: service_healthy`.

**13. P1 — the meal search parameter is a lie all the way down. FIXED 2026-09-05.**
`apps/fitnessgeek/frontend/src/services/apiService.js:481` matches `base === '/meals'` and returns
`{ query: GET_MEALS }` with **no variables**, so `getMeals(null, searchQuery)`'s `?search=` is dropped;
the gateway has nowhere to put it either — `fitnessMeals(mealType: String)`
(`graphql/fitnessgeek/typeDefs.js:615`) declares no `search` argument at all. *Scenario:* typing
"chicken" into food search returns every saved meal; three live callers
(`FoodSearch/UnifiedFoodSearch.jsx:292`, `FoodSearch/FoodSearch.jsx:97`, `services/matcherService.js:37`)
and none filters client-side. *Fix:* add `search` to the typeDef and resolver, or filter at the call
sites. Invisible to tonight's `gql-arg-audit`, which checks the arguments a document *sends* and
cannot see a parameter the document never declares.
*Fixed:* `fitnessMeals(mealType: String, search: String)` — escaped and matched against `name`
case-insensitively, same rule as `fitnessFoods(search:)`, bounded to 200 chars by
`graphql/fitnessgeek/validation.js`. `apiService.js`'s `/meals` branch now reads `search` (and
`meal_type`) off the query string into `GetFitnessMeals`'s `$search`/`$mealType`. Tests:
`src/__tests__/fitnessgeekMealsSearch.test.js` (gateway — narrows, escapes `C++`/`Oreo (`, bounds,
ownership) and `apps/fitnessgeek/frontend/src/services/__tests__/mealsSearchRouting.test.js` (frontend
— operation name and `$search` reaching the variables). `gql-arg-audit` clean.

**14. P1 — five tests added tonight stay green with tonight's fix reverted.** Each proven by reverting
the fix in a scratch copy and re-running; nothing in the repo was touched.
- `__tests__/goingOverOutbound.test.js:56` — the Gmail path-traversal test never calls
  `gmailGetMessage`. It rebuilds the URL inside the test and asserts on Node's `encodeURIComponent`.
  The file's axios mock records `calls` and **no assertion in the file ever reads it**.
- `apps/storygeek/backend/src/__tests__/routes/authValidation.test.js:206` and
  `apps/fitnessgeek/backend/src/__tests__/auth.test.js:435,448` — stripping `timeout: upstreamTimeoutMs()`
  from every call in the proxy left all 10 and all 26 green; the hang mock works with
  `setTimeout(…, undefined)`. fitnessgeek's banner at `:407` claims the file asserts `config.timeout`;
  it does not. `packages/user/src/server/__tests__/tokenUtils.test.js:67` is the counter-example — a
  real hung socket, and the best test in the batch.
- `__tests__/goingOverFitnessGlance.test.js:212` — "caps the fan-out" asserts wall-clock; with
  `MAX_CALENDAR_SOURCES = Infinity` it passed in 485 ms of a 10 s budget. And `:187`, the SSRF test,
  asserts `events === []` — which is also the *pre-fix* answer, as its own sibling at `:203` proves.
- `apps/bujogeek/frontend/src/__tests__/graphql/taskSelections.test.js:68-81` — the template "full
  shape" checks pass against the pre-fix `{ id name }` selection set, because `print()` + `toContain`
  matches the variable definitions rather than the selection set.
*Fix, in order:* assert the recorded call (`mock.calls[0][2].timeout`), assert the fetch-attempt count
rather than elapsed time, spy `ical.fromURL` and assert it was never called, and walk
`definitions[0].selectionSet`. Two more are time-of-day dependent rather than wrong —
`pages/__tests__/Medications.test.jsx:94,112` and `BloodPressure/__tests__/bpCalendarDates.test.jsx:63-77`
are green pre-fix 19 hours out of 24 (pin with `vi.setSystemTime`), and
`apps/bookgeek/web/src/__tests__/views/bookFacts.test.js:30,50,64,74` can only go red on this Chicago
box: under `TZ=UTC` the buggy local-time implementation satisfies every assertion and
`test-bookgeek-web` sets no TZ on UTC runners (drive TZ from inside the test, as
`bujogeek/.../dueDate.test.js:20`'s `withTZ` helper does).
*Fixed 2026-09-06:* the five named tests now call the function, read the recorded axios call's
`config.timeout`, spy `ical.fromURL`'s call count, and walk `selectionSet` — each proven red against
its fix reverted and green restored; the two time-of-day and the TZ-only tests are unchanged.

**15. P1 — the blind-spot cover is 2 of 23.** `tools/gql-arg-audit.mjs` cannot see fields inside an
input object; `__tests__/gatewayInputObjectParity.test.js` exists to close that, and it is a
**hand-written payload for `FitnessMedicationInput` only**. The merged gateway declares 22 input types
and **23 root fields taking an input-object argument**; 21 are uncovered — `addBloodPressure`,
`updateBloodPressure`, `addFitnessFood`, `updateFitnessFood`, `addFitnessMeal`, `updateFitnessMeal`,
`addFitnessWeight`, `updateFitnessWeight`, `addFoodLog`, `updateFoodLog`, `setNutritionGoals`,
`updateFitnessUserSettings`, `fitnessInsightsChat`, `createBook`, `updateBook`, `saveBookProfile`,
`saveLibraryFilter`, `savePushSubscription`, `bulkUpdateFreeTiers`, `updateTask`,
`Query.calendarEvents`. The test itself is good — 4 of its 5 cases fail against the pre-fix schema —
but it enumerates nothing, so it grows only when someone remembers, which is the same property that
let `suggested_indications` sit missing. *Fix:* enumerate the schema's input-object-taking fields and
drive each from the frontend document that calls it, failing on any field with no payload.
*Fixed 2026-09-06:* the test now enumerates all 23 from the schema itself and fails if any field has
neither a fixture nor an explicit `NO_FRONTEND_CALLER` entry (one field, `setNutritionGoals`, has none).

---

## P2

- **(a)** `apps/storygeek/backend/src/routes/ai.js:15,27` — the only backend file in the suite with
  axios calls and **zero** timeouts (all seven backends checked file by file). Both replay the user's
  cookie to basegeek, so a hung basegeek parks a storygeek handler forever: the exact failure
  `90a7e60` swept six auth proxies to close, one file over in the same app. — `90a7e60` **scope gap**
- **(b)** `routes/auth.js:296` — `/register` validates `app` case-insensitively but mints the token
  with the **raw** string (`/login` lowers it first at `:124`), while `middleware/auth.js:20` compares
  `decoded.app` against `VALID_APPS` case-**sensitively**. `POST /register {app:"BookGeek"}` therefore
  succeeds and returns a session every route 403s — precisely what the new gate's own comment says it
  exists to prevent. — `61768d8` **new**
- **(c)** `graphql/fitnessgeek/typeDefs.js:412` — `FitnessMedicationInput.suggested_indications` was
  added as an unbounded `[String]` and spread straight into the model (`resolvers.js:1104,1108`); the
  REST twin bounds it to 50 × 200 chars (`validation/schemas/medication.js:44`). Widening a gateway
  input without the bound its REST twin carries is BURN_REVIEW #9's class, inverted. — `f7ccbfe` **new**
- **(d)** Six near-identical copies of `DEFAULT_UPSTREAM_TIMEOUT_MS` / `upstreamTimeoutMs()` across the
  six auth proxies, while `packages/user` already exports `resolveTimeoutMs` with the same rule. — `90a7e60`
- **(e)** `services/aiService.js:515` throws `` `Together.ai API error: ${msg}` `` with no `(status)` —
  the only thing `aiFailureEnvelope.upstreamStatusOf` (`:92`) parses — so that adapter classifies as a
  bare 500. The sibling at `:2742` carries a comment saying this drift was fixed for it.
  `/models/:provider` and `/models/:provider/refresh` relay `details: error.message` outside the
  envelope entirely (`aiRoutes.js:942,1002`); both are behind `ai:models` / admin. — `61768d8`
- **(f)** `apps/notegeek/frontend/src/App.jsx:28-37` — `getSafeReturnTo()` is a duplicate,
  **un-hardened** copy of the very guard `e3ea542` fixed tonight
  (`raw.startsWith('/') && !raw.startsWith('//')`, no backslash or tab/LF/CR normalization). Probed:
  `/\evil.com`, `/%09/evil.com`, `/%0A/evil.com` all pass and resolve to `https://evil.com/`. Not live
  — the value feeds `<Navigate to={…} replace />`, i.e. client-side routing (**UNVERIFIED** whether the
  browser throws or no-ops) — but it is the only remaining copy of the old pattern in the repo, one
  refactor to `window.location.href` from being real. — `e3ea542` **scope gap**
- **(g)** `apps/bookgeek/api/src/libraryPaths.js:31-35` resolves but does not `realpath`. **Verified:**
  a symlink inside the root reads a file outside it, and `server.js:1527` calls `res.sendFile` without
  a `root` option, so it applies no symlink restriction either. Null bytes pass through too (→ an
  uncaught `ERR_INVALID_ARG_VALUE`, not a traversal). — `e5e0dee`
- **(h)** `coverFetch.js:53` — `fetchImageBuffer` accepts any URL; the allow-list lives at the one call
  site, so the next call site that forgets re-opens finding 9 with no test failing. — `e5e0dee`
- **(i)** `sanitize.js:180` / `sanitizeNoteHtml.js:179` — `hardenRel` adds `target="_blank"` to in-page
  anchors, relative links and `mailto:`/`tel:`. The test at `sanitizeNoteHtml.test.js:135` is titled
  "leaves a relative link and an anchor alone" and asserts the added target, pinning the wrong
  behaviour. — `6d53910` **new**
- **(j)** `sanitizeNoteHtml.js:213-215` falls back to the bare DOMPurify default export when `window`
  is undefined; that instance has `isSupported === false` and returns its input **unchanged**. Latent
  (no SSR), and it mutates the shared singleton with hooks, contradicting the comment above it. — `6d53910`
- **(k)** Four healthchecks still probe `localhost`, contradicting `9ed9f3a`'s own rule
  (`apps/bookgeek/docker-compose.yml:41`, `notegeek:31`, `startgeek:13`, `storygeek:44`). Green today;
  an image-base bump flips them. No `start_period` on six others (basegeek:111, bookgeek:40,
  bujogeek:33, fitnessgeek:34, flockgeek:24, notegeek:30) — basegeek's measured boot is ~6 s, well
  inside the 30 s first probe, but a cold datastore start would not be. — `9ed9f3a`, `fd2c6cc`
- **(l)** `apps/fitnessgeek/frontend/vite.config.js:88-90` and `apps/bujogeek/…:120-122` declare
  `registerType: 'autoUpdate'` with neither `clientsClaim` nor `skipWaiting` — confirmed absent from
  both built `dist/sw.js`. notegeek sets both. Bounded: fitnessgeek's `PWAUpdatePrompt.jsx:15`
  force-calls `updateSW(true)` after 15 s. Deviates from `DOCS/PWA_STANDARD.md` rule 6. — pre-existing
- **(m)** `apps/notegeek/frontend/nginx.conf`, `apps/fitnessgeek/frontend/nginx.conf` and
  `apps/bujogeek/frontend/nginx.conf` all do bare `try_files $uri $uri/ /index.html` with no extname
  guard — the SW poison shape. **Dead today** (both `build.sh:41` and `release.yml:71` build only
  `apps/<app>/Dockerfile`, verified), but nothing marks them dead. — pre-existing
- **(n)** `apps/storygeek/backend/src/app.js:99` — `app.use('/api/ai', aiRoutes)` has no auth
  middleware, so `GET /api/ai/gm-config` returns `STORYGEEK_GM_PROVIDER`, `GM_MODEL`, `freeOnly` and
  the fallback list to anyone. Configuration, not credentials. — pre-existing
- **(o)** `apps/storygeek/frontend/src/pages/Settings.jsx:56-58` — `STORYGEEK_FREE_ONLY` defaults
  **on** (`!== 'false'`), under which an explicit user pick is honoured only if it is on the free list
  (`backend/src/services/aiService.js:176-181`) and is discarded entirely on the `null` fallback path
  (`:170-173`). Settings fetches `gm-config`, which returns `freeOnly`, and never renders it — so the
  user picks a paid model, sees it selected, and every turn runs something else. — pre-existing
- **(p)** `apps/fitnessgeek/frontend/src/services/apiService.js` router traps with no caller today:
  `/meals/:id` routes a meal id into `GET_MEALS` as `mealType` (`:482`, while `fitnessMeal(id: ID!)`
  exists unwired); `/blood-pressure/:id` and `/weight/:id` route to list documents that take no id
  (`:485-486`) and return the whole list; the generic `settings` branch (`:623`) still carries the
  input-coercion bug `:621-622` were added tonight to fix, waiting for the next `/settings/*` path.
  — pre-existing
- **(q)** `routes/auth.js:328` — a password change revokes refresh-token *families*, so an attacker's
  already-issued access token stays valid for the rest of its TTL. The fix is right; the window should
  be documented rather than read as "ends every session". — `61768d8`
- **(r)** `previewText.js:55` strips tags without decoding entities, so every note list row and search
  result renders `Tom &amp; Jerry` literally (verified). Cosmetic. — pre-existing
- **(s)** `NoteViewer.jsx:256-263` prints "Locked notes aren't readable yet" and `:386-416` renders the
  content anyway; `graphql/notegeek/resolvers.js:116` returns full `content` for a locked note while
  `searchNotes` (`:147`) suppresses the snippet. The two disagree. — pre-existing
- **(t)** `apps/bookgeek/api/test/libraryPaths.test.js:144-158` re-implements the OpenLibrary-id guard
  instead of importing it — delete the real gate at `server.js:2400` and the suite still passes 32/32
  (run). `test/coverFetch.test.js:125-134` asserts only that a signal exists, so deleting the 15 s
  abort at `coverFetch.js:55` leaves it green. — `e5e0dee`
- **(u)** Docs drift: `apps/bookgeek/DOCS/CONTEXT.md:433-436` claims `resolveInLibrary` is "the
  **only** way this app turns a stored or supplied relative path into an absolute one" — true of
  `server.js`, false of the two files findings 7 and 8 live in. `DOCS/PWA_STANDARD.md` lists basegeek
  as shipping no service worker (`packages/ui/vite.config.js:10` configures VitePWA and `dist/sw.js`
  exists), and `apps/fitnessgeek/frontend/vite.config.js:154-156` still says fitnessgeek lacks the
  extname guard it has had since `backend/src/app.js:243`.
- **(v)** Env hygiene: `apps/storygeek/backend/src/services/aiService.js:55` reads `BASEGEEK_JWT_TOKEN`,
  a key in no env file and absent from the container (`CORS_ORIGINS` likewise — harmless, `app.js:40`
  hardcodes the origin); six stale keys in `fitnessgeek/.env.production` (`NUTRITIONIX_*`, `GARMIN_*`,
  `JWT_REFRESH_SECRET`) that no source reads; `startgeek/.env.example` names two variables the code
  does not read and omits the one it does (`VITE_BASEGEEK_PROXY`) — `fd2c6cc`'s "env.example files
  match the code" did not cover startgeek; `KINDLE_UI_USER_ID` (`apps/bookgeek/api/src/server.js:240`)
  is unset while `KINDLE_ENABLED` is on; and `apps/bookgeek/docker-compose.yml:25,38` set `COVERS_PATH`
  and mount `/data/covers`, neither of which anything reads (covers go under `LIBRARY_PATH`,
  `server.js:2640`, already bound at `:33`).

- **(w)** Test hygiene, small: `apps/notegeek/frontend/src/__tests__/components/smoke.test.jsx:133-192`
  is 9 tests with **0 assertions** — tonight's edit only added `searchNotes`/`clearSearchResults` to the
  mock store so the component would not crash, so the search-clearing fix has no assertion anywhere;
  `apps/fitnessgeek/backend/src/__tests__/routes/appErrorShape.test.js:69` accepts
  `[200, 403, 500]`; `RichTextEditor.test.jsx:99`'s `activeElement).not.toBe(null)` cannot fail in
  jsdom; `packages/logger/src/__tests__/logger.test.js:104` accepts either of two levels.
  `apps/bookgeek/api/test/libraryPaths.test.js:144` is the same class as P2 (t).
- **(x)** `tools/gql-arg-audit.mjs:130-138` — `DOCUMENT_ROOTS` omits `apps/storygeek/frontend/src`,
  which does issue gateway documents (`stories`, `story`); re-run with it added the audit is still
  clean (187 documents), so a gap rather than a live bug. Its `missing-argument` rule — the one closest
  to the `updateBird` 6-of-16 bug the tool's own header cites — is advisory, off by default, and never
  fails the build: against the pre-fix tree the armed gate fires on exactly **1** of the 4 bugs
  `f7ccbfe` fixed. ~14 of ~195 call sites pass `variables: someIdentifier` and are invisible to it by
  design. — `f7ccbfe`
- **(y)** `apps/bookgeek/api/test/importRoutes.test.js:180,203` degrade *silently green*: if CI's
  `better-sqlite3` prebuild ever fails, the two real Calibre-schema tests skip and the job still
  passes. *Fix:* `if (process.env.CI) throw` instead of `t.skip`. — `e5e0dee`

---

## Checked and clean

Swept by reading and, where marked, by execution:

- **The `better-sqlite3` skip claim is TRUE, and CI really runs those tests.** `better-sqlite3@11.10.0`
  is a direct dep of `apps/bookgeek/api` (lockfile:274), CI's `test-bookgeek` runs `npm test` there on
  node 20, the frozen install carries no `--ignore-scripts`, and `pnpm-workspace.yaml:22`'s
  `dangerouslyAllowAllBuilds: true` lets pnpm 10 run the postinstall. **Proven from CI run
  34010907846's log**: `prebuild-install … Done`, then `# tests 172 / # pass 172 / # skipped 0`, with
  "walks the real Calibre schema" passing. It skips on this box only because `node_modules` predates
  that setting — the `build` directory does not exist at all, so the warning text misattributes the
  cause. These are the **only two skips added tonight**; the whole diff has no `.only`, `xit`,
  `xdescribe`, `.todo` or `it.failing`.
- **No swallowed CI failure.** No `continue-on-error`, `|| true`, `|| exit 0` or `set +e` anywhere in
  `.github/workflows/`, and no `pnpm --filter X <builtin>` install-alias. `ci.yml` has no per-job path
  filters, so nothing is trigger-gated out; all 34 jobs ran green on the latest push.
  `tools/gql-arg-audit.mjs:678` exits 1 on findings and is wired at `ci.yml:393-414` — **proven armed**
  by running tonight's audit against `git archive 1b1b175`: exit 1, one finding
  (`HatchLogPage.jsx:101`). `boot-smoke.mjs` and `syntax-check.mjs` both exit non-zero;
  `test-startgeek` really runs (`# tests 14 / # pass 14`), and `gql-audit` printed
  `clean — 182 documents, 179 operations`.
- **The rest of tonight's suites are genuinely falsifiable** — verified by execution or scratch
  revert: `bookgeekLibrarySorts`, `flockgeekBirdFieldParity`, `bujogeekRecurrenceUnification` (real
  Mongo, asserts the two new fields on virtual occurrences), `notegeekSanitize`, `notegeekOwnership`,
  `goingOverAuth`, `goingOverGateway`, `goingOverAiGeek`, `aiPricingUnits`, `safeRedirect`,
  `packages/user/{tokenUtils,createUserModel}`, `packages/logger` redaction, `packages/utils/dates`,
  `packages/ui/dialog`, bookgeek `{authProxyCsrf,coverFetch}`, bujogeek's six, all five new
  fitnessgeek backend route suites, flockgeek's backend set plus the `fakeModel.js` `$or`/RegExp
  repair, notegeek's five, `startgeek/commandFailure`, storygeek's three backend suites and
  `StoryList`. `QuickHarvestEntry.test.jsx` — BURN_REVIEW §22's named unfalsifiable suite — was
  correctly inverted to `not.toHaveProperty('source')` and now falsifies.
- **The 502 branch is in all six consumer backends** — every one uses the single shared `attachUser`
  (`packages/user/src/server/attachUser.js:72-77`), so there is one 401/403-vs-502 split, not six. All
  six auth proxies carry `timeout: upstreamTimeoutMs()` on every outbound call and answer 502 on a
  connection-level failure — `90a7e60` changed four, notegeek and bujogeek already had it from
  `c0c1691`. The only outbound file that missed is P2 (a).
- **No consumer assumed the old refresh-timer semantics.** All three `startRefreshTimer(onFailure)`
  wirings (`packages/auth/src/AuthProvider.jsx:35`, notegeek `authStore.js:87`, bookgeek
  `App.jsx:797`) only clear local state, and `doTokenRefresh()` (`authClient.js:320-324`) stamps
  `error.status` on exactly the 401/403 branch the new predicate reads.
- **Nothing reads `err.config.headers` or `err.request`.** The only non-test consumer of an axios
  `error.config` in the repo is `packages/auth/src/authClient.js:597` — browser-side, unaffected by a
  pino serializer. `err.config.url` is deliberately kept, and no remaining env-driven URL in the seven
  backends carries a secret in its query string.
- **`toUtcMidnight(null)` breaks no caller.** Every gateway path goes through `calendarDateField`
  (`graphql/shared/validation.js:120`), which short-circuits `null`/`undefined` before the call and
  whose base union rejects `''`; the one frontend caller that could see a null
  (`pages/Medications.jsx:75-78`) guards on `Number.isNaN`. The single behaviour change is
  `routes/logRoutes.js:329,352`, where an explicit `from_date: null` now yields a cast error rather
  than an epoch query and a 404.
- **`updateBird`/`createBird` match the form, empty strings included.** `BirdsPage.jsx:180-224` sends
  `|| undefined` for every text, date and enum field, so a cleared `status`/`sex`/`origin` is omitted
  rather than sent as `''`, which the zod enums (`graphql/flockgeek/validation.js:85-87`) would reject.
  `cross`/`foundationStock` go through `asBool` and are seeded from the record by `buildEditFormData`
  (`:52-72`), so an edit cannot silently clear them; `temperamentScore` goes through `asScore`, which
  returns `undefined` for `''`. Both mutations are one `birdFields` object and cannot drift again.
- **`FitnessMedicationInput.suggested_indications` reaches storage** — the path exists on the shared
  model (`packages/schemas/fitnessgeek/medication.js:158`), REST writes it, and both gateway mutations
  spread the input, so no mongoose-strict drop. Only the missing bound is filed (P2 c).
- **`MealItemInput` and `SaveMealDialog` agree.** The removed `food_item_payload` fallback had no home
  in the input type; the replacement filters unresolvable rows, renders a warning naming the count
  (`SaveMealDialog.jsx:140-145`) and disables Save when none resolve (`:114`) — nothing dropped
  silently.
- **The two `flattenSettingsUpdate` twins are rule-identical** (`graphql/fitnessgeek/resolvers.js:128-139`
  and `apps/fitnessgeek/backend/src/utils/flattenSettingsUpdate.js:48-59`): same `isPlainObject`, same
  `{garmin.oauth1_token, garmin.oauth2_token}` opaque set, same undefined/empty-object drops. The third
  copy the module header names — `UserSettings.updateSettings` — was closed tonight through the same
  helper with an `$setOnInsert` fallback for an empty `$set`. Double-flattening a dot path is
  idempotent, so the gateway calling through the model is safe.
- **`withoutOwnerFields` strands no legitimate write** — all ten flockgeek create/update handlers route
  through it, the alias list (`utils/ownerFields.js:12`) contains no field a flockgeek model
  legitimately takes from a body, ownership is stamped after the spread, and the strip is shallow so
  nested `_id`s survive. **`requireOwner` refuses rather than invents**
  (`middleware/authMiddleware.js:20-33`: 401 for a session with no usable id), and `normalizeSsoUser`
  (`packages/user/src/server/tokenUtils.js:61-67`) makes `id`, `_id` and `userId` one value — so
  flockgeek's REST ladder and the gateway's `context.user.id` cannot disagree about who owns a row.
- **`safeRedirect` is solid.** The real ESM module was probed with 39 adversarial inputs — `//evil.com`,
  `/\\evil.com`, `/\evil.com`, `%2F%2Fevil.com`, `/%2F%2Fevil.com`, `%09//evil.com`, a raw tab, a
  leading space, `///evil.com`, `%00//`, double-encoded `%25%32%46`, `javascript:`, `data:`,
  `https://clintgeek.com.evil.com/`, `https://clintgeek.com@evil.com/`, `{}`, `["//evil.com"]`, a
  5 000-char path — **zero off-site redirects**; every alarming-looking return resolves same-origin
  when parsed against the base as a browser would. An absolute suite URL is allowed, deliberately and
  documented at `safeRedirect.js:4-8`. 19/19 tests pass and no consumer bypasses it — except the
  notegeek copy in P2 (f).
- **The SW poison vector is closed everywhere.** All four `swPrecache()` copies (startgeek, storygeek,
  flockgeek, bookgeek — four, not five; no shared package exports one) are functionally identical, the
  only deltas being the per-app `name:` and quote style. Every app precaches index.html and none has a
  `navigateFallbackDenylist` — which does not matter, because Workbox's `NavigationRoute` only
  intercepts `mode: 'navigate'`. The cure is the server-side extname→404 guard, present on all eight
  deploy paths (spot-verified: `apps/bujogeek/backend/src/app.js:112`,
  `apps/fitnessgeek/backend/src/app.js:243`, `apps/basegeek/packages/api/src/server.js:509`,
  `apps/startgeek/Dockerfile:44`'s `serve dist` with no `-s`). A deleted hashed asset 404s at the
  network, so no SW ever sees a 200 `text/html` under a `.js` URL.
- **The fitnessgeek router's ordering is clean.** Only one commit in the range touched the file
  (`eb473a0`) and it did not reorder — it *inserted* `/settings/dashboard` and `/settings/ai` ahead of
  the generic `settings` branch. All ~80 branches were executed against a path written for each:
  **zero shadowed, zero unreachable, zero duplicate matchers**, and the prior review's
  `/logs/household` fix holds (`:475-480`). Every REST path a caller actually builds either matches a
  branch or deliberately goes via `restClient`. `restVsGraphqlRouting` + `apiServiceHouseholdLogs`
  15/15.
- **The notegeek sanitizer loses nothing TipTap emits.** The configured set is StarterKit 2.27.2 +
  Link + Underline + Placeholder (`RichTextEditor.jsx:127-136`); every tag and attribute it can produce
  — `pre>code.language-*`, `ol[start]`, `hr`, `br`, `u`, `s`, the full `rel` — round-trips
  byte-identical through both profiles, and the two profiles are byte-identical to each other (20-case
  parity probe: 0 mismatches, 0 non-idempotent). The allow-list gaps (`colwidth`, task-list
  `input`/`label`, `style` for highlight/text-align) are for extensions **not installed** — they become
  data loss the day one is added, which deserves a comment in the allow-list. There is no image
  insertion path in this editor at all; `data:image/*` raster is permitted while `data:image/svg+xml`,
  `data:text/html` and `javascript:` are removed whole. A 25-case XSS battery (mXSS `form`/`math`/
  `mglyph`, the `noscript` title-break, DOM clobbering, `<base>`, `<template>`) leaked nothing.
  `dangerouslySetInnerHTML` appears exactly once in the repo (`NoteViewer.jsx:399`) and is sanitized;
  previews are plain text or React elements, and markdown runs through `react-markdown` with no
  `rehype-raw` anywhere.
- **The bookgeek confinement helper's prefix compare is correct** — `base + path.sep`, verified: a
  sibling `books-evil` and a `library-backup` both return null, and a trailing-slash base, absolute
  inputs, `.`/`''` and hostile `toString` objects all behave. Every path-building route in `server.js`
  itself does go through it (11 sites); all four `importRoutes` routes carry `authenticateToken` and
  the three `/kindle-test` routes are behind `requireKindleAuth`. **The cover host allow-list has no
  IP-range hole** — being an allow-list, RFC1918, loopback, 169.254, `0.0.0.0`, IPv6 forms, decimal
  IPs and docker service names are all rejected as a side effect (16 probed), as are
  `evil-google.com`, `google.com.evil.test` and `https://covers.openlibrary.org@evil.com/`. Blocking
  the box's own LAN is **deliberate**: `test/coverFetch.test.js:37-42` names `192.168.1.17:27018` and
  `datageek_mongodb:27017` as the targets.
- **storygeek's `null`-vs-`[]` sentinel is honoured end to end.** `getFreeProviderModels`
  (`backend/src/services/aiService.js:459,473`) returns `null` on failure and never `[]`, and
  `resolveGMModel:170-195` branches on the difference — `null` → the pinned model, `[]` → an explicit
  "No free AI models available". The frontend does not lie about it either: `Settings.jsx:26-30` puts
  the director call in a bare `Promise.all`, so a failure renders `GeekErrorState` rather than an empty
  list. A 403 is caught (axios rejects; no `validateStatus` override). Storygeek's backend calls
  exactly three basegeek routes — `/api/ai/call` (`ai:call`), `/director/recommend` and
  `/director/models` (both `ai:director`) — which its `ai:call,ai:director` mint covers post-Q45; its
  two cookie-forwarding proxies authenticate as the *user*, and `checkPermission`
  (`middleware/apiKeyAuth.js:154-160`) grants a JWT every permission, so the new `ai:providers` gate
  cannot 403 the Settings page. *Whether the deployed key actually carries `ai:director` is
  UNVERIFIED — the key cannot be read.*
- **The env_file roll lost no fitnessgeek variable** — all 17 names from the deleted `environment:`
  block are keys in `.env.production` **and** present in the running container; basegeek's datastore
  credential names likewise. **The datastore recreate changed no volume**: `1b1b175..HEAD` on
  `apps/basegeek/docker-compose.yml` shows zero volume changes (only `env_file`, `logging` and the
  basegeek healthcheck), and `docker inspect` Mounts on all four datastores match the compose binds
  exactly, all `rw`, all under the app directory. No named-volume swap, no empty datastore.
- **Operational state, 23:30:** all eight apps `(healthy)`, `FailingStreak=0`, none restarting; uptimes
  17–38 m, datastores 2 h. The only containers with no health status are the four datastores (finding
  12), whose compose declares none — not a stale-image artifact. Every healthcheck command matches its
  image (`wget --spider` on busybox, `node -e` on Node); none uses `curl` in a curl-less image.
- **Both bujogeek virtual-occurrence builders were fixed identically**
  (`graphql/bujogeek/services/taskService.js:298-301, 329-332`) and there is no third — `isVirtual`
  appears at exactly those two sites in the gateway. **`updateFolder`'s cycle check is correct**: one
  projected query, iterative descent, `null` parent allowed, `'parentId' in args` guarded against a
  zod-stripped key. It guards the folder feature Q65 flags as dead, which is the right order.
