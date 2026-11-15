# Task Sorting and Display Rules

> **Read this first (2026-11-15).** Red Pen (`SIMPLE_PLAN.md`, "As built") replaced the views
> these rules were written for. What the app does now is in `frontend/src/utils/penViews.js`:
> Today (Overdue · Today · Anytime), Upcoming and Done.
>
> **Still true:** an open task with a future date shows only on that date (in Upcoming); the
> priority order; the whole "Manual order (Today)" section.
>
> **No longer true:**
> - A completed task shows only in Done, grouped by the day it was completed — never on its
>   scheduled or creation date as well.
> - An overdue open task shows once, in Today's Overdue section, one row per series. It does
>   not also appear on its past date, and nothing is migrated or re-dated.
> - An open task with no date sits in Today's "Anytime" section; its creation date is irrelevant.
> - The Daily / Weekly / Monthly / Year views are retired (their paths redirect to `/today`).
>   The old comparator survives only in `utils/taskSort.js` and the gateway's `sortTasks`, and
>   drives no visible view. Within a section the order is priority, then timed before untimed,
>   then created, then id (`compareWithinDay`).
> - Priority is drawn as the proofreader's bar, not coloured flags.
>
> The text below is kept as written because code comments cite it.

## Terms and Definitions
- **Float / Floating / Floater**: A task that is incomplete and automatically migrates to today's date until completed, backlogged, or migrated elsewhere. The migration occurs when tasks are pulled for a view.
- **Scheduled Date**: Synonym for due date
- **Creation Date**: The date when a task was initially created. This date is visible to users and can be modified after creation.

## Task Display Rules

### Future Scheduled Date
- If a task is incomplete and has a future scheduled date: It should show ONLY on the date it is scheduled
- If a task is complete and has a future scheduled date: It should show on BOTH the date it is scheduled AND the date it was completed

### Past Scheduled Date
- If a task is incomplete and has a past scheduled date: It should float AND show on the past scheduled date
- If a task is complete and has a past scheduled date: It should show on BOTH the date it was scheduled AND the date it was completed

### No Scheduled Date
- If a task is incomplete and has no scheduled date: It should float AND show on the date it was created
- If a task is complete and has no scheduled date: It should show on BOTH the date it was created AND the date it was completed

## Task Sorting Rules

### Daily, Weekly, and Monthly Views
Tasks within each day are sorted in the following order:

1. **Incomplete Tasks**
   - Scheduled tasks (sorted by priority)
   - Non-scheduled tasks (sorted by priority)

2. **Completed Tasks**
   - All completed tasks (sorted by priority)

### Priority Levels
Tasks are sorted by priority within their respective groups. Priority levels are:
- High
- Medium
- Low
- None

Priority is visually indicated using colored flags in the UI. Task priority can be modified after creation.

### Manual order (Today)
*Added 2026-10-29.* On the Today page, Chef can put the **Today** section and the **Anytime**
section in his own order. It is a deliberate override of the rules above, for one day only.

1. **Where.** Within Today and within Anytime; never across them. "Carried over" is not
   sortable. The order is saved **per local day** (`yyyy-MM-dd`), so tomorrow starts from the
   normal rule. (One saved list per day: the Today ids, then the Anytime ids.)
2. **New tasks.** The dragged arrangement is kept exactly. A task that is not in the saved
   order (added since, or put on today since) goes immediately **before the first saved task
   the normal rule places after it**, or at the end. Several such tasks before the same saved
   task keep their normal order among themselves. Saved tasks that are done, deleted or on
   another day are ignored. A task that moved between Today and Anytime since the save is
   placed like a new task; when the saved list cannot tell which of two tasks moved, both are.
   A repeating task's occurrence keeps its place after it is edited on its own.
   (`frontend/src/utils/manualOrder.js`.)
3. **How.** A grip at the end of each row (a 44px target, "Move <task>"); only the grip drags,
   so tapping a row still opens it and scrolling never drags — a finger must rest on the grip
   for 200ms first. On a desktop, **Alt+↑ / Alt+↓** move the selected task (`j`/`k`); ↑/↓ on a
   focused grip do the same. Each move is announced politely ("Moved 'Buy milk' to position
   2 of 5"); a private task is announced as "Private task". A row that is crossed off and
   settling cannot be moved. Saving is optimistic; if it fails, the list goes back and a toast
   says "Couldn't save the new order. Try again."

## Year View
*Note: Year view sorting rules are to be determined in a future update.*

## Task Management
- Tasks can be interacted with in both their scheduled and completed states
- Creation dates are visible to users and can be modified after task creation
- No special visual distinction is needed between scheduled and completed instances of the same task