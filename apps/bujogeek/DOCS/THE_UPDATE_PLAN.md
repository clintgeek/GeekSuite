# BujoGeek — The Update Plan

*A working document to track the premium overhaul, what's done, what's untested, and what's still pending.*

Last updated: 2026-04-12

---

## The Goal

Take BujoGeek from a "dated task admin panel" to a **daily-driver planner app that feels like a $49/month premium product** — distinctive visual identity, keyboard-first interaction, and complete ritual support (Today → Review → Plan). This is specifically motivated by needing a trusted daily planner for a new job starting Monday 2026-04-13.

Aesthetic direction already committed in `THE_UI_PLAN.md`: **"Analog Soul, Digital Spine"** — editorial/stationery planner aesthetic with Fraunces (display) / Source Sans 3 (body) / IBM Plex Mono (mono), warm parchment backgrounds, GeekSuite blue anchor, sage/amber/red/plum aging states, Lucide icons, Framer Motion motion.

---

## Status Legend

- ✅ **Shipped** — committed and (where possible) parse-checked
- 🧪 **Shipped, needs testing** — in the code but the user flow hasn't been verified end-to-end
- ⚠️ **Shipped, known rough edge** — works but has a minor issue to revisit
- 🚧 **Not started**
- ❌ **Attempted, reverted** — tried, backed out, needs a different approach

---

## Phase 1: Visual Foundation (mostly ✅)

| Item | Status | Notes |
|------|--------|-------|
| Font trifecta loaded (Fraunces / Source Sans 3 / IBM Plex Mono) | ✅ | In `index.html` |
| Theme colors (parchment / ink / aging / priority) | ✅ | `theme/colors.js` |
| MUI component overrides | ✅ | `theme/theme.js` |
| Lucide icons on new surfaces | ✅ | Legacy `@mui/icons-material` still in old components (TaskList, TaskCard, TaskFilters, AppLayout, MonthlyLog, BottomNav) — those are dead code from pre-redesign |
| Dark mode tokens | ✅ | `darkColors` exported |
| Dark mode QA on new components | 🧪 | All conditionals are in place (SkeletonLoader, TaskRow signifier, ReviewCard chips/buttons fixed) but hasn't been eyeballed under dark mode |

---

## Phase 2: Plan Views (✅)

| Item | Status | Notes |
|------|--------|-------|
| `MonthlyCalendar.jsx` — editorial planner spread | 🧪 | Dotted grid, Fraunces month name, mono year, task mark glyphs, Framer Motion crossfade on month nav |
| `WeeklySpread.jsx` — gutter + task list per day | 🧪 | Fraunces italic day names, today warm fill, "TODAY" pill, italic empty state |
| `PlanPage.jsx` — editorial segmented tabs | 🧪 | Framer Motion layoutId underline with spring physics |
| `BacklogList.jsx` — plum-tinted stale section | 🧪 | Dotted dividers, italic "still relevant?" prompts |

**Test:**
- Navigate to `/plan/monthly` — month name in Fraunces serif, dots on days with tasks, today cell warm
- Change months — smooth crossfade, no flicker
- `/plan/weekly` — today's row highlighted, task count chip on each day
- `/plan/backlog` — stale tasks (30+ days old) in plum section with prompt

---

## Phase 3: Task Surface (✅)

| Item | Status | Notes |
|------|--------|-------|
| `SectionHeader` — new `size="display"` variant | ✅ | Fraunces serif title + italic caption + dotted rule |
| `TodaySection` uses `size="display"` | ✅ | |
| `TaskRow` animated strikethrough | 🧪 | Framer Motion `scaleX 0→1` over 320ms on completion. Replaces instant CSS line-through |
| `OverdueSection` warm amber tint | 🧪 | Dashed amber left rule, italic "N tasks still waiting" caption, editorial header |
| `TaskRow` focus ring (keyboard nav) | 🧪 | Primary-colored outline + warm bg tint when focused |
| `TaskRow` signifier/tag dark mode | ✅ | All hardcoded light ink colors now `isDark`-conditional |

**Test:**
- Complete a task — watch the strikethrough draw from left to right
- Undo completion — strikethrough retracts
- Press `j` on Today — focus ring appears on first task, scrolls into view
- Overdue section — amber tint visible, Fraunces serif "Carried forward" title

