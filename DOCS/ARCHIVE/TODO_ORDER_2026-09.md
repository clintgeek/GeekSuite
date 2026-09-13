# GeekSuite TODO — Work Order

The single prioritized queue across UI/UX, security, shared libraries, features, and
tooling. Ordered by **result per unit of work**: highest payoff for the least effort first.
`SUITE_TODO.md` holds the detail and file pointers; this file only decides sequence.

Effort scale: **XS** ≤ 1 hour · **S** ≤ half a day · **M** 1–2 days · **L** 3–5 days · **XL** a week+.
Result scale: what it touches and whether it *prevents* future work or only fixes present work.

When an item lands, strike it here and move its detail to a "Landed" block in `SUITE_TODO.md`.

---

## Tier 1 — Foundations and safety — **LANDED 2026-09-02**

All nine shipped in one pass (commits 9f343ea..ca378ea). Kept here struck-through for one
cycle so the ordering rationale stays visible; detail moved to `SUITE_TODO.md` "Landed".

1. ~~storygeek Destroy button renders as primary~~ — override scoped to `containedPrimary`.
2. ~~Contrast regression test~~ — `packages/ui/src/__tests__/themeContrast.test.js`, 210
   assertions, in CI. Found and fixed 10 gaps; **4 remain as a ratchet: white on the suite
   blue `#6098CC` is 3.06:1** (suite default + bujogeek). Brand decision pending — darken to
   ~`#4B7AA3` or use dark button labels. → now item 10a below.
3. ~~`text.muted` token~~ — 56 sites swept.
4. ~~MUI major-version pin~~.
5. ~~ESLint actually running~~ — 526 files, 0 errors / 207 warnings, `pnpm -r lint` in CI.
   Surfaced and fixed a live bug (fitnessgeek weight chart rendered empty).
   **startgeek is the exception:** it builds standalone with npm (no workspace deps by
   design), so it keeps its own ESLint 8 `.eslintrc.cjs` — a `workspace:*` devDependency
   broke its image build on the first push.
6. ~~PWA manifests + theme-color per mode~~.
7. ~~Login wordmark colors + bookgeek primary contrastText~~.
8. ~~Cross-tab logout BroadcastChannel~~ — also fixed a same-tab double-logout. Gateway is
   not in this repo.
9. ~~CORS fallback origins~~ — note: basegeek production had **no** `CORS_ORIGINS` set and was
   running on the LAN-inclusive fallback; fitnessgeek's production value still lists two
   localhost origins (env, not code — trim it).

## Tier 2 — Headline wins — **LANDED 2026-09-02 except #12**

10a. ~~Suite blue vs. white button labels~~ — **Done 2026-09-02:** primary darkened to
    `#4B7AA3` suite-wide (4.56:1 with white); `KNOWN_GAPS` is now empty.
10. ~~Suite switcher in the GeekShell top bar~~ — **Done 2026-09-02** (GeekAppSwitcher + GeekThemeToggle in packages/ui, wired into all seven MUI apps). Was: — S–M. Nine-dot menu, all eight apps. Biggest
    "this is one product" signal for the least code. Fold **theme toggle placement** into the
    same top-bar work. *UI*
11. ~~basegeek light mode on `createGeekSuiteTheme`~~ — **Done 2026-09-02.** Follow-up in SUITE_TODO: basegeek never calls `configure()`, so preferences don't persist from there. Was: — M. Last MUI app off the factory; the
    suite's Theme control finally applies to the app that hosts it. Do after #2 so the new
    palette is verified as it's built. Includes the Account-page `'dark'` default bug. *UI*
12. ~~CSRF protection~~ — **Done 2026-09-02** (merged enforcing; see Pass C).
13. ~~Per-app auth test suites~~ — **Done 2026-09-02** (5 apps, all in CI; found + fixed a storygeek characters/export IDOR and a notegeek bcrypt crash). Was: — M (S per app). bujogeek, fitnessgeek, flockgeek, storygeek,
    notegeek have zero. Login flow, `/api/users/me`, data scoping. Gates #12 safely. *Tests*
14. ~~Admin gate on `GET /api/users`~~ — **Done 2026-09-02.** Follow-up added to SUITE_TODO:
    the `/api/apps` registry is unauthenticated and the DB browser routes are ungated.

## Tier 3 — Consolidation sweeps (L each; run like the 2026-09-02 sweep: per-app commits, incremental deploys)

