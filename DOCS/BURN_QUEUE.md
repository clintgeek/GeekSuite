# Burn queue — 2026-09-05 → 2026-09-06

Chef: "We have roughly 28 hours to burn 80% of our legacy Teams plan quota. Fan out as many agents
and accomplish as much as possible." Rules of the road: one agent per disjoint file set; Sage
verifies and commits every piece; deploys in waves; no agent runs a state-changing git command.
Chef stacks tasks here; Sage launches when a slot and the files are free.

## Running

| # | Stream | Model | Files | Since |
|---|--------|-------|-------|-------|
| R22 | storygeek frontend vitest + RTL suite + CI job | sonnet | storygeek frontend, ci.yml (one job) | 09-05 13:50 |
| R29 | harness: phone-only tap-target rule, rerun, per-app lists, SUMMARY.md | sonnet | tools/mobile-harness | 09-05 |
| R30 | probe burn-down: basegeek theme, bookgeek strip/sidebar, storygeek overline | sonnet | basegeek ui theme.js, bookgeek web components, storygeek theme.js | 09-05 |
| R31 | probe burn-down: notegeek | sonnet | notegeek frontend | 09-05 |
| R32 | probe burn-down: bujogeek | sonnet | bujogeek frontend | 09-05 |
| R33 | probe burn-down: fitnessgeek | sonnet | fitnessgeek frontend | 09-05 |
| R35 | Q17: fitnessgeek backend node 20 + ESM, consume @geeksuite/utils, drop 5 toUtcMidnight copies | opus | fitnessgeek backend, Dockerfile, lockfile | 09-05 12:35 |
| R36 | Q20: callCohere case in callProvider + stale hardcoded model defaults (#31) | sonnet | basegeek api aiService/aiProviders/capabilities, AI_CATALOG | 09-05 12:35 |
| R37 | TODO #20 step 1: @geeksuite/crypto-vault promoted, basegeek consumes; ci job | sonnet | packages/crypto-vault, basegeek api lib + package.json, lockfile, ci.yml | 09-05 12:35 |
| R39 | TODO #28: startgeek adaptive wallpaper scrim (luminance-sampled) | sonnet | startgeek src (not CommandBox/graphql/basegeek) | 09-05 12:35 |
| R40 | TODO #15 fan-out: flockgeek on GeekEmptyState/GeekErrorState/useToast | sonnet | flockgeek frontend, UI plan | 09-05 12:35 |
| R38 | SUITE_TODO consolidation step 1: dead backend code (bookgeek unmounted graphql, notegeek legacy REST+Note, flockgeek dup models, bujogeek dup model files) | sonnet | four backends, SUITE_TODO | 09-05 12:35 |

**Push gate:** `pnpm install --frozen-lockfile` on HEAD now fails only on `apps/storygeek/frontend/package.json`
(test devDeps, R22 in flight). Push after R22 commits; re-run the check first.

## Queued (launch when files free / prerequisite lands)

| # | Item | Why waiting | Size |
|---|------|-------------|------|
| Q1 | Mint service keys into storygeek + fitnessgeek `.env.production`, restart those two containers | R1 landed (`92e7bc9`); do after the next push deploys basegeek; announce restarts | XS |
| Q6 | bookgeek web unit tests (vitest + RTL for LibraryView/FilterSheet/BookCard/detail) | none — launch next slot | M |
| Q10 | Revoke the `LocalApps` key — env grep: no .env under Projects carries it; nginx: zero hits on /openai/v1 or /api/ai/ in the retained log window; key lastUsed 2025-11-03 | ready — Chef's confirm, then revoke via the Apps & keys tab | XS |
| Q11 | basegeek `Databases.jsx`: wire into nav or delete | Chef's call | XS |
| Q13 | verify COVERS_PATH now serves the old covers in the bookgeek UI (CONTEXT.md runtime line already fixed) | Chef eyeballs the UI | XS |
| Q18b | After R27 deploys: a day of clean `CSRF token check (report-only)` logs, then `CSRF_TOKEN=enforce` in basegeek's env and a container restart | Chef's call after the log window | XS |
| Q21 | harness: recognize ::before/::after hit-area expansion (startgeek .hit44/.dot) so the 52 startgeek false positives clear | after R29 lands | S |
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
