# BuJoGeek — Review, 2026-09-20

Five parallel read-only reviews (dates/recurrence, data integrity, UI/UX, code quality,
performance) followed by hand-verification of every finding that made this document. Nothing
was changed.

**How to read the confidence markers.** `VERIFIED` means I reproduced it myself in this
session — by running the real code path, doing the date arithmetic, or querying the live
database — and the evidence is quoted inline. `CONFIRMED` means I read the code on both sides
and the mechanism is unambiguous, but I did not execute it. `UNCONFIRMED` means it looks wrong
and neither I nor the review could build a failing case; act on those only after reproducing.

---

## The short version

BuJoGeek is in good shape. The ownership invariant genuinely holds, the Apollo cache updates
are actually implemented rather than merely intended, the bundle work landed, and the
documentation is unusually honest. This review found no missing-index-style rot in the areas
that were recently worked.

What it did find is **one bug class, wearing six hats**: the gateway reasons in UTC calendar
days, the user lives in America/Chicago, and the containers run UTC — so for five hours out of
every twenty-four the server and the user disagree about what day it is. That single mismatch
produces a task due at 8pm landing on tomorrow's page, a habit streak collapsing to zero at
dinner time, and the weekly spread's Sunday column being structurally empty forever.

Separately there is **a landmine under the recurring-task feature**. It is not firing today —
the live database has 363 tasks and **zero series masters** — but the first repeating task
created will arm three distinct failures at once.

**Live database, checked 2026-09-20:** `tasks=363  seriesMasters=0  unboundedRules=0`.
That single fact is the most important input to the priority order below: everything in
§2 is currently invisible and becomes real the moment you type a recurrence.

---

## 1. Live now — the server and the user disagree about "today"

These need no recurring tasks. They are happening on the current data set.

### 1.1 Anything due after 7pm Central lands on the wrong day — VERIFIED

`taskService.js:178-189` builds the daily window as `[UTC midnight, UTC 23:59:59.999]` and
matches `dueDate` directly against it. A `dueDate` that carries a *time* is an instant, not a
calendar date, so an evening time crosses into the next UTC day.

```
user picked : 2026-09-20 8:00 PM Central
stored as   : 2026-09-21T01:00:00.000Z
dailyTasks("2026-09-20") window …09-20T00:00:00Z..09-20T23:59:59Z -> returned: false
dailyTasks("2026-09-21") window …09-21T00:00:00Z..09-21T23:59:59Z -> returned: true
```

So "Call Mom, 8pm today" is absent from today's page and appears on tomorrow's. The threshold
is 19:00 CDT / 18:00 CST. The same arithmetic drops a month-end evening task out of its own
month grid.

Note the split personality this creates: the **push reminder still fires at 8pm** (the sweep is
instant-based and correct) and deep-links to `/today`, which does not contain the task.

The client half of this was fixed in September (`utils/dueDate.js`); the server half never was.
Nothing on the gateway knows the user's timezone and no query carries an offset.

**Fix direction:** the caller already knows its local day — `dailyTasks` should take the
window from the client, or take a UTC offset, the same way `reviewDraft` already passes an
explicit `lastDay`. There is a precedent one file over.

### 1.2 The weekly spread's Sunday column is always empty — VERIFIED

`WeeklySpread.jsx:36` renders Monday→Sunday (`weekStartsOn: 1`) and passes that Monday to
`fetchTasks('weekly', weekStart)`. `TaskContext.jsx:428` then **re-derives** the week start
with date-fns' default — which is Sunday — turning the Monday back into the *previous* Sunday.

```
UI renders  : 2026-09-14 -> 2026-09-20
date sent   : 2026-09-13
gateway wdw : 2026-09-13 -> 2026-09-19
rendered Sunday 2026-09-20 inside fetched window? false
```

The last rendered column can never contain anything, and the Sunday the gateway *did* return is
never rendered. This has presumably been true since the weekly view shipped.

**Fix direction:** one argument — `startOfWeek(date || new Date(), { weekStartsOn: 1 })` — or,
better, stop re-deriving in the context and trust the caller's date.

### 1.3 A habit streak reads 0 after 7pm — VERIFIED

`resolvers.js:498-501` calls `habitService.getCurrentStreak(habit, userId)` with no `today`, so
it defaults to the **server's** UTC day. The deliberate grace at `habitService.js:224-227`
("today is still open, it doesn't break the streak") is therefore granted to UTC's today, and
the user's actual today is judged as a missed earlier day.

