# THE_TIME_STEPS — Fixing Timezone Bugs Across GeekSuite

**Companion to**: `THE_TIME_ISSUE.md`
**Date**: 2026-02-26

> This guide walks through every fix needed to resolve the timezone bugs documented in `THE_TIME_ISSUE.md`. Each step tells you **what file to open**, **what to find**, **what to change**, and **why**. Work through one app at a time.

---

## Before You Start

### Background You Need

JavaScript has two kinds of dates you'll encounter:

1. **Calendar dates** ("Feb 26") — Things like a task's due date, an egg production date, or a weight log date. The user picks a day; the time doesn't matter. We store these as **UTC midnight** (`2026-02-26T00:00:00.000Z`).

2. **Instants** ("the exact moment something happened") — Things like `createdAt` and `updatedAt`. These store the precise time and are displayed in the user's local timezone automatically.

The bugs happen because the code mixes up these two types. A user in America/Chicago who creates a task at 11 PM on Feb 26 generates a UTC timestamp of `2026-02-27T05:00:00Z` — that's **Feb 27 in UTC** even though the user is on Feb 26. If we store that as the `dueDate`, the task shows up on the wrong day.

### The Three Rules

Every fix in this guide comes back to three rules:

1. **When the frontend needs to send a calendar date** → send a `YYYY-MM-DD` string representing the user's local date.
2. **When the backend receives a `YYYY-MM-DD` string** → parse it to UTC midnight using `Date.UTC()`, never `new Date(str + 'T00:00:00')`.
3. **When the frontend displays a calendar date from the database** → use `toLocaleDateString(undefined, { timeZone: 'UTC' })` so UTC midnight doesn't get shifted to the previous day.

### Helper Functions You'll Use

You'll write or reuse these patterns constantly. Get familiar with them now.

**Frontend — get today's local date as `YYYY-MM-DD`:**
```javascript
// This is the CORRECT way to get the user's local date as a string.
// It offsets by the timezone so toISOString() gives back the local calendar date.
function localDateString(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().split('T')[0];
}
// Example: user is in CST (UTC-6) at 11 PM Feb 26
// new Date() = 2026-02-27T05:00:00Z
// After offset: 2026-02-26T23:00:00Z
// .split('T')[0] = "2026-02-26" ✓
```

**Backend — parse `YYYY-MM-DD` to UTC midnight:**
```javascript
// This is the CORRECT way to turn a date string into a Date object.
// It avoids the ambiguity of new Date("2026-02-26") vs new Date("2026-02-26T00:00:00").
function toUtcMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
// Result: 2026-02-26T00:00:00.000Z — always UTC midnight, regardless of server timezone
```

**Backend — get UTC day boundaries for a query:**
```javascript
function utcDayRange(dateStr) {
  const start = toUtcMidnight(dateStr);
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}
```

**Frontend — display a calendar date from the database:**
```javascript
// This forces the browser to interpret UTC midnight as the correct calendar day.
// Without { timeZone: 'UTC' }, a user in America/Chicago would see
// "2026-02-26T00:00:00.000Z" as "2/25/2026" (the previous day).
new Date(storedDate).toLocaleDateString(undefined, { timeZone: 'UTC' })
```

---

## Step 0: Set TZ in All Docker Compose Files

This is the fastest safety net. It makes the server's local time match the primary user's timezone, which makes `setHours()` and `new Date()` behave correctly on the server. **Do this first** while you work on the real fixes.

### 0.1 — `apps/bujogeek/docker-compose.yml`

Find the `environment` block under `backend`:
```yaml
    environment:
      - NODE_ENV=production
      - PORT=5005
```

Add `TZ` as the first environment variable:
```yaml
    environment:
      - TZ=America/Chicago
      - NODE_ENV=production
      - PORT=5005
```

### 0.2 — `apps/fitnessgeek/docker-compose.yml`

Find:
```yaml
    environment:
      - NODE_ENV=production
      - PORT=5002
```

Add:
```yaml
    environment:
      - TZ=America/Chicago
      - NODE_ENV=production
      - PORT=5002
```

### 0.3 — `apps/flockgeek/docker-compose.yml`

