# BujoGeek — The Update Steps

*Step-by-step execution guide for the BujoGeek overhaul. Designed to be followed by any competent developer without much oversight.*

Last updated: 2026-04-12

---

## How to Use This Document

Each step is **atomic** — it can be started and finished in one sitting. Each step has:

- **ID**: reference for tracking (e.g., `T1.3`)
- **Priority**: 🔴 critical (blocks daily use) / 🟠 high (important for polish) / 🟡 medium (nice-to-have)
- **Goal**: what you're trying to accomplish
- **How to verify**: concrete steps to confirm it works
- **If it doesn't work**: common failure modes and fixes
- **Est. time**: rough estimate (if it takes significantly longer, ping Chef)

**Before you start ANY step:**

1. Read `THE_UPDATE_PLAN.md` for the full overhaul context
2. Read `CONTEXT.md` for project-wide context
3. Make sure you're on the `storygeek-repairs` branch (or the active branch)
4. Confirm the last known-good build: run the app and make sure login + Today view load

**Rules:**

- **One step = one commit.** Don't batch changes across steps.
- Test in the actual running app, not just by reading code.
- If a step is broken in a way that's not listed, pause and document it.
- Don't install new npm/pnpm dependencies without checking with Chef first (the SMB mount + symlinks issue will bite you).
- Commits should follow the format: `bujogeek: <short description>`

---

## Prerequisites

### Environment

```bash
# Ensure you're on the right branch
cd /mnt/media/Projects/GeekSuite
git status

# Pull latest (if working with a team)
git pull origin storygeek-repairs
```

### Build & deploy

To rebuild bujogeek after any code change:

```bash
cd /mnt/media/Projects/GeekSuite
./build.sh bujogeek --no-cache
```

**Do NOT run `pnpm install` on the host.** The CIFS/SMB mount can't handle pnpm's symlinks and will corrupt the workspace package source files. Let Docker handle the install.

After build:
- Production URL: `https://bujogeek.clintgeek.com`
- The container auto-restarts as part of `./build.sh`

### What "done" looks like

A step is done when:
1. The code change is committed
2. You've rebuilt and verified in the running app (not just read the code)
3. The item's status in `THE_UPDATE_PLAN.md` is updated (🧪 → ✅)

---

## Phase T: Testing the Overhaul (🔴 DO THIS FIRST)

A lot of code shipped without testing. These steps verify what's already in the codebase works as intended. If any test FAILS, open a separate debugging step and fix before moving on.

### T1. Plan Views — verify editorial aesthetic

#### T1.1 MonthlyCalendar visual check 🔴

**Goal**: Confirm the month view renders as an editorial planner spread, not a data grid.

**How to verify**:
1. Navigate to `/plan/monthly`
2. Check the masthead:
   - Italic "Looking ahead" (or "On the page") caption above the month name
   - Month name in large Fraunces serif (e.g., "April")
   - Year next to it in IBM Plex Mono, smaller and muted (e.g., "2026")
   - Stats line below: "N tasks on the page · X overdue · Y done"
3. Check the grid:
   - Weekday headers in italic Fraunces (Monday, Tuesday...)
   - Day numbers in Fraunces tabular-nums
   - Dotted grid lines (not solid)
   - Today cell: warm parchment fill + primary-colored top rule + mono "TODAY" tag
   - Days with tasks: small colored dots at the bottom
4. Click the left/right chevrons to change months
   - Grid should crossfade (not snap)
5. Check the legend strip at the bottom: "Today/done", "Aging", "Overdue", "Stale" with colored dots

**If it doesn't work**:
- Dots missing → check `getTaskAge` returns valid levels
- No crossfade → check `framer-motion` imports in `MonthlyCalendar.jsx`
- Layout broken on mobile → check responsive `sm`/`xs` breakpoints

**Est. time**: 10 min

#### T1.2 WeeklySpread visual check 🔴

**Goal**: Confirm the week view renders as a planner spread.