Simulating the real loop, with a habit logged every day 09-01…09-19 and today (09-20) not yet
logged:

```
1:00 PM Central (UTC day 2026-09-20) streak = 19
9:00 PM Central (UTC day 2026-09-21) streak = 0
```

Same day, no data change, and it repairs itself the moment you log today. The *toggle* side is
correct — `HabitsPage.jsx:111` sends `localDateString(date)` — so logging at 9pm records the
right day. Only the read is wrong.

**Fix direction:** pass the client's local day into `getCurrentStreak`, exactly as
`reviewService.js:183` already does.

### 1.4 Two sort comparators disagree, so lists reorder when you touch them — VERIFIED

`DOCS/SORTING_RULES.md` and `utils/taskSort.js:55` define priority as High(1) → Medium(2) →
Low(3) → None. The gateway's own `sortTasks` (`taskService.js:376`) does
`(b.priority || 0) - (a.priority || 0)` for undated tasks:

```
gateway order for two undated tasks: Low , High
```

It also sinks *any* non-`pending` status (so `migrated_back`/`migrated_future` drop to the
bottom) where the canonical comparator sinks only `completed`/`cancelled`, and it applies no
priority tiebreak at all to dated tasks.

This is visible because of *when* each comparator runs: weekly/monthly/all lists render in
**gateway** order on load, and `mapTasksState` re-sorts with the **canonical** comparator on
every mutation. So the list silently reorders itself the first time you tick any checkbox on it.

`TaskList.jsx:105-107` carries a comment about a locally-duplicated comparator "with a bug that
sorted priority backwards (Low ranked above High)". That bug is still alive — one layer down,
in the gateway.

**Fix direction:** the gateway should not be sorting at all, or should import one shared
comparator. Two implementations of a documented rule is the thing this repo keeps getting
bitten by.

### 1.5 Today's Blocked shelf asserts "nothing is waiting on anyone" when its query fails — CONFIRMED

`TodayPage.jsx:94-104` catches `fetchBlocked`'s error with `console.error` and leaves
`blockedTasks` as `[]`. `BlockedSection.jsx:40` then renders the caption
*"nothing is waiting on anyone"*, and the header reports "0 blocked". `fetchUpcoming`
(`:73-87`) has the same shape.

A failed query is therefore indistinguishable from a confident, prose-level claim that you have
nothing parked. The two neighbouring fetches in `TaskContext` do this correctly — they route
through `handleApiError` to the snackbar.

### 1.6 Review marks a card handled even when the mutation failed — VERIFIED

`ReviewPage.jsx:137-153` calls `markReviewed(...)` unconditionally after `deleteTask` /
`updateTaskStatus`. Neither of those rejects on failure:

- `TaskContext.jsx:678-687` — `updateTaskStatus` rolls back its optimistic state, toasts, and
  `return undefined`.
- `TaskContext.jsx:632-641` — `updateTask`, by contrast, **throws**.

So `handleKeep` / `handleMoveTomorrow` / `handleMoveToDate` / `handleBacklog` are correct *by
accident* (they use `updateTask`), while cancel and delete are not: the card leaves the review
queue, the run reports "all done", and the task is back tomorrow.

**Fix direction:** make the status/delete paths return a result the caller checks, or throw.
This is the identical pattern fixed in FitnessGeek on 2026-09-20 — a resolved-false that reads
as success.

---

## 2. Latent — armed by the first recurring task

None of this is firing today (`seriesMasters=0`). All of it fires together the first time a
repeating task exists.

### 2.1 `allTasks` expands unbounded RRULEs to ~2.9 million occurrences — VERIFIED

`taskService.js:252` sets the `all` view's expansion window to
`viewStart = new Date(0)`, `viewEnd = new Date(8640000000000000)` — the entire representable
date range — and `:280` hands that to `rule.between(...)`.

Measured against the installed rrule, one ordinary `FREQ=DAILY` rule with no `UNTIL`/`COUNT`:

```
occurrences=2912443  elapsed=12.5s  last: 9999-12-31T09:00:00.000Z
```

Both reviews called this an indefinite hang; it is not — rrule caps at year 9999, so it
terminates. That is the only good news. 12.5s of blocked event loop, followed by building,
sorting and serialising ~2.9M task objects, on the **shared** basegeek gateway that every app
in the suite runs through.

`allTasks` is fetched by three routes: `SearchPage.jsx:31`, `ReviewPage.jsx:52`,
`components/plan/BacklogList.jsx:28`. The frontend never writes a bounded rule —
`parseTaskInput.js:95-101` emits `DTSTART…\nRRULE:FREQ=DAILY` with no `UNTIL` and no `COUNT`.