Find:
```yaml
    environment:
      NODE_ENV: development
      PORT: 4094
```

Add (note: this file uses the map syntax, not the list syntax):
```yaml
    environment:
      TZ: America/Chicago
      NODE_ENV: development
      PORT: 4094
```

### 0.4 — `apps/notegeek/docker-compose.yml`

Find:
```yaml
    environment:
      - NODE_ENV=production
      - PORT=${PORT}
```

Add:
```yaml
    environment:
      - TZ=America/Chicago
      - NODE_ENV=production
      - PORT=${PORT}
```

> **Why**: Docker containers (Alpine/Node) default to UTC. Setting `TZ` makes the server clock align with the user. This is a band-aid, not a cure — the real fixes below make the code timezone-correct regardless of the server's `TZ`.

---

## Step 1: Fix BujoGeek Backend

### 1.1 — Remove `getUtcDate()` and fix `getTasksForDateRange()` in `taskService.js`

**File**: `apps/bujogeek/backend/src/services/taskService.js`

This function tries to convert a date to UTC by adding `getTimezoneOffset()`. But in Docker (UTC), the offset is 0 — it does nothing. Delete it and replace all usage with proper UTC parsing.

**Find** the `getUtcDate` method (around line 15):
```javascript
  getUtcDate(date) {
    const d = new Date(date);
    return new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  }
```

**Replace with**:
```javascript
  /**
   * Parse a YYYY-MM-DD string to a UTC midnight Date.
   * This is timezone-safe regardless of server locale.
   */
  toUtcMidnight(dateStr) {
    if (dateStr instanceof Date) {
      return new Date(Date.UTC(dateStr.getUTCFullYear(), dateStr.getUTCMonth(), dateStr.getUTCDate()));
    }
    const str = typeof dateStr === 'string' ? dateStr : new Date(dateStr).toISOString();
    const [y, m, d] = str.split('T')[0].split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
```

**Find** the date range setup in `getTasksForDateRange()` (around lines 41–48):
```javascript
    // Convert input date to UTC
    const utcDate = this.getUtcDate(startDate);
    const utcYear = utcDate.getUTCFullYear();
    const utcMonth = utcDate.getUTCMonth();
    const utcDay = utcDate.getUTCDate();

    // Create start and end of day in UTC
    const startOfDayDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0, 0));
    const endOfDayDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, 23, 59, 59, 999));
```

**Replace with**:
```javascript
    // Parse the incoming date string to UTC midnight boundaries
    const startOfDayDate = this.toUtcMidnight(startDate);
    const endOfDayDate = new Date(startOfDayDate);
    endOfDayDate.setUTCHours(23, 59, 59, 999);
```

> **Why**: The old code ran `getUtcDate()` (a no-op in UTC Docker) then extracted year/month/day to rebuild UTC midnight. The new code directly parses the `YYYY-MM-DD` string from the frontend into UTC midnight — simpler and correct.

Also update the weekly date calculation (around line 90). Find:
```javascript
        case 'weekly':
          // Get start of week (Sunday) in UTC
          const startOfWeekDate = new Date(Date.UTC(utcYear, utcMonth, utcDay - utcDate.getUTCDay(), 0, 0, 0, 0));
```

**Replace with**:
```javascript
        case 'weekly':
          // Get start of week (Sunday) in UTC
          const startOfWeekDate = new Date(startOfDayDate);
          startOfWeekDate.setUTCDate(startOfWeekDate.getUTCDate() - startOfWeekDate.getUTCDay());
          startOfWeekDate.setUTCHours(0, 0, 0, 0);
```

### 1.2 — Fix `formatDateKey()` in `taskService.js`

**File**: `apps/bujogeek/backend/src/services/taskService.js`

Find (around line 253):
```javascript
  formatDateKey(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
```

**Replace with**:
```javascript
  formatDateKey(date) {
    const d = new Date(date);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
```

> **Why**: `getFullYear()`, `getMonth()`, `getDate()` use the *server's* local timezone. In Docker (UTC) they accidentally match, but if anyone ever sets `TZ` they'd break. `getUTCFullYear()` etc. are always correct for dates stored as UTC midnight.

### 1.3 — Fix `taskUtils.js` — Replace `setHours` with `setUTCHours`

