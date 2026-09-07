# Burn queue — 2026-09-05 → 2026-09-06

Chef: "We have roughly 28 hours to burn 80% of our legacy Teams plan quota. Fan out as many agents
and accomplish as much as possible." Rules of the road: one agent per disjoint file set; Sage
verifies and commits every piece; deploys in waves; no agent runs a state-changing git command.
Chef stacks tasks here; Sage launches when a slot and the files are free.

## Running

**Phase 3 — night 2 (Chef, 09-06 08:15):** all five decision items and all five AI ideas, decisions on Chef's behalf recorded in `DOCS/NIGHT2_PLAN.md`. Two quota slots left; aim to finish in the first.

**Phase 2 — the going-over (Chef, 09-05 evening):** "make sure everything is merged and pushed, then give the entire geeksuite a good going over, fix what needs fixing — you have my authority for auto fixes. Then invent 5 responsible AI uses (document, don't implement)." Seven reviewers, one per disjoint tree, fix inside their scope and report cross-cutting findings; Sage commits per stream.

| # | Stream | Model | Files | Since |
|---|--------|-------|-------|-------|
| R113 | Sage | aiFeatureRunner + AIProvenance (the shared AI door) | **landed** `a7f432d` |
| R114 | opus | AI-1 bujogeek weekly review draft (gateway bujogeek + bujogeek frontend) | **landed** `c913396` (wave 18) |
| R115 | opus | AI-2 fitnessgeek NL quick-add (gateway fitnessgeek typeDefs/resolvers + frontend) | **landed** `ec6174c` (wave 18) |
| R116 | opus | AI-3 notegeek tag/link suggestions + Q65 folder dead code (gateway notegeek + frontend) | **landed** `b25a000` (wave 18) |
| R117 | opus | AI-4 bookgeek what-next + metadata drafts (gateway bookgeek + web) | **landed** `3ace9ab` (wave 18) |
| R118 | opus | AI-5 startgeek morning brief (gateway glance + startgeek) | **landed** `e34ac19` (wave 18) |
| R119 | sonnet | Q38 delete storygeek gateway module + frontend Apollo plumbing; Q62 bookify cap | **landed** `1401dda` (wave 18) |
| R120 | sonnet | Q22 delete flockgeek REST layer | **landed** `4e8051e` (wave 18) |
| R121 | opus | Q62 basegeek half (conversation ownership, mint admin, influx filter), Q49, Q69 | **landed** `b8a8ab4` (wave 18) |
| R122 | sonnet | fitnessgeek backend: Q62 half (aiCoach delete, influx), Q39, Q40, Q41, Q48 §12 | **landed** `7166e8b` (wave 18) |
| R123 | sonnet | Q42 TZ lines (non-basegeek compose) + docs; Q70 tools/kill-orphans.mjs | **landed** `24a77ee` (wave 18) |
| Sage | — | Q68 stash→branch `wip/dashgeek-redesign-2026-04` ✓; Q10 LocalApps deactivated ✓ (`73965db` script); Q18b `CSRF_TOKEN=enforce` in basegeek compose ✓ (`24a77ee`); Q56 storygeek DB_URI fixed + override dropped ✓ (`c6776b9`); Q58 leaked `datageek_user` dropped from Mongo, init script env-driven ✓ (`73965db`); Q43 ruleset — see Landed | **landed** wave 18 |
| R124 | opus | Q52 fitnessgeek charts→one lib + ZXing pin/vendor; quick-add opt-in server-side (schema default → false) | **landed** (wave 19) |
| R125 | sonnet | Q55 bujogeek TaskEditor lazy pickers | **landed** (wave 19) |
| R126 | sonnet | harness scenes for the five AI surfaces | **landed** (wave 19) |
| R127 | sonnet | notegeek gateway dead Folder type removal | **landed** (wave 19) |
| R128 | sonnet | fitnessgeek nivo point props (pre-existing r=NaN) | **landed** `98a1742` (wave 21) |
| R129 | sonnet | harness: Rating probe gap, fixture scoping, dead stub | **landed** (wave 21) |
| R130 | opus | aiGeek free-tier resilience (dead-model memory, free→free fallback, probe script) | **landed** `ecb4268` (wave 22) |