**How to verify**:
1. Navigate to `/plan/weekly`
2. Check the masthead (same pattern as monthly)
3. Each day row:
   - Gutter on the left with Fraunces italic day name ("Monday")
   - Mono date underneath ("Apr 12")
   - If it's today: warm parchment fill + primary left rule + bordered "TODAY" pill
   - Dotted rule between days
4. Empty day should show italic "— nothing on this day"
5. Navigate prev/next week — crossfade

**Est. time**: 5 min

#### T1.3 PlanPage tabs 🟠

**Goal**: Editorial segmented tabs work with spring-physics underline.

**How to verify**:
1. On `/plan`, click between Weekly / Monthly / Backlog tabs
2. Underline should glide smoothly with a slight spring bounce (not snap)
3. Tab labels are Fraunces serif (not default sans)
4. Active tab is bolder and darker than inactive

**Est. time**: 2 min

#### T1.4 BacklogList stale prompts 🟡

**Goal**: Old tasks surface with "still relevant?" prompts.

**How to verify**:
1. Navigate to `/plan/backlog`
2. If you have tasks older than 30 days, they should be in a plum-tinted "Stale" section
3. Each stale task has an italic Fraunces caption: "— this has been here N days. Still relevant?"
4. If no backlog: editorial empty state with "Create your first template" CTA

**Est. time**: 2 min

---

### T2. Task Surface — verify interaction

#### T2.1 Animated strikethrough on completion 🔴

**Goal**: Completing a task draws a line through it (not instant).

**How to verify**:
1. On Today, click the checkbox of any task
2. Watch the text — a line should **draw from left to right** over ~320ms
3. Uncheck it — line retracts

**If it doesn't work**:
- Instant line-through = the Framer Motion overlay isn't rendering. Check `TaskRow.jsx` has the `motion.div` with `scaleX` animation
- No line at all = check `isCompleted` prop flows through

**Est. time**: 2 min

#### T2.2 Keyboard navigation on Today 🔴

**Goal**: Vim-style navigation works for task lists.

**How to verify** (in order):
1. On Today, press `j` — a blue focus ring should appear on the first task
2. Press `j` again — focus moves to the next task (scrolls into view if needed)
3. Press `k` — focus moves back up
4. Press `x` — focused task toggles complete (strikethrough draws)
5. Press `e` — task editor opens for focused task
6. Close editor, press `d` — delete confirmation appears
7. Press `Escape` — focus ring disappears

**If it doesn't work**:
- `j` does nothing = check `useKeyboardNav` is wired in `TodayPage.jsx`
- `e` does nothing = previously this was broken due to a React 18 state-updater antipattern; verify the hook uses `focusedIndexRef` (commit `77195e1`)
- Focus ring invisible = check `focused` prop reaches `TaskRow`

**Est. time**: 5 min

#### T2.3 Overdue section warm amber tint 🟠

**Goal**: Overdue tasks have a visually urgent warm background (not just a label).

**How to verify**:
1. Artificially age a task (edit it, set dueDate to 3 days ago) OR wait
2. On Today, the Overdue section should have:
   - Warm amber background tint
   - Dashed amber left rule
   - Fraunces serif "Carried forward" title + italic "N tasks are still waiting" caption
   - Dotted dividers between tasks

**Est. time**: 3 min

---

### T3. Review Flow — verify editorial moments

#### T3.1 Review masthead + tabs 🟠

**Goal**: ReviewPage has editorial treatment.

**How to verify**:
1. Navigate to `/review`
2. See italic Fraunces eyebrow ("End of the day" / "Well tended" / "A quiet moment" based on state)
3. Display serif title: "Review"
4. Italic stats caption
5. Segmented tabs (End of Day / Weekly Review) with spring underline

**Est. time**: 2 min

#### T3.2 Review card exit animation 🟠

**Goal**: Cards slide right when you resolve them.

**How to verify**:
1. On Review (with aging tasks), hit "Keep Today" on a card
2. The card should slide to the right and fade out (not instant)
3. Task moves to Today's list

**Est. time**: 2 min

#### T3.3 The ReviewComplete flourish 🔴 (THE MONEY SHOT)

**Goal**: The emotional payoff moment works.