**File**: `apps/bujogeek/backend/src/utils/taskUtils.js`

Find every instance of `setHours(0, 0, 0, 0)` in this file and replace with `setUTCHours(0, 0, 0, 0)`.

There are multiple occurrences (around lines 28–30, 72, 77):

```javascript
  // Line ~28
  today.setHours(0, 0, 0, 0);
  if (startDate) startDate.setHours(0, 0, 0, 0);
  if (endDate) endDate.setHours(0, 0, 0, 0);
```
→
```javascript
  today.setUTCHours(0, 0, 0, 0);
  if (startDate) startDate.setUTCHours(0, 0, 0, 0);
  if (endDate) endDate.setUTCHours(0, 0, 0, 0);
```

```javascript
  // Line ~72
  if (taskDueDate) taskDueDate.setHours(0, 0, 0, 0);
```
→
```javascript
  if (taskDueDate) taskDueDate.setUTCHours(0, 0, 0, 0);
```

```javascript
  // Line ~77
  completedDate.setHours(0, 0, 0, 0);
```
→
```javascript
  completedDate.setUTCHours(0, 0, 0, 0);
```

> **Why**: `setHours()` uses the server's local TZ to determine midnight. `setUTCHours()` always sets to UTC midnight, matching how dates are stored in MongoDB.

### 1.4 — Fix journal date queries in `journalController.js`

**File**: `apps/bujogeek/backend/src/controllers/journalController.js`

Find (around line 51):
```javascript
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
```

**Replace with**:
```javascript
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const start = toUtcMidnight(startDate);
        start.setUTCHours(0, 0, 0, 0);
        query.date.$gte = start;
      }
      if (endDate) {
        const end = toUtcMidnight(endDate);
        end.setUTCHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }
```

You'll also need to add the helper at the top of the file (or import it if you later extract it):
```javascript
function toUtcMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
```

> **Why**: The old code did `new Date(startDate)` which parses `"2026-02-26"` to UTC midnight — that part was okay — but it didn't expand to end-of-day for the `$lte` side, meaning it only matched records at exactly midnight, not the whole day.

---

## Step 2: Fix BujoGeek Frontend

### 2.1 — Fix `InlineQuickAdd.jsx` — Send date string, not timestamp

**File**: `apps/bujogeek/frontend/src/components/today/InlineQuickAdd.jsx`

Find (around line 49):
```javascript
      dueDate: new Date().toISOString(),
```

**Replace with**:
```javascript
      dueDate: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString().split('T')[0],
```

> **Why**: `new Date().toISOString()` sends the exact instant (e.g., `2026-02-27T05:00:00Z` at 11 PM CST). What we want is today's calendar date as a string (`"2026-02-26"`). The replacement offsets by the timezone to get the local date, then takes just the date portion.

### 2.2 — Fix `ReviewPage.jsx` — Send date strings for "Keep today" and "Move forward"

**File**: `apps/bujogeek/frontend/src/pages/ReviewPage.jsx`

Find `handleKeep` (around line 73):
```javascript
    await updateTask(task._id, { ...task, dueDate: new Date().toISOString() });
```

**Replace with**:
```javascript
    const todayStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
      .toISOString().split('T')[0];
    await updateTask(task._id, { ...task, dueDate: todayStr });
```

Find `handleMoveForward` (around lines 79–82):
```javascript
    const tomorrow = addDays(new Date(), 1);
    await updateTask(task._id, {
      ...task,
      dueDate: tomorrow.toISOString(),
```

**Replace with**:
```javascript
    const tomorrow = addDays(new Date(), 1);
    const tomorrowStr = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
      .toISOString().split('T')[0];
    await updateTask(task._id, {
      ...task,
      dueDate: tomorrowStr,
```

> **Why**: Same issue as InlineQuickAdd — we want to send the calendar date, not the exact moment in time.

### 2.3 — Fix `getLocalDate()` in `TaskList.jsx`

**File**: `apps/bujogeek/frontend/src/components/tasks/TaskList.jsx`

