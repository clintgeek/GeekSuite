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
| startgeek | ✅ | ✅ | v2: cookie-SSO day-at-a-glance via basegeek GraphQL. v1 archived. See DOCS/DASHGEEK_PLAN.md. |

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

- **CSRF protection** — ✅ merged to main. `csrfGuard()` (`packages/user/src/server/csrfGuard.js`),
  the Origin allow-list guard, is mounted ahead of `cors()` in all seven backends including
  basegeek's `/graphql`; `CSRF_GUARD=off|report` is the restart-only escape hatch. Design,
  exemptions (none) and mount points: [`DOCS/SSO_OVERVIEW.md#csrf`](SSO_OVERVIEW.md#csrf).

  basegeek additionally issues a double-submit `geek_csrf` cookie (commit `a3c4031`) to close the
  one gap the Origin guard can't — a sibling `*.clintgeek.com` subdomain mutating **basegeek**
  itself, whose allow-list must contain every app origin. Full contract, the `CSRF_TOKEN`
  rollout lever, and the client list: [`DOCS/CONTEXT.md`](CONTEXT.md) → "CSRF: the double-submit
  token."

  **Enforce checklist** — flip `CSRF_TOKEN=enforce` on basegeek and restart only once every box
  below is checked:
  - [x] `@geeksuite/auth` sends the header (`logout()`, `doTokenRefresh()`,
    `setupAxiosInterceptors()`)
  - [x] basegeek's own `packages/ui/src/api.js` interceptor sends it
  - [x] `packages/api-client`'s shared Apollo `authLink` sends it (basegeek-ui, bujogeek,
    notegeek, storygeek, bookgeek, fitnessgeek, flockgeek)
  - [x] `apps/startgeek/src/lib/graphql.js` and `apps/startgeek/src/lib/basegeek.js` send it
  - [ ] a full day with zero `CSRF token check (report-only)` warnings in basegeek's logs

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
  means bringing it into the pnpm workspace build). The luminance-adaptive scrim shipped
  2026-09-05 (see `apps/startgeek/CONTEXT.md`); dock labels at `text-white/40` and weather
  at `/50` still vanish on bright photos and are unrelated to the scrim — separate follow-up
  if it recurs after the scrim.

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

- **`cryptoVault` → `@geeksuite/crypto-vault`** — **Step 1 done 2026-09-05.** Was internal to
  basegeek at `apps/basegeek/packages/api/src/lib/cryptoVault.js`; now `packages/crypto-vault`
  (plain CommonJS, same shape as `@geeksuite/logger`/`@geeksuite/schemas` — `require()`-able from
  a CJS backend, `import`-able from ESM). Same env var (`KEY_VAULT_SECRET`), same AES-256-GCM
  cipher, IV/tag layout and `v1:{iv}:{tag}:{ciphertext}` packed format — byte-for-byte compatible,
  proven by a vitest fixture decrypting a ciphertext captured from the pre-promotion module.
  basegeek's api now consumes it via `@geeksuite/crypto-vault` (`OAuthConnection.js`,
  `AIConfig.js`, `aiRoutes.js`, `graphql/basegeek/resolvers.js`); the old `lib/cryptoVault.js` and
  its standalone test were deleted, coverage moved to `packages/crypto-vault/src/__tests__`.
  basegeek's own suite stayed green (42 suites / 800 passed / 1 skipped). New CI job
  `test-crypto-vault` mirrors `test-utils`. **Step 2 done 2026-09-05** — fitnessgeek's Garmin
  password is encrypted at rest. The encryption lives in
  `packages/schemas/fitnessgeek/userSettings.js` (`createUserSettingsSchema`), not in a
  fitnessgeek route or service: `garmin.password` has **two writers and two readers across two
  processes** (fitnessgeek's `settingsRoutes.js` + `garminConnectService.js`, basegeek's
  `graphql/fitnessgeek/resolvers.js` `updateFitnessUserSettings` + `buildGarminClient`), and both
  build their model from that one function. `pre('save')` / `pre(findOneAndUpdate|updateOne|
  updateMany|replaceOne)` encrypt on the way in (both the dot-path and nested `$set` shapes,
  idempotent via `isEncrypted`); a path getter decrypts on the way out — and mongoose does not run
  getters in `toObject()`/`toJSON()`, so serialising a settings document still yields ciphertext.
  Legacy plaintext passes through untouched until backfilled; a corrupt value fails closed through
  `safeDecrypt`. `GET`/`PUT /api/settings` now delete the field and return `garmin.password_set`
  instead of the old `'********'` mask (which would have been encrypted and stored verbatim if a
  client ever round-tripped it). The server refuses to boot without `KEY_VAULT_SECRET`
  (`backend/src/config/keyVault.js`); 12 suites / 106 tests green, basegeek's parity tripwire still
  green. **Two things Sage still owes production:**
    1. `KEY_VAULT_SECRET` must be set in fitnessgeek's `.env.production` **to the same value
       basegeek already uses** — both processes read this field. That contradicts the
       "`KEY_VAULT_SECRET` | basegeek only | Never share across apps" row in the root `DEPLOY.md`,
       which needs updating. Deploy both apps from the same commit (`packages/schemas` changed).
    2. Run the backfill **once**, after that deploy:
       `docker exec fitnessgeek node scripts/encryptGarminPasswords.js --dry-run` then without the
       flag. Idempotent, counts only. Full run order in `apps/fitnessgeek/DOCS/CONTEXT.md`.
  (`DEFERRED_WORK.md`)

