> **Archived 2026-11-25.** One-off measurement from 2026-11-15; nothing live remains here. The fix order it produced is tracked in `DOCS/SUITE_TODO.md`.

# Tablet baseline — 2026-11-15

First run of the mobile harness at tablet size, all 11 apps. Measurement only: no app code, scene or fixture was changed.

## How it was run

- Command per app: `node ci.mjs --app <app> --enforce-a11y --tablet-only --label tablet-<app>` (from `tools/mobile-harness`).
- Four contexts per scene: portrait 800×1280 and landscape 1280×800, light and dark. Chromium only, touch, Android tablet UA.
- Output: `tools/mobile-harness/out/tablet-<app>/` (`SUMMARY.md`, `summary.json`, `<app>/<app>-<scene>-<scheme>-tablet[-land].png`).
- One app at a time. Every app built on the first try.
- "Scenes run" counts scene × context (a scene seen in 4 contexts counts 4).
- The harness has three rules (tap target, text floor, sideways scroll) plus axe. Only the tap-target rule fired, anywhere. No app has page-level horizontal overflow at tablet size.
- Broken / poor / fine counts are my reading of the main screens I opened (light theme), not of every scene. The "screens looked at" column says how many.

## Summary table

Harness numbers (all four contexts together):

| App | Scenes run | Grammar violations | a11y | Page errors |
|---|---|---|---|---|
| notegeek | 280 | 5134 (portrait 116, landscape 5018) | 0 | 0 |
| todogeek | 76 | 32 (landscape only) | 0 | 0 |
| bookgeek | 66 | 402 (portrait 8, landscape 394) | 0 | 0 |
| fitnessgeek | 556 | 164 (portrait 16, landscape 148) | 1 | 9 (see below) |
| thinggeek | 252 | 356 (portrait 12, landscape 344) | 0 | 0 |
| gamegeek | 84 | 558 (portrait 8, landscape 550) | 0 | 0 |
| newsgeek | 180 | 180 (45 per context) | 0 | 0 |
| storygeek | 32 | 0 | 0 | 0 |
| startgeek | 16 | 80 (landscape only) | 0 | 0 |
| flockgeek | 8 | 14 (landscape only) | 0 | 0 |
| basegeek | 68 | 0 | 0 | 0 |

All violations are `tap-target`. All gating results: FAIL for every app except storygeek and basegeek.

Triage of main screens (light):

| App | Portrait broken / poor / fine | Landscape broken / poor / fine | Screens looked at (P / L) |
|---|---|---|---|
| notegeek | 0 / 5 / 1 | 0 / 1 / 2 | 6 / 3 |
| todogeek | 0 / 4 / 0 | 0 / 0 / 2 | 4 / 2 |
| bookgeek | 0 / 4 / 4 | 0 / 0 / 2 | 8 / 2 |
| fitnessgeek | 0 / 4 / 0 | 1 / 1 / 2 | 4 / 3 (+1 from a harness error) |
| thinggeek | 0 / 2 / 2 | 0 / 0 / 2 | 4 / 2 |
| gamegeek | 0 / 0 / 1 | 0 / 0 / 1 | 1 / 1 |
| newsgeek | 0 / 0 / 1 | 0 / 0 / 1 | 1 / 1 |
| storygeek | 0 / 0 / 1 | 0 / 0 / 1 | 1 / 1 |
| startgeek | 0 / 0 / 1 | 0 / 0 / 1 | 1 / 1 |
| flockgeek | 0 / 0 / 1 | 0 / 0 / 1 | 1 / 1 |
| basegeek | 0 / 0 / 1 | 0 / 0 / 1 | 1 / 1 |

Headline: nothing is broken in portrait. The five tablet apps are all poor in portrait: they are the phone layout stretched to 800 px. Landscape is mostly fine because the sidebar already appears at 1280 px, but its targets are 24–34 px high. The six other apps do not break at tablet size.

## The five tablet apps

Image paths below are relative to `tools/mobile-harness/out/tablet-<app>/<app>/`. Suffix: `-light-tablet.png` = portrait, `-light-tablet-land.png` = landscape.

### notegeek (280 scenes, 5134 violations, 0 a11y, 0 errors)

Portrait (116 violations in 24 scenes, all tap-target): editor `Note title` and `Tags` inputs are 26–31 px high (680 px wide); quick-capture box 32 px; tag filter 43 px; code-language select 27 px.