Find (around line 79):
```javascript
  const getLocalDate = (dateString) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return getLocalDate(new Date());
      }
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().split('T')[0];
    } catch (error) {
      console.warn('Invalid date:', dateString);
      return getLocalDate(new Date());
    }
  };
```

**Replace with**:
```javascript
  const getLocalDate = (dateString) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return getLocalDate(new Date().toISOString());
      }
      // Use UTC accessors since calendar dates are stored as UTC midnight
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    } catch (error) {
      console.warn('Invalid date:', dateString);
      return getLocalDate(new Date().toISOString());
    }
  };
```

> **Why**: The old code created a local-midnight Date then called `.toISOString()` which converts back to UTC. For users east of UTC, local midnight is the *previous* day in UTC, so `.toISOString().split('T')[0]` returned yesterday's date. The new code uses `getUTC*()` accessors to read the date components directly from the UTC representation — since dates are stored as UTC midnight, this gives the correct calendar date.

### 2.4 — Fix `MonthlyLog.jsx` — Use UTC accessors for date comparison

**File**: `apps/bujogeek/frontend/src/components/monthly/MonthlyLog.jsx`

Find (around line 273):
```javascript
      return tasks.filter(task => {
        const taskDate = task.dueDate ? new Date(task.dueDate) : null;
        return taskDate &&
          taskDate.getFullYear() === date.getFullYear() &&
          taskDate.getMonth() === date.getMonth() &&
          taskDate.getDate() === date.getDate();
      });
```

**Replace with**:
```javascript
      return tasks.filter(task => {
        const taskDate = task.dueDate ? new Date(task.dueDate) : null;
        return taskDate &&
          taskDate.getUTCFullYear() === date.getFullYear() &&
          taskDate.getUTCMonth() === date.getMonth() &&
          taskDate.getUTCDate() === date.getDate();
      });
```

> **Why**: `taskDate` comes from MongoDB (UTC). Using `.getDate()` reads it in the browser's local zone, which can differ from the actual calendar date. Using `.getUTC*()` reads the stored UTC day correctly. The `date` parameter comes from `eachDayOfInterval` (local browser calendar), so it stays as-is.

### 2.5 — Fix date key extraction in `TaskContext.jsx`

**File**: `apps/bujogeek/frontend/src/context/TaskContext.jsx`

Find (around line 385):
```javascript
        const newDateKey = updatedTask.dueDate ?
          new Date(updatedTask.dueDate).toISOString().split('T')[0] :
          'no-date';
```

**Replace with**:
```javascript
        const newDateKey = updatedTask.dueDate ?
          (() => {
            const d = new Date(updatedTask.dueDate);
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          })() :
          'no-date';
```

> **Why**: If `dueDate` is a full ISO timestamp like `"2026-02-27T05:00:00Z"`, `.toISOString().split('T')[0]` gives `"2026-02-27"` — the UTC date, not necessarily the user's local date. But since we're now storing `dueDate` as `YYYY-MM-DD` strings (after fixing Step 2.1/2.2), this is more of a safety net. The UTC accessor approach ensures the key always matches the stored calendar date.

---

## Step 3: Fix FitnessGeek Backend

### 3.1 — Fix weight controller date handling

**File**: `apps/fitnessgeek/backend/src/controllers/weightController.js`

**Part A — Fix date range queries (around line 15):**

Find:
```javascript
    if (startDate || endDate) {
      query.log_date = {};
      if (startDate) {
        query.log_date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.log_date.$lte = new Date(endDate);
      }
    }
```

**Replace with**:
```javascript
    if (startDate || endDate) {
      query.log_date = {};
      if (startDate) {
        const start = toUtcMidnight(startDate);
        start.setUTCHours(0, 0, 0, 0);
        query.log_date.$gte = start;
      }
      if (endDate) {
        const end = toUtcMidnight(endDate);
        end.setUTCHours(23, 59, 59, 999);
        query.log_date.$lte = end;
      }
    }
```

Add this helper at the top of the file (after imports):
```javascript
function toUtcMidnight(dateStr) {
  if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const date = new Date(dateStr);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
```

**Part B — Fix weight log creation (around line 100):**

