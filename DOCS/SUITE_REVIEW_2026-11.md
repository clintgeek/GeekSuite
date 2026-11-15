# The rest of the suite — review (2026-11-15)

Companion to `NOTEGEEK_TODOGEEK_REVIEW_2026-11.md`. Five read-only inspectors
covered every other app and the shared plumbing, looking for the defect classes
that review found. **This is a plan. Nothing here is built.**

**How far to trust it.** Each finding is marked by its inspector: **V** verified
in code, **?** suspected and needs a device or a measurement. Sage re-checked
five headline items in code afterwards (marked ✔ below); the rest rest on the
inspector's reading. Harness screenshots for these apps are from October and
were mostly not used. No device was involved.

## Verdict per app

| App | State | Build pass? | Size |
|---|---|---|---|
| Shared gateway/auth plumbing | One class of bug affects every app | **Yes — do first** | ~1–2 days |
| ThingGeek | Well built; four data-trust defects | Yes | ~1 day |
| FitnessGeek | Good; trusts what it fetched once | Yes | ~1 day |
| StoryGeek | Hardened, but the turn lifecycle is weak | Yes, small (+ one larger item) | ~1 day + M |
| StartGeek | Tidy; four small defects | Yes | ~half a day |
| BookGeek | Mostly good | Yes, small | ~half a day |
| GameGeek | Good | Small, plus two policy calls | ~2 h |
| NewsGeek | Good | Tiny | ~1–3 h |
| FlockGeek | Good; quiet since October | Two items only | ~2 h |

## Ranked across the suite

**1 — Wrong or lost data**

1. **Shared:** an expired or invalid token is treated as anonymous on `/graphql`, so lists answer empty with HTTP 200 and the refresh path never fires (FlockGeek: 17 queries; suite tags). One fix at the mount covers all apps. ✔ (`server.js:505` mounts `optionalUser`)
2. **FitnessGeek:** a failed dose-log read shows "0 of 3 taken" rather than "unknown" — a dose could be re-taken.
3. **ThingGeek:** saving Edit drops a photo or document that finished uploading after the dialog opened.
4. **StoryGeek:** a turn that times out on the client is still saved by the server; the input is handed back and Send plays the action twice. ✔ (`StoryPlay.jsx` — the code comment admits the mirror case, but the input is still restored)
5. **StoryGeek:** no per-story lock around a multi-minute turn; two devices or a retry race a whole-document save.
6. **ThingGeek:** the server's "today" is the UTC day — from about 6–7 pm Central, due-today reads "Overdue by a day". ✔ (`thinggeek/dates.js:44` `todayUtc`). Same class as TodoGeek 1.1; `glanceAsk` has it too.
7. **FitnessGeek:** Weight, BP and Home only ever see the newest 100 rows; trends and pace are silently truncated. ✔ (`weightController.js:14` `limit = 100`)
8. **StartGeek:** double Enter in the command box creates duplicate tasks; a failed follow-up step leaves the text and a retry duplicates. (TodoGeek's new `clientId` fixes the server side once the client sends one.)
9. **BookGeek:** Add book duplicates on retry when the file upload fails after the create; a reading-progress save is dropped by its debounce.
10. **ThingGeek:** Walk discards creates that failed or are still saving when you leave.
11. **Unsaved-changes guards are missing suite-wide:** FitnessGeek recipe builder / food edit / meal edit, ThingGeek Edit and Attic forms, StoryGeek composer draft. One shared guard, built on the new `useBackToClose`, would cover them.
12. **GameGeek:** a deleted game can never return through Playnite and the dialog doesn't say so; BookGeek REST delete leaves readings behind.

**2 — Failed loads that look like "nothing"**

FlockGeek ("0 eggs a day"), StartGeek (empty day; network blip at startup shows the signed-out console), NewsGeek ("Older stories" failure swallowed). Same fix pattern as TodoGeek 1.12.

**3 — Stale after resume**

FitnessGeek, NewsGeek and StartGeek do not refetch when the PWA returns to the foreground. One shared `useRefetchOnResume` hook (visibility + online, throttled) would serve all of them; TodoGeek's new one is the model.

**4 — Shared client**

No timeout on the refresh or `/api/me` fetches (a dead connection can freeze an app); mixed "not signed in" error shapes across gateway modules; only `createTask` is idempotent; memory-only cache; the stale-bundle reload and the session-death redirect give apps no chance to save drafts; the basegeek console has no session refresh.

**5 — Speed**

FlockGeek fetches every egg record to find the last harvest; FitnessGeek re-runs eight Home reads (five live Garmin calls) after every food write; StoryGeek copies the full transcript into the story document at every checkpoint, uncapped.

**6 — CI**

`packages/task-grammar` and `packages/schemas` have no CI job, though three places depend on the grammar.

## Decisions for Chef

| # | Question |
|---|---|
| S-D1 | GameGeek: should one household member's delete remove the other's shelves, ratings and notes? |
| S-D2 | GameGeek: `hoursPlayed` is still fetched on every card and "Log session" is a main action, against the no-hours rule. Remove? |
| S-D3 | BookGeek: is the in-browser EPUB reader used? If so it should save its position (the login screen promises it). |
| S-D4 | ThingGeek: a household timezone setting, or assume America/Chicago? |
| S-D5 | Soft delete suite-wide (StoryGeek stories, BookGeek books, FlockGeek records), as NoteGeek now has? |

## Suggested order

1. Shared gateway/auth plumbing (items 1 and 4 above) — fixes a class for every app.
2. Shared hooks: unsaved-changes guard, refetch-on-resume — then apply per app.
3. ThingGeek, FitnessGeek, StoryGeek (small parts), StartGeek.
4. BookGeek, GameGeek, NewsGeek, FlockGeek.
5. StoryGeek transcript storage (the one larger item).

---

# Appendix — inspector reports, as written



---

## inspect-shared — what every app shares (2026-11-15, read-only)

Scope: packages/{auth,user,api-client,collection,tags,backdrop,utils,logger,schemas,crypto-vault}, basegeek UI,
gateway plumbing (server.js, middleware, graphql/index.js + shared, auth/refresh/CSRF/rate limits/errors),
PWA standard vs. the apps, CI/deploy. Marks: V = verified in code, ? = needs a device/measurement.
Skipped as told: packages/ui, tools/mobile-harness. Not re-reported: release-on-red, fleet restart per push,
Watchtower digest/env/DNS, CSRF=report (Q18b parked), nginx body limits.

### 0. The headline

The suite-wide cause behind "an expired session looks like an empty list" is one decision in one place:
**/graphql is mounted behind `optionalUser()`, and a presented-but-invalid/expired token is treated as
anonymous (HTTP 200)**. NoteGeek and TodoGeek were patched resolver by resolver; the shared gate was not.
FlockGeek and the cross-app tag queries have the same defect today. Fix once at the mount (see S1).

Verdicts per area:
- Auth/session client: well engineered after the B1/B2 work, with three gaps (no fetch timeouts, hard redirect
  on session death, basegeek UI has no refresh at all).
- Gateway plumbing: solid (fail-closed 503 on validator outage, in-process validator, CSRF, health, shutdown).
  One systemic hole (anonymous = empty), one inconsistent error contract.
- api-client: correct but minimal; it has no cache config, no persistence, no retry, no idempotency, and
  its timeout is opt-in only.
- PWA: in good shape. `tools/pwa-audit.mjs` runs clean on all 11 apps today. Doc is stale; offline = shell only.
- CI/deploy: broad test coverage; two shared packages untested.
- Crypto-vault, logger, utils/dates: good. Nothing to report beyond notes below.

---------------------------------------------------------------------------------------------------

### 1. Gateway: sessions, anonymous requests, error shape

#### S1. Expired/invalid token is served anonymously; FlockGeek and Suite-tags answer "empty" with HTTP 200   (V, M)
- Where: apps/basegeek/packages/api/src/server.js:490 (`optionalUser({ validateSession: localSessionValidator })`);
  packages/user/src/server/attachUser.js:84-121 (any `invalidSession` with `required:false` -> `next()` anonymous);
  middleware/auth.js:37 (expired JWT = `ok:false`); flockgeek/resolvers.js:63-65 `currentUser()` + 17 queries
  `if (!ownerId) return []` (e.g. :114-138); suitetags/resolvers.js:49-51,155-157 (`scopes()` null -> `[]`).
- Mechanism: the access cookie `geek_token` has `maxAge` 1 h (routes/auth.js:35) and the JWT 1 h. After an hour the
  browser drops the cookie; any Bearer from localStorage is expired. Request goes anonymous, resolver says
  "no rows", Apollo sees `data: { birds: [] }` and nothing triggers the shared 401 -> refresh -> retry path.
  The 50-minute refresh timer sleeps while Android freezes the PWA, so "open the app after lunch" hits this
  window. Fixed for NoteGeek/TodoGeek only by throwing in their resolvers.
- User sees: FlockGeek shows an empty flock / no egg records (and a "log egg" afterwards throws Unauthorized, so the
  first visible signal is a failed write); StartGeek/NoteGeek tag views show no cross-app results.
- Fix (once, at the gate): in the /graphql mount, if a token was PRESENTED and `validateSession` threw
  `invalidSession`, answer `401 { errors:[{ message:'Authentication required', extensions:{code:'UNAUTHENTICATED'} }] }`
  instead of `next()`. Keep "no token at all" anonymous. The shared errorLink already turns a networkError 401 into
  refresh-once-and-retry, so every app heals with no client change. Add a gateway test that an expired JWT yields 401.
  Belt and braces: make flockgeek `currentUser`-guarded reads throw UNAUTHENTICATED (the file comment says
  "reads that degrade to empty" on purpose; that was right for a gate that never lied, wrong for this one).

#### S2. Three different "not signed in" shapes; clients depend on a substring match   (V, S)
- Where: flockgeek/newsgeek/basegeek/todogeek throw `extensions.code: 'UNAUTHENTICATED'`; bookgeek/glance/gamegeek/
  thinggeek/fitnessgeek throw `new Error('Unauthorized')` with `err.code = 'UNAUTHORIZED'` (bookgeek/resolvers.js:102,
  glance/resolvers.js:39, gamegeek/resolvers.js:144, thinggeek/attic/resolvers.js:72, fitnessgeek/ownership.js:41,
  resolvers.js:856); gamegeek even sets `extensions.code: 'UNAUTHORIZED'`.
- Effect: Apollo Server 4 ignores a bare `err.code`; the response code becomes INTERNAL_SERVER_ERROR. The shared
  errorLink (api-client/src/index.js:154-165) only recovers because it ALSO matches `message.includes('Unauthorized')`
  or `includes('401')`. StartGeek's own `gql()` matches `/unauthori[sz]ed/i` the same way.
- Risks: (a) any error whose message contains "401" (an id, a count, a title echoed in a message) or "Unauthorized"
  (a real household-permission denial) fires a session refresh + one operation replay; harmless once, but a replayed
  mutation whose first run partly succeeded is a duplicate. (b) a new app that words the error differently never refreshes.
- Fix: one `requireUser(context)` in graphql/shared that throws `GraphQLError(..., {extensions:{code:'UNAUTHENTICATED', http:{status:401}}})`
  (todogeek/resolvers.js:89-101 already has the right shape, with `http.status: 401`); migrate the 6 copies; in the
  errorLink drop the `'401'` substring and keep `'Unauthorized'` only as a legacy fallback. A genuine permission
  denial should be `FORBIDDEN` and must not refresh.

#### S3. Login rate limit counts successful logins and is per-IP   (V for config, ? for impact)
- Where: routes/auth.js:69-77 (`max: 5` per 15 min on /login, no `skipSuccessfulRequests`).
- User sees: two people and a few devices behind one home IP (Chef + Heather, phone/tablet/desktop, a mistyped
  password) get "Too many login attempts" for up to 15 minutes. In-memory store, so a push to main resets it (not a
  fix, an accident).
- Fix: `skipSuccessfulRequests: true`; key by IP+username for the failure count. **S**.

#### S4. Body-parser / cors errors surface as `500 Internal Server Error`   (V, S)
- Where: server.js:670-677 error handler ignores `err.status`/`err.statusCode`/`err.type`.
- Effect: malformed JSON or an over-limit body (`entity.too.large`, 50 MB cap) reports 500 + a requestId; clients and
  logs read it as a server bug, and Apollo treats 5xx as "infrastructure, do nothing" (api-client:148) so nothing is shown.
  Same for the cors origin error.
- Fix: `if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ message: err.expose ? err.message : 'Bad request', code: err.type })`. **S**.

#### S5. No rate limit or cost guard on /graphql itself   (V, M, low priority)
- Where: server.js (rate limits exist only on /login and /register; AI has its own policy service).
  `new ApolloServer({ typeDefs, resolvers })` with no depth/alias/complexity limit and no `formatError`.
- Effect: a buggy client loop (a refetch storm, a stuck retry) is unthrottled and so is a leaked cookie. Production
  hides stack and introspection (NODE_ENV=production in compose), so this is hardening, not a hole. Closed user list.
- Fix: per-user token bucket plugin (e.g. 120 req/min, higher for AI-free apps), `formatError` that logs the requestId
  and masks non-GraphQLError internals.

#### S6. `authenticateToken` (REST) answers an expired token with 403, not 401   (V, S)
- Where: middleware/auth.js:36-39. `setupAxiosInterceptors` therefore must treat 403 as "refresh" (auth/authClient.js:813),
  which means every genuine 403 (admin-required, household denial, CSRF is exempted) also rotates the refresh token.
  Rotation is the thing the reuse-detector punishes, so extra rotations raise the chance of a spurious
  REFRESH_REUSE logout when two tabs race.
- Fix: 401 for missing/expired/invalid tokens, 403 only for authorization; then the interceptor refreshes on 401 only. Needs a
  one-release overlap (clients already accept both). **S-M**.

---------------------------------------------------------------------------------------------------

### 2. @geeksuite/api-client (being edited; design review)

#### A1. No timeout on the refresh or `/api/me` fetches; everything waits on them   (V, S)
- Where: auth/src/authClient.js:367 (`fetch(.../auth/refresh)` with no `AbortController`), :476-512 getMe's fetch;
  api-client/src/index.js:20 `await waitForRefresh()` in authLink; axios interceptor :751-755 the same.
- User sees: on a dead-but-connected network (captive Wi-Fi, tunnel dropped, phone leaving a lift) one hung refresh
  blocks EVERY Apollo operation and every REST call in the app indefinitely: spinners that never end, saves that never
  fire. The session keeper's retry ladder (sessionKeeper.js) never starts because `getMe()` never rejects; the splash
  stays up. This is the suite-wide cousin of TodoGeek's frozen add box (their per-call timeout does not cover this
  because the wait is in authLink before the request exists, though timeoutLink sits before authLink and does count it).
