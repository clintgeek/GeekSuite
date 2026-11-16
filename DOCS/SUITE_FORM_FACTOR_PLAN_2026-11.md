# Phone, tablet and desktop — the plan to get the whole suite there (2026-11-15)

**Goal (Chef):** every app gives a good experience on a phone, a tablet and a
desktop — and we can show it, not assume it.

**Where we stand today**

| | Evidence we have | Honest state |
|---|---|---|
| Phone | Harness: every app, phone viewport, a11y enforced | Layout good. Trust gaps (lost work, empty-on-failure, stale on resume) fixed locally in NoteGeek/TodoGeek, only *identified* elsewhere |
| Tablet | None. No tablet viewport existed before today | Unknown. Code reading says width-only breakpoints and mouse-sized targets on touch |
| Desktop | Harness: 1280×900 pass | Works; mostly a phone column in a wide window |
| Real devices | None | Pen, palm, keyboard, Back, fullscreen all unverified |

Sources: `NOTEGEEK_TODOGEEK_REVIEW_2026-11.md` (N/T items, e.g. 4.5),
`SUITE_REVIEW_2026-11.md` (other apps and shared plumbing).

**What "good" means — the bar each app must clear**

1. **Nothing typed is lost**: backgrounding, Back, a failed save, a second device.
2. **A failure never looks like "empty"**; data refreshes on return to the app.
3. **Android Back closes the top layer** (sheet, dialog, menu, editor) before leaving.
4. **Targets sized by pointer, not width**: 44 px on touch at any width; hover actions have a touch equivalent.
5. **Each form factor has a layout made for it**: phone single column; tablet rail + two panes where the app has a list and a detail; desktop uses the width and has keyboard support.
6. **It is proven**: harness scenes pass on phone, tablet portrait, tablet landscape and desktop, including empty / loading / error / offline states — and a device session has confirmed what a harness can't.

---

## Phase 0 — Land wave 1 (in progress)

NoteGeek and TodoGeek lost-work fixes, the pen/sketch fixes, shared
`useBackToClose` and `useFormFactor`, tablet viewports in the harness.

- Finish the two running agents; run every suite on a quiet machine; commit.
- Settle the two gateway tests that are red outside this work (FitnessGeek date window, AI timeout).
- **Deploy needs Chef's go-ahead.** Order: gateway first, confirm, then the UIs. First boot rebuilds NoteGeek's word index and re-embeds the library once.
- **Exit:** all suites green, harness green on phone + desktop for both apps, deployed and checked live.

## Phase 1 — Measure: first tablet run of every app (~1 day)

Nothing has ever been looked at on a tablet. Find out before designing.

- Run the harness with the new 800×1280 and 1280×800 viewports across all 11 apps.
- Add the missing state scenes per app: empty, loading, error, offline (none exist today).
- Triage into: broken (overflow, unreachable control, clipped), poor (small targets, stretched phone), fine.
- **Output:** `DOCS/TABLET_BASELINE_2026-11.md` — per app, per viewport, with screenshots. This re-ranks Phases 4 and 5 with evidence.
- **Exit:** every app has a tablet baseline; tablet runs in CI for at least NoteGeek and TodoGeek without blowing the job time.

## Phase 2 — Shared foundations (~3–4 days)

Fix each class once, in shared code, then apply it everywhere.

| # | Item | Covers |
|---|---|---|
| 2.1 | Gateway: a presented-but-bad token answers 401, not anonymous; one `requireUser` and one UNAUTHENTICATED shape for all modules | Empty-lists-on-expiry in every app (FlockGeek worst) |
| 2.2 | api-client: timeouts on refresh and `/api/me`; a pre-reload / pre-redirect hook so apps can save drafts | App freeze on a dead connection; lost drafts |
| 2.3 | `useRefetchOnResume` in `packages/ui` (visibility + online, throttled) | FitnessGeek, NewsGeek, StartGeek staleness |
| 2.4 | `useUnsavedGuard` on top of `useBackToClose` (confirm on Back/Escape/backdrop when dirty; optional local draft) | FitnessGeek recipe/food/meal, ThingGeek Edit/Attic, StoryGeek composer |
| 2.5 | A shared "couldn't load · Retry" state component | FlockGeek, StartGeek, NewsGeek |
| 2.6 | Shared layout primitives: `GeekNavRail` (72 px, 600–1200 px), `GeekTwoPane` (list \| detail, collapses to routes on phone), pointer-based target tokens | Every app's tablet/desktop layout |
| 2.7 | Consolidate the per-app back-to-close hooks (GameGeek, FitnessGeek) onto the shared one | Back closing the wrong layer |
| 2.8 | CI jobs for `task-grammar` and `schemas`; shared-package changes run the consuming app suites | Regressions from shared changes |

