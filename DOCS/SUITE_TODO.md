# GeekSuite TODO

Suite-wide backlog. Grouped by theme; ordered roughly by impact and ease within each group.
Pull from here when planning the next pass; update as work lands or priorities shift.
`DEFERRED_WORK.md` is the append-only scratch-pad; this is the prioritized cut.
`TODO_ORDER.md` is the single cross-cutting work queue (UI/UX and everything else,
ordered by result per unit of work) — consult it first, then come here for detail.

---

## In flight

All 8 apps consolidated and hardened (April 2026). `storygeek-auth-hardening` branch open —
StoryGeek SSO alignment + Settings page fix + AuthProvider refactor. Pending merge.

---

## Landed 2026-08-30 (overnight hardening pass)

- Gateway ownership/IDOR enforcement across **every** basegeek module
  (bujogeek, fitnessgeek, storygeek, bookgeek, flockgeek — the last was
  anonymously writable — dashboard, notegeek), with 344 jest tests now green.
- storygeek REST `getStorySummary` ownership check.
- bujogeek: UTC date-key fixes, dead REST layer removed (−7.5k lines), sort
  comparator fixed, errors surfaced, optimistic toggles, RRULE-only
  recurrence (+migration), cancelled state, search + export, collections,
  habits, web-push reminders.
- bookgeek: device download basket + secret-word landing page, favicon.
- Suite-wide: MUI dedupe (two-copy theme split), SPA fallbacks 404 asset
  paths (SW cache poisoning), immutable caching for hashed assets, pnpm
  pinned in Dockerfiles, CI + GHCR release workflows (`DOCS/CICD.md` Tier 1
  + 3.3 publish; Watchtower box setup still manual).

---

## Landed 2026-09-02 (theme contrast sweep)

- Shared factory: per-mode semantic colors (success/warning/error/info), readable
  `text.disabled`, component overrides built from the app's merged palette.
- flockgeek + storygeek wired to the suite `geek_theme` cookie + preboot; bookgeek
  Tailwind dark variant keyed to `[data-theme="dark"]`; bujogeek palette now uses its
  warm tokens; notegeek accent lifted in dark; fitnessgeek pinned-light tiles removed;
  basegeek dark-mode legibility fixes. Full findings in the 2026-09-02 session.

---

## Landed 2026-09-02 (Tier 1 of TODO_ORDER)

- storygeek Destroy button red; `text.muted` token + 56-site sweep; MUI ^5 pin; shared
  ESLint 9 flat config across 14 packages (0 errors) + CI lint job; PWA manifest/theme-color
  per mode; login wordmarks on theme tokens; CORS dev/LAN origins gated to non-production;
  logout BroadcastChannel standardized (`geeksuite-auth`/`LOGOUT`, sender-guarded, basegeek
  listens); contrast regression test (210 assertions) in CI; basegeek added to build matrix;
  bujogeek tests in CI. Bonus: fitnessgeek weight chart was rendering empty (undeclared
  variable) — fixed.

---

## Landed 2026-09-02 (Tier 2 of TODO_ORDER, all but CSRF)

- Suite app switcher + theme toggle primitives in `packages/ui`, wired into all seven MUI apps.
- basegeek light mode on `createGeekSuiteTheme`; follows the suite theme cookie; Account-page
  Theme form defaults to `system`.
- Suite blue darkened to `#4B7AA3` (white labels now AA); contrast test has no known gaps.
- Admin role (`role` on the user model, `requireAdmin`), user list/create/delete gated,
  `scripts/setUserRole.js <username-or-email> admin`. Chef's account promoted.
- Auth-isolation suites for bujogeek, fitnessgeek, flockgeek, storygeek, notegeek backends, all
  in CI. Fixed on the way: storygeek characters/export IDOR, notegeek locked-note bcrypt crash,
  notegeek's backend jest harness (had been red and never collected).
- CI: backend test matrix, mongod binary pinned to the 22.04 build for the 24.04 runner.

---

## Landed 2026-09-02 (shell grammar, TODO_ORDER #15a)