**Push gate:** cleared 09-05 13:20 — frozen install passes on HEAD. Deploy prerequisite for R46 done: fitnessgeek's `.env.production` carries `KEY_VAULT_SECRET` (basegeek's value, copied by line, never printed).
## Queued — reconciled 2026-09-07

This table was written mid-burn and went stale: fifteen of its items landed in waves 18–19 and were
never struck, which made the board read as far more open than it is. Reconciled against the wave
record, `STATUS.md`, git history and the filesystem — every **closed** item below was verified on
disk or by commit, not by what a doc claimed about it.

**Closed, no action:** Q6 (`5346e06`) · Q10 (`73965db`) · Q22 (`4e8051e`) · Q38 (`1401dda`) ·
Q40 (`7166e8b` — and the hazard was only ever latent: production never carried the unique barcode
index) · Q42 (no `TZ=` left in any compose file; UTC-everywhere documented) · Q43 (ruleset
"Protect main" active, 23 required checks) · Q44 (`61768d8`) · Q49 (`b8a8ab4`) · Q52 (`@nivo` only,
recharts and chart.js gone; ZXing pinned with an SRI hash) · Q55 (TaskEditor pickers lazy) ·
Q56 (`c6776b9`) · Q62 (whole policy bundle; the flockgeek half went moot with Q22) ·
Q68 (`wip/dashgeek-redesign-2026-04`, stash list empty) · Q69 (`b8a8ab4`).

**Q58 — closed by Chef's decision, 2026-09-07: no rotation.** The row had claimed the
`datageek_admin` pair was in git-tracked, GitHub-public files. It was not: a full-history scan
(every object via `git rev-list --all --objects` through `git cat-file --batch`, 7,847 blobs, all
refs) finds the password in no blob, and the archived pre-monorepo repos only ever pointed at the
retired self-hosted gitea. The publicly committed pair was the unused `datageek_user`, dropped in
wave 18. Chef: *"I'm not worried about the rotation. As long as it wasn't in public git, that's
fine."* The residual exposure is on-box plaintext in the eleven live env files (which is what env
files are) plus three AI transcripts that read the value — accepted. The tooling stays as the
procedure for the next credential that really is exposed:
`apps/basegeek/scripts/rotate-datastore-creds.sh`, documented at RUNBOOK §13. Reopen this only on
evidence of an actual disclosure.

**Still open.** Every row is a decision or an eyeball, not unfinished code:

| # | Item | Waiting on | Size |
|---|------|------------|------|
| Q18b | `CSRF_TOKEN=enforce`. Parked deliberately 09-07. The remaining report-only hits are no longer stale bundles: 5 in 24 h, all `POST /api/auth/refresh` from `axios/1.13.5` with cookie auth and no header — an app-proxied refresh whose browser caller never attached one. All six backend proxies do forward the header, so the gap is browser-side in one app's refresh path. Find that caller before flipping | Chef parked it | S |
| Q39 | *(decision half)* keep or delete the three caller-less fitnessgeek instance methods `checkGoalsMet` / `getProgress` / `getNutrition`. The sugar/sodium ceiling-vs-floor fix landed (`7166e8b`) | Chef | XS |
| Q41 | *(decision half)* `foodRoutes.js` mints user-owned rows where the shared ladder would use global ones — a privacy-model call. The `search` / `foodCatalogFilter` reconciliation landed | design | S |
| Q48 | *(decision half)* 11 of the 14 §12 follow-ups are fixed or ratified as out of scope. Three left, all product calls: the caller-less methods (= Q39), `goals_met` floor-vs-ceiling and its dead flags, snapshot-vs-catalog recompute | Chef triage | S |
| Q65 | *(decision half)* bujogeek `TemplateApplier` is still mounted but unreachable, so the styled `TemplatePreview` never renders — a feature decision. The notegeek dead-folder half landed (`b25a000`) | Chef | XS |
| Q11 | basegeek `Databases.jsx`: nothing imports it. Wire it into nav or delete it | Chef's call | XS |
| Q13 | eyeball the bookgeek UI and confirm the covers render. The volume mount was fixed in `c54845e`; only Chef looking at it can close this — git cannot prove it either way | Chef eyeballs | XS |
| Q14 | storygeek `CanonCard` summary text through `Narration` too (left as a separate render path) | Chef's call | XS |
| Q20b | aiGeek: simulated streaming (F-21) and user-gated model selection (F-14) are documented in `apps/basegeek/DOCS/OPENAI_COMPAT_AUDIT.md`, not fixed | design | S |

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