- **Exit:** each primitive has tests and is used by at least one app; all app suites green.

## Phase 3 — NoteGeek and TodoGeek layout (~2 weeks)

The remaining tiers of the first review. These two are the daily drivers and
the pen tablet's main apps, so they go first and prove the primitives.

- **NoteGeek:** nav rail (D9); two-pane list | note from ~840 px landscape, three-pane from 1200 px (4.5); Split view fixed (4.8); keyboard-up behaviour on landscape tablets (4.9); desktop keyboard — new note, J/K, Ctrl+K switcher (4.10); row hover/right-click actions (4.11); one search box (4.12).
- **NoteGeek sketch, remainder:** long sketches read in bands (2.7, small gateway change); chrome folds away above the canvas; lasso, scribble-erase, pages left as later bets.
- **NoteGeek phone, remainder:** tappable checklists (3.3), new-note in one tap (3.4), scroll/filter kept (3.6 — falls out of two-pane), version history on a phone (3.7), 3.8–3.12, Tier 6 polish.
- **TodoGeek:** rail; two-pane Today at ≥ 1100 px (4.6); week board on Upcoming (4.7); keyboard — add from anywhere, priority keys, roving focus (4.10); hero collapse on scroll (3.15 remainder).
- **Exit:** both apps green on all four viewports; Chef has used both on the Lenovo and signed off the layouts.

## Phase 4 — Other apps: trust fixes (~4–5 days)

The small build passes from the suite review, applying Phase 2's shared pieces.
Order by harm:

1. **ThingGeek** — Edit drops late uploads; UTC "today"; Walk discards unsaved creates; unsaved guard.
2. **FitnessGeek** — dose log "unknown" not "0 taken"; 100-row truncation; resume refetch; form guards; Home refetch storm.
3. **StoryGeek** — duplicate turn after a client timeout; per-story turn lock; composer draft. (Transcript storage is a separate, larger item.)
4. **StartGeek** — duplicate captures (send `clientId`); error and startup states.
5. **BookGeek** — duplicate on retry; dropped progress save; orphaned readings.
6. **NewsGeek, FlockGeek, GameGeek** — resume refresh and scroll restore; egg-record fetch and error state; delete wording.

- **Exit:** each fix has a test that goes red when reverted; bar items 1–3 hold in every app.

## Phase 5 — Other apps: tablet and desktop layout (size set by Phase 1)

Do not size this before the baseline exists. Expected shape:

- Apply rail + pointer-based targets everywhere (mostly mechanical once 2.6 exists).
- Two-pane where the app is list → detail: BookGeek, GameGeek, ThingGeek, NewsGeek (list | story), FitnessGeek (log | detail on tablet landscape).
- Leave alone what is already fine; StartGeek is a dashboard and may need only target sizing.
- Each app keeps its own look (Arcade Sticker, Used Bookstore, Moving Day…); layout comes from shared primitives, styling from the app theme.
- **Exit:** every app green on all four viewports with state scenes.

## Phase 6 — Device sessions with Chef (two × ~1 hour)

What no harness can show. One after Phase 0 deploys, one after Phase 3.

- **Lenovo + pen:** lag on a 1–3 MB sketch, palm before first stroke and on the toolbar, fullscreen pickers, pen button (`/labs/pen`), CSS width in both orientations, left-handed bar.
- **S26:** Back closing layers in every app, sheets above the keyboard, backgrounding mid-edit and restore, offline save then reconnect, share sheet, haptics, S Pen eraser.
- **Two devices:** the conflict dialog; refresh on return.
- **Transcription:** the new prompt on real handwritten marks; a 3–5-screen sketch.
- Findings go to `SUITE_TODO.md` the same day.

