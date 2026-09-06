# GeekSuite — Status

*Updated 2026-09-05 23:05 CDT. Morning: three deploys (Pocket Pass M0–M5, AIGeek, Ask). Afternoon
and evening: the 28-hour quota burn — fourteen waves (last `a0450d7`), 105 streams landed, all
verified live. The live board with every stream, incident and open decision is
`DOCS/BURN_QUEUE.md`; the cross-stream review is `DOCS/BURN_REVIEW.md`; the AI ideas are
`DOCS/AI_IDEAS.md`.*

## Phase 2 — the going-over (evening of 2026-09-05)

Chef: "give the entire GeekSuite a good going over, fix what needs fixing." Seven reviewers read
every tree whole with fix authority inside it; each fix carries a test. Roughly 600 tests were
added. What they found had been live for weeks or months, not introduced today:

- **Broken for users**: the medications page always empty; a barcode scan returning a random
  food; every Add/Edit Medication rejected at the gateway; Calibre rescan never worked since the
  Node move; story creation dead; hatch events impossible to log; editing a task from most bujogeek
  pages un-filed it and un-recurred it; Back in notegeek created two notes; every save failure
  invisible; storygeek's compose had no `env_file` at all.
- **Security**: an unauthenticated route whose first act wiped the imported library; path traversal
  and SSRF in bookgeek and basegeek; flockgeek's owner id taken from a request header; an open
  redirect on the console's login; one-tap permanent user deletion; a datastore credential pair in
  git-tracked public files; a provider key in URL query strings; auth headers and a login body in
  error logs; `/register` unlimited; password changes leaving other sessions valid.
- **Robustness**: uncaught datastore errors that could kill the API; no outbound timeouts on token
  validation, OAuth or any auth proxy; a refresh timer that logged you out on any network blip;
  compose healthchecks and log rotation everywhere.
- **New gates**: `tools/gql-arg-audit.mjs` (frontend documents vs gateway schema, both directions)
  and a payload-coercion test that found the medications bug; both in CI.

**Decisions waiting on Chef** (board Q-items): **rotate the datageek datastore credential (Q58)**;
repair the malformed storygeek DB connection line and drop the compose override (Q56); reload
startgeek then flip CSRF enforce after 24h clean (Q18b); revoke LocalApps (Q10); branch protection
(Q43); container TZ (Q42); the policy set in Q62 (API-key conversation ownership, key minting for
any app name, several dead-but-mounted layers); Q22/Q38 deletions; Q48 triage.

## Read this first

- Pushes to `main` rebuild all eight images; Watchtower restarts only the containers whose image
  digest changed (observed 2026-09-05: a bookgeek-only fix restarted bookgeek and basegeek).
  After a push check `docker ps` ages; if an app did not update see the digest note in `DOCS/CICD.md`.
- Every change is a separate commit with a message that says what it does and how it was verified.
  `git log origin/main..HEAD` lists them; each is safe to revert on its own.


## The burn (2026-09-05 afternoon) — what changed, in one screen