No test covers `viewType: 'all'` with a series master present, which is why this is invisible.

**Fix direction:** bound the `all` window to something finite and defensible (the corpus's own
date range, or today ± N years), or skip expansion entirely for `all` and let those views work
on materialised rows.

### 2.2 Completing one occurrence files it under the series' start date — CONFIRMED

`buildOverride` (`taskService.js:456-470`) spreads `master.toObject()` — **including the
master's `dueDate`** — then layers `updateData` on top. Status changes carry no `dueDate`
(`updateStatusInternal`, `:686-693`), so the materialised override keeps the series' *first*
date while `originalDueDate` correctly holds the occurrence.

The consequences compound: the virtual for that day is suppressed (`overrideMap` keys on
`originalDueDate`, which is right), but the override matches no clause of that day's query. So
ticking off Tuesday's occurrence removes the row from Tuesday and adds a completed row to the
series' start date.

Editing an occurrence is unaffected, because `TaskEditor.buildPayload` always resends
`dueDate` — which is exactly why this reads as a toggle-only bug. `blockTask`/`unblockTask` go
through the same path.

The existing test (`bujogeekRecurrenceUnification.test.js:241-263`) asserts that exactly one
override row exists — never which day it lands on.

**Fix direction:** `buildOverride` should set `dueDate: originalDueDate` unless `updateData`
supplies one.

### 2.3 Double-tapping a recurring checkbox creates two permanent rows — CONFIRMED

`TaskCheckbox` is a bare `<Box component="button">` with no busy/disabled state
(`components/tasks/TaskCheckbox.jsx:16-49`) and neither call site passes one. For a `virtual_`
row the id does not change until the first response merges, so a second tap sends the same
synthetic id, and `updateStatusInternal` does an unconditional `new Task(...).save()`.

There is **no unique index on `(seriesId, originalDueDate)`** — `models/Task.js` declares four
indexes, none of them that. `HabitLog` has exactly this guard (`models/HabitLog.js:174`) with a
documented E11000 swallow, so the pattern is already established in the codebase.

### 2.4 A recurring task with a due time sends exactly one reminder, ever — CONFIRMED

`reminderService.js:216-247` sweeps real documents. Virtual occurrences have no row, so the only
candidate is the series master: it fires once, gets `remindedAt` stamped, and is never eligible
again (`updateTask` only clears `remindedAt` when `dueDate` moves, which a series master's never
does).

"Take meds, daily, 9pm" pushes on day one and is silent forever after. `DOCS/REMINDERS.md` does
not mention recurrence, and no test covers it. Even if it is deferred, it should be written
down — silent is the worst property here.

### 2.5 Recurrence is anchored in UTC, so wall-clock time drifts at DST — CONFIRMED

RRULEs are written and expanded in UTC (`DTSTART:…Z`). Occurrences therefore hold a fixed *UTC*
time, which is a moving wall-clock time in Chicago: a 9:00 AM series created in CDT becomes
8:00 AM after 2026-11-01.

Worth being precise about what is *not* wrong here: no occurrence is lost or duplicated at a DST
boundary — UTC expansion is uniform, so the classic skipped/doubled-occurrence bug is genuinely
absent. Only the chosen wall-clock time fails to survive.

---

## 3. Cost and structure

### 3.1 The hottest query in the app has no index shaped for it — CONFIRMED

`getTasksForDateRange` (`taskService.js:166-232`) backs `dailyTasks`/`weeklyTasks`/
`monthlyTasks`/`allTasks` — i.e. every Today, Plan, Search, Review and Backlog load. It filters
on `createdBy` + a four-branch `$or` over `dueDate`/`status`, and sorts
`{status, dueDate, priority, createdAt}`.

`models/Task.js:66-71` declares `{createdBy, tags}`, `{status, remindedAt, dueDate}`,
`{createdBy, collectionId}`, `{createdBy, status, blockedAt}`. **None pairs `createdBy` with
`dueDate`**, which is the field every branch ranges or sorts on. Mongo can use `createdBy` as a
prefix and must then filter and sort the rest in memory.

At 363 tasks this is free. It is worth fixing before the corpus is large, not after.

Two more in the same function, also unindexed and run on every one of those loads:
`{createdBy, isSeriesMaster: true}` (`:259-263`), and — the one that grows without bound —
`{createdBy, seriesId: {$in: [...]}}` (`:265-268`), which fetches **every materialised override
for every series, with no date bound at all**, on every request. `seriesId` has no index.
For a years-accumulating journal that is the finding whose cost rises forever.