Find the duplicate-check and date-parsing block:
```javascript
    let checkDate;
    if (log_date) {
      if (typeof log_date === 'string' && log_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        checkDate = new Date(log_date + 'T00:00:00');
      } else {
        checkDate = new Date(log_date);
      }
    } else {
      checkDate = new Date();
    }

    const existingLog = await Weight.findOne({
      userId,
      log_date: {
        $gte: new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), 0, 0, 0, 0),
        $lt: new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), 23, 59, 59, 999)
      }
    });
```

**Replace with**:
```javascript
    const checkDate = log_date ? toUtcMidnight(log_date) : toUtcMidnight(new Date());
    const checkEnd = new Date(checkDate);
    checkEnd.setUTCHours(23, 59, 59, 999);

    const existingLog = await Weight.findOne({
      userId,
      log_date: {
        $gte: checkDate,
        $lt: checkEnd
      }
    });
```

Also fix the `parsedDate` block that follows (around line 128):
```javascript
    let parsedDate;
    if (log_date) {
      if (typeof log_date === 'string' && log_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        parsedDate = new Date(log_date + 'T00:00:00');
      } else {
        parsedDate = new Date(log_date);
      }
    } else {
      parsedDate = new Date();
    }
```

**Replace with**:
```javascript
    const parsedDate = log_date ? toUtcMidnight(log_date) : toUtcMidnight(new Date());
```

**Part C — Fix stats calculation (around line 345):**

Find:
```javascript
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
```

**Replace with**:
```javascript
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
```

### 3.2 — Fix blood pressure controller

**File**: `apps/fitnessgeek/backend/src/controllers/bloodPressureController.js`

Apply the same pattern as 3.1. Add the same `toUtcMidnight` helper at the top.

**Fix date range queries (around line 15):**

Find:
```javascript
    if (startDate || endDate) {
      query.log_date = {};
      if (startDate) {
        query.log_date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.log_date.$lte = new Date(endDate);
      }
    }
```

**Replace with**:
```javascript
    if (startDate || endDate) {
      query.log_date = {};
      if (startDate) {
        const start = toUtcMidnight(startDate);
        start.setUTCHours(0, 0, 0, 0);
        query.log_date.$gte = start;
      }
      if (endDate) {
        const end = toUtcMidnight(endDate);
        end.setUTCHours(23, 59, 59, 999);
        query.log_date.$lte = end;
      }
    }
```

**Fix log creation (around line 105):**

Find:
```javascript
    let checkDate;
    if (log_date) {
      if (typeof log_date === 'string' && log_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        checkDate = new Date(log_date + 'T00:00:00');
      } else {
        checkDate = new Date(log_date);
      }
    } else {
      checkDate = new Date();
    }
```

**Replace with**:
```javascript
    const checkDate = log_date ? toUtcMidnight(log_date) : toUtcMidnight(new Date());
```

### 3.3 — Fix `DailySummary.getSummaryRange()`

**File**: `apps/fitnessgeek/backend/src/models/DailySummary.js`

Find (around line 213):
```javascript
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
```

**Replace with**:
```javascript
  const start = toUtcDate(startDate);
  start.setUTCHours(0, 0, 0, 0);

  const end = toUtcDate(endDate);
  end.setUTCHours(23, 59, 59, 999);
```

> **Why**: This file already has a `toUtcDate()` function (defined around line 96) — use it! The bug was that `getSummaryRange` used `setHours()` (local time) while its sibling methods `getOrCreate` and `updateFromLogs` correctly used `toUtcDate()` + `setUTCHours()`.

### 3.4 — Fix `aiInsightsService.js`

**File**: `apps/fitnessgeek/backend/src/services/aiInsightsService.js`

Find (around line 104):
```javascript
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
```

**Replace with**:
```javascript
    const start = toUtcMidnight(startDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = toUtcMidnight(endDate);
    end.setUTCHours(23, 59, 59, 999);
```

Add the `toUtcMidnight` helper at the top of the file (same as in Step 3.1).

Also check any use of `format(new Date(log.log_date), 'yyyy-MM-dd')` further in the file — if found, replace with:
```javascript
new Date(log.log_date).toISOString().split('T')[0]
```