---

## Phase 4: Review Flow (✅)

| Item | Status | Notes |
|------|--------|-------|
| `ReviewPage` editorial masthead | 🧪 | Italic Fraunces eyebrow + display title + italic stats |
| Editorial segmented mode toggle | 🧪 | Same spring-underline pattern as PlanPage |
| `ReviewCard` animated exit on action | 🧪 | Slides right on Keep/Tomorrow/Backlog |
| `ReviewComplete` — the emotional payoff | 🧪 | SVG fountain-pen flourish drawn via `pathLength`, Fraunces italic blessing ("Close the book. Rest easy."), decorative dotted rule, italic serif "Back to today" button |
| `ReviewProgress` mono tabular-nums | ✅ | Animated width bar, serif state on completion |
| `ReviewCard` dark mode (buttons, chips) | ✅ | All light ink colors now conditional |

**Test:**
- Go to `/review` — if tasks are aging, see cards
- Hit Keep Today on one — it slides right and disappears
- Resolve ALL cards — see the SVG flourish draw, the blessing, the button
- Switch between "End of Day" and "Weekly Review" tabs — underline glides

---

## Phase 5: Keyboard-first Interaction (🧪)

| Shortcut | Action | Status |
|----------|--------|--------|
| `j` / `k` | Navigate focus up/down | 🧪 |
| `x` | Toggle complete focused task | 🧪 |
| `e` | Edit focused task | 🧪 (fixed — was broken due to state-updater antipattern) |
| `d` | Delete focused task | 🧪 |
| `Escape` | Clear focus | 🧪 |
| `Cmd/Ctrl+K` | Command palette | ✅ (pre-existing) |
| `Cmd/Ctrl+N` | Focus quick-add input | 🧪 |
| `g t` | Go to Today | 🧪 |
| `g r` | Go to Review | 🧪 |
| `g p` | Go to Plan | 🧪 |
| `?` | Keyboard help overlay | 🧪 |
| `1` / `2` / `3` (review) | Keep / Tomorrow / Backlog | 🧪 |
| Visual focus ring on `TaskRow` / `ReviewCard` | 🧪 | Primary-colored outline |
| Scroll-into-view on focus change | 🧪 | Uses `data-task-id` attribute |

**Known behavior:**
- Shortcuts are suppressed in inputs, textareas, contentEditable, and inside `[role="dialog"]`
- Modifier keys (Cmd/Ctrl/Alt) bypass nav handlers (except explicit Cmd+N/Cmd+K)

**Test:**
- Open help overlay with `?`
- Focus a task with `j`, edit with `e` (dialog opens)
- `gtr` chord sequence (Go Today, Go Review)
- Open command palette with `Cmd+K`, jump to quick-add with `Cmd+N`

---

## Phase 6: Templates (🧪)

Templates went from **half-broken** to **functional**:

| Item | Status | Notes |
|------|--------|-------|
| Create template (dialog) | 🧪 | `TemplateEditor.jsx` — Fraunces serif header, IBM Plex Mono content field, live task count |
| Edit template | 🧪 | Same dialog |
| Delete template | ✅ | Existing flow |
| Apply template = **creates tasks** | 🧪 | **This is the big change.** Each line of the template content becomes a task with today's due date. Not a journal entry. |
| Variable interpolation `{{name}}` | 🧪 | Detects placeholders, renders input fields, substitutes before creating tasks |
| Live preview before apply | 🧪 | Shows exact tasks with fake checkbox circles |
| `TemplateList` editorial facelift | ✅ | Lucide icons, Fraunces serif names, type chip in mono, dotted apply-button row |
| `TemplateFilters` cleanup | ✅ | Lucide search/X, simplified layout |
| Templates link in Sidebar | ✅ | `LayoutTemplate` icon |
| Templates link in MobileTabBar More | ✅ | |

**Test the full workflow:**
1. Click "New Template" → dialog opens
2. Name: "Morning Standup", content:
   ```
   Review yesterday's {{focus}}
   Plan today's main goal
   Check CI pipeline
   Reply to {{person}} about {{topic}}
   ```
3. Save
4. Click "Apply Template" on it
5. Fill in the variables
6. Hit "Create 4 Tasks"
7. Navigate to Today — should see all 4 tasks

