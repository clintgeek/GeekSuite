# GeekSuite — Landed 2026 Logs

Historical record of completed and landed work streams across GeekSuite in 2026.
Extracted from `DOCS/SUITE_TODO.md` to keep the active backlog clean and actionable.

---

## Landed 2026-08-30 (Overnight Hardening Pass)

- Gateway ownership/IDOR enforcement across **every** basegeek module (bujogeek, fitnessgeek, storygeek, bookgeek, flockgeek — the last was anonymously writable — dashboard, notegeek), with 344 jest tests green.
- storygeek REST `getStorySummary` ownership check.
- bujogeek: UTC date-key fixes, dead REST layer removed (−7.5k lines), sort comparator fixed, errors surfaced, optimistic toggles, RRULE-only recurrence (+migration), cancelled state, search + export, collections, habits, web-push reminders.
- bookgeek: device download basket + secret-word landing page, favicon.
- Suite-wide: MUI dedupe (two-copy theme split), SPA fallbacks 404 asset paths (SW cache poisoning), immutable caching for hashed assets, pnpm pinned in Dockerfiles, CI + GHCR release workflows (`DOCS/CICD.md` Tier 1 + 3.3 publish).
- Timezone bug fixes (bujogeek, fitnessgeek, flockgeek) across streaks, daily summary, egg/group/mortality dates, quick-add date keys.
- `appPreferences` Map vs Object drift fixed: all access routed through `src/lib/appPreferences.js` (Map + markModified), migration script, route + helper tests.
- AI response cache TTL + LRU and `/api/health` dependency status: cache is env-configurable with an eviction fix; `/api/health` reports per-dependency readiness (including auth DB) via non-blocking cached probes.
- bujogeek quick-add hyphenated-date bug fixed in `utils/parseTaskInput.js`.
- bujogeek `compareTasks` extracted to pure `utils/taskSort.js` with unit tests.
- bujogeek recurring tasks UI: RRULE series with editScope, editor + quick-add syntax, virtual expansion.

---

## Landed 2026-09-02 (Theme Contrast Sweep)

