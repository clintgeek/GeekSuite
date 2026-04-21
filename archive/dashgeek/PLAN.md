# dashgeek Redesign — April 2026 — "Ledger"

Branch: `dashgeek-redesign` (off `notegeek-pass`'s final state so we
inherit every recent suite improvement: build.sh preflight, startgeek
consolidation pattern, Ink Studio tokens to reference from, updated
README / DEFERRED_WORK / SUITE_TODO).

## Why redesign

The audit found dashgeek is **not actually a stub** — it has a working
dashboard with six live widgets, cross-domain search, and a weekly
digest page. The aesthetic ("Editorial Private Terminal" — Fraunces
serif + brass/oxblood/patina) is genuinely polished.

The problem is **role confusion, not execution**. A dashboard's job is
comprehension at a glance — "what needs my attention right now?" The
current design's editorial register (Fraunces headlines, pull quotes,
"Issue №109," greeting paragraphs) tells the user to *read slowly*.
That's the opposite of what a control surface wants.

There's also real overlap with **bujogeek's "Analog Soul"** direction
(warm parchment + Fraunces + editorial voice). The suite can't have
two apps in that register.

## Direction — "Ledger"

A data-forward control surface for someone using the whole suite.
Quiet chrome, expressive data. The dashboard itself stays neutral so
the signal — numbers, activity, domain identity — can carry color.

**One-line pitch:** *Bloomberg-terminal clarity wearing the suite's
warm-neutral restraint — every number in mono, every card tagged
with its domain color, zero visual noise between you and the next
decision.*

**What stays:**
- The six-widget dashboard grid (Bujo / Notes / Books / Nutrition /
  Weight / Flock) — the structural concept is right.
- `EditorialCard` as the reusable widget chassis — rename to
  `LedgerCard` and adjust the signature, but keep the abstraction.
- `CountUp` for number transitions — dashboards need ticking counters.
- Cross-domain `dashSearch` (already fully implemented server-side).
- Weekly digest page — but rename route from `/ai` to `/digest` (the
  current double-route is confusing).

**What goes:**
- Fraunces (too editorial for a control surface; bujogeek owns that).
- Instrument Serif italic (same).
- The "Issue №N / Good morning / Your six departments report in"
  masthead copy — replaced with compact status line.
- Right-rail pull quote from "The Sage Laws" — ornamental.
- The `AI.jsx` misnomer (route `/ai` is actually the digest page).
- Dead imports: `bootstrapUser.js`, the `@geeksuite/ui` and
  `@geeksuite/user` devDeps that nothing consumes.

**What's new:**
- Domain-color left-border system on every data-bearing surface.
  Each of the five apps gets its own signature color (below).
- Restrained primary accent — quiet ink-slate for focus rings and
  hover states. The dashboard itself doesn't "own" an accent color;
  it orchestrates five.