**How to verify**:
1. On Review, resolve every aging card (Keep/Tomorrow/Backlog all work)
2. Once the last card disappears, the screen should show:
   - An SVG fountain-pen flourish **drawing itself** (animated pathLength)
   - "Evening, [month day]" in italic Fraunces
   - Huge display serif "All caught up."
   - Italic blessing: "You've tended to everything aging on the page. Close the book. Rest easy."
   - Decorative dotted rule
   - Italic Fraunces "Back to today" outlined button

**If it doesn't work**:
- No flourish = check `ReviewComplete.jsx` imports motion from framer-motion
- Shows instantly without animation = check `initial` / `animate` props

**Est. time**: 3 min

#### T3.4 Review keyboard shortcuts (1/2/3) 🟠

**Goal**: Number keys act on the focused review card.

**How to verify**:
1. On Review, press `j` to focus a card
2. Press `1` — Keep Today (card slides right)
3. Focus next, press `2` — Tomorrow
4. Focus next, press `3` — Backlog
5. Press `d` — delete prompt

**Est. time**: 2 min

---

### T4. Templates — the full workflow 🔴

#### T4.1 Create a template 🔴

**Goal**: Template creation dialog works end-to-end.

**How to verify**:
1. Navigate to `/templates` (via sidebar link)
2. Click "New Template" — the TemplateEditor dialog opens (NOT a route navigation)
3. Fill in:
   - Name: "Morning Standup"
   - Description: "Daily standup prep"
   - Tasks (content field, one per line):
     ```
     Review yesterday's {{focus}}
     Plan today's main goal
     Check CI pipeline
     Reply to {{person}} about {{topic}}
     ```
   - Type: "Daily Log"
   - Tags: "work, standup" (press Enter after each)
4. See "4 tasks per application" counter below the content field
5. Click Create
6. See the template card appear in the list

**Est. time**: 5 min

#### T4.2 Apply a template 🔴

**Goal**: Applying a template creates real tasks.

**How to verify**:
1. Click "Apply Template" on the Morning Standup card
2. Dialog opens with the template name in Fraunces serif
3. See 2 variable input fields ("focus" and "person" + "topic")
4. Fill them in: `focus="deploy"`, `person="Sam"`, `topic="API design"`
5. Below, see live preview of 4 tasks with fake checkbox circles
6. The preview should show the filled-in values (e.g., "Review yesterday's deploy")
7. Click "Create 4 Tasks"
8. Toast: "Created 4 tasks from Morning Standup"
9. Navigate to Today — verify all 4 tasks exist with today's due date

**If it doesn't work**:
- Tasks don't appear = check network tab for GraphQL mutation errors
- Variables not substituting = check `TemplateApply.jsx` interpolation regex

**Est. time**: 5 min

#### T4.3 Edit a template 🟠

**Goal**: Editing works via dialog.

**How to verify**:
1. On templates list, click the pencil icon on a card
2. TemplateEditor opens pre-filled with the template data
3. Modify the content, save
4. Apply it again — verify the changes took effect

**Est. time**: 3 min

---

### T5. Keyboard & Discoverability

#### T5.1 Keyboard help overlay 🔴

**Goal**: `?` shows the shortcut reference.

**How to verify**:
1. From any page (not inside a text field), press `?`
2. Overlay opens with:
   - Fraunces serif "Keyboard Shortcuts" title
   - Italic eyebrow: "Quick reference"
   - Groups: Navigation / Task List / Review / Quick Entry Syntax
   - Key badges in IBM Plex Mono style
   - Dotted dividers between groups
3. Press `Escape` or click X to close

**Also test**: Click "Shortcuts" in the Sidebar bottom — same overlay opens.

**Est. time**: 2 min

#### T5.2 Go-to navigation chords 🟠

**Goal**: Two-key sequences navigate between views.

**How to verify**:
1. Press `g` then `t` within ~800ms — navigates to Today
2. `g` + `r` — Review
3. `g` + `p` — Plan
4. If you press `g` alone and wait, nothing happens (chord times out)

**Est. time**: 2 min

#### T5.3 Command palette + quick-add focus 🟠

**Goal**: `Cmd/Ctrl+K` opens palette, `Cmd/Ctrl+N` focuses quick-add.

