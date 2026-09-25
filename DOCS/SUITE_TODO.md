# GeekSuite TODO — Active Backlog

Prioritized suite-wide backlog. Grouped by theme; ordered roughly by impact and ease within each group.
Pull from here when planning the next pass; update as work lands or priorities shift.

> [!NOTE]
> All completed work streams from 2026-08 and 2026-09 (including the Night 2 burn, mobile harness,
> shared package extractions, and model consolidations) have been archived into
> [`DOCS/ARCHIVE/LANDED_2026_LOGS.md`](ARCHIVE/LANDED_2026_LOGS.md).
> Historical work queue tiers from `TODO_ORDER.md` are archived at
> [`DOCS/ARCHIVE/TODO_ORDER_2026-09.md`](ARCHIVE/TODO_ORDER_2026-09.md).
> For the append-only scratch-pad of deferred ideas, see [`DOCS/DEFERRED_WORK.md`](DEFERRED_WORK.md).

---

## 1. In Flight

- **Suite-wide Documentation & Backlog Consolidation** (Stream 1–4): Establishing canonical Sage session files (`THE_CONTEXT.md`, `THE_PLAN.md`, `THE_STEPS.md`), tracking `GRAPHQL.md`, moving completed sprint docs to `ARCHIVE/`, and updating `README.md`.
- **Mobile Harness CI Ratchet**: Maintaining 0 findings across **150** scenes in `.github/workflows/mobile-harness.yml`. (Was written as 139; corrected 2026-09-16.)
  - Note, learned 2026-09-16: a scene whose `setup` returns `false` is **skipped, not failed**, so the run still reports PASS. fitnessgeek's scene 11 covered nothing for two days that way. A skipped scene is silent — check the per-scene lines, not just the total.

---

## 2. Cross-Cutting Security

- **Rotate the InfluxDB password** (Chef, found 2026-09-22)
  - `apps/fitnessgeek/tools/influx-mcp/README.md` shipped the real `INFLUXDB_PASSWORD` in its setup examples since the monorepo import (`a84c1c48`), so it is in public git history. The README now carries a placeholder; the value itself still needs rotating in Influx and in every `.env.production` that sets it.

- **CSRF Protection: Flip `CSRF_TOKEN=enforce`** (Chef item Q18b)
  - Double-submit CSRF protection (`geek_csrf` cookie + `X-CSRF-Token` header) is live across all seven backends in `report` mode.
  - **Enforce Checklist before flipping**:
    - [x] `@geeksuite/auth` sends the header (`logout()`, `doTokenRefresh()`, `setupAxiosInterceptors()`)
    - [x] basegeek's own `packages/ui/src/api.js` interceptor sends it
    - [x] `packages/api-client`'s shared Apollo `authLink` sends it
    - [x] `apps/startgeek/src/lib/graphql.js` and `apps/startgeek/src/lib/basegeek.js` send it
    - [ ] Trace and eliminate remaining ~5 per 24h `POST /api/auth/refresh` warnings from `axios/1.13.5` (an app-proxied refresh whose browser caller omitted the header).
    - [ ] A full 24-hour window with zero `CSRF token check (report-only)` warnings in basegeek's logs.
    - [ ] Flip `CSRF_TOKEN=enforce` in `apps/basegeek/.env.production` and restart.

- **`CORS_ORIGINS` is unset in the basegeek container** (live, seen 2026-09-16). Production is
  running on the hardcoded fallback origin list and says so at boot:
  `CORS_ORIGINS not set; production is running on the hardcoded fallback origin list`.
  This is the Watchtower env landmine — `env_file` is resolved at container-create, so a
  Watchtower deploy never picks up a new variable. Fixing it needs `docker compose up -d`, not a
  push. (The related design concern — that the fallback arrays ship with dev and LAN origins — is
  separate and lives in DEFERRED_WORK.)

- **HttpOnly Cookies & Token Verification**
  - Verify no client frontend attempts to read `document.cookie` directly for `geek_token` or `geek_refresh_token`.
  - Confirm all auth hydration flows exclusively through `/api/users/me` or `@geeksuite/user`.