> **Why**: `date-fns format()` uses the server's local timezone. If the server is in CST, `format(new Date("2026-02-26T00:00:00Z"), 'yyyy-MM-dd')` returns `"2026-02-25"` — one day off! `.toISOString().split('T')[0]` always returns the UTC date, matching the stored value.

### 3.5 — Fix `foodReportService.js`

**File**: `apps/fitnessgeek/backend/src/services/foodReportService.js`

Find (around line 10):
```javascript
    const startDate = start ? new Date(start) : subDays(new Date(), days - 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (days - 1));
    endDate.setHours(23, 59, 59, 999);
```

**Replace with**:
```javascript
    const startDate = start ? toUtcMidnight(start) : toUtcMidnight(subDays(new Date(), days - 1));
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + (days - 1));
    endDate.setUTCHours(23, 59, 59, 999);
```

Add the `toUtcMidnight` helper at the top.

Also find any `format(new Date(entry.log_date), 'yyyy-MM-dd')` or similar and replace with:
```javascript
new Date(entry.log_date).toISOString().split('T')[0]
```

### 3.6 — Fix `aiCoachRoutes.js`

**File**: `apps/fitnessgeek/backend/src/routes/aiCoachRoutes.js`

Find (around line 16):
```javascript
    const today = new Date();
    today.setHours(0, 0, 0, 0);
```

**Replace with**:
```javascript
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
```

### 3.7 — Fix `summaryRoutes.js` — `/today` endpoint

**File**: `apps/fitnessgeek/backend/src/routes/summaryRoutes.js`

Find (around line 15):
```javascript
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const today = local.toISOString().split('T')[0];
```

**Replace with**:
```javascript
    const now = new Date();
    const today = now.toISOString().split('T')[0];
```

> **Why**: With `TZ` set in Docker (Step 0), the server's timezone offset is no longer 0, which means the old `getTimezoneOffset()` trick would double-offset. Since we want the server to give the UTC date and let the frontend deal with local display, just use `toISOString()` directly. If you want the server to be aware of the user's timezone, that's a future enhancement — for now, the `TZ` env var in Docker handles it.

Also fix the weekly summary (around line 150):
```javascript
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
```

**Replace with**:
```javascript
  const start = toUtcMidnight(startDate);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
```

Import or add the `toUtcMidnight` helper.

### 3.8 — Fix `LoginStreak.js`

**File**: `apps/fitnessgeek/backend/src/models/LoginStreak.js`

Find (around line 60):
```javascript
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastLogin = this.last_login_date ? new Date(this.last_login_date) : null;
  if (lastLogin) {
    lastLogin.setHours(0, 0, 0, 0);
  }
```

**Replace with**:
```javascript
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const lastLogin = this.last_login_date ? new Date(this.last_login_date) : null;
  if (lastLogin) {
    lastLogin.setUTCHours(0, 0, 0, 0);
  }
```

---

## Step 4: Fix FitnessGeek Frontend

### 4.1 — Fix `weightService.js` — Send `YYYY-MM-DD`, not ISO timestamp

**File**: `apps/fitnessgeek/frontend/src/services/weightService.js`

Find (around line 72):
```javascript
    async addWeightLog(weight, date = new Date(), notes = '') {
      const weightData = {
        weight_value: parseFloat(weight),
        log_date: date instanceof Date ? date.toISOString() : date,
        notes
      };
```

**Replace with**:
```javascript
    async addWeightLog(weight, date = new Date(), notes = '') {
      let logDate;
      if (date instanceof Date) {
        logDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
          .toISOString().split('T')[0];
      } else {
        logDate = date; // already a YYYY-MM-DD string
      }
      const weightData = {
        weight_value: parseFloat(weight),
        log_date: logDate,
        notes
      };
```

> **Why**: `date.toISOString()` sends a full UTC timestamp like `"2026-02-27T05:00:00Z"` when the user logs at 11 PM CST on Feb 26. The backend sees this as Feb 27, not Feb 26. Sending `"2026-02-26"` tells the backend the actual calendar date.

### 4.2 — Fix `bpService.js` — Same fix

**File**: `apps/fitnessgeek/frontend/src/services/bpService.js`

Find (around line 86):
```javascript
      log_date: date instanceof Date ? date.toISOString() : date,
```