- Fix: `AbortSignal.timeout(15000)` on both fetches (a TimeoutError is not a session-expired error, so the session is
  kept); `waitForRefresh` gets a 10 s cap so a stuck refresh cannot hold requests. **S**.

#### A2. Timeout is opt-in; no automatic retry for transient failures; no idempotency   (V, M)
- Where: api-client/src/index.js:226-290 (explicit, and sound, design), :287-290 `createApolloClient`.
- Effect: every other call in all 8 apps waits on the browser's own timeout (minutes) and fails once on a blip.
  Reads should be retried; writes must not be without a key. Only TodoGeek's `createTask(clientId)` is idempotent.
  Everywhere else a double-tap or a user retry after a timeout creates duplicates: `createThing`, `addFoodLog`,
  `addFitnessWeight`, `addBloodPressure`, `createBird`, `addHealthRecord`, egg/hatch logs, BookGeek add. Nothing retries
  automatically today, so this is a UI double-tap problem, but the moment a retry link is added it becomes real.
- Fix: add `RetryLink` for query operations only (2 retries, jittered, network errors and 502/503/504 only); give mutations
  an optional `clientMutationId` convention (hidden unique index per collection, as TodoGeek did) and add it to the
  create mutations that matter first (food log, weight, BP, egg log). Set a suite default `timeoutMs` for queries
  (30 s) and keep AI/mutation calls opt-in. **M**.

#### A3. Memory-only cache, not configurable; cold start offline is an empty shell   (V, M)
- Where: api-client/src/index.js:289 (`new InMemoryCache()`), no `typePolicies`, no persistence, no `defaultOptions`.
  gamegeek/src/graphql/cachePolicies.js:3-6 documents the workaround ("cannot configure up front, so added at runtime
  with `cache.policies.addTypePolicies`"). Apps also build their own clients (fitnessgeek/src/services/apiService.js:6
  AND `GeekSuiteApolloProvider` in main.jsx:18 = two separate caches).
- User sees: opening any installed app with no signal (basement, flight, tunnel) shows the shell and errors; reading
  a note, today's tasks, the shopping/food log, a book's details all need the network. Offline is the PWA's main selling
  point and the data layer gives it nothing. Combined with the Service Worker's NetworkOnly for /graphql (correct for
  freshness) this is a conscious gap, but nobody has written it down as one.
