# BuJoGeek — Project Context

Current state reference for development work. Update this when architecture, data models, or feature status changes significantly.

Last major revision: 2026-08-30 (bug/cleanup/feature pass — see git log for the commit series).
Amended 2026-09-03: blocked ("parked") task state — gateway half.

---

## Project Overview

**bujogeek** is a bullet-journal-inspired digital planner. Daily ritual app: Today view → Review aging tasks → Plan ahead. Auto-migrating tasks, collections, habit tracking, template-based task creation, keyboard-first UX.

Part of GeekSuite. Authenticates via `@geeksuite/auth` (basegeek SSO). **All data flows through Apollo to the basegeek GraphQL gateway** — the local Express backend serves only static files, the SSO proxy, `/api/me`, and `/api/health`. The bujogeek data layer lives in `apps/basegeek/packages/api/src/graphql/bujogeek/`.

---

## Tech Stack

**Frontend:**
- React 18 + Vite + VitePWA
- Material-UI (MUI) v7, Framer Motion, Lucide icons
- Apollo Client (GraphQL), React Router v6, date-fns

**Backend (local, thin):**
- Express, ES modules; SSO proxy + static serving only
- pino + pino-http

**Data layer (in basegeek):**
- Mongoose models + services + GraphQL typeDefs/resolvers under `graphql/bujogeek/`
- Jest + mongodb-memory-server tests in `packages/api/src/__tests__/bujogeek*.test.js`
  (`node --experimental-vm-modules node_modules/jest/bin/jest.js bujogeek --runInBand`)

**Infrastructure:**
- Single Docker container `bujogeek` (port 5005); React build served by Express
- basegeek GraphQL gateway at `GATEWAY_URL` (`host.docker.internal:4100`)

---

## Routes

| Route | View |
|-------|------|
| `/` | Redirect → `/today` |
| `/today` | Daily planner (primary screen, with Upcoming section) |
| `/review` | Review aging tasks (keep / tomorrow / date / backlog / cancel / delete) |
| `/plan/weekly` · `/plan/monthly` · `/plan/backlog` | Planning views |
| `/collections` · `/collections/:id` | Named lists outside the daily log |
| `/habits` | Habit week-grid tracker with streaks |
| `/search` | Search + filters + JSON/Markdown export |
| `/templates` · `/tags` | Templates, tag browser |
| `/login` | Login (SSO splash) |

Keyboard: `j/k/x/e/d/c` row nav, `g→t/r/p/s/l/h` chords, `Cmd+N`, `?` help.

---

## Data Model (gateway: `graphql/bujogeek/models/`)

### Task
```
content, signifier,
status (pending|completed|cancelled|blocked|migrated_back|migrated_future),
dueDate (UTC midnight = date-only; non-midnight = carries a due time),
priority (1=High 2=Medium 3=Low, null=None), note, tags[],
originalDate, originalDueDate, migratedFrom/To, isBacklog,
completedAt, cancelledAt, blockedAt (mutually exclusive; set/cleared by
  updateTaskStatus / blockTask / unblockTask), blockedReason (≤280 chars),
recurrenceRule (RRULE string; ONLY recurrence mechanism — recurrencePattern is a
  deprecated input shim translated server-side), seriesId, isSeriesMaster, exdates[],
collectionId (undated collection tasks are excluded from log views/carry-forward),
remindedAt (push reminder dedup), parentTask, subtasks[], createdBy, timestamps
```
Recurring tasks are virtual: masters are expanded per view window as
`virtual_<masterId>_<epochMs>`; edits materialize overrides via editScope
(THIS_INSTANCE / ALL_INSTANCES / FUTURE_INSTANCES — the last splits the series).

#### Blocked ("parked") tasks — added 2026-09-03

A blocked task is waiting on something outside itself. It **keeps its dueDate**
— it is parked, not rescheduled — but it leaves the log entirely while blocked:
`dailyTasks` / `weeklyTasks` / `monthlyTasks` filter `status: 'blocked'` out, so
a blocked task is neither "due today" nor overdue. The `all` corpus (search,
export, backlog) still sees it, and `blockedTasks` is the list view.

- `blockTask(id, reason)` → `status: 'blocked'` + `blockedReason` + `blockedAt`.
  Allowed from `pending` / `migrated_back` / `migrated_future`, and from
  `blocked` itself (rewrites the reason, keeps the original `blockedAt` so
  "parked since" never drifts). From `completed` / `cancelled` it is a
  `BAD_USER_INPUT` (400) GraphQL error. A reason over 280 chars is the same
  error, thrown before anything is written.
