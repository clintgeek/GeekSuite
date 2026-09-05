# Burn queue — 2026-09-05 → 2026-09-06

Chef: "We have roughly 28 hours to burn 80% of our legacy Teams plan quota. Fan out as many agents
and accomplish as much as possible." Rules of the road: one agent per disjoint file set; Sage
verifies and commits every piece; deploys in waves; no agent runs a state-changing git command.
Chef stacks tasks here; Sage launches when a slot and the files are free.

## Running

| # | Stream | Model | Files | Since |
|---|--------|-------|-------|-------|
| R1 | aiGeek: caller identity from API key, consumers on service keys, mint script | opus | basegeek api (not graphql/basegeek), storygeek+fitnessgeek backends | 09-05 am |
| R2 | AIGeek UI: "Apps & keys" tab replaces detected routing; retire APIKeysPage | opus | basegeek ui, graphql/basegeek (additive) | 09-05 am |
| R4 | M6 guardrails: mobile harness into `tools/mobile-harness`, CI workflow | opus | tools/, .github/workflows/mobile-harness.yml | 09-05 am |
| R5 | TODO #17 shared date utilities → `packages/utils`; bujogeek/fitnessgeek/flockgeek consume | opus | packages/utils, 3 apps (date code only) | 09-05 am |
| R9 | TODO #25/#26 bujogeek subtasks UI + Apollo cache invalidation | opus | bujogeek frontend, its GraphQL surface | 09-05 am |
| R13 | Offline pages per mode + theme-color/manifest audit (TODO #30) + bookgeek CONTEXT runtime fix | sonnet | each app's public/offline/manifest/index.html metas; PWA_STANDARD table | 09-05 12:10 |
| R14 | TODO #23 circuit breakers on fitnessgeek external APIs | sonnet | fitnessgeek backend external-API services, lib/breakers.js | 09-05 12:10 |
| R12 | `/login` and `/register` redirect home when already signed in (all apps) | sonnet | each frontend's router/auth files; skips files another agent has open | 09-05 11:25 |

## Queued (launch when files free / prerequisite lands)

| # | Item | Why waiting | Size |
|---|------|-------------|------|
| Q1 | Mint service keys into storygeek + fitnessgeek `.env.production`, restart those two containers | R1 must land and deploy first; restarts announced to Chef | XS |
| Q3 | TODO #22 input validation (Zod), bujogeek timestamps first | bujogeek backend busy (R5, R9) | L, slow burn |
| Q5 | Housekeeping (TODO #31): fitnessgeek dead files, stale dev compose, notegeek `formatRelativeTime` dedupe, notegeek dev-server optimizer fault | fitnessgeek + notegeek busy | S |
| Q6 | bookgeek web unit tests (vitest + RTL for LibraryView/FilterSheet/BookCard/detail) | none — launch next slot | M |
| Q7 | Sibling-subdomain CSRF double-submit token for basegeek (SUITE_TODO) | basegeek middleware/server busy (R1) | M |
| Q8 | OpenAI-compat fixes: F-09 dropped params, F-16 unknown model → 404, F-04/F-02 tools on Groq + tool-loop roles, F-01 stop rewriting answers, F-03 cache key incl. history, F-07/F-15/F-19/F-20 | R1 owns openaiProxy/aiService — launch when R1 lands | M |
| Q9 | storygeek: remove the `& > div` frame hack via `GeekAppFrame fill` (landed) | R12 may be in storygeek App.jsx — launch when R12 lands | XS |
| Q10 | Revoke the `LocalApps` key once the env grep and nginx sweep confirm no caller | background greps | XS |
| Q11 | basegeek `Databases.jsx`: wire into nav or delete | Chef's call | XS |
| Q12 | AIGeek: `aiDirectorService`/`rateLimitService` last `llm7` references | R1 owns those files | XS |
| Q13 | bookgeek CONTEXT.md says Runtime: Bun (it is node:20); verify COVERS_PATH now serves the old covers in the UI | after R? — trivial, next slot | XS |
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
- `700112e` — R3 — OpenAI-compat audit: `apps/basegeek/DOCS/OPENAI_COMPAT_AUDIT.md` + 72-test conformance suite (22 `it.failing` findings)