**How to verify**:
1. `Cmd+K` anywhere — command palette opens (this is pre-existing)
2. `Cmd+N` — focuses the InlineQuickAdd input on Today (scrolls if needed)

**Est. time**: 2 min

---

### T6. Dark Mode 🟠

#### T6.1 Toggle dark mode and verify every surface

**Goal**: Every new surface renders correctly in dark mode.

**How to verify**:
1. Use the theme toggle in the TopBar to switch to dark mode
2. Visit every page/surface and confirm:
   - [ ] Today: task rows readable, signifier badges visible, overdue tint still warm
   - [ ] Review: cards readable, action button borders visible
   - [ ] Plan > Monthly: dotted grid visible, dots visible, today cell distinguishable
   - [ ] Plan > Weekly: today row highlighted
   - [ ] Plan > Backlog: stale plum tint readable
   - [ ] Templates: card borders visible, type chip readable
   - [ ] TaskEditor / TemplateEditor dialogs: all inputs readable
   - [ ] KeyboardHelp: kbd badges readable
   - [ ] SkeletonLoader: shimmer uses white-opacity gradient (not grey)
3. Toggle back to light mode — verify nothing's broken

**If something's unreadable**: find the hardcoded light-mode color in that component and wrap with `isDark ?` conditional.

**Est. time**: 15 min

---

### T7. Mobile 🟡

#### T7.1 Mobile navigation

**Goal**: Bottom tab bar + More drawer work.

**How to verify** (in browser dev tools, toggle mobile viewport, or on a real phone):
1. See bottom tab bar with: Today, Review, Plan, Tags, More
2. Active tab icon is filled/primary-colored
3. Tap "More" — bottom-sheet drawer opens with:
   - Templates
   - Keyboard Shortcuts
   - Logout
4. Tap any → correct action happens

**Est. time**: 3 min

#### T7.2 TaskRow tap-to-reveal on mobile

**Goal**: Tapping a task row reveals action buttons (desktop shows on hover).

**How to verify**:
1. On mobile viewport, tap a task row (not the checkbox)
2. Edit / Save as Note / Delete buttons appear
3. Tap another task — buttons move
4. Tap empty space — buttons hide

**Est. time**: 2 min

---

## Phase P: Pending Features (🚧 not started)

### P1. Recurring Tasks UI 🔴

**Goal**: Let users mark a task as recurring (daily / weekly / monthly). Essential for standups, weekly reviews.

**Context**: Backend `Task` schema supports recurrence. Check `/mnt/media/Projects/GeekSuite/apps/basegeek/packages/api/src/graphql/bujogeek/models/Task.js` for the exact fields — there should be something like `recurrence` or `recurrencePattern`.

**Steps**:

#### P1.1 Discover backend recurrence fields 🔴

1. Read `Task.js` schema
2. Check `UpdateTaskInput` in `typeDefs.js` — are recurrence fields present?
3. If NOT in the input type, you'll need to add them (be careful — this was a source of bugs, see lessons in `THE_UPDATE_PLAN.md`)
4. Document the exact field names and enum values in a comment at the top of your PR

**Est. time**: 30 min (investigation)

#### P1.2 Add recurrence section to TaskEditor 🔴

1. Open `components/tasks/TaskEditor.jsx`
2. Add a new "Details" subsection: "Repeats"
3. Add a Select dropdown: None / Daily / Weekly / Monthly
4. Wire to `formData.recurrence` or equivalent field
5. On save, include the recurrence field in the update

**Verify**:
- Create a new task, set it to Daily
- Refresh — the recurrence shows as Daily
- Hit Update — saves without 400 error

**If 400**: the field isn't in `UpdateTaskInput`. Go back to P1.1 and add it.

**Est. time**: 1-2 hours

#### P1.3 Show recurrence indicator on TaskRow 🟠

1. If a task has recurrence, show a small Lucide `Repeat` icon after the content
2. Tooltip: "Repeats daily" etc.
3. Dark mode conditional for the icon color

**Est. time**: 30 min

#### P1.4 Backend: auto-create recurring tasks 🔴

