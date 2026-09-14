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
- **Mobile Harness CI Ratchet**: Maintaining 0 findings across 139 scenes in `.github/workflows/mobile-harness.yml`.

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

- **HttpOnly Cookies & Token Verification**
  - Verify no client frontend attempts to read `document.cookie` directly for `geek_token` or `geek_refresh_token`.
  - Confirm all auth hydration flows exclusively through `/api/users/me` or `@geeksuite/user`.

---

## 3. UI / UX & Design Language

### Highest Leverage / Follow-ups
- **FitnessGeek Food Search Rebuild** (approved 2026-09-14, full scope): search is submit-only, ranks by API arrival order for any query under four words, bypasses its own Redis cache and its own Mongo text index, and hides the input four interactions deep behind a CTA page and a modal. Measured 3.5–5.4s on multi-word queries in production. Worst of all, the AI classifier shreds one dish into its ingredients — `4 chocolate chip pancakes homemade` classifies as `chocolate chip` ×4 + `pancakes` + `pancake mix` (reproduced against the live container), which is why that query returns chocolate chips and no pancakes. Six-phase plan with named-query acceptance tests: [`apps/fitnessgeek/DOCS/THE_FOOD_SEARCH_PLAN.md`](../apps/fitnessgeek/DOCS/THE_FOOD_SEARCH_PLAN.md). Four Phase-4 UI decisions remain open in §5.
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
- **FitnessGeek Secrets Parity**: Confirm `KEY_VAULT_SECRET` is set in fitnessgeek's `.env.production` matching basegeek's secret, and verify Garmin password backfill script run.
- **GraphQL Gateway Consolidation Follow-ups**:
  - Migrate remaining FitnessGeek REST reads (food search / barcode / favorites / recent in `foodService.js`) to gateway queries.
  - Retire FlockGeek caller-less mounted REST layer in `routes/api.js` (Chef item Q22).
  - Delete unused StoryGeek gateway schema in `apps/basegeek/packages/api/src/graphql/storygeek` (Chef item Q38).
- **Mongo Connection Topology (basegeek)**:
  - Investigated: four connection pools serve four distinct databases (`userGeek`, `basegeek`, `aiGeek`, app data). Deferred unless connection limits become a bottleneck. Avoid calling `getAppConnection('usergeek')` which would spawn a redundant pool.

---

## 5. Features & Fixes

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

---

## 7. Nice-to-Haves & Backlog Cleanups

- **Dead Frontend Components Sweep**:
  - Remove orphaned component files: bujogeek `BottomNav.jsx`, notegeek `LoginPage.jsx`/`RegisterPage.jsx`, startgeek `ResumeSection.jsx`/`WorldClocks.jsx`, fitnessgeek `WeightProgressRing.jsx`.
- **BaseGeek Stale AI Model Defaults**:
  - Refresh or deprecate outdated fallback strings like `gemini-1.5-flash-latest` in `aiService.js`.
- **NoteGeek `formatRelativeTime` Deduplication**:
  - Extract duplicated date formatting functions across three files to `frontend/src/utils/dateUtils.js`.
- **Gateway BroadcastChannel Logout**:
  - Add `geeksuite-auth`/`LOGOUT` broadcast message to any remaining non-standard logout routes.