`Template` and `JournalEntry` declare no `createdBy` index at all, while every read filters on
it.

### 3.2 Two N+1s in list views — CONFIRMED

- `Collection.taskCount` and `Collection.completedCount` are separate field resolvers, each
  calling `collectionService.getCounts()`, which issues two `countDocuments`. The collections
  list selects both, so each collection costs **four** count queries where one `$facet` would do.
- `Habit.currentStreak` issues a `HabitLog.find` per habit (`resolvers.js:498-502`).

Both are round-trip counts rather than missing indexes, and both are bounded. Worth folding in
whenever those files are open, not worth a special trip.

### 3.3 `TaskRow` is not memoised — CONFIRMED

`mapTasksState` (`TaskContext.jsx:130-140`) maps **and re-sorts the whole array** on every
mutation, producing a new array reference regardless of which task changed, and `TaskRow` is a
plain function component. On Today that is a handful of rows. On Search/Backlog/Tags, which
render the full corpus, one checkbox tap re-renders every row.

The Provider `value` itself is correctly `useMemo`'d — that part is not the problem.

### 3.4 The view window is computed twice by hand — CONFIRMED

`taskService.js` builds the weekly boundary once for the Mongo filter (`:191-197`) and again for
the RRULE expansion (`:240-247`); same for monthly. They agree today by careful copy-paste. Edit
one alone and the database query and the virtual-occurrence window disagree at a week or month
edge — which is precisely how an occurrence gets dropped or doubled.

Seam: one `resolveViewWindow(viewType, startOfDay)` returning `{ query, viewStart, viewEnd }`.

### 3.5 Two doors onto the blocked state machine — CONFIRMED

CONTEXT.md says the blocked guard lives in exactly one place. It does not:

- `updateTaskStatus`'s resolver (`resolvers.js:234-240`) has no try/catch, so when it delegates
  to `blockTask` an invalid transition throws a **plain `Error`** with no `extensions.code`,
  where the `blockTask` resolver would have produced a proper `BAD_USER_INPUT`. The frontend's
  `handleApiError` branches on that code, so the same failure gets a worse message depending on
  which door it came through.
- `updateTask` accepts `status` (`validation.js:50-53`, `ALLOWED_UPDATE_FIELDS`) and passes it
  straight to `findOneAndUpdate`, bypassing the guard and the `blockedAt`/`blockedReason`
  stamping entirely. Latent — no UI sends it — but it is a loaded gun for the next bulk-edit
  feature.

### 3.6 A documented invariant with an undocumented exception — CONFIRMED

`CONTEXT.md` states every gateway write is scoped by `createdBy`, with no exceptions. One is not:
`reminderService.js:119` upserts push subscriptions on `{ endpoint }` alone and re-stamps
`createdBy`. This is **deliberate** — the doc comment at `:106-109` says re-claiming an endpoint
is what makes a shared device work — and endpoints are high-entropy, so this is not an alarm.
But the invariant as written is now false, and the next person to audit it will either miss the
exception or waste an hour on it. It belongs in CONTEXT.md.

---

## 4. UI/UX

Ranked by daily frequency × annoyance. None of these are speculative redesigns; each is a
wiring or affordance gap.

1. **No one-tap "move to tomorrow" on Today.** Deferring a task is probably the second most
   common daily decision after completing one, and it currently costs: Edit → dialog → find the
   date field → save. `ReviewPage.jsx:98-109` already implements the one-keystroke version; it
   is simply never exposed on the screen where it is needed most.
2. **Plan's Weekly and Backlog views cannot edit a task at all.** `WeeklySpread.jsx:385` and
   `BacklogList.jsx:176` wire only status-toggle and delete. On the screen whose entire job is
   "plan ahead", a task can be completed or destroyed but not rescheduled or reprioritised —
   and BacklogList even prints "this has been here N days. Still relevant?" with no way to act
   on the answer except delete. `TaskRow` renders conditionally on the callbacks it is passed,
   so this is a wiring gap, not a design change.
3. **`useKeyboardNav` tracks focus by array index, not task id** (`hooks/useKeyboardNav.js:38-45`).
   It re-clamps on length change but not on *order* change — and editing a priority or date
   re-sorts the list. Keyboard focus then points at whatever task now occupies that index, so
   the next `x`/`d`/`e` acts on the wrong row. This one is a correctness bug wearing a UX hat.