- **Shared date utilities** — the timezone bug analysis identified a `toUtcMidnight()` /
  `localDateString()` / `displayCalendarDate()` pattern needed across bujogeek, fitnessgeek, and
  flockgeek. Promote to `packages/utils/src/dates.js` and import from there.
  (Full spec in `DOCS/ARCHIVE/THE_TIME_ISSUE.md`)

- ~~**Shared logger**~~ — **Done 2026-09-05.** `@geeksuite/logger` (`packages/logger`) extracts the
  pino pattern all seven backends (basegeek, bujogeek, fitnessgeek, flockgeek, storygeek, notegeek,
  bookgeek) had copied: `createLogger({ name, level?, pretty? })` (LOG_LEVEL/env level, dev
  pretty-print via pino-pretty), `createHttpLogger(logger, opts?)` (pino-http, same `genReqId`
  every backend used), `installShutdownHooks(logger, server, { onClose })`. Plain CommonJS (no
  `type: module`, matching `@geeksuite/user`) so fitnessgeek's CJS backend can `require()` it while
  the six ESM backends `import` it via Node's interop. New hardening, not just extraction: none of
  the seven redacted anything before — `createLogger` now always redacts `authorization`, `cookie`,
  `x-api-key` request headers, `set-cookie` (req+res), and `req.body.password`/`apiKey`; `createHttpLogger`
  quiets auto-logging for `/api/health` and `/health`. 7 vitest tests in `packages/logger/src/__tests__`.
  Each backend's logger module and the one `pinoHttp(...)` line in its server file were swapped over;
  routes/services/middleware untouched. `installShutdownHooks` is built and exported but not yet wired
  into any backend (each has a bespoke shutdown sequence today — follow-up if wanted).

- **`UserSettings` schema consolidation (fitnessgeek)** — schema lives in both
  `apps/fitnessgeek/backend/src/models/UserSettings.js` and
  `apps/basegeek/packages/api/src/graphql/fitnessgeek/models/UserSettings.js` and has drifted.
  Consolidate to one source of truth. (See `DOCS/CONTEXT.md`)

### GraphQL consolidation audit (2026-09-03)

Target architecture: every frontend reads/writes domain data through basegeek's `/graphql`;
each app's own backend shrinks to auth, health, and file/binary/third-party work. Where
reality stands, per app:

| App | Frontend data layer | Verdict |
|-----|---------------------|---------|
| bujogeek | Apollo → basegeek | ✅ fully on GraphQL. Own backend is auth-only, no duplicate models. The reference. |
| flockgeek | Apollo → basegeek | ✅ frontend fully on GraphQL (only `/api/health` ping). ~~All 13 Mongoose models duplicated~~ — **corrected 2026-09-05**: only 4 (`BirdNote`, `BirdTrait`, `Event`, `LineageCache`) were actually orphaned and are now deleted. The other 9 are imported by a full, live, *mounted* REST CRUD API (`routes/api.js` → birds/groups/group-memberships/health-records/egg-production/pairings/locations/hatch-events/meat-runs) that nothing in the repo calls anymore but which still runs in the server. See `apps/flockgeek/CONTEXT.md` — deciding whether to unmount that whole REST layer is a follow-up, not done here. |
| notegeek | Apollo → basegeek | ✅ frontend fully on GraphQL. ~~Own backend still carries legacy REST~~ — **deleted 2026-09-05**: `routes/notes.js`, `tags.js`, `search.js`, their controllers, and duplicate `models/Note.js`. This also resolved the `getTagHierarchy` 500 below. Follow-up prune, same day: `migrations/migrateNotesBetweenUsers.js` and `convertFoldersToTags.js` still imported the deleted `Note` model and had no caller (no npm script, no server import) — deleted, along with the now-empty `migrations/` directory. `utils/tagValidation.js` was imported only by its own test — both deleted. Backend suite still green (24 passed, 8 skipped); no dependency in `package.json` became unused as a result. |
| bookgeek | Apollo for library CRUD; `authFetch` REST for the rest | ⚠️ mostly. Legit REST: upload/download/cover/enrich/merge/import/device-baskets (binary + long jobs). Not legit: `/api/profile/*` (`library-filters`, `me`) and `/api/ai/status` — pure data, should be GraphQL. `App.jsx:15` hardcodes `http://localhost:1800/api`. ~~`api/src/graphql/{schema,resolvers}.js` is an **unmounted dead GraphQL server**~~ — **deleted 2026-09-05** (plus the unused `@apollo/subgraph` dep). 4 duplicated models remain (not yet touched). |
| fitnessgeek | `apiService.js` shims REST→GraphQL, but `restClient.js` still hits own backend | ⚠️ mostly. Still REST: food search/barcode/favorites/recent (`foodService.js`), `POST/PUT/DELETE /logs` + `POST /meals/:id/add-to-log` (`fitnessGeekService.js` — **the GraphQL equivalents `addFoodLog`/`updateFoodLog`/`deleteFoodLog`/`logMeal` exist but are NOT drop-in — audited 2026-09-05, see item 2 below; no writes moved**), meds RxNorm + med logs, influx, AI, `PUT /user/profile`. **All 13 models duplicated** — this is the `UserSettings` drift hazard above, times 13. |
| storygeek | axios REST to own backend | ❌ not on GraphQL. `apolloClient.js` exists but is never imported. basegeek's storygeek schema (`stories`, `story`, 3 mutations) is unused by the app and too thin to replace `/stories/*/continue`, `/export/*`, `/ai/*`. Decide: either build out the schema or drop the basegeek storygeek module as dead code. |

Ordered cheap-to-expensive:
1. ~~Delete dead code: bookgeek unmounted GraphQL, notegeek legacy REST routes + Note model,
   flockgeek duplicate models (verify no imports first with `rg`).~~ **Done 2026-09-05** —
   bookgeek's dead GraphQL server and notegeek's legacy REST routes + Note model are deleted;
   flockgeek turned out to still have a live, mounted REST API using 9 of its 13 models, so
   only the 4 genuinely orphaned ones came out (see the table row above and
   `apps/flockgeek/CONTEXT.md`). bujogeek's duplicate model housekeeping item (below) was
   already done in an earlier pass (`3af40cc`, 2026-08-30) — nothing left to delete there.