## Waves
- **Wave 25** (09-07 ~02:40): `scripts/discover-free-models.js` — asks every configured provider for its current model list, keeps the free-tier candidates (per-provider rules), filters to general assistants, probes each live, `--sync` writes the catalog. Live result: Cloudflare 21 alive text models (sub-second), Groq 7, Gemini 10 (3.1 flash-lite fast, 3.5+ flash 3–7 s), Cohere 7, OpenRouter 10 niche `:free`; Together has no `-Free` builds left; llmgateway no free chat; Cerebras key rejected; the configured Ollama host 404s on `/api/tags`. Reasoning models (gpt-oss on Groq/Cloudflare, qwq at times) return empty text within a small token cap → the probe now treats empty text as dead. Catalog synced: 17 general free rows selectable across cloudflare/groq/gemini/cohere/openrouter; coder model demoted. Live: groq qwen3.6-27b picked first (0.5–2.9 s), retries to openrouter/cloudflare.
- **Wave 24** (09-07 ~02:10): the actual Ask root cause — the Cloudflare adapter flattened messages into a raw `prompt` (no chat template, no stop), so llama generated until `max_tokens` (15 s+ for a two-word JSON). Now chat `messages` + `temperature` + Workers AI `response_format` json_schema (`9052bd2`). Live inside basegeek: schema calls 1.4 s / 0.5 s, plain 0.2 s, all `source: model`.
- **Wave 23** (09-07 ~00:45): Ask really fixed. Probe (`scripts/probe-free-tier.js --mark`, run inside basegeek) found the free catalog was a graveyard — 3 alive / 24 dead (Groq decommissions, Cerebras key rejected, Together non-serverless, OpenRouter `:free` slugs gone, Cohere/Gemini 404s, Ollama Cloud 410 retirements) — and marked the dead rows for 30 days. The two "alive" gpt-oss rows return empty text through our adapters → cooled; `cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast` (answers JSON in ~1.2 s) flipped to `isFree:true` (row id fixed from the bare name). Code: 410 = hard failure (`175b939`); empty free answer cools the row; runner default `maxTokens` 600 and Ask 400 with a 5 s budget — the provider default of 4000 let the fast llama generate for 15 s+ (`6be2827`). **Chef: the Cerebras key is rejected as wrong — rotate or drop it.** Follow-up: the Cloudflare/Ollama adapters read no text from gpt-oss models (reasoning field?) — a catalog/adapter item, not urgent.
- **Wave 22** (09-06 ~23:20): R130 free-tier health/cooling + free→free fallback + probe (`ecb4268`), startgeek Ask card honesty + tappable terms (`e43e1cc`). Cause: Ask fell back at 22:15 because four dead free models ate the 3 s budget (Groq retired model, Cerebras key rejected, Together non-serverless, OpenRouter retired slug).
- **Wave 21** (09-06 ~15:10): R128 nivo points r=NaN + seriesColor typos (`98a1742`), R129 harness probe learns for-linked labels, bookgeek waiver gone, fitnessgeek fixture flag scoped to scene 11, dead GetFolders stub removed.
- **Wave 20** (09-06 14:35): dependency prune (`4177c9d` — recharts/chart.js/react-chartjs-2/chartjs-adapter-date-fns from fitnessgeek, @apollo/client/graphql from storygeek; lockfile regenerated offline, frozen install + both builds verified), STATUS.md.
- **Wave 19** `71a4a08` (09-06 14:20 CDT; CI/harness/Release green; Watchtower 7/7 at 14:27; fleet healthy, CSRF report): R124 Q52 charts→Nivo + ZXing SRI + quick-add opt-in server-side (`5e82aaf`), R125 Q55 lazy pickers (`7fbdce2`), R126 harness scenes for the AI surfaces (`d2f8d89`), R127 notegeek Folder type gone (`ceb4ae2`), what-next query fix + 44px tabs/stars (`9ed7f18`), runner envelope unwrap + true opt-in (`561d248`), compose empty-key fix (`ddd2b4f`), console CSRF self-heal (`3b18cd3`).
  **Incident 14:05–14:20:** with `CSRF_TOKEN=enforce` Chef could not log in — his Firefox ran a console bundle cached by the console's service worker from before the client grew the header, so `POST /api/auth/login` was rejected `csrf_token_missing`. A fresh browser against the live page sends the header (probe: `scratchpad/login-probe.mjs`). Rolled back to `report` at 14:12 (compose, `--no-deps`). **Q18b stays open:** flip to enforce again once the report log shows no `missing_header` from real bundles (Chef hard-reloads basegeek console + startgeek on each device first); the console now retries once with the live cookie and reloads once per session, so a stale bundle heals itself on the next attempt.