- `01-home` portrait: poor. Phone layout. Note rows run to about 660 px of 800; titles, excerpts and "2h ago" are far apart. Bottom bar has 4 tabs about 310 px apart. `notegeek-01-home-light-tablet.png`
- `02-notes-list` portrait: poor. Same stretch; filter chips and sort links are small in a wide row. Bottom bar spans 800 px. `notegeek-02-notes-list-light-tablet.png`
- `03-editor` portrait: poor. Text column is about 700 px, then a huge empty page below the text. The format toolbar (B, I, U, code, quote, lists, link) is pinned bottom-left with eight icons packed into the left 450 px and nothing on the right. Title and tag inputs are under 44 px. `notegeek-03-editor-light-tablet.png`
- `07-tag-tree` portrait: poor. The tag sheet is a full-width 800 px sheet. Counts and the `...` menu sit at the far right edge, about 700 px from the tag name. `notegeek-07-tag-tree-light-tablet.png`
- `14-search` portrait: poor. Results are a single wide column, bottom bar full width. `notegeek-14-search-light-tablet.png`
- `11-markdown-wide-table` portrait: fine. The table scrolls inside its own box; the page does not. `notegeek-11-markdown-wide-table-light-tablet.png`

Landscape (2509 violations per scheme in 55 scenes):

- `01-home`: fine. Sidebar plus a centred list column; wide margins but readable. `notegeek-01-home-light-tablet-land.png`
- `03-editor`: fine. Centred paper with the toolbar under the title. `notegeek-03-editor-light-tablet-land.png`
- `07-tag-tree`: poor for targets. The always-visible sidebar tag tree has 24×24 collapse and `...` buttons on every tag (50 scenes × each tag) and a 201×43 filter. This is the bulk of the 2509. The other bulk is note links at 135–149×32 (about 950 hits). `notegeek-07-tag-tree-light-tablet-land.png`
- No two-pane (list | note): the editor replaces the list, as on phone.

### todogeek (76 scenes, 32 violations, 0 a11y, 0 errors)

Portrait: no violations. Landscape: one, the brand link `aria-label="TodoGeek, Today"` at 110×26, in every scene.

- `01-today` portrait: poor. Hamburger menu top-left, task rows stretch the full 800 px with the time ("2pm · passed") 700 px from the title, "Move all to today" and "Reorder" far right. The add box is pinned at the bottom, 780 px wide, above a 4-tab bottom bar (tabs about 200 px apart). `todogeek-01-today-light-tablet.png`
- `05-upcoming` portrait: poor. Date column on the left, task text, and time at the far right edge, about 700 px apart. `todogeek-05-upcoming-light-tablet.png`
- `04-inline-editor` portrait: poor. The edit form is a full-width bottom sheet (Task, Date, Time, Tags, priority, Note all stretched to 780 px) over a dimmed list. `todogeek-04-inline-editor-light-tablet.png`
- `61-load-error` portrait: poor. "Couldn't reach your list. Retry" is a small line top-left under the filters with the rest of the page empty; the toast sits at the bottom right over the tab bar. `todogeek-61-load-error-light-tablet.png`
- Landscape `01-today`, `04-inline-editor`: fine. Rail, centred 600 px column, inline editor opens in the row. `todogeek-01-today-light-tablet-land.png`

### bookgeek (66 scenes, 402 violations, 0 a11y, 0 errors)

Portrait: 4 violations: account-menu items and sort-menu items at 198–218×34.

- `01-library` portrait: fine. Three-column cover grid works at 800 px. Add FAB bottom-right. Shelf chips scroll sideways inside their own strip (by design). `bookgeek-01-library-light-tablet.png`
- `01b-library-list` portrait: poor. One row per book across 800 px: title far left, stars far right (about 600 px apart). `bookgeek-01b-library-list-light-tablet.png`
- `03-detail` portrait: poor. The detail is a full-width bottom sheet. Cover is a small image in the middle of a 800 px band, description lines about 780 px long, action row (Read / Send / Shelf / more) stretched. `bookgeek-03-detail-light-tablet.png`
- `07-what-next` portrait: poor. Full-width sheet, list rows 780 px with "Start reading" under each. `bookgeek-07-what-next-light-tablet.png`
- `06-settings` portrait: poor. One column with 780 px text lines and buttons left-aligned in a mostly empty page. `bookgeek-06-settings-light-tablet.png`
- `02-drawer`, `04-add`, `08-edit-metadata-draft` portrait: fine. The drawer and the dialogs are sized sensibly. (`08` is a centred modal; its footer is tight.)
- Landscape `01-library`, `03-detail`: fine. Shelves rail, filters panel, 4-column grid; detail is a centred two-column dialog. Violations: filter rows (author, tag, shelf) 267×34 and search boxes 233×36 (197 per scheme). `bookgeek-01-library-light-tablet-land.png`