**Mobile.** Every app is at 0 findings in the mobile harness (`tools/mobile-harness`, 139 scenes,
phone dark + light), and the workflow is enforcing. Root causes were structural, not one-offs:
a notegeek GlobalStyles rule undoing the 44px input floor, controls bypassing the theme floor in
bujogeek, chip/select floors missing in fitnessgeek's theme, pseudo-element hit areas the probe
could not see (it can now). Shared empty/error/toast primitives are in all seven MUI apps (TODO #15
done; #19 done).

**Consolidation.** fitnessgeek's food-log writes go through basegeek's gateway end to end and the
REST routes are deleted; bookgeek's profile/filters/shelves/AI-status moved to the gateway and the
hardcoded API origin is gone; dead backend code and 21 unused dependencies removed across four thin
backends. **All 13 fitnessgeek models are now shared `@geeksuite/schemas` factories** with parity
suites on both sides (`DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md`, §12 lists 14 follow-ups);
`DOCS/STORYGEEK_GATEWAY_DECISION.md` recommends deleting the caller-less storygeek gateway module.

**Review.** An adversarial read across all streams (`DOCS/BURN_REVIEW.md`) found 4 P0 and 18 P1;
all four P0s and most P1s were fixed and deployed the same afternoon: books published before 2000
were un-editable, `/api/ai/parse-json` was ungated, flipping `CSRF_TOKEN=enforce` would have logged
the suite out (the six auth proxies now forward the token), flockgeek REST let the body set the
owner. Zod now guards every REST backend except flockgeek's and every gateway module.

**Security and correctness.** Zod validation on fitnessgeek, storygeek, bookgeek and the bujogeek
gateway mutations; the Garmin password is encrypted at rest through the shared UserSettings schema
(backfilled; `KEY_VAULT_SECRET` is now shared basegeek↔fitnessgeek — see `DEPLOY.md`); aiGeek
routing and attribution keyed by API key with service keys (storygeek's minted, restart pending);
the OpenAI-compatible proxy passes its 73-test conformance suite; eight calendar-date off-by-one
sites fixed; a latent StoryPlay render loop fixed; the keto net-carb ring regression (a drifted
gateway model) fixed the same afternoon it was introduced.

**Platform.** `@geeksuite/utils` (dates), `@geeksuite/logger` (pino + redaction), `@geeksuite/schemas`,
`@geeksuite/crypto-vault`, fitnessgeek backend on node 20 + ESM, CSRF double-submit token in report
mode, storygeek/bookgeek/flockgeek/fitnessgeek frontend test suites in CI, a `node --check` syntax
gate in CI (born from the basegeek outage below).

**Incidents (all closed).** basegeek crash-looped after wave 2 on an unescaped backtick in a gql
template no test imported (hotfix + `gatewaySchemaLoads` tripwire; ≈12 min outage). fitnessgeek
crash-looped on the new vault key because Watchtower recreates containers with their old env — a new
env var needs `docker compose up -d` in the app dir right after the deploy. The harness workflow had
been silently failing since it landed (`pnpm … ci` is pnpm's install alias, not the script).

**Waiting on Chef** (details on the board): Q10 revoke the LocalApps key; Q1 restart storygeek to
pick up its service key; Q18b flip `CSRF_TOKEN=enforce` (safe after wave 8; wait for 24h of clean
report-only logs); Q22 flockgeek's caller-less REST layer; Q38 delete the storygeek gateway module;
Q42 the containers' `TZ` is inert (no tzdata) — keep UTC or install it; Q43 branch protection; Q48
triage the consolidation follow-ups; Q11 `Databases.jsx`; Q14 CanonCard.

## What landed tonight (the morning)

### Mobile UI plan — the "Pocket Pass" (`DOCS/MOBILE_UI_PLAN.md`)

| Pass | Status | Notes |
|------|--------|-------|
| M0 shared grammar (`packages/ui`) | **Done** | GeekSheet, GeekDialog, GeekFab, `useGeekPrimaryAction`, compact top bar below md, dvh shell, safe areas, `viewport-fit=cover` in all 8 apps, 16px inputs on phones, hover-only actions visible on touch, drawer width scoped to left drawers, sheets close on Escape. UI tests 278 → 340. |
| M1 BookGeek pilot | **Done** | App.jsx split into views; library (shelf strip, filter sheet, cards, FAB, top-bar search), detail sheet, full-screen reader, Settings page, Add book and basket on shared surfaces; runtime Tailwind CDN removed (closes TODO_ORDER #27). |
| M2 fitnessgeek | **Done** | FAB for logging food, all dialogs full-screen below sm on the Studio Slate skin, grids, 44px targets. |
| M2 bujogeek | **Done** | Quick-add FAB + sheet, row action sheet, full-screen editors on a BujoDialog skin, week strip + agenda on the monthly calendar, More sheet on GeekSheet. |
| M2 notegeek | **Done, not screenshot-verified** | Build, lint and 141 tests green. The dev server fails with a pre-existing esbuild optimizer fault (`styled_default is not a function`); production build is fine. |
| M3 flockgeek | **Done** | Bottom tab bar, harvest FAB + sheet, four tables as cards with sort/filter sheets, eleven Ledger dialogs. |
| M4 storygeek, basegeek | **Done** | storygeek: rails as sheets, flex play surface, Codex dialogs, Bookify full-screen. basegeek: console dialogs, responsive tables, scrollable tabs, dvh public pages. |
| M5 startgeek | **Done** | First manifest/SW/offline page, safe areas, labelled dock, phone hero, 44px targets. |
| M6 guardrails | Not started | Harness into the repo (fix the moved Playwright path first), review checklist in CI. |

Open follow-ups are in `MOBILE_UI_PLAN.md` §4b and the M3–M5 list under it (GeekAppFrame `fill`,
GeekSheet close control, notegeek dev-server fault, basegeek `Databases.jsx` orphan, the moved
Playwright path).

### basegeek

- **Home**: Applications lists the six key apps in order (fitnessgeek, bujogeek, notegeek,
  bookgeek, flockgeek, startgeek); Infrastructure shows PostgreSQL and each service's version.
  bookgeek and startgeek are in the health proxy fallback and the seed. The production app
  registry in Mongo was not changed; the admin seed endpoint adds the two rows if wanted.
- **AIGeek, phases A–C** (`bdd081e`, `4fac2ef`, `7cc3299`, `887b78a`): dead code out; provider
  keys admin-gated on REST and GraphQL and masked in responses (they were readable and decrypted
  by any signed-in user); toasts and shared empty/error states; director cost analysis was
  1000× too high (per-1K math on per-1M prices), fixed; one provider roster in
  `config/aiProviders.js` (llm7 and onemin retired, neither worked); defaults refreshed;
  `AI_CATALOG.md` regenerated from code; usage tables render as cards on phones.
- **Model steward** (`5e989e3`): recommend a free model for a task description, list free models
  with properties; GraphQL + REST; App Routing dialog gets "Recommend a free model" and a
  browsable picker. API tests 466 → 552.

### StartGeek Ask (`DOCS/AI_SEARCH_PLAN.md`)

Chef's decisions: opt-in (off by default), `??` prefix, model chosen by aiGeek as routing data.
Built: `glanceAsk` on the server (`e80cb5a`) and the `??` mode with answer card and setting on the
client (`b0fe9c4`). To use it: turn on "Ask the suite with AI" in StartGeek settings, and set the
`startgeek` row in AIGeek → App Routing (the dialog can recommend a free model).
Step 5 (command routing fallback) landed 2026-09-05 (`dfe7473`).

### Chef's three follow-ups (2026-09-05, deployed)

- **basegeek Home data** (`f45a5af`): the app registry seeds its missing default rows on boot —
  production had *zero* rows; the first boot created all ten. fitnessgeek and notegeek now
  answer `/api/health`, so Home's dots reflect a real 200.
- **AIGeek phase D** (`4d4cdc2`, `f265a0b`, `13a7205`): dead providers deleted, Anthropic rate
  0.006; admin-only routes (AIGeek, UserGeek, DataGeek) gated on the client with a toast redirect
  and hidden from the sidebar; the page split into `pages/aigeek/` (hook + tabs + dialogs), Free
  Tier merged into Catalog with inline editing, a test-prompt playground. Two one-line `llm7`
  references remain in `aiDirectorService.js`/`rateLimitService.js` (a ghost zero-model card).
- **Ask step 5** (`dfe7473`): `>` / `<` capture falls back to an aiGeek draft with a preview chip
  when the parser can't read the line and Ask is on. The `<` gate is a judgement call in
  `apps/startgeek/src/lib/captureDraft.js`.

### Housekeeping

- Root `.gitignore` had `*data*`, which silently kept `MetadataList.jsx` out of a commit.
  Narrowed to `data/`. Check `git show --stat` after adding new files.

## Decisions Sage made that Chef can overrule

- BookGeek has no bottom tab bar; the shelf strip is its phone navigation.
- BookGeek uses one serif (DM Serif Display); Libre Baskerville dropped.
- BookGeek's basket toggle moved off the card into the detail sheet's More menu plus a Select mode.
- bujogeek: tapping a day pill on the phone selects it for the agenda instead of navigating.

## How the work was verified

A Playwright harness (scratch, not in repo) stubs every API call with fixtures and screenshots
each app at iPhone 14 in dark and light, plus 1280×900. Every view commit names what was
screenshotted. Unit suites: `pnpm test` in `packages/ui` (340) and `apps/basegeek/packages/api`
(552), `npx vitest run` in `apps/notegeek/frontend` (141). Builds and lint pass in every touched
app with no new warnings.

## Next

1. Poke at every app on a phone; report what feels wrong.
2. M6 guardrails (harness into the repo; fix the moved Playwright path first).
3. `DOCS/TODO_ORDER.md` #17 shared date utilities, #21 fitnessgeek UserSettings consolidation.