- Fix: `createApolloClient(appName, { cache, defaultOptions, persist })`; opt-in `apollo3-cache-persist` to IndexedDB for
  apps that read mostly (NoteGeek, TodoGeek, BookGeek, GameGeek, NewsGeek), purge on logout/user change (the cache holds
  another household member's data), `maxSize`, and versioned by the schema hash so a deploy does not read an old shape.
  Put the offline write queue (NoteGeek/TodoGeek plans) on the same layer. **M-L**. Not worth it for fitnessgeek's REST-shaped imperative client until that moves.

#### A4. A "stale bundle" reload can discard unsaved work   (V, S)
- Where: api-client/src/index.js:97-110 `reloadForStaleBundleOnce`, triggered by any `GRAPHQL_VALIDATION_FAILED`.
- Effect: a single bad query from a client bug (not a stale bundle) reloads the tab once per 10 minutes, mid-edit, with no
  chance to flush. The reload also does not check `document.visibilityState`.
- Fix: dispatch a `geeksuite:before-reload` event (apps flush drafts), reload only when hidden or after a "new version,
  tap to reload" toast; if the same query fails twice after reload, stop and show the error. **S**.

#### A5. Session death hard-redirects with no hook to save drafts   (V, S)
- Where: api-client/src/index.js:200-207 (`logout()` then `loginRedirect(appName, window.location.href)`);
  auth/src/AuthProvider.jsx:44-49,78-85 (clears user, unmounts the app).
- Effect: a refresh token that is truly dead (30 days, or reuse-revoked) sends the user to the login page the instant any
  operation fails; an open NoteGeek editor or unsent FitnessGeek entry is lost. Rare, but the cost is total.
- Fix: before `loginRedirect`, emit `geeksuite:session-ending` (apps stash drafts to IndexedDB; ties into the NoteGeek
  draft plan) and delay the redirect to a "Session ended, sign in" sheet instead of navigating away. **S-M**.

#### A6. Smaller api-client/auth items   (V, S each)
- `localStorage.getItem('geek_token')` is unguarded (api-client:22, authClient.js:237, 249, 255): a throwing storage
  (blocked/private) breaks every request. `readCachedUser` already guards; do the same here.
- errorLink retry path on UNAUTHENTICATED replays the *operation*; for graphQLErrors it re-sends mutations that may have
  executed (see S2). Only replay when the first response carried no `data` for that operation.
- Tokens live in localStorage AND HttpOnly cookies (auth is cookie-first server-side); the localStorage JWT is only needed
  by the Bearer path. Dropping it would remove the XSS-readable copy; design call, mention only.

---------------------------------------------------------------------------------------------------

### 3. basegeek UI (apps/basegeek/packages/ui)

#### U1. The console has no session refresh at all   (V, M)
- Where: src/api.js (own axios, "deliberately NOT" through `setupAxiosInterceptors`), src/components/AuthContext.jsx:96-104
  (hydrates from `GET /auth/profile`, any failure -> logged out), grep finds no `/auth/refresh` call anywhere in src/.
- Effect: the access cookie lives 1 h. After an hour idle the console treats you as signed out and sends you to the password
  form even though a 30-day refresh cookie is sitting there; mid-session, aiGeek/DataGeek REST panels start failing with 401
  and render as errors (they cannot self-heal). It is masked whenever another suite app was used in the meantime (its refresh
  renews the shared cookie). Apollo calls in the console do refresh (they go through the shared client); REST ones do not,
  so the two halves disagree.
- Fix: the comment's reason ("this UI package does not depend on @geeksuite/auth") is not a good one; add the dependency and call
  `setupAxiosInterceptors(api)` + `startRefreshTimer`, or at least a single 401 -> `POST /auth/refresh` -> replay interceptor and
  try refresh before showing /login. **M**.

#### U2. One 1.1 MB eager bundle for a rarely-phoned admin console   (V, S)
- Where: src/App.jsx:5-16 imports every page eagerly; dist/assets/index-*.js = 1.15 MB (all aiGeek panels, theme, DataGeek).
- Effect: slower first paint of the one app that includes the portal/login path; low priority since it is an admin tool.
- Fix: `React.lazy` for DataGeek, UserGeek, AIGeek, Settings. **S**.

---------------------------------------------------------------------------------------------------

### 4. PWA standard vs. reality

Verdict: the implementation is better than the document. `node tools/pwa-audit.mjs`: 0 problems across 11 apps.
Auth bypass first, SPA fallback 404s asset paths, html-poisoning guards, build-stamped hand-rolled SWs: all real.

#### P1. Offline means "shell opens, data does not"   (V, see A3)
- All Flavor-A apps precache `index.html` and use `navigateFallback: index.html`, so `offline.html` is precached but never
  served (the standard's "Cache -> Network -> /offline.html" is only true for the Flavor-B apps).
  Flavor B (flockgeek/storygeek/bookgeek/startgeek sw.js) answers a navigation to any deep link that is not `/` with
  offline.html when the network is down (`caches.match(request)` misses, fetch fails, only `mode === 'navigate'` falls back to
  offline.html, flockgeek/frontend/public/sw.js:93-100), so an installed FlockGeek opened offline at a restored deep link
  shows the "you're offline" page instead of the app shell.
- Fix: in Flavor B fall back to `caches.match('/')` (the cached shell) for navigations, then offline.html. **S** per app.

#### P2. Update behaviour differs per app; only FitnessGeek protects typing   (V, informational)
- fitnessgeek vite.config.js:86,103 `registerType: 'prompt'`, `skipWaiting: false`, applies the update when hidden;
  notegeek/todogeek/gamegeek/newsgeek/thinggeek use `autoUpdate` + `skipWaiting: true`; hand-rolled SWs call
  `self.skipWaiting()` at install. Chef decided on skipWaiting (memory 2026-10-04) so no re-proposal; but the reason
  FitnessGeek gave (reload mid-typing on every main push) applies hardest to NoteGeek's editor, and every push to main
  redeploys. If NoteGeek's draft-to-IndexedDB (their 1.2) lands, this is covered; until then it is exposed.

#### P3. PWA_STANDARD.md is stale   (V, S)
- Says basegeek "ships no service worker" and "n/a" (pwa-audit reports basegeek as flavour A with 22 precached files);
  Flavor A "Used by fitnessGeek, NoteGeek, TodoGeek" (also gamegeek, newsgeek, thinggeek, basegeek); todogeek row "pending R90";
  the code-splitting table has two apps. Update the tables and add the audit command as the way to verify.

#### P4. Share target only in FitnessGeek and NoteGeek, `/share-target` denylist only in those   (?, no action unless a share target is added)
- Any app adding `share_target` must copy the `navigateFallbackDenylist: [/^\/share-target/]` rule, or the SW swallows the POST
  (documented in fitnessgeek vite.config.js:106-117 but not in the standard).

---------------------------------------------------------------------------------------------------

### 5. CI / deploy

#### C1. No tests run for @geeksuite/task-grammar or @geeksuite/schemas   (V, S)
- Where: .github/workflows/ci.yml has jobs for collection, utils, tags, crypto-vault, api-client, auth, logger, user, backdrop,
  ui; none for packages/task-grammar (no test files, no `test` script) or packages/schemas (no tests; covered only indirectly by
  basegeek jest). task-grammar is now the parser for NoteGeek handwriting, TodoGeek add box AND the gateway, so a regression
  ships to three places. 
- Fix: add vitest/node:test for the grammar (table of inputs -> parsed tasks, including the 6 pm / UTC-midnight cases from the
  review) and a CI job; cheap. **S-M**.

#### C2. The shared-package jobs run in isolation; nothing runs them against the app suites that consume them   (?, M)
- Memory says "shared-package change => run ALL app suites"; CI does run every app job on every push (paths-ignore is only docs),
  so this is covered by volume, not by intent. Note for the next CI change: if path filters are ever added, shared packages must
  fan out to all apps.

#### C3. `release.yml` `workflow_dispatch` input is interpolated into shell   (V, S, low)
- Where: release.yml:44 `echo "apps=[\"${{ github.event.inputs.app }}\"]"`. Only repo writers can dispatch, so low risk; pass it as an
  `env:` var and validate against `apps/*/Dockerfile` names. Matrix also builds all images for any non-doc change (known).

---------------------------------------------------------------------------------------------------

### 6. Smaller shared findings

- **glanceAsk "today" uses the server clock**: glance/resolvers.js:25-27,691 `fetchGlanceToday(context)` with no date -> container
  TZ (no `TZ` in any compose file -> UTC). The AI answers "what's due today" from tomorrow's snapshot after 6 pm Central
  (7 pm summer). The screen itself is right (StartGeek passes its local date, GlanceContext.jsx:8-13,36). Fix: pass the client's
  local date into `glanceAsk`. V, S.
- **AI daily spend cap resets at 6 pm Central**: models/AISpend.js:87 uses `toISOString().slice(0,10)` (UTC day). Cosmetic for a
  $0.50/day cap; mention only. V.
- **packages/utils/dates.js is excellent** and documents the calendar-date vs instant split; the remaining
  `toISOString().split('T')[0]` sites are on stored UTC-midnight dates (schemas' `formatted_date` virtuals), which is correct, but
  glance/askService.js:396,459 apply it to `dueDate`, which for a TIMED task is not a calendar date (TodoGeek review 1.1).
  Will be right once `hasDueTime` lands. ?
- **crypto-vault**: AES-256-GCM, random 12-byte IV per call, versioned `v1:` format, small and tested. No findings.
- **logger**: redaction of auth headers, cookies, api keys and password fields is in place at the shared layer (src/index.js:31-65). No findings.
- **user/server csrfGuard + csrfTokenGuard + ensureCsrfCookie**: ordering in server.js is right (before cors and body parsing);
  token guard still `report` by choice (Q18b).
- **collection / tags / backdrop**: have CI jobs and tests; nothing to add after skim.

---------------------------------------------------------------------------------------------------

### Priority list for a build pass (impact / effort)

1. S1 gateway: reject presented-but-invalid tokens with 401 (fixes FlockGeek + tags, protects every future module). S
2. S2 shared `requireUser` with UNAUTHENTICATED + 401 and trimmed errorLink substring matching. S-M
3. A1 timeouts on refresh/getMe + capped waitForRefresh. S
4. U1 basegeek UI refresh interceptor. M
5. A4/A5 pre-reload / pre-redirect draft-flush event (pairs with NoteGeek draft plan). S-M
6. S3 login limiter skipSuccessfulRequests. S
7. A2 RetryLink for queries + `clientMutationId` on the four highest-value creates. M
8. A3 configurable cache + opt-in IndexedDB persistence (NoteGeek/TodoGeek first). M-L
9. C1 grammar tests + CI job. S-M
10. S4 error handler status mapping, P1 Flavor-B shell fallback, P3 doc refresh, C3. S each

### Worth a build pass? 

- Gateway/auth plumbing: **yes**, items 1-3 and 6 are small and fix a whole class (silent empty lists, hung spinners) for all 8 apps at once.
- api-client: **yes**, but sequence after the other agent's current edits (A2/A3 are design changes to that file).
- basegeek UI: **yes, small** (U1 only; U2 optional).
- PWA: **no build pass**; doc refresh plus the Flavor-B navigation fallback only.
- CI: **small**: add task-grammar tests/job, harden the dispatch input.


---

## inspect-things-news — ThingGeek + NewsGeek (read-only review, 2026-11-15)

Context read: DOCS/THINGGEEK_PLAN.md (privacy rule), apps/newsgeek/DOCS/CONTEXT.md, SUITE_TODO ThingGeek items.
Harness screenshots for both apps are dated 2026-10-10, so I did not use them as evidence. Everything below was checked in code.
Paths are relative to /mnt/Media/Projects/GeekSuite. GW = apps/basegeek/packages/api/src/graphql. TG = apps/thinggeek/frontend/src. NG = apps/newsgeek/frontend/src.

## ThingGeek

Verdict:
- Well built. Tenancy, trash and restore, dedupe uploads, the vault lock and the Add/Walk flows have clearly been thought through.
- The defects that matter are in lost work: one data-eating race in Edit, one silent discard in Walk, and an evening "today" bug that mislabels due dates.
- Identifier privacy: NO path to AI found (see end). Nothing to flag.

### Findings (by impact)

#### 1. Saving the Edit dialog drops a photo or document that finished uploading after the dialog opened (V) — M
- Where: TG/views/edit/EditThingDialog.jsx:48-51 (photos/documents seeded once on open), :90-107 and :61-75 (sent as a whole list), :141-153 (seed only on `open`, with a comment saying uploads finishing underneath are safe). Server: GW/thinggeek/resolvers.js:507-522 `attachmentsValue` maps only the ids in the input, and :1035-1040 replaces `thing.photos` whole. The upload route does an atomic `$push` (apps/thinggeek/backend/src/routes/fileRoutes.js:~130).
- What happens: take a photo in Add, the upload runs in the background (useUploads, 12 MB on weak signal), tap "Record the serial" or Edit, then Save. The new photo is not in the form's list, so the thing is saved without it. The file stays on disk, unreferenced, and is purged later. No error is shown. The same applies to a document, and to a second phone that uploads while the first has Edit open.
- Fix: send `photos`/`documents` only when the user actually changed them (removed, re-roled, captioned). Better, make the server treat the list as patches: apply role/caption changes and removals by id, and leave any id it wasn't told about alone. Also stop the dialog saving while `useUploads(thing.id)` has in-flight items, or merge them into the form.

#### 2. After about 6-7 PM local, everything due "today" reads "Overdue by a day" and "Due in N days" is off by one (V) — S/M
- Where: GW/thinggeek/dates.js:~44-46 (`todayUtc`), used by resolvers.js:697, :874, filters/pipelines, and the Attic (GW/thinggeek/attic/resolvers.js:286, :368 use the same arithmetic). The frontend comment at TG/utils/dates.js:11 already names the problem ("After 7 PM in Chicago an instant's UTC date is already tomorrow") but the server side still uses UTC "today".
- What happens: Chef is on US Central. At 7 PM CST the server's "today" is already tomorrow. A warranty or registration due today shows "Overdue by a day" and sits in the overdue bucket. One due tomorrow shows "Due today". The Needs attention list, the due facets and the `nextDue` sort all shift the same way. It is wrong every evening and right every morning, which is the kind of thing that erodes trust in a reminder app.
- Fix: the household (or viewer) needs a timezone. Either store `timeZone` on ThingProfile and compute `today` as the local calendar day in that zone, expressed as UTC midnight so the arithmetic is unchanged (one function, `todayUtc(now, tz)`), or have the client send a `today` string with Things/Attention queries. The dates.js header says the JS and Mongo versions must agree, and `thinggeekDates.test.js` already pins that, so the change is one parameter.

#### 3. Walk: "Done", Back or a tab switch silently discards creates that failed or are still saving (V) — S
- Where: TG/views/walk/WalkRoom.jsx:393 `doneWalking` is a bare `navigate`; failed/needs-fix rows and their photos live only in component state (`items`, :285-345). Nothing warns on leave.
- What happens: in a garage with a bad signal, a create fails and the row says "Didn't save - retry". Tap Done to look at the room: the row, its name and its photo are gone, never saved. Same for a name typed but not yet "Next"-ed, and for a create still in flight when the screen unmounts (the request continues, but its photo enqueue at :309 runs against an unmounted component's items only; the photo still enqueues, so that part is fine).
- Fix: on Done/Back, if any item is `failed`/`needs`/`saving` or `name` is non-empty, show a confirm sheet ("2 things didn't save - Keep retrying / Discard"). Cheap alternative: keep failed items in a small module-level or sessionStorage list and restore them on re-entry.
- Related (V, S): a create whose response is lost (xhr/fetch error after the server wrote it) is retried as a new create, so a duplicate Thing results (Add, Walk both). Sending a client-generated `clientId` that createThing de-dupes on would close it. Same for upload Retry (useUploads.jsx:35-49 re-sends after an `onerror`; server dedupes the bytes by sha256 but still pushes a second photo entry, fileRoutes.js:~120).

#### 4. Edit dialog has no unsaved-changes guard (V) — S
- Where: TG/views/edit/EditThingDialog.jsx:184-197 (Cancel and `onClose` just close); GeekDialog gives Android Back = close (packages/ui/src/surfaces/GeekDialog.jsx `backToClose`), so one stray Back or a backdrop tap on desktop throws away a long form (value, dates, notes, serials).
- Fix: track `dirty` (compare `formToInput(form)` with the same on the seeded form) and confirm on close when dirty. The same would help AtticDocumentForm (TG/views/attic/AtticDocumentForm.jsx:362 Cancel navigates away with typed identifiers and chosen files).

#### 5. Photos taken in Add are held in memory only; an Android tab kill drops them (? on frequency, V on mechanism) — M
- Where: TG/hooks/useUploads.jsx:23-50 (queue is React state; the File lives in memory).
- What happens: Add creates the thing, then the photo uploads. If the PWA is backgrounded and killed during a slow upload (common right after taking a 12 MB photo), the thing exists with no photo. It does show as `missing: photo` in Needs attention, so it is recoverable, but the photo is gone.
- Fix: S for a `beforeunload`/`visibilitychange` warning while `items.some(uploading)`; M to persist the File in IndexedDB and resume on next launch. Probably only worth the S.

#### 6. Walk "Remove the photo" is 26x26 px (V) — S
- Where: TG/views/walk/WalkRoom.jsx:~120-135 (width/height 26, minWidth 26). Phone-first app, one-handed in a garage. Make the hit area 44 px with the visual badge kept small (pseudo-element or padding).

#### 7. Insurance CSV does not neutralise spreadsheet formulas (V, low) — S
- Where: TG/utils/insuranceCsv.js:48-51 `csvCell`. A name, note or `acquiredFrom` starting with `=`, `+`, `-` or `@` is evaluated by Excel/Sheets. Input is household members only, so the risk is mostly accidental ("-20C freezer"). Prefix a `'` for text cells starting with those characters (not for the numeric columns).

#### 8. Minor
- (V) Upload dedupe has no unique index: packages/schemas/thinggeek/file.js:26 is `{householdId, sha256}` non-unique, while storeFile.js:~95 handles error 11000 "once a unique index exists". Two simultaneous uploads of the same photo can create two ThingFile records. The purge copes, so cosmetic. Make the index unique after a one-off dedupe check.
- (?) Attic absolute 60-minute lock (useVault.jsx header) can unmount AtticDocumentForm mid-edit and drop typed identifiers; the idle timer is fine because typing pings. Rare; only matters for very long sessions.
- The same `updateThing` whole-array replace also applies to `relationships` and `dates` (last write wins between two devices). Fine for a two-person household; noted, not worth a build.

### Identifier / AI privacy check (required)
Searched apps/thinggeek (backend + frontend) and GW/thinggeek, plus basegeek routes and any MCP code, for aiGeek/openrouter/vision/OCR/transcribe/`need:`/llm calls. None exist: the plan's "Ask" feature is still unbuilt, and no code in ThingGeek calls an AI provider. Serials leave the app only through the insurance CSV/printout (by design) and are searchable inside the household (filters.js:60-62). One watch item for the future: the `fields` resolver (GW/thinggeek/resolvers.js:~710-718) returns identifier values on every list query, so when "Ask" is built, strip identifiers at the tool boundary, not in the prompt. Nothing to fix today.

### Worth a build pass? YES, small.
Findings 1, 2, 3 and 4 are real data-trust bugs for an app that exists to be reliable on a bad day. About a day of work total (1: M, 2: M, 3-4: S each). The rest is polish.

---

## NewsGeek

Verdict:
- In good shape. Reads are bounded (page limit, 90-day retention, embeddings projected out), ingest is polite and idempotent, future-dated items are clamped, and the add-source flow has abort, retry and duplicate handling.
- Almost nothing is lost-work territory because there is almost no user input. The real gap is staleness: an installed PWA never refreshes itself.
- Feed hygiene and clustering are already planned, so not reported.

### Findings (by impact)

#### 1. The paper never refreshes when the PWA is resumed (V) — S
- Where: NG/views/TodayView.jsx:112-125 and NG/views/LatestView.jsx:~99-106 query with `cache-and-network` once on mount. There is no `visibilitychange`, focus or poll anywhere in apps/newsgeek/frontend/src (grep returns nothing). AppMain remounts per route so tab switching refetches, but resuming the same screen does not.
- What happens: open the installed app at breakfast, leave it, come back after lunch (Android keeps the page alive): you read the morning's front page under "Today's paper" and the "N minutes ago" times are frozen. For a news app this is the main-job failure.
- Fix: a small hook `useRefetchOnResume(refetch, { minAgeMs: 10 * 60 * 1000 })` on `visibilitychange` in Today and Everything; show the page's `generatedAt` (already in the front-page payload) as "Updated 8:05 AM" so staleness is visible. Also tick TimeAgo (NG/components/TimeAgo.jsx) on resume.

#### 2. Back from a story opened in this window loses your place (V) — M
- Where: NG/components/AppMain.jsx:14-16 always scrolls to top on route change and remounts; LatestView refetches with `cache-and-network`, which replaces a list that "Older stories" had grown (cachePolicies.js merge only appends when `before` is set; a first-page refetch returns `incoming`). Applies when the reader turns off "open in a new tab" (`openInNewTab`, ArticleItem.jsx:~83).
- What happens: read story 25 down the page, Back: you are at the top of a 10-story list. Today has the same top-of-page reset.
- Fix: scroll memory keyed by route + section (the suite already has `useScrollMemory` in @geeksuite/collection; ThingGeek uses it, TG/views/LibraryView.jsx:124), and on return use `cache-first` for one render so the grown list survives. For Today, restoring scrollTop after the data renders is enough.

#### 3. Paging cursor is `publishedAt` only, so stories that share a timestamp at a page boundary are skipped (V) — S
- Where: GW/newsgeek/resolvers.js:~790-800: sort is `{publishedAt:-1, _id:-1}` but the cursor is `publishedAt < before` (and `nextBefore` is a bare date, :~830). Feeds publish with one-second resolution and batch items (NWS alerts, press releases) often share a second.
- What happens: any item with exactly the boundary timestamp that did not fit on the page is never shown by "Older stories". Rare, silent, and mostly affects batch publishers.
- Fix: compound cursor (`publishedAt` + `_id`) as an opaque string; query `{$or:[{publishedAt:{$lt:t}},{publishedAt:t,_id:{$lt:id}}]}`. Needs a typeDefs change (nextBefore stays a String/scalar; the client passes it back untouched), so deploy gateway first per the schema-order landmine.

#### 4. "Older stories" failure is swallowed (V) — S
- Where: NG/views/LatestView.jsx:~143 `fetchMore(...).catch(() => {})`. On a flaky phone connection the button just re-enables with no message. Add a toast ("Couldn't fetch older stories. Try again.") like the Free-to-read handler does.

#### 5. Minor / polish
- (V) No share target: adding a source means opening the app and pasting a link. A Web Share Target in the manifest that opens `AddSourceSheet` with `initialUrl` and `autoRun` (both props already exist, AddSourceSheet.jsx:~259) would cut the main add flow to one tap from the browser. Enhancement, not a defect.
- (?) Dates without a timezone in feeds (some local Arkansas papers) parse as UTC in the container, shifting items 5-6 h; the "more than an hour in the future" clamp (backend normalize.js:213-221) then replaces them with fetch time. Harmless to ordering, but the displayed time can be off. Needs a look at real feed samples before doing anything.

### Worth a build pass? YES, but tiny.
Finding 1 (resume refresh) is worth doing now (an hour). Findings 2-4 are small and can ride along. No structural work needed; the app is otherwise ready to leave alone.


---

## Inspect: FitnessGeek (2026-11-15, read-only)

### Verdict
- In good shape. The October review's lost-work fixes hold (composer drafts, undo on food/weight/BP/meds, save-failure handling in the weight dialog, stale-day guards, "today" from the device). Back-button handling is already inherited through PremiumDialog -> GeekDialog.
- What is left is mostly "the app never re-reads": nothing refetches when the installed PWA comes back to the foreground, and the Weight and BP pages silently stop at 100 rows.
- One lost-work path remains (long forms close without a guard) and one speed item (Home re-fires live Garmin calls on every food write).
- Harness desktop screenshots (dated 2026-10-16/17, stale) show a sound layout; no tablet scenes exist, so tablet is unaudited.

### Findings (by impact)

#### 1. Weight and BP pages (and Home) only ever see the newest 100 rows  [V] — M
- Where: apps/fitnessgeek/backend/src/controllers/weightController.js:14 and bloodPressureController.js:11 (`limit = 100` default); callers pass no limit: hooks/useWeight.js:24, pages/BloodPressure.jsx:169, pages/DashboardNew.jsx (the `getWeightLogs()` / `getBPLogs()` calls in `loadDashboardData`). The response carries `limit`/`offset` (weightController.js:42) but the frontend ignores any "more" signal.
- User impact: a daily weigher passes 100 days around now; a twice-daily BP reader around 50 days. After that the weight trend, `programPace` (needs rows since the program start, components/Weight/weightTrend.js:167), `trendSince` without a goal (uses `points[0]`, i.e. the oldest of the 100 kept, :338) and the BP range picker ("1 year") show a truncated history with no warning. The "Only N readings in this range" hint (BloodPressure.jsx:155) would read as if the data were thin, not cut off. Wrong data in the reassuring direction.
- Fix: send an explicit `startDate` per range (goal start, or 1 year) with a high limit, or page until `total` is reached; show "showing the last N" if capped. Home needs only today/last 7 days, not 100 rows (see #5).

#### 2. No refetch on resume: a second device's writes are invisible until the page is left and re-entered  [V] — S/M
- Where: grep shows `visibilitychange`/`focus` listeners only in hooks/useToday.js, DashboardNew.jsx (greeting hour), PWAUpdatePrompt, ExperienceContext. None in hooks/useFoodLog.js, hooks/useMedsToday.js, hooks/useWeight.js, pages/BloodPressure.jsx, DashboardNew.jsx `loadDashboardData`.
- User impact: Heather logs lunch / ticks a med on her phone; Chef's desktop tab (or her own phone resumed from the app switcher, same calendar day) still shows the old plate and unticked doses. Resumed PWAs on phones are the normal case, so a person looks at yesterday-afternoon numbers and may log the same food again, or re-tick a dose. The Weight dialog's "You already have X. Saving replaces it." note (QuickAddWeight.jsx:`replaceNote`) is also computed from the stale list.
- Fix: one small shared `useRefreshOnResume(fn, minGapMs)` (visibilitychange -> visible, min ~30 s gap) wired into Home's `loadDashboardData`, `useFoodLog` loader, `useMedsToday` reload, weight/BP loaders (silent mode already exists for the last two).

#### 3. A failed dose-log read looks like "nothing taken"  [V] — S
- Where: hooks/useMedsToday.js:62 `setLogs(l.status === 'fulfilled' ? asArray(l.value) : [])`; only the med-list failure sets `loadError`.
- User impact: on a blip (or after a `reload` triggered by MEDS_CHANGED_EVENT) every tick for the day vanishes and the checklist reads "0 of 3". For a medication checklist, she may re-take a dose she did already. Home's food/weight reads were fixed for exactly this class (L1); meds missed.
- Fix: on a rejected `getLogsByDate`, keep previous logs for the same date and set `loadError` ("Couldn't check today's ticks"); show unknown, not zero.

#### 4. Long forms close with no guard or draft: recipe builder, food edit, saved-meal edit  [V] — M
- Where: components/MyFoods/RecipeBuilderDialog.jsx:61-69 (state reset on every open, nothing persisted), :148 Cancel; also FoodEditDialog.jsx, Meals/EditMealDialog.jsx. No dirty/discard handling exists anywhere in the app (grep for dirty/Discard in components and pages: nothing). GeekDialog's `handleClose` (packages/ui/src/surfaces/GeekDialog.jsx:141) calls onClose straight away, and now Android Back / edge swipe does too.
- User impact: building a recipe (name, pasted ingredient list parsed by AI, several resolved ingredients, yield) and then swiping back, tapping outside on tablet/desktop, or pressing Escape throws it all away, including the AI parse she waited for.
- Fix: for RecipeBuilder at least, `dirty` check -> confirm "Discard this recipe?" (GeekDialog already supports a vetoing onClose and the back stack re-pushes the entry), or keep a sessionStorage draft like composerDraft.js. Same pattern for the other two if cheap.
- Related ?: the reset effect `[open, food]` (RecipeBuilderDialog.jsx:61) would also wipe edits if the parent ever passes a new `food` object while open (e.g. after a list refetch). Check MyFoods holds a stable reference.

#### 5. Home reload re-fires eight reads, including five live Garmin calls, after every food write  [V] — S/M
- Where: pages/DashboardNew.jsx `loadDashboardData` (Promise.allSettled of 8) is the `onChanged` of `useFoodLogging` (hooks/useFoodLogging.js:35-40); `getGarminDaily` -> backend services/garminConnectService.js:102-114 (HR, weight, steps, sleep, `getActivities(0, 50)`), no cache; also full weight list and full BP list just to render "Weighed" / "BP" ticks and the latest BP.
- User impact: the refresh is now behind the answer (B7), so the tap is fast, but each add keeps the phone, gateway and Garmin busy; on a weak signal the follow-up reload is what makes the plate update late. Garmin is Chef-only, so Heather pays only the weight/BP list cost.
- Fix: after a food write refetch only `dailySummary` + today's logs; fetch Garmin/weights/BP/streak on mount and on resume only (or cache Garmin per user/day for ~5 min in garminConnectService). Weights/BP for Home: pass `startDate` = last 7 days.

#### 6. Two Back-stack implementations nested in the add flow  [?] — S
- Where: components/FoodSearch/useBackToClose.js (local, `fgSheets`) used by ServingSheet.jsx:53 and FixSheet.jsx:49 (raw MUI `<Dialog>`, not GeekDialog), while the parent add dialog uses the shared `__geekBack` stack (packages/ui/src/hooks/backStack.js). Each push spreads the previous state so landing detection mostly works, but the shared stack's `flush` counts consecutive pending ids on the *current* top entry only; a local entry on top of a shared one can leave `go(-n)` short and an extra dead Back press.
- Needs: a real Android device (serving sheet over add sheet, then Back x2, then Back from the page). Fix if it misbehaves: move both sheets onto GeekDialog and delete the local hook.

#### 7. Settings fields save on blur only  [?] — S
- Where: pages/Settings.jsx:172 (`onBlur={saveName}`), :242 (`onBlur={saveAge}`).
- User impact: typing an age then using Android Back / a bottom-nav tap unmounts without a blur event in some paths; the edit is silently dropped even though the page promises "saves as it changes". Needs device check; fix is to save on unmount or on a short debounce.

#### 8. Tablet: no tablet-specific behaviour or evidence  [?] — S
- Layout switches once at `geekLayout.navBreakpoint` (components/Layout/ModernLayout.jsx:37) and the weight "quick add" card is `md`-only (QuickAddWeight.jsx: `display: { xs: 'none', md: 'block' }`) while the thumb FAB and full-screen dialog follow `useGeekDialogFullScreen`. On a mid-size tablet (e.g. 768-900 px portrait) the two rules can disagree (check there is exactly one way to add weight). The harness has only phone and desktop scenes for fitnessgeek; add a 820x1180 pass. Not a defect until seen.

### Checked and fine (don't re-review)
- Idempotency keys per Log press; composer draft per day/meal; offline copy truthfully says whether the draft survives (composerDraft.js).
- Weight/BP/med/food deletes all have Undo (Weight.jsx:79, BloodPressure.jsx:285, Medications.jsx:523, undoToast); MyMeals delete is a confirmed, labelled "can't be undone".
- Weight dialog keeps the form open on failure (QuickAddWeight.jsx:98-125), uses the device's day at open and at save.
- `useToday` handles midnight/resume; login streak takes the caller's date.
- Stale-answer guard on day switching (useFoodLog `loadSeq`).
- Home/Log keep prior rows on failed refresh rather than showing empty.

### Parked/known, not re-reported
Offline queue; voice auto-log; gateway server-UTC "today" in insights chat and Garmin/weight fallbacks; undone med delete gets a new id; SpO2 surfaces (owner decision, not proposed); ThumbFab retirement; unused Dashboard components/aiService.js.

### Worth a build pass? Yes, a small one.
Items 1, 2, 3 and 5 are each small and share one theme (the app trusts what it fetched once); together roughly a day, and #1 plus #3 are wrong-data-in-the-reassuring-direction defects that grow with time. Item 4 (recipe-builder guard) is the one real lost-work path. Skip a redesign: the app does not need one. Items 6-8 only after a quick device check.


---

## Inspection: StoryGeek, FlockGeek, StartGeek (read-only, 2026-11-15)

### Liveness
- StoryGeek: live, active. 53 commits since Sep 1, last Nov 7 (need: routing). CI in ci.yml, CONTEXT.md + CONTINUITY.md, in SUITE_TODO. Most time spent here.
- StartGeek: live, active. 47 commits since Sep, last Nov 13. CONTEXT.md, harness scenes, 10 hits in WORK_LOG_2026-11. Medium time.
- FlockGeek: live but quiet. 45 commits since Sep, last Oct 10 (rename only); thoroughly gone over 2026-09-05; no mention in the November log. Least time. SUITE_TODO already has: retire caller-less REST layer (Q22), offline.html styling, shared bottom nav, StartGeek wallpaper scrim, StoryGeek 3-column width, glance weight. Not repeated below.

### StoryGeek
Verdict: carefully hardened (AI-unavailable returns input, phantom bubble rollback, owner checks, zod). The weak spot is the turn lifecycle: a 1-3 minute request that mutates a whole in-memory document, with no lock and a reconcile that does not reconcile.
No draft persistence, no useBackToClose anywhere (panels use GeekSheet, so the shared hook should cover them).

1. Timed-out/dropped turn: transcript not reconciled, input handed back, resend duplicates the turn. V
   - Where: frontend/src/pages/StoryPlay.jsx:277-293 (comment at 290 says refreshStory "reconciles the transcript"), refreshStory at 164-171 only does setStory, never setMessages.
   - User: phone locks or the 180s timeout hits mid-turn. Server finishes and saves (backend/src/controllers/storyController.js:381). Client shows "Failed to continue", removes the bubble, restores the text. Panels update but the transcript is one turn behind; pressing Send again plays the same action twice, and the story record then contains both.
   - Fix: on catch, re-fetch and rebuild messages from events (reuse loadStory's mapping) when the last event's turn > local count; if the last server event is the player's text, don't restore the input. Optionally send a client turn id the server dedupes.
   - Effort: S (client), M with server idempotency.
2. No per-story turn lock; two devices or a double submit race on whole-document save. V
   - Where: storyController.js:124 (findById) ... 381 (story.save), no lock/version/in-flight check (grep: none). Loaded at start, saved after 2 AI calls + extraction.
   - User: Chef plays on phone and tablet, or a retry (finding 1) overlaps the original: both pull the same doc, both bill AI calls; second save either throws VersionError (array versioning, shown as a failed turn after full cost) or interleaves/overwrites canon and turnNumber. ? exact Mongoose outcome needs a test.
   - Fix: in-process Set of storyIds mid-turn returning 409 "a turn is already being written"; later an atomic turnNumber guard.
   - Effort: S.
3. Story document grows without bound and is shipped whole on every turn. V
   - Where: backend models/Story.js:164-176 (each checkpoint embeds a full events snapshot, no cap), controllers getStory 74-80 (Story.findById, no projection), StoryPlay.jsx:166 refreshStory after every turn.
   - User: every /checkpoint copies the whole transcript into the doc; N checkpoints x M events. After a long campaign each turn downloads events plus all checkpoints on a phone, and the 16MB doc limit is a cliff that fails turns. Checkpoint creation is also the only way to "undo".
   - Fix: getStory excludes checkpoints[].events/diceResults (return id/description/turn only); cap checkpoints (e.g. 10, drop oldest) or store only the event index they truncate to; refreshStory uses a slim panels-only query.
   - Effort: M.
4. Story delete is permanent, one confirm. V
   - Where: StoryList.jsx:110-118, 385-404; controller deleteStory findByIdAndDelete (storyController.js ~111).
   - User: "lost to the void" means a whole campaign gone on one mistap. Suggest soft delete (deletedAt, filtered in list) with a toast Undo. Effort: S-M.
5. Composer text is not kept across navigation/reload. V
   - Where: StoryPlay.jsx:74 (useState only; no storage). A long action half typed is gone after an app switch that evicts the PWA, or after tapping Stories and back. Fix: sessionStorage draft keyed by storyId, cleared on send. Effort: S.
6. Long turn gives no resumable state. ? The "narrator contemplates" state is local; reload mid-turn shows the pre-turn story with no hint a turn may land. Covered mostly by 1 + 2.

Worth a build pass? Yes, a small one (1, 2, 5 are an hour; 3 is the real work). This is the app where lost turns cost real money and real fiction.

### StartGeek
Verdict: tidy, small, deliberate; capture path already had its error-swallowing fixed. Two real defects: duplicate capture on double Enter, and failures rendered as "nothing" / "signed out".
No useBackToClose (settings sheet, help, weather modal) - note for the shared hook, not an app defect.

1. Double Enter creates duplicate tasks/notes. V
   - Where: components/CommandBox.jsx:543-546 -> handleEnter (~347-440); no in-flight flag (draftLoading only covers the AI draft call, and only the box is cleared after the awaits in captureDone at 345-352).
   - User: phone keyboard Go key double-tapped, or Enter on a slow gateway: two createTask calls, two rows in TodoGeek.
   - Fix: a `capturing` ref/state checked at the top of handleEnter, cleared in finally. Effort: S.
2. Partial failure on capture leaves a task and a retry duplicates it. V
   - Where: CommandBox.jsx:285-314 createTaskFromFields: createTask, then optional note creation, then BLOCK_TASK; a failure after the first call reports "Couldn't add the task", keeps the text in the box. Pressing Enter again creates a second task. Applies to lines using the NoteGeek-link or blocked syntax (parseTaskInput.js:137-161). Fix: report which step failed and clear the box once the task exists; or wrap steps so the line is cleared after createTask succeeds. Effort: S.
3. Failed glance load shows an empty console, not an error. V
   - Where: context/GlanceContext.jsx:44-48 sets `error`; components/ModuleGrid.jsx:50 destructures only data/loading, and :86-110 returns null when nothing loaded. App-level also never reads `error`.
   - User: gateway down or slow on first load (or a stale phone resume): Tasks/Fitness/Reading just vanish, looking like "nothing due". A failed background refresh keeps old data with no staleness hint.
   - Fix: show a one-line "Couldn't load today - retry" module with refetch; mark data stale after a failed poll. Effort: S.
4. Any network blip at startup reads as "signed out". V
   - Where: context/SessionContext.jsx:31-45: res not ok or a thrown fetch both call markOut(). Cold start on bad signal shows the logged-out console (web search only, sign-in prompt) with no retry; no re-check on focus. Fix: only 401/403 means out; network/5xx => 'error' status with retry, re-check on visibilitychange. Effort: S.
5. Glance refresh relies on window `focus` and a 5 min interval that runs while hidden. ? (GlanceContext.jsx:60-79) Installed-PWA resume may not fire `focus`, so the console can show data up to 5 min old; hidden tabs keep polling. Fix: use visibilitychange, skip polls while hidden. Effort: S.
6. Draft/typed capture text is not persisted. ? Left to the box state only; an OS-evicted PWA loses a half-typed line. Low value; skip unless cheap.

Wallpaper scrim contrast is already in SUITE_TODO.
Worth a build pass? Yes, a short one (1-4 are all small and share two files).

### FlockGeek
Verdict: in good shape. Dates handled with local-day helpers (localDateString, UTC-midnight calendar days), owner scoping enforced, soft-delete models, submit buttons disabled while saving, zod on the gateway. Remaining issues are speed and silent failure on Home.

1. Egg queries are unbounded and run on the thumb path. V
   - Where: frontend/src/components/QuickHarvestEntry.jsx:51 and pages/EggLogPage.jsx:35 call GET_EGG_PRODUCTIONS with no date window (cache-and-network); gateway resolvers.js:150-162 has no limit/projection. QuickHarvestEntry fetches EVERY egg record ever just to find the last harvest for one location, each time the harvest sheet opens.
   - User: after a year or two of daily logging the "Log eggs" sheet pays for thousands of rows on a phone before the "last harvest / days since" chip is right; the egg log page sorts/paginates all client-side (EggLogPage:56-65).
   - Fix: add `lastEggProduction(locationId)` (limit 1, uses the {ownerId,locationId,date:-1} index) for the sheet; add limit/offset or a default window to eggProductions and paginate server-side. Effort: M.
2. Home shows zeros when eggs/groups fail to load. V
   - Where: hooks/useHomeData.js:34 `error = birdsError || null`; groups and eggs errors ignored; avgDailyEggs (:44-47) becomes 0 on failure.
   - User: bad connection reads as "0 eggs a day" - the reassuring-wrong direction. Fix: include eggs/groups/hatches errors in `error` (or show partial banner). Effort: S.
3. Home 14-day window is computed at render. ? (useHomeData.js:20-26) A tab left open over midnight keeps yesterday's window until a re-render; minor.
4. Deletes use window.confirm and have no undo. V (EggLogPage:78-79; soft delete in model, no UI to recover). Low priority; blocking dialog is awkward in an installed PWA. Effort: S.

Harness screenshots for flockgeek are dated 2026-10-06 (stale but nothing since changed in the app).
Worth a build pass? Small yes for 1 and 2 only; otherwise leave it alone.


---

## inspect-books-games (read-only review, 2026-11-15)

Harness screenshots for bookgeek are dated 2026-10-09 (pre per-reader shelves), so I used code, not screenshots, as evidence. Nothing changed in the repo.

### BookGeek

Verdict: Mostly in good shape. Optimistic rating is sequenced and rolled back, the list merges in the Apollo cache without collapsing, dates follow the UTC-midnight rule, and the per-reader overlay is consistent across the gateway.
The defects are a duplicate-create path in Add book, a progress save that is silently dropped, in-app reading that never records position, and orphan readings after a REST delete.
No expired-session-as-empty problem found (health check plus error state on the grid).

#### Findings (by impact)

1. **Add book: a failed file upload leaves a created book, and a retry creates a duplicate.** (V) S
   - Where: apps/bookgeek/web/src/hooks/useAddBook.js:64-93, 106-108.
   - What happens: `createBook` succeeds, then the upload fails (big EPUB on a phone connection, 413, timeout). The catch sets "Book created but failed to attach file" and the dialog stays open with the form still filled. The error text says the book was created, but the only button is Create. Tapping it again runs `createBook` again, so there are now two books. The first book is never added to the list or opened. The server has no title/ISBN dedupe (gateway resolvers.js:469-487).
   - Fix: keep `createdId` in a ref once the create succeeds. On a retry, skip the create and retry only the upload. Or on upload failure close the dialog, open the new book and toast "Attach the file from the book page". Optionally warn on an exact ISBN/title match before creating.

2. **A pending reading-progress save is cancelled by an unrelated cache update or by closing the sheet.** (V) S
   - Where: apps/bookgeek/web/src/hooks/useBookDetail.js:93-103 (cleanup clears `progressCommitRef`), 233-240 (400 ms debounce).
   - What happens: the effect depends on `selectedBook`, so its cleanup runs on every cache write to this book and on unmount. Type or drag progress, then within 400 ms tap a star (cache write) or press Back, and the timer is cleared and nothing is saved. There is no error. The field shows the typed number until the next cache write resets it to the old value.
   - Fix: flush instead of clear. On cleanup, if a commit is pending, run it immediately. Also depend the reset effect on `bookId` and `readingProgress`, not the whole object.

3. **The in-app EPUB reader never records or restores a position.** (V; whether Chef reads in the app is ?) M
   - Where: apps/bookgeek/web/src/views/ReaderModal.jsx:127-170 (`relocated` only drives the on-screen rail); apps/bookgeek/web/src/hooks/useReader.js:97 (`rendition.display()` with no CFI). The login splash promises "Sync Progress" (apps/bookgeek/web/src/App.jsx:247).
   - What happens: close the reader and reopen it and you start at page 1. `readingProgress` is only the hand-typed number on the detail sheet. Font size and reader theme reset on every open.
   - Fix: on `relocated` (debounced), save the CFI plus percent to the reader's `BookReading` (new field, so schema and gateway work). Pass the CFI to `display()` on open. Persist the font size and reader theme in localStorage. Also drop the "Sync Progress" claim from the splash until this exists.
   - Only worth it if Chef actually reads in the browser. If he reads on the Kindle and sends from here, skip it and fix the splash text (S).

4. **REST delete of a book (with files) leaves every reader's `bookreadings` behind.** (V) S
   - Where: apps/bookgeek/api/src/routes/bookFileRoutes.js:344 (`Book.deleteOne` only). The gateway `deleteBook` (apps/basegeek/packages/api/src/graphql/bookgeek/resolvers.js:511-520) does clean up with `BookReading.deleteMany`.
   - What happens: orphan readings. The custom-shelf counts in `shelves` (resolvers.js:395-401) come from a bare `BookReading.aggregate` with no join to Book, so they count books that no longer exist.
   - Fix: add `BookReading.deleteMany({ bookId })` after the Book delete. Add a one-off sweep of existing orphans. Better: make the gateway shelf-count aggregate join to Book, as gamegeek's `gameShelves` does.

5. **Delete is permanent, for the whole household, and the files path is unrecoverable.** (V) M
   - Where: apps/bookgeek/web/src/views/BookDetailModal.jsx:456-490; gateway resolvers.js:511; apps/bookgeek/api/src/routes/bookFileRoutes.js:304-344.
   - What happens: a confirm dialog exists. Heather's accidental delete wipes the shared catalog row plus both readers' shelf, rating, review and progress. "Also delete files" unlinks the EPUB from disk.
   - Fix: soft delete (`deletedAt` plus a filter, purge after N days) as NoteGeek just did. Or at least keep a JSON snapshot before delete. Lower priority for a two-person household.

6. **The Edit dialog sends every catalog field every time, so it overwrites another device's edit.** (V, but unlikely to bite) S
   - Where: apps/bookgeek/web/src/hooks/useBookEdit.js:94-106.
   - What happens: editing only the review also re-sends title, description, publisher and ISBN from the draft taken at open time. If the other device (or an enrich/cover job) changed them meanwhile, they are reverted. Last write wins.
   - Fix: send only the fields that differ from `selectedBook` at open time (the same "only when changed" rule `dateFinished` already uses).

7. **Legacy Book fields: the code is clean, but the data is still there.** (V) M
   - Where: apps/bookgeek/DOCS/CONTEXT.md "Per-reader shelves"; apps/basegeek/packages/api/src/graphql/bookgeek/migrateReaderFields.js.
   - What happens: the legacy copies are read by nothing (the overlay always overwrites them), so there is no user-visible bug. They are dead weight and a trap for any new code that reads `Book.shelf` directly.
   - Fix: once the rollback window is over, `$unset` the reader fields on `Book`, drop them from the shared Book schema, and keep the migration file as history. This is the planned cleanup. Take a dump first (it is a hard-to-undo data change, so Chef's call).

8. **Dead and stale code.** (V) S
   - apps/bookgeek/web/src/hooks/useLibrary.js:30, 207-284: merge selection and `handleMergeSelectedBooks` sit behind `showMergeUi = false` and are unreachable.
   - apps/bookgeek/web/src/App.jsx:247 describes it as an "e-reader" with "Sync Progress" (see 3).

Not a defect (checked): Android Back. The detail sheet is a route, and GeekDialog now registers back-to-close (packages/ui GeekDialog.jsx:145) for Add and Edit. The shelf-move toast has Undo. The scroll position is remembered.

Worth a build pass? **Yes, small.** Findings 1, 2 and 4 are an afternoon (S each), all are real, and 1 is the only one that creates wrong data. Do 3 only if Chef reads in the app. Defer 5 and 7 to a call with Chef.

### GameGeek

Verdict: In good shape. Optimistic rating and shelf moves have Undo, shelf counts are tenant-scoped, the list merges in the cache (the 2026-09-25 lesson is applied), UTC calendar dates are handled with the suite rule, and the Playnite import has a dry-run preview, tombstones, a lock and a drop watcher.
The real problems are around delete and re-import, and a handful of consistency items.
I found no per-store importer pressure and nothing built around hours, apart from the items in 5 below.

#### Findings (by impact)

1. **A deleted game can never come back through Playnite, and nothing tells the user or offers a way to undo it.** (V) M
   - Where: apps/basegeek/packages/api/src/graphql/gamegeek/resolvers.js:839-853 (`rememberDeletedPlaynite` then delete, plus every member's `GamePlayer` state); apps/gamegeek/backend/src/playnite/importPlanner.js:316 (`skippedDeleted`); apps/gamegeek/frontend/src/views/detail/ConfirmDeleteDialog.jsx:29.
   - What happens: delete once (a mis-tap on "Delete" in the More sheet) and the game is gone for everyone with their shelves, ratings and notes. The dialog says "can't be undone" but not that a re-export will also skip it forever. There is no UI to clear a tombstone. Re-adding by hand creates a game with no Playnite link, so its installed/Playing state stops following Playnite.
   - Fix: add a "Deleted games" list in Settings (the tombstones are already stored) with Restore (clears the tombstone, so the next import recreates it). Add the "stays gone even if Playnite still has it" line to the dialog. A softer option is a 10-second Undo toast that re-creates from a snapshot.

2. **Delete is household-wide; any member's delete wipes the other member's data.** (V) S/M
   - Where: resolvers.js:850-851 (`GamePlayer.deleteMany({ householdId, gameId })`).
   - Fix: same as 1. Consider requiring the caller to be the only member with state on it, or soft delete. Mostly a policy call for Chef.

3. **Log session can be double-submitted and has no timeout recovery.** (? needs a device) S
   - Where: apps/gamegeek/frontend/src/views/detail/LogSessionSheet.jsx:47-62. The button is disabled by `busy` (good), but on a slow mobile network the sheet stays up and the "did not save" toast does not say whether the request landed. A retry can log twice, and the server has no idempotency key.
   - Fix: pass a client-generated `clientId` to `logGameSession` and ignore repeats. Low priority.

4. **GameGeek keeps its own copy of the back-to-close hook next to the new shared one.** (V) S
   - Where: apps/gamegeek/frontend/src/hooks/useBackToClose.js (used by apps/gamegeek/frontend/src/views/detail/MediaViewer.jsx:108) vs packages/ui/src/hooks/useBackToClose.js, which GeekSheet and GeekDialog now use.
   - What happens: two history-stack schemes (`ggLayers` vs the shared backStack) in one page. The media viewer opens over a route sheet that is itself a GeekSheet. If the two disagree, Back could close the wrong layer, or the route sheet's entry could double-navigate. (? needs a device, with the shared hook as just added.)
   - Fix: switch MediaViewer to the shared hook, delete the local one, and re-run apps/gamegeek/frontend/src/__tests__/views/MediaViewer.test.jsx.

5. **Hours and sessions are still in the app, against Chef's "no hours" rule.** (V, a policy call, not a bug) S
   - Where: apps/gamegeek/frontend/src/graphql/queries.js:30-31 (`hoursPlayed`, `hoursSource` on every card fragment); apps/gamegeek/frontend/src/views/detail/LogSessionSheet.jsx and SessionsSection.jsx; gateway resolvers.js:873-876, 889-935.
   - What happens: `hoursPlayed` and `hoursSource` are fetched for every card and used by nothing I could find on the cards, and the "Log" action sits in the detail ActionBar as a main button. The export query already drops hours.
   - Fix: ask Chef whether Log session should stay. If not, drop the two fields from the card fragment (a free payload cut) and demote Log to the More sheet. If he uses it, nothing to do. I am not proposing anything new here.

6. **Playnite import commit re-uploads the file after a preview with no guard that the preview still matches.** (? low) S
   - Where: apps/gamegeek/frontend/src/views/settings/PlayniteImportCard.jsx:100-122. The preview is a dry run and the commit is a second full upload. The drop watcher may import a newer file in between, so the commit can differ from the preview counts, or hit `skipped-older`. The commit toast only reports `create`, `addCopy` and `update`, not `removedHidden`, `movedToBacklog` or `gamesRemoved`, so a destructive result is silent.
   - Fix: include the moved/removed counts in the toast, and show them in the preview as warnings.

Not a defect (checked): Android Back for sheets and dialogs (shared hook, covered above); settings and library state survive navigation (scroll memory, URL filters); error states on the detail sheet distinguish "didn't load" from "deleted".

Worth a build pass? **Small yes.** Do 1 (restore deleted games plus the dialog wording) and 4 (consolidate the back hook after the shared one lands). 5 needs Chef's answer first. Everything else is polish.
