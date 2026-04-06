# THE_TIME_ISSUE — Timezone Bug Audit

**Date**: 2026-02-26
**Scope**: BujoGeek, FitnessGeek, FlockGeek, NoteGeek

## Executive Summary

Multiple GeekSuite apps exhibit timezone bugs where items appear on different dates than the user intended. The root cause is a **missing timezone contract**: no app transmits the user's timezone from the browser to the backend, and no docker-compose file sets a `TZ` environment variable. Docker containers default to UTC, creating a mismatch with users in other timezones (e.g., America/Chicago = UTC-6). The result is that items created or queried near day boundaries appear on the wrong date.

NoteGeek is the exception — it has **no date-based filtering or grouping**, so the bug cannot manifest there.

---

## The Core Problem

1. **Docker containers run in UTC** — No `TZ` env var is set in any `docker-compose.yml` across the four apps.
2. **Frontends run in the browser's local timezone** — `new Date()`, `format()` (date-fns), and date pickers all use local time.
3. **No user timezone is sent to the backend** — No API call includes timezone info; no user profile stores it.
4. **Date-only strings are ambiguous** — `new Date("2026-02-26")` → UTC midnight per JS spec, but `new Date("2026-02-26T00:00:00")` → local midnight. Apps use both inconsistently.
5. **`setHours()` vs `setUTCHours()`** — Backend code frequently uses `setHours(0,0,0,0)` which is server-local (UTC in Docker), while the user's day starts at a different UTC offset.

### Concrete Example

A user in **America/Chicago (UTC-6)** creates a task at **11 PM CST on Feb 26**:
- Browser: `new Date().toISOString()` → `"2026-02-27T05:00:00.000Z"` (already Feb 27 in UTC)
- Backend stores `dueDate: 2026-02-27T05:00:00.000Z`
- When querying "Feb 26" tasks, backend searches `2026-02-26T00:00:00Z` to `2026-02-26T23:59:59Z`
- The task is **excluded** from Feb 26 and **included** in Feb 27 — wrong day for the user

---

## App-by-App Findings

### BujoGeek — CRITICAL

BujoGeek is the most severely affected because it has daily/weekly/monthly views that group tasks by date.

#### Critical Bugs

| # | Location | Issue |
|---|----------|-------|
| 1 | `backend/src/services/taskService.js` `getUtcDate()` | Adds `getTimezoneOffset() * 60000` to convert "local to UTC" — but in Docker (UTC), offset is 0, making it a **no-op**. The function only works when the server runs in the user's timezone. |
| 2 | `backend/src/services/taskService.js` `getTasksForDateRange()` | Builds UTC midnight-to-midnight boundaries. A CST user's "Feb 26" is UTC Feb 26 06:00–Feb 27 05:59:59, but the query searches Feb 26 00:00–23:59:59 UTC — **misses 6 hours and includes 6 wrong hours**. |
| 3 | `frontend/src/components/today/InlineQuickAdd.jsx` | Sets `dueDate: new Date().toISOString()` — stores the exact instant with time, not the calendar date. Tasks created in evening local time get a next-day UTC date. |

#### High Bugs

| # | Location | Issue |
|---|----------|-------|
| 4 | `frontend/src/components/tasks/TaskList.jsx` `getLocalDate()` | Constructs local midnight then calls `.toISOString().split('T')[0]` — for UTC+ timezone users, local midnight is the previous day in UTC, producing the wrong date key. |
| 5 | `frontend/src/components/monthly/MonthlyLog.jsx` | Compares UTC-stored dates using `.getDate()` (local accessor) — timezone-dependent mismatch. |
| 6 | `frontend/src/pages/ReviewPage.jsx` | "Keep today" / "Move to tomorrow" sets dueDate to `new Date().toISOString()` — full timestamp instead of date-only value. |

#### Medium Bugs

| # | Location | Issue |
|---|----------|-------|
| 7 | `backend/src/utils/taskUtils.js` | Uses `setHours(0,0,0,0)` (local) instead of `setUTCHours()` for date comparisons. |
| 8 | `backend/src/services/taskService.js` `formatDateKey()` | Uses `getFullYear()`/`getMonth()`/`getDate()` (local) instead of UTC accessors. |
| 9 | `backend/src/controllers/journalController.js` | Raw `new Date(string)` for date range queries — no start-of-day/end-of-day boundaries. |
| 10 | `frontend/src/context/TaskContext.jsx` | `new Date(updatedTask.dueDate).toISOString().split('T')[0]` uses UTC date for grouping, but display uses local dates — mismatch in date headers. |