**Replace with**:
```javascript
      log_date: date instanceof Date
        ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0]
        : date,
```

---

## Step 5: Fix FlockGeek Frontend

### 5.1 — Fix `useHomeData.js` — "Today's eggs" query

**File**: `apps/flockgeek/frontend/src/hooks/useHomeData.js`

This is the most critical FlockGeek bug. The current code creates a date range using local midnight, but egg records are stored as UTC midnight.

Find (around line 46):
```javascript
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
```

**Replace with**:
```javascript
        const now = new Date();
        const todayStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
          .toISOString().split('T')[0];
        const todayStart = todayStr + 'T00:00:00.000Z';
        const todayEnd = todayStr + 'T23:59:59.999Z';
```

Also fix the query parameter names (around line 53). Find:
```javascript
          client.get(`/egg-production?from=${ todayStart }&to=${ todayEnd }`),
```

**Replace with**:
```javascript
          client.get(`/egg-production?startDate=${ todayStr }&endDate=${ todayStr }`),
```

> **Why two bugs here**:
> 1. The date range was built from local midnight, which in CST produces `06:00 UTC–06:00 UTC` — egg records stored at `00:00 UTC` fall outside this range. Now we build the range from UTC midnight directly.
> 2. The query used `from`/`to` params but the backend `eggProductionController` checks for `startDate`/`endDate`. The filter was silently ignored.

### 5.2 — Fix `HatchLogPage.jsx` — Add `{ timeZone: 'UTC' }` to date displays

**File**: `apps/flockgeek/frontend/src/pages/HatchLogPage.jsx`

Find (around line 366):
```jsx
                      {new Date(event.setDate).toLocaleDateString()}
```

**Replace with**:
```jsx
                      {new Date(event.setDate).toLocaleDateString(undefined, { timeZone: 'UTC' })}
```

Find (around line 370):
```jsx
                        ? new Date(event.hatchDate).toLocaleDateString()
```

**Replace with**:
```jsx
                        ? new Date(event.hatchDate).toLocaleDateString(undefined, { timeZone: 'UTC' })
```

> **Why**: Without `{ timeZone: 'UTC' }`, a date stored as `2026-02-26T00:00:00.000Z` displays as **Feb 25** for someone in CST, because `toLocaleDateString()` converts to local time first (where UTC midnight = 6 PM previous day).

### 5.3 — Fix `GroupsPage.jsx` — Date displays and default date

**File**: `apps/flockgeek/frontend/src/pages/GroupsPage.jsx`

**Fix display (around line 384):**

Find:
```jsx
                  {group.startDate ? new Date(group.startDate).toLocaleDateString() : "No start"}
                  {" → "}
                  {group.endDate ? new Date(group.endDate).toLocaleDateString() : "Ongoing"}
```

**Replace with**:
```jsx
                  {group.startDate ? new Date(group.startDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "No start"}
                  {" → "}
                  {group.endDate ? new Date(group.endDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "Ongoing"}
```

**Fix default start date (around line 173):**

Find:
```javascript
      startDate: new Date().toISOString().split('T')[0],
```

**Replace with**:
```javascript
      startDate: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
```

> **Why**: `new Date().toISOString().split('T')[0]` gives the UTC date. At 8 PM CST on Feb 25, UTC is already Feb 26, so the default would show tomorrow's date. The offset trick gets the local date.

### 5.4 — Fix `BirdsPage.jsx` — Date displays

**File**: `apps/flockgeek/frontend/src/pages/BirdsPage.jsx`

Find (around line 684):
```jsx
                                    {bird.hatchDate ? new Date(bird.hatchDate).toLocaleDateString() : "-"}
```

**Replace with**:
```jsx
                                    {bird.hatchDate ? new Date(bird.hatchDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "-"}
```

Find (around line 977):
```jsx
                                        {bird.statusDate ? new Date(bird.statusDate).toLocaleDateString() : '-'}
```

**Replace with**:
```jsx
                                        {bird.statusDate ? new Date(bird.statusDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '-'}
```

### 5.5 — Fix `PairingsPage.jsx` — Default pairing date

**File**: `apps/flockgeek/frontend/src/pages/PairingsPage.jsx`