15a. ~~Shell grammar pass~~ — **Done 2026-09-02** (commits d2b4787..6e9b14e). `GeekShell` nav mode,
    `GeekSidebar` content panel (brand → grouped nav → extras; footer removed same evening),
    `GeekTopBar` (hamburger below md, title slot, theme → switcher → account menu), `GeekBottomNav`.
    All seven MUI apps migrated: flockgeek (proof), storygeek, bookgeek (first mobile layout),
    fitnessgeek, notegeek, bujogeek, basegeek (rail removed). New Settings pages in flockgeek and
    bujogeek. Bottom bars kept in bujogeek/fitnessgeek/notegeek without logout. Follow-ups in
    SUITE_TODO: visual pass in both modes; storygeek play surface now 220px narrower on desktop;
    top-bar titles are route names (per-app refinement welcome).
15. ~~Shared EmptyState / ErrorState / toast primitives~~ — **primitives done 2026-09-03** (GeekEmptyState,
    GeekErrorState, GeekToastProvider/useToast in packages/ui; bujogeek is the proof). **flockgeek
    fan-out done 2026-09-05** (ResponsiveTable grew error/onRetry props; Groups/LocationsPage
    converted directly; all mutation errors + QuickHarvestEntry's success/error state became
    toast; GeekToastProvider mounted in LayoutShell). **notegeek fan-out done 2026-09-05**
    (GeekToastProvider mounted in Layout.jsx; NoteList/SearchResults/Sidebar/NoteViewer/NotePage
    query errors converted with real onRetry; QuickCaptureHome's capture Snackbar became a
    toast; two dead unrouted pages swept for consistency; Register.jsx's inline validation
    Alert left alone — no shell/provider on that route). **basegeek fan-out done 2026-09-05**
    (AIGeek's `pages/aigeek/*` was already converted from this week's polish pass, nothing to
    do there; `ResponsiveTable` grew the same `error`/`errorTitle`/`onRetry` props as flockgeek's
    plus a `GeekEmptyState` empty row; AccountPage's inline error `Alert` and its two
    `saved`-state auto-clear checkmarks became `notify()` calls, its "No app-specific
    preferences yet" block became `GeekEmptyState`; UserGeekPage's load failure became
    `GeekErrorState` with `onRetry={fetchUsers}`, its delete/create failures became toasts, its
    "No users found" `ListItem` became `GeekEmptyState`. `GeekToastProvider` was already mounted
    in `Layout.jsx` from an earlier pass. Left alone: Mongo/Redis/Postgres/InfluxDB status cards
    and BaseGeekHome/PortalPage's app-health tiles — standing connection readouts, not toasts;
    LoginPage/RegisterPage's inline error `Alert`s — public routes outside the shell, no
    `GeekToastProvider` to reach (same gap TODO_ORDER #19 already flags as "Auth splash still
    open"). No local `EmptyState`/`ErrorState`/toast component or `isDark ? lighten` tone helper
    existed here, so nothing to delete. Mobile harness: 26 scenes, 0 violations — unchanged from
    baseline (`e85fc43`)). **bookgeek fan-out done 2026-09-05** (this week's Pocket Pass rewrite
    had already put `GeekEmptyState`/`GeekErrorState` on `LibraryView`'s empties and its
    load-error-with-retry, so the gap was entirely toast; `GeekToastProvider` mounted in
    `App.jsx`, inside `GeekShell` and outside `GeekAppFrame`. Converted: SettingsView's
    profile-save, default-shelf-save, and shelf-edit errors/messages; its three
    Goodreads-import/dedupe/Calibre-rescan jobs' terminal summaries/errors (loading state
    stayed inline, per the import/enrich carve-out); BookDetailModal's enrich terminal notice
    and its More sheet's upload outcome; LibraryView's basket/merge-selection validation
    captions. AI status error became a compact `GeekErrorState` with `onRetry`, flockgeek's
    health-check shape. Left alone: every error inside an open dialog the user must act on
    right there (add-book, edit-metadata, delete-confirm, cover-search, progress); the sticky
    detail sheet's send-to-kindle status/no-EPUB reminder (a toast candidate, left with its
    ticker sibling); the reader's own non-theme-token error line; the duplicated
    saved-filters-load error (Sidebar + FilterSheet); SettingsView's dead-code auth `Alert`
    (App.jsx gates on `!user` earlier via `LoginSplash`, same auth-screen gap as notegeek/
    basegeek). No local EmptyState/ErrorState/toast component or `isDark ? lighten` tone
    helper existed here, so nothing to delete and nothing for #19. Mobile harness: 12 scenes
    (phone only), 0 violations — unchanged from baseline (`e85fc43`)). **fitnessgeek fan-out
    done 2026-09-05** (`GeekToastProvider` mounted in `ModernLayout.jsx`, inside `GeekShell` and
    outside `GeekAppFrame`; local `components/primitives/EmptyState.jsx` — the
    second-most-developed local empty state named in this section — kept as a thin wrapper:
    the dashed "ghost" `Surface` card and circular icon ornament stayed, structure/spacing moved
    to `GeekEmptyState`, all four call sites (MyFoods, MyMeals, Medications, Activity)
    untouched. Converted to toast: Weight's and FoodSearch page's `Snackbar` pairs;
    Settings/Profile/MyFoods/MyMeals/BloodPressure/DashboardNew/HouseholdSettings/
    InfluxDBSettings/FoodSearch component/AIGoalPlanner's `useState`-driven success/error
    `Alert`s (HouseholdSettings' banner sat behind its own `PremiumDialog`, so this was also a
    real bug fix, not just a style swap). Settings' and Reports' and Activity's dead-content
    load failures became `GeekErrorState` with `onRetry`; Activity's "Garmin not enabled" branch
    became `GeekEmptyState` with a Settings deep link instead of a `warning` `Alert`, since it's
    normal-empty, not broken. `toneForMode` (#19) replaced the `isDark ? color : darken(color,
    0.35)` branches in `BPLogList`, `BPInsights`, and `Activity`'s two sleep/metric tiles. Left
    alone (dialog/form-adjacent, user must act right there): `QuickAddBP`/`AddBPDialog`'s and
    `BarcodeScanner`'s inline validation and camera/lookup errors, `WeightGoalWizard`'s field
    errors; `PWAUpdatePrompt` and `OfflineIndicator` (mounted in `App.jsx` above the
    router/shell entirely — no `GeekToastProvider` in scope, and `PWAUpdatePrompt`'s is a
    15s-auto-apply action banner, not a courtesy); `SleepAnalysis`/`RecoveryCoach`/
    `MealImpactVisualization`/`HealthDashboard`'s analytical insight `Alert`s (substantive
    content, not empty/error/toast-shaped); `UnifiedFoodSearch.jsx` (outside `components/
    FoodLog*` but tightly coupled to `AddFoodDialog`, which another agent was mid-migration on
    — flagged instead of touched). `FoodLog*` pages/components and `services/**` untouched per
    the food-log GraphQL migration in flight. Lint held at the 55-warning baseline: adopting
    `notify` inside six mount-effect load functions (Settings/MyMeals/BloodPressure/
    DashboardNew/HouseholdSettings/InfluxDBSettings) newly tripped
    `react-hooks/exhaustive-deps`, since the linter can't prove `useToast()`'s `notify` is
    stable the way a `useState` setter is; each got a one-line disable comment rather than a
    behavior-risking dependency-array change. Mobile harness: 20 scenes, 0 violations —
    unchanged from baseline. **storygeek fan-out done 2026-09-05 — fan-out complete, all
    seven apps.** No local EmptyState/ErrorState/toast component existed. `GeekToastProvider`
    mounted in Layout.jsx. StoryList's "shelves are empty" card became `GeekEmptyState`; its
    load failure split into a dedicated `loadError` → `GeekErrorState` with
    `onRetry={loadStories}` (previously indistinguishable from a genuinely empty library);
    its dialog-adjacent validation/delete errors — page-level Alerts that rendered *behind*
    the open CodexDialog's backdrop — became toasts, the same backdrop-visibility fix as
    fitnessgeek's HouseholdSettings. Settings' AI-provider load failure became a compact
    `GeekErrorState` with `onRetry` (load lifted into a `useCallback` so retry could call it).
    StoryPlay: `loadError` gates the whole play surface via `GeekErrorState` in place of the
    infinite spinner a failed load used to leave; "failed to continue"/EPUB-export failures
    became toasts; Bookify's own job failure stayed `GeekErrorState` inside the dialog body
    (an empty dialog with nothing else to show, the primitive's own contract); the Copy
    button's `copied` boolean + `setTimeout` label swap collapsed into one `notify()` call.
    Four small in-panel empties (CharacterPanel, PartyPanel, QuestPanel, JournalDrawer) became
    compact `GeekEmptyState`s via `description` only, preserving each panel's muted-italic
    caption voice. CharacterSheet's "coming soon" card converted like StoryList's. `toneForMode`
    (#19) replaced StoryList's genre-swatch-as-text branch. Left alone: StoryCreation.jsx's
    inline validation (full-page form, dialog/form-adjacent carve-out); Narration's in-story
    markdown and the composer's status line (content, not feedback); StoryPlay's
    `getDiceColor` isDark ternary (distinct per-tier hex values, not a lighten/darken pair);
    theme.js's palette-construction ternaries; LoginPage (public route, no shell/provider).
    `packages/ui` gaps found: none. Lint held at the 3-warning baseline. Tests: 33 passing / 6
    skipped (up from 31 — two new StoryList cases cover the empty/error-with-retry branches;
    StoryPlay's suite stays skipped per the burn queue). Mobile harness: 18 scenes (phone
    only), 0 violations — unchanged from baseline. Full detail in
    THE_UI_UNIFICATION_PLAN.md "3a. Feedback Primitives". *UI*
16. ~~Shared mobile bottom-nav primitive~~ — folded into #15a.
17. ~~**Shared date utilities**~~ — **Done 2026-09-05** (`@geeksuite/utils`, 36 tz tests across
    five zones; detail in `SUITE_TODO.md`). *Shared libs*
18. ~~**Shared logger**~~ — **Done 2026-09-05** (`@geeksuite/logger`; detail in `SUITE_TODO.md`). *Shared libs*
19. ~~`toneForMode` helper + themed tooltips~~ — **Done 2026-09-03** (bujogeek's three sites converted;
    fitnessgeek's three sites — `BPLogList`, `BPInsights`, `Activity`'s two tiles — converted
    2026-09-05 during the #15 fan-out; storygeek's one site — StoryList's genre-swatch-as-text
    branch — converted 2026-09-05 too, closing this out; no `MuiTooltip` override exists in
    storygeek's theme, so nothing there to convert). Auth splash still open — S. *UI*
20. ~~**cryptoVault → `@geeksuite/crypto-vault`**~~ — **Done 2026-09-05** (both steps: package
    promoted, fitnessgeek's Garmin password encrypted at rest + backfilled; detail in
    `SUITE_TODO.md`). *Shared libs / security*
21. ~~**fitnessgeek `UserSettings` schema consolidation**~~ — **Done 2026-09-05** (`6d7865c`,
    `@geeksuite/schemas`, parity tripwire both sides; detail in `DOCS/CONTEXT.md`). *Shared libs*
22. **Input validation (Joi/Zod)** — L, slow-burn. Route by route: bujogeek's
    ten gateway mutations (`3265b1c`) and fitnessgeek's settings/weight/BP/
    medication routes (`00ef0b7`) **done 2026-09-05**; storygeek's REST
    backend **done 2026-09-05** (stories, characters, export, auth's
    `/refresh`; `ai.js` has no mutating routes so nothing to add there —
    detail in `apps/storygeek/DOCS/CONTEXT.md`); **bookgeek api done
    2026-09-05** (the binary/long-job REST that stayed after `01d35d4` moved
    the pure-data CRUD to basegeek's gateway — book file upload/download,
    covers, enrich, merge, Goodreads import/dedupe, Calibre rescan, device
    baskets, send-to-kindle; detail in `apps/bookgeek/DOCS/CONTEXT.md`).
    **notegeek + flockgeek gateway modules done 2026-09-05** — the same layer
    as bujogeek's, on all eight notegeek mutations and all sixteen flockgeek
    ones. `validateInput` and the date/id primitives moved to
    `graphql/shared/validation.js`; all three modules now raise one error
    shape. Every flockgeek date argument is a calendar day normalized through
    `toUtcMidnight` (the write-side half of `4856227`); notegeek takes no date
    arguments at all. Closes two real gaps mongoose left open — a
    `findOneAndUpdate` runs with `runValidators` off, so `updateBird(status:)`
    and `updateMeatRun(status:)` previously wrote off-enum values straight to
    the database. Detail in `apps/basegeek/DOCS/CONTEXT.md` "Gateway input
    validation". **bookgeek gateway module done 2026-09-05** — the same layer
    on all eight bookgeek mutations (`createBook`/`updateBook`/`deleteBook`
    plus the `01d35d4` profile family: `saveBookProfile`, `saveLibraryFilter`,
    `deleteLibraryFilter`, `addBookShelf`, `removeBookShelf`). Books and
    shelves stay a deliberately SHARED household library (no owner key exists
    in any of these mutations' arguments, so — unlike the other three
    modules — there was nothing to strip before validation); only the
    Profile family is per-user. `publishedDate` is a calendar day,
    `dateStarted`/`dateFinished` are instants. This closes the gateway side
    of #22 entirely — the only piece left is flockgeek's *own* REST backend,
    pending its Q22 decision. *Security / tests*
23. ~~**Circuit breakers on fitnessgeek external APIs**~~ — **Done 2026-09-05** (`9dede26`,
    `opossum` around USDA, OpenFoodFacts, CalorieNinjas and Garmin, 58 tests; Nutritionix has no
    live call site, FatSecret left unwrapped and noted). *Observability*

## Tier 4 — Features

24. ~~**storygeek markdown rendering**~~ — **Done 2026-09-05** (`fe805c9`, `remark-gfm`/
    `remark-breaks` in Narration, styled from the Codex palette). *Feature*
25. ~~**bujogeek subtasks UI**~~ — **Done 2026-09-05** (`d53b008`). *Feature*
26. ~~**bujogeek Apollo cache invalidation on mutations**~~ — **Done 2026-09-05** (`d53b008`, plus same-day follow-up; see `apps/bujogeek/DOCS/CONTEXT.md`). *Feature / correctness*

## Tier 5 — Deferred or challenged (do the mitigation, not the migration)

27. ~~**bookgeek off the runtime Tailwind CDN**~~ — **Done 2026-09-04** as a side effect of the
    Pocket Pass (DOCS/MOBILE_UI_PLAN.md): every view rewritten in MUI, CDN script removed
    (`5b6bb3f`). *UI*
28. **startgeek joins the suite** — theme wiring means pulling a deliberately standalone app
    into the workspace build. ~~Do the **adaptive wallpaper scrim** alone (S)~~ — **Done
    2026-09-05**, see `apps/startgeek/CONTEXT.md`; defer the wiring
    until there's a second reason to touch that build. *UI*
29. **Mongo connection topology (basegeek)** — investigated, not a duplicate pool; deferred
    with the hazard noted. *Infra*
30. **Small UI items** — ~~bujogeek TemplatePreview markdown~~, ~~notegeek mind-map
    palette~~, ~~fitnessgeek Drawer landmine~~, ~~fitnessgeek BarcodeScanner media query~~,
    offline pages per mode, ~~native date pickers (fitnessgeek)~~ — flockgeek's half still
    open, reduced motion, ~~flockgeek first-visit flicker~~ — six
    done 2026-09-05 (detail in SUITE_TODO.md). Pick up the rest when already in those
    files. *UI*
31. **Housekeeping** — dead components list, duplicate bujogeek models, ~~stale fitnessgeek dev
    compose~~, basegeek stale AI model defaults, notegeek `formatRelativeTime` dedupe, gateway
    logout broadcast. Zero user impact; batch into any nearby pass. *Cleanup*
    - fitnessgeek dead-frontend-files sweep **done 2026-09-05** (22 files deleted: the 6 M2-report
      candidates plus 15 more found in a repo-wide unused-import sweep; `docker-compose.dev.yml`
      deleted — detail in `DEFERRED_WORK.md`). Remaining sub-items (bujogeek models, basegeek AI
      defaults, notegeek dedupe, gateway broadcast) still open.

---

## Suggested next passes

- **Pass A (Tier 1) and Pass B (Tier 2 minus CSRF) — done 2026-09-02.**
- **Pass C:** ~~#12 CSRF~~ — **merged and enforcing 2026-09-02** (branch `csrf-protection`; Origin/Referer
  allow-list guard before `cors()` in all seven backends; `CSRF_GUARD=off|report` levers).
  Basegeek follow-ups **done 2026-09-03**: registry mutations + DB browsers admin-gated, `configure()` wired.
  Sibling-subdomain CSRF against basegeek's double-submit token **done 2026-09-05** (`a3c4031`,
  `d8521eb`; `CSRF_TOKEN=off|report|enforce`, currently `report`) — detail in `CONTEXT.md`.
- **Pass D (shell grammar) — done 2026-09-02.**
- **Pass E:** #15 primitives sweep (EmptyState / ErrorState / toast) with #19 batched in.

*Last ordered: 2026-09-02. Tiers 1 and 2 (minus CSRF) landed the same day.*
