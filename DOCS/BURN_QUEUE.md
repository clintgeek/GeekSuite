# Burn queue — 2026-09-05 → 2026-09-06

Chef: "We have roughly 28 hours to burn 80% of our legacy Teams plan quota. Fan out as many agents
and accomplish as much as possible." Rules of the road: one agent per disjoint file set; Sage
verifies and commits every piece; deploys in waves; no agent runs a state-changing git command.
Chef stacks tasks here; Sage launches when a slot and the files are free.

## Running

| # | Stream | Model | Files | Since |
|---|--------|-------|-------|-------|
| R81 | Q45 + Q46: aiGeek REST permissions (usage ?userId=, ten admin-shaped routes) + call/parse-json failure envelopes | opus | basegeek aiRoutes/openaiProxy + gate tests + AIGEEK_USAGE | 09-05 16:40 |

**Push gate:** cleared 09-05 13:20 — frozen install passes on HEAD. Deploy prerequisite for R46 done: fitnessgeek's `.env.production` carries `KEY_VAULT_SECRET` (basegeek's value, copied by line, never printed).
## Queued (launch when files free / prerequisite lands)

| # | Item | Why waiting | Size |
|---|------|-------------|------|
| Q1 | Service keys: storygeek minted 13:41 into `apps/storygeek/.env.production` (ai:call, ai:director) — **restart pending Chef's OK** (`docker compose up -d` in apps/storygeek; storygeek keeps working on the legacy appName path until then). fitnessgeek's existing key (bg_4ff4136b, appName FitnessGeek, ai:call) normalizes to `fitnessgeek` — kept, nothing to do. | Chef: OK the storygeek restart | XS |
| Q6 | bookgeek web unit tests (vitest + RTL for LibraryView/FilterSheet/BookCard/detail) | none — launch next slot | M |
| Q10 | Revoke the `LocalApps` key — env grep: no .env under Projects carries it; nginx: zero hits on /openai/v1 or /api/ai/ in the retained log window; key lastUsed 2025-11-03 | ready — Chef's confirm, then revoke via the Apps & keys tab | XS |
| Q11 | basegeek `Databases.jsx`: wire into nav or delete | Chef's call | XS |
| Q13 | verify COVERS_PATH now serves the old covers in the bookgeek UI (CONTEXT.md runtime line already fixed) | Chef eyeballs the UI | XS |
| Q18b | `CSRF_TOKEN=enforce`: proxies fixed (R80, deployed wave 8). **Not clean yet** — one report-only hit within 10 min of the restart: POST /graphql, cookie present, header missing, caller unidentified (every frontend uses the shared link). Report lines now carry origin/referer/UA/credential kind (next wave); review `docker logs basegeek \| grep report-only` after 24h, fix the caller, then flip | after the log review | XS |
| Q22 | flockgeek backend still mounts a full REST CRUD API (9 models) with no caller in the repo — decide: delete the layer or keep as API surface | Chef's call | S |
| Q38 | storygeek gateway module: delete (typeDefs/resolvers/model/test + merge lines + the frontend's dead Apollo plumbing) per DOCS/STORYGEEK_GATEWAY_DECISION.md — or build out | Chef's call | XS |
| Q39 | fitnessgeek: keep or delete the three caller-less instance methods (checkGoalsMet/getProgress/getNutrition); fix the sugar/sodium ceiling-vs-floor disagreement (mealRoutes' MEAL_TYPES part done `3b842e7`) | Chef on delete; the fix XS | XS |
| Q40 | fitnessgeek FoodItem: soft-deleted rows keep their barcode under the unique index while findOrCreate filters is_deleted:false → E11000 on re-add; fix = partial index or clear barcode on soft delete (migration) | Chef: which | S |
| Q41 | fitnessgeek FoodItem: reconcile search (user_id:null) with foodCatalogFilter (also $exists:false); foodRoutes.js:301 open-codes a third dedupe ladder minting user-owned rows — fold into findOrCreateFoodItem or keep | design | S |
| Q42 | review #13: TZ=America/Chicago is inert in every alpine image (no tzdata) — today UTC-everywhere is what keeps the two services agreeing; decide: drop the misleading TZ env and document UTC, or install tzdata and re-audit every local-day site | Chef | S |
| Q43 | review #21: `main` has no required status checks — enable branch protection requiring CI, syntax, boot-smoke and the harness | Chef (GitHub settings) | XS |
| Q44 | basegeek config/database.js getAIGeekConnection has no error handler (a bad URI crashes the process); appConnections.js sibling has one | XS | XS |
| Q48 | consolidation plan §12: 14 open follow-ups (search vs foodCatalogFilter, third dedupe ladder, soft-deleted barcode, caller-less methods, goals_met dead flags, snapshot-vs-catalog recompute, …) — triage | Chef triage | M |
| Q20b | aiGeek: simulated streaming (F-21) and user-gated selection (F-14) documented, not fixed | design | S |
| Q14 | storygeek CanonCard summary text through Narration too (agent left it as a separate render path) | Chef's call | XS |

## How to resume if this session is lost

1. `git status --short` — every uncommitted path belongs to one running stream above (match by
   directory). Agents never commit; Sage does. Nothing is lost while the tree holds it.
2. Per stream, verify before committing: the app's `pnpm build && pnpm lint` (startgeek: npm; lint
   must add no warnings), tests where they exist (`packages/ui` vitest 340+, basegeek api jest 589+,
   notegeek vitest 141, fitnessgeek backend jest 45, bookgeek api `npm test`).
3. Commit with the scope check: `git add <stream paths>` then
   `git diff --cached --name-only | grep -vcE '<allowed pattern>'` must print `0`. Use `git commit -F -`
   with a heredoc; messages say what changed and how it was verified.
4. Push = deploy (all eight images rebuild; Watchtower restarts changed digests; basegeek publishes
   ~1 min after the rest and lands one 5-minute scan later). After a push: `docker ps` ages, then
   `curl https://<app>.clintgeek.com/api/health`.
5. Q1 after R1 deploys: `node apps/basegeek/packages/api/scripts/mint-api-key.js --app storygeek
   --name "storygeek backend" --permissions ai:call,ai:director --write-env
   apps/storygeek/.env.production --var AI_GEEK_API_KEY` and the same for fitnessgeek
   (`--replace` if the var exists); then `docker compose up -d` in each of those two app dirs. Tell
   Chef before the restarts. Never paste a key into chat.
6. Session quota: 5-hour window; if capped, pause until the reset (~3:50 pm Central on 09-05) and
   continue from this board. Memory: `project_burn_program.md` in Sage's memory dir mirrors this.

## Landed today (before the burn)

M3–M5 mobile passes; registry self-seed + `/api/health`; AIGeek phase D; Ask step 5; nginx
`startgeek.clintgeek.com` redirect. See `STATUS.md`.

## Waves pushed

- 09-05 13:19 — `446e5c0` (86 commits: R19–R49). Release: success (images published 13:24, Watchtower rolling). CI: **eslint job failed** — `packages/logger` had a lint script and no flat config (R6 had never been through CI). Fixed in `e183fdd`; goes with the next wave.

- 09-05 13:28 — Watchtower deployed the wave (updated=8). **Incident:** basegeek crash-looped — `graphql/bujogeek/typeDefs.js` (d53b008) had raw backticks inside the gql template; no suite imported `graphql/index.js`. fitnessgeek crash-looped on the missing vault key because Watchtower recreates with the old env — fixed with `docker compose up -d` in apps/fitnessgeek (13:30, health 200). Hotfix `61d3109` (typeDefs escaped + `gatewaySchemaLoads` tripwire) pushed 13:32, CI green, Watchtower restarted basegeek 13:40 — healthy, gateway apps 200 (outage ≈13:28–13:40); an accidental push of `3a7c84b` (logger config, R52) went 20s earlier because the scope check's `grep -c` exits 1 on a zero count and broke the `&&` chain — never chain `&&` after the count.

- 09-05 14:05 — wave 3 (`8ce9296`, 34 commits): CI green; **Mobile harness workflow failed** on its first enforcing run — `pnpm --filter … ci` was pnpm's install alias, not the script (broken since R4, masked by continue-on-error). Fixed `4ef412d` (`run ci`), ships with wave 4. Watchtower deployed wave 3 at 14:13 (updated=6); all eight apps 200. R50, R51, R53–R57, R59, R60, hotfix follow-ups, syntax gate, harness enforcing. Gate: frozen install, `pnpm -r lint`, syntax check all green before push.

- 09-05 14:23 — wave 4 (`c6c4136`, 16 commits): CI + Release green, Watchtower deployed 14:34 (updated=7), all eight apps 200. **Harness workflow failed again**, now for real: every `vite preview` "did not start" because Vite bolds the port in colour mode on Actions and the URL regex missed it. Fixed `15aaf38` (ANSI strip + NO_COLOR), verified locally; ships with wave 5 (R66). harness workflow fix (`run ci`), keto-ring fix (R65), R58, R61, R64, docs. Gates green.

- 09-05 14:43 — wave 5 (`9712fe8`, 8 commits): R66 + harness readiness fix (`15aaf38`). Gates green; CI + Release green; Watchtower 14:53 (updated=7); all eight apps 200. **Mobile harness workflow green in CI for the first time (14:54) — M6 guardrails done, enforcing.**

- 09-05 15:12 — wave 6 (`d224d40`, 9 commits): R67, R68, comment fixes. Gates green; CI, Release and harness workflow green; Watchtower 15:23 (updated=7); all eight apps 200.

- 09-05 15:39 — wave 7 (`120b54e`, 6 commits): R69, R70. Gates green; CI, Release and harness workflow green; Watchtower 15:50 (updated=7); all eight apps 200.

- 09-05 16:35 — wave 8 (`7fd206b`, 22 commits): R74, R75–R80 (all four P0s + 14 P1s from the review), consolidation complete. Gates: frozen install, syntax, boot-smoke, repo lint. CI, Release and harness green; Watchtower 16:43 (updated=7); all eight apps 200.

## Landed during the burn

(append as commits land: `sha — stream — one line`)
- `2b22d05` — R11 — DOCS/RUNBOOK.md; surfaced the bookgeek covers volume bug
- `c54845e` — bookgeek covers directory mounted and container recreated (80 covers visible again)
- storygeek markdown (R8) — Narration.jsx, remark-gfm/breaks
- `6d7865c` — R7 — one UserSettings schema (@geeksuite/schemas) + parity tripwire
- `61997ed` — R6 — @geeksuite/logger in all seven backends; first-ever log redaction
- `a0b08ca` — R10 — GeekAppFrame fill, sheet focus/close/align, dialog hooks, reduced motion (354 ui tests)
- `70eb36e` — R13 — offline pages both modes ×6, manifests, storygeek manifest, notegeek dev-server fix
- `1fc8623` — R5 — @geeksuite/utils dates (36 tz tests); 3 apps consume; 2 live off-by-one bugs documented → R26
- `d53b008` — R9 — bujogeek subtasks (2 gateway bugs fixed) + cache rule (156/82 tests)
- `5346e06` — Q6 — bookgeek web tests (96) + ci jobs bookgeek-web, utils
- `fe29788` — R23 — storygeek service worker
- `a3c4031` — R20 — CSRF double-submit token (report mode), @geeksuite/auth sends the header
- `71066ba` — R18 — flockgeek frontend tests (30) + ci job
- `00ef0b7` — R21 — zod validation on fitnessgeek settings/weight/BP/medication (90 tests)
- `373f69f` — R28 — fitnessgeek single manifest source (bujogeek already right)
- `363a820` — R4 — mobile harness in tools/ + CI (report-only); 698 probe findings
- `d8521eb` — R27 — CSRF header in api-client authLink + startgeek clients
- `1fda489` — R24 — bujogeek tag cloud + template journal cache; #25/#26 struck
- `x` — R62 — DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md (found the net_carbs_grams live bug → R65)
- `4f0ba46` — R73 — root docs reconciled (RUNBOOK env/CI tables, README packages, MOBILE_UI_PLAN §4b struck, TODO files consistent)
- `be79702` — R71 — FoodItem shared; findOrCreate ladder one implementation (fitnessgeek 229, api 1111); soft-deleted-barcode collision found
- `d5ecb22` — R70 — zod on the bookgeek gateway mutations (38 tests; api 1082) — gateway side of #22 complete
- `e24de33` — R69 — NutritionGoals + Meal shared (fitnessgeek 203, api 1044); Medication enum copies folded; eight shared
- `e23559c` — R68 — zod on notegeek (8) + flockgeek (16) gateway mutations; shared validateInput; off-enum writes closed (api 1003)
- `1457a7d` — R67 — Medication, LoginStreak, WeightGoals shared (fitnessgeek 169, api 930); recordLogin moved; six shared models
- `21be1c1` — R66 — Weight + BloodPressure shared schemas (fitnessgeek 129, api 889); two dead gateway models deleted; pipeline notes in the plan §8
- Q37 done 14:36 — bookgeek's unused AIGEEK_API_KEY removed from its env file and the RUNBOOK env table
- `605c99c` — R64 — zod on bookgeek's remaining REST api (78 → 123 tests); #22 done for storygeek + bookgeek
- `0cecb4a` — R65 — gateway DailySummary net_carbs_grams restored (keto ring), toUtcDate → utils (api 856)
- `6ffaf87` — R61 — fitnessgeek TODO #30: scanner theme/breakpoints, shared DateField ×6 (27 tests)
- `a80da35` — R63 — DOCS/STORYGEEK_GATEWAY_DECISION.md: no live caller of the gateway storygeek module; recommend delete (Chef: Q38)
- `01d35d4` — R58 — bookgeek profile/filters/shelves/ai-status on the gateway; drifted Profile model fixed; localhost:1800 gone (step 3)
- `b867175` — R57 — TODO #30 ×3: bujogeek template markdown, notegeek mind-map palette, flockgeek first-visit flicker; lockfile
- `a1cba80` — R59 — zod on storygeek's REST backend (jest 41 → 76; continue-without-input 500 fixed)
- `a9672d9` — R60 — fitnessgeek REST food-log routes deleted; consolidation step 2 complete (104 tests)
- `77f3236` — R53 — fitnessgeek food-log writes on the gateway; frontend vitest (17); ci jobs test-fitnessgeek-web + syntax (Q33)
- mobile-harness.yml is enforcing (continue-on-error removed)
- `df69537` — R54 — syntax gate tools/syntax-check.mjs (736 files, ~15 s); ci job pending the workflow commit with R53
- `717c137` — Q35 — StoryList effect keyed on user.id
- `24e3cac` — R56 — StoryPlay render loop (effect on user object) fixed; 39 storygeek tests run (Q27)
- `3c20444` — R55 — aiServiceCache on fake timers (Q34)
- Q31 done 13:44 — Garmin backfill: 1 document encrypted, second dry-run 0 remaining
- `c76152f` — R51 — storygeek on shared feedback primitives; #15 fan-out complete (7/7), #19 closed
- `79b1b57` — R50 — gateway food-log mutations drop-in for REST (Q29; 26 tests, api 826)
- `61d3109` — hotfix: bujogeek typeDefs backticks + gatewaySchemaLoads tripwire
- `f5ea782` — R52 — notegeek dead LoginPage/RegisterPage removed (149 tests); schemas eslint config
- `e183fdd` — logger eslint config (CI fix)
- `1142e72` — R44 — fitnessgeek on shared feedback primitives + toneForMode; UI plan records four apps
- `3bafe54` — R47 — 21 unused deps dropped from four thin backends; lockfile regenerated
- `5b0bc9f` — R45 — food-log writes cannot move yet: three gateway mutation gaps documented (Q29)
- `17e33bb` — R46 — Garmin password encrypted at rest via the shared schema; backfill script; DEPLOY.md row (106 tests)
- `b39d29c` — R48 — bookgeek on shared feedback primitives (96 tests, 12 scenes clean)
- `23b3b79` — R49 — basegeek console on shared feedback primitives; new basegeek DOCS/CONTEXT.md
- `ca05d3b` — R43 — notegeek on shared feedback primitives (151 tests, 8 scenes clean)
- `db44ccb` — R42 — harness unions positioned pseudo hit boxes; selftest; startgeek 52 → 0
- `410aeab` — R22 — storygeek frontend vitest suite (31 tests; 6 StoryPlay skipped → Q27); ci job
- `e85fc43` — R30 — probe burn-down basegeek 68 / bookgeek 14 / storygeek 4 → 0
- `cdb4cd2` — R41 — notegeek backend prune (dead migrations, tagValidation)
- `17cc6a7` — R35 — fitnessgeek backend node 20 + ESM; utils replaces 5 date copies (90 tests; image boots)
- `79d49e5` — R40 — flockgeek on GeekEmptyState/GeekErrorState/useToast (TODO #15)
- `08be080` — R33 — fitnessgeek probe burn-down 95 → 0 (chip/select floors in theme)
- `69a7e2f` — R32 — bujogeek probe burn-down 202 → 0 (controls bypassing the theme floor)
- `bcdab09` — R36 — Cohere dispatch case + fallbacks from DEFAULT_MODELS (Q20, #31 stale defaults)
- `10779eb` — R39 — startgeek luminance-adaptive wallpaper scrim (TODO #28 scrim part)
- `82563af` — R38 — dead backend code: bookgeek graphql, notegeek legacy REST, 4 flockgeek models; flockgeek REST layer flagged
- `50c0939` — R37 — @geeksuite/crypto-vault (25 tests, fixture-compatible); basegeek consumes; ci job
- `574920f` — R29 — harness: tap-target phone-only, selector hints; 139 scenes / 371 open
- `b2e9c95` — R31 — notegeek probe burn-down 84 → 0 (GlobalStyles min-height:auto was the real bug)
- `6249ef4` — R34 — startgeek probe burn-down 218 → 52 (52 = ::before hit-area false positives)
- `3265b1c` — R25 — zod on the ten bujogeek gateway mutations (37 tests; api 815)
- `4856227` — R26 — 8 calendar-date off-by-one sites fixed (flockgeek ×7, fitnessgeek getTodayBP)
- `8879e94` — R19 — OpenAI-compat: 22 findings closed (api 778); unknown model → 404
- `37e83b6` — R17 — 22 dead fitnessgeek files + broken dev compose deleted
- `164f978` — R16 — notegeek relative-time tests; dev-server fix pending in vite.config.js (shared with R13)
- `6c39d00` — R2 — Apps & keys tab; APIKeysPage retired; AppConfigDialog on GeekDialog
- `92e7bc9` — R1 — caller identity from the credential; service keys; mint script; fitnessGoalService envelope fix
- `9dede26` — R14 — circuit breakers on fitnessgeek upstreams (58 tests)
- `9e9b4a4` — R15 — storygeek on GeekAppFrame fill
- `7171297` — R12 — /login and /register redirect home when signed in (4 apps changed, 2 already right, 2 n/a)
- `700112e` — R3 — OpenAI-compat audit: `apps/basegeek/DOCS/OPENAI_COMPAT_AUDIT.md` + 72-test conformance suite (22 `it.failing` findings)