- All metadata, counts, timestamps, and metrics in JetBrains Mono
  (same move as notegeek's caption treatment). Labels stay in Geist.
- A compact status line at the top replacing the editorial masthead:
  date + mini-summary (e.g., `MON · APR 21 · 3 tasks due · 4 new notes
  this week · no eggs logged today`).

---

## Design tokens (authoritative — agents read these)

### Palette — Light

```
// Surfaces
background.default   #F9F8F6    // warm off-white, stone undertone
background.paper     #FFFFFF    // card surface
background.elevated  #FDFCFA    // hover / popover

// Text
text.primary    #1F1C16   // warm near-black
text.secondary  #6B6258   // muted brown
text.disabled   #A8A09A   // warm gray

// Chrome
divider     #E5DDD0    // hairline rule
border      #D8D0BD    // 1px component border

// Primary — quiet ink-slate. NOT a bright accent. Chrome, focus,
// active states. The dashboard is restrained; data carries color.
primary.main         #2D3138    // ink-slate
primary.light        #5A6070
primary.dark         #181B20
primary.contrastText #F9F8F6

// Focus / hover rings
glow.ring    rgba(45, 49, 56, 0.18)
glow.soft    rgba(45, 49, 56, 0.04)
glow.medium  rgba(45, 49, 56, 0.08)

// Semantic — muted, confident, not alarmist
success  #5B7A4A   // moss
warning  #A8782F   // ochre
error    #8B2C2A   // oxblood (shared with notegeek for error semantics)
info     #3D6B7A   // muted teal
```

### Palette — Dark

```
background.default   #16140F    // warm black (matches notegeek)
background.paper     #1F1C16
background.elevated  #27231A

text.primary    #EDE6D6
text.secondary  #998F80
text.disabled   #5C544A

divider   #2D2A24
border    #3A352D

primary.main         #C8CDD4    // lifted ink-slate
primary.light        #E4E7EB
primary.dark         #9AA0A8
primary.contrastText #16140F

glow.ring    rgba(200, 205, 212, 0.22)
glow.soft    rgba(200, 205, 212, 0.06)
glow.medium  rgba(200, 205, 212, 0.12)

success  #7DA869
warning  #D4A05A
error    #C97570
info     #7AA4B0
```

### Domain colors

One color per app, each with provenance from the source app so users
see continuity when clicking through. The five are visually distinct
(red / blue / gold / teal / green) and intentionally don't share a
hue family.

```
// LIGHT MODE
domains.notegeek     #8B2C2A    // oxblood (notegeek's primary)
domains.bujogeek     #6098CC    // GeekSuite blue (bujogeek's primary)
domains.bookgeek     #8C7240    // warm gold-brown (bookgeek family)
domains.fitnessgeek  #0D9488    // teal (fitnessgeek's primary)
domains.flockgeek    #3D6B4F    // forest green (flockgeek's secondary
                                //   — avoids amber-vs-bookgeek conflict)

// DARK MODE (lifted for contrast)
domains.notegeek     #C97570
domains.bujogeek     #9FC9E9
domains.bookgeek     #D4A066
domains.fitnessgeek  #2DD4BF
domains.flockgeek    #6B9A7D
```

Use these as:
- 3px left-border on every card/row whose content originates from
  that app
- Small color dot (6px) prefix on activity-feed rows
- Text color for domain labels in the status line
- Fill color for mini-sparklines in widget headers

Never as card backgrounds (competes with data). Never as text color
for primary content (readability). Accent-border role only.

### Typography

```
font-family (sans, display + body):
  "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif

font-family (mono):
  "JetBrains Mono", "Geist Mono", ui-monospace, monospace
```

Same pair as notegeek and basegeek. Suite continuity.

**Scale:**
```
h1   Geist 700  2rem      letter-spacing -0.025em
h2   Geist 700  1.5rem    letter-spacing -0.02em
h3   Geist 600  1.125rem  letter-spacing -0.01em
h4   Geist 600  0.9375rem
h5   Geist 500  0.875rem

// h6 = mono caps section header — used for widget titles, panel
// headings, "DEPT" labels. Matches notegeek's h6 pattern.
h6   Mono 600   0.6875rem letter-spacing 0.10em UPPERCASE

subtitle1  Geist 500  0.875rem
subtitle2  Mono 600   0.6875rem  letter-spacing 0.06em UPPERCASE
body1      Geist 400  0.9375rem  line-height 1.6
body2      Geist 400  0.8125rem

// Numbers, timestamps, counts, percentages. Every metric uses
// caption. This is the single strongest typographic rule in the
// design. Lean into it.
caption    Mono 500   0.75rem

overline   Mono 600   0.6875rem  letter-spacing 0.10em UPPERCASE
button     Geist 600  0.8125rem
```

**Dashboard-specific numeric treatment** (new vs. notegeek's rules):
Big metric numbers on cards (the "8,542" in `Steps: 8,542`) use
`Typography variant="h3"` with `fontFamily: monoStack` applied via
sx. This is the only place big-mono is used — it's how the dashboard
earns its "instrument panel" feel.

### Radius + depth

- `shape.borderRadius: 8` (default)
- Cards: 10px (one step up — widgets feel like tiles)
- Buttons / inputs: 6px
- Chips / pills: 4px (ink-stamp — matches notegeek)
- Shadows: near-zero. Rely on the domain-color left-border + 1px
  hairline for card definition. Hover can lift +1 step; not more.

---

## Component / page plan

### Theme foundation (I do this myself)

- Rewrite `frontend/src/theme/theme.js` (or `createAppTheme.js`) per
  the tokens above. Drop all Fraunces / Instrument Serif references.
  Drop brass / oxblood-as-primary / patina palette. Retain the
  suite-standard `ink`, `surfaces`, `glow`, `border`, `domains`
  custom tokens.
- Update `frontend/src/index.css` — remove Fraunces / Instrument
  Serif font loading. Keep JetBrains Mono. Add Geist via the
  suite-standard CDN (match basegeek / notegeek preboot). Baseline
  `:root` background + text colors matching theme surfaces so preboot
  paints right.
- Update `frontend/index.html` — swap `<link>` fonts, add preboot
  baseline `<style>` block.
- Confirm `themePreboot()` from `@geeksuite/user/vite` is in
  `frontend/vite.config.js`; add if missing. Light/dark toggle
  already goes through `@geeksuite/user` (confirmed by audit).

### Components (Agent A)

Scope: `frontend/src/components/`.

- `EditorialCard.jsx` → rename to `LedgerCard.jsx`. Signature changes:
  - New prop: `domain` (one of `'notegeek' | 'bujogeek' | 'bookgeek'
    | 'fitnessgeek' | 'flockgeek'` or undefined). Drives a 3px
    left-border in that domain's color.
  - Remove the "index number" and "dept label" decorative chrome.
    Replace with a tighter header: `<h6>` section title (mono caps)
    + tiny sparkline slot (prop `trend`) + optional action chip
    (prop `action` — a mono pill like `+4 this week`).
  - Card surface is plain `background.paper` with 1px `border` on
    all sides + 3px domain-color left-border overlay.
  - Padding: generous for desktop (20px), compact for mobile (14px).
  - Update every call site in the widgets to pass `domain="..."`.
- `Brand.jsx` — restyle. Wordmark `DASHGEEK` in Geist caps with
  0.12em letterspacing (matches the notegeek wordmark move).
  Delete the live clock ticker if it takes too much space — a
  dashboard already has dates on every row. Or keep it as a tiny
  mono caption in the top-right. Nav: `DASH / SEARCH / DIGEST`
  (rename "Telegram"), mono caps. Logout button stays.
- `CountUp.jsx` — keep. No changes; just confirm it works with the
  new typography scale.
- New component: `StatusLine.jsx` — a single-line compact header
  that replaces the editorial masthead. Renders today's date (mono
  caps) + 3–5 inline pills showing per-domain summary
  (e.g., `BUJO · 3 due`, `NOTES · +4`, `FLOCK · 0 eggs`). Each pill
  gets its domain-color dot prefix. Clicking a pill deep-links into
  the relevant widget or app.
- New component: `Sparkline.jsx` — tiny SVG, 48×16, domain-colored
  line, last-7-days data. Used in widget headers + status line.
  Keep it cheap — no axes, no labels, just the shape. (There's
  already a 14-day SVG chart in `WeightWidget.jsx` — factor the
  primitive out.)

### Widgets (Agent B, in same pass as Agent A — they share nothing
structural)