Find (around line 147):
```javascript
      pairingDate: new Date().toISOString().split('T')[0],
```

**Replace with**:
```javascript
      pairingDate: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
```

---

## Step 6: NoteGeek (Optional Cleanup)

NoteGeek has **no timezone bugs**, but there are two minor improvements.

### 6.1 — Set TZ in docker-compose.yml

Already done in Step 0.4.

### 6.2 — (Optional) Extract `formatRelativeTime` to a shared utility

The same function is copied in three files:
- `frontend/src/components/NoteList.jsx`
- `frontend/src/components/SearchResults.jsx`
- `frontend/src/pages/QuickCaptureHome.jsx`

Create `frontend/src/utils/dateUtils.js`:
```javascript
export function formatRelativeTime(date) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
```

Then in each of the three files, replace the local function with:
```javascript
import { formatRelativeTime } from '../utils/dateUtils';
```

(Adjust the import path based on the file's location.)

---

## Testing Checklist

After making all changes, test these scenarios. Ideally, change your browser's timezone to verify.

### BujoGeek
- [ ] Create a task at 11 PM local time — it should appear on today's date, not tomorrow's
- [ ] Open daily view for today — tasks should show under the correct date header
- [ ] Open weekly view — tasks should appear on the correct day of the week
- [ ] Open monthly view — tasks should appear on the correct calendar day
- [ ] "Keep today" on Review page — task stays on today's date
- [ ] "Move to tomorrow" on Review page — task moves to tomorrow, not day-after-tomorrow
- [ ] Create a journal entry — it should appear when filtering by today's date

### FitnessGeek
- [ ] Log a weight entry at 11 PM — it should show under today's date
- [ ] Log a blood pressure entry at 11 PM — same
- [ ] Check food log date display — should show correct date in reports
- [ ] Check the "Today" summary — should match the user's actual today
- [ ] Check login streak — should not reset when logging in late at night
- [ ] Check AI coach meal suggestions — should use today's food logs

### FlockGeek
- [ ] Log eggs at 8 PM — home page "today's eggs" should update
- [ ] Check hatch log dates — should show correct dates, not one day off
- [ ] Check bird hatch dates and status dates — correct display
- [ ] Check group start/end dates — correct display
- [ ] Add a new group at 8 PM — default start date should be today, not tomorrow
- [ ] Add a new pairing at 8 PM — default date should be today

### General
- [ ] All docker-compose files have `TZ=America/Chicago`
- [ ] No `setHours(0,0,0,0)` remains in backend code (search for it — all should be `setUTCHours`)
- [ ] No `new Date(dateStr + 'T00:00:00')` remains in backend code (use `toUtcMidnight` instead)
- [ ] No frontend code sends `new Date().toISOString()` as a calendar date (should send `YYYY-MM-DD`)

---

## Quick Reference: Patterns to Search & Destroy

Use your editor's global search to find remaining instances of these anti-patterns:

| Search For | Replace With | Notes |
|------------|-------------|-------|
| `setHours(0, 0, 0, 0)` | `setUTCHours(0, 0, 0, 0)` | Backend only — frontend local `setHours` is sometimes correct |
| `setHours(23, 59, 59` | `setUTCHours(23, 59, 59` | Same |
| `new Date(dateStr + 'T00:00:00')` | `toUtcMidnight(dateStr)` | Backend only |
| `.getFullYear()` in date key formatting | `.getUTCFullYear()` | Backend date keys |
| `.getMonth()` in date key formatting | `.getUTCMonth()` | Backend date keys |
| `.getDate()` in date key formatting | `.getUTCDate()` | Backend date keys |
| `toLocaleDateString()` on calendar dates | `toLocaleDateString(undefined, { timeZone: 'UTC' })` | Frontend display of stored dates |
| `new Date().toISOString()` used as dueDate/log_date | `localDateString()` pattern | Frontend date submission |
| `new Date().toISOString().split('T')[0]` as default | Offset pattern from Step 5.3 | Frontend default dates |
| `format(new Date(x), 'yyyy-MM-dd')` on UTC dates | `new Date(x).toISOString().split('T')[0]` | Backend — avoids date-fns local TZ |
