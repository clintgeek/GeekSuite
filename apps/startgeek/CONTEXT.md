# StartGeek v2 — Console

## Identity

- **App**: `startgeek`
- **Image**: `ghcr.io/clintgeek/startgeek:latest`
- **Port**: `3000`
- **Domain**: `https://start.clintgeek.com`
- **Working name for the concept**: DashGeek (Day at a Glance). There is no separate `dashgeek` app, image, or domain.

## What This Is

- A browser start page for the GeekSuite ecosystem, styled as a quiet console:
  dark ground, dark-glass panels with hairlines, thin tabular numerals, one
  warm accent. Futuristic by precision, not by neon.
- Deliberately small. Six things, in this order: time and date, today's
  weather (click for a detail modal with the week), the command bar, then
  one block: Tasks on the left (overdue, today, upcoming; scrolls) sized to
  Fitness and Reading stacked on the right.
- Logged-out: rail (sign in, settings), clock, weather block, command bar
  (web search only), dock.
- Logged-in: the above plus quick capture, suite search, and the module row
  from basegeek.

## What This Is NOT

- Not an admin dashboard and not a SaaS homepage.
- No StoryGeek widgets. No StartGeek backend. No separate `dashgeek` deployment.
- **Revised 2026-09-03:** the original v2 brief forbade card grids, charts,
  and user-configurable widgets; the console redesign added a module grid,
  meters, and per-block switches on purpose. Later the same day Chef cut the
  grid back to one row (Tasks · Fitness · Reading) and moved weather into the
  hero. Habits, Notes, a 7-day Week module, a day track, and a summary line
  were built and then removed as "too much". Don't re-add them without asking.

## Design tokens

Every colour resolves to a CSS variable in `src/index.css` (`--ground`,
`--panel`, `--hair`, `--ink` … `--accent`, `--critical`, `--sky`).
`tailwind.config.js` maps them to utility names (`text-ink-2`, `border-hair`,
`bg-panel`). **Tailwind opacity modifiers do not work on these** (`text-ink/50`
silently compiles to nothing); use an arbitrary `rgba(...)` value instead.

Panels (`.mod`) are dark glass: `rgba(12,15,21,0.58)` + 18px backdrop blur.
Layout classes live in `index.css`: `.hero.with-weather` splits at 820px;
`.row.with-side` puts Tasks in a two-row span on the left so Fitness +
Reading set the height and the task list scrolls inside it. The command box
sits at `z-20` so its results dropdown paints over the row. Photo backdrop is
blurred 7px behind a graded scrim.

Type is Geist across its range: weight 200 for the clock and the big
temperature, 400/500 for content, Geist Mono for labels, counts, and streaks.

## Settings

`SettingsContext` persists `{ backdrop, clock, modules, ask, brief, calendars }` to
`localStorage['startgeek.settings']`. No backend. The sheet opens from the rail
control or the `,` key. Block list, defaults, and allowed values live in
`src/config/modules.js` (`weather`, `today` = Tasks, `calendar`, `fitness`,
`reading`). `ask` is the `??` opt-in, off by default; `brief` is the morning-brief opt-in,
also off by default; `calendars` is a list of
`{ url, color }` ICS feeds, empty by default.
A block with no data stays hidden even when on. Logged out, only `weather`
and the backdrop/clock controls show.

- **Backdrop** `photo` (default): picsum wallpaper, blurred, behind a scrim.
  `void`: no photo, flat ground with a faint grid.
- **Clock** `12` (default) or `24`.

### Adaptive wallpaper scrim (2026-09-05)

