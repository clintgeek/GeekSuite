# Task Sorting and Display Rules

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

## Year View
*Note: Year view sorting rules are to be determined in a future update.*

## Task Management
- Tasks can be interacted with in both their scheduled and completed states
- Creation dates are visible to users and can be modified after task creation
- No special visual distinction is needed between scheduled and completed instances of the same task