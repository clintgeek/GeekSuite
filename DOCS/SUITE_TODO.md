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