- Shared factory: per-mode semantic colors (success/warning/error/info), readable `text.disabled`, component overrides built from the app's merged palette.
- flockgeek + storygeek wired to the suite `geek_theme` cookie + preboot; bookgeek Tailwind dark variant keyed to `[data-theme="dark"]`; bujogeek palette uses its warm tokens; notegeek accent lifted in dark; fitnessgeek pinned-light tiles removed; basegeek dark-mode legibility fixes.
- storygeek Destroy button red (`containedPrimary` scoped).
- `text.muted` token + 56-site sweep.
- MUI `^5` pinned suite-wide.
- Shared ESLint 9 flat config across 14 packages (0 errors) + CI lint job.
- PWA manifest/theme-color per mode.
- Login wordmarks on theme tokens.
- CORS dev/LAN origins gated to non-production.
- Logout BroadcastChannel standardized (`geeksuite-auth`/`LOGOUT`, sender-guarded, basegeek listens).
- Contrast regression test (210 assertions) in CI.
- basegeek added to build matrix; bujogeek tests added to CI.
- Fitnessgeek weight chart rendering bug fixed.
- Suite app switcher + theme toggle primitives in `packages/ui`, wired into all seven MUI apps.
- basegeek light mode built on `createGeekSuiteTheme`, follows suite theme cookie; Account-page Theme form defaults to `system`.
- Suite blue darkened to `#4B7AA3` (white labels now AA compliant).
- Admin role (`role` on the user model, `requireAdmin`), user list/create/delete gated, `scripts/setUserRole.js`.
- Auth-isolation suites for bujogeek, fitnessgeek, flockgeek, storygeek, notegeek backends in CI. Fixed storygeek characters/export IDOR and notegeek locked-note bcrypt crash.
- CI mongod binary pinned to 22.04 build for 24.04 runner.
- Shell grammar pass (`TODO_ORDER` #15a): `packages/ui` navigation primitives finished and all seven MUI apps migrated to permanent 220px desktop sidebar / temporary mobile drawer, brand block in sidebar, 60px top bar with route title and theme/switcher/account cluster.
- Leftover test account `claude_theme_test` deleted from production.

---

## Landed 2026-09-03 (Pass C/E Batch)

- CSRF origin guard merged and enforcing on all seven backends (`CSRF_GUARD=off|report` levers).
- Sidebar footers removed suite-wide (header avatar menu is the account entry); sidebar content floats to the top; bookgeek filters under the shelves.
- Shell polish: storygeek rails collapse below `lg`; duplicate page headings removed in bookgeek and basegeek.
- basegeek: registry mutations + mongo/redis/postgres/influx routers admin-gated (21 tests); `configure()` wired so Account page hydrates and theme preference persists.
- Feedback primitives (`GeekEmptyState` / `GeekErrorState` / `GeekToastProvider` / `toneForMode` / palette tooltips) with bujogeek as proof.
- bujogeek blocked-task state in gateway (`blockTask` / `unblockTask` / `blockedTasks`, 24 tests).
- Housekeeping: fitnessgeek production CORS trimmed to own origin; CSRF worktree removed.

---

## Landed 2026-09-05 (Night 2 Burn & Consolidations)

### Shared Packages & Infrastructure
- **`@geeksuite/crypto-vault`**: Extracted from basegeek to `packages/crypto-vault` (CommonJS + ESM interop). Byte-for-byte compatible AES-256-GCM cipher with `KEY_VAULT_SECRET`. Fitnessgeek Garmin password encrypted at rest via `packages/schemas/fitnessgeek/userSettings.js`. Backfilled on box.
- **`@geeksuite/utils`**: Extracted shared calendar date (`toUtcMidnight`, `utcMidnightToday`, `utcDayRange`, `utcDateString`, `displayCalendarDate`) and local instant (`localDateString`, `startOfLocalDay`) helpers. Collapsed hand-rolled copies across bujogeek, flockgeek, fitnessgeek.
- **`@geeksuite/logger`**: Extracted shared Pino logger (`createLogger`, `createHttpLogger`, `installShutdownHooks`) with automatic credential redaction (auth headers, cookies, passwords, api keys) across all seven backends.
- **`@geeksuite/schemas`**: Consolidated all 11 FitnessGeek Mongoose model pairs (`UserSettings`, `Weight`, `BloodPressure`, `Medication`, `LoginStreak`, `WeightGoals`, `NutritionGoals`, `Meal`, `FoodItem`, `FoodLog`, `DailySummary`). Parity tripwire suites ensure schemas remain in sync. Deleted orphaned gateway models (`MedicationLog`, `AIFoodPromptCache`).
- **FitnessGeek Node 20 & ESM Migration**: Upgraded backend to Node 20 + ESM (`type: module`).

### GraphQL Gateway Consolidations
1. **Dead code purge**: Deleted unmounted bookgeek GraphQL server and `@apollo/subgraph` dependency; deleted notegeek legacy REST routes (`notes.js`, `tags.js`, `search.js`) and duplicate `Note` model; deleted 4 orphaned flockgeek models (`BirdNote`, `BirdTrait`, `Event`, `LineageCache`).
2. **FitnessGeek Food-Log writes**: Pointed `foodLogs` writes at gateway GraphQL mutations (`addFoodLog`, `updateFoodLog`, `deleteFoodLog`, `logMeal`). Deleted corresponding backend REST routes in `logRoutes.js` and `mealRoutes.js`.
3. **BookGeek profile & filters**: Moved profile, library filters, shelves, and AI status to gateway (`bookProfile`, `libraryFilters`, `bookAiStatus`, `saveBookProfile`, etc.). Deleted `/api/profile/*` routes and removed hardcoded `localhost:1800` origin.
4. **StoryGeek decision analysis**: Documented in `DOCS/ARCHIVE/STORYGEEK_GATEWAY_DECISION.md` (recommending deletion of caller-less gateway module).

### UI / UX & Mobile Hardening
- **Mobile Harness**: Built `tools/mobile-harness` running Playwright phone tests against all 8 apps; achieved 0 findings across 139 scenes in dark/light modes; enforced in CI.
- **Shared Mobile Primitives**: `GeekSheet`, `GeekDialog`, `GeekFab`, `useGeekPrimaryAction` shipped across apps.
- **App-specific Mobile Passes**:
  - BookGeek: App.jsx split into views, library shelf strip, filter sheet, detail sheet, full-screen reader, runtime Tailwind CDN removed.
  - FitnessGeek: Food-logging FAB, full-screen dialogs on Studio Slate skin, 44px tap targets.
  - BujoGeek: Quick-add FAB + sheet, row action sheet, BujoDialog skin, agenda view.
  - FlockGeek: Bottom tab bar, harvest FAB + sheet, responsive tables as cards.
  - StoryGeek: Rails as sheets, flex play surface, Codex dialogs.
  - BaseGeek: Console dialogs, responsive tables, scrollable tabs.
  - StartGeek: PWA manifest, service worker, offline page, safe area padding, labelled dock.
- **Component Polish**:
  - flockgeek first-visit theme flicker eliminated.
  - bujogeek `TemplatePreview` styled with theme tokens via `remark-gfm`/`remark-breaks`.
  - notegeek mind-map palette unified with theme tokens (`noteTypeColor`).
  - fitnessgeek `BarcodeScanner` dark styling keyed to `data-theme` attribute instead of media query.
  - fitnessgeek native date inputs consolidated to `components/primitives/DateField.jsx`.

### Robustness & Security (Going-Over)
- Circuit breakers: Added `opossum` breakers around USDA, OpenFoodFacts, CalorieNinjas, and Garmin in FitnessGeek with stats exposed at `GET /api/health/breakers`.
- Input validation (Zod): Added validation schemas to bujogeek gateway mutations, fitnessgeek settings/weight/BP routes, storygeek REST backend, and bookgeek file/cover/merge operations.
- Docker & Compose hardening: Added bounded JSON log rotation (`10m`, 3 files) across all compose files; added `wget --spider` healthchecks to basegeek, fitnessgeek, flockgeek; fixed storygeek compose missing `env_file`.
- Tooling: Created `tools/kill-orphans.mjs` to clean up runaway agent dev processes; created `tools/syntax-check.mjs` for AST parse validation in CI.