- `packages/ui` navigation primitives finished and all seven MUI apps migrated to one shell grammar:
  permanent 220px sidebar on desktop / same sidebar as a temporary drawer on mobile, brand block
  in the sidebar, 60px top bar with route title and the theme → switcher → account cluster.
  **Revised the same evening:** sidebar footers removed everywhere — the header avatar menu is the
  single account entry (Settings, Sign out, Account where it exists); bookgeek's filters float
  under its shelves. bookgeek gets its first mobile layout; basegeek loses the
  collapsible rail; flockgeek and bujogeek gain Settings pages; duplicate logouts removed from
  bottom bars. 247 packages/ui tests.
- **Follow-ups:** visual pass of every app in both modes and at phone width; storygeek's
  three-column play surface lost 220px on desktop — consider a tighter breakpoint for its rails;
  content bodies in bookgeek/basegeek still render their own page headings under the new titled
  top bar (remove the duplicates); `GeekSidebar`/`GeekAppFrame` import react-router at module
  scope, so a router-less consumer would need a Router in the tree.

---

## Landed 2026-09-03 (Pass C/E batch)

- CSRF origin guard merged and enforcing on all seven backends (`CSRF_GUARD=off|report` levers).
- Sidebar footers removed suite-wide (header avatar menu is the account entry); sidebar content
  floats to the top; bookgeek filters under the shelves.
- Shell polish: storygeek rails collapse below `lg`; duplicate page headings removed in bookgeek
  and basegeek.
- basegeek: registry mutations + mongo/redis/postgres/influx routers admin-gated (21 tests);
  `configure()` wired so the Account page hydrates and theme preference persists.
- Feedback primitives (GeekEmptyState / GeekErrorState / GeekToastProvider / toneForMode /
  palette tooltips) with bujogeek as proof.
- bujogeek blocked-task state in the gateway (blockTask / unblockTask / blockedTasks, 24 tests);
  frontend Blocked section + `~blocked` quick-add token in progress.
- Housekeeping: `claude_theme_test` account deleted; fitnessgeek production CORS trimmed to its
  own origin (compose no longer overrides it from the dev .env); CSRF worktree removed.

---

## Next up — highest leverage

- ~~Timezone bug fixes (bujogeek, fitnessgeek, flockgeek)~~ — **Done 2026-08-30**
  across all three (streaks, daily summary, egg/group/mortality dates, quick-add
  date keys). Remaining timezone work is the shared-utility extraction below.

- ~~Admin gate on `GET /api/users`~~ — **Done 2026-09-02**, see Cross-cutting security.

- **Mongo connection topology (basegeek)** — INVESTIGATED 2026-08-30: not a
  duplicate pool; four connections deliberately serve four different databases.
  Deferred. Latent hazard noted: `getAppConnection('usergeek')` would spawn a
  second pool to the auth DB — don't call it. Consolidation shape (route
  `models/user.js` through the factory with a per-app URI override) is in the
  session report if ever pursued.

- ~~`appPreferences` Map vs Object drift~~ — **Fixed 2026-08-30:** all access
  through `src/lib/appPreferences.js` (Map + markModified), migration script,
  route + helper tests.

- ~~AI response cache TTL + LRU~~ / ~~`/api/health` dependency status~~ —
  **Done 2026-08-30:** cache is env-configurable with an eviction fix;
  `/api/health` now reports per-dependency readiness (incl. the auth DB) via
  non-blocking cached probes.

---

## App consolidation + hardening (per-app passes)

Consolidation = source-tree deploy via `build.sh`, `@geeksuite/auth`, `@geeksuite/api-client`.
Hardening = pino logging, request IDs, graceful shutdown, env-driven CORS, data-isolation audit.

| App | Consolidated | Hardened | Notes |
|-----|-------------|---------|-------|
| basegeek | ✅ | ✅ | Reference implementation |
| fitnessgeek | ✅ | ✅ | |
| bujogeek | ✅ | ✅ | |
| flockgeek | ✅ | ✅ | |
| storygeek | ✅ | ✅ | |
| notegeek | ✅ | ✅ | |
| bookgeek | ✅ | ✅ | Format-conversion feature also pending (see Features section below) |
| startgeek | ✅ | ✅ | Static Vite app — no backend, no auth. Already in build.sh + docker-compose. |

---

## Cross-cutting security

