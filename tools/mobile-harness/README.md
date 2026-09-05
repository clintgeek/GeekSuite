# @geeksuite/mobile-harness

The phone-width screenshot harness and mobile-grammar probe for the suite.
It exists so the rules in [`DOCS/MOBILE_UI_PLAN.md`](../../DOCS/MOBILE_UI_PLAN.md)
§6 — 44px targets, a 12px text floor, no sideways scroll — cannot quietly
rot the next time somebody ships a dense table on a Friday. It also runs
axe-core (WCAG 2 A + AA) on every scene as a fourth, **report-only**
category; see [the a11y pass](#the-a11y-pass-axe-core) below.

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

# Make the axe-core findings count toward the exit code (default: they don't)
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
  unpositioned decorative pseudo, and one with `pointer-events: none`). Add a
  case to the fixture and to the `CASES` list alongside any change to the
  pseudo-box logic in `lib/probe.mjs`.
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

Four categories. The first three are the gate, measured in the live page
(computed styles, not source); the fourth is axe-core and is report-only:

| category | assertion | viewport | gate |
|------|-----------|----------|------|
| `tap-target` | every visible interactive element is ≥ 44×44 | phone only | enforcing |
| `text-floor` | no visible readable string below 12px | all | enforcing |
| `h-scroll` | `document.scrollingElement.scrollWidth === clientWidth` | all | enforcing |
| `a11y` | no axe-core violation at `wcag2a` / `wcag2aa` | all | report-only |

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
`.MuiInputBase-root`, a slider at its rail, a checkbox at its `<label>`. It
skips inline links inside prose, off-canvas drawers, `aria-hidden` subtrees,
and elements that are focusable only because MUI cloned a `tabIndex` onto
them.

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

`--enforce-a11y` makes these count toward the exit code. It is **off in CI**
(`.github/workflows/mobile-harness.yml`), so the three grammar rules are the
gate and a11y is a burn-down list. The flip criterion, per
[`MOBILE_UI_PLAN.md`](../../DOCS/MOBILE_UI_PLAN.md) §2, is **0 open across all
eight apps** — waived findings do not count as open.
### Burn-down (2026-09-05)

**Baseline, the run that started this** — 140 scenes, 8 apps, iPhone 14 dark +
light: 0 grammar violations, 0 page errors, **112 a11y findings**. Per app:
fitnessgeek 29, bujogeek 28, storygeek 28, flockgeek 16, bookgeek 5,
basegeek 2, notegeek 2, startgeek 2.

**After the first burn (Q51)** — same 140 scenes: 0 grammar violations, 0 page
errors, **39 a11y findings**. Three apps are at zero and the two rules that
were two thirds of the list are gone from every app that was worked.

| app | before | after | |
|---|--:|--:|---|
| bujogeek | 28 | **0** | contrast, checkbox names, `Select` labels, `role="img"` |
| storygeek | 28 | **0** | gold overlines, icon-button names, transcript keyboard route |
| flockgeek | 16 | **0** | `Select` labels, form labels, accordion nesting |
| bookgeek | 5 | **4** | the one contrast finding fell out of the suite theme fix |
| fitnessgeek | 29 | 29 | not touched — another pass owned this app that night |
| basegeek | 2 | 2 | not touched — same |
| notegeek | 2 | 2 | not touched |
| startgeek | 2 | 2 | not touched |
| **total** | **112** | **39** | |

What is left, by rule:

| rule | impact | findings | nodes | where it lives |
|---|---|--:|--:|---|
| [`button-name`](https://dequeuniversity.com/rules/axe/4.13/button-name) | critical | 6 | 56 | fitnessgeek 6 |
| [`aria-input-field-name`](https://dequeuniversity.com/rules/axe/4.13/aria-input-field-name) | serious | 6 | 18 | fitnessgeek 2, notegeek 2, basegeek 2 |
| [`aria-progressbar-name`](https://dequeuniversity.com/rules/axe/4.13/aria-progressbar-name) | serious | 6 | 14 | fitnessgeek 6 |
| [`list`](https://dequeuniversity.com/rules/axe/4.13/list) | serious | 6 | 8 | fitnessgeek 4, bookgeek 2 |
| [`color-contrast`](https://dequeuniversity.com/rules/axe/4.13/color-contrast) | serious | 5 | 9 | fitnessgeek 5 |
| [`svg-img-alt`](https://dequeuniversity.com/rules/axe/4.13/svg-img-alt) | serious | 4 | 6 | fitnessgeek 4 |
| [`aria-required-children`](https://dequeuniversity.com/rules/axe/4.13/aria-required-children) | critical | 2 | 2 | bookgeek 2 |
| [`nested-interactive`](https://dequeuniversity.com/rules/axe/4.13/nested-interactive) | serious | 2 | 2 | fitnessgeek 2 |
| [`scrollable-region-focusable`](https://dequeuniversity.com/rules/axe/4.13/scrollable-region-focusable) | serious | 2 | 2 | startgeek 2 |

**The waiver list is still empty.** Nothing in the 73 findings that went away
needed one, and nothing in the 39 that remain looks like a false positive.

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
   bujogeek's task toggle is `Mark "Call the roofer" done`, not `Toggle` — and a
   MUI `Select` wants a real `InputLabel` + `labelId`, not an `aria-label`
   bolted on, wherever the form has room for a visible label.