- **Wave 18** `c6776b9` (09-06 13:35 CDT): the five AI features (R114–R118) + aiFeatureRunner (R113), Q22/Q38/Q62/Q69/Q49/Q42/Q56/Q58/Q10/Q68 (R119–R123 + Sage). CI + Release green; Watchtower rolled 8/8 at 13:43; compose rolled (basegeek `--no-deps`, datastores untouched); fleet healthy; `CSRF_TOKEN=enforce` live 13:48 with 0 rejections in the first minutes. Post-deploy fix `ddd2b4f` (empty `environment:` keys) is local-only until wave 19. Q40: production `fooditems` never had a unique barcode index (only the compound non-unique `barcode_1_is_deleted_1`), so the E11000 was latent, not live — no migration run; the partial unique index is declared in the shared schema for wherever autoIndex builds it. notegeek `CURSOR-CONTEXT.md` is gitignored (placeholders only) and the classifier refused tracking it — Chef's call.
 pushed

- 09-05 13:19 — `446e5c0` (86 commits: R19–R49). Release: success (images published 13:24, Watchtower rolling). CI: **eslint job failed** — `packages/logger` had a lint script and no flat config (R6 had never been through CI). Fixed in `e183fdd`; goes with the next wave.

- 09-05 13:28 — Watchtower deployed the wave (updated=8). **Incident:** basegeek crash-looped — `graphql/bujogeek/typeDefs.js` (d53b008) had raw backticks inside the gql template; no suite imported `graphql/index.js`. fitnessgeek crash-looped on the missing vault key because Watchtower recreates with the old env — fixed with `docker compose up -d` in apps/fitnessgeek (13:30, health 200). Hotfix `61d3109` (typeDefs escaped + `gatewaySchemaLoads` tripwire) pushed 13:32, CI green, Watchtower restarted basegeek 13:40 — healthy, gateway apps 200 (outage ≈13:28–13:40); an accidental push of `3a7c84b` (logger config, R52) went 20s earlier because the scope check's `grep -c` exits 1 on a zero count and broke the `&&` chain — never chain `&&` after the count.

- 09-05 14:05 — wave 3 (`8ce9296`, 34 commits): CI green; **Mobile harness workflow failed** on its first enforcing run — `pnpm --filter … ci` was pnpm's install alias, not the script (broken since R4, masked by continue-on-error). Fixed `4ef412d` (`run ci`), ships with wave 4. Watchtower deployed wave 3 at 14:13 (updated=6); all eight apps 200. R50, R51, R53–R57, R59, R60, hotfix follow-ups, syntax gate, harness enforcing. Gate: frozen install, `pnpm -r lint`, syntax check all green before push.

- 09-05 14:23 — wave 4 (`c6c4136`, 16 commits): CI + Release green, Watchtower deployed 14:34 (updated=7), all eight apps 200. **Harness workflow failed again**, now for real: every `vite preview` "did not start" because Vite bolds the port in colour mode on Actions and the URL regex missed it. Fixed `15aaf38` (ANSI strip + NO_COLOR), verified locally; ships with wave 5 (R66). harness workflow fix (`run ci`), keto-ring fix (R65), R58, R61, R64, docs. Gates green.

- 09-05 14:43 — wave 5 (`9712fe8`, 8 commits): R66 + harness readiness fix (`15aaf38`). Gates green; CI + Release green; Watchtower 14:53 (updated=7); all eight apps 200. **Mobile harness workflow green in CI for the first time (14:54) — M6 guardrails done, enforcing.**

- 09-05 15:12 — wave 6 (`d224d40`, 9 commits): R67, R68, comment fixes. Gates green; CI, Release and harness workflow green; Watchtower 15:23 (updated=7); all eight apps 200.

- 09-05 15:39 — wave 7 (`120b54e`, 6 commits): R69, R70. Gates green; CI, Release and harness workflow green; Watchtower 15:50 (updated=7); all eight apps 200.