The Photo-mode scrim's darkness follows the wallpaper's own luminance —
`BackgroundManager.jsx` draws a second, independent 32×32 probe image
(`crossOrigin="anonymous"`) to an offscreen canvas once per wallpaper change,
averages its luma, and maps it through a clamped linear ramp
(`scrimFactorForLuminance`: luminance 0 → 0.75x, 1 → 1.4x the fixed scrim
alphas) into a `--scrim-alpha` CSS custom property on the backdrop root.
`.wallpaper-scrim` in `index.css` consumes it via `calc()`. picsum.photos
answers CORS with `Access-Control-Allow-Origin: *` (confirmed by hand, needs
an `Origin` header to appear — a plain `curl -I` won't show it), so sampling
works today; if a future host doesn't answer CORS, the probe's `onload` never
fires (or `getImageData` throws on a tainted canvas) and it's caught, falling
back to `--scrim-alpha: 1` — the original fixed scrim, unchanged. The probe
is deliberately separate from the `<img>` that drives the visible wallpaper,
so a CORS failure can never break the wallpaper itself. Void mode is
untouched — the scrim div's opacity still goes straight to 0. No light theme
exists in this app (`color-scheme: dark` only), so there was no second theme
state to wire the ramp against.

## Tech Stack

- React 18 + Vite 5
- Tailwind CSS 3
- Framer Motion 10
- `serve` for static production
- ESLint 8 with its own `.eslintrc.cjs`
- Standalone `npm` app with its own `package-lock.json`; no pnpm workspace or `workspace:*` dependencies.

## File Map

```
src/
  App.jsx              — Shell: rail, hero (clock + weather block), command box, module row, dock, sheets
  main.jsx             — React entry point
  index.css            — Tokens + component CSS (panel, dot, meter, range, switch, seg)
  constants.js         — Timing, animation, forecast constants
  config/
    apps.jsx              — Dock apps
    modules.js            — Switchable blocks, defaults, allowed setting values
  components/
    BackgroundManager.jsx — Photo / void backdrop
    DateTime.jsx          — Clock (12h/24h from settings)
    WeatherBlock.jsx      — Today's weather panel in the hero; click opens the modal
    WeatherModal.jsx      — Today's details + 7-day range bars; focus-trapped
    BriefCard.jsx         — The morning brief, closing the hero. Display-only, dismissible
    CommandBox.jsx        — Quick capture / search box
    HelpButton.jsx, HelpModal.jsx, SearchResults.jsx, Toast.jsx
    AnswerCard.jsx        — The `??` answer, above the result list
    CalendarModule.jsx    — ICS agenda feed, grouped by day, paged on scroll
    DraftPreview.jsx      — The model's draft as an offer: Create or Edit, nothing saved yet
    Module.jsx            — Panel wrapper: label, count, link, foot, span
    ModuleGrid.jsx        — Tasks (overdue / today / upcoming, scrolls) beside stacked Fitness + Reading
    TaskRow.jsx           — Task line with dot, tags, event time, overdue pill
    FitnessModule.jsx     — Calories meter, meals, streak
    ReadingModule.jsx     — One book: cover, title, author, progress
    SettingsSheet.jsx     — Blocks, backdrop, clock; focus-trapped
    AppDock.jsx, DockItem.jsx, SessionButton.jsx, icons.jsx
  context/
    SettingsContext.jsx   — localStorage-backed settings
    WeatherContext.jsx    — Local conditions + forecast (sunrise/sunset included)
    SessionContext.jsx    — Auth state
    GlanceContext.jsx     — glanceToday data (tasks incl. upcoming, reading, fitness)
  hooks/
    useSettings.js, useTime.js, useWeather.js, useSession.js, useGlance.js
    useCalendarEvents.js  — ICS fetch + localStorage cache + visibility-gated poll
    useMorningBrief.js    — The brief's single fetch: no poll, no refetch, silent on failure
  services/
    weatherService.js     — Open-Meteo / ipapi client
  lib/
    graphql.js            — Gateway client (CSRF header + heal), UnauthorizedError re-export
    errors.js             — UnauthorizedError (apart from graphql.js so node --test can import it)
    commandFailure.js     — isAuthFailure / failureMessage: what a failed capture says
    csrfHeal.js           — shouldHealCsrf / triggerCsrfReloadOnce (+ .test.js)
    captureDraft.js       — When a `>`/`<` line is worth a model call, and the draft round trip
    morningBrief.js       — The brief's three gates + provenance line (+ .test.js)
    queries.js, basegeek.js, engines.js, commandMode.js, parseTaskInput.js
```

## a11y pass (2026-09-05, TODO_ORDER Q51)

The mobile harness' axe run had startgeek at **2 findings — 0 now**, both
`scrollable-region-focusable` on the seven-day forecast strip in
`src/components/WeatherModal.jsx`. The strip scrolls sideways on a phone and
holds nothing focusable, so a keyboard user could not reach the days off
screen. It now takes `tabIndex={0}` with `role="group"` and
`aria-label="Seven-day forecast"` plus a `focus-visible` outline. Any future
`overflow-x-auto` row here needs the same three things — a tab stop, a name,
and a visible focus ring.

## Going-over 2026-09-05

A read of the whole app — every component, context, hook, lib module, the
service worker and the container config. Lint stays at 0 warnings
(`--max-warnings 0`), harness 8 scenes 0/0/0 with `--enforce-a11y`, tests
8 → 14.

### Fixed

- **The command box swallowed every failure that was not an expired session.**
  Each capture and search path ended with
  `catch (err) { if (err instanceof UnauthorizedError) markOut() }`, so a
  gateway 500, a rejected mutation, a dropped connection or a CSRF 403 the heal
  could not fix produced *nothing*: the text stayed in the box and the page said
  not a word. Pressing Enter on a task that failed to file was
  indistinguishable from one that filed. There is now one `reportFailure`
  helper behind the existing `Toast`, used by the draft-confirm, deterministic
  capture, suite-search-on-Enter and ask-fallback paths. The debounced
  type-ahead search stays deliberately quiet — a toast per keystroke would be
  worse than an empty dropdown, and Enter runs the same query through the path
  that does report. `src/components/CommandBox.jsx`.
- **`signOut` did nothing when basegeek was unreachable.** `await logout()`
  then `window.location.reload()` — a network failure rejected out of `logout()`
  and the reload never ran, so the Sign out button was inert and the rejection
  surfaced as an unhandled promise. The reload is in a `finally` now.
  `src/context/SessionContext.jsx`.
- **`GlanceContext` handed every consumer a fresh object on every render** —
  `const value = { data, loading, error, refetch }`. Memoized; ModuleGrid,
  TaskRow and CommandBox no longer re-render on each of the 60s poll's two
  `loading` transitions.
- **The `serve` npm script still carried `-s`.** The Dockerfile dropped it on
  purpose, with a long comment: `-s` rewrites *every* not-found request to
  `index.html`, including a deleted hashed asset path, which is the SPA-fallback
  cache-poisoning landmine. `npm run serve` is what a local verification run
  uses, so it was reproducing exactly the behaviour the container avoids.
  Dropped there too. **Confirmed while checking it: startgeek has no client-side
  router at all** — no `react-router` dependency, no `Route`, `src/App.jsx` is
  the whole page — so there is no client route that could 404 without `-s`.
- **`UnauthorizedError` moved to `src/lib/errors.js`**, with `graphql.js`
  re-exporting it so every existing import keeps working against the same class
  (identity is what `instanceof` depends on). The reason is testability:
  `graphql.js` reads `import.meta.env`, which only exists under Vite, so plain
  `node --test` cannot import it. Same seam `csrfHeal.js` already uses.
- **New: `src/lib/commandFailure.js`** — `isAuthFailure` / `failureMessage`, the
  pure half of the fix above, with `commandFailure.test.js` (6 cases) on
  `node --test`.
- **`npm test` now exists**: `node --test src/lib/*.test.js`. The two suites
  were only runnable by naming the files by hand, and `node --test src/lib/`
  fails because it tries to execute `graphql.js` as a test.

### Checked and clean

- `lib/graphql.js`'s error paths: a 401 throws `UnauthorizedError`, which every
  caller turns into `markOut()` — a signed-out console, not a redirect. **There
  is no redirect loop**: nothing navigates on a 401; `loginUrl()` is only
  reached by a deliberate click on the session button.
- The glance modules' null-guards hold with the gateway down. `ModuleGrid`
  gates on `data?.tasks`, `data?.reading?.length > 0` and an explicit
  `data?.fitness != null` plus a field check, so `FitnessModule` and
  `ReadingModule` are never rendered without their object. `GlanceContext`
  leaves `data` at its last good value and sets `error`, and the whole row
  hides rather than half-rendering.
- The Ask opt-in gate is closed on both sides: `handleEnter` returns early on
  `!askEnabled` before any model call, and `shouldDraft()` refuses the draft
  path for the same reason, so `??` and the `>`/`<` fallback both need the
  setting. With it off the `??` dropdown shows the hint and an Open settings
  button.
- The wallpaper sampling's failure path is sound — the probe is a second,
  independent `<img>` with `crossOrigin="anonymous"`, so a CORS refusal fires
  its `onerror` (or `getImageData` throws and is caught) and falls back to
  `--scrim-alpha: 1`, never touching the visible wallpaper.
- `sw.js`: auth endpoints network-only first, `/api/*` and `/graphql`
  network-only next, everything else stale-while-revalidate behind the
  `text/html` guard that refuses to store an SPA-fallback body under an asset
  URL; `install` uses per-URL `cache.add().catch()`; navigation falls back to
  `/offline.html`. Cross-origin responses (`type !== 'basic'`) are never cached,
  so bookgeek covers and picsum wallpapers cannot poison it.

### Left in place, with reasons

- **`TaskRow`'s dot swallows a failed toggle** the same way the command box
  used to. Not fixed here because `TaskRow` has no toast in reach — the toast
  lives inside `CommandBox` — and the visible result is at least honest: the dot
  does not move, because `refetch()` only runs on success. Making it speak means
  lifting `Toast` to a provider, which is a larger change than this pass.
- **`BackgroundManager`'s retry timers are not cleared on unmount.** Both the
  load timeout and the `RETRY_DELAY` retry are guarded by a `cancelled` flag and
  a `settled` flag, so nothing sets state after unmount; what is left is a
  dangling timer and at most one wasted image request. Not worth the churn.
- **`GlanceContext.todayIso()` uses the offset-subtraction trick**
  (`new Date(t - getTimezoneOffset()*60000).toISOString()`). `@geeksuite/utils`
  has `localDateString`, which reads the local calendar fields directly and is
  the suite's preferred form — but startgeek is a standalone npm app with no
  workspace dependencies by design (`TODO_ORDER.md` #5), and the trick is
  *correct*, not merely lucky: the offset is sampled at `t`, so it survives DST.
  Left alone rather than opening a dependency question over a working function.
- **No component test runner.** `SessionContext`, `GlanceContext` and
  `CommandBox`'s own wiring have no pinning test — only the pure modules those
  fixes were factored into do. Adding vitest + jsdom here is a real dependency
  decision (this app is deliberately dependency-light and outside the pnpm
  workspace), so it is **reported, not taken**. It is the single biggest gap in
  this app's verification.

### Docs drift found

The File Map below was missing six files that exist:
`components/CalendarModule.jsx`, `components/AnswerCard.jsx`,
`components/DraftPreview.jsx`, `hooks/useCalendarEvents.js`,
`lib/captureDraft.js` and `lib/csrfHeal.js` — plus the two added today
(`lib/errors.js`, `lib/commandFailure.js`). The Settings section also omitted
`ask` and `calendars`, both of which `SettingsContext` persists. Both corrected
below.

---

---

## Night 2 — 2026-09-06 — the morning brief (stream R118, AI_IDEAS.md #5)

Three short sentences in the hero, once a day after 5 a.m., dismissible, with
nothing to tap in them. Built across two trees: `glanceBrief` on basegeek's
gateway and a `BriefCard` here.

### Built

**Gateway** (`apps/basegeek/packages/api/src/graphql/glance/`)

- `briefService.js` (new) — `briefFacts()` trims a `glanceToday` snapshot to
  counts, task titles, habit streaks, the current book and today's egg count;
  `deterministicBrief()` writes those out as sentences with no model at all;
  `buildBrief()` runs the whole thing through
  `runAIFeature({ app: 'startgeek', feature: 'brief' })` in free-text mode.
- `typeDefs.js` — `glanceBrief(date: String!, localHour: Int!): GlanceBrief!`
  returning `{ date, brief, facts, provenance }`, plus the shared
  `type AIProvenance`.
- `resolvers.js` — the resolver, with zod validation of both arguments.
- Tests: `src/__tests__/glanceBrief.test.js` (24) and
  `glanceBriefResolver.test.js` (10).

**Console** (this app)

- `src/lib/morningBrief.js` + `.test.js` (14 cases) — the pure gates:
  `shouldRequestBrief`, `localDayIso`, the dismissal memory, `provenanceLine`.
- `src/hooks/useMorningBrief.js` — one fetch, no poll, silent on every failure.
- `src/components/BriefCard.jsx` — the card, on the same dark glass as the
  modules.
- `src/App.jsx` — renders it between the hero and the command box.
- `src/config/modules.js`, `src/context/SettingsContext.jsx`,
  `src/components/SettingsSheet.jsx` — the `brief` opt-in, off by default,
  in the same sheet as the `??` Ask switch.
- `src/lib/queries.js` — `GLANCE_BRIEF`.

### Decisions taken on Chef's behalf

- **The opt-in is client-only, and that is a fact about this app, not a
  shortcut.** StartGeek's settings are a localStorage blob with no backend, so
  the gateway cannot read the switch. With it off, the query is simply never
  called. What the server does own on its own authority is the 5 a.m. gate and
  a cap of 3 model calls per user per UTC day.
- **The hour gate is enforced on both sides.** The containers run UTC (Q42), so
  the browser is the only thing on the wire that knows the local hour — it is
  sent as `localHour` and bounded (0-23) rather than trusted. Before 5 the
  resolver returns `brief: null` without loading the snapshot at all.
- **The once-a-day cache is a `Map` in `briefService.js`, keyed
  `userId:YYYY-MM-DD`.** The glance module has no cache to borrow —
  `fetchGlanceToday` re-reads Mongo every call — so the brief brought its own.
  Process-local: a redeploy costs one extra brief, which is the right failure
  direction for a cost ceiling.
- **Only a model answer is cached.** A fallback brief is returned and thrown
  away, so an aiGeek that was down at 05:58 does not lock the deterministic
  line in for the day; the next console load tries again. That is what the
  3/day cap is for, and it is why the cap is 3 rather than 1.
- **No weather sentence.** AI_IDEAS #5 lists weather, but `glanceToday` does
  not carry it — StartGeek reads Open-Meteo directly from the browser. Fetching
  a forecast server-side would put a new outbound dependency in front of the
  console's first paint, for a fact the weather block shows two inches away.
- **Only the "shown" half of the metric is counted.** The resolver logs
  `{ metric: 'startgeek.brief.shown' }` when it produces a brief (once a day
  per user, because of the cache). "Dismissed within five seconds" is a client
  event and this app has **no telemetry of any kind** — no analytics, no event
  endpoint, no logger that leaves the browser. Adding one for a single counter
  was not worth a new outbound path from the start page, so the number Chef
  gets is "days a brief was produced", and dismissal rate is not measured.
- **A tab left open across 5 a.m. does not sprout a brief.** The gates are read
  on mount, not on a clock tick. Opening the start page in the morning is what
  the feature is for.

### Verification

startgeek tests 14 → 28 (`node --test src/lib/*.test.js`), lint 0 warnings /
0 errors before and after (`--max-warnings 0`), `npm run build` clean.
Gateway: 34 new tests, all five glance suites green (95 tests). Harness
`--app startgeek --enforce-a11y --viewports phone`: 8 scenes, **0/0/0**.

The committed harness fixtures seed no `brief` key (so the switch is off) and
stub no `GlanceBrief` op, which means the shipped scenes never render the card
— an unstubbed op answers `{ data: {} }` and the console stays exactly as it
was, which is itself the "silently absent" path working. The card was probed
separately at both phone schemes with the opt-in forced on and the op stubbed:
card renders, axe and tap-target findings 0, page errors 0, dismiss removes it,
and it stays gone across a reload. **A `05-brief` scene in
`tools/mobile-harness/apps/startgeek/` would make that permanent** — left
undone because that tree is outside this stream's file scope.


## Deferred

- Flock module. Data is still returned by the resolver; the frontend query
  no longer asks for it.
- Habits and Notes blocks: removed 2026-09-03 by request. The resolver still
  returns them; `GLANCE_TODAY` no longer requests them.
- Settings sync across browsers (would be a small JSON blob on the basegeek
  user record).
- Whether the Reading block should also consider the `on-reader` shelf
  (currently `reading` only, decided in basegeek's glance resolver).

## Hostname

StartGeek is served at `start.clintgeek.com` (nginx: `/mnt/Media/Docker/nginx/config/sites-available/clintgeek.com_start.conf`, proxied to `192.168.1.17:3000`). Since 2026-09-05 the conventional name `startgeek.clintgeek.com` 301-redirects there, so the suite switcher, old bundles and bookmarks all land. The switcher's roster in `packages/ui/src/navigation/GeekAppSwitcher.jsx` carries the explicit `url` for this app.

## Service worker — SW reinstalls on deploy (2026-09-05, Q54)

`public/sw.js` had the same landmine as flockgeek (115fb03): a constant
`CACHE_NAME` and a static three-URL precache, so a new deploy never
reinstalled the SW and the `"/"` cached on a user's first visit was served
forever. Fixed the same way: `BUILD_ID`/`PRECACHE_ASSETS` placeholders in
`public/sw.js`, stamped into `dist/sw.js` by `swPrecache()` in
`vite.config.js` from the built `assets/*.js`/`*.css` list; `CACHE_NAME` is
now `startgeek-cache-${BUILD_ID}`. Dev (`vite dev`) still serves the source
file untouched — no build step there. See DOCS/PWA_STANDARD.md §1a.