- `unblockTask(id)` → back to `pending`, `blockedReason`/`blockedAt` cleared,
  **dueDate untouched** — a date that has since passed simply reappears as
  overdue. `BAD_USER_INPUT` when the task is not blocked.
- `updateTaskStatus(id, 'blocked')` delegates to `blockTask` (one guard, one
  place). Every other status clears the blocked fields, so completing or
  cancelling straight from the blocked list works and un-parks the task.
- **Recurrence**: a blocked series *master* stops expanding, exactly like
  completed/cancelled. Blocking a single `virtual_…` occurrence materializes a
  blocked override for that date, which suppresses that date's virtual — so
  neither path can spawn a duplicate. (The daily view's ordinary carry-forward
  of a series' previous, unblocked occurrence is unaffected.)
- Reminders are unaffected by design: `reminderService`'s sweep only considers
  `status: 'pending'`, so a parked task sends no push and resumes on unblock.
- There is no summary/stats type in this schema, so the requested `blocked: Int`
  count has no home yet — the frontend reads `blockedTasks.length`.

### Collection
`name, description, archived, createdBy, timestamps` — tasks reference it via `collectionId`; delete detaches by default, cascades on request.

### Habit / HabitLog
`Habit: name, daysOfWeek[0-6] (empty = daily), color, archived, createdBy`.
`HabitLog: habitId, createdBy, date (UTC midnight)` — unique `(habitId, date)`.
`currentStreak` computed server-side (scheduled days only; today-unlogged doesn't break).

### PushSubscription
`createdBy, endpoint (unique), keys{p256dh,auth}` — web-push reminders; see `DOCS/REMINDERS.md`.

### TaskOrder / Template / JournalEntry
Unchanged: per-day drag order (`dateKey 'yyyy-MM-dd'`, local dates), multi-line templates, journal entries.

---

## Invariants (do not regress)

- **Ownership**: every gateway read/write is scoped by `createdBy` in the service layer (`requireUser` pattern). Cross-user ids behave as not-found. Covered by jest suites.
- **Dates**: date-only values are UTC midnight; date KEYS on the client use date-fns `format(date, 'yyyy-MM-dd')` (local), never `toISOString()`.
- **Sorting**: one canonical comparator (`compareTasks` in TaskContext, `sortTasks` in taskService) per `DOCS/SORTING_RULES.md`; completed/cancelled sink (cancelled last).
- **Errors**: Apollo error shapes parsed by `handleApiError`, surfaced via the TaskProvider snackbar. Status toggles are optimistic with rollback.

---

## Local Express API (all that remains)

- `POST /api/auth/*` — SSO passthrough to basegeek
- `GET /api/me`, `GET /api/health`
- Static SPA serving

Everything else is GraphQL on the gateway: dailyTasks/weeklyTasks/monthlyTasks/allTasks,
blockedTasks, task CRUD + updateTaskStatus + blockTask/unblockTask +
migrateTaskToFuture + saveDailyTaskOrder, taskTags/tasksByTag,
collections CRUD, habits CRUD + toggleHabitLog + habitLogs, templates, journal,
pushVapidKey + save/removePushSubscription.

---

## Known Issues / Technical Debt

- Every Apollo query is `fetchPolicy: 'no-cache'` — PWA has no offline data; caching strategy is future work.
- TaskContext still holds dual array/object state shapes (works, but a refactor candidate).
- Subtasks: schema fields exist (`parentTask`/`subtasks`, addSubtask mutation) but no frontend UI.
- CompletedSection not in keyboard nav.
- No frontend test coverage (gateway suites cover the data layer).
- Upcoming section reuses `monthlyTasks` for a 7-day window; the client-side filter does the real windowing.

---

## Environment

| Var | Notes |
|-----|-------|
| `BASEGEEK_URL` | SSO base URL |
| `GATEWAY_URL` | basegeek GraphQL gateway (compose) |
| `PORT` | Default `5005` |
| `CORS_ORIGINS`, `LOG_LEVEL` | Optional |
| VAPID keys | Live in **basegeek** env — see `DOCS/REMINDERS.md` |

Dev: backend on `5001`, frontend on `5173` (Vite).
