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
12. **CSRF protection** — M. Double-submit token or `SameSite=Strict` refresh cookie + middleware
    in basegeek + per-app axios interceptor. Own branch, per-app verification. The largest
    open security exposure. *Security*
13. ~~Per-app auth test suites~~ — **Done 2026-09-02** (5 apps, all in CI; found + fixed a storygeek characters/export IDOR and a notegeek bcrypt crash). Was: — M (S per app). bujogeek, fitnessgeek, flockgeek, storygeek,
    notegeek have zero. Login flow, `/api/users/me`, data scoping. Gates #12 safely. *Tests*
14. ~~Admin gate on `GET /api/users`~~ — **Done 2026-09-02.** Follow-up added to SUITE_TODO:
    the `/api/apps` registry is unauthenticated and the DB browser routes are ungated.

## Tier 3 — Consolidation sweeps (L each; run like the 2026-09-02 sweep: per-app commits, incremental deploys)

15a. **Shell grammar pass** — L (one sweep, per-app commits). Decided 2026-09-02 after a
    seven-app audit; supersedes #16. Same skin, one grammar. Rules:
    - Desktop (`md`+): permanent 220px sidebar, no collapse rail. Brand block at top, grouped nav,
      footer in fixed order: **user chip → Settings → Sign out**.
    - 60px top bar: **page title/context left**; right cluster **theme toggle → app switcher →
      account avatar menu**. Brand does not live in the top bar.
    - Mobile (below `md`): hamburger in the top bar opens the *same* sidebar as a temporary
      220px drawer. One breakpoint everywhere.
    - Bottom tab bars stay **only** in data-entry apps (bujogeek, fitnessgeek, notegeek) and must
      not carry Logout or duplicate the drawer's account/settings rows.
    - Always-dark sidebar chrome (bujogeek, fitnessgeek) is identity — allowed.
    Step 0 — finish the primitives nobody uses yet: `GeekSidebar` (brand slot, grouped items,
    ordered footer), `GeekTopBar` (hamburger below `md`, title slot, fixed right cluster),
    `GeekShell` owns drawer state + breakpoint; optional `GeekBottomNav` (items, hides on
    editor/auth routes, no logout). Then migrate in this order, smallest chrome first:
    flockgeek (proof) → storygeek → bookgeek (+ its first mobile layout) → fitnessgeek →
    notegeek → bujogeek → basegeek. Per-app deltas in SUITE_TODO "Shell grammar audit".
    *UI*
15. **Shared EmptyState / ErrorState / toast primitives** — L. Seed from bujogeek `EmptyState`;
    migrate app by app. *UI*
16. ~~Shared mobile bottom-nav primitive~~ — folded into #15a.
17. **Shared date utilities** — M. `toUtcMidnight` / `localDateString` / `displayCalendarDate`
    into `packages/utils`; bujogeek, fitnessgeek, flockgeek consume. Spec exists in
    `ARCHIVE/THE_TIME_ISSUE.md`. *Shared libs*
18. **Shared logger** — S–M. Extract the pino pattern already in three apps. *Shared libs*
19. **`toneForMode` helper + themed tooltips + auth splash** — S each; batch into #15's sweep.
    Replaces the four ad hoc lighten/darken branches added 2026-09-02. *UI*
20. **cryptoVault → `@geeksuite/crypto-vault`** — M. Step 1 promote; step 2 fitnessgeek Garmin
    password encryption + backfill. *Shared libs / security*
21. **fitnessgeek `UserSettings` schema consolidation** — S. Silent-data-loss hazard documented
    in `CONTEXT.md`. *Shared libs*
22. **Input validation (Joi/Zod)** — L, slow-burn. Route by route; start with bujogeek
    timestamps and fitnessgeek settings. *Security / tests*
23. **Circuit breakers on fitnessgeek external APIs** — S. `opossum` around USDA, Nutritionix,
    OpenFoodFacts, Garmin. *Observability*

## Tier 4 — Features

24. **storygeek markdown rendering** — S. Narration shows literal asterisks; the deps are
    already declared. Style from the palette. *Feature*
25. **bujogeek subtasks UI** — M. Backend already has the fields. *Feature*
26. **bujogeek Apollo cache invalidation on mutations** — S–M. *Feature / correctness*

## Tier 5 — Deferred or challenged (do the mitigation, not the migration)

27. **bookgeek off the runtime Tailwind CDN** — XL as a migration. Mitigate instead: vendor the
    CDN script (S) so the PWA works offline, and keep the incremental MUI migration from the
    unification audit. *UI*
28. **startgeek joins the suite** — theme wiring means pulling a deliberately standalone app
    into the workspace build. Do the **adaptive wallpaper scrim** alone (S); defer the wiring
    until there's a second reason to touch that build. *UI*
29. **Mongo connection topology (basegeek)** — investigated, not a duplicate pool; deferred
    with the hazard noted. *Infra*
30. **Small UI items** — bujogeek TemplatePreview markdown, notegeek mind-map palette,
    fitnessgeek Drawer landmine, BarcodeScanner media query, offline pages per mode, native
    date pickers, reduced motion, flockgeek first-visit flicker. Pick up when already in
    those files. *UI*
31. **Housekeeping** — dead components list, duplicate bujogeek models, stale fitnessgeek dev
    compose, basegeek stale AI model defaults, notegeek `formatRelativeTime` dedupe, gateway
    logout broadcast. Zero user impact; batch into any nearby pass. *Cleanup*

---

## Suggested next passes

- **Pass A (Tier 1) and Pass B (Tier 2 minus CSRF) — done 2026-09-02.**
- **Pass C:** #12 CSRF on its own branch, verified per app against the five new auth suites,
  reviewed before merge. Then the basegeek follow-ups from SUITE_TODO (app registry auth, DB
  browser gates, `configure()` wiring) since they're the same code area.
- **Pass D:** #15a shell grammar pass (primitives first, then flockgeek as proof, then the rest).
- **Pass E:** #15 primitives sweep (EmptyState / ErrorState / toast) with #19 batched in.

*Last ordered: 2026-09-02. Tiers 1 and 2 (minus CSRF) landed the same day.*