2. fitnessgeek: point `foodLogs` writes at the existing GraphQL mutations; remove those REST
   routes. Then food search/favorites/recent → new queries.
   **Blocked on a gateway change — audited 2026-09-05, nothing shipped.** The four mutations
   exist but three of them are not behaviour-equivalent to the REST routes they would replace,
   so switching the frontend today would lose data or add a new failure mode. `deleteFoodLog`
   is the only clean one, and moving it alone buys nothing toward removing the routes. Gateway
   ticket, all in `apps/basegeek/packages/api/src/graphql/fitnessgeek/`:

   - **`addFoodLog` cannot create a `FoodItem` on the fly.** `FoodLogInput.food_item_id: ID!`
     must already exist and pass `FoodItem.findAccessible`. REST `POST /api/logs` takes a whole
     `food_item` object and, when its id is not an ObjectId, calls
     `FoodItem.findOrCreate(food_item, userId)` — which dedupes by `barcode`, then
     `(source, source_id)`, then `(name, brand)`, and creates a **global** (`user_id: null`) row
     carrying `source`/`source_id`. Every food-search result is exactly that case: `foodApiService`
     mints synthetic ids (`usda_<fdcId>`, `openfoodfacts_<code>`), as do AI results. Pre-creating
     via `addFitnessFood` is lossy three ways — `FitnessFoodInput` has no `source`/`source_id`,
     the resolver hardcodes `source: 'custom'` + `user_id: user.id` (private, not global), and it
     does not dedupe, so every log of the same searched food mints another row.
     *Fix*: accept an optional `food_item: FitnessFoodInput` (plus `source`/`source_id`) on
     `FoodLogInput` and run the `findOrCreate` branch server-side.
   - **`updateFoodLog` takes `FoodLogInput!`, whose `log_date`/`meal_type`/`food_item_id`/`servings`
     are all non-null**, so a partial edit is impossible over the wire (the gateway's own tests call
     the resolver directly and never hit schema validation). Forcing the client to resend
     `food_item_id` re-runs `assertAccessibleFoodItems`, which filters `is_deleted: false` — so
     editing the servings on a log whose custom food was since soft-deleted would start failing
     with "Food item not found" where REST `PUT /api/logs/:id` succeeds.
     *Fix*: a `FoodLogUpdateInput` with every field nullable, and skip the food check when
     `food_item_id` is absent.
   - **`logMeal` does not write the `notes` provenance string.** REST `POST /api/meals/:id/add-to-log`
     stamps each created log with `notes: "Added from meal: <name>"`, and `FoodLogItem.jsx` renders
     `notes` as a visible caption. *Fix*: one line in the `logMeal` resolver.
   - Not blocking, but worth doing in the same pass: `addFoodLog`/`updateFoodLog`/`deleteFoodLog`
     skip `DailySummary.updateFromLogs`, which all three REST routes call (`logMeal` and
     `copyFitnessMeal` do call it). Harmless today only because `dailySummary` recomputes on read
     and the food reports read `FoodLog` directly; `weeklySummary` reads stored summaries and would
     go stale, but it has no frontend caller.
   - `logMeal` is a genuine **improvement** on one axis: REST's `parseLocalDate()` writes *local*
     midnight while `POST /logs` writes *UTC* midnight via `toUtcMidnight`, so meals added to the
     log already land on the wrong UTC day in negative-offset zones. The gateway passes the plain
     `YYYY-MM-DD` through Mongoose casting, i.e. UTC midnight, matching the read path.
   - Landmine for whoever picks this up: `apiService.js`'s `routeRequest` already maps
     `POST /logs` → `ADD_FOOD_LOG` and `PUT /logs/:id` → `UPDATE_FOOD_LOG` by passing the REST body
     straight through as `input`. Both mappings are wrong for the reasons above and are unreachable
     today only because `fitnessGeekService` deliberately uses `restClient` for these four calls.
3. bookgeek: `profile` + `ai/status` → GraphQL; kill the hardcoded `localhost:1800`.
4. fitnessgeek model consolidation (13 pairs) — biggest risk, do last, one model at a time.
5. storygeek decision.

Backend-side notes from the same pass: `graphql/dashboard/` is orphaned and field-name-broken —
being replaced by `graphql/glance/` under `DOCS/DASHGEEK_PLAN.md`. `notes` has no sort argument;
`UpdateBookInput` cannot set `readingProgress`/`dateStarted`/`dateFinished`; `Note` has no
`folderId` though `Folder` exists — the first two are fixed in that plan, `folderId` is not.

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

- **bujogeek subtasks UI** — backend model has `parentTask`/`subtasks` fields; no frontend UI. — **Done 2026-09-05** (`d53b008`: gateway resolvers fixed + UI).

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

- ~~**`fitnessgeek docker-compose.dev.yml`**~~ — **deleted 2026-09-05**, see `DEFERRED_WORK.md`.

- **bujogeek Apollo cache invalidation on mutations** — currently refreshing the view gives latest — **Done 2026-09-05** (`d53b008` + follow-up; rule at `apolloClient.js`).
  data; mutations don't invalidate the cache. Proper `refetchQueries` or cache update on write.
  `apps/bujogeek/DOCS/CONTEXT.md`

- ~~**bujogeek duplicate model files**~~ — **already done, struck 2026-09-05**. Checked the
  repo: neither `userModel.js`/`User.js` nor `templateModel.js`/`Template.js` exists anywhere
  under `apps/bujogeek` — this went out with the rest of the dead REST layer in `3af40cc`
  ("remove dead REST layer and orphaned frontend code", 2026-08-30). This TODO entry was stale.

- **basegeek stale AI model defaults** — hardcoded `gemini-1.5-flash-latest` and similar in
  `aiService.js` may be deprecated. Polish pass to remove or update defaults.
  `apps/basegeek/packages/api/src/services/aiService.js`

- **notegeek `formatRelativeTime` deduplication** — same function copied in three files.
  Extract to `frontend/src/utils/dateUtils.js`. (Low priority — NoteGeek needs full consolidation pass first.)

- **geekSuite/Bun gateway BroadcastChannel logout** — currently uses direct `fetch` without
  BroadcastChannel. Add `geeksuite-auth`/`LOGOUT` broadcast on logout.
  `src/server/index.js` (geekSuite gateway)