---

### FitnessGeek — HIGH (Mixed Architecture)

FitnessGeek has **two incompatible date storage strategies**: Food logs use UTC-normalized dates (correct), while Weight, Blood Pressure, and Login Streak use server-local time (fragile). Services that query across these subsystems create date-boundary mismatches.

#### Critical Bugs

| # | Location | Issue |
|---|----------|-------|
| 1 | `backend/src/services/foodReportService.js`, `aiInsightsService.js`, `routes/aiCoachRoutes.js` | Query FoodLog (dates stored as UTC midnight) using `setHours(0,0,0,0)` (server-local boundaries). In Docker/UTC this accidentally works, but the code is architecturally wrong. |
| 2 | `backend/src/models/DailySummary.js` `getSummaryRange()` | Uses `setHours()` (local) to query UTC-stored dates — misaligned boundaries. |
| 3 | `backend/src/controllers/weightController.js` date range queries | `new Date(startDate)` for `YYYY-MM-DD` → UTC midnight, but stored weight dates use `new Date(date + 'T00:00:00')` → local midnight. Off-by-one day in queries. |
| 4 | `frontend/src/services/weightService.js` / `bpService.js` | Sends `date.toISOString()` (UTC timestamp) but backend sometimes expects `YYYY-MM-DD` (local). Storage timezone depends on input format. |
| 5 | `backend/src/routes/summaryRoutes.js` `/today` | Uses server's `getTimezoneOffset()` to determine "today" — in UTC Docker, this is always UTC today, not the user's local today. |

#### High Bugs

| # | Location | Issue |
|---|----------|-------|
| 6 | `backend/src/models/LoginStreak.js` | Uses `setHours(0,0,0,0)` (server-local) for streak calculations — can reset streaks incorrectly when server TZ ≠ user TZ. |
| 7 | `backend/src/services/influxService.js` | InfluxDB queries use date strings without timezone offsets — queries UTC day window, not user's local day. Sleep/heart rate data near day boundaries attributed to wrong days. |
| 8 | `date-fns format()` on UTC-stored Food Log dates | `format(new Date(log.log_date), 'yyyy-MM-dd')` in `aiInsightsService.js` and `foodReportService.js` converts UTC midnight to server-local date string. In negative UTC offsets, this shifts the date backward by one day. |

#### Inconsistent Storage Architecture

| Subsystem | Date Storage | Date Queries |
|-----------|-------------|--------------|
| FoodLog | UTC midnight (correct) | UTC (correct) |
| DailySummary | UTC midnight | **Mixed** — some UTC, some local |
| Weight | Server-local midnight | Server-local (fragile) |
| Blood Pressure | Server-local midnight | Server-local (fragile) |
| LoginStreak | Server-local midnight | Server-local (fragile) |
| Medication | Depends on input format | UTC queries |
| InfluxDB | UTC | UTC strings (no offset) |

---

### FlockGeek — HIGH (Display Off-by-One)

FlockGeek's core egg production feature correctly uses `{ timeZone: 'UTC' }` for display, but most other date displays are missing this, causing off-by-one-day bugs for users west of UTC.

#### Critical Bugs

| # | Location | Issue |
|---|----------|-------|
| 1 | `frontend/src/hooks/useHomeData.js` | "Today's eggs" constructs date range from `new Date(year, month, day)` (local midnight) then calls `.toISOString()`, producing a UTC offset range (e.g., `06:00 UTC–06:00 UTC` for CST). Egg records stored as UTC midnight fall **outside** this range — today's egg count will always show 0 for western-TZ users. |
| 2 | `frontend/src/hooks/useHomeData.js` | Query uses `from`/`to` params but backend expects `startDate`/`endDate` — filter may be silently ignored. |

#### High Bugs (Off-by-One Day in Display)