- ~~Unauthenticated app registry + privileged DB browsers (basegeek)~~ — **Done 2026-09-03** (mutations + browsers admin-gated; reads public, no unauthenticated caller exists). Was: found 2026-09-02 while
  adding the admin role. `src/routes/apps.js` (GET/POST/PUT/DELETE/seed) has no auth at all and the
  public portal reads it unauthenticated; `/api/mongo`, `/api/redis`, `/api/postgres`, `/api/influx`
  (dashgeek-facing browsers) are far more privileged than the user list that is now admin-gated.
  Decide: keep GET on the registry public but gate mutations with `requireAdmin`; gate the DB
  browsers with `requireAdmin` outright. Check dashgeek/portal callers first.

- **Admin gate on `GET /api/users`** — ✅ **Done 2026-09-02** (role field, `requireAdmin`, list/create/
  delete gated, `scripts/setUserRole.js`). Promote with
  `docker exec basegeek node scripts/setUserRole.js <username> admin` on the box.

- **CSRF protection** — 🟡 **Pending review** on branch `csrf-protection` (not merged, not
  deployed). Shipped there: `csrfGuard()` in `packages/user/src/server/csrfGuard.js`, mounted
  ahead of `cors()` in all seven backends including basegeek's `/graphql`. Origin (falling back
  to `Referer`) must be on the app's own CORS allow-list for any cookie-authenticated
  POST/PUT/PATCH/DELETE, else 403 `csrf_origin_rejected`. `CSRF_GUARD=off|report` is the
  restart-only escape hatch. Cookie attributes untouched — both auth cookies were already
  `SameSite=Lax`, and `Strict` was rejected because it breaks the SSO navigation flow.
  Design, exemptions (none) and mount points: [`DOCS/SSO_OVERVIEW.md#csrf`](SSO_OVERVIEW.md#csrf).

  **Still open after that branch merges:** an origin allow-list cannot stop an XSS'd *sibling*
  subdomain from mutating **basegeek**, whose list must contain every app origin because every
  frontend calls its GraphQL API (bookgeek is similarly wide — its rule is any
  `*.clintgeek.com` host). Closing that needs a per-app double-submit token in
  `@geeksuite/auth` + every frontend. Third-party CSRF is closed everywhere, and
  sibling-subdomain CSRF is closed against the six consumer backends. (`DEFERRED_WORK.md`)

- **HttpOnly cookies + stop persisting tokens in localStorage** — ✅ resolved across all apps
  (April 2026). Dead localStorage token reads removed from all frontends; StoryGeek's Zustand
  auth store replaced with `AuthProvider`/`useAuth`. Remaining: verify no app reads
  `document.cookie` directly for `geek_token`. (`DEFERRED_WORK.md`, `DOCS/SSO_OVERVIEW.md`)

- ~~BroadcastChannel inconsistencies~~ — **Done 2026-09-02.** Was: `bookgeek` uses `geek-auth`/`logout`; several apps use
  lowercase `logout`; basegeek uses `postMessage`. Cross-tab logout is fragmented.
  Standardize to channel `geeksuite-auth` / type `LOGOUT` everywhere.
  (See `DOCS/SSO_OVERVIEW.md` BroadcastChannel table.)

- ~~Hardcoded CORS fallback origins~~ — **Done 2026-09-02** (dev/LAN gated to non-prod; fitnessgeek's prod env value still lists localhost — trim). Was: basegeek and fitnessgeek support `CORS_ORIGINS` env but
  fallback arrays include dev/LAN IPs. Either enforce env in production (throw if unset) or strip
  the defaults. (`DEFERRED_WORK.md`)

---

## UI / UX

Grounded in the 2026-09-02 contrast sweep. Complements `DOCS/THE_UI_UNIFICATION_PLAN.md`
(type scale, shell dimensions, global search, quick capture, focus mode) — those items are
not repeated here.

### Highest leverage, cheap

- **basegeek light mode + design-language alignment** — basegeek is the only MUI app not
  composed from `createGeekSuiteTheme`. Rebuild "Mission Control" as
  `createGeekSuiteTheme({ mode, accent: amber, overrides })` with a real light palette,
  honor the shared `ThemeProvider` + preboot, and replace the hardcoded dark literals on
  Portal/Login/Register pages, Drawer/AppBar/Dialog/Tooltip overrides, and
  `typography.caption.color`. Keep amber as accent only. Also fix the Account-page Theme
  form defaulting to `'dark'` (overwrites a user's `'system'` on save).
  `apps/basegeek/packages/ui/src/theme.js`, `pages/AccountPage.jsx:149`

- **Suite switcher in the GeekShell top bar** — nine-dot menu listing all eight apps. SSO
  already makes them one product; this is the missing "it's a suite" affordance.
  `packages/ui/src/navigation/`

- **`text.muted` token** — add a third text tier (≥3:1 on each mode's paper) to the shared
  factory so apps stop using `text.disabled` for timestamps, counts, and empty states.
  Then sweep the misuses (notegeek, bujogeek, flockgeek, basegeek).

- **Contrast regression test** — vitest in `packages/ui` that builds every app's light and
  dark theme and asserts text-on-surface pairs (primary/secondary/muted on
  default/paper; primary.main on paper; contrastText on primary) meet 4.5:1 (3:1 for
  large/UI). Would have caught most of the 2026-09-02 findings pre-ship.

- **Theme toggle placement** — one spot in the shell for every app. Today: storygeek top
  bar, notegeek Settings, others absent.

- **storygeek Destroy button** — `MuiButton.styleOverrides.contained` swallows
  `color="error"`, so the destructive confirm renders as the primary gold/burgundy CTA.
  Scope the override to `containedPrimary`. `apps/storygeek/frontend/src/theme/theme.js`

### Shell grammar audit (2026-09-02) — feeds TODO_ORDER #15a

Root cause: `GeekSidebar` and `GeekTopBar` exist in `packages/ui/src/navigation` with the right
slots but have **zero consumers**; every app hand-rolls both. Per-app structural deviations
(identity choices — fonts, colors, dark chrome, density — are fine and not listed):

- **basegeek** — no desktop top bar (theme/switcher/account have nowhere to live); sidebar
  collapses to a 68px rail (decided: remove); Settings + Account are nav-list rows, not footer;
  bypasses GeekShell/GeekAppFrame and hardcodes 220/68/60. Mobile pattern already conforms.
- **bujogeek** — top bar left is empty (no page title); avatar is inert and hidden on mobile;
  no Settings entry (no route); user chip sits *below* Sign out; bottom tab bar's "More" sheet
  duplicates Logout (decided: remove the duplicate, keep the bar).
- **notegeek** — desktop sidebar is hideable via the hamburger, not permanent; **no user chip
  anywhere**; no account avatar/menu; brand in the top bar, not the sidebar; no page title;
  mixed `sm`/`md` breakpoints; bottom nav duplicates Home/Search/New (keep the bar).
- **fitnessgeek** — **no mobile drawer**: nav is an avatar-anchored Menu, so Settings/Logout
  move on mobile; desktop avatar deep-links to /settings instead of a menu; top bar left empty;
  bottom nav exposes /profile which no other surface has; `navSections` declared three times;
  hardcoded `pb: 88px`. Keep the bar.
- **flockgeek** — no desktop top bar; theme/switcher live in the sidebar; **no user chip, no
  Settings, no account menu anywhere**; sign-out is a bare icon; mobile drawer is 280px vs 220.
- **storygeek** — sidebar is **never permanent** (hamburger + drawer on desktop too); no brand
  block in the sidebar; no footer (user/sign-out only in a top-bar avatar menu); Settings is a
  mid-list nav item; `isMobile` computed and unused.
- **bookgeek** — **no mobile layout at all**; header rendered outside GeekShell so the sidebar
  starts below it; sidebar is a filter panel with no brand, no nav, no footer; user/Settings/
  Logout only in the avatar menu; search lives in the content body; sidebar `height: 100vh`
  overflows its 60px-offset container.

### Medium effort, clear payoff

- **Shared mobile bottom-nav primitive** — bujogeek (tabs + More sheet), notegeek and
  fitnessgeek (bottom navs), flockgeek (sidebar only), storygeek/bookgeek (drawers) all
  differ. One GeekShell primitive, app supplies items.

- **Shared EmptyState / ErrorState / toast primitives** — every app hand-rolls these and
  most got them wrong in one mode. Promote bujogeek's `EmptyState` as the seed.

- **PWA splash + browser chrome per mode** — manifests carry wrong colors (flockgeek
  `#F5F5F5`/`#4A90E2`, bujogeek `#ffffff`, notegeek `#ffffff`, fitnessgeek light) and
  `theme-color` metas are single-valued. Use `media="(prefers-color-scheme: …)"` pairs and
  manifest colors matching each app's default mode.

- **bookgeek off the runtime Tailwind CDN** — JIT at runtime means utilities land a frame
  late, it's a third-party ~300 KB script, and it fails offline in the PWA. Build-time
  Tailwind or continue the incremental MUI migration. `apps/bookgeek/web/index.html`

- **startgeek joins the suite** — wire to `geek_theme` (needs `@geeksuite/user`, which
  means bringing it into the pnpm workspace build) and give the wallpaper a stronger,
  luminance-adaptive scrim; dock labels at `text-white/40` and weather at `/50` vanish on
  bright photos.

### Worth tracking

- **Shared `toneForMode(color, theme)` helper** — bujogeek aging colors, fitnessgeek BP
  statuses, storygeek genres/dice were tuned for light paper; 2026-09-02 added ad hoc
  lighten/darken branches in four places. Consolidate.

- **Auth-hydration splash** — several apps show an unthemed/default-grey box while
  checking the cookie. Shared splash in `packages/ui` using the app theme.

- **Reduced motion** — framer-motion transitions and bujogeek's grain overlay ignore
  `prefers-reduced-motion`.

- **Native date inputs** — fitnessgeek and flockgeek mix native `<input type="date">` with
  MUI controls; `color-scheme` now fixes the glyph but pickers should be consistent.

- **flockgeek first-visit flicker** — preboot has no per-app default, so a cookie-less
  visitor on a light OS paints light then flips to flockgeek's dark default on mount.
  Either let the preboot accept a default or accept the one-time flicker.

- **Login wordmark brand colors fail in one mode** — fitnessgeek `#2563eb` (2.4:1 on the dark
  card), bookgeek `logoSuffixColor="#1d4ed8"` (2.0:1 dark), storygeek `#7c4dff`/`#ff6d00`
  (off-identity purple/orange; orange 2.7:1 light). Pass theme tokens or mode-paired values
  to `LoginSplash`. storygeek also never loads the "Plus Jakarta Sans" LoginSplash requests.

- **bookgeek primary button contrast** — sky `#0ea5e9` with white `contrastText` is 2.8:1 in
  both modes ("Add book", "Create"). Darken the accent or use a dark contrastText.
  `apps/bookgeek/web/src/theme/theme.js`

- **bujogeek TemplatePreview markdown** — `ReactMarkdown` output is unstyled: UA-blue links on
  dark paper (~2.3:1), no code-block background, and the panel uses `background.paper`
  inside a Paper. Style via the palette like notegeek's `NoteViewer` markdown block.
  `apps/bujogeek/frontend/src/components/templates/TemplatePreview.jsx`

- **notegeek mind-map off-palette colors** — edge stroke `#2196f3`, MiniMap `#5B50A8`/`#3D8493`,
  root-node fill `#e3f2fd`, and `TAG_COLORS` duplicate light-mode `noteTypes` without the dark
  lift. Route through the palette. `MindMapEditor.jsx`, `MindMapNode.jsx`, `Sidebar.jsx`

- **fitnessgeek `MuiDrawer` landmine** — theme pins Drawer paper to `#0C0A09` in both modes.
  Inert today (nothing renders a MUI Drawer) but the first one to do so gets palette text on
  near-black in light mode. Make it mode-aware or remove. `theme/theme.jsx`

- **fitnessgeek BarcodeScanner** — only surface in the suite keyed to
  `@media (prefers-color-scheme: dark)` instead of `data-theme`. Reticle only; low impact.

- **Themed tooltips** — the shared factory leaves MUI's default grey-700 tooltip; legible but
  off-identity in every app. Derive from the palette in `createGeekSuiteTheme`.

- **Offline pages per mode** — flockgeek `offline.html` is light with a `#4A90E2` button
  (not its amber); bookgeek's is dark-only. Give both a `prefers-color-scheme` pair and
  the app's accent.

---

## Shared libraries / refactors

- ~~basegeek never calls `configure()` from `@geeksuite/user`~~ — **Done 2026-09-03.** Was: found 2026-09-02 during the light-mode
  rebuild. `bootstrap()` throws into AccountPage's swallowed catch, so the shared user store never
  loads: the Theme selector works live via the `geek_theme` cookie but the choice is not persisted
  to the DB from basegeek (other apps persist it). Wire `configure(apiInstance)` in basegeek's
  bootstrap like bookgeek/notegeek do (`bootstrapUser.js`). `apps/basegeek/packages/ui/src`

- ~~MUI major-version drift~~ — **Done 2026-09-02.** Was: basegeek, bujogeek, and notegeek declare `@mui/material ^7`
  but the lockfile resolves 5.18.0 (and basegeek's icons resolve to 7.3.8). Harmless today
  because everything is v5, but a fresh `pnpm install` without the lockfile would split the
  theme context (see the dedupe notes in `vite.config.js` comments). Pin all apps and
  `packages/ui` to one declared major.

- **`cryptoVault` → `@geeksuite/crypto-vault`** — currently internal to basegeek at
  `apps/basegeek/packages/api/src/lib/cryptoVault.js`. Promote to a shared package so fitnessgeek
  (and future apps) can encrypt sensitive fields (Garmin password) before writing to MongoDB.
  Step 1: promote + update basegeek to consume from there. Step 2: wire fitnessgeek encryption +
  backfill migration script. (`DEFERRED_WORK.md`)

- **Shared date utilities** — the timezone bug analysis identified a `toUtcMidnight()` /
  `localDateString()` / `displayCalendarDate()` pattern needed across bujogeek, fitnessgeek, and
  flockgeek. Promote to `packages/utils/src/dates.js` and import from there.
  (Full spec in `DOCS/ARCHIVE/THE_TIME_ISSUE.md`)

- **Shared logger** — basegeek has a pino logger module; fitnessgeek and bujogeek got the same
  pattern in their hardening passes. Consider extracting to `@geeksuite/logger` to ensure
  consistent JSON structure + pretty-dev behavior across all apps.

- **`UserSettings` schema consolidation (fitnessgeek)** — schema lives in both
  `apps/fitnessgeek/backend/src/models/UserSettings.js` and
  `apps/basegeek/packages/api/src/graphql/fitnessgeek/models/UserSettings.js` and has drifted.
  Consolidate to one source of truth. (See `DOCS/CONTEXT.md`)

---

## Features not yet implemented

- **notegeek `getTagHierarchy` 500** — found 2026-09-02 by the repaired backend suite. `GET /api/notes/tags`
  sets `children: null` for a shallow tag (`work`) and then indexes into it when a deeper same-prefix tag
  (`work/project1`) arrives later; Mongo's return order is not guaranteed, so it intermittently 500s.
  Build the tree with `children: {}` always, or sort tags by depth first. Test is `it.skip` in
  `apps/notegeek/backend/__tests__/controllers/notes.test.js` — un-skip when fixed.

- ~~bookgeek format conversion~~ — **Done (Aug 2026):** on-demand `ebook-convert` to
  EPUB/AZW3/MOBI with cover embedding, shared `ensureFormat()`, used by both normal
  downloads and the device basket.

- **bujogeek subtasks UI** — backend model has `parentTask`/`subtasks` fields; no frontend UI.

- **storygeek markdown rendering** — AI narration and Bookify output render as plain
  `pre-wrap` text, so `**bold**` shows literal asterisks. `react-markdown`,
  `react-syntax-highlighter`, and `@mui/x-data-grid` are declared but never imported —
  either wire up markdown (styled from the palette) or drop the deps.

- ~~bujogeek quick-add hyphenated-date bug~~ — **Fixed 2026-08-30:** date
  parsing now runs before signifier detection in `utils/parseTaskInput.js`, so
  `/2026-03-15` / `/03-15-2026` dates parse correctly; regression tests added.

- ~~Extract bujogeek `compareTasks`~~ — **Done 2026-08-30:** moved from
  `context/TaskContext.jsx` (which pulls Apollo + MUI at module scope) to a pure
  `utils/taskSort.js` with 7 unit tests locking in the previously-NaN-broken
  sort logic. TaskContext re-exports it, so importers are unchanged.

- ~~bujogeek recurring tasks UI~~ — **Done (2026-08-30):** RRULE series with editScope
  (this/all/future instances), editor + quick-add syntax, virtual expansion.

---

## Tests + observability

- ~~ESLint doesn't run in most frontends~~ — **Done 2026-09-02** (`@geeksuite/eslint-config`, `pnpm -r lint` in CI). Was: bujogeek, storygeek, fitnessgeek, basegeek
  either lack a flat config (ESLint 9) or carry a legacy `.eslintrc`, so `pnpm lint` exits
  before linting. CI's lint job is effectively a no-op for them. Add a shared
  `eslint.config.js` in `packages/` and extend it per app.

- ~~Per-app auth test suites~~ — **Done 2026-09-02:** bujogeek 29, fitnessgeek 37, flockgeek 49, storygeek 35 jest + 65 node:test, notegeek 89 (its suite had been red and uncollected). All in CI. Found and fixed: storygeek characters/export IDOR, notegeek bcrypt import. Was: basegeek has 33 auth tests. bujogeek, fitnessgeek, flockgeek,
  storygeek, and notegeek have zero. Priority for each app after its hardening pass: auth-isolation
  specs (login flow, `/api/users/me`, data scoping). (`DEFERRED_WORK.md`)

- **Circuit breakers on fitnessgeek external APIs** — USDA, Nutritionix, OpenFoodFacts, Garmin.
  30s timeout per call but no circuit breaker. Use `opossum` or Redis-backed state. (`DEFERRED_WORK.md`)

- **Input validation (Joi/Zod)** — most REST routes do ad-hoc `if (!field)` checks. Flag:
  bujogeek (client-controllable timestamps, unbounded strings), fitnessgeek (`settingsRoutes.js`).
  Route-by-route, not urgent — own slow-burn pass. (`DEFERRED_WORK.md`)

---

## Nice-to-haves / backlog

- ~~Leftover test account in production~~ — **Deleted 2026-09-02.** Was: `claude_theme_test` / `claude-theme-test@clintgeek.com`
  exists in `userGeek` (from an earlier theme-testing session). Delete once confirmed unused:
  needs the admin `DELETE /api/users/:id` or a one-off script. Found 2026-09-02.

- **Dead frontend components (contrast-sweep findings)** — unrouted files that still carry
  hardcoded light styling and will bite if re-mounted: fitnessgeek `Layout.jsx`, `Drawer.jsx`,
  `FoodSearch.jsx` (deprecated), `NaturalLanguageInput.jsx` + subtree, `DashboardOrderSettings.jsx`,
  `AITestComponent.jsx`, `WeightLayout.jsx`, `WeightProgressRing.jsx`, `MacroBar.jsx`;
  bujogeek `navigation/BottomNav.jsx` + the `MuiBottomNavigation*` theme overrides;
  notegeek `pages/LoginPage.jsx`, `pages/RegisterPage.jsx`; basegeek `pages/Databases.jsx`;
  startgeek `ResumeSection.jsx`, `WorldClocks.jsx`. Delete or route.

- **`fitnessgeek docker-compose.dev.yml`** — references service names that no longer exist in the
  new single-service compose. Rewrite for hot-reload or delete if not in use. (`DEFERRED_WORK.md`)

- **bujogeek Apollo cache invalidation on mutations** — currently refreshing the view gives latest
  data; mutations don't invalidate the cache. Proper `refetchQueries` or cache update on write.
  `apps/bujogeek/DOCS/CONTEXT.md`

- **bujogeek duplicate model files** — `userModel.js`/`User.js`, `templateModel.js`/`Template.js`.
  Only PascalCase versions are canonical; delete the legacy copies.

- **basegeek stale AI model defaults** — hardcoded `gemini-1.5-flash-latest` and similar in
  `aiService.js` may be deprecated. Polish pass to remove or update defaults.
  `apps/basegeek/packages/api/src/services/aiService.js`

- **notegeek `formatRelativeTime` deduplication** — same function copied in three files.
  Extract to `frontend/src/utils/dateUtils.js`. (Low priority — NoteGeek needs full consolidation pass first.)

- **geekSuite/Bun gateway BroadcastChannel logout** — currently uses direct `fetch` without
  BroadcastChannel. Add `geeksuite-auth`/`LOGOUT` broadcast on logout.
  `src/server/index.js` (geekSuite gateway)
