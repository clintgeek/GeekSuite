# GeekSuite — Status

*Written 2026-09-04, end of session. 37 commits on `main` ahead of `origin/main`, nothing pushed.
Working tree clean.*

## Read this first

- **Nothing has been deployed.** Every push to `main` rebuilds and restarts all eight apps via
  Watchtower (`DOCS/CICD.md`). Push when you have looked; afterward check `docker ps` ages against
  the release, and if an app did not update see the Watchtower digest note in `DOCS/CICD.md`.
- Every change is a separate commit with a message that says what it does and how it was verified.
  `git log origin/main..HEAD` lists them; each is safe to revert on its own.

## What landed tonight

### Mobile UI plan — the "Pocket Pass" (`DOCS/MOBILE_UI_PLAN.md`)

| Pass | Status | Notes |
|------|--------|-------|
| M0 shared grammar (`packages/ui`) | **Done** | GeekSheet, GeekDialog, GeekFab, `useGeekPrimaryAction`, compact top bar below md, dvh shell, safe areas, `viewport-fit=cover` in all 8 apps, 16px inputs on phones, hover-only actions visible on touch, drawer width scoped to left drawers, sheets close on Escape. UI tests 278 → 340. |
| M1 BookGeek pilot | **Done** | App.jsx split into views; library (shelf strip, filter sheet, cards, FAB, top-bar search), detail sheet, full-screen reader, Settings page, Add book and basket on shared surfaces; runtime Tailwind CDN removed (closes TODO_ORDER #27). |
| M2 fitnessgeek | **Done** | FAB for logging food, all dialogs full-screen below sm on the Studio Slate skin, grids, 44px targets. |
| M2 bujogeek | **Done** | Quick-add FAB + sheet, row action sheet, full-screen editors on a BujoDialog skin, week strip + agenda on the monthly calendar, More sheet on GeekSheet. |
| M2 notegeek | **Done, not screenshot-verified** | Build, lint and 141 tests green. The dev server fails with a pre-existing esbuild optimizer fault (`styled_default is not a function`); production build is fine. |
| M3 flockgeek | Not started | Tables → cards, harvest FAB, bottom-nav decision. |
| M4 storygeek, basegeek | Not started | |
| M5 startgeek | Not started | Manifest + safe areas first. |
| M6 guardrails | Not started | Harness into the repo with a saved sign-in state Chef creates once. |

Open follow-ups are in `MOBILE_UI_PLAN.md` §4b (a `GeekSheet` autofocus prop, the notegeek
dev-server fault, three bujogeek dialogs not converted, fitnessgeek dead files).

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
Step 5 (command routing fallback for `>` / `<`) is not built.

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

1. Push, watch the fleet come back.
2. M3 flockgeek.
3. Ask step 5, when wanted.
