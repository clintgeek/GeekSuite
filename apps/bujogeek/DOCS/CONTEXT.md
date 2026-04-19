# BuJoGeek — Project Context

Current state reference for development work. Update this when architecture, data models, or feature status changes significantly.

---

## Project Overview

**bujogeek** is a bullet-journal-inspired digital planner. Daily ritual app: Today view → Review aging tasks → Plan ahead. Auto-migrating tasks, template-based task creation, keyboard-first UX.

Part of GeekSuite. Authenticates via `@geeksuite/auth` (basegeek SSO). Data via `@geeksuite/api-client` → basegeek GraphQL gateway. Theme via `@geeksuite/user`.

---

## Tech Stack

**Frontend:**
- React 18 + Vite
- Material-UI (MUI) v7
- Framer Motion (animations, drag-to-reorder)
- Lucide React (icons)
- Apollo Client (GraphQL)
- React Router v6
- date-fns

**Backend:**
- Node.js ES modules (no CommonJS)
- Express.js
- Mongoose / MongoDB
- JWT authentication via `@geeksuite/auth`
- pino + pino-http (structured logging, request IDs)

**Infrastructure:**
- Single Docker container `bujogeek` (port 5005)
- Pre-built React static files served by Express
- Suite-shared MongoDB (`DB_URI`)
- basegeek GraphQL gateway at `GATEWAY_URL` (`host.docker.internal:4100`)

---

## Directory Structure

```
apps/bujogeek/
├── backend/
│   ├── server.js             # Entry point — Express + boot/shutdown
│   └── src/
│       ├── controllers/      # Route handlers (task, template, journal, auth)
│       ├── lib/
│       │   └── logger.js     # pino logger (pretty dev / JSON prod)
│       ├── middleware/
│       │   └── authMiddleware.js
│       ├── models/
│       │   ├── Task.js
│       │   ├── Template.js
│       │   ├── JournalEntry.js
│       │   ├── TaskOrder.js
│       │   └── User.js
│       ├── routes/           # taskRoutes, templateRoutes, journalRoutes, authRoutes
│       ├── services/         # Business logic (taskService, templateService)
│       └── utils/
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── layout/       # AppShell, Sidebar, TopBar, MobileTabBar, PageHeader
│       │   ├── today/        # OverdueSection, TodaySection, CompletedSection, InlineQuickAdd
│       │   ├── review/       # ReviewCard, ReviewProgress, ReviewComplete
│       │   ├── plan/         # WeeklySpread, MonthlyCalendar, BacklogList
│       │   ├── tasks/        # TaskRow, TaskCheckbox, TaskAgingIndicator, TaskEditor
│       │   ├── templates/    # TemplateList, TemplateEditor, TemplateApply
│       │   └── shared/       # CommandPalette, SectionHeader, EmptyState, SkeletonLoader, Toast
│       ├── context/          # AuthContext, TaskContext
│       ├── hooks/            # useKeyboardNav, useKeyboardShortcuts, useDateNavigation, useReview
│       ├── pages/            # TodayPage, ReviewPage, PlanPage, TemplatesPage, TagsPage
│       ├── theme/            # theme.js, colors.js (ink/parchment/aging palette)
│       └── utils/            # taskAging.js, dateHelpers.js, constants.js
└── DOCS/
```

---

## Routes

| Route | View |
|-------|------|
| `/` | Redirect → `/today` |
| `/today` | Daily planner (primary screen) |
| `/review` | Review aging tasks |
| `/plan` | Weekly spread (default sub-view) |
| `/plan/weekly` | Weekly spread |
| `/plan/monthly` | Monthly calendar |
| `/plan/backlog` | Backlog list |
| `/templates` | Template management |
| `/tags` | Tags view |
| `/login` | Login |
| `/register` | Register |

---

## Data Models

### Task