---

## Phase 7: Drag-and-Drop Reorder (🧪 — fragile path)

| Item | Status | Notes |
|------|--------|-------|
| Reorder via drag on Today | 🧪 | Uses `framer-motion` `Reorder.Group` / `Reorder.Item` (already installed — no new dep) |
| Persist order via `saveDailyOrder` | 🧪 | Calls existing GraphQL mutation |
| Visual lift during drag | 🧪 | `scale: 1.02`, shadow, z-index via `whileDrag` |
| Local state updates immediately | 🧪 | Parent resets custom order when server tasks change |

**Known limitation:**
- Only the Today section's active tasks are reorderable (not Overdue, not Completed)
- Custom order resets on any server-side task change (new task, toggle, etc.)

**Test:**
- Grab a task, drag up/down — order updates
- Refresh the page — order should persist

**Failed first attempt:** Used `@dnd-kit` which required adding workspace deps → broke pnpm `--frozen-lockfile` → reverted to framer-motion. See commit `8baf05d`.

---

## Phase 8: Dialog & Editor Polish (🧪)

| Item | Status | Notes |
|------|--------|-------|
| `TaskEditor` editorial rewrite | 🧪 | Fraunces header with italic caption, dotted section dividers, mono signifier glyph in Type selector, colored priority dots |
| `TemplateEditor` | 🧪 | Same editorial pattern — Fraunces header, IBM Plex Mono content textarea, task count preview |
| `KeyboardHelp` overlay | 🧪 | Fraunces title, grouped sections with dotted dividers, IBM Plex Mono kbd badges |
| `TemplateApply` dialog | 🧪 | Live preview with fake checkboxes, variable inputs |

---

## Data Layer Fixes (✅)

| Issue | Status | Commit |
|-------|--------|--------|
| `updateTask` 400: `taskType` virtual + `createdAt`/`updatedAt` not in UpdateTaskInput | ✅ | `d3ada8d` |
| `updateTask` input sanitization (whitelist, not blacklist) | ✅ | `d0efc65` |
| Task ID resolution (`task.id` not `task._id` on GraphQL shape) | ✅ | `b70b6b1` |
| Apollo error surfacing (was reading REST `err.response` shape) | ✅ | `d3ada8d` |

---

## What's NOT started (pending for next session)

- 🚧 **Recurring tasks UI** — backend model supports it, no frontend. Useful for daily standups, weekly 1:1s, monthly reviews.
- 🚧 **Subtasks UI** — backend has `parentTask` / `subtasks` fields. Needs inline expand/collapse + add-subtask UI in `TaskRow`.
- 🚧 **Mobile swipe gestures** — swipeable review cards (right = keep, left = backlog). Framer Motion gesture handlers.
- 🚧 **`CompletedSection` keyboard integration** — currently collapsed tasks aren't in the flat navigable list. Should auto-expand on focus-into.
- 🚧 **Drag-and-drop** between days in `WeeklySpread`.
- 🚧 **Command palette extension** — add "apply template X" commands so Cmd+K can launch templates.
- 🚧 **First-run onboarding** — no explainer for what templates are, no tutorial for keyboard shortcuts.

---

## Lessons Learned (things that broke)

1. **Never run `pnpm install` on a CIFS/SMB mount.** The symlink resolution fails (`ENOTSUP`) and the cleanup step can destroy workspace package source files. Always install inside Docker or on a native filesystem.

