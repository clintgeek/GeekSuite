# @geeksuite/mobile-harness

The phone-width screenshot harness and mobile-grammar probe for the suite.
It exists so the rules in [`DOCS/MOBILE_UI_PLAN.md`](../../DOCS/MOBILE_UI_PLAN.md)
§6 — 44px targets, a 12px text floor, no sideways scroll — cannot quietly
rot the next time somebody ships a dense table on a Friday.

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
pnpm --filter @geeksuite/mobile-harness ci
node tools/mobile-harness/ci.mjs --app bookgeek --app flockgeek   # a subset
```

Screenshots land in `out/<label>/<app>/<app>-<scene>-<scheme>[-desktop].png`.
`out/` is gitignored. Exit code is 0 only when every scene is clean.

Apps: `bookgeek fitnessgeek bujogeek notegeek flockgeek storygeek basegeek startgeek`.

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
  contexts.mjs     iPhone 14 dark/light + 1280x900 desktop contexts
  net.mjs          route plumbing: CORS/preflight, session routes, GraphQL stubs
  probe.mjs        the three rules, measured in the page; plus waiver matching
  registry.mjs     the eight apps: build dir, package name, package manager
  serve.mjs        `pnpm --filter <pkg> build` + `vite preview` on a free port
  runner.mjs       walk an app's scenes: navigate, act, screenshot, probe
apps/<app>/
  fixtures.mjs     `routes(ctx, { base, scheme, viewport })` — every API call stubbed
  scenes.mjs       `scenes` (the screens this app shoots) and `waivers`
shoot.mjs          one app
ci.mjs             every app, the gate
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

Three rules, measured in the live page (computed styles, not source):

| rule | assertion | viewport |
|------|-----------|----------|
| `tap-target` | every visible interactive element is ≥ 44×44 | phone only |
| `text-floor` | no visible readable string below 12px | all |
| `h-scroll` | `document.scrollingElement.scrollWidth === clientWidth` | all |

Plus: any uncaught page error fails the run.

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

### Violation shape

Each violation is `{ rule, el, hint, detail }`:

- `el` — the full description: tag, id, up to two non-emotion classes, any
  `data-geek-*` attributes, `aria-label`/`title`, and a text snippet. For
  humans skimming the log.
- `hint` — a short, stable selector for grepping the app's source, ranked by
  durability: `data-testid`/`data-test` → `data-geek-*` → `aria-label` → `id`
  → (last resort) a tag+class path up to three ancestors deep. This is what
  an app-fix pass should key off — it survives a text or copy change that
  would break a match on `el`'s text snippet.
- `detail` — the measured value: `WxH` for `tap-target`, `Npx "text"` for
  `text-floor`, `scrollWidth X > clientWidth Y` for `h-scroll`.

### Waivers

A known, ticketed violation can be parked so it does not hold the gate shut:

```js
export const waivers = [
  { rule: 'text-floor', match: 'MuiTypography-overline', why: 'suite typography call — MOBILE_UI_PLAN §4 basegeek' },
];
```

`match` is a substring or a RegExp tested against the element description;
`scenes` narrows it to named scenes. Waived violations are counted and
reported separately, never hidden. **Every waiver should die when the app is
fixed** — the list is a ratchet, not a parking lot. Starting it empty and
filling it deliberately is the honest way to adopt the gate on an app with
known open items.

### Screenshot diffing (not enabled)

There are no baselines yet, so the probe is the gate and the screenshots are
evidence for a human. When baselines are wanted: commit a blessed
`out/baseline/<app>/` set, compare with `pixelmatch` in `runner.mjs` after the
screenshot step, and fail past a per-scene pixel budget. Do it *after* the
open violations below are burned down — diffing a surface you are about to
change is a full-time job.