### fitnessgeek (556 scenes, 164 violations, 1 a11y, 9 errors)

Portrait: 8 violations: the 7d/30d/1y/All toggle on `07-bp` and `67a-bp-donut` is 44×34.

- `01-home` portrait: poor. Phone stack: one full-width ring card, two-column meal cards, then more cards. The bottom bar has 5 tabs spread over 800 px. Content below the fold is the same single column. `fitnessgeek-01-home-light-tablet.png`
- `02-log` portrait: poor. Composer, chips and entries stretched to 780 px. FAB bottom-right overlaps the last entry row. `fitnessgeek-02-log-light-tablet.png`
- `05-weight` portrait: poor. Goal card, trend chart and body-composition cards all full-width. The "Log weight" FAB sits over the stat cards. `fitnessgeek-05-weight-light-tablet.png`
- `07-bp` portrait: poor. Donut chart is very large; "Log BP" FAB over the chart legend area. `fitnessgeek-07-bp-light-tablet.png`
- Landscape `01-home`, `02-log`: fine. Dark sidebar with all sections; content column about 1350 px wide, so lines are long but readable. `fitnessgeek-01-home-light-tablet-land.png`
- Landscape `07-bp`: poor. A very large donut and one wide card; empty right side. `fitnessgeek-07-bp-light-tablet-land.png`
- Landscape `45a-same-as-household-tapped`: broken. Harness error: the toast overlaps the ribbon (toast 714–776 vs ribbon 689–747). Not opened as an image.
- Landscape tap targets: the home-card segmented control at 61–91×32 (12 scenes), copy-meal selects 150×40, serving-size toggle 32–70×34, household view input 870×40, one 122×24 button on `59a-health-overview`.

Page errors (9, scene-assertion text, not layout):
- `07u-reports-body` tablet-dark: "missing: blood pressure card"
- `63b-meds-add-simple-filled` tablet-dark and tablet-light: "missing: Save in the footer" (the scene also has no portrait screenshot, so Save is likely not reachable at 800 px; check it by hand)
- `67-bp-week` in all four contexts: "headline: Your average this week: 127/79 — a little high (elevated)". The screen shows 126/79. This looks like fixture drift, not tablet-specific.
- `45a-same-as-household-tapped` landscape, both schemes: toast overlaps ribbon (above).

a11y: `60b-settings-simple-more` tablet-light, `color-contrast`, 2 nodes. Not re-run, so it may be flaky or not tablet-specific.

### thinggeek (252 scenes, 356 violations, 0 a11y, 0 errors)

Portrait: 6 violations: the where-menu items on `10c-where-menu` at 269×34.

- `01-library` portrait: fine. The table with Value and Next due columns uses the width well. `thinggeek-01-library-light-tablet.png`
- `05-detail` portrait: poor. Hero photo full width; sections stack one by one; each field label sits at the left and its value starts at about 340 px, with a lot of empty space. `thinggeek-05-detail-light-tablet.png`
- `07-add` portrait: poor. A short form (photo, name, type chips, where, tags) at 780 px with about half the screen empty below it. `thinggeek-07-add-light-tablet.png`
- `09-attention` portrait: fine. The gauge card and lists read well. `thinggeek-09-attention-light-tablet.png`
- Landscape `01-library`, `05-detail`: fine. Sidebar plus filters plus a 3-column grid; detail is a two-column layout with the claim readiness card. `thinggeek-05-detail-light-tablet-land.png`
- Landscape violations: type, location and tag filter rows at 267×34, about 172 per scheme.

## The six other apps (does anything break?)

Nothing breaks in either orientation.

| App | Portrait | Landscape | Tap-target findings |
|---|---|---|---|
| gamegeek | fine (2-column covers, bottom bar) `gamegeek-01-library-light-tablet.png` | fine (rail, filters, 4 columns) | landscape 275: filter chips 51–109×34/36, search boxes 232×36 |
| newsgeek | fine (newspaper column) `newsgeek-26-today-light-tablet.png` | fine (rail, centred column) | all four contexts, 45 each: story headings (h2/h3 links) 24 px high |
| storygeek | fine (reader, bottom bar) `storygeek-04-play-light-tablet.png` | fine (rail and side panels) | none |
| startgeek | fine (clock, command box) `startgeek-01-console-light-tablet.png` | fine | landscape 40: task links 19 px high, command box 26 px, 74×18 module links |
| flockgeek | fine (table list, bottom bar) `flockgeek-03-birds-light-tablet.png` | fine (rail, wide table) | landscape 7: table header cells 24 px |
| basegeek | fine `basegeek-00-home-light-tablet.png` | fine | none |