| # | Location | Issue |
|---|----------|-------|
| 3 | `frontend/src/pages/HatchLogPage.jsx` | `new Date(event.setDate).toLocaleDateString()` — no `{ timeZone: 'UTC' }`. UTC midnight dates display as previous day for users west of UTC. |
| 4 | `frontend/src/pages/HatchLogPage.jsx` | Same for `hatchDate` display. |
| 5 | `frontend/src/pages/GroupsPage.jsx` | `startDate` and `endDate` displayed without UTC timezone — off-by-one. |
| 6 | `frontend/src/pages/BirdsPage.jsx` | `hatchDate` and `statusDate` displayed without UTC timezone — off-by-one. |

#### Medium Bugs

| # | Location | Issue |
|---|----------|-------|
| 7 | `frontend/src/pages/GroupsPage.jsx` | Default `startDate` uses `new Date().toISOString().split('T')[0]` (UTC date) — wrong for US users in evening hours. |
| 8 | `frontend/src/pages/PairingsPage.jsx` | Default `pairingDate` uses UTC date — same issue. |

#### What FlockGeek Gets Right

- **EggLogPage.jsx** uses `toLocaleDateString(undefined, { timeZone: 'UTC' })` — correct
- **QuickHarvestEntry.jsx** uses the same correct UTC display
- **QuickHarvestEntry.jsx** generates "today" string with timezone-aware arithmetic: `new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]`
- **QuickHarvestEntry.jsx** has a days-since-last-harvest calculation that extracts UTC components before comparing — correct

---

### NoteGeek — NO BUGS

NoteGeek has **no timezone issues** because:
- All dates are server-generated (`timestamps: true` in Mongoose)
- No date fields are sent from the frontend
- No API supports date-based filtering or grouping
- Display uses `toLocaleDateString()` on UTC ISO strings — correctly renders in browser timezone
- Relative time ("5m ago") is timezone-independent

Minor observations:
- `formatRelativeTime()` is duplicated in 3 files — should be extracted to a shared utility
- No `TZ` set in docker-compose — harmless but could affect debug logs

---

## Common Patterns Causing Bugs

### Pattern 1: Date-Only String Parsing Ambiguity

```javascript
// Parsed as UTC midnight (JS spec for date-only strings)
new Date("2026-02-26")           // → 2026-02-26T00:00:00.000Z

// Parsed as LOCAL midnight (no 'Z', treated as local)
new Date("2026-02-26T00:00:00")  // → depends on server TZ
```

Apps mix these two forms, so the same date string produces different Date objects depending on the code path.

### Pattern 2: `setHours()` vs `setUTCHours()`

```javascript
// Uses SERVER's local timezone (UTC in Docker)
date.setHours(0, 0, 0, 0);

// Explicitly UTC — use this for UTC-stored data
date.setUTCHours(0, 0, 0, 0);
```

### Pattern 3: `toISOString().split('T')[0]` for Date Keys

```javascript
// DANGER: local midnight in UTC+ timezone becomes previous UTC day
const d = new Date(2026, 1, 26);  // local midnight Feb 26
d.toISOString().split('T')[0];    // "2026-02-25" for UTC+5:30!
```

### Pattern 4: Missing `{ timeZone: 'UTC' }` in Display

```javascript
// BUG: UTC midnight date shows as previous day for UTC- users
new Date("2026-02-26T00:00:00.000Z").toLocaleDateString()
// → "2/25/2026" in America/Chicago

// FIX: Force UTC interpretation for date-only values
new Date("2026-02-26T00:00:00.000Z").toLocaleDateString(undefined, { timeZone: 'UTC' })
// → "2/26/2026" everywhere
```

---

## Recommended Fix Strategy

### Phase 1: Stopgap — Set TZ in Docker (Immediate)