## Phase 7 — Offline-first (the larger bet; decide after Phase 3)

Persisted cache plus an outbox keyed by `clientId`, NoteGeek and TodoGeek first.
This is what makes a phone PWA trustworthy on a train. Several days per app; it
should not block Phases 1–6.

---

## Order and dependencies

```
0 land wave 1 ──► 1 tablet baseline ──► 2 shared foundations ──┬─► 3 NoteGeek/TodoGeek layout ──► 6b device
        └──► 6a device session                                 ├─► 4 other apps: trust
                                                               └─► 5 other apps: layout (after 1 and 3)
                                                                                    7 offline-first (after 3)
```

Phases 3 and 4 can run in parallel (different apps). Rough total for 0–6:
**4–5 weeks of agent-paced work**, most of it Phase 3; Phase 5 is unsized until
the baseline.

## How it will be run

- Parallel agents with strict file ownership; one commit per coherent change; gateway before UI.
- Every fix ships with a test that fails when the fix is reverted.
- Harness with `--enforce-a11y --desktop --tablet` before any UI push; full api suite before any gateway push.
- No deploy without Chef's go-ahead; work log and `SUITE_TODO.md` updated as work lands.

## Decisions — made 2026-11-15

Chef, 2026-11-15: the tablet is held **portrait** and is used for **NoteGeek,
TodoGeek, FitnessGeek, BookGeek and ThingGeek**; "make the decisions and
document them and get it all done". The calls below are Sage's, made on that
instruction. Each is cheap to reverse unless it says otherwise.

| # | Decision | Why |
|---|---|---|
| P1 | Done — wave 1 deployed 2026-11-15. | |
| P2 | **One shared pattern**, built once in `packages/ui`: `GeekNavRail` and `GeekTwoPane`. Each app keeps its own look. | Five apps need it; five inventions would drift. |
| P2a | **Portrait tablet (800 px) = rail + one pane.** Two panes only from 1024 px wide (landscape tablet, desktop). | Chef holds it portrait; 800 px minus a rail is too tight for list + detail. |
| P2b | Two-pane only where the app is list → detail: NoteGeek, TodoGeek, ThingGeek. BookGeek and FitnessGeek get the rail and more columns, not two panes. | A cover grid and a dashboard get worse when split. |
| P3 | Tablet layout work covers the five apps above. The other six must not break at tablet size (baseline run, fix what is broken) and get nothing more. | Follow use, not completeness. |
| P4 | See S-D1…S-D5 in `SUITE_REVIEW_2026-11.md` § Decisions. | |
| P5 | **Offline-first stays a later bet.** Not part of this run. | Several days per app, and it should follow the layout work. |
| — | **Deploys:** "get it all done" is read as the go-ahead to ship in gated increments — gateway first, confirmed live, then UIs; every push behind green tests and the harness. | Chef's standing style: verified per-chunk commits, incremental deploys. |
| — | **Not decided here, still Chef's:** the `$unset` of BookGeek's legacy reader fields (hard to undo), the nginx upload cap, and Phase 6 device sessions (need Chef and the devices). | |

## Decisions needed from Chef (answered above)

| # | Question | Needed by |
|---|---|---|
| P1 | Deploy wave 1 when it is green? | Phase 0 |
| P2 | Tablet rail and two-pane as the suite-wide pattern (not per-app inventions)? | Phase 2 |
| P3 | Which apps do you actually use on the tablet and on desktop? Phase 5 should follow use, not completeness | Phase 1 |
| P4 | The five policy questions in `SUITE_REVIEW_2026-11.md` (S-D1…S-D5) | Phase 4 |
| P5 | Offline-first: commit to it, or keep as a later bet? | After Phase 3 |

## Risks

- **Shared-package changes touch every app.** Mitigation: Phase 2.8 first, and all app suites on every shared change.
- **Layout work on apps with distinct identities** can flatten them. Mitigation: primitives carry structure only.
- **Harness time.** Four viewports × state scenes may push the CI job past its budget; shard by app.
- **Unverified until a device session.** Anything pen- or keyboard-related stays marked unverified in the docs until Phase 6.