Only one main screen per app was opened here, per the brief.

## Missing state scenes

Counted from scene names. "Offline" means a scene that shows the app with no network; none of the 11 apps has one. Error means a load or save failure shown on screen.

| App | Empty | Loading | Error | Offline |
|---|---|---|---|---|
| notegeek | has `21e-recently-deleted-empty`; missing: empty home, empty notes list, empty search, empty tag | missing | has `03f-save-failed`; missing: list load failed | missing |
| todogeek | has `60-today-empty`; missing: empty Upcoming, Done, Search | missing | has `61-load-error` | missing |
| bookgeek | missing (empty library, empty shelf, no search results) | missing | missing | missing |
| fitnessgeek | well covered (`57a`–`57g`, `51`, `51c`, `63`, `66c`) | missing | has `34`, `52`, `52a`, `52b`, `56-error-boundary`, `48-signed-out` | missing |
| thinggeek | has `18-walk-empty`; missing: empty library, empty Where, empty Trash | missing | missing | missing |
| gamegeek | has `22-no-match`; missing: empty library | has `28-media-loading` | missing | missing |
| newsgeek | well covered (`03`, `20`, `25`, `29`, `32`) | missing | has `06`, `37` | missing |
| storygeek | has `13-empty-list` | missing | missing | missing |
| startgeek | missing | missing | missing | missing |
| flockgeek | missing (only `01-home` and `03-birds`) | missing | missing | missing |
| basegeek | missing | missing | missing | missing |

Only 8 scenes in flockgeek and 16 in startgeek: coverage there is thin, so "fine" for those two means "the two or four screens we have".

## Fix first (five tablet apps, portrait)

Ranked by how many screens it improves and how much of the use it covers.

1. **One portrait navigation pattern for all five.** Every app draws its phone bottom bar (4–5 tabs) across 800 px and a hamburger or app-grid button on top. This is the `GeekNavRail` item (plan 2.6, decision P2a: rail plus one pane). It fixes the nav in every screen of every app at once. Do it before anything else.
2. **Cap and centre the content column.** NoteGeek home/list/search, TodoGeek Today/Upcoming and BookGeek list view and settings run rows 700–780 px wide with the metadata at the far right edge. A shared max-width (about 600–680 px) with a trailing rail removes most of the "stretched phone" look for little work.
3. **Bottom sheets at 800 px become dialogs or side sheets.** BookGeek detail and "What should I read next", TodoGeek task editor, NoteGeek tag sheet are all full-width bottom sheets with 780 px lines. Give the shared sheet a tablet width (a centred dialog of about 560 px or a right-hand sheet).
4. **NoteGeek editor in portrait.** The one screen used most. Fix the bottom-left toolbar (move it under the title, as landscape does), the 26–31 px title and tag inputs, and the empty page. Then the two-pane list | note for the tablet's landscape and later portrait if wanted (decision P2b allows two panes only from 1024 px).
5. **TodoGeek task rows and add box.** Pull time and tags next to the title; add box above the bottom bar with a sane width. Check the load-error state: it is small and top-left.
6. **ThingGeek detail and add form.** Two columns for the detail sections in portrait if room allows (as landscape does); a narrower add form with the photo beside the name.
7. **FitnessGeek: columns for home, weight and BP; FABs off the content.** The "Log weight" and "Log BP" FABs sit on top of cards. Two columns for the cards on home and weight. Check the `63b` Save button and the two harness errors before closing out.
8. **Pointer targets (mostly landscape).** NoteGeek sidebar tag buttons (24 px), tag and filter rows in BookGeek and ThingGeek (34 px), the NoteGeek editor inputs (26–31 px). These are the 5000-odd violations; they come from a few dozen elements. One pointer-based target token (plan 2.6) fixes most of them.
9. **BookGeek list view.** Rows with the stars at the far right: use a two-column list on tablet, or cap the width.
10. **Scene coverage.** Add empty / loading / error / offline scenes (see table). BookGeek, ThingGeek and NoteGeek have the biggest gaps. Without them, the layout fixes above are unverified in those states.

## Could not run / caveats

- Everything ran; no app failed to build.
- Landscape is a skim, not a full pass: I opened two or three screens per app. Portrait for the five apps got four to eight each.
- The a11y finding and the `fitnessgeek` errors above are single scenes; I did not re-run them to see whether they are flaky.
- Not covered by a harness at all: touch behaviour, pen, keyboard-up layout, sheet behaviour with the on-screen keyboard (plan Phase 6).
