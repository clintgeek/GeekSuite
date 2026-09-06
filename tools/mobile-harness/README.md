# @geeksuite/mobile-harness

The phone-width screenshot harness and mobile-grammar probe for the suite.
It exists so the rules in [`DOCS/MOBILE_UI_PLAN.md`](../../DOCS/MOBILE_UI_PLAN.md)
§6 — 44px targets, a 12px text floor, no sideways scroll — cannot quietly
rot the next time somebody ships a dense table on a Friday. It also runs
axe-core (WCAG 2 A + AA) on every scene as a fourth category, **enforcing in
CI since 2026-09-05**; see [the a11y pass](#the-a11y-pass-axe-core) below.

It is the scratch harness from the M1–M5 passes, cleaned up and made a repo
citizen: one lib, one fixture set per app, one entry point, one CI job.

---

## Running it

```bash
# One app against a server you are already running
pnpm --filter @geeksuite/mobile-harness shoot -- --app bookgeek --base http://localhost:1801 --label wip

# One app, built and served by the harness (what CI does)
node tools/mobile-harness/shoot.mjs --app bujogeek --serve --label wip

# Skip the rebuild when dist/ is already current
node tools/mobile-harness/shoot.mjs --app bujogeek --serve --no-build --label wip

# Add the 1280x900 desktop contexts
node tools/mobile-harness/shoot.mjs --app basegeek --serve --viewports all

# Everything, the way CI runs it
pnpm --filter @geeksuite/mobile-harness run ci
node tools/mobile-harness/ci.mjs --app bookgeek --app flockgeek   # a subset

# Make the axe-core findings count toward the exit code. CI passes this; the
# tool's own default is still report-only, so pass it when you want the gate.
node tools/mobile-harness/ci.mjs --enforce-a11y

# Skip the axe pass entirely (faster; useful when iterating on the grammar rules)
node tools/mobile-harness/ci.mjs --no-a11y

# Unit coverage for the probe itself (no app build needed — static fixtures)
node tools/mobile-harness/selftest.mjs
```

Screenshots land in `out/<label>/<app>/<app>-<scene>-<scheme>[-desktop].png`,
and `ci.mjs` writes `out/<label>/SUMMARY.md` next to them — the run's counts
plus the a11y burn-down table, so the CI artifact carries the numbers and not
just the pixels. `out/` is gitignored. Exit code is 0 only when every scene is
clean of *enforcing* violations (the three grammar rules; a11y only with
`--enforce-a11y`).

Apps: `bookgeek fitnessgeek bujogeek notegeek flockgeek storygeek basegeek startgeek`.

### Testing the probe itself

There is no test runner in this tool, so `selftest.mjs` is a small standalone
script: it loads the static fixtures in `fixtures/` (no build step) through
the same `probePage` the harness uses and asserts on what comes back. Two
suites:

- **tap-target** — `fixtures/tap-target-pseudo.html`, the fixture's
  known-good and known-bad controls, in particular the `::before`/`::after`
  hit-area cases (`.hit44`-style transform-centred, `.dot`-style `inset`, an
  unpositioned decorative pseudo, and one with `pointer-events: none`), plus
  the MUI `<Rating>` sr-only-radio cases: a `for`-linked (not nested) label at
  44×44 (pass), the same pattern at 30×30 (fail), and a `for`-linked label
  that paints zero width (pass — skipped, not a touch target; see "The
  probe" below). Add a case to the fixture and to the `CASES` list alongside
  any change to the pseudo-box or label-lookup logic in `lib/probe.mjs`.
- **a11y** — `fixtures/a11y.html`, a deliberately dull page (black on white,
  16px, 44px controls, `lang` and `<title>` present) with exactly two planted
  violations: an `<img>` with no `alt` (`image-alt`) and a visible `<button>`
  with no accessible name (`button-name`), each sitting next to a clean
  control of the same kind. The assertion is **exactly those two rules and no
  others**, one node each — which is what catches a regression where the
  `runOnly` tags drift or the axe injection quietly stops working, both of
  which an "at least these two" assertion would sail straight past. It also
  proves the `{ rule, selector }` waiver shape moves a finding to waived, and
  that a non-matching selector waives nothing.

### Playwright

The tool pins `playwright` and CI installs the matching Chromium. Locally, if
`pnpm install` is not on the table, set `PLAYWRIGHT_MODULE` to an existing
install and `lib/playwright.mjs` will use it (it already falls back to the
`~/.agents/skills*/playwright` checkout Chef's box carries).

---

## Layout

```
lib/
  playwright.mjs   resolve Playwright (dep → PLAYWRIGHT_MODULE → local checkout)
  a11y.mjs         resolve + inject axe-core; the axe.run options
  contexts.mjs     iPhone 14 dark/light + 1280x900 desktop contexts
  net.mjs          route plumbing: CORS/preflight, session routes, GraphQL stubs
  probe.mjs        the three grammar rules + the a11y pass, measured in the
                   page; plus waiver matching
  registry.mjs     the eight apps: build dir, package name, package manager
  serve.mjs        `pnpm --filter <pkg> build` + `vite preview` on a free port
  runner.mjs       walk an app's scenes: navigate, act, screenshot, probe
apps/<app>/
  fixtures.mjs     `routes(ctx, { base, scheme, viewport })` — every API call stubbed
  scenes.mjs       `scenes` (the screens this app shoots) and `waivers`
fixtures/          static HTML fixtures for testing the probe itself (not an app)
  tap-target-pseudo.html   the ::before/::after hit-area cases
  a11y.html                two planted axe violations + clean controls
shoot.mjs          one app
ci.mjs             every app, the gate; writes out/<label>/SUMMARY.md
selftest.mjs       unit coverage for lib/probe.mjs against fixtures/
```

### Why `vite preview` and not the dev server

bookgeek's dev config hardcodes an absolute basegeek API host, and several
apps' dev servers proxy to backends that do not exist in CI. `vite preview`
serves the built bundle with an SPA fallback and talks to nothing, so the
fixtures are the only source of data — which is the point.

---

## Writing a scene

```js
export const scenes = [
  { name: '01-today', goto: '/today', wait: 1500 },
  {
    name: '02-add-sheet',
    goto: '/today',
    viewports: ['phone'],          // omit to run everywhere
    async setup(page, h) {
      const fab = page.getByRole('button', { name: /^add task$/i }).first();
      if (!(await fab.count())) return false;   // skip, do not fail
      await fab.click();
      await h.settle(700);
    },
    teardown: (page, h) => h.esc(),
  },
];
```

The runner navigates to `base + goto` (`networkidle`), waits `wait` ms
(default 1200), runs `setup`, screenshots, probes, then runs `teardown`.
`h` carries `{ page, base, viewport, scheme, isPhone, settle, esc, log }`.

**Scenes are independent.** Nothing is carried between them, so a scene that
needs a sheet open must open it itself. That costs a navigation and buys a
harness that does not collapse when one interaction changes.

Prefer a deep link over a click when the app offers one (`/aigeek?tab=keys`
beats clicking a tab that only exists after a query resolves).

## Writing fixtures

```js
import { json, sessionRoutes, graphqlRoute } from '../../lib/net.mjs';

export async function routes(ctx) {
  await sessionRoutes(ctx);                 // catch-all + /api/me + auth, in the right order
  await ctx.route('**/api/thing', (r) => json(r, THING));
  await graphqlRoute(ctx, OPS);             // keyed by operation name
}
```

Three things bite, all handled inside `lib/net.mjs` — do not re-roll them:

1. **Playwright matches routes newest-first.** The catch-all must be
   registered *first*, and a broad glob registered *after* a specific one
   swallows it. `/api/auth/**` registered after `/api/auth/profile` is how
   basegeek's admin pages all rendered "admin-only" for an afternoon.
2. **Chromium refuses a wildcard `Access-Control-Allow-Origin` on a
   credentialed request.** Echo the caller's Origin and answer the OPTIONS
   preflight.
3. **Service workers must be blocked** (`serviceWorkers: 'block'`, set in
   `contexts.mjs`) or the app's PWA worker answers from cache and the
   fixtures never see the request.

Fixture data should look like the real thing — bookgeek's titles are Chef's
actual Goodreads export, because a library of "Book One / Book Two" hides the
two-line clamps and long-title truncation this harness is meant to catch.

---

## The probe

Four categories, all four a gate. The first three are measured in the live page
(computed styles, not source) and always count; the fourth is axe-core, which
counts when `--enforce-a11y` is passed — CI passes it:

| category | assertion | viewport | gate |
|------|-----------|----------|------|
| `tap-target` | every visible interactive element is ≥ 44×44 | phone only | enforcing |
| `text-floor` | no visible readable string below 12px | all | enforcing |
| `h-scroll` | `document.scrollingElement.scrollWidth === clientWidth` | all | enforcing |
| `a11y` | no axe-core violation at `wcag2a` / `wcag2aa` | all | enforcing in CI (`--enforce-a11y`) |

Plus: any uncaught page error fails the run.

Every finding carries both a `category` and a `rule`. For the three grammar
rules they are the same string. For `a11y` the category is `a11y` and the
rule is the **axe rule id** (`image-alt`, `color-contrast`, …), which is what
the burn-down groups by.

`tap-target` only runs when the scene is walked at the phone viewport
(`runner.mjs` passes `isPhone: h.isPhone` into `probePage`, which gates the
rule inside `collect(isPhone)` in `lib/probe.mjs`). MOBILE_UI_PLAN §2 makes
44px a rule below `md`, not a universal one — grading a 1280×900 desktop
scene against it is noise, not signal. `text-floor` and `h-scroll` still run
at every viewport, desktop included, because both grammar rules genuinely do
apply everywhere. `ci.mjs` only walks phone viewports by default anyway
(`--desktop` adds the 1280×900 contexts), so this mostly matters for that
flag and for anyone calling `probePage`/`runApp` directly with
`viewports: ALL_VIEWPORTS`.

It measures the *hit area*, not the paint — a form control is measured at its
`.MuiInputBase-root`, a slider at its rail, a checkbox or radio at its
`<label>` — an ancestor one (`<label><input/></label>`) or, when there is
none, a `for`-linked one instead (MUI's `<Rating>` pairs each sr-only radio
with a `<label for={id}>` *sibling*, never nested — `RatingLabel` and the
`<input>` are siblings in a Fragment, `@mui/material/Rating/Rating.js`). If
that label itself paints zero pixels in either axis — MUI's decimal-precision
`<Rating>` (`precision < 1`) collapses every non-selected half-star label to
`width: 0%; overflow: hidden`, and its "clear rating" label wraps only
visually-hidden children — the control is skipped rather than flagged: there
is no rendered area for a finger to find, so it is a keyboard/screen-reader-
only affordance, not a touch target (the visible star at that position is a
*different*, sibling element — the whole-value radio — measured on its own).
It skips inline links inside prose, off-canvas drawers, `aria-hidden`
subtrees, and elements that are focusable only because MUI cloned a
`tabIndex` onto them.

`tap-target` also unions in any absolutely positioned `::before`/`::after`
hit-area pseudo — startgeek's `.hit44` (a centred invisible pseudo behind a
small glyph) and `.dot` (a 9px status dot with a 44px pseudo) are the pattern
this exists for. `getBoundingClientRect` can't see a pseudo-element, so its
box is derived from `getComputedStyle(el, '::before'|'::after')`: it counts
only when the pseudo has real content, is itself `position: absolute|fixed`,
`el` is its containing block (`el`'s own position isn't `static`), and
`pointer-events` on the pseudo isn't `none` (it would never receive the tap).
Size/offsets are read relative to `el`'s own rect — a deliberate
simplification of the true containing block (the padding box), because
Chromium rounds a fractional border-width (`.dot`'s 1.5px ring) to a whole
pixel, which would otherwise shave a couple of px off a hand-tuned inset like
`-17.5px`. Width/height prefers a derived offset pair (`left`+`right`, the
`inset: -Npx` pattern) over the pseudo's own resolved size, falling back to
that resolved size when a transform is present or an offset pair doesn't
resolve (`.hit44`'s `top/left: 50%` + `translate(-50%,-50%)` pattern, where
the size is the authored value, not something to re-derive). A failing
control that still had a pseudo considered says so in its `detail` (e.g.
`30x30 (with ::before 38x38)`), so a fix pass knows the expansion was seen
and still came up short.

### Violation shape

Each violation is `{ rule, category, el, hint, detail }`:

- `el` — the full description: tag, id, up to two non-emotion classes, any
  `data-geek-*` attributes, `aria-label`/`title`, and a text snippet. For
  humans skimming the log.
- `hint` — a short, stable selector for grepping the app's source, ranked by
  durability: `data-testid`/`data-test` → `data-geek-*` → `aria-label` → `id`
  → (last resort) a tag+class path up to three ancestors deep. This is what
  an app-fix pass should key off — it survives a text or copy change that
  would break a match on `el`'s text snippet.
- `detail` — the measured value: `WxH` for `tap-target`, `Npx "text"` for
  `text-floor`, `scrollWidth X > clientWidth Y` for `h-scroll`, and
  `impact · N node(s) · <axe failure summary>` for `a11y`.

An `a11y` finding carries three more fields: `impact` (`critical` |
`serious` | `moderate` | `minor`), `nodes` (how many elements on the page
fail this rule — the finding is per *rule*, not per node, because a page with
40 unlabelled icon buttons is one problem with 40 instances), `helpUrl` (the
Deque rule page), and `targets` (up to five raw axe selectors, so a waiver
can match an instance other than the first).

### Waivers

A known, ticketed violation can be parked so it does not hold the gate shut:

```js
export const waivers = [
  // grammar rule, matched on the element description
  { rule: 'text-floor', match: 'MuiTypography-overline', why: 'suite typography call — MOBILE_UI_PLAN §4 basegeek' },

  // a11y finding, matched on the axe rule id + a selector
  { rule: 'color-contrast', selector: '[data-geek-hero]', why: 'brand lockup, contrast ratchet exception — TICKET-123' },

  // the whole a11y category on one scene, while a third-party embed is in play
  { category: 'a11y', scenes: ['05-embed'], why: 'vendor iframe we do not control' },
];
```

The fields are `{ rule?, category?, match?, selector?, scenes?, why }`. Every
field present has to match — they AND together — and at least one of
`rule`/`category`/`match`/`selector` must be there, so a waiver that only
names `scenes` cannot silently swallow a whole scene.

| field | matches against |
|---|---|
| `rule` | exact: a grammar rule name (`text-floor`) or an **axe rule id** (`image-alt`) |
| `category` | exact: `tap-target` \| `text-floor` \| `h-scroll` \| `a11y` |
| `match` | substring or RegExp against `"<el description> <detail>"` |
| `selector` | substring or RegExp against `hint` + the a11y `targets` |
| `scenes` | narrows the waiver to the named scenes |

`{ rule, selector, why }` is the a11y shape: the axe rule id plus the element
it fires on. Waived violations are counted and reported separately, never
hidden. **Every waiver should die when the app is fixed** — the list is a
ratchet, not a parking lot. Starting it empty and filling it deliberately is
the honest way to adopt the gate on an app with known open items.

### Screenshot diffing (not enabled)

There are no baselines yet, so the probe is the gate and the screenshots are
evidence for a human. When baselines are wanted: commit a blessed
`out/baseline/<app>/` set, compare with `pixelmatch` in `runner.mjs` after the
screenshot step, and fail past a per-scene pixel budget. Do it *after* the
open violations below are burned down — diffing a surface you are about to
change is a full-time job.

---

## The a11y pass (axe-core)

The harness injects [axe-core](https://github.com/dequelabs/axe-core) (pinned
exact in `package.json`, a devDependency of this tool only) into every scene
after its `ready`/`setup` step and runs:

```js
axe.run(document, {
  runOnly: ['wcag2a', 'wcag2aa'],   // the standard, not the best-practice opinions
  resultTypes: ['violations'],      // passes and incompletes are not the job
  rules: { 'color-contrast': { enabled: true } },
})
```

Three deliberate choices:

- **`wcag2a` + `wcag2aa` only.** The `best-practice` tag is a set of opinions.
  A gate that reports opinions gets ignored, and then so does the gate.
- **`color-contrast` stays ON.** `packages/ui` carries its own contrast
  ratchet, so where axe and the ratchet disagree that is a finding worth
  reading, not noise worth muting. (It is also, unsurprisingly, the largest
  bucket below.)
- **One finding per rule per scene, not per node.** A screen with ten
  unlabelled icon buttons is one `button-name` problem with ten instances; the
  instance count rides along in `nodes`. Findings are counted per scene *and*
  per colour scheme, so a screen broken in both dark and light contributes two
  — which is right for contrast, where the two schemes genuinely are two
  different bugs.

`--enforce-a11y` makes these count toward the exit code, and **CI passes it**
(`.github/workflows/mobile-harness.yml`, flipped 2026-09-05) — a11y is a gate
now, like the other three. The flip criterion per
[`MOBILE_UI_PLAN.md`](../../DOCS/MOBILE_UI_PLAN.md) §2 was 0 open across all
eight apps, and the full run reached it the same day it was set. The tool's own
default is unchanged: `shoot.mjs`/`ci.mjs` still report a11y without failing
unless you ask, so an exploratory local run is not a wall. **Add the flag when
you are checking your work** — a scene you break locally will otherwise only
speak up in CI.
### Burn-down (2026-09-05) — closed

**Baseline, the run that started this** — 140 scenes, 8 apps, iPhone 14 dark +
light: 0 grammar violations, 0 page errors, **112 a11y findings**. Per app:
fitnessgeek 29, bujogeek 28, storygeek 28, flockgeek 16, bookgeek 5,
basegeek 2, notegeek 2, startgeek 2.

**After the first burn (Q51)** — 0 grammar violations, 0 page errors,
**39 a11y findings**. bujogeek, storygeek and flockgeek at zero.

**After the second burn (Q51, second half)** — 138 scenes walked (basegeek's
two `/databases` scenes skip cleanly; the route is orphaned), 8 apps, both
schemes: **0 grammar violations, 0 page errors, 0 a11y findings, 0 waived.**
`.github/workflows/mobile-harness.yml` now passes `--enforce-a11y`, so the
category is a gate. **The waiver list is empty in every app** — 112 findings
came and went and not one of them was a false positive.

| app | baseline | first burn | second burn | |
|---|--:|--:|--:|---|
| fitnessgeek | 29 | 29 | **0** | progress-bar names, 24 delete buttons named after their row, list markup, chart names, three tinted-surface contrasts |
| bujogeek | 28 | **0** | 0 | contrast, checkbox names, `Select` labels, `role="img"` |
| storygeek | 28 | **0** | 0 | gold overlines, icon-button names, transcript keyboard route |
| flockgeek | 16 | **0** | 0 | `Select` labels, form labels, accordion nesting |
| bookgeek | 5 | 4 | **0** | both fixes upstream in `packages/ui` — sidebar rows, account menu |
| basegeek | 2 | 2 | **0** | six `AccountPage` `Select`s wired `InputLabel id` ↔ `labelId` |
| notegeek | 2 | 2 | **0** | the TipTap surface named through `editorProps.attributes` |
| startgeek | 2 | 2 | **0** | the forecast strip is a focusable, named scroll region |
| **total** | **112** | **39** | **0** | |

The rules that made up the list, worst first, and where they came from:
`color-contrast` (45 — every one a call site, never a token),
`button-name` (24), `aria-input-field-name` (24), `list` (6),
`aria-progressbar-name` (6), `svg-img-alt` (4), `aria-required-children` (2),
`nested-interactive` (2), `scrollable-region-focusable` (2).

### What the burn taught, for the next app

1. **`color-contrast` was never a token problem.** The suite's contrast ratchet
   (`packages/ui/src/__tests__/themeContrast.test.js`) was green through all 40
   findings, because it measured `text.muted` on `background.paper` while the
   apps were painting `colors.ink[300]` — a *border* tone — as body copy, or
   diluting a domain hue with `alpha()` until it composited to 2.4:1. The fixes
   were at the call sites, plus one new shared helper:
   `readableOn(ink, surface, { min })` in `@geeksuite/ui` composites, measures,
   and walks the ink away from the surface until it clears the floor, returning
   it untouched when it already does. Its older sibling `toneForMode` nudges by
   a fixed amount and cannot know what surface the text lands on; that is what
   produced half of this list. The ratchet now sweeps **every** surface the
   palette declares, not just the canvas and the cards.
2. **Two shared-component fixes cleared findings in apps nobody edited.**
   `GeekDialog`'s scrolling body got `tabIndex={0}` (storygeek's Bookify summary
   had no keyboard route in), and the theme now runs the accent through
   `readableOn` for a focused `MuiFormLabel` — the suite blue measured 3.12:1 as
   a label on bujogeek's dark paper and 4.17:1 on the suite's own light canvas.
   `GeekFab` now throws in development when `label` is missing, so the next
   nameless FAB fails at the call site instead of in a nightly run.
3. **`button-name` and `aria-input-field-name` are mechanical but not
   thoughtless.** A name has to say *which* thing the control acts on —
   bujogeek's task toggle is `Mark "Call the roofer" done`, not `Toggle`;
   fitnessgeek's weight-log delete is `Delete the 218.7 lbs entry from Sep 3`,
   because 24 buttons called "Delete" on one screen is not a name. A MUI
   `Select` wants a real `InputLabel` + `labelId`, not an `aria-label` bolted
   on, wherever the form has room for a visible label.
4. **Two more shared fixes closed a whole app.** bookgeek's four findings were
   both in `packages/ui`: `GeekSidebar` wraps each row's `ListItemButton` in a
   `<ListItem disablePadding>` (a bare one renders `div[role=button]` — or an
   `<a>` — straight into the `<ul>`), and `GeekTopBar`'s account identity moved
   into the menu list's `subheader` slot, because MUI's `MenuList` clones
   `tabIndex: 0` onto its first non-disabled child and a focusable `div` inside
   `role="menu"` is `aria-required-children`. Check upstream before editing an
   app: the chrome is shared.
5. **`list` is about markup, and MUI's escape hatches do not all work.**
   `<Divider component="li">` still fails — MUI adds `role="separator"` the
   moment `component` is not `hr`, and axe reads the role. Paint the rule as a
   `borderBottom` on the row instead. A `<ListItem component="button">` is a
   `<button>` child of a `<ul>`; use `<ListItem><ListItemButton>`.
6. **Chart libraries disagree about how to be named.** `@nivo/line` forwards
   both `role` and `ariaLabel` to its `<svg>`; **`@nivo/pie` forwards only
   `role`**, so name the wrapper (`role="img"` + `aria-label`) and pass the
   chart `role="presentation"`. Recharts renders a `<title>` element
   unconditionally, so a chart with no `title` prop has an *empty* accessible
   name — always pass `title` (and `desc`).
7. **`readableOn` learned `under`.** A translucent *surface* is not a colour
   either: `alpha(text.secondary, 0.12)` on a chip composites to `#383433` over
   dark paper and `#EFEEED` over white, and the same ink fails differently on
   each (2.56:1 and 4.14:1). Pass the paper as `under` — without it the surface
   is composited over white, which is a guess.

---

## Night 2 (2026-09-06) — the five AI surfaces, and a page-scoped fixture pattern

Five features shipped behind their own opt-in, off by default (`DOCS/AI_IDEAS.md`,
stream R126). Each got exactly one new scene (bookgeek got two), appended to
the **end** of its app's `scenes` array:

| App | Scene | Opt-in | Stubs |
|---|---|---|---|
| bujogeek | `11-review-draft` | `appPreferences.bujogeek.aiReviewDraft` (server) | `GetReviewDraft` |
| fitnessgeek | `11-quickadd-proposal` | `ai.features.natural_language_food_logging` (server; `localStorage['fitnessgeek:quickAddNL']` at ship time, corrected R129 — see below) | `ParseFoodEntry`, `GET /api/foods` |
| notegeek | `05-suggestions` | `appPreferences.notegeek.suggestOnSave` (server) | `SuggestForNote` |
| bookgeek | `07-what-next`, `08-edit-metadata-draft` | `appPreferences.bookgeek.libraryAssistant` (server) | `GetWhatNext`, `DraftBookMetadata` |
| startgeek | `05-brief` | `localStorage['startgeek.settings'].brief` (client) | `GlanceBrief` |

**Why these are wired differently from every scene above them.** Every other
scene's data comes from `fixtures.mjs`'s `routes(ctx, …)`, which runs once per
browser **context** and so applies uniformly to every scene that context
walks. That is exactly wrong for an opt-in feature: several of these apps
already have an existing scene that visits the same route the new feature
lives on (bookgeek's Library `/`, notegeek's `/notes/n1/edit`), and turning
the preference on at the context level would make the feature render — real
or stubbed — in scenes that were never designed or verified with it on.

The fix used throughout: register the preference and the extra query stub
inside the new scene's own `setup(page, h)`, on `page.route()`/
`page.addInitScript()` rather than `ctx.route()`/`ctx.addInitScript()`.
Playwright gives page-level handlers priority over context-level ones for a
matching request, and a page-level init script only ever runs on a
navigation registered *after* it — so a scene can safely flip a switch that
would otherwise be global, at the cost of one rule: **the scene doing this
must own its navigation** (skip the top-level `goto` and call `page.goto()`
itself, after registering the overrides) **and must stay the last scene in
the file**, since neither an init script nor an added route can be
un-registered once a later scene's navigation would otherwise need the
original, unmodified fixture. bookgeek's two new scenes are the one
exception that proves the rule: each re-registers its own complete route set
fresh (the newest matching `page.route()` registration wins), so neither
depends on the other's state — but they are still both at the tail.

The clock needs the same treatment when a feature gates on the time of day.
startgeek's `05-brief` scene uses Playwright's `page.clock.setFixedTime(...)`
(pinned `playwright` version 1.58.2) rather than context-wide, so the other
four scenes' rendering is untouched and the brief's server-side 5 a.m. gate
reads true regardless of when the harness actually runs.

**A real bug, found here and fixed the same afternoon (`9ed7f18` — the query now selects `book { id title authors shelf owned readingProgress }`).** As found: bookgeek's
`GET_WHAT_NEXT` query (`apps/bookgeek/web/src/graphql/queries.js`) selects
only `{ bookId why }` on each pick — never `book { ... }` — even though the
gateway's `WhatNextPick.book` field exists and is populated
(`apps/basegeek/packages/api/src/graphql/bookgeek/typeDefs.js:186-190`,
and `apps/bookgeek/DOCS/CONTEXT.md`'s Night 2 section documents `book` as a
deliberate part of the contract). `App.jsx`'s `.filter((p) => p?.book)`
(~line 375) then discards every pick against a real server response, so the
shelf can never render in production, switch on or not. `fixtures.mjs`'s
`WHAT_NEXT_PICKS` attaches `book` to each pick anyway — broader than what the
shipped query can ever receive — specifically so `WhatNextShelf` itself (and
its a11y) could still be exercised here; this is not a fix and this tree does
not own `apps/bookgeek/web/**`. See the harness run report for the same note.

### R129 — the MUI `<Rating>` probe gap, and a fitnessgeek fixture-scoping bug

Two follow-ups from the Night 2 pass above.

**The probe gap.** `08-edit-metadata-draft`'s waiver (bookgeek's
`EditMetadataDialog.jsx` `<Rating precision={0.5} sx={{ fontSize: 44 }}>`)
was carrying a real probe blind spot, not just an unfixed app bug — the
stars themselves have been 44px since `9ed7f18`. `lib/probe.mjs`'s tap-target
rule now looks up a `for`-linked label (`document.querySelector('label[for="…"]')`,
`CSS.escape`d) when `el.closest('label')` finds nothing, since MUI's
`RatingLabel` and its sr-only radio are siblings in a `Fragment`, never
nested — the existing ancestor-label special case (the one checkboxes
already used) never matched them. That alone wasn't quite enough: with
`precision < 1`, MUI's own decimal branch (`Rating.js` line ~482) collapses
every half-star's label to `width: 0%; overflow: hidden` unless it is the
exact current value, and its "clear rating" label wraps nothing but
visually-hidden children — both paint zero pixels. A zero-area label means
there is no rendered region for a finger to find (the *visible* star at that
position is a different, sibling element — the whole-value radio — which
now passes on its own), so the rule skips the control instead of flagging a
hit area that was never painted. Three new `selftest.mjs` cases cover it
(`for`-linked pass, `for`-linked too-small fail, `for`-linked zero-area
skip). The `08-edit-metadata-draft` waiver in `apps/bookgeek/scenes.mjs` is
gone; bookgeek runs 0/0/0 (16 scenes) without it.

**The fixture-scoping bug.** `apps/fitnessgeek/fixtures.mjs` had
`ai.features.natural_language_food_logging: true` in its context-wide
`SETTINGS`, so every scene rendered the "Describe a meal" entry point
(R115's opt-in went server-side in R124 — see
`apps/fitnessgeek/frontend/src/utils/quickAddPreference.js` — so this is now
the feature switch, not a decoration). Flipped the fixture default to
`false` and moved the `true` into scene `11-quickadd-proposal`'s own
page-scoped `GetFitnessUserSettings` stub, same pattern as bookgeek's
`07-what-next`/`08-edit-metadata-draft`. Also dropped that scene's
`page.addInitScript()` seed of the legacy `fitnessgeek:quickAddNL`
localStorage key — R124 moved the opt-in server-side, so the key now only
drives a one-time migration (`migrateLegacyQuickAddOptIn`), and seeding it
just risked exercising that migration path instead of the feature itself.
Confirmed via screenshot: scene `02-log` shows only Copy Meal/Household
(no AI entry point); scene `11-quickadd-proposal` still renders and
completes the full proposal flow. fitnessgeek runs 0/0/0 (22 scenes).

Also dropped a dead `GetFolders: { folders: [] }` stub from
`apps/notegeek/fixtures.mjs` — the gateway's `Folder` type, resolvers and
model were removed in `ceb4ae2`, and no scene has queried it since. notegeek
runs 0/0/0 (10 scenes).