Add `TZ=America/Chicago` (or the primary user's timezone) to every `docker-compose.yml`:

```yaml
environment:
  - TZ=America/Chicago
```

This makes the server's `new Date()` and `setHours()` align with the user's timezone. It doesn't fix the fundamental architecture but eliminates the most visible bugs for single-timezone deployments.

### Phase 2: Normalize All Date Storage to UTC Midnight

For **date-only fields** (dueDate, log_date, hatchDate, etc.), always store as UTC midnight:

```javascript
// Frontend: send YYYY-MM-DD string representing the user's local date
const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  .toISOString().split('T')[0];

// Backend: parse to UTC midnight
function toUtcMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
```

This pattern is already used correctly in FitnessGeek's `FoodLog` and FlockGeek's `EggLogPage` — adopt it everywhere.

### Phase 3: Fix All Display Code

For dates that represent calendar days (stored as UTC midnight), always display with `{ timeZone: 'UTC' }`:

```javascript
new Date(storedDate).toLocaleDateString(undefined, { timeZone: 'UTC' })
```

For dates that represent instants (createdAt, updatedAt), display normally:

```javascript
new Date(storedDate).toLocaleDateString()  // browser's local timezone
```

### Phase 4: Create a Shared Date Utility (packages/utils)

Since all GeekSuite apps have the same problem, create a shared package:

```javascript
// packages/utils/src/dates.js
export function localDateString(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().split('T')[0];
}

export function toUtcMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function displayCalendarDate(isoDate, locale) {
  return new Date(isoDate).toLocaleDateString(locale, { timeZone: 'UTC' });
}

export function utcDayRange(dateStr) {
  const start = toUtcMidnight(dateStr);
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}
```

### Phase 5: Transmit User Timezone (Long-term)

For true multi-timezone support, the frontend should send the user's timezone:

```javascript
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
// Send as header, query param, or store in user profile
```

The backend would then use `date-fns-tz` or `luxon` to compute day boundaries in the user's timezone. This is only necessary if the apps will serve users in multiple timezones simultaneously.

---

## Files Requiring Changes (by App)

### BujoGeek
- `backend/src/services/taskService.js` — Remove `getUtcDate()`, use `toUtcMidnight()`
- `backend/src/services/taskService.js` — Fix `getTasksForDateRange()` boundaries
- `backend/src/services/taskService.js` — Fix `formatDateKey()` to use UTC accessors
- `backend/src/utils/taskUtils.js` — Replace `setHours()` with `setUTCHours()`
- `backend/src/controllers/journalController.js` — Add start/end of day boundaries
- `frontend/src/components/today/InlineQuickAdd.jsx` — Send date-only string, not timestamp
- `frontend/src/pages/ReviewPage.jsx` — Send date-only string for dueDate changes
- `frontend/src/components/tasks/TaskList.jsx` — Fix `getLocalDate()` function
- `frontend/src/components/monthly/MonthlyLog.jsx` — Use UTC date accessors
- `frontend/src/context/TaskContext.jsx` — Fix date key extraction
- `docker-compose.yml` — Add `TZ` environment variable

### FitnessGeek
- `backend/src/controllers/weightController.js` — Normalize to UTC midnight storage
- `backend/src/controllers/bloodPressureController.js` — Same
- `backend/src/models/DailySummary.js` `getSummaryRange()` — Use `setUTCHours()`
- `backend/src/services/aiInsightsService.js` — Use `setUTCHours()` for FoodLog queries
- `backend/src/services/foodReportService.js` — Same
- `backend/src/routes/aiCoachRoutes.js` — Same
- `backend/src/routes/summaryRoutes.js` — Fix "today" calculation
- `backend/src/models/LoginStreak.js` — Use `setUTCHours()`
- `frontend/src/services/weightService.js` — Send YYYY-MM-DD, not ISO timestamp
- `frontend/src/services/bpService.js` — Same
- `docker-compose.yml` — Add `TZ` environment variable

### FlockGeek
- `frontend/src/hooks/useHomeData.js` — Fix "today" range to use UTC midnight; fix param names
- `frontend/src/pages/HatchLogPage.jsx` — Add `{ timeZone: 'UTC' }` to `toLocaleDateString()`
- `frontend/src/pages/GroupsPage.jsx` — Same for startDate/endDate display; fix default date
- `frontend/src/pages/BirdsPage.jsx` — Same for hatchDate/statusDate display
- `frontend/src/pages/PairingsPage.jsx` — Fix default pairingDate
- `docker-compose.yml` — Add `TZ` environment variable

### NoteGeek
- `docker-compose.yml` — Add `TZ` environment variable (optional, for debug logs)
- Extract `formatRelativeTime()` to shared utility (code quality)