**Note**: This is likely already implemented on the backend if recurrence fields exist. If not, this is a backend task — talk to Chef before touching basegeek.

**Verify**:
- Create a recurring task set to Daily, due today
- Change system date (or wait until tomorrow)
- On Today view tomorrow, the task should appear again

---

### P2. Subtasks UI 🟠

**Goal**: Expand/collapse subtasks under a parent task. Add subtasks inline.

**Context**: Backend has `parentTask` and `subtasks` fields on `Task`.

**Steps**:

#### P2.1 Show subtask count badge on TaskRow 🟠

1. If `task.subtasks?.length > 0`, show a small mono badge: `▸ 3`
2. Click it to toggle expanded state (local to TaskRow)

**Est. time**: 30 min

#### P2.2 Render subtasks inline when expanded 🟠

1. Below the parent TaskRow, render each subtask with slight indent and smaller font
2. Checkbox + content, simpler than TaskRow
3. Completed subtask count updates parent badge

**Est. time**: 2 hours

#### P2.3 Add subtask inline 🟠

1. Below the subtask list, show a small "+ Add subtask" ghost button
2. Click → inline input appears, Enter to create
3. Uses the `addSubtask` GraphQL mutation (already in backend)

**Est. time**: 2 hours

---

### P3. Mobile Swipe Gestures 🟡

**Goal**: On mobile, swipe-right on review card = Keep, swipe-left = Backlog.

**How**: Framer Motion `drag="x"` with `onDragEnd` that checks x offset threshold.

#### P3.1 Wire drag to ReviewCard 🟡

1. Wrap `ReviewCard` in `<motion.div drag="x" />`
2. On dragEnd, if `offset.x > 100` call `onKeep`; if `offset.x < -100` call `onBacklog`
3. Animate card out in the direction of the swipe
4. Show subtle "← backlog" / "keep →" hint behind the card during drag

**Est. time**: 3 hours

---

### P4. CompletedSection in Keyboard Nav 🟡

**Goal**: Pressing `j` past the last active task should expand CompletedSection and focus into it.

**Steps**:

#### P4.1 Lift CompletedSection expanded state to TodayPage 🟡

1. Move `expanded` state from CompletedSection to TodayPage
2. Pass down as prop
3. Navigable task list becomes `[...overdue, ...active, ...(expandedCompleted ? completed : [])]`

**Est. time**: 1 hour

#### P4.2 Auto-expand on focus-into 🟡

1. If `focusedIndex` enters the completed range, call the expand setter
2. Visual: completed section smoothly expands with Framer Motion height animation

**Est. time**: 30 min

---

### P5. Command Palette Extensions 🟡

**Goal**: Add "Apply template X" commands to Cmd+K.

#### P5.1 Register template commands 🟡

1. In `components/shared/CommandPalette.jsx`, fetch templates via `useTemplates`
2. For each template, register a command: `Apply: {template.name}`
3. Action opens the TemplateApply dialog

**Est. time**: 1-2 hours

---

### P6. Drag Between Days in WeeklySpread 🟡

**Goal**: Drag a task from one day to another in the weekly view.

**How**: framer-motion `Reorder` doesn't support cross-container drops. You'd either need:
- HTML5 native drag-and-drop
- A custom Framer Motion solution with shared `layoutId`

**Est. time**: 4-6 hours (nontrivial)

---

### P7. First-Run Onboarding 🟡

**Goal**: On first login, show a brief 3-step walkthrough.

1. "Welcome — Today is your daily page"
2. "Create repeatable routines with Templates"
3. "Press `?` anytime to see shortcuts"

Persist a `hasSeenOnboarding` flag in user preferences.

**Est. time**: 3-4 hours

---

## Phase R: Rough Edges & Polish

### R1. TemplateList interior consistency 🟡

**Context**: `TemplateList.jsx` was given an editorial facelift but its inner components may still have older patterns.

#### R1.1 Audit TemplateApplier.jsx 🟡

Currently `TemplatesPage.jsx` renders `<TemplateApplier />` but its purpose overlaps with `TemplateApply.jsx`. Check if it's still used anywhere. If not, remove it from the page.