2. **Docker `--frozen-lockfile` is strict.** Adding any dep to a workspace package requires a full `pnpm install` to update the lockfile. If you can't run pnpm install cleanly, you can't add deps. **Prefer existing libs** (e.g., framer-motion's `Reorder` instead of `@dnd-kit`).

3. **Side effects in React state updaters are unreliable in React 18.** The original `useKeyboardNav` called `onEdit(task)` inside `setFocusedIndex(prev => ...)` — this silently failed for `e`/`x`/`d` in production. Read state from a ref, separate concerns. Fixed in `77195e1`.

4. **GraphQL shape mismatches are a common bug class.** `UpdateTaskInput` is a specific input type — you can't just spread the task object into it. Whitelist the fields that the input type accepts, not blacklist fields you know are bad.

5. **Task IDs from GraphQL are `task.id`, NOT `task._id`.** REST/Mongoose gives `_id`, GraphQL normalizes to `id`. Use `task.id || task._id` for compatibility.

6. **"It should work" ≠ "I verified it works".** We piled up 16+ commits of visual polish without rebuilding. When the rebuild happened, multiple bugs were hiding. Next time: rebuild and smoke-test after every major phase.

---

## Commit Ledger

```
8baf05d bujogeek: switch drag-and-drop to framer-motion Reorder, revert Dockerfile
7369f92 bujogeek: restore package.json with @dnd-kit deps (later reverted)
b5c905f bujogeek: drag-and-drop task reorder in Today view (later switched to framer)
d72fdbd fix: restore packages/ source files + clean up Dockerfile comment
7434267 bujogeek: polish pass — Lucide icons in TemplateFilters + cleanup
5359e4c bujogeek: add TemplateEditor dialog + wire create/edit into TemplateList
7167dcf bujogeek: rewrite template apply flow to create tasks (not journal entries)
04a9d8c bujogeek: dark mode QA fixes across TaskRow, ReviewCard, SkeletonLoader
77195e1 bujogeek: fix e-key handler + add Templates & shortcuts to navigation
06dac9b bujogeek: keyboard help overlay + editorial TaskEditor + TemplatesPage masthead
e462032 bujogeek: keyboard-first interaction layer (j/k/x/e/d + go-to chords)
d3ada8d bujogeek: fix updateTask 400 — strip virtual fields + harden both sides
d0efc65 bujogeek: fix updateTask 400 — sanitize input to UpdateTaskInput fields
3af9c01 bujogeek: premium editorial polish across all plan, review, and task surfaces
b70b6b1 bujogeek: fix task ID — use task.id (GraphQL) with task._id fallback
```

---

## Testing Checklist (what to verify post-deploy)

### Today view
- [ ] Page header: date in Fraunces, italic greeting for today, stats line
- [ ] Inline quick-add has data-quickadd attribute (Cmd+N focuses it)
- [ ] Overdue section (if tasks exist) has amber tint + serif title
- [ ] Today section uses display SectionHeader variant
- [ ] Completing a task draws the strikethrough (not instant)
- [ ] Drag a task to reorder — it persists on refresh
- [ ] `j`/`k` moves focus ring, `x` toggles, `e` opens editor, `d` prompts delete

### Review view
- [ ] Editorial masthead with italic eyebrow + display title
- [ ] Segmented mode toggle with spring underline
- [ ] Card slides right when resolved
- [ ] ReviewComplete flourish draws itself when all done
- [ ] `1`/`2`/`3` shortcuts work on focused card

### Plan view
- [ ] MonthlyCalendar: Fraunces month name, dotted grid, aging-colored dots on days
- [ ] Month nav: smooth crossfade
- [ ] WeeklySpread: gutter with Fraunces day names, today highlighted
- [ ] PlanPage tabs: Fraunces labels, spring underline glides
- [ ] Backlog: stale section plum-tinted, "still relevant?" prompts

### Templates (THE BIG TEST)
- [ ] Navigate to Templates (sidebar link or g+p doesn't go here — needs direct link)
- [ ] Create a template with multi-line content and `{{variable}}`
- [ ] Apply it — fill in vars, see task preview, hit create
- [ ] Verify tasks appear on Today

### Keyboard
- [ ] `?` opens help overlay with all shortcuts
- [ ] `Cmd+K` opens command palette
- [ ] `Cmd+N` focuses quick-add
- [ ] `g t` / `g r` / `g p` navigate correctly
- [ ] Shortcuts suppress while typing in a TextField

### Dark mode
- [ ] Toggle dark mode — verify all new surfaces look correct
- [ ] TaskRow signifier badge readable
- [ ] ReviewCard tags readable
- [ ] OverdueSection warm tint looks good in dark
- [ ] MonthlyCalendar dotted grid visible
- [ ] SkeletonLoader shimmer uses dark-mode gradient

### Mobile
- [ ] MobileTabBar shows: Today, Review, Plan, Tags, More
- [ ] "More" includes Templates, Keyboard Shortcuts, Logout
- [ ] Sidebar hamburger on mobile works
- [ ] TaskRow tap-to-reveal actions works