Scope: `frontend/src/components/widgets/`.

For each of the six widgets (BujoWidget, NotesWidget, BooksWidget,
NutritionWidget, WeightWidget, FlockWidget):
- Wrap in `<LedgerCard domain="<name>" trend={sparkline} action={...}>`.
- Remove any Fraunces / serif typography; use Geist h3/h4 for
  section titles, caption (mono) for metadata, h3-mono for big
  headline numbers.
- Remove any editorial voice copy (e.g., "Desk is quiet. Department
  unreachable." → "no data yet"). Calm, flat, data-first.
- Standardize empty states: one sentence + a mono CTA link
  ("log weight →", "add a task →"). Each CTA deep-links to the
  source app.
- Keep the graphql query exactly as-is. No data-layer work in this
  pass.

Specific per-widget moves:
- `BujoWidget`: show `completed / total` as big mono numbers,
  completion % as a tiny horizontal progress bar (not a donut),
  upcoming events as a compact mono list (time in mono, title in
  body1).
- `NotesWidget`: title + timestamp (mono) + tags (mono chips, 4px
  radius, hairline border). Row hover → glow.soft bg.
- `BooksWidget`: current book = hero row (cover + title + page
  progress bar, page count in mono); other in-progress books as
  compact rows.
- `NutritionWidget`: calories big (h3-mono), macros (P/C/F) as a
  3-up mini table with mono numbers. Progress toward goal as a
  single horizontal ration bar, NOT a donut.
- `WeightWidget`: latest weight big (h3-mono), 14-day sparkline
  (the existing implementation — factor it into the shared
  `Sparkline` primitive), change-from-first in mono with
  up/down arrow glyph in the semantic color.
- `FlockWidget`: birds / eggs-today / pairings / hatches as a
  2×2 mini-table with mono numbers, hairline internal rules.

### Pages (Agent C)

Scope: `frontend/src/pages/`.

- `Dashboard.jsx` — remove "Issue №N" masthead, greeting, editorial
  preamble, right-rail pull quote, footer colophon. Replace with
  compact `<StatusLine />` at top, then the six-widget grid below,
  then a small `<Colophon />` footer (mono caption — "v1.0 · built
  from GeekSuite gateway").
- `Search.jsx` — keep the huge search-input-as-headline move, but
  tighten: drop the "§ II · Search" masthead (too editorial), drop
  the serif italic "Look something up" copy. Replace with a simple
  mono placeholder in a large borderless input. Channel tabs
  (All / Bujo / Notes / Books / Fitness / Flock) become 4px-corner
  mono pills, each with its domain color dot prefix; active state
  uses the domain color as a left-border on the results panel. No
  other visual change to the results grid — it's already data-
  driven and fine.
- `AI.jsx` — **rename the file to `Digest.jsx`** and update imports.
  Strip the "§ III · Telegram" masthead + italic display copy.
  Replace with a compact `<StatusLine />` (week-start / week-end
  mono) and the five stat columns restyled as `<LedgerCard
  domain="...">` each. Each stat value in big mono; labels in Geist
  caption. If `aiSummary` is null (which it is — stubbed in
  basegeek), show nothing for it; don't display a stub block. Add
  a short mono caption at the bottom: `weekly snapshot · compiled
  from gateway summaries`.
- `App.jsx` — fix route confusion: map `/ai` → 301 redirect to
  `/digest`, real route is `/digest`. Brand nav label updates to
  "DIGEST".
- `Login.jsx` — not audited. If it exists and uses the old theme,
  apply the same token swap. If it just imports from `@geeksuite/auth`
  and renders GeekLogin, leave alone.

### Cleanup (anyone — bundle into whichever agent)

- Delete `frontend/src/bootstrapUser.js` (vestigial, zero imports).
- Remove `@geeksuite/ui` and `@geeksuite/user` from
  `frontend/package.json` deps — audit confirmed zero imports.
- Remove the `/ai` route reference in `App.jsx` routing and in
  `Brand.jsx` nav.

### Consolidation + deploy (Phase 1-ish — I do this before agents)

- Copy `/mnt/Media/Docker/dashgeek/.env.production` to
  `apps/dashgeek/.env.production`. Audit confirmed deploy dir has
  only `docker-compose.yml` + `.env`; the env is the only thing to
  migrate.
- Diff the two composes. Current source compose already works for
  `./build.sh dashgeek`. The audit said deploy dir has "a minimal
  docker-compose.yml" — if the source compose differs meaningfully,
  reconcile.
- `dashgeek` is already in `build.sh`'s `APPS` array (line 23).
  Good — no script edit needed.
- After everything else lands, `./build.sh dashgeek` from repo root,
  confirm container boots, archive `/mnt/Media/Docker/dashgeek/`.

---

## Data layer — explicitly deferred

All 8 `dash*` GraphQL queries already exist and work:
`dashBujoSummary`, `dashRecentNotes`, `dashBookProgress`,
`dashNutritionSummary`, `dashWeightTrend`, `dashFlockStatus`,
`dashSearch`, `dashWeeklyDigest`.

The GraphQL audit identified high-value missing queries that would
power better widgets:
- `dashboardOverview` — a single aggregate query instead of 6
  separate calls on home-page load (perf win).
- `dashTimelineRecentActivity` — a cross-domain activity feed (would
  be a great signature feature for the stacked timeline spine the
  design audit proposed).
- `recentNotes` / `searchTasks` / `tasksCompletedThisWeek` /
  `eggProductionSummary` etc.

**Not in scope for this pass.** Adding gateway resolvers is its own
work and would distract from the redesign. Note these in
`DOCS/DEFERRED_WORK.md` under a new `dashgeek follow-ups` section so
they're visible for a future polish pass.

The **`aiSummary` stub in `dashWeeklyDigest`** — also deferred. The
digest page simply won't render the summary block when the field is
null. When/if the basegeek resolver is implemented, the page will
pick it up automatically. No frontend work needed to prepare.

---

## Execution order

1. **Me** — consolidation (env migrate), theme foundation
   (createAppTheme rewrite, index.html fonts, index.css), PLAN.md
   commit.
2. **Agent A (parallel)** — components: `LedgerCard`, `Brand`,
   `StatusLine`, `Sparkline`. Dead-code cleanup (bootstrapUser,
   unused deps).
3. **Agent B (parallel with A)** — widgets: restyle all six. Same
   scope, disjoint files. Uses LedgerCard once A commits.
4. **Agent C (after A + B)** — pages: Dashboard, Search, Digest.
   Depends on the new primitives.

A and B can't actually parallelize — B needs LedgerCard. Serialize
A → B+C.

Realistic: me + Agent A + Agent B + Agent C sequenced. Agent B and
Agent C can overlap because they touch different files.

## Verification

After everything lands:
- `cd apps/dashgeek/frontend && npx vite build` — must succeed.
- `./build.sh dashgeek` — image builds and container starts on port
  4090.
- Visual: log in, see the new StatusLine at the top instead of the
  editorial masthead; six cards each with a domain-color left-border
  stripe; all numbers visibly mono; dark mode works without glaring
  contrast mismatches; search page has the channel-pill row in the
  new treatment; `/ai` 301s to `/digest`.
- Grep dashgeek for any remaining `Fraunces` / `Instrument Serif` /
  brass-color references — should be zero.
- Grep for old component names (`EditorialCard`) — should be zero.

Risk rating impact: cosmetic + small structural only. No security
or operational change. Container boot pattern unchanged.
