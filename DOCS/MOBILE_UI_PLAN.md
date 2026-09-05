# GeekSuite Mobile UI Plan — the Pocket Pass

Companion to [`THE_UI_UNIFICATION_PLAN.md`](THE_UI_UNIFICATION_PLAN.md). That document unified
the *rules*; the shell-grammar pass (TODO_ORDER #15a, 2026-09-02) gave every MUI app the same
desktop skeleton and a working hamburger drawer. This plan does the same for the phone: one
mobile grammar in `packages/ui`, then an app-by-app pass that keeps each app's personality.

BookGeek is the pilot. It is the heaviest case (Tailwind-CDN body, hand-rolled overlays, no
mobile layout until 2026-09-02) and the one with the clearest mobile job: browse covers, open a
book, log progress, send it to the reader.

> Desktop is the inspiration, not the template. On a phone the sidebar becomes a drawer, the
> toolbar becomes a sheet, and the primary action moves to the thumb.

Drafted 2026-09-04 from a code audit of all eight apps (Playwright/Chromium is available
locally; only the unauthenticated login splash was screenshotted — the library needs a session).

---

## 1. What the audit found (2026-09-04)

### Suite-wide

- **`100vh` everywhere, `dvh` nowhere.** `GeekShell` sizes itself with `100vh`
  (`packages/ui/src/navigation/GeekShell.jsx:78-92`). On iOS Safari the visual viewport is
  shorter than `100vh` while the URL bar is showing, so the bottom of every app is clipped.
- **Safe areas are mostly ignored.** Only storygeek and fitnessgeek declare
  `viewport-fit=cover`; notegeek pads with `env(safe-area-inset-bottom)` but without the meta
  tag it resolves to 0. `GeekBottomNav` itself has no inset. Bottom navs, FABs and toasts sit on
  the iOS home indicator; startgeek runs under the notch in standalone mode.
- **`sm` vs `md` drift.** The shell, drawer and bottom nav switch at `md`, but several
  mobile-only interactions branch at `sm` (bujogeek `TaskRow.jsx:43` tap-to-reveal, notegeek
  `NoteShell.jsx:104` sticky action bar). Between 600 and 900px the user gets mobile chrome
  with desktop interaction.
- **No dialog goes full-screen.** Zero `fullScreen` dialogs across the suite. At 390px an
  MUI `Dialog maxWidth="sm"` is a 326px card with a scrolling form inside a scrolling page.
  basegeek's Add Database dialog has no `fullWidth` at all.
- **No bottom sheets.** Pickers, filters and action menus are desktop popovers or inline rows.
- **Top bar crowding.** Hamburger + title + `actions` + theme + switcher + avatar is six
  44px targets in 390px; titles truncate and app actions get squeezed.
- **Primary actions live at the top.** Except storygeek's pinned composer, every app's
  "create" or "do" action is a top-of-page button, the least reachable spot on a phone.
- **Hover-only affordances.** Actions revealed on hover, borders that appear on hover,
  tooltips as the only label. None of it exists on touch.
- **Sub-12px interactive text** in most apps (8px chips in storygeek, 9px pills and 11px
  buttons in bookgeek, 10-11px labels in startgeek/basegeek).
- **Wide tables with no mobile form** (flockgeek ×4 incl. a 10-column hatch log, basegeek ×3).

### BookGeek specifically (`apps/bookgeek/web/src/App.jsx`)

- **Library toolbar** (`App.jsx:2206-2320`): Sort select + direction, search, basket button,
  Save filter, tag filter, shelf select all `flex-wrap` into 4-5 rows of 11-12px controls
  above the grid. Two search fields (toolbar + none in drawer), shelf picker duplicated
  (drawer nav + toolbar select).
- **Cards** (`App.jsx:2390-2515`): 2-col grid is right. But 9px shelf pills, a 20px basket
  toggle bottom-left, hover-only lift, and 13px serif titles set in Libre Baskerville while the
  MUI theme asks for DM Serif Display — **which `index.html` never loads**, so every MUI
  heading and the wordmark fall back to Georgia. Two serifs, one missing.
- **Book detail** (`App.jsx:2891-3705`): a hand-rolled `fixed inset-0` overlay, `max-h-[90vh]`,
  colors hardcoded to `slate-950/800/100` — light-mode users get a dark modal. 28px close
  button. Cover 128px, then ~40 rows of 11px metadata and 11px text-buttons (Edit, Enrich,
  Delete, Download, Read, Send). Shelf is a native `<select>` at 11px; progress is a 144px
  range. No primary action in the thumb zone. Inputs under 16px zoom the page on iOS focus.
- **Reader** (`App.jsx:3706-3785`): `h-[90vh]` modal inside the modal, 11px Prev/Next buttons,
  no tap zones or swipe, forced dark chrome.
- **Settings** (`App.jsx:2543-2880`): 11px labels and inputs, hardcoded Tailwind palette,
  a "← Back to library" button duplicating nav, Log out duplicating the account menu.
- **Add book** (`App.jsx:3788-3866`): MUI `Dialog maxWidth="sm"`, not full-screen, unstyled
  `<input type=file>`.
- **Device basket** (`App.jsx:3869-4020`): hand-rolled overlay, hardcoded dark. Content is
  good (big mono word for the e-reader) and should survive as-is inside a proper sheet.
- **Drawer** (`components/Sidebar.jsx`): shelves as nav with counts — correct. "Clear all
  filters" is an 11px button; saved filters are 11px.
- **Manifest** `theme_color` is sky `#0ea5e9` while `index.html` uses the page colors per
  mode; `short_name` is lowercase `bookgeek` while the wordmark is `BookGeek`.
- **Login splash** (screenshotted at 390×844, both modes): fine. Wordmark is Inter, not the
  app's serif; acceptable, but the serif would carry identity here too.

---

## 2. The mobile grammar (shared, `packages/ui`)

Rules, not screens. Every app inherits these; identity stays in `sx`.

| Rule | Value | Where |
|------|-------|-------|
| Breakpoint | `md` (unchanged). Below it: drawer nav, compact top bar, sheets, FAB. | `geekLayout.navBreakpoint` |
| Viewport height | `100dvh` with `100vh` fallback | `GeekShell` |
| Safe areas | `viewport-fit=cover` in every `index.html`; top bar pads `env(safe-area-inset-top)`; bottom nav, FAB, sheets and toasts pad `env(safe-area-inset-bottom)` | `GeekTopBar`, `GeekBottomNav`, `GeekFab`, `GeekSheet`, `GeekToastProvider` |
| Top bar on mobile | hamburger → title → **at most one** app action (icon) → avatar. Theme toggle and app switcher fold into the avatar menu below `md`. | `GeekTopBar` |
| Primary action | Lives in the thumb zone: a `GeekFab` (56px, bottom-right, above the bottom nav) or a pinned composer/footer. Never only in the top bar. | new `GeekFab` |
| Bottom nav | Data-entry apps only, unchanged rule. Max five, no logout. Gains safe-area padding and a `labelSx` slot so label identity (notegeek's mono stamp) comes from the primitive. | `GeekBottomNav` |
| Sheets | Pickers, filters, sort, "more" menus and short forms open as a **bottom sheet** below `md` and as a Popover/Dialog at `md`+. One primitive decides. | new `GeekSheet` |
| Dialogs | Any form dialog is `fullScreen` below `sm`, with a sheet header: close (left), title, primary action (right). | new `GeekDialog` |
| Touch targets | 44px, no exceptions; visual size may be smaller, the hit area may not. | theme + review |
| Text floor | 12px for anything readable, 16px for any input (prevents iOS zoom). | theme + review |
| Hover | Nothing is hover-only. Under `@media (hover: none)` hover-revealed actions are always visible; tooltips are never the only label. | theme |
| Tables | Below `md` a table renders as a card or definition list. App-owned layout, shared rule. | per app |
| Keyboard | Composer/inputs pinned to the bottom use `dvh` + `interactive-widget=resizes-content`; autofocus only on explicit user intent. | per app |
| Motion | Sheets slide 180ms on the standard curve; route fades unchanged; both honor `prefers-reduced-motion`. | `geekMotion` |

### New primitives (litmus test: every app would use it, it encodes a rule, no domain)

- **`GeekSheet`** — `open`, `onClose`, `title`, `actions`, `children`, `snap` (`'content' | 'full'`).
  Below `md`: MUI `SwipeableDrawer anchor="bottom"`, grab handle, rounded top (`panel` radius
  ×2), safe-area padding, `max-height: 92dvh`, content scrolls inside. At `md`+: renders its
  `desktop` prop (a Popover or Dialog) or a centered Dialog by default.
- **`GeekDialog`** — thin wrapper over MUI `Dialog` that flips `fullScreen` below `sm` and
  supplies the mobile header (close, title, primary action) so forms don't need two layouts.
- **`GeekFab`** — 56px, `primary.main`, positioned `bottom: bottomInset + safe-area + 16px`,
  `right: 16px`, hides in focus mode, optional extended label at `sm`+. Reads the shell for
  `bottomInset`.
- **`GeekTopBar`** gains `compact` behavior below `md`: the suite cluster collapses into the
  account menu as `extraItems` (Theme, Switch app); `actions` shows only its first child.
- **`GeekShell`**: `100dvh`, safe-area top padding on the top bar in standalone.
- Theme: `MuiCssBaseline` adds the `@media (hover: none)` rule for `[data-geek-hover-reveal]`;
  `MuiChip` gets a 12px floor; `MuiInputBase` a 16px floor below `sm`.

---

## 3. BookGeek — the Pocket Pass (pilot)

**Job on a phone:** find a book, open it, log progress, send it to the reader, add a book.
**Feel:** Midnight Reader — cover-forward, dark slate, one sky accent, amber only for progress,
serif only at display sizes. Light mode is a real mode, not an afterthought.

**Type decision:** one serif. Load DM Serif Display (the theme already asks for it) and drop
Libre Baskerville from the Tailwind config. Serif at ≥ 18px only (wordmark, sheet titles,
book title in detail). Card titles are Inter 13px/500 — a display serif at 13px is mud.

### 3.1 Library
- **Top bar:** ☰ · "Library" (or the shelf name) · search icon · avatar. Search icon expands to a
  full-width `GeekSearchField` in the bar, Esc/✕ collapses it. No "Add book" button here.
- **Shelf strip:** horizontally scrolling chips under the top bar — All · Reading · On Reader ·
  Unread · Read · Want to read · Abandoned · Need to find · custom… with counts. Active chip is
  the accent. This *is* the shelf nav on a phone; the drawer keeps the full list plus saved
  filters for parity with desktop.
- **Sort/filter row:** one line: `223 books · Title ↑ · [Filter •2]`. Tapping Sort or Filter
  opens the **Filter sheet**. Active filters render as removable 12px chips under the row.
- **Grid:** 2 columns at xs, 3 at sm; 12px gutters; cover 2:3 with `panel` radius; amber
  progress bar overlays the cover's bottom edge (2px) instead of a separate row; title Inter
  13px/500 two-line clamp; author 12px muted. Shelf state: a 12px caption row
  ("Reading · 42%") replaces the 9px pill. Owned: a small tick glyph in that row.
- **Basket:** the 20px "+" leaves the card. Basket add lives in the detail sheet's action bar;
  bulk selection is a "Select" mode from the Filter sheet's overflow, rendering 44px checkboxes.
- **FAB:** "Add book" — the app's one create action. Opens `GeekDialog` full-screen.
- **Infinite scroll** unchanged; the "Scroll to load more" sentinel becomes a 44px skeleton row.
- **Empty/error:** `GeekEmptyState` / `GeekErrorState` replace the 11px status lines and the
  "Connected to API. Loaded N books." footer (drop it; it is a dev message).

### 3.2 Book detail → full-screen sheet
- Below `md` the detail is a `GeekSheet snap="full"` (slides up, swipe down to dismiss);
  at `md`+ it stays a centered dialog with the current two-column layout, restyled in MUI.
- **Hero:** the cover, 160px, centered on a blurred and darkened copy of itself (the app's one
  flourish; `prefers-reduced-motion`/`data-saver` gets a flat surface). Title in DM Serif
  Display 24px, authors in the accent, then a single 12px meta line: `Read · ★★★★☆ · 336 pp · 2014`.
- **Progress row:** a full-width MUI `Slider` (44px track hit), amber, with the percent and
  "about p. 141 of 336" beside it. Commits on change as today.
- **Metadata:** a two-column definition list (Publisher, Published, ISBN, Language, Goodreads,
  Added, Finished, Read count) at 13px/12px. Tags as 12px `GeekChip`s.
- **Description:** collapsed to 4 lines with "Read more".
- **Sticky action bar** (safe-area padded): **Read** (primary) · **Send to reader** · **Shelf**
  (opens a Shelf sheet with the shelf list and counts) · **⋯ More** → sheet: Edit metadata,
  Enrich metadata, Change cover, Download / Convert, Add to device basket, Delete book (danger,
  with the "also delete files" toggle inside a confirm dialog).
- Edit mode becomes its own `GeekDialog` (full-screen form with 16px `TextField`s) instead of
  in-place 11px inputs.
- Themed: `background.paper`, `text.*`, `divider` — no hardcoded slate.

### 3.3 Reader
- True full-screen (own route or `GeekSheet snap="full"` with chrome hidden), `100dvh`.
- Tap zones: left third = previous, right third = next, center toggles chrome. Swipe also pages.
- Chrome: top bar with ✕, title, theme (dark / light / sepia later); bottom bar with a thin
  progress rail and "Chapter · 42%". Both auto-hide after 2s.
- Font size stepper in a small sheet from the top-bar ⋯. Reader theme follows the app mode by
  default.

### 3.4 Settings
- A real MUI page: Account (name, sign-out via the top-bar menu only), Send-to-device
  (Kindle email, device word), Shelves (custom shelves list with 44px rows, add/delete),
  Library maintenance (Goodreads import, dedupe, Calibre rescan — each a card with one button
  and a result line). 16px inputs. No "Back to library" button; the drawer/top bar is the way back.

### 3.5 Add book / Device basket
- Add book: `GeekDialog` (full-screen below `sm`), file picker as an MUI button with the
  chosen filename beside it; "Create" in the header.
- Device basket result: `GeekSheet` with today's content unchanged (the big mono word is right).

### 3.6 Identity checklist (what must survive)
DM Serif Display wordmark and sheet titles; slate midnight surfaces `#010409/#0f172a/#151e2f`;
sky accent; amber progress; frosted top bar; shelf icon set in the drawer; the serif is never
below 18px.

### 3.7 Order of work (each step deploys on its own) — **all seven landed 2026-09-04**

Commits, in order: fonts/manifest `f7425b4` · views extracted `d78e5a2` · theme tones
`b4fb471` · library `108995a` · settings/add/basket `13cbc42` · detail `cc04cc4` · reader
`d4a5f73` · Tailwind removed `5b6bb3f`. Verified with a Playwright harness that intercepts the
API with fixtures (scratch, not in repo) at iPhone 14 in both modes and at 1280px.
1. Shared primitives + shell fixes (§2) with tests in `packages/ui/src/__tests__`. **M**
2. Fonts and manifest: load DM Serif Display, drop Libre Baskerville, fix `theme_color`
   and `short_name`. **XS**
3. Library: top bar, shelf strip, filter sheet, card restyle, FAB, empty/error states. **M**
4. Detail sheet + Shelf/More sheets + Edit dialog. **M**
5. Reader full-screen with tap zones. **S–M**
6. Settings page, Add book dialog, basket sheet. **S**
7. Delete the now-unused Tailwind classes; if none remain in `App.jsx`, remove the CDN
   script (closes TODO_ORDER #27 for free). **S**

Each step rewrites its surface in MUI/sx, so the Tailwind migration happens as a side effect of
the mobile pass rather than as its own project.

---

## 4. The other apps — findings and the mobile fix

Identity notes name what must survive. Effort assumes §2 primitives exist.

### bujogeek — Parchment & Ink
- Findings: full shell grammar with a five-tab bar (Today · Review · Plan · Tags · More) and a
  real bottom "More" sheet (`components/layout/MobileTabBar.jsx:51-61`) — the only bottom sheet
  in the suite. But quick-add is inline **at the top of the page** (`TodayPage.jsx:325`), not
  sticky; six task-row actions are 28×28 (`tasks/TaskRow.jsx:~545-635`) and their tap-to-reveal
  gates on `sm`, not `md`; zero `fullScreen` dialogs (TaskEditor, TemplateEditor, habit and
  collection creates are centered cards); the monthly calendar keeps 7 columns at ~50px each;
  54 font sizes ≤ 10px, some on interactive chips; the More sheet's Keyboard Shortcuts row
  fakes a `?` keypress, dead on touch; no `viewport-fit`.
- Fix: quick-add becomes a `GeekFab` above the tab bar (opens the existing quick-add as a
  sheet with the same shortcut grammar); row actions → one 44px ⋯ that opens an action sheet;
  editors → `GeekDialog`; calendar → week strip + agenda list below `md`; chip floor 12px;
  drop the shortcuts row on touch. Keep the More sheet — promote its pattern into `GeekSheet`.
- Identity: Fraunces + Source Sans 3, tobacco drawer chrome, parchment surfaces, aging tints.
  **M**

### fitnessgeek — Studio Slate
- Findings: full grammar, four-tab bar (Home · Log · Activity · Profile), the only app with
  `viewport-fit=cover` and safe-area CSS vars. But the main create action — log food — is a
  **32px icon in each meal card header** (`FoodLog/MealSection.jsx:205-219`); the two real
  FABs live on secondary pages with a hardcoded `bottom: 80` and one renders on desktop too;
  only one of ~20 dialogs is `fullScreen`; `PremiumDialog` fakes full-screen but has one
  consumer; several fixed `1fr 1fr` / `repeat(3|4|7, 1fr)` grids squeeze at 390px; the
  densest app in the suite (172 `size="small"`, 73 font sizes ≤ 10px). Dead files:
  `Layout/BottomNavigation.jsx`, `Layout/Layout.jsx`.
- Fix: one `GeekFab` on Log ("Log food" → food search sheet, meal picked inside); Weight/BP
  FABs move onto the primitive (inset-aware, mobile-only); `PremiumDialog` becomes a thin
  wrapper over `GeekDialog` and all dialogs adopt it; fixed grids → `repeat(auto-fit, minmax())`
  or 2-up at xs; density pass on the meal cards (44px targets, 12px floor); delete dead files.
- Identity: DM Serif Display headings, teal accent, near-black drawer, gradient meal cards,
  eyebrow/dashed-rule dialog chrome. **M**

### notegeek — Ink Studio
- Findings: the best mobile pattern in the suite — "New" is a bottom-nav tab, the editor is a
  route, and `NoteShell.jsx:100-113` pins a safe-area-padded action bar. But it gates on `sm`
  (lost between 600–900px) and the meta tag is missing so the inset is 0; header search icon is
  ~33px; editor toolbar scrolls horizontally with no wrap; two magic `calc(100vh - N)` heights
  fight the shell's; delete confirm is a centered card; the mono/letter-spaced tab labels are
  hand-recreated because `GeekBottomNav` label typography is not themeable.
- Fix: `viewport-fit=cover`; gate on `md`; toolbar wraps to two rows or collapses into a ⋯
  sheet; heights from flex, not calc; confirm → `GeekDialog`; add a `labelSx` slot to
  `GeekBottomNav` so the ink-stamp identity comes from the primitive.
- Identity: oxblood accent, cream paper, Geist + JetBrains Mono, uppercase mono labels,
  3px ink-stamp active bar. **S**

### flockgeek — Field Ledger
- Findings: four wide tables with no mobile form (Birds 6+7 cols with ~860px of `minWidth`s,
  Hatch log **10 cols**, Pairings 6, Egg log); create buttons top-of-page; Quick Harvest entry
  (the real primary action) mid-page with 30px quick-add buttons, a hover-only border and a
  tooltip as the only explanation; five `Dialog maxWidth sm/md` forms; no `viewport-fit`.
  DM Serif Display is referenced but **not loaded** (same bug as bookgeek).
- Fix: tables → card lists below `md` (one card per bird/pairing/hatch, key facts as a 2-col
  definition list, row actions in a ⋯ sheet); `GeekDialog` on all five forms; Quick Harvest
  becomes the FAB (opens a harvest sheet with 44px steppers); decide on a `GeekBottomNav`
  (Home · Eggs · Birds · Hatch · Groups) — it is the one genuine data-entry app without one.
- Identity: parchment cream / ink, DM Serif Display titles, frosted top bar. **L**

### storygeek — Arcane Codex
- Findings: rails collapse at `lg` while the shell switches at `md` (a dead band between
  900–1200px); play column is `calc(100vh - 120px)` with a hardcoded 120 that doesn't match the
  chrome; 8px text in 14px chips across panels; 34px rail toggles; Bookify export is a
  `maxWidth="md"` dialog holding a whole story in a serif `<pre>`; composer autofocuses on
  every message (fights the keyboard). Journal drawer already goes full-width on phones — good.
- Fix: rails collapse at `md`; play column fills the frame with flex, not calc; chips to the
  12px floor (fewer chips, not smaller ones); rail toggles 44px; Bookify → `GeekDialog`
  full-screen with a copy/share action; composer keeps focus only after a *send*.
- Identity: Cinzel/Crimson Pro, gold hairlines, grain, "Depart". Do not flatten. **M**

### basegeek — Mission Control
- Findings: Create User is `maxWidth="xs"` (wider than the phone), Add Database has no
  `fullWidth`; 6-col tables ×3; centered `Tabs` without `scrollable`; 8.8–11px mono metadata
  throughout; public Portal/Login/Register hardcode `100vh` and never see a media query.
- Fix: `GeekDialog` on both forms; tables → definition-list cards; `Tabs variant="scrollable"`
  below `md`; mono floor 12px; portal pages stack at xs.
- Identity: Geist/Geist Mono console voice, hairline panels. **S–M**

### startgeek — the console (standalone, Tailwind)
- Findings: no manifest at all; `black-translucent` status bar with no `viewport-fit`/safe-area
  so content runs under the notch; dock labels hidden below 640px (icon-only, unlabeled);
  clock and temperature both clamp to a 72px floor and dominate the first screen; hero is
  left/right zig-zag at phone width; settings 30px, help 26px, closes 32px; command box
  re-focuses on every window focus (keyboard pops on return); weather modal silently shows 4
  of 7 days; secondary inks `--ink-2` and `--ink-3` are the same value.
- Fix: manifest + `viewport-fit=cover` + safe-area on dock/toast/top rail; dock labels at
  11–12px always, scrim under them; hero stacks left-aligned with a 56px numeral floor; 44px
  controls; focus only on user intent; weather week as a horizontal scroll; split the two inks.
- Identity: Geist 200 clock, glass modules, warm amber accent, wallpaper. Stays off the MUI
  shell (TODO_ORDER #28). **S–M**

---

## 4b. Follow-ups surfaced by the passes (packages/ui)

Recorded 2026-09-04 while landing M1 and the fitnessgeek half of M2; **all six primitive items
landed the same night** (`useGeekPrimaryAction`, compact header action + `primaryActionSx`,
`titleSx`, node titles, 12px floor in shell chrome, Escape on sheets — see THE_UI_UNIFICATION_PLAN §3b).
The fitnessgeek dead files and the voice decision remain open.

- **Primary-action registry.** `GeekFab` must mount as a sibling of `GeekAppFrame`, but the
  page owns the action. fitnessgeek wrote a 75-line context (`Layout/primaryAction.js`); every
  other app will need the same. Promote it: `useGeekPrimaryAction({ label, icon, onClick })` in
  `packages/ui` with `GeekShell` rendering the FAB. **S**
- **`GeekDialog` header action.** A normal `<Button startIcon>` as `primaryAction` fills half the
  60px bar; apps hide the icon and tighten padding via the `data-geek-dialog="primary"` hook.
  Do it in the primitive or expose `primaryActionSx`. **XS**
- **`GeekDialog` `headerSx` is full-mode only**; window mode has no header slot, so identity
  styling reaches `DialogTitle` through `PaperProps`. Add a window-mode `titleSx`. **XS**
- **Node `title` in `GeekDialog` full mode** is wrapped in `noWrap` `h3`; an eyebrow-over-title
  block needs overrides. Detect a node title and skip the wrap. **XS**
- **`GeekTopBar` desktop date strip** renders at 11px, under the suite's 12px floor. **XS**
- **`GeekSheet` and Escape.** Focus never enters the drawer, so Escape does not close a sheet;
  the harness closes via the backdrop. Check `SwipeableDrawer` focus handling. **S**
- fitnessgeek left dead: `components/BarcodeScanner.jsx` (duplicate), `BarcodeScanner.jsx.v3.backup`,
  `Layout/Drawer.jsx`, `Layout/PageContainer.jsx`, `Weight/WeightContent.jsx`, `WeightLayout.jsx`;
  and 10–11px chart ticks / editorial mono labels outside the Log surfaces are a voice decision
  for Chef, not a fix.

## 5. Rollout

| Pass | Scope | Effort | Why this order |
|------|-------|--------|----------------|
| M0 | ~~§2 primitives + shell fixes + `viewport-fit`~~ **landed 2026-09-04** (`daf2071`..`578e5ba`, plus `fafac74` drawer-width fix) | M | Everything else consumes it |
| M1 | ~~BookGeek pilot (§3)~~ **landed 2026-09-04** (see §3.7) | L | Heaviest case, clearest mobile job, drained the Tailwind CDN debt |
| M2 | fitnessgeek → bujogeek → notegeek | M each | Bottom navs exist; mostly sheets, dialogs, targets |
| M3 | flockgeek | L | Tables → cards is the big one; bottom nav decision |
| M4 | storygeek, basegeek | M + S–M | Breakpoint alignment and dialogs |
| M5 | startgeek | S–M | Standalone build; safe-area + manifest first |
| M6 | Guardrails | S | Mobile checklist in the review list; `packages/ui` tests for sheet/dialog/fab; a Playwright screenshot script at iPhone 14 (`~/.agents/skills/playwright` has the browser) using a saved `storageState` that Chef creates once by signing in |

Run it like the 2026-09-02 sweep: per-app commits, incremental deploys, worktree builds when the
tree is dirty. Every main push restarts the fleet (Watchtower), so batch per app, not per file.

---

## 6. Review checklist additions (mobile)

Before merging any UI work, at 390×844 in both modes:

- Nothing is clipped at the bottom with the URL bar showing (dvh).
- The primary action is reachable with a thumb without scrolling.
- Every tap target is 44px; every readable string is ≥ 12px; every input is ≥ 16px.
- Every dialog is full-screen below `sm`; every picker is a sheet below `md`.
- Nothing depends on hover.
- Top bar shows: hamburger, title, ≤ 1 action, avatar.
- Safe areas respected in standalone (notch, home indicator).
- Identity survives: the app's fonts, chrome color, accent, and voice are present on the phone.

*Drafted 2026-09-04; M0 and M1 landed the same day. Next: M2 continues with bujogeek → notegeek; §4b follow-ups first.*