- **Registration is public, and BookGeek (plus GameGeek's default household) is shared by
  every account** — found 2026-09-24 while designing GameGeek's tenancy. Any sign-up can read,
  edit and delete the whole household library today. Plan and recommendation (ship
  `REGISTRATION_MODE=closed` now, `invite` mode later):
  [`DOCS/REGISTRATION_GATE_PLAN.md`](REGISTRATION_GATE_PLAN.md). **Proposal, not implemented.**

- **Suite-wide households / multi-tenancy** — the real fix the registration gate is a stopgap
  for. `households` collection in `userGeek`, expiring single-use invites, server-side
  resolution (not a JWT claim), per-app migration table (BookGeek backfill, GameGeek's
  `resolveHouseholdId` swap, FitnessGeek's household becomes a layer over it). Phased H0–H5:
  [`DOCS/SUITE_HOUSEHOLDS_PLAN.md`](SUITE_HOUSEHOLDS_PLAN.md). **Proposal, not started.**

- **nginx `client_max_body_size` has no suite-wide documented home.** Its absence 413'd every
  basegeek AI call carrying an image (found 2026-09-something, recorded only in agent memory,
  not in `DOCS/RUNBOOK.md`'s landmine table). The nginx config itself isn't in the repo, so
  this recurs for any new app that uploads images (GameGeek's cover uploads, `/mcp`'s image
  tools if any land) unless someone remembers by word of mouth. Worth a line in RUNBOOK's
  landmine table the next time this bites, so it stops being tribal knowledge.

---

## 3. UI / UX & Design Language

### Highest Leverage / Follow-ups
- ~~**FitnessGeek Food Search Rebuild**~~ — **shipped 2026-09-14**, and superseded as the primary path by **describe-and-log, shipped and verified live 2026-09-16** ([`THE_DESCRIBE_AND_LOG_PLAN.md`](../apps/fitnessgeek/DOCS/THE_DESCRIBE_AND_LOG_PLAN.md)). The four Phase-4 UI decisions were all settled 2026-09-14; this entry claimed otherwise until 2026-09-16. Search remains as the fallback for picking a specific branded item.
  - **Still open, small:** the ranker's `chosenForQuery` pin is read by `foodRanker` and written by nothing, so "what you picked for this query last time" does not rank. Note the describe path has its OWN history reuse (`findInHistory`), so the common case is already covered; this only improves the search fallback.
- **Shell Grammar Visual Pass**: Verify every app at mobile viewports (iPhone 14) and desktop widths in both light and dark modes. Ensure no regressions from the GeekShell navigation migration.
- **StoryGeek Three-Column Surface**: Three-column play surface loses 220px on desktop due to sidebar; evaluate breakpoint threshold for collapsing side panels to preserve editor breathing room.
- **Shared Mobile Bottom-Nav Primitive**: Standardize bottom navigation across bujogeek, notegeek, fitnessgeek, and flockgeek into one `@geeksuite/ui` primitive.

### Contrast & Typography
- **Contrast Regression Ratchet**: Keep `packages/ui/src/__tests__/themeContrast.test.js` green across all light and dark theme permutations.
- **BookGeek Primary Button Contrast**: Sky `#0ea5e9` with white `contrastText` is 2.8:1 in both modes ("Add book", "Create"). Darken accent or utilize dark contrastText.
- **Login Wordmark Brand Colors**: Ensure `LoginSplash` brand colors meet AA standards on dark cards (fitnessgeek `#2563eb`, bookgeek `#1d4ed8`, storygeek off-identity purple/orange).
- **StartGeek Wallpaper Scrim**: Labels and weather glyphs can lose contrast against bright user-selected wallpapers; verify dock label shadows and weather text contrast.

### Polish & Accessibility
- **Auth-Hydration Splash**: Several apps display an unthemed grey container while hydrating user session. Provide a shared `GeekAuthSplash` in `@geeksuite/ui` honoring the app's theme.
- **Reduced Motion Support**: Ensure framer-motion transitions and bujogeek's grain overlay respect `prefers-reduced-motion`.
- **Themed Tooltips**: Replace MUI's default grey-700 tooltips with theme-derived tooltips in `createGeekSuiteTheme`.
- **Offline Pages**: Give flockgeek and bookgeek `offline.html` theme-aware styles matching their PWA manifest colors.

---

## 4. Shared Libraries & Refactors

- **Wire `installShutdownHooks`**: Connect `@geeksuite/logger`'s `installShutdownHooks(logger, server, { onClose })` into the 7 backend servers to replace bespoke shutdown logic.
- **FitnessGeek Secrets Parity**: `KEY_VAULT_SECRET` **is** set in the fitnessgeek container (64 chars, checked 2026-09-16). What remains is running the Garmin password backfill (`scripts/encryptGarminPasswords.js`) — Chef's call, same shape as basegeek's encrypt-keys migration, which ran 2026-09-16.
- **GraphQL Gateway Consolidation Follow-ups**:
  - Migrate remaining FitnessGeek REST reads (food search / barcode / favorites / recent in `foodService.js`) to gateway queries.
  - Retire FlockGeek caller-less mounted REST layer in `routes/api.js` (Chef item Q22).
  - Delete unused StoryGeek gateway schema in `apps/basegeek/packages/api/src/graphql/storygeek` (Chef item Q38).
- **Mongo Connection Topology (basegeek)**:
  - Investigated: four connection pools serve four distinct databases (`userGeek`, `basegeek`, `aiGeek`, app data). Deferred unless connection limits become a bottleneck. Avoid calling `getAppConnection('usergeek')` which would spawn a redundant pool.

---

## 5. Features & Fixes

### FitnessGeek body data — deferred from `DOCS/FITNESSGEEK_BODY_DATA_PLAN.md` §5

Wanted, not built on the 2026-09-22 overnight run:
- **Segmental view** — the ten limb/trunk values are stored, not shown. Revisit after ~3
  months of scans or when lifting starts; they need a stability baseline before a left/right
  difference means anything (plan D7).
- **"Body" section in Reports** — 7/30-day weight and body-comp averages, mirroring
  `BPInsights`.
- **StartGeek glance card** shows no weight at all (`glance/resolvers.js` fitness block).
- **Garmin push of scale weights** — plumbing exists end to end but nothing calls it; the
  folder import has no user timezone and the push resolver falls back to
  America/Los_Angeles (plan D9). Needs a timezone in `UserSettings` first.
- **Weight on the mobile bottom nav**; "Health Dashboard" is Garmin-only and its name
  invites confusion with body data.
- **REST `aiInsightsService.js`** duplicates the gateway's context builder and no client
  calls it — delete or reconcile.
- **Household `share_weight`** is a setting nothing honours.

### GameGeek

- **BookGeek prep** — the deletion pass (dead REST CRUD, `/kindle-test*`, dead models),
  `CONTEXT.md` fixes, and the `@geeksuite/collection` extraction (BookGeek and GameGeek
  consolidated onto it together, since GameGeek is shipping tonight with its own copies of
  the library components to move fast). Step-by-step, verified per step:
  [`DOCS/BOOKGEEK_PREP_PLAN.md`](BOOKGEEK_PREP_PLAN.md). **Proposal, not started.**
- **GameGeek phases G2–G6** — `GamePlayer` split/sessions/Journal, Steam+CSV imports, Tonight
  rules engine + Stats, free-walk AI (cuttable), backlog goal/wishlist/loans/scan-to-add/MCP.
  Full phase table and done-when criteria: [`DOCS/GameGeekPlan.md`](GameGeekPlan.md) §11.
  Blocked on P0 prep and Chef's answers in §13.
- **GameGeek library feed = Playnite** (Chef, 2026-09-25). The library is fed and updated
  from the Playnite Library Exporter JSON; Steam is for metadata, not the library. In
  order: (1) manual upload with a dry run (**building 2026-09-25**); (2) metadata and
  cover enrichment from Steam → IGDB → RAWG, filling empty fields only; (3) automatic
  import from a Nextcloud `gamegeek-import/<user>/` drop, the FitnessGeek body-comp
  pattern. Spec: [`apps/gamegeek/DOCS/PLAYNITE_IMPORT.md`](../apps/gamegeek/DOCS/PLAYNITE_IMPORT.md).
  Heroic and GOG Galaxy importers are shelved, since Playnite already aggregates those
  stores ([`DOCS/GAMEGEEK_STOREFRONT_IMPORTS.md`](GAMEGEEK_STOREFRONT_IMPORTS.md)).

### Suite MCP server — `DOCS/MCP_PLAN.md`

Proposed 2026-09-22: a `/mcp` route in basegeek so ChatGPT / Claude clients can read suite
data through curated, read-only tools. Blocked on Chef's three answers in the plan's §6
(ChatGPT → OAuth; health data in or out; read-only v1), then a spec via `spec-builder`.

### BuJoGeek — remaining from `DOCS/BUJOGEEK_REVIEW_2026-09.md`

All of §1 and §2 shipped 2026-09-20/21. What is left, in the report's own
recommended order:

- ~~**§3.1 Indexes**~~ — done 2026-09-21 (`b8458bcd`), verified with explain.
  The override fetch's missing DATE bound remains open; the index itself is
  served by the partial unique index on `(seriesId, originalDueDate)`.
- **§3.1 leftover — the unbounded override fetch.** Still pulls every
  materialised override for every series with no date bound, on every load.
- **§3.2 Two N+1s** — each collection costs four count queries (two field
  resolvers each calling a two-count helper); `currentStreak` issues one log
  query per habit. Both bounded; fold in when those files are open.
- **§3.3 `TaskRow` is not memoised** — `mapTasksState` re-sorts the whole
  array on every mutation, so one checkbox tap re-renders every row. Matters
  on Search/Backlog, which render the full corpus.
- **§3.5 Two doors onto the blocked state machine** — `updateTaskStatus`'s
  resolver throws a plain Error where `blockTask` throws a classified one, and
  `updateTask` accepts `status` straight through, bypassing the guard and the
  timestamp stamping. Latent; loaded for the next bulk-edit feature.
- **§3.6 Undocumented ownership exception** — push-subscription upsert matches
  on endpoint alone and re-stamps `createdBy`. Deliberate, but `CONTEXT.md`
  states the invariant with no exceptions. Needs a line in that doc.
- **§4 UX gaps — four of ten done 2026-09-21.** Shipped: one-tap move to
  tomorrow, focus-by-id, the habit delete confirm, the missing g-chords on
  Plan/Tags, and the phantom ⌘K help row.
  **Still open:** Plan's Weekly and Backlog cannot edit a task at all (the
  biggest remaining one — the screen whose job is planning can only complete
  or delete); Review's `e` re-files instead of editing; `RecurringEditDialog`
  bypasses `BujoDialog` and its 44px floor; subtask removal is the one delete
  with no confirm; day navigation on Today is mouse-only.

**Open question for Chef:** recurring reminders fire once and then go silent
(documented in `apps/bujogeek/DOCS/REMINDERS.md`, not fixed). The fix changes
what `remindedAt` MEANS and needs a decision: when a push is missed because
the app was down over its due time, should it arrive late or be skipped?

### FitnessGeek — food logging

- **Search never returns saved meals.** Describe-and-log now uses them
  (2026-09-22), but typing a meal's name in the search box still only finds
  foods. Needs UnifiedFoodSearch changes.
- **Saved meal: whose meal type?** A described saved meal takes the meal type
  from the sentence or the time of day, not the meal's own saved type. Chef's
  call which is right.
- **Saved foods without "homemade" in the name** are still only reached by the
  history lookup, which misses "2 fage yogurts" (quantity is in its key). Fixing
  that safely needs a marker on food rows saying whether a person or an
  estimate created them — a shared-schema change.
- **Flaky test:** `bloodPressureEdit.test.jsx` times out at 5 s under full-suite
  concurrency and passes alone. Seen by an agent 2026-09-22; not reproduced in
  the main checkout's runs.

### FitnessGeek — Health Dashboard

- ~~**The sleep dashboard contradicts the watch.**~~ — **fixed 2026-09-22**
  (`bcf9a12e`, `ebef8178`, `ebbdaad5`). Garmin's stage codes were decoded
  wrong; fixing that exposed ten more bad numbers downstream, all fixed. The
  dashboard now matches Garmin's own summary to the minute on every night
  checked. Full account in
  [`FITNESSGEEK_HEALTH_DASHBOARD_FINDINGS.md`](./FITNESSGEEK_HEALTH_DASHBOARD_FINDINGS.md).
- **Still open from that work:**
  - A real nocturnal HR dip — sleeping HR against waking-hours HR from
    `HeartRateIntraday`. The old one compared a stage against a time of night
    and is null until this exists.
  - The sleep query window is UTC midnight-to-midnight. Fine for US Central
    sleepers after 7 PM local; splits the night for anyone earlier or further
    east. The function's own comment says it should widen and doesn't.
  - Meal Impact and Recovery Coach not examined beyond shared fields.
  - No mobile-harness scene for the Health Dashboard.

- **Eighteen mobile-harness scenes, 144 violations — still held.** Branch
  `fitnessgeek-review-fixes` (commit `e9a14922`), unmerged on purpose. Covers nine FitnessGeek
  screens the gate had never seen. Violations are real, deterministic across builds, identical
  in both themes — mostly text under the 12px floor (the Reports macro spine is 9px) plus four
  tap targets under 44px. Merging turns CI red. Fixing means changing type sizes on the
  densest chart screens: **Chef's design call, not a mechanical edit.**

### NoteGeek

- ~~**No undo for anything.**~~ — **done 2026-09-21.** Every note now carries
  version history (50 per note), and Compose, plain edits and restores are all
  labelled and reversible. This is also what makes Compose's `Replace this
  note` defensible.

- **The other in-gateway AI features still name no `need`.** Compose's
  2026-09-22 failure was routing: an in-process feature could not say what it
  needed, so synthesis went to a 7B row. `runFeatureCore` accepts `need:` now
  and Compose asks for `prose:deep` — but **suggest, review draft, quick-add,
  what-next and brief all still ask for nothing** and take whatever rotation
  offers. Each is a one-line change; the work is deciding the right need per
  feature, not making it. Worth a sweep, and the first place to look when one
  of them gives a poor answer.

- **Compose follow-ups** (shipped 2026-09-21, worth watching):
  - Compose is available on text, markdown and code notes. The canvas types
    (sketch, mind map, handwritten) have no plain text to read, so the button
    is hidden there rather than failing at the model.
  - The incremental workflow — paste scraps into a composed note, compose
    again, replace — has no affordance of its own yet. It works; it just
    isn't signposted. Worth watching whether that needs a "compose in" gesture
    or whether pasting-then-composing reads naturally enough.
  - `MAX_COMPOSE_CHARS` is 96k with 8 batches. No user has hit it yet; if one
    does, the cap is the thing to raise, not the batch size.

- ~~**Tidy's premise needs a decision.**~~ — **decided 2026-09-22: removed.**
  Chef's verdict was "Compose is what I wanted when I asked for tidy." The
  feature, its mutation, its type and its tests are gone; the reasoning behind
  its guards survives in `compose.js`'s header, and `git log -- apps/basegeek/
  packages/api/src/graphql/notegeek/tidy.js` has the code if a formatter is
  ever wanted again.

  What is genuinely lost: "keep my exact words, just fix the markdown."
  Compose rewrites. If that turns out to be missed, the thing to build is a
  formatter that shows a diff and asks — which is what Tidy should have been.

- **`remark-breaks`?** GFM was added 2026-09-21 so pipe tables render. BuJoGeek
  and StoryGeek also pin `remark-breaks`, which turns a single newline into a
  line break. Deliberately NOT added: it changes how every existing note
  renders, which is more than the reported bug asked for. Chef's call.



- **aiGeek capability routing** — the live work stream lives in
  [`DOCS/AIGEEK_CAPABILITY_ROUTING.md`](./AIGEEK_CAPABILITY_ROUTING.md). Stages 1–3 shipped
  2026-09-15/16: cause-based retirement, `need:`-based resolution, measured latency, and the
  golden set (model quality is measured now rather than inferred from model names). §7 records
  what the live run corrected. **Remaining:** §3.4 app configs storing needs rather than models,
  and §3.5 retiring the name-matching in `aiModelCapabilitiesService` — now unblocked, since the
  golden set supplies the real data it was standing in for.
- **FitnessGeek describe-and-log** — shipped and verified end to end 2026-09-16; see
  [`apps/fitnessgeek/DOCS/THE_DESCRIBE_AND_LOG_PLAN.md`](../apps/fitnessgeek/DOCS/THE_DESCRIBE_AND_LOG_PLAN.md).
  Remaining there: the search ranker's `chosenForQuery` pin is still unwired (the describe path
  has its own history reuse, so this only sharpens the fallback).

- **NoteGeek `getTagHierarchy` Intermittent 500**:
  - `GET /api/notes/tags` sets `children: null` for a shallow tag (`work`) and then indexes into it when a deeper tag (`work/project1`) arrives later. Mongo return order is non-deterministic.
  - Fix: Build the hierarchy tree with `children: {}` consistently, or sort tags by depth before building tree.
  - Test currently skipped: `apps/notegeek/backend/__tests__/controllers/notes.test.js`.

---

## 6. Tests & Observability

- **Input Validation (Zod)**:
  - Migrate remaining ad-hoc `if (!field)` route checks to Zod schemas.
  - Priority: FlockGeek REST routes (if retained per Q22) and NoteGeek gateway resolvers.
- **Mobile Harness CI Coverage**:
  - Add remaining edge scenes and modal interaction sequences to `tools/mobile-harness`.
- ~~**Flaky: `aiFreeTierRouting > "resets the counters in the mirror and in Mongo"`**~~ —
  **fixed 2026-09-16** (`84459025`). Worth keeping the shape in mind, because it was six sites
  across two files and only one of them ever went red: several paths book their bookkeeping
  fire-and-forget on purpose (`markFreeTierSuccess`, `recordStickyPick`, `updateStats`), and the
  tests bridged that with `await new Promise(r => setImmediate(r))` — one macrotask tick, which is
  a guess about how long a Mongo round-trip takes. It held when a file ran alone and lost under a
  full 91-suite run. `src/__tests__/eventually.js` polls for the condition instead; `settle()` is
  for the absence assertions, where polling proves nothing.
  **If you add a test that asserts on a detached write, use those two.**

---

## 7. Nice-to-Haves & Backlog Cleanups

- ~~**Dead Frontend Components Sweep**~~ — **done.** All five named files were already gone when checked 2026-09-16.
- ~~**BaseGeek Stale AI Model Defaults**~~ — **done.** `gemini-1.5-*` survives only in a comment describing retired models and in test fixtures; no production default names it (checked 2026-09-16).
- **NoteGeek `formatRelativeTime` Deduplication**:
  - Extract duplicated date formatting functions across three files to `frontend/src/utils/dateUtils.js`.
- **Gateway BroadcastChannel Logout**:
  - Add `geeksuite-auth`/`LOGOUT` broadcast message to any remaining non-standard logout routes.

---

## 8. Suite Tenancy & GameGeek (plans written 2026-09-24)

- **Suite households** — `DOCS/SUITE_HOUSEHOLDS_PLAN.md`. Proposal, not started. The
  suite-wide multi-tenancy model (a `households` collection in `userGeek`, server-side
  `requireHousehold(user)` resolution, expiring single-use invites). BookGeek and GameGeek
  both need this before a third user can safely exist; FitnessGeek's app-local household
  becomes a thin layer over it. See that doc's phased rollout (H0–H4).
- **Registration gate** — `DOCS/REGISTRATION_GATE_PLAN.md`. Proposal awaiting Chef's call, NOT
  implemented. `POST /api/auth/register` is public and rate-limited but not gated, and
  BookGeek's shared library (plus GameGeek's default household) means any sign-up can read,
  edit, or delete it today. Recommended stopgap: `REGISTRATION_MODE=closed` (one-line), ahead
  of the full suite-households plan.
- **BookGeek prep** — `DOCS/BOOKGEEK_PREP_PLAN.md`. Proposal, not started. The deletion pass
  (dead REST CRUD in `apps/bookgeek/api/src/server.js`, dead models, stale `CONTEXT.md`) plus
  the `@geeksuite/collection` extraction. Sequencing updated 2026-09-24: GameGeek is shipping
  tonight with its own local copies of BookGeek-modelled components, so the extraction now
  consolidates **both** apps onto the shared package in one pass rather than BookGeek alone.
- **GameGeek phases G2–G6** — `DOCS/GameGeekPlan.md` §11. Proposal, not started beyond
  G0/G1-ish work happening now. G2 (`GamePlayer` split, sessions, playthroughs, Journal), G3
  (Steam + CSV imports), G4 (Tonight + Stats + Glance), G5 (free-walk AI, golden-set entries),
  G6 (backlog goal, wishlist, loans, scan-to-add, MCP tools). Each phase's done-when is in the
  plan's table; G5 is explicitly cuttable if rules-based Tonight feels good without it.
- **GameGeek storefront file importer** — `DOCS/GAMEGEEK_STOREFRONT_IMPORTS.md`. Research
  proposal, not started. Steam API import and manual paste-a-list are being built tonight;
  next up is a file importer for Playnite JSON/CSV, Heroic's library cache JSON, and a GOG
  Galaxy 2.0 DB export, deduped against IGDB's `external_games`.

## 9. From the memory audit, 2026-09-24

Found while cross-checking session memory against `DOCS/*.md` — genuinely open items with no
existing doc home, not just history:

- **Container DNS / Tailscale landmine has no durable fix yet.** Docker's embedded resolver
  snapshots the host's DNS upstream at container start; it broke twice (2026-09-11 when
  Tailscale was removed, causing `/api/me` 503s across the fleet; 2026-09-17 when Watchtower
  itself held a stale Tailscale DNS entry and silently deployed nothing suite-wide,
  `updated=0 failed=0` looking healthy). Both times were fixed with a manual `docker restart`.
  The durable fix — `dns:` in every compose file, or `"dns"` in `/etc/docker/daemon.json`
  (the latter needs a whole-box daemon restart, Chef's call) — has not been applied. Not
  currently in `DOCS/RUNBOOK.md`'s landmine tables; worth adding there when the durable fix
  lands, or sooner so the next occurrence is faster to diagnose.
- **basegeek's nginx `client_max_body_size` fix has no doc home, and its own "tidier fix" is
  still undone.** `clintgeek.com_baseGeek.conf` had no `client_max_body_size`, so nginx's 1 MB
  default 413'd any AI call carrying an image before basegeek's own 8 MB guard was ever
  reached — surfaced as a useless "assistant isn't available" in FitnessGeek. Fixed 2026-09-17
  by adding `client_max_body_size 12m;`. Nginx config lives at `/mnt/Media/Docker/nginx` and is
  **not in this repo**, so nothing in git records even the applied fix. The tidier fix noted at
  the time — point container-to-container AI calls (`BASEGEEK_URL`) at basegeek's internal
  address so they skip the edge proxy entirely, instead of round-tripping through nginx — is
  still not done (it needs an env change and `docker compose up -d`, not a Watchtower restart).
- **18 FitnessGeek mobile-harness scenes, 144 a11y violations, still held.** Branch
  `fitnessgeek-review-fixes` (commit `e9a14922`), deliberately unmerged — merging turns CI red.
  Violations are real and deterministic across three builds in both themes: mostly text under
  the 12px floor (the Reports macro spine is 9px) plus four tap targets under 44px. Fixing
  means changing type sizes on the densest chart screens — **Chef's design call, not a
  mechanical edit.** (Separately, BP's `measured_at` backfill this branch also covers already
  shipped 2026-09-20 on `main`, `57fcfe9c` — only the harness scenes remain held.)