**Est. time**: 30 min

#### R1.2 Ensure empty state is used everywhere 🟡

Any `<Typography color="error">` or similar raw error states should use `<EmptyState>` with editorial treatment.

**Est. time**: 1 hour

---

### R2. Legacy Component Cleanup 🟡

**Context**: These components are from pre-redesign and may still be imported somewhere. Audit and delete if unused.

- `components/tasks/TaskList.jsx`
- `components/tasks/TaskCard.jsx`
- `components/tasks/TaskFilters.jsx`
- `components/tasks/DateNavigation.jsx`
- `components/DateNavigation.jsx` (NOTE: there are TWO)
- `components/layout/AppLayout.jsx` (replaced by AppShell)
- `components/monthly/MonthlyLog.jsx` (replaced by MonthlyCalendar)
- `components/navigation/BottomNav.jsx` (replaced by MobileTabBar)
- `components/yearly/` directory

#### R2.1 Grep for imports of each 🟡

For each file above:
```bash
cd /mnt/media/Projects/GeekSuite/apps/bujogeek/frontend/src
grep -r "from.*TaskList" --include="*.jsx" --include="*.js"
```

If zero results — delete the file.
If results — either replace the imports with the new component or leave the file.

**Est. time**: 1 hour

---

### R3. Optimistic Update Rollback 🟡

**Context**: Per the data layer audit in `THE_UPDATE_PLAN.md`, `updateTask` does optimistic UI updates but doesn't roll back on failure. If a mutation fails, the UI shows stale data.

#### R3.1 Add rollback to updateTask 🟡

1. Before mutation: save previous state
2. On mutation error: restore previous state + show error toast
3. On mutation success: keep new state

**Est. time**: 1-2 hours

---

### R4. Apollo Cache Hygiene 🟡

**Context**: Mutations don't `refetchQueries` — only do optimistic local updates. Multi-view scenarios may see stale data.

#### R4.1 Add cache updates to key mutations 🟡

Identify mutations that should invalidate other queries:
- `createTask` → invalidate `dailyTasks`, `weeklyTasks`, `monthlyTasks`, `allTasks`
- `updateTaskStatus` → same
- `deleteTask` → same
- `migrateTaskToFuture` → same (source AND destination dates)

Use Apollo's `update` function or `refetchQueries` on each mutation.

**Est. time**: 2-3 hours

---

## Commit Message Conventions

```
bujogeek: <imperative short description>

<optional body with details, why, tradeoffs>

Co-Authored-By: <your handle>
```

Examples:
- `bujogeek: add recurring task UI to TaskEditor`
- `bujogeek: fix subtask count badge positioning in dark mode`
- `bujogeek: delete unused TaskList.jsx legacy component`

---

## When You're Stuck

1. **Read the error carefully.** GraphQL errors usually tell you exactly what's wrong (wrong field name, missing variable, etc.). Check the Apollo error catch path — most fixes in this codebase were about extracting the real error message.
2. **Check `THE_UPDATE_PLAN.md` → "Lessons Learned"**. We've hit common issues: task ID resolution, input whitelist vs blacklist, React 18 state updater antipatterns.
3. **Don't install deps locally.** If you need a new npm package, discuss with Chef first. The SMB mount + pnpm symlinks = lost source files.
4. **Rebuild to test.** `./build.sh bujogeek --no-cache` after any code change.
5. **Ask.** Better to pause and confirm than to ship something half-broken.

---

## Priority Summary for Monday Launch

If you only have 4 hours before Monday 2026-04-13, do these in order:

1. **T2.2** Keyboard navigation on Today (5 min verify, essential for flow)
2. **T4.1 + T4.2** Templates create + apply (10 min verify, unlocks repeatable routines)
3. **T3.3** ReviewComplete flourish (3 min verify — it's the emotional payoff)
4. **T6.1** Dark mode full pass (15 min)
5. **P1.1–P1.2** Recurring tasks (2 hours — this is the missing feature most useful for work routines)
6. **T2.1** Animated strikethrough (2 min verify)

Total: ~3 hours. Everything else is polish.