- 09-05 16:35 — wave 8 (`7fd206b`, 22 commits): R74, R75–R80 (all four P0s + 14 P1s from the review), consolidation complete. Gates: frozen install, syntax, boot-smoke, repo lint. CI, Release and harness green; Watchtower 16:43 (updated=7); all eight apps 200.

- 09-05 16:55 — wave 9 (`116a797`, 8 commits): R81, R82, CSRF caller context, docs. Gates green; CI, Release, harness green; Watchtower 17:00 (updated=2: basegeek, fitnessgeek); all eight apps 200. First report line with context: **startgeek** (start.clintgeek.com, Firefox) POST /graphql, cookie, no header.

- 09-05 17:39 — wave 10 (`97ca1a4`, 11 commits): R83, R84 (a11y report-only), R86 (CSRF heal), docs. Gates green; CI, Release, harness green; Watchtower 17:49 (updated=8); all eight apps 200.

- 09-05 18:24 — wave 11 (`8029305`, 9 commits): R85 (+fallback guard), R87, R88. Gates green; workflows green; Watchtower 18:33 (updated=8); all eight apps 200; dead asset paths now 404 live on startgeek and fitnessgeek.

- 09-05 21:06 — wave 12 (`1b1b175`, 15 commits): R89 (a11y 0, enforcing), R90, R91, R92, docs. Gates green; CI, Release and the harness (first run with --enforce-a11y) green; Watchtower 21:13 (updated=7, +1 at 21:15); all eight apps 200.

- **Incident 21:50–21:55:** storygeek crash-looped for ~5 min after its first env_file-only recreate (malformed DB_URI in .env.production, see Q56); restored with an explicit compose override. Cause of the aborted fleet roll: a zsh variable named `path` clobbers PATH — never use it.

- 09-05 22:13 — wave 13 (`e587b16`, 14 commits): deployed 22:23 (updated=8), all eight apps 200 and every container (healthy). **CI red on test-bujogeek**: two backend tests asserted the pre-R94 axios timeout behaviour; R96 updated them but landed after the push — fixed by wave 14. Wave 13 was: R93, R94, R95, R97, R98, R99 + storygeek override + healthcheck fix. Gates green.

- 09-05 22:30 — wave 14 (`a0450d7`, 8 commits): R96 (bujogeek+notegeek going-over, fixes the red CI job), R101, R102, docs. Gates green; CI, Release and harness green 22:45; rolling out on the next Watchtower scan.

- 09-05 22:47 — wave 15 (`2a46cd7`, 8 commits): R100 (gql-arg-audit + medication saves fixed at the gateway), Q66, STATUS. Gates green; CI, Release, harness green 23:02; Watchtower rolled waves 14 and 15 at 22:51 (2) and 22:58 (5); all eight apps 200 and healthy.

- **Incident 23:20:** the R103 agent ran `git stash`/pop despite the hard rule (to diff lint baselines) while R104/R105 were writing; the one stash entry on the box turned out to be an old `WIP on dashgeek-redesign` from the parked April work, not tonight's — nothing was lost; Chef may `git stash drop` it. Rule restated in the preamble for future runs: baselines via `git show HEAD:<path>`, never stash.

- 09-05 23:12 — wave 16 (`821a0bb`, 7 commits): R104, R105, R103, docs. Gates green; CI, Release, harness green 23:27; Watchtower 23:23 (updated=7); all eight apps 200 and healthy. **All 105 streams landed and deployed.**

- 09-06 00:07 — wave 17 (`add7227`, 17 commits): CI + Release green; Watchtower 00:19 (updated=7); harness workflow green 00:21; all eight apps 200 and healthy. R107, R108, R109 (applied), R110, R111, R112, tag-rename guard, docs. Gates green. **All 112 streams landed and deployed; nothing running. Sage is idle — the remaining board items are Chef's decisions.** Review 2's #2–#15 fixed; #1 = Q56, #11 = Q69 (Chef).

- **Incident 00:15:** the box ran low on memory and the OOM killer took the wave-17 monitor. Cause: a 2.6 GB vitest worker orphaned since ~13:40 plus four `vite preview` servers left behind when their agents were stopped mid-harness. All killed by PID; 14 GB available after. See Q70.

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