```javascript
{
  content: String,
  signifier: String,          // * @ x < > - ! ? #
  status: String,             // pending | completed | migrated_back | migrated_future
  dueDate: Date,
  priority: Number,           // 1=High 2=Medium 3=Low
  note: String,
  tags: [String],
  originalDate: Date,
  migratedFrom: Date,
  migratedTo: Date,
  isBacklog: Boolean,
  parentTask: ObjectId,
  subtasks: [ObjectId],
  createdBy: ObjectId,        // enforced at service layer (data isolation)
  createdAt: Date,
  updatedAt: Date
}
```

### Template

```javascript
{
  name: String,
  description: String,
  content: String,            // multi-line; each line = one task on apply
  type: String,
  tags: [String],
  isPublic: Boolean,
  createdBy: ObjectId,        // enforced at service layer
  createdAt: Date,
  updatedAt: Date
}
```

### JournalEntry

```javascript
{
  content: String,
  date: Date,
  createdBy: ObjectId,
  createdAt: Date
}
```

---

## API Endpoints

### Auth (local — passthrough to basegeek SSO)
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me`

### Tasks
- `GET /api/tasks` — all tasks
- `GET /api/tasks/daily` — tasks for a date
- `GET /api/tasks/weekly` — tasks for a week range
- `GET /api/tasks/monthly` — tasks for a month range
- `POST /api/tasks` — create
- `PUT /api/tasks/:id` — update
- `DELETE /api/tasks/:id` — delete
- `PATCH /api/tasks/:id/status` — status update
- `POST /api/tasks/:id/migrate-future` — migrate forward
- `POST /api/tasks/daily/order` — save drag-reorder

### Templates
- `GET /api/templates`
- `POST /api/templates`
- `PUT /api/templates/:id`
- `DELETE /api/templates/:id`
- `POST /api/templates/:id/apply` — create tasks from template

### Journal
- `GET /api/journal`
- `POST /api/journal`

---

## Hardening — April 2026

Two-pass hardening landed. See `DOCS/HARDENING_2026-04.md` for full details.

**Security (Pass 1):**
- Task data isolation: `createdBy` filter enforced at service layer on all read/write/delete ops.
- Template auth: `createdBy` or `isPublic` gate on all template endpoints.
- CORS: reads `CORS_ORIGINS` env; no longer `origin: true`.
- Removed debug middleware that logged `Cookie` headers to stdout.

**Operational (Pass 2):**
- pino + pino-http replaces morgan + console.*. Request IDs on all requests.
- Async boot: `await connectDB()` before `app.listen()`. Fails fast on DB rejection.
- Graceful shutdown: SIGTERM/SIGINT → `server.close()` → `mongoose.disconnect()` → exit.

---

## Known Issues / Technical Debt

- Duplicate model files: `userModel.js` / `User.js`, `templateModel.js` / `Template.js` — legacy duplicates, only the `PascalCase` versions are canonical.
- No test coverage.
- Subtasks: backend model has `parentTask`/`subtasks` fields but no frontend UI.
- Recurring tasks: backend model supports `recurrence` but no frontend UI.
- CompletedSection not in keyboard nav (collapsed tasks excluded from `j/k` list).
- Apollo cache not invalidated on mutations — refreshing view gives latest data.

---

## Environment

| Var | Notes |
|-----|-------|
| `DB_URI` | Suite-shared MongoDB |
| `JWT_SECRET` | Suite-shared |
| `JWT_REFRESH_SECRET` | Suite-shared |
| `SECRET_KEY` | App-level |
| `BASEGEEK_URL` | SSO base URL |
| `GATEWAY_URL` | basegeek GraphQL gateway (set in compose, not .env) |
| `PORT` | Default `5005` |
| `CORS_ORIGINS` | Comma-separated (optional) |
| `LOG_LEVEL` | pino level (default `info`) |

Dev: backend on `5001`, frontend on `5173` (Vite). Backend `.env.local` points `DB_URI` at production MongoDB.