4. **Deleting a habit destroys its entire logged history with no confirmation**
   (`HabitsPage.jsx:171-183`), from a plain text button sitting beside "Cancel". Every task
   delete in the app asks first; the most destructive delete does not.
5. **Review's `e` key silently re-files the task** instead of editing
   (`ReviewPage.jsx:163-166` maps both `onEdit` and `onToggle` to `handleKeep`). On every other
   screen `e` opens an editor — an inspect-first, reversible action. Muscle memory from Today
   will change data here.
6. **`RecurringEditDialog` is a bare MUI Dialog** (`components/tasks/RecurringEditDialog.jsx`),
   not the app's `BujoDialog`, so it misses the full-screen-below-`sm` rule and the 44px touch
   floor — on the one dialog that appears whenever a recurring task is edited or deleted.
7. **Keyboard chords are missing entirely on Plan and Tags** — neither page calls
   `useGlobalShortcuts`, so a keyboard user can chord *in* and not *out*.
8. **The help screen advertises ⌘K "Command palette"** (`KeyboardHelp.jsx:28`), which does not
   exist anywhere in the frontend. A dead end inside the reference itself.
9. **Subtask removal is the one delete path with no confirmation at all**
   (`TaskEditor.jsx:171-177`), and the confirm wording differs across all six other sites.
10. **Day navigation on Today is mouse-only** (`PageHeader.jsx:157-214`), in an app where every
    row action has a key binding.

---

## 5. What is already good

Recorded because a review that lists only faults misrepresents the codebase.

- **Ownership genuinely holds.** Every resolver was traced to its service and every query to its
  filter. `findOwnedTask`/`findOwnedCollection`/`findOwnedHabit` return null for malformed,
  missing and foreign ids alike, and `resolveOwnedTarget` re-scopes the master before touching a
  `virtual_` id. The one exception (§3.6) is deliberate.
- **The Apollo cache contract is implemented, not merely intended.** Creates and deletes
  `cache.modify` their root list and evict the entity; derived counts are evicted rather than
  refetched. No mutation was found missing its `update`.
- **Selection sets match what components read.** All five log queries plus `GET_BLOCKED_TASKS`,
  `GET_COLLECTION` and `GET_TASKS_BY_TAG` carry the load-bearing fields, and every merge is a
  spread so the narrower mutation payloads drop nothing.
- **Model ↔ typeDefs ↔ input types agree.** No writable-but-undeclared mongoose path; zod
  schemas are `.strict()` and match the GraphQL arg lists.
- **`FUTURE_INSTANCES` series splitting is correct** — `UNTIL = splitDate − 1s`, overrides
  re-parented, no lost or doubled occurrence.
- **`TaskOrder` date keys agree across the boundary**; `exdates` compare at exact instant
  precision; the daily carry-forward cannot double-count (`rule.before` exclusive,
  `rule.between` inclusive).
- **The reminder sweep is exactly matched by its index.** Nothing polls forever.
- Test baseline, run for this review: **frontend 151 passing across 15 files**, and
  **215 passing across 10 gateway suites**. Both green.

---

## 6. Suggested order

Grouped by what they cost versus what they buy, not strictly by severity.

**First — small fixes, immediate daily benefit, all live:**
1. Weekly spread's Sunday column (§1.2) — a one-argument fix.
2. Habit streak's missing `today` (§1.3) — one argument, precedent in the same service.
3. Review's cancel/delete marking failures as handled (§1.6).
4. Today's Blocked/Upcoming swallowing errors (§1.5).

**Second — the real one, worth doing properly:**
5. Evening due times landing on the wrong day (§1.1). This is the headline user-facing bug and
   deserves a considered fix (client-supplied window or offset), not a patch.
6. The two disagreeing comparators (§1.4) — delete one.

**Third — before you ever create a repeating task:**
7. Bound the `all` expansion window (§2.1).
8. `buildOverride` keeping the occurrence's date (§2.2).
9. A unique index on `(seriesId, originalDueDate)` plus a busy state on the checkbox (§2.3).
10. Decide and document what reminders do about recurrence (§2.4).

**Fourth — cheap insurance while the corpus is small:**
11. The `{createdBy, dueDate}` index and friends (§3.1).

**Whenever the file is open:** the UX wiring gaps (§4.1, §4.2), focus-by-id (§4.3), the habit
delete confirm (§4.4).

A note on §2: items 7-10 are all invisible right now and all arm simultaneously. If repeating
tasks are a feature you intend to use, that group is worth doing as one piece of work before
the first one is created, rather than discovering them one at a time afterwards.
